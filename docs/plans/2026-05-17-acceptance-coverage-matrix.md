# Alpha Acceptance Coverage Matrix

Updated: 2026-05-26

This matrix keeps local alpha acceptance grounded in first principles: protect the durable task-management flows that make the product usable, and keep smoke coverage small enough that failures point to real product regressions instead of brittle script noise.

## Coverage

| Area | Current Coverage | Command / Evidence | Status |
| --- | --- | --- | --- |
| Unit, integration, type, renderer build | Full automated test suite, TypeScript checks, Electron/renderer build | `npm run verify` | Covered |
| Canonical local data health | Read-only diagnostics against the local SQLite database and canonical data contract when a local DB exists | `npm run diagnostics:canonical-data:optional` | Covered |
| Runtime and agent execution core | Agent lifecycle, checkpoints, runtime gates, provider-native tool adapters, sandbox coding orchestration, reviewed patch apply/recovery smoke | `npm run accept:agent-local` | Covered |
| Scheduled/event Agent sweep | Built main-process SchedulerService sweep path with Standing Approval, persisted plus in-sweep run-limit counting, duplicate-candidate blocking, bounded Code Agent trigger, timeline evidence, and no provider/Docker/workspace mutation | `npm run accept:scheduled-event-agent-sweep-smoke` | Covered, local non-live |
| Model-producer preflight | Verifies live-provider/Docker/workspace mutation gates before real execution | `npm run accept:sandbox-coding:model-producer-preflight` | Covered, environment-gated |
| macOS packaged runtime | Builds packaged app and checks config, database schema, task-dynamics replay UI, packaged boot | `npm run smoke:release:mac` | Covered |
| Packaged recovery paths | Brief recovery, project decomposition, right-panel context refresh preservation, work habits, code-agent UI, task-bound Agent CLI run/cancel/native-goal audit, run/decision recovery, settings config | `npm run accept:packaged-recovery:mac` | Covered |
| Supplemental product surface smoke | External Access empty/safety/fixture-connected/local-inbox state, Decisions judgment center, task file open/save | `npm run accept:product-surfaces:mac` | Added |
| Release readiness | Developer ID, notarization, artifact upload/network checks | `npm run accept:release:mac-preflight` | Covered, expected `not-ready` without credentials |
| Live provider execution | Real model-provider task execution | Provider-native live acceptance commands | Optional, requires credentials |
| Docker/local sandbox mutation | Real local-container sandbox execution | `TASKPLANE_ENABLE_LOCAL_CONTAINER_SANDBOX=true` preflight/live commands | Optional, requires Docker and explicit env |
| Real external connectors | Gmail/Calendar/GitHub style external access | Not in local alpha smoke | Deferred until connectors exist |
| Runtime-native goal discovery | Optional Codex/Claude native goal compatibility discovery | `npm run manual:agent-cli-native-goal-discovery` | Manual only; not a first-version gate; default probes help/version and candidate execution requires explicit env |
| Agent API execution preflight | Provider-visible Agent API text-call readiness without promoting task execution | `npm run manual:agent-api-execution-preflight-smoke` / `TASKPLANE_RUN_AGENT_API_EXECUTION_PREFLIGHT_SMOKE=true npm run manual:agent-api-execution-preflight-smoke` | Manual only; default skipped; passed locally on 2026-05-26 with fal-openrouter / google/gemini-2.5-flash; full execution_run remains deferred |
| Packaged Codex live task run | Real local Codex account through packaged task panel with isolated app data and temporary workspace | `TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:agent-cli-task-live:mac` | Manual only; passed locally on 2026-05-20; default skipped |
| Packaged Claude live task run | Real local Claude Code account through the same packaged task panel smoke harness | `TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:claude-agent-cli-task-live:mac` | Manual only; default skipped until account readiness is available |

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
- Project decomposition and handoff: `smoke:project-decomposition:mac` verifies fresh projects do not get hard-coded child tasks before confirmation, persisted project child structure renders from SQLite, and completing one child can write completion/received Task Records plus `panel.completion_handoff` timeline events before opening the next child task.
- Context refresh preservation: `smoke:context-refresh:mac` verifies a task-bound right-panel discussion can be manually archived before refresh, with a Task Record, Source Context, and `panel.context_refreshed` timeline event persisted in SQLite before the chat context is cleared.
- Agent CLI task loop: `accept:packaged-recovery:mac` includes `smoke:agent-cli-task:mac`, which uses a fake Codex executable to verify task-bound execution evidence, cancellation evidence, Taskplane-owned `/goal` completion conditions in the run contract and memory proposal, task dynamics replay, native-goal audit evidence, and no workspace writes without requiring a live CLI account.
- Reviewed patch apply: `accept:agent-local` includes `accept:sandbox-coding:patch-promotion-apply-smoke`, which runs against built main-process modules and verifies default no-write approval, feature-flagged apply success, and blocked workspace-drift recovery evidence without Docker, packaged UI automation, or provider calls.
- Scheduled/event Agent sweep: `accept:agent-local` includes `accept:scheduled-event-agent-sweep-smoke`, which runs against built main-process modules and verifies the scheduler sweep checks one confirmed Standing Approval candidate, starts one bounded Code Agent run through the trigger port, records `panel.scheduled_event_agent_triggered`, keeps the workspace unchanged, and does not call a provider or start Docker.
- Agent API execution preflight: `manual:agent-api-execution-preflight-smoke` is opt-in and default-skipped. The default path reports `provider=not-called`, `executionRun=deferred`, and `workspace=unchanged`; the live path sends one minimal provider text request and verifies a disposable workspace stays unchanged. On 2026-05-26, it passed locally with `fal-openrouter / google/gemini-2.5-flash`, `provider=called`, `phrase=matched`, `workspace=unchanged`, and `status=passed`. This is provider-readiness evidence, not a packaged task execution path.
- Agent CLI packaged live loop: `manual:agent-cli-task-live:mac` is opt-in and default-skipped. After `npm run dist:mac:dir`, `TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:agent-cli-task-live:mac` launches the packaged app with isolated user data and a temporary workspace, injects the detected local Codex runtime, calls the user's real Codex account through the task panel, and verifies terminal output plus no workspace writes. The same harness can run Claude Code through `TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:claude-agent-cli-task-live:mac` when a local Claude account is ready. Both stay outside default acceptance because they may spend provider quota.

## Known Boundaries

- Signing and notarization are intentionally reported by preflight rather than faked locally.
- Live provider and Docker-backed mutation paths remain opt-in because they need external credentials or host capabilities.
- The smoke suite does not attempt exhaustive UI layout verification; it protects high-value real workflows only.
- Ordinary task context switches are covered by renderer/runtime-handoff tests and task-dynamics projection tests. A packaged task-switch smoke is intentionally deferred until the retained task detail UI exposes a stable cross-task navigation hook; otherwise the smoke would mostly test list navigation mechanics instead of the context-switch safety boundary.
- Agent API execution is represented only as a deferred runtime-entrypoint contract. It now has an opt-in provider-visible preflight smoke, but still has no packaged task execution smoke or IPC execution path in the first Agent CLI alpha; when implemented later it must satisfy the same `provider_visible_execution` harness gates as Agent CLI.
