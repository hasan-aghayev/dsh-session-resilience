---
description: "A DSH profile bundle for safe restart, token-aware reconnect, and policy-based session recovery."
kind: "package-bundle"
---

# DSH Session Resilience

English | [中文](README.zh.md)

## Summary

DSH Session Resilience keeps long-running web sessions recoverable when the local DSH host restarts, disconnects, reaches a token limit, or begins repeating the same work. It combines loopback restart and stop controls with a host-owned continuation engine, a token-aware reconnect, four recovery policies, idempotency guards, adaptive backoff, loop protection, and a small live recovery panel.

## What makes it different

- **Recovery policies** — Safe, Balanced, Long task, and Manual coordinate the recovery window, cooldown, retry cap, scan range, and backoff. Manual keeps every individual control editable.
- **Token-aware reconnect** — The browser waits for the replacement host's actual launch URL before reconnecting, instead of reopening an unauthenticated root page.
- **One recovery center** — Restart, stop, automatic continuation, loop protection, error classification, notifications, statistics, and paused sessions are managed from one settings card.
- **DSH-native control surface** — The settings card uses DSH semantic tokens and compact field density, with a custom module rail and numbered control groups instead of a second visual theme.
- **No false success** — A restart is not reported as ready until the replacement host is reachable and its fresh launch URL has been found.
- **Small model surface** — The model receives only `restart_dsh` and `shutdown_dsh`; recovery policy and browser controls stay outside the model prompt.
- **Local-first operation** — Restart markers, helper logs, and control routes are local to the DSH host. The plugin has no analytics or remote service.

## Install

### Package install

Install the package into the environment used by the DSH profile, add `dsh-session-resilience` to the profile's bundle list, and run the profile's normal reconcile step.

The bundle patch inserts the Host entry and the web-client entry. The package includes prebuilt `lib` files so a GitHub installation does not depend on a local TypeScript build.

### GitHub install

This repository is intended to be the source of truth for a public release. Pin an exact commit when adding it to a profile. Do not use a moving branch in a production profile.

The repository metadata is already configured for this public GitHub repository. Submit its public URL through [dsh.pub/submit](https://dsh.pub/en/submit/) after the local checks pass. The registry validates the selected commit and generates an auditable catalog pull request; npm publication is not required for Git-based installation.

## Controls

The web sidebar keeps two compact controls beside the status indicator:

- **Restart** records active root sessions, starts a replacement DSH host on the configured port, waits for its tokenized launch URL, and lets the browser reconnect.
- **Stop** stops the active DSH host without starting a replacement process.

The settings card remains available when automatic recovery is disabled, so a user can still perform a deliberate manual restart or stop.

## Recovery policies

| Policy | Intended use | Default behavior |
| --- | --- | --- |
| Safe | Short or sensitive tasks | 5-minute handoff, 2 consecutive resumes, smaller scan |
| Balanced | Everyday work | 10-minute handoff, 3 consecutive resumes, moderate backoff |
| Long task | Builds, imports, and long agent sessions | 30-minute handoff, 8 consecutive resumes, wider scan |
| Manual | Fine tuning | Uses the individual controls in the card |

The policy is explicit configuration, not a hidden fallback inside the runtime. When Manual is selected, the individual fields are authoritative. The initial Manual values match the Balanced values and preserve the behavior of an existing configuration.

## Safety behavior

The continuation engine resumes only machine-interrupted, transiently failed, or token-limited turns. User aborts and policy-blocked turns are not resumed automatically. Before a continuation, the idempotency guard can tell the model to verify a tool whose result is unknown or avoid repeating a tool that already succeeded.

Permanent failures such as authentication, balance, missing-model, and context-limit errors are skipped and can be surfaced through browser notifications. Repeated failures use adaptive backoff and stop at the configured limit. The loop guard can cancel and redirect a turn that repeats identical tool calls or assistant text.

## Settings

Open **Settings → Plugins → DSH Session Resilience**. The card uses staged edits: values are validated locally and written only after Save. Reset on an individual field removes its user override and returns to the deployment default.

The card includes:

- restart handoff and reconnect window;
- continuation text and output-limit text;
- tool-result safety guard;
- interruption grace period and cooldown;
- boot/reconnect scan and transient-error classification;
- retryable provider patterns and adaptive backoff;
- browser notifications and verbose logging;
- loop guard thresholds;
- today's counters and paused-session controls.

## Model Experience

### Restart and shutdown tools

#### What the model sees

The model can call `restart_dsh` when the user asks to restart DSH or the current task explicitly requires it. It can call `shutdown_dsh` only for an explicit stop request. Both tools accept an empty object. Restart results include the instance, previous process, port, captured root sessions, and helper log paths.

#### Token effect

The two tool definitions and their result text use the normal tool-call and tool-result tokens for the active model request. Automatic recovery adds the configured continuation message only after a qualifying interruption.

#### KV Cache effect

The plugin adds no fixed system-prompt prefix. Its model-visible contribution is limited to the two tool definitions, their results, and a continuation message when recovery is triggered.

## Compatibility and limitations

- Designed for a DSH web profile with the published `@deepseek-ai/cordis` and `@deepseek-ai/dsh-tools` peer packages.
- Tested against DeepSeek Harness `0.1.5-rc.2` and Node `22.19+`; package metadata accepts DSH `>=0.1.0-rc.7 <0.2.0`.
- The replacement process uses the profile's normal DSH web launch path and configured port; the plugin does not choose a GPU, model, or port.
- Restart recovery requires a root browser session that reconnects within the selected handoff window.
- A process that is killed before it writes the restart marker cannot provide a session handoff.
- The browser must be allowed to reconnect to the local DSH launch URL. Browser policy, an external proxy, or a host-level process manager can still prevent recovery.
- Provider-specific errors may need a narrow custom retryable pattern. Broad patterns can repeat requests and should be avoided.

## Development and release

The repository commits prebuilt `lib` artifacts because DSH GitHub installation does not assume a local TypeScript toolchain. Run:

```sh
npm run verify
npm test
npm pack --dry-run
```

The verification script checks the standalone package identity, bundle patch, required publication files, and JavaScript syntax. `npm test` runs artifact-level checks for client registration and the detached restart helper. The GitHub workflow repeats these checks for every push and pull request.

For the DSH Plugin Market submission, use a public repository whose root contains this `package.json`, `cordis.patch.yml`, README, license, and prebuilt `lib` files. Push the exact commit, open [dsh.pub/submit](https://dsh.pub/en/submit/), submit `https://github.com/hasan-aghayev/dsh-session-resilience`, and follow the generated catalog pull request. For reproducible installation, use `npx dshpub add hasan-aghayev/dsh-session-resilience --ref <commit>`.

## License and attribution

MIT. This project is an independent community plugin and is not affiliated with DeepSeek AI. It uses the documented DSH plugin extension points and does not modify the DSH agent loop.
