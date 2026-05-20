# Alpha Acceptance Coverage Matrix

Updated: 2026-05-17

This matrix keeps local alpha acceptance grounded in first principles: protect the durable task-management flows that make the product usable, and keep smoke coverage small enough that failures point to real product regressions instead of brittle script noise.

## Coverage

| Area | Current Coverage | Command / Evidence | Status |
| --- | --- | --- | --- |
| Unit, integration, type, renderer build | Full automated test suite, TypeScript checks, Electron/renderer build | `npm run verify` | Covered |
| Canonical local data health | Read-only diagnostics against the local SQLite database and canonical data contract when a local DB exists | `npm run diagnostics:canonical-data:optional` | Covered |
| Runtime and agent execution core | Agent lifecycle, checkpoints, runtime gates, provider-native tool adapters, sandbox coding orchestration | `npm run accept:agent-local` | Covered |
| Model-producer preflight | Verifies live-provider/Docker/workspace mutation gates before real execution | `npm run accept:sandbox-coding:model-producer-preflight` | Covered, environment-gated |
| macOS packaged runtime | Builds packaged app and checks config, database schema, task-dynamics replay UI, packaged boot | `npm run smoke:release:mac` | Covered |
| Packaged recovery paths | Brief recovery, project decomposition, work habits, code-agent UI, task-bound Agent CLI run/cancel/native-goal audit, run/decision recovery, settings config | `npm run accept:packaged-recovery:mac` | Covered |
| Supplemental product surface smoke | External Access empty/safety/fixture-connected/local-inbox state, Decisions judgment center, task file open/save | `npm run accept:product-surfaces:mac` | Added |
| Release readiness | Developer ID, notarization, artifact upload/network checks | `npm run accept:release:mac-preflight` | Covered, expected `not-ready` without credentials |
| Live provider execution | Real model-provider task execution | Provider-native live acceptance commands | Optional, requires credentials |
| Docker/local sandbox mutation | Real local-container sandbox execution | `TASKPLANE_ENABLE_LOCAL_CONTAINER_SANDBOX=true` preflight/live commands | Optional, requires Docker and explicit env |
| Real external connectors | Gmail/Calendar/GitHub style external access | Not in local alpha smoke | Deferred until connectors exist |
| Runtime-native goal discovery | Codex/Claude native goal command-shape discovery | `npm run manual:agent-cli-native-goal-discovery` | Manual only; default probes help/version and candidate execution requires explicit env |

## Acceptance Command

`npm run accept:alpha-local` is the local alpha gate. It now runs:

1. `verify`
2. `diagnostics:canonical-data:optional`
3. `accept:agent-local`
4. `accept:sandbox-coding:model-producer-preflight`
5. `smoke:release:mac`
6. `accept:packaged-recovery:mac`
7. `accept:product-surfaces:mac`
8. `accept:release:mac-preflight`

## Product-Surface Smoke Intent

`accept:product-surfaces:mac` is a supplemental packaged surface smoke. It does
not own every UI surface: Brief recovery is protected by
`accept:packaged-recovery:mac`, and task-dynamics replay rendering is protected
by `smoke:release:mac` through `smoke:timeline-ui:mac`.

- External Access: verifies the no-connector state still communicates authorization boundaries and keeps connection actions disabled; a fixture-connected smoke verifies the structured connector status path reaches the packaged page, CapabilityRegistry, and ConfigurationSafetyReport without live external providers; a local-inbox smoke creates a packaged task, previews local inbox evidence through the source-review panel, confirms the write, and verifies the Source Context memory path without live providers.
- Decisions: verifies pending decisions render as a judgment center and can be resolved through the packaged UI.
- Task files: verifies the task file explorer opens a persisted task file, classifies it as a normal file, saves through the packaged UI, and persists to SQLite.
- Agent CLI task loop: `accept:packaged-recovery:mac` includes `smoke:agent-cli-task:mac`, which uses a fake Codex executable to verify task-bound execution evidence, cancellation evidence, task dynamics replay, memory-proposal surfacing, native-goal audit evidence, and no workspace writes without requiring a live CLI account.

## Known Boundaries

- Signing and notarization are intentionally reported by preflight rather than faked locally.
- Live provider and Docker-backed mutation paths remain opt-in because they need external credentials or host capabilities.
- The smoke suite does not attempt exhaustive UI layout verification; it protects high-value real workflows only.
