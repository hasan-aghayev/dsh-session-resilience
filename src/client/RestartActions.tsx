import { useEffect, useRef, useState } from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type { SettingsCardKey } from './locales.ts';
import { getConnectionState, reconnectAndWaitForConnected, subscribeToConnection } from './connection-control.js';
import { fetchWithTimeout, singleFlight } from './request.js';

type RestartActionProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'auto-continue'>;

interface RestartStatus {
  ok: boolean;
  instanceId?: string;
  launchUrl?: string;
  restartRequestId?: string;
}

type BusyAction = 'restart' | 'shutdown' | undefined;

const STATUS_REQUEST_TIMEOUT_MS = 2_500;
const ACTION_REQUEST_TIMEOUT_MS = 5_000;
const RESTART_WAIT_TIMEOUT_MS = 60_000;
const CONNECTION_RECOVERY_TIMEOUT_MS = 20_000;

function statusUrl(): string {
  return '/dsh-restart/status';
}

const readStatus = singleFlight(async (): Promise<RestartStatus> => {
  const response = await fetchWithTimeout(statusUrl(), { cache: 'no-store' }, STATUS_REQUEST_TIMEOUT_MS);
  if (!response.ok) throw new Error(`status ${response.status}`);
  return await response.json() as RestartStatus;
});

function createRestartRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sendAction(action: Exclude<BusyAction, undefined>, restartRequestId?: string): Promise<void> {
  const query = restartRequestId === undefined ? '' : `?requestId=${encodeURIComponent(restartRequestId)}`;
  const endpoint = `/dsh-restart/${action}${query}`;
  if (typeof navigator.sendBeacon === 'function'
    && navigator.sendBeacon(endpoint, new Blob([], { type: 'text/plain' }))) return;

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { accept: 'application/json' },
  }, ACTION_REQUEST_TIMEOUT_MS);
  if (!response.ok) throw new Error(`action ${response.status}`);
}

async function waitForReplacementHost(restartRequestId: string): Promise<RestartStatus & { instanceId: string; launchUrl: string }> {
  const deadline = Date.now() + RESTART_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const status = await readStatus();
      const instanceId = status.instanceId;
      const launchUrl = status.launchUrl;
      if (instanceId !== undefined && status.restartRequestId === restartRequestId && launchUrl !== undefined) {
        return { ...status, instanceId, launchUrl };
      }
    } catch {
      // The old Host is expected to refuse requests while the replacement starts.
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
  }
  throw new Error('replacement DSH host did not become ready');
}

async function authenticateReplacement(launchUrl: string): Promise<void> {
  const launch = new URL(launchUrl, window.location.href);
  if (launch.protocol !== 'http:' && launch.protocol !== 'https:') {
    throw new Error('replacement DSH launch URL must use HTTP');
  }
  // Keep the browser on its current origin while exchanging the new process token.
  launch.protocol = window.location.protocol;
  launch.host = window.location.host;
  const response = await fetchWithTimeout(launch.href, {
    cache: 'no-store',
    credentials: 'same-origin',
  }, ACTION_REQUEST_TIMEOUT_MS);
  if (!response.ok) throw new Error(`replacement authentication ${response.status}`);
  await response.arrayBuffer();
}

/** Render the restart/stop controls in the sidebar footer. */
export function RestartActions({ t }: RestartActionProps) {
  const [online, setOnline] = useState<boolean | undefined>();
  const [busy, setBusy] = useState<BusyAction>();
  const [message, setMessage] = useState<SettingsCardKey | undefined>();
  const submitted = useRef(false);

  useEffect(() => {
    const refresh = (): void => {
      setOnline(getConnectionState() === 'connected');
    };
    refresh();
    return subscribeToConnection(refresh);
  }, []);

  const run = async (action: Exclude<BusyAction, undefined>): Promise<void> => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(action);
    setMessage(undefined);
    const restartRequestId = action === 'restart' ? createRestartRequestId() : undefined;
    let phase = 'requesting DSH restart';
    try {
      await sendAction(action, restartRequestId);
      if (action === 'restart') {
        if (restartRequestId === undefined) throw new Error('restart request id is unavailable');
        setOnline(undefined);
        phase = 'waiting for the replacement DSH instance';
        const replacement = await waitForReplacementHost(restartRequestId);
        phase = 'authenticating the replacement DSH instance';
        await authenticateReplacement(replacement.launchUrl);
        phase = 'reconnecting the DSH page';
        await reconnectAndWaitForConnected(CONNECTION_RECOVERY_TIMEOUT_MS);
        setOnline(true);
      } else {
        setOnline(false);
      }
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'unknown error';
      console.error(`[dsh-session-resilience] ${phase} failed (${kind})`);
      if (action === 'restart') setOnline(false);
      setMessage(action === 'restart' ? 'restart.restartFailed' : 'restart.shutdownFailed');
    } finally {
      setBusy(undefined);
      submitted.current = false;
    }
  };

  const statusLabel = online === undefined
    ? t('restart.checking')
    : online ? t('restart.online') : t('restart.offline');
  const busyLabel = busy === 'restart'
    ? t('restart.restarting')
    : busy === 'shutdown' ? t('restart.shuttingDown') : statusLabel;

  return (
    <div className="dshRestartContinueActions" data-dsh-session-resilience="actions">
      <span
        className={`dshRestartContinueDot ${online === true ? 'is-online' : online === false ? 'is-offline' : 'is-checking'}`}
        title={busyLabel}
        aria-label={statusLabel}
      />
      <button
        type="button"
        className="dshRestartContinueButton"
        data-dsh-restart-action="restart"
        aria-label={t('restart.restart')}
        title={t('restart.restart')}
        disabled={busy !== undefined}
        onClick={() => { void run('restart'); }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M20 11a8 8 0 0 0-14.8-4.2L3 9m0 0V4m0 5h5M4 13a8 8 0 0 0 14.8 4.2L21 15m0 0v5m0-5h-5" />
        </svg>
      </button>
      <button
        type="button"
        className="dshRestartContinueButton"
        data-dsh-restart-action="shutdown"
        aria-label={t('restart.shutdown')}
        title={t('restart.shutdown')}
        disabled={busy !== undefined}
        onClick={() => { void run('shutdown'); }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3v9m-5.2-5A8 8 0 1 0 17.2 7" />
        </svg>
      </button>
      {message !== undefined && <span className="dshRestartContinueMessage">{t(message)}</span>}
      {busy !== undefined && <span className="dshRestartContinueSrOnly">{busyLabel}</span>}
    </div>
  );
}

const style = `
.dshRestartContinueActions {
  align-items: center;
  display: flex;
  gap: 6px;
  min-height: 38px;
  padding: 0 8px;
}
.dshRestartContinueButton {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  height: 32px;
  justify-content: center;
  padding: 0;
  width: 32px;
}
.dshRestartContinueButton:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3); }
.dshRestartContinueButton:focus-visible { outline: 2px solid var(--dsw-alias-accent); outline-offset: 1px; }
.dshRestartContinueButton:disabled { cursor: wait; opacity: .45; }
.dshRestartContinueButton svg { fill: none; height: 19px; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; width: 19px; }
.dshRestartContinueDot {
  align-items: center;
  display: inline-flex;
  flex: 0 0 32px;
  height: 32px;
  justify-content: center;
  margin-left: auto;
  width: 32px;
}
.dshRestartContinueDot::after { border-radius: 50%; content: ''; height: 9px; width: 9px; }
.dshRestartContinueDot.is-online::after { background: #27c96f; box-shadow: 0 0 8px rgb(39 201 111 / 65%); }
.dshRestartContinueDot.is-offline::after { background: #e56b6f; }
.dshRestartContinueDot.is-checking::after { background: #d6a84f; }
.dshRestartContinueMessage { color: var(--dsw-alias-fg-muted); font-size: 11px; white-space: nowrap; }
.dshRestartContinueSrOnly { height: 1px; margin: -1px; overflow: hidden; position: absolute; width: 1px; clip: rect(0 0 0 0); }
`;

if (typeof document !== 'undefined' && document.head !== undefined && !document.querySelector('style[data-dsh-session-resilience]')) {
  const element = document.createElement('style');
  element.dataset.dshRestartContinue = '';
  element.textContent = style;
  document.head.appendChild(element);
}
