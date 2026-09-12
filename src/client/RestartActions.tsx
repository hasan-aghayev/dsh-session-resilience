import { useEffect, useState } from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type { SettingsCardKey } from './locales.ts';

type RestartActionProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'auto-continue'>;

interface RestartStatus {
  ok: boolean;
  instanceId?: string;
  launchUrl?: string;
}

type BusyAction = 'restart' | 'shutdown' | undefined;

function statusUrl(): string {
  return '/dsh-restart/status';
}

async function readStatus(): Promise<RestartStatus> {
  const response = await fetch(statusUrl(), { cache: 'no-store' });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return await response.json() as RestartStatus;
}

async function waitForLaunchUrl(): Promise<string> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const status = await readStatus();
      if (status.launchUrl !== undefined) return status.launchUrl;
    } catch {
      // The old Host is expected to refuse requests while the replacement starts.
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
  }
  throw new Error('new DSH launch URL was not published');
}

/** Render the restart/stop controls in the sidebar footer. */
export function RestartActions({ t }: RestartActionProps) {
  const [online, setOnline] = useState<boolean | undefined>();
  const [busy, setBusy] = useState<BusyAction>();
  const [message, setMessage] = useState<SettingsCardKey | undefined>();

  useEffect(() => {
    let active = true;
    const refresh = (): void => {
      void readStatus()
        .then(() => { if (active) setOnline(true) })
        .catch(() => { if (active) setOnline(false) });
    };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const run = async (action: Exclude<BusyAction, undefined>): Promise<void> => {
    setBusy(action);
    setMessage(undefined);
    try {
      const response = await fetch(`/dsh-restart/${action}`, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`action ${response.status}`);
      setOnline(action === 'restart' ? undefined : false);
      if (action === 'restart') {
        // The new Host mints a different launch token. Wait for the detached
        // helper to publish that URL instead of opening an unauthenticated `/`.
        window.location.assign(await waitForLaunchUrl());
      }
    } catch {
      setMessage(action === 'restart' ? 'restart.restartFailed' : 'restart.shutdownFailed');
      setOnline(false);
    } finally {
      setBusy(undefined);
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
