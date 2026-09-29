# Changelog

## Unreleased

## 0.1.11 - 2026-09-30

- Send local restart and stop requests without DSH session cookies; the host validates the loopback connection and matching browser origin.
- Allow the browser 15 seconds to receive a restart or stop acknowledgement before reporting a request failure.
- Document the local action-request checks and update the profile-install command.

## 0.1.10 - 2026-09-29

- Match the replacement host by its own reported instance id instead of the launcher process id, so hosts started through wrappers can complete the first restart handoff.
- Record and verify the replacement instance id before publishing its launch URL.

## 0.1.9 - 2026-09-29

- Send restart and stop actions as same-origin requests and wait for DSH to confirm acceptance before waiting for recovery.
- Verify the host returns the same restart request id before reconnecting the page.
- Document acknowledged restart requests and the in-place recovery sequence.

## 0.1.8 - 2026-09-29

- Queue the restart command before requesting status, so a stalled browser fetch cannot prevent the restart from starting.
- Correlate replacement readiness with a one-time request id and show connection health from DSH's public connection service instead of a repeating status request.
- Document the beacon-first handoff and token-matched readiness check.

## 0.1.7 - 2026-09-29

- Explicitly reconnect DSH's live connection after exchanging the replacement host token, and wait until DSH reports a connected session before reporting success.
- Add a safe console diagnostic that identifies which restart stage failed without logging the launch URL or token.
- Clarify the in-place reconnect steps and readiness check.

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
