# Alpha Acceptance Coverage Matrix

Updated: 2026-05-17

This matrix keeps local alpha acceptance grounded in first principles: protect the durable task-management flows that make the product usable, and keep smoke coverage small enough that failures point to real product regressions instead of brittle script noise.

## Coverage

| Area | Current Coverage | Command / Evidence | Status |
| --- | --- | --- | --- |
| Unit, integration, type, renderer build | Full automated test suite, TypeScript checks, Electron/renderer build | `npm run verify` | Covered |
| Runtime and agent execution core | Agent lifecycle, checkpoints, runtime gates, provider-native tool adapters, sandbox coding orchestration | `npm run accept:agent-local` | Covered |
| Model-producer preflight | Verifies live-provider/Docker/workspace mutation gates before real execution | `npm run accept:sandbox-coding:model-producer-preflight` | Covered, environment-gated |
| macOS packaged runtime | Builds packaged app and checks config, database schema, timeline scan, packaged boot | `npm run smoke:release:mac` | Covered |
| Packaged recovery paths | Brief recovery, project decomposition, work habits, code-agent UI, run/decision recovery, settings config | `npm run accept:packaged-recovery:mac` | Covered |
| Product surface smoke | External Access empty/safety state, Decisions judgment center, task file open/save | `npm run accept:product-surfaces:mac` | Added |
| Release readiness | Developer ID, notarization, artifact upload/network checks | `npm run accept:release:mac-preflight` | Covered, expected `not-ready` without credentials |
| Live provider execution | Real model-provider task execution | Provider-native live acceptance commands | Optional, requires credentials |
| Docker/local sandbox mutation | Real local-container sandbox execution | `TASKPLANE_ENABLE_LOCAL_CONTAINER_SANDBOX=true` preflight/live commands | Optional, requires Docker and explicit env |
| Real external connectors | Gmail/Calendar/GitHub style external access | Not in local alpha smoke | Deferred until connectors exist |

## Acceptance Command

`npm run accept:alpha-local` is the local alpha gate. It now runs:

1. `verify`
2. `accept:agent-local`
3. `accept:sandbox-coding:model-producer-preflight`
4. `smoke:release:mac`
5. `accept:packaged-recovery:mac`
6. `accept:product-surfaces:mac`
7. `accept:release:mac-preflight`

## Product-Surface Smoke Intent

- External Access: verifies the no-connector state still communicates authorization boundaries and keeps connection actions disabled.
- Decisions: verifies pending decisions render as a judgment center and can be resolved through the packaged UI.
- Task files: verifies the task file explorer opens a persisted task file, classifies it as a normal file, saves through the packaged UI, and persists to SQLite.

## Known Boundaries

- Signing and notarization are intentionally reported by preflight rather than faked locally.
- Live provider and Docker-backed mutation paths remain opt-in because they need external credentials or host capabilities.
- The smoke suite does not attempt exhaustive UI layout verification; it protects high-value real workflows only.
