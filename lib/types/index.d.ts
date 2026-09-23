/**
 * Combined Host half for restart controls and automatic continuation.
 *
 * - Configures the `dsh-session-resilience` settings entry (the browser half's
 *   settings card edits it; the host engine reads it).
 * - Runs the single-instance auto-continue engine: listens to the session
 *   event firehose, sends via `agent.followup`, cancels via `agent.cancel`.
 * - Serves a status bridge the browser half subscribes to: notifications and
 *   runtime state (stats / pauses), plus an action endpoint for notification
 *   buttons.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Settings namespace of the auto-continue plugin (lowercase kebab-case). */
export declare const AUTO_CONTINUE_NS = "dsh-session-resilience";
/** Wire schema; blank localized text fields tell resolveConfig() to select the active locale's defaults. */
export declare const AutoContinueSchema: z<Schemastery.ObjectS<NoInfer<{
    /** Named recovery policy; Manual leaves the individual recovery controls active. */
    recoveryPreset: z<"manual" | "safe" | "balanced" | "long-task", "manual" | "safe" | "balanced" | "long-task", "defined">;
    /** Master switch for all automatic continuation behavior. */
    enabled: z<boolean, boolean, "defined">;
    /** Continue sessions that were active when the host was deliberately restarted. */
    restartAutoContinue: z<boolean, boolean, "defined">;
    /** How long a recorded restart handoff remains valid for a browser reconnect. */
    restartResumeWindowMs: z<number, number, "plain">;
    /** Active browser/UI locale mirrored by the client. */
    locale: z<string, string, "defined">;
    /** Text automatically sent after an interruption. */
    continueText: z<string, string, "defined">;
    /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
    continueTextMaxTokens: z<string, string, "defined">;
    /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
    guardTools: z<boolean, boolean, "defined">;
    /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
    guardPendingText: z<string, string, "defined">;
    /** Guard text appended when the last tool call completed successfully (don't rerun it). */
    guardDoneText: z<string, string, "defined">;
    /** Grace period after an interruption before auto-sending (ms). */
    graceMs: z<number, number, "plain">;
    /** Minimum interval between two auto-continues per session (ms). */
    cooldownMs: z<number, number, "plain">;
    /** Max consecutive auto-continues per session before stopping. */
    maxConsecutive: z<number, number, "plain">;
    /** Scan recently interrupted sessions on page load / reconnect. */
    scanOnBoot: z<boolean, boolean, "defined">;
    /** Max sessions the scan checks (most recently updated). */
    scanLimit: z<number, number, "plain">;
    /** Scan only considers interruptions inside this window (ms). */
    freshMs: z<number, number, "plain">;
    /** Log `[auto-continue]` lines to the browser console. */
    verbose: z<boolean, boolean, "defined">;
    /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
    classify: z<boolean, boolean, "defined">;
    /** Provider-specific message/code/status fragments that explicitly count as retryable, one literal per line. */
    retryableErrorPatterns: z<string, string, "defined">;
    /** Cooldown multiplier per consecutive failure (adaptive backoff). */
    backoffFactor: z<number, number, "plain">;
    /** Cap on the effective backoff interval (ms). */
    backoffMaxMs: z<number, number, "plain">;
    /** Show browser notifications for auto-continue events. */
    notify: z<boolean, boolean, "defined">;
    /** Globally pause auto-continue: no live or scan send. */
    paused: z<boolean, boolean, "defined">;
    /** Loop guard: detect a running turn spinning in place and restart it. */
    loopGuard: z<boolean, boolean, "defined">;
    /** A model message shorter than this many chars counts as a short sentence (loop signal). */
    loopShortChars: z<number, number, "defined">;
    /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
    loopWindowMs: z<number, number, "defined">;
    /** Consecutive short sentences trip the loop guard. */
    loopShortCount: z<number, number, "defined">;
    /** Consecutive identical assistant messages trip the loop guard (strongest signal; also used for streamed intra-message repetition). */
    loopRepeatText: z<number, number, "defined">;
    /** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
    loopToolRepeat: z<number, number, "defined">;
    /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
    loopText: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Named recovery policy; Manual leaves the individual recovery controls active. */
    recoveryPreset: z<"manual" | "safe" | "balanced" | "long-task", "manual" | "safe" | "balanced" | "long-task", "defined">;
    /** Master switch for all automatic continuation behavior. */
    enabled: z<boolean, boolean, "defined">;
    /** Continue sessions that were active when the host was deliberately restarted. */
    restartAutoContinue: z<boolean, boolean, "defined">;
    /** How long a recorded restart handoff remains valid for a browser reconnect. */
    restartResumeWindowMs: z<number, number, "plain">;
    /** Active browser/UI locale mirrored by the client. */
    locale: z<string, string, "defined">;
    /** Text automatically sent after an interruption. */
    continueText: z<string, string, "defined">;
    /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
    continueTextMaxTokens: z<string, string, "defined">;
    /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
    guardTools: z<boolean, boolean, "defined">;
    /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
    guardPendingText: z<string, string, "defined">;
    /** Guard text appended when the last tool call completed successfully (don't rerun it). */
    guardDoneText: z<string, string, "defined">;
    /** Grace period after an interruption before auto-sending (ms). */
    graceMs: z<number, number, "plain">;
    /** Minimum interval between two auto-continues per session (ms). */
    cooldownMs: z<number, number, "plain">;
    /** Max consecutive auto-continues per session before stopping. */
    maxConsecutive: z<number, number, "plain">;
    /** Scan recently interrupted sessions on page load / reconnect. */
    scanOnBoot: z<boolean, boolean, "defined">;
    /** Max sessions the scan checks (most recently updated). */
    scanLimit: z<number, number, "plain">;
    /** Scan only considers interruptions inside this window (ms). */
    freshMs: z<number, number, "plain">;
    /** Log `[auto-continue]` lines to the browser console. */
    verbose: z<boolean, boolean, "defined">;
    /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
    classify: z<boolean, boolean, "defined">;
    /** Provider-specific message/code/status fragments that explicitly count as retryable, one literal per line. */
    retryableErrorPatterns: z<string, string, "defined">;
    /** Cooldown multiplier per consecutive failure (adaptive backoff). */
    backoffFactor: z<number, number, "plain">;
    /** Cap on the effective backoff interval (ms). */
    backoffMaxMs: z<number, number, "plain">;
    /** Show browser notifications for auto-continue events. */
    notify: z<boolean, boolean, "defined">;
    /** Globally pause auto-continue: no live or scan send. */
    paused: z<boolean, boolean, "defined">;
    /** Loop guard: detect a running turn spinning in place and restart it. */
    loopGuard: z<boolean, boolean, "defined">;
    /** A model message shorter than this many chars counts as a short sentence (loop signal). */
    loopShortChars: z<number, number, "defined">;
    /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
    loopWindowMs: z<number, number, "defined">;
    /** Consecutive short sentences trip the loop guard. */
    loopShortCount: z<number, number, "defined">;
    /** Consecutive identical assistant messages trip the loop guard (strongest signal; also used for streamed intra-message repetition). */
    loopRepeatText: z<number, number, "defined">;
    /** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
    loopToolRepeat: z<number, number, "defined">;
    /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
    loopText: z<string, string, "defined">;
}>>, "plain">;
/** Config schema consumed by the active profile entry and SettingsForms. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Named recovery policy; Manual leaves the individual recovery controls active. */
    recoveryPreset: z<"manual" | "safe" | "balanced" | "long-task", "manual" | "safe" | "balanced" | "long-task", "defined">;
    /** Master switch for all automatic continuation behavior. */
    enabled: z<boolean, boolean, "defined">;
    /** Continue sessions that were active when the host was deliberately restarted. */
    restartAutoContinue: z<boolean, boolean, "defined">;
    /** How long a recorded restart handoff remains valid for a browser reconnect. */
    restartResumeWindowMs: z<number, number, "plain">;
    /** Active browser/UI locale mirrored by the client. */
    locale: z<string, string, "defined">;
    /** Text automatically sent after an interruption. */
    continueText: z<string, string, "defined">;
    /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
    continueTextMaxTokens: z<string, string, "defined">;
    /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
    guardTools: z<boolean, boolean, "defined">;
    /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
    guardPendingText: z<string, string, "defined">;
    /** Guard text appended when the last tool call completed successfully (don't rerun it). */
    guardDoneText: z<string, string, "defined">;
    /** Grace period after an interruption before auto-sending (ms). */
    graceMs: z<number, number, "plain">;
    /** Minimum interval between two auto-continues per session (ms). */
    cooldownMs: z<number, number, "plain">;
    /** Max consecutive auto-continues per session before stopping. */
    maxConsecutive: z<number, number, "plain">;
    /** Scan recently interrupted sessions on page load / reconnect. */
    scanOnBoot: z<boolean, boolean, "defined">;
    /** Max sessions the scan checks (most recently updated). */
    scanLimit: z<number, number, "plain">;
    /** Scan only considers interruptions inside this window (ms). */
    freshMs: z<number, number, "plain">;
    /** Log `[auto-continue]` lines to the browser console. */
    verbose: z<boolean, boolean, "defined">;
    /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
    classify: z<boolean, boolean, "defined">;
    /** Provider-specific message/code/status fragments that explicitly count as retryable, one literal per line. */
    retryableErrorPatterns: z<string, string, "defined">;
    /** Cooldown multiplier per consecutive failure (adaptive backoff). */
    backoffFactor: z<number, number, "plain">;
    /** Cap on the effective backoff interval (ms). */
    backoffMaxMs: z<number, number, "plain">;
    /** Show browser notifications for auto-continue events. */
    notify: z<boolean, boolean, "defined">;
    /** Globally pause auto-continue: no live or scan send. */
    paused: z<boolean, boolean, "defined">;
    /** Loop guard: detect a running turn spinning in place and restart it. */
    loopGuard: z<boolean, boolean, "defined">;
    /** A model message shorter than this many chars counts as a short sentence (loop signal). */
    loopShortChars: z<number, number, "defined">;
    /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
    loopWindowMs: z<number, number, "defined">;
    /** Consecutive short sentences trip the loop guard. */
    loopShortCount: z<number, number, "defined">;
    /** Consecutive identical assistant messages trip the loop guard (strongest signal; also used for streamed intra-message repetition). */
    loopRepeatText: z<number, number, "defined">;
    /** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
    loopToolRepeat: z<number, number, "defined">;
    /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
    loopText: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Named recovery policy; Manual leaves the individual recovery controls active. */
    recoveryPreset: z<"manual" | "safe" | "balanced" | "long-task", "manual" | "safe" | "balanced" | "long-task", "defined">;
    /** Master switch for all automatic continuation behavior. */
    enabled: z<boolean, boolean, "defined">;
    /** Continue sessions that were active when the host was deliberately restarted. */
    restartAutoContinue: z<boolean, boolean, "defined">;
    /** How long a recorded restart handoff remains valid for a browser reconnect. */
    restartResumeWindowMs: z<number, number, "plain">;
    /** Active browser/UI locale mirrored by the client. */
    locale: z<string, string, "defined">;
    /** Text automatically sent after an interruption. */
    continueText: z<string, string, "defined">;
    /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
    continueTextMaxTokens: z<string, string, "defined">;
    /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
    guardTools: z<boolean, boolean, "defined">;
    /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
    guardPendingText: z<string, string, "defined">;
    /** Guard text appended when the last tool call completed successfully (don't rerun it). */
    guardDoneText: z<string, string, "defined">;
    /** Grace period after an interruption before auto-sending (ms). */
    graceMs: z<number, number, "plain">;
    /** Minimum interval between two auto-continues per session (ms). */
    cooldownMs: z<number, number, "plain">;
    /** Max consecutive auto-continues per session before stopping. */
    maxConsecutive: z<number, number, "plain">;
    /** Scan recently interrupted sessions on page load / reconnect. */
    scanOnBoot: z<boolean, boolean, "defined">;
    /** Max sessions the scan checks (most recently updated). */
    scanLimit: z<number, number, "plain">;
    /** Scan only considers interruptions inside this window (ms). */
    freshMs: z<number, number, "plain">;
    /** Log `[auto-continue]` lines to the browser console. */
    verbose: z<boolean, boolean, "defined">;
    /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
    classify: z<boolean, boolean, "defined">;
    /** Provider-specific message/code/status fragments that explicitly count as retryable, one literal per line. */
    retryableErrorPatterns: z<string, string, "defined">;
    /** Cooldown multiplier per consecutive failure (adaptive backoff). */
    backoffFactor: z<number, number, "plain">;
    /** Cap on the effective backoff interval (ms). */
    backoffMaxMs: z<number, number, "plain">;
    /** Show browser notifications for auto-continue events. */
    notify: z<boolean, boolean, "defined">;
    /** Globally pause auto-continue: no live or scan send. */
    paused: z<boolean, boolean, "defined">;
    /** Loop guard: detect a running turn spinning in place and restart it. */
    loopGuard: z<boolean, boolean, "defined">;
    /** A model message shorter than this many chars counts as a short sentence (loop signal). */
    loopShortChars: z<number, number, "defined">;
    /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
    loopWindowMs: z<number, number, "defined">;
    /** Consecutive short sentences trip the loop guard. */
    loopShortCount: z<number, number, "defined">;
    /** Consecutive identical assistant messages trip the loop guard (strongest signal; also used for streamed intra-message repetition). */
    loopRepeatText: z<number, number, "defined">;
    /** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
    loopToolRepeat: z<number, number, "defined">;
    /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
    loopText: z<string, string, "defined">;
}>>, "plain">;
/**
 * Plugin body: configure settings for this profile entry, start the single-instance
 * engine, and serve the status bridge.
 * @param ctx - host plugin context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map