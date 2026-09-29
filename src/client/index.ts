/**
 * Combined restart/continue plugin, browser half (thin shell).
 *
 * Since 0.8.0 the auto-continue ENGINE runs inside the host process (single
 * instance — see src/host/engine.ts), so this half only:
 * - registers the combined `auto-continue` settings page (`plugins.item`),
 * - keeps restart and shutdown controls in the sidebar footer,
 * - subscribes to the host status bridge (SSE) and shows browser
 *   notifications with action buttons (Resume now / Pause 1h) via the bridge
 *   action endpoint,
 * - feeds the card's stats / paused-sessions panels from the bridge state.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client';
// Type-only: pulls the `ctx.configForms` Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
// Type-only: pulls the Plugins page SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import { attachConnection, type ReconnectableConnection } from './connection-control.js';
import { type AutoContinueSettings } from './engine.ts';
import { en, zh, type SettingsCardKey } from './locales.ts';
import {
  AutoContinueSettingsCard,
  AutoContinueSettingsCardController,
} from './settings-card.tsx';
import { startBridge } from './bridge.ts';
import { RestartActions } from './RestartActions.tsx';

/** Dictionary namespace owned by this plugin. */
const NS = 'auto-continue';

/** Settings namespace the settings card edits (the host engine reads it). */
const SETTINGS_NS = 'dsh-session-resilience';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** auto-continue settings-card copy. */
    'auto-continue': SettingsCardKey;
  }
}

/** Services required by this plugin. */
export const inject = ['slots', 'locale', 'configForms', 'connection'];

// 浏览器侧辅助(设置卡片用): 桥状态读取与暂停解除。
export {
  pausedSessions,
  readTodayStats,
  resetTodayStats,
  unpauseSession,
} from './bridge.ts';

/**
 * Plugin body: settings card + host status bridge (notifications, stats,
 * paused sessions).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ReconnectableConnection;
  ctx.effect(() => attachConnection(connection), 'auto-continue: DSH connection');

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'auto-continue: dictionaries');

  const scope = ctx.configForms.get<AutoContinueSettings>(SETTINGS_NS);
  const syncLocale = (): void => {
    const active = ctx.locale.getLocale().active;
    const snapshot = scope.getSnapshot();
    if (snapshot.status !== 'ready' || !snapshot.writable || snapshot.mode !== 'host') return;
    if (snapshot.value?.locale === active) return;
    void scope.set('locale', active);
  };
  ctx.effect(() => scope.subscribe(syncLocale), 'auto-continue: locale settings sync');
  ctx.on('locale/change', syncLocale);
  syncLocale();

  // 状态桥: 订阅 host 的通知与运行时状态, 弹浏览器通知并驱动卡片面板。
  ctx.effect(() => startBridge(), 'auto-continue: host bridge');

  // Plugin page: keep the staged configuration form available while its
  // settings row is served by the Plugin Manager.
  const controller = new AutoContinueSettingsCardController(scope);
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NS], () =>
    ctx.slots.inject('plugins.item', () => ctx.slots.register({
      name: 'plugins.item',
      id: 'restart-continue',
      order: 50,
      label: () => t('card.title'),
      locale: NS,
      inject: () => controller.inject(),
    }, AutoContinueSettingsCard)),
  ), 'auto-continue: settings page');

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-session-resilience-actions',
    locale: NS,
  }, RestartActions));
}
