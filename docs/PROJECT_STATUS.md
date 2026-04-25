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
- Agent execution layer Phase 1 has started: Runs now have a persisted step trace spine, current text runs write plan/model/final steps through a `RunOrchestrator`, agent run requests now have a typed working-context/policy contract, the internal tool registry can inspect task context, inspect recent task timeline, review completion evidence without changing closeout state, create local note artifacts with tool call/result steps, and use explicitly policy-gated read-only workspace search/file-read tools from a configurable workspace root surfaced in Settings and resolved dynamically at tool execution time, `agent` prompts now ask for a constrained JSON step proposal with workspace tools only when the run opts in, agent runs pass model output into an `AgentRunLoop` skeleton with a typed local observe-then-write step plan, fallback parser, visible plan-source run step, policy-gated workspace read steps, persisted readable and structured tool-observation summaries, an observation-aware planner gate before local writes, persisted paused/review-needed run outcomes with resume checkpoints, and enforced read-only observation steps before local writes, confirmation-required tools now create run checkpoints instead of executing, map those checkpoints into pending Decisions with explicit source metadata, approved checkpoint Decisions can resume the pending local tool, deferred/cancelled confirmations settle the run as non-resumable, paused resume checkpoints can be continued from the Runs and Tasks pages with visible failure feedback, the current local agent loop now sits behind an `AgentExecutor` adapter boundary with run-scoped session capability metadata and terminal session status surfaced in run detail, completed agent sessions return their final output instead of raw proposal JSON, Tasks/Runs agent trigger forms can explicitly enable read-only workspace context and task update/evidence tools per run, and the Runs / Decisions pages show checkpoint-aware summaries with readable agent-plan wording.
- The packaged read-only workspace agent path has been manually repeated with isolated user data and workspace root: a packaged `agent` run completed with `fileContext=true`, workspace search/read observations, note/run-output artifacts, and no open checkpoints.
- Run checkpoint payloads now have versioned v1 helper shapes for tool-permission and resume checkpoints, while old JSON payloads remain readable.
- The first local-write execution slice is in place but not model-exposed: `workspace.write_patch` requires explicit local file-write policy, creates a confirmation checkpoint with a diff preview, applies only after the linked Decision is approved, and has tests for normal-run fallback plus workspace-boundary / expected-file rejection.
- A focused `npm run accept:workspace-patch` command now exercises the local patch approval path without exposing write access in the product UI.
- Agent run forms now preview provider/session capability before execution, including text-only planning, read-only workspace context opt-in, task update/evidence tool opt-in, structured tool-call deferral in the local executor, patch/command unavailability, and provider-specific wording for Replicate versus the local text-only executor path.
- Provider-native structured tool calls remain deliberately deferred behind a decision gate: provider responses must be normalized into the existing `AgentStepProposal` / `AgentToolRegistry` path before any run can persist `structuredToolCalls=true`.
- A shared provider capability descriptor now gives renderer and future adapter work a single descriptive source for unconfigured, local text-executor, fal/OpenRouter, OpenAI-compatible, and Replicate native text paths without enabling structured tool execution.
- A provider tool-call normalizer now defines the future adapter output shape and fails closed for malformed or raw provider payloads, so no provider-native response can become executable steps without a dedicated adapter translation.
- The first offline OpenAI-compatible tool-call fixture adapter can normalize chat-completion-style `tool_calls` into Taskplane proposals with JSON argument validation, but it is not wired into provider execution, RunOrchestrator, or persisted `structuredToolCalls=true` sessions.
- The first offline Anthropic tool-use fixture adapter can normalize Messages-style `tool_use` content blocks into Taskplane proposals with object-input validation, but it is likewise not wired into provider execution, RunOrchestrator, or persisted `structuredToolCalls=true` sessions.
- A shared offline provider-native dispatcher can route Anthropic, OpenAI, OpenAI-compatible, and fal/OpenRouter fixture payloads to those adapters while keeping Replicate fail-closed; it still does not enable provider-native structured tool calls in real runs.
- The first domain-shaped task tools are in the registry and can be prompt-exposed only through the explicit per-run `allowTaskMutationTools` opt-in: `task.update_next_step` routes through `TaskService.update`, `task.create_completion_criterion` routes through `TaskService.createCompletionCriteria`, `task.review_completion_evidence` reviews completion status and recent evidence without mutating criteria or task state, `source_context.create` routes through `TaskService.createSourceContext`, and `decision.draft` routes through `DecisionService.draft` without creating a formal Decision. These tools write run-step observations, and normal agent plans still fall back if a model proposes them without the opt-in.
- A focused `npm run accept:domain-agent-tools` command now exercises those registry-only domain tools through real SQLite repositories without exposing them to normal model plans.
- The first command-execution slice is in place but not model-exposed: `workspace.run_command` requires explicit local command policy, accepts only allowlisted `package.json` scripts, creates a confirmation checkpoint with command preview, and resumes once after the linked Decision is approved.
- The first tool-exposure decision is implemented for domain-shaped task tools; workspace write and command prompt exposure remains deferred.
- The workspace-tool checkpoint review tier is complete on the existing Runs and Decisions surfaces; patch and command tools remain registry-only.

## Verification Baseline

Use local verification as the source of truth while GitHub Actions is disabled:

```bash
npm run verify
```

Latest local baseline:

- 48 test files
- 363 tests
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
5. Keep workspace write/command prompt exposure deferred, and use [STRUCTURED_TOOL_CALLS_DECISION.md](STRUCTURED_TOOL_CALLS_DECISION.md) before adding provider-native structured tool-call execution.

See [ALPHA_ACCEPTANCE.md](ALPHA_ACCEPTANCE.md) for the manual checklist and [ALPHA_ACCEPTANCE_ASSESSMENT.md](ALPHA_ACCEPTANCE_ASSESSMENT.md) for the current coverage assessment.
See [AGENT_EXECUTION_LAYER_DESIGN.md](AGENT_EXECUTION_LAYER_DESIGN.md) for the next execution-layer design spine.
