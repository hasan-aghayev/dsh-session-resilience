# Changelog

## Unreleased

## 0.1.6 - 2026-09-29

- Keep the current DSH page mounted through host restarts and let its live connections recover in place.
- Send restart and stop actions with a same-origin beacon, then exchange the replacement launch token in the background.
- Document page-preserving reconnect and the browser request fallback.

## 0.1.5 - 2026-09-29

- Submit browser restart and stop actions as same-origin page navigations so open streaming connections cannot hold them in the fetch queue.
- Show a local reconnect page that waits for the replacement host's tokenized launch URL, with a retry option for slow startup.
- Keep the JSON action response for model tools and other non-browser callers.

## 0.1.4 - 2026-09-29

- Cancel stalled browser requests and retry status checks after they settle.
- Share one in-flight status request between the sidebar indicator and restart handoff.
- Document how to update profiles pinned to the DSH 0.1.1 client bundle when startup waits for `settingsScope`.

## 0.1.3 - 2026-09-29

- Add DSH `0.2.0-rc.2` to the supported host and peer-package ranges while retaining the existing DSH 0.1.x ranges.
- Check the plugin's used host APIs against the DSH `0.2.0-rc.2` source and smoke-test activation from the packed archive.
- Verify the manifest compatibility in the package checks.

## 0.1.2 - 2026-09-23

- Migrate the settings page and forms to the DSH 0.1.7 Plugins page and configuration-form services.
- Read live configuration from the profile entry and use the entry id as its settings namespace.
- Use the typed message-source contract for recovery and restart notices.
- Rebuild the host and client artifacts and check the package against DeepSeek Harness 0.1.7-alpha.2.

## 0.1.1 - 2026-09-16

- Dispose the status bridge routes, SSE clients, and subscriptions during plugin lifecycle replacement.
- Restrict the local status bridge and control actions to direct loopback requests; validate methods, actions, session ids, and request size.
- Fail restart preparation when the durable handoff cannot be written instead of returning a false success result.
- Add artifact assertions for the lifecycle and local-request safeguards.
- Add a reproducible package check and tag-based GitHub Release workflow.

## 0.1.0

- Initial standalone release candidate for DSH.
- Combined loopback restart, stop, token-aware reconnect, and automatic session recovery.
- Added Safe, Balanced, Long task, and Manual recovery policies.
- Added staged settings, recovery statistics, paused-session controls, transient-error classification, adaptive backoff, and loop protection.
- Added artifact smoke tests for client registration and helper relaunch readiness.
- Declared the supported DSH engine range and documented the Plugin Market submission path.
- Reworked the settings card into a DSH-native control surface with compact fields, module status, and numbered sections.
