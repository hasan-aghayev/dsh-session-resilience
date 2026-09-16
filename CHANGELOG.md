# Changelog

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
