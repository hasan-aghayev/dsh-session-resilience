/**
 * Combined Host half for restart controls and automatic continuation.
 *
 * - Registers the `auto-continue` settings namespace (the browser half's
 *   settings card edits it; the host engine reads it).
 * - Runs the single-instance auto-continue engine: listens to the session
 *   event firehose, sends via `agent.followup`, cancels via `agent.cancel`.
 * - Serves a status bridge the browser half subscribes to: notifications and
 *   runtime state (stats / pauses), plus an action endpoint for notification
 *   buttons.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings';
import { SessionId } from '@deepseek-ai/dsh-session';
import { AutoContinueRunner } from './host/engine.ts';
import { isLoopbackRequest, RestartController, trustedLoopback } from './restart.ts';
import { resolveConfig, type AutoContinueSettings } from './shared/core.ts';
// The type-only settings import also pulls in the `ctx.settings` Context augmentation.
// Type-only: pulls the `ctx.webServer` Context augmentation.
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-tools';

/** Settings namespace of the auto-continue plugin (lowercase kebab-case). */
export const AUTO_CONTINUE_NS = 'auto-continue';
const SETTINGS_NS = AUTO_CONTINUE_NS as SettingsNamespace;

function jsonResponse(
  res: { writeHead: (status: number, headers?: Record<string, string>) => void; end: (body?: string) => void },
  status: number,
  value: unknown,
): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

/** Wire schema; blank localized text fields tell resolveConfig() to select the active locale's defaults. */
export const AutoContinueSchema = z.object({
  /** Named recovery policy; Manual leaves the individual recovery controls active. */
  recoveryPreset: z.union(['manual', 'safe', 'balanced', 'long-task'] as const).default('manual'),
  /** Master switch for all automatic continuation behavior. */
  enabled: z.boolean().default(true),
  /** Continue sessions that were active when the host was deliberately restarted. */
  restartAutoContinue: z.boolean().default(true),
  /** How long a recorded restart handoff remains valid for a browser reconnect. */
  restartResumeWindowMs: z.natural(),
  /** Active browser/UI locale mirrored by the client. */
  locale: z.string().default('zh'),
  /** Text automatically sent after an interruption. */
  continueText: z.string().default(''),
  /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
  continueTextMaxTokens: z.string().default(''),
  /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
  guardTools: z.boolean().default(true),
  /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
  guardPendingText: z
    .string()
    .default(''),
  /** Guard text appended when the last tool call completed successfully (don't rerun it). */
  guardDoneText: z
    .string()
    .default(''),
  /** Grace period after an interruption before auto-sending (ms). */
  graceMs: z.natural(),
  /** Minimum interval between two auto-continues per session (ms). */
  cooldownMs: z.natural(),
  /** Max consecutive auto-continues per session before stopping. */
  maxConsecutive: z.natural().min(1),
  /** Scan recently interrupted sessions on page load / reconnect. */
  scanOnBoot: z.boolean().default(true),
  /** Max sessions the scan checks (most recently updated). */
  scanLimit: z.natural().min(1),
  /** Scan only considers interruptions inside this window (ms). */
  freshMs: z.natural(),
  /** Log `[auto-continue]` lines to the browser console. */
  verbose: z.boolean().default(true),
  /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
  classify: z.boolean().default(true),
  /** Provider-specific message/code/status fragments that explicitly count as retryable, one literal per line. */
  retryableErrorPatterns: z.string().default(''),
  /** Cooldown multiplier per consecutive failure (adaptive backoff). */
  backoffFactor: z.natural().min(1),
  /** Cap on the effective backoff interval (ms). */
  backoffMaxMs: z.natural(),
  /** Show browser notifications for auto-continue events. */
  notify: z.boolean().default(false),
  /** Globally pause auto-continue: no live or scan send. */
  paused: z.boolean().default(false),
  /** Loop guard: detect a running turn spinning in place and restart it. */
  loopGuard: z.boolean().default(true),
  /** A model message shorter than this many chars counts as a short sentence (loop signal). */
  loopShortChars: z.natural().min(1).default(40),
  /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
  loopWindowMs: z.natural().min(1000).default(30000),
  /** Consecutive short sentences trip the loop guard. */
  loopShortCount: z.natural().min(2).default(12),
  /** Consecutive identical assistant messages trip the loop guard (strongest signal; also used for streamed intra-message repetition). */
  loopRepeatText: z.natural().min(2).default(4),
  /** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
  loopToolRepeat: z.natural().min(2).default(5),
  /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
  loopText: z
    .string()
    .default(''),
});

const RESTART_OUTPUT = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' as const, required: true, const: true },
      action: { type: 'string' as const, required: true, enum: ['restart'] },
      instanceId: { type: 'string' as const, required: true },
      oldPid: { type: 'integer' as const, required: true },
      port: { type: 'integer' as const, required: true },
      helperPid: { type: 'integer' as const },
      sessionIds: { type: 'array' as const, items: { type: 'string' as const }, required: true },
      logOut: { type: 'string' as const, required: true },
      logErr: { type: 'string' as const, required: true },
    },
  } as const,
  render: (_args: unknown, value: Record<string, unknown>) => [{
    type: 'text' as const,
    text: `DSH restart scheduled on port ${String(value.port)}. The host will reconnect and continue the active session automatically.`,
  }],
};

const SHUTDOWN_OUTPUT = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' as const, required: true, const: true },
      action: { type: 'string' as const, required: true, enum: ['shutdown'] },
      instanceId: { type: 'string' as const, required: true },
      pid: { type: 'integer' as const, required: true },
      port: { type: 'integer' as const, required: true },
    },
  } as const,
  render: (_args: unknown, value: Record<string, unknown>) => [{
    type: 'text' as const,
    text: `DSH shutdown scheduled for port ${String(value.port)}. No replacement host will be launched.`,
  }],
};

/**
 * Plugin body: register the settings namespace, start the single-instance
 * engine, and serve the status bridge.
 * @param ctx - host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(SETTINGS_NS, AutoContinueSchema, {
      applies: 'live',
    });
  });

  // 引擎引用: inject 回调可能重入(依赖组合变化), 顶层 effect 在 fiber 卸载时必跑。
  // dispose 绑定必须挂在 apply 的顶层 ctx 上——挂 inject 派生 ctx 的 effect 在 config HMR
  // 替换行时不会执行, 悬空定时器会撞上 inactive context 炸掉整个进程。
  let runnerRef: AutoContinueRunner | undefined;
  let restartRef: RestartController | undefined;
  let toolDisposers: Array<() => void> = [];
  let bridgeDispose: (() => void) | undefined;

  // 单实例引擎: host 进程内监听会话事件, 所有标签页共享同一个引擎。
  ctx.inject(['settings', 'agents', 'webServer', 'tools'], (engineCtx) => {
    bridgeDispose?.();
    bridgeDispose = undefined;
    // 回调重入时先清理旧引擎, 避免定时器与监听器叠加。
    if (runnerRef !== undefined) runnerRef.dispose();
    restartRef?.dispose();
    for (const dispose of toolDisposers.splice(0)) dispose();
    const runner = new AutoContinueRunner(engineCtx, () =>
      resolveConfig(engineCtx.settings.get(SETTINGS_NS) as AutoContinueSettings | undefined),
    );
    runnerRef = runner;
    const restartController = new RestartController(engineCtx, () =>
      resolveConfig(engineCtx.settings.get(SETTINGS_NS) as AutoContinueSettings | undefined),
    );
    restartController.mountRoutes();
    restartRef = restartController;
    toolDisposers = [
      engineCtx.tools.register(defineTool({
        name: 'restart_dsh',
        description: 'Restart the active DSH web host on its configured port. Use only when the user requested a restart or the current task requires it. The plugin records running sessions before exit and automatically continues them after the host reconnects.',
        parameters: {},
        output: RESTART_OUTPUT,
        execute: () => Promise.resolve(restartController.restartForTool()),
        presentCall: () => ({ card: 'generic', title: 'Restart DSH', kind: 'execute' }),
      })),
      engineCtx.tools.register(defineTool({
        name: 'shutdown_dsh',
        description: 'Stop the active DSH web host on its configured port without launching a replacement process. Use only when the user explicitly asks to stop DSH.',
        parameters: {},
        output: SHUTDOWN_OUTPUT,
        execute: () => Promise.resolve(restartController.shutdownForTool()),
        presentCall: () => ({ card: 'generic', title: 'Stop DSH', kind: 'delete' }),
      })),
    ];

    // 状态桥: browser 侧订阅通知与运行时状态(SSE)。
    const sseClients = new Set<{ send: (data: string) => void; close: () => void }>();
    const pushToAll = (data: string): void => {
      for (const client of sseClients) {
        try {
          client.send(data);
        } catch {
          sseClients.delete(client);
        }
      }
    };
    const statePayload = (): string =>
      JSON.stringify({
        type: 'state',
        stats: runner.todayStats(),
        paused: runner.activePauses(),
      });

    const disposeNoticeSubscription = runner.subscribeNotices(() => {
      for (const notice of runner.drainNotices()) {
        pushToAll(`data: ${JSON.stringify({ type: 'notice', notice })}\n\n`);
      }
    });
    const disposeStateSubscription = runner.subscribeState(() => {
      pushToAll(`data: ${statePayload()}\n\n`);
    });

    const bridgeRouteDisposers: Array<() => void> = [];
    bridgeRouteDisposers.push(engineCtx.webServer.register({
      kind: 'exact',
      path: '/api/auto-continue-bridge',
      handler: (req, res) => {
        if (req.method !== 'GET') { jsonResponse(res, 405, { ok: false, error: 'method not allowed' }); return; }
        if (!isLoopbackRequest(req)) { jsonResponse(res, 403, { ok: false, error: 'local requests only' }); return; }
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write(`data: ${statePayload()}\n\n`);
        const client = {
          send: (data: string): void => { res.write(data); },
          close: (): void => { res.end(); },
        };
        sseClients.add(client);
        req.on('close', () => sseClients.delete(client));
      },
    }));

    // 通知按钮动作: browser 点击「立即续跑 / 暂停该会话」时 POST 到这里。
    bridgeRouteDisposers.push(engineCtx.webServer.register({
      kind: 'exact',
      path: '/api/auto-continue-action',
      handler: (req, res) => {
        if (req.method !== 'POST') { jsonResponse(res, 405, { ok: false, error: 'method not allowed' }); return; }
        if (!trustedLoopback(req)) { jsonResponse(res, 403, { ok: false, error: 'untrusted origin' }); return; }
        let body = '';
        let rejected = false;
        req.on('data', (chunk: Buffer) => {
          if (rejected) return;
          body += chunk.toString('utf8');
          if (Buffer.byteLength(body, 'utf8') > 4096) {
            rejected = true;
            jsonResponse(res, 413, { ok: false, error: 'request body too large' });
            req.destroy();
          }
        });
        req.on('end', () => {
          if (rejected) return;
          try {
            const parsed = JSON.parse(body) as { sessionId?: unknown; action?: unknown };
            const action = parsed.action;
            if (action !== 'resume' && action !== 'pause1h' && action !== 'unpause' && action !== 'reset-stats') {
              jsonResponse(res, 400, { ok: false, error: 'unknown action' });
              return;
            }
            const sessionId = typeof parsed.sessionId === 'string' && parsed.sessionId !== ''
              ? SessionId(parsed.sessionId)
              : undefined;
            if (action !== 'reset-stats' && sessionId === undefined) {
              jsonResponse(res, 400, { ok: false, error: 'sessionId is required' });
              return;
            }
            runner.handleNoticeAction(sessionId, action);
            jsonResponse(res, 200, { ok: true });
          } catch {
            jsonResponse(res, 400, { ok: false, error: 'invalid JSON' });
          }
        });
      },
    }));

    bridgeDispose = () => {
      for (const client of sseClients) client.close();
      sseClients.clear();
      disposeNoticeSubscription();
      disposeStateSubscription();
      for (const dispose of bridgeRouteDisposers.splice(0)) dispose();
    };
  });

  // 顶层生命周期绑定: fiber 卸载时清理引擎(定时器/监听器)。
  // 挂在 apply 的 ctx 上保证 Cordis 一定会调用, 防止 inactive context 崩溃。
  ctx.effect(() => () => {
    bridgeDispose?.();
    bridgeDispose = undefined;
    const runner = runnerRef;
    runnerRef = undefined;
    if (runner !== undefined) runner.dispose();
    const restart = restartRef;
    restartRef = undefined;
    restart?.dispose();
    for (const dispose of toolDisposers.splice(0)) dispose();
  });
}
