# Project Status

## Current Stage

Taskplane is a local-first desktop workbench prototype with the core control-plane loop in place:

- task capture, recovery, state transitions, and task-side objects
- decisions, runs, artifacts, briefs, source context, blockers, dependencies, completion criteria, and process templates
- Electron main-process ownership for SQLite, keychain, AI execution, scheduler, and IPC
- renderer work surfaces for Home, Tasks, Decisions, Runs, and Settings
- local verification through tests, type-checking, and production build

The project is past initial architecture assembly. Current work should favor product validation, flow tightening, and release readiness over broad feature expansion.

## Recently Stabilized

- Config loading now tolerates corrupt legacy settings and validates stored provider / feature-flag values.
- AI keychain config has focused coverage for config-path reporting, legacy key migration, save behavior, and missing API-key runtime errors.
- Repository utilities and test helpers are shared instead of duplicated across many files.
- Bulk repository lookup guards are covered for empty task-id lists.
- Timeline payload parsing, recent-change typing, and repository helper logic have been consolidated.
- Local verification fallback is documented for periods when GitHub Actions is unavailable because of monthly quota.
- Local `.env` AI configuration now supports Replicate-backed draft runs; a deliberate local Replicate run completed with `output_source=ai`, timeline events, and a persisted artifact.
- Task detail now has a compact section jump bar for Current, Completion, Action, Activity, and Context Studio; a packaged app pass confirmed it can jump from Context Studio back to Action Desk.
- The front task-management closeout loop is covered through packaged UI: a task can add and satisfy a completion criterion, Home surfaces it as ready to close, Action Desk prioritizes `completed`, and SQLite records the final transition.
- Agent execution layer Phase 1 has started: Runs now have a persisted step trace spine, current text runs write plan/model/final steps through a `RunOrchestrator`, agent run requests now have a typed working-context/policy contract, the internal tool registry can inspect task context, inspect recent task timeline, create local note artifacts with tool call/result steps, and use explicitly policy-gated read-only workspace search/file-read tools from a configurable workspace root surfaced in Settings and resolved dynamically at tool execution time, `agent` prompts now ask for a constrained JSON step proposal with workspace tools only when the run opts in, agent runs pass model output into an `AgentRunLoop` skeleton with a typed local observe-then-write step plan, fallback parser, visible plan-source run step, policy-gated workspace read steps, persisted readable and structured tool-observation summaries, an observation-aware planner gate before local writes, persisted paused/review-needed run outcomes with resume checkpoints, and enforced read-only observation steps before local writes, confirmation-required tools now create run checkpoints instead of executing, map those checkpoints into pending Decisions with explicit source metadata, approved checkpoint Decisions can resume the pending local tool, deferred/cancelled confirmations settle the run as non-resumable, paused resume checkpoints can be continued from the Runs and Tasks pages with visible failure feedback, the current local agent loop now sits behind an `AgentExecutor` adapter boundary with run-scoped session capability metadata and terminal session status surfaced in run detail, completed agent sessions return their final output instead of raw proposal JSON, Tasks/Runs agent trigger forms can explicitly enable read-only workspace context per run, and the Runs / Decisions pages show checkpoint-aware summaries with readable agent-plan wording.
- The packaged read-only workspace agent path has been manually repeated with isolated user data and workspace root: a packaged `agent` run completed with `fileContext=true`, workspace search/read observations, note/run-output artifacts, and no open checkpoints.
- Run checkpoint payloads now have versioned v1 helper shapes for tool-permission and resume checkpoints, while old JSON payloads remain readable.
- The first local-write execution slice is in place but not model-exposed: `workspace.write_patch` requires explicit local file-write policy, creates a confirmation checkpoint with a diff preview, and applies only after the linked Decision is approved.

## Verification Baseline

Use local verification as the source of truth while GitHub Actions is disabled:

```bash
npm run verify
```

Latest local baseline:

- 44 test files
- 314 tests
- TypeScript checks
- production renderer build
- Electron main-process build
- build smoke check
- macOS package and runtime smoke checks for the unpacked app, including ASAR contents and isolated startup

Run `npm run smoke:build` when package, build, Electron entrypoint, or packaging configuration changes. Run `npm run smoke:release:mac` for the combined unsigned macOS package path.

## Current Risks

- GitHub Actions is intentionally unavailable for the rest of the monthly quota window, so remote CI should not be manually dispatched or watched.
- The product surface is already broad; more feature work should be tied to a concrete user flow or alpha acceptance criterion.
- README and testing documentation are comprehensive but long, so future docs should prefer concise status and decision notes over expanding the feature inventory.
- Dependency upgrades that touch Electron or Vite should stay out of opportunistic cleanup work and go through a dedicated upgrade pass.
- Signed/notarized release coverage is still manual and deferred; local smoke checks plus isolated dev and packaged-app passes are the current substitute.

## Recommended Next Focus

1. Keep signed/notarized release work deferred until a dedicated release-readiness pass targets signing and notarization.
2. Keep using `npm run verify` after ordinary changes and `npm run smoke:build` for build/package changes.
3. Defer GitHub Actions work until quota is restored.
4. Avoid adding new domain objects until the release-readiness pass is cleaner.
5. Manually exercise the confirmation-gated `workspace.write_patch` approval path before exposing write access in prompts or UI.

See [ALPHA_ACCEPTANCE.md](ALPHA_ACCEPTANCE.md) for the manual checklist and [ALPHA_ACCEPTANCE_ASSESSMENT.md](ALPHA_ACCEPTANCE_ASSESSMENT.md) for the current coverage assessment.
See [AGENT_EXECUTION_LAYER_DESIGN.md](AGENT_EXECUTION_LAYER_DESIGN.md) for the next execution-layer design spine.
