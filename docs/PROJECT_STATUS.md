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
- `npm run accept:agent-local` now combines the non-live agent acceptance checks
  for workspace patch approval, domain task tools, provider-native tool-call
  boundaries, and sandbox-coding guardrails without calling external providers.
- `npm run accept:sandbox-coding` now provides a focused non-live gate for the
  disabled sandbox provider contracts, local-container command planning,
  sandbox patch-review persistence/adapter/factory, and session metadata
  readiness summaries without calling Docker.
- Agent run forms now preview provider/session capability before execution, including text-only planning, read-only workspace context opt-in, task update/evidence tool opt-in, structured tool-call deferral in the local executor, patch/command unavailability, and provider-specific wording for Replicate versus the local text-only executor path.
- Provider-native structured tool calls remain deliberately deferred behind a decision gate: provider responses must be normalized into the existing `AgentStepProposal` / `AgentToolRegistry` path before any run can persist `structuredToolCalls=true`.
- A shared provider capability descriptor gives renderer and adapter work a single descriptive source for unconfigured, local text-executor, fal/OpenRouter, OpenAI-compatible, and Replicate native text paths while keeping structured execution behind the explicit provider-native rollout gate.
- A provider tool-call normalizer defines the adapter output shape and fails closed for malformed, mixed valid/invalid, or raw provider payloads, so provider-native responses can become executable steps only after dedicated adapter translation and session-gate approval.
- The OpenAI-compatible chat-completion-style adapter can normalize `tool_calls` into Taskplane proposals with JSON argument validation, fails closed for malformed tool-call envelopes, and is now part of the gated provider-native session path.
- The Anthropic Messages-style adapter can normalize `tool_use` content blocks into Taskplane proposals with object-input validation, fails closed for malformed or unsupported content blocks, and is available through the same gated provider-native dispatcher.
- A shared provider-native dispatcher routes Anthropic, OpenAI, OpenAI-compatible, and fal/OpenRouter payloads to those adapters while keeping Replicate fail-closed; execution still requires the reserved flag, successful normalization, and the RunOrchestrator session gate.
- `featureFlags.enableProviderNativeToolCalls` is now active as a default-off rollout flag for the gated provider-native session path; fallback sessions still persist `structuredToolCalls=false`.
- Provider-native structured tool-call wiring follows the staged rollout plan: offline fixtures, shadow normalization, parser parity, explicit provider-native sessions, and guarded live validation.
- The first shadow-normalization helper can summarize skipped/observed/failed provider-native tool-call adapter outcomes without exposing executable `AgentStepProposal` objects, and RunOrchestrator can now write a diagnostic-only shadow step when the reserved flag is enabled and a minimal provider payload exists.
- Text generation now has a result-shaped helper that preserves the existing text-only API while optionally carrying a minimal provider response-body or AI SDK standard `toolCalls` payload for provider-native observation and execution gates.
- `LocalAgentExecutor` now has a provider-native session entry that can pass a normalized provider proposal through the same `AgentRunLoop`, and RunOrchestrator selects it only when the provider-native session gate passes.
- A provider-native session gate captures the RunOrchestrator selection requirements: agent run type, reserved flag, supported provider, provider payload, and successful normalization are all required.
- Provider-native safe-read tool schema exposure has started behind the reserved flag: Taskplane-owned provider-safe tool aliases can normalize back into internal tool names, the schema builder exposes only policy-allowed safe-read tools while excluding local write and command tools, and AI SDK receives those schemas without local execute handlers.
- Agent capability previews now distinguish disabled provider-native structured calls from the limited safe-read provider-tool path when the reserved flag is enabled.
- RunService integration coverage now persists the provider-native session boundary: a gated provider-native session with `structuredToolCalls=true`, including the common textless provider `tool_calls` response shape, a missing-payload fallback session with `structuredToolCalls=false`, a policy-denied provider-native task-tool proposal that falls back without mutating the task, and provider-native workspace write/command proposals that fall back without creating checkpoints or changing files.
- A focused `npm run accept:provider-native-tools` command now exercises the provider-native adapter, schema, gate, run-loop, orchestration, and persistence boundary without calling external providers.
- `npm run accept:provider-native-live:preflight` now checks local `.env` readiness for live provider-native validation without printing API keys or calling external providers.
- `npm run accept:provider-native-live` now runs the guarded one-call provider-native tool-call probe only when preflight is ready; unsupported local configs skip without spending provider credit.
- A live fal OpenRouter relay pass has validated the provider-native safe-read tool-call probe with `google/gemini-2.5-flash`: the relay returned a matching `taskplane__task__inspect_context` tool call, and fal/OpenAI-compatible relays now use the AI SDK chat-completions model path instead of the OpenAI Responses path.
- `npm run accept:provider-native-live:run` now validates a real provider safe-read tool-call payload through an isolated RunService database; the gated session persists `structuredToolCalls=true` and executes the read-only observation step without touching user data.
- Shared agent-session metadata helpers now define both current local executor metadata and provider-native metadata without persisting raw provider payloads.
- Runs detail now surfaces concise agent session metadata, including provider raw summaries, alongside capability summaries so provider-native sessions can be inspected without exposing raw provider payloads.
- The first domain-shaped task tools are in the registry and can be prompt-exposed only through the explicit per-run `allowTaskMutationTools` opt-in: `task.update_next_step` routes through `TaskService.update`, `task.create_completion_criterion` routes through `TaskService.createCompletionCriteria`, `task.review_completion_evidence` reviews completion status and recent evidence without mutating criteria or task state, `source_context.create` routes through `TaskService.createSourceContext`, and `decision.draft` routes through `DecisionService.draft` without creating a formal Decision. High-risk task completion-criterion creation now pauses into a checkpoint/Decision before mutating the task, and approval resumes the pending criterion creation. These tools write run-step observations, and normal agent plans still fall back if a model proposes them without the opt-in.
- A focused `npm run accept:domain-agent-tools` command now exercises those registry-only domain tools through real SQLite repositories without exposing them to normal model plans.
- The first command-execution slice is in place but not model-exposed: `workspace.run_command` requires explicit local command policy, accepts only allowlisted `test` / `lint` package scripts, creates a confirmation checkpoint with command preview, and resumes once after the linked Decision is approved.
- The first tool-exposure decision is implemented for domain-shaped task tools; workspace write and command prompt exposure remains deferred.
- The workspace-tool checkpoint review tier is complete on the existing Runs and Decisions surfaces; patch and command tools remain registry-only.
- [AGENT_EXECUTION_LAYER_V2_DECISION.md](AGENT_EXECUTION_LAYER_V2_DECISION.md)
  is accepted as the next execution-layer boundary: first formalize typed
  runtime events, restart-safe resume, and the registry/exposure/policy matrix;
  keep workspace write/command, browser/computer control, external posting, and
  autonomous scheduling deferred.
- [AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)
  records the re-assessed execution-layer reference architecture: Pi is now
  evaluated separately as the inner-loop reference, OpenClaw as the embedding
  and gateway reference, and LangGraph/OpenHands/SWE-agent/Plandex/CrewAI/MCP
  plus secondary frameworks as pattern sources. Taskplane should keep its own
  Task/Run/Decision/Artifact/Timeline control plane; Slice 0 implements
  Pi-like inner-loop ideas in Taskplane-owned code without embedding Pi as a
  runtime dependency or claiming Pi compatibility.
- [AGENT_EXECUTION_TASK_BREAKDOWN.md](AGENT_EXECUTION_TASK_BREAKDOWN.md)
  now records the completed Slice 0 execution-layer pass: runtime events,
  event-driven RunStep projection, checkpoint normalization, restart-safe
  resume validation, centralized tool exposure gates, sandbox boundary, and
  future execution design.
- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
  keeps broad host-process code-agent mode deferred, while clarifying that AI
  programming and creator/self-media automation are target product scenarios
  that should enter through sandboxed runs, artifacts, checkpoints, and
  Decisions.
- [AGENT_EXECUTION_FUTURE_DESIGN.md](AGENT_EXECUTION_FUTURE_DESIGN.md)
  captures the post-Slice-0 design for a `SandboxProvider`, coding-agent patch
  artifacts, creator artifact/review lanes, side quests, replay/idempotency,
  human feedback routing, and future MCP constraints.
- [AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md](AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md)
  defines the shared scaffold for MCP, browser/Playwright, skills,
  computer-use, workspace coding tools, and creator connectors: reserve common
  descriptors, exposure policy, execution policy, tool sessions, artifacts,
  and checkpoints before enabling each lane.
- `src/shared/agent-tool-scaffold.ts` now starts Slice 5 in code by defining
  shared tool scaffold descriptors, families, session kinds, artifact kinds,
  checkpoint kinds, credential policies, and hidden reserved descriptors for
  future workspace coding, browser/Playwright, MCP, skills, computer-use, and
  creator connector lanes. It also defines conservative execution-policy,
  tool-session, artifact, and checkpoint metadata contracts without enabling
  new runtimes or exposing new tools.
- `src/shared/agent-sandbox-provider.ts` now starts Slice 6 by defining the
  disabled-by-default `SandboxProvider` contract, sandbox capability metadata,
  staged workspace mount shape, targeted `test` / `lint` command policy,
  session request/handle/result types, and patch artifact shape without
  enabling a sandbox runtime.
- `TempWorkspaceSandboxProvider` now provides the first local sandbox smoke
  path: it creates and disposes an isolated staging root, writes only session
  metadata there, performs no command execution, passes no credentials, and
  leaves the source workspace unchanged.
- Sandbox patch artifact helpers now normalize changed files, diff previews,
  command logs, risk summaries, and generic artifact descriptors for future
  Decision review without applying or promoting file changes.
- Sandbox targeted-check helpers now build allowlist-only `test` / `lint`
  plans and summarize check results without executing commands.
- Sandbox patch-promotion helpers now build `patch_promotion` checkpoint
  descriptors with reason, consequence, preview, resume target, and policy
  snapshot without applying the patch or touching the workspace.
- Agent session metadata and capability summaries now explicitly report the
  sandbox coding lane as disabled, so reserved sandbox contracts cannot be
  mistaken for an enabled code-agent execution path.
- Run checkpoint contracts and `AgentCheckpointRecorder` now recognize
  Decision-linked sandbox `patch_promotion` checkpoints, giving future patch
  artifacts a reviewable/auditable promotion shell without applying staged
  files.
- Decision approval coverage now locks `patch_promotion` into the safe
  non-automatic path: approval resolves the checkpoint and records that
  auto-rerun/promotion is not yet supported, without executing workspace tools.
- The sandbox coding-agent lane now has a default-off configuration gate,
  `TASKPLANE_ENABLE_SANDBOX_CODING_AGENT`, surfaced in Settings status while
  remaining disabled unless explicitly set for execution-layer development.
- A shared sandbox coding-lane eligibility helper now requires the rollout
  flag, a fully capable sandbox provider, workspace root, non-credentialed
  sandbox execution policy, disabled network, and non-interactive test/lint
  command policy before any future staged-patch entrypoint can be considered
  available.
- The temp-workspace sandbox provider now exposes its eligibility through that
  shared gate and remains correctly blocked for coding-agent sessions because
  it does not yet support targeted checks or patch artifacts.
- Local agent session metadata now records sandbox eligibility when the sandbox
  coding-agent flag is enabled, including blocked reasons from the temp
  provider gate instead of implying the lane is available.
- Pre-run agent capability previews now distinguish the disabled sandbox
  coding lane from the rollout-gated state where eligibility still has to pass.
- Sandbox sessions now have a shared manifest shape, and the temp-workspace
  provider writes `session.json` with run/task ids, workspace mount, provider
  capabilities, command policy, and execution policy for later audit/artifact
  attachment without running commands or copying source files.
- Sandbox session manifests now have a compact summary helper for future
  RunStep/Artifact display without expanding raw policy JSON.
- The temp-workspace sandbox provider can now summarize a prepared session from
  its manifest, keeping future run-step copy decoupled from raw JSON structure.
- A gated temp sandbox coding-session prepare helper now returns `blocked`
  without creating a staging root when eligibility fails, keeping future entry
  points behind the shared guard.
- The roadmap now names the next Slice 6 implementation target explicitly: a
  real sandbox provider backend that supports targeted checks and patch
  artifacts before any coding-agent UI/prompt exposure.
- Shared sandbox backend readiness contracts now describe candidate backend
  requirements and explicitly reject host-process or incomplete profiles before
  they can be treated as provider implementations.
- Provider capabilities for a real sandbox backend now derive from a ready
  backend profile, so incomplete candidates cannot be promoted into a coding
  provider capability set by hand.
- Backend profiles now have compact readiness summaries for future
  Settings/status/run-step copy without expanding raw backend detail.
- Sandbox backend probes are now distinct from backend profiles: unavailable
  probes preserve a reason and never become a provider profile, while available
  probes can feed readiness evaluation.
- A pure local-container backend probe adapter now maps an external container
  availability signal into the shared probe/profile/readiness flow without
  calling Docker or running user code.
- The local-container backend now has a read-only Docker version probe function
  with injectable runner coverage; it is not wired to app startup and does not
  mount workspaces or execute user scripts.
- Settings status now exposes sandbox backend status as `未检测` by default;
  no Docker probe is triggered by opening Settings or reading AI config status.
- Settings now has an explicit manual `检测 Sandbox Backend` action wired
  through IPC. It runs the read-only local-container backend probe only when
  clicked, updates the visible backend readiness summary, and still does not
  enable the sandbox coding lane or run workspace commands.
- Sandbox backend readiness can now be converted into sandbox coding-lane
  eligibility through the shared guard, and Settings shows that separate lane
  summary so a ready backend is not mistaken for rollout approval.
- The local-container sandbox backend now has a pure Docker command-plan
  builder for future targeted `test` / `lint` checks. It produces auditable
  `docker run` arguments with network disabled, no environment/credential
  passthrough, the source workspace mounted read-only, and the sandbox staging
  root mounted writable, but it still does not execute Docker or user scripts.
- Local-container check-result normalization now exists behind an injected
  runner boundary, converting mocked command outcomes into sandbox check
  results with output limits; no default Docker execution path is wired.
- Multiple local-container check plans can now be run sequentially through the
  same injected runner boundary, preserving both passing and failing
  `test` / `lint` outcomes for later RunStep and patch-artifact attachment.
- Sandbox patch artifacts can now be built directly from sandbox check results,
  carrying command logs and a compact check summary into the later
  Decision-review artifact without applying files.
- A local-container Docker runner factory now exists behind an explicit
  dependency-injection boundary. It preserves empty env, timeout, and output
  limits, but remains unwired from startup, Settings, and model-visible runs.
- `LocalContainerSandboxProvider` now provides the first explicit backend
  adapter shape: it prepares/disposes sandbox sessions, writes supported
  manifest metadata, and can run targeted checks only through an injected
  runner. It is not connected to RunOrchestrator or prompt/UI exposure.
- A local-container patch-review preparation skeleton now composes session
  preparation, targeted checks, sandbox patch artifact creation, and a
  `patch_promotion` checkpoint descriptor without applying files or wiring the
  path into product execution.
- Patch-review preparation now runs the shared sandbox coding-lane eligibility
  gate before creating a session, so disabled rollout flags, unsafe policies,
  or missing workspace roots block before any staging directory is created.
- Patch-review preparation now disposes the prepared sandbox session if checks
  or artifact construction fail, so failed internal preparation does not leave
  a staging directory behind.
- Sandbox patch-review persistence now has an internal boundary that records
  session/check/artifact RunSteps, persists a `patch` artifact, and delegates
  Decision-linked `patch_promotion` checkpoint creation to
  `AgentCheckpointRecorder` without exposing the path to UI or models.
- Failed sandbox checks are persisted as failed check RunSteps and patch
  artifacts without creating a promotion checkpoint, so a failing sandbox run
  cannot accidentally enter the Decision promotion path.
- A `SandboxPatchReviewRunAdapter` now wraps the internal preparation and
  persistence path into a run-level result shape (`blocked`, `persisted`, or
  `failed`) while staying unconnected to UI, prompts, scheduler, or automatic
  execution.
- A sandbox patch-review service factory now gives future orchestration code a
  discoverable adapter resolution point. It remains disabled by the sandbox
  coding-agent feature flag and, when enabled, only returns an adapter for
  explicit runner calls; the factory does not create a container runner or wire
  the path into automatic execution.
- Local agent session metadata now records the sandbox patch-review adapter
  resolution (`disabled` or `available`) and reason, so Runs detail can expose
  the internal readiness signal without adding a UI action, model-visible tool,
  or automatic sandbox execution path.
- Sandbox patch-review run requests now have a pure internal builder that
  constructs the staged session request, targeted check plan, idempotency key,
  and audit fields for later manifests without executing commands or exposing
  a UI/model entrypoint.
- Sandbox session summaries now include compact audit identity and idempotency
  when a request carries audit metadata, without expanding raw policy or patch
  data into RunStep-facing text.
- Sandbox patch-review run planning now has a pure ready/blocked planner that
  combines feature-gate availability, request/audit construction, normalized
  patch-draft metadata, and Decision title selection without returning an
  adapter, runner, UI action, or executable command path.
- A `SandboxPatchReviewPlanningService` now provides the internal-only query
  boundary for that planner, giving future orchestration code a stable preview
  entrypoint without constructing adapters, runners, UI actions, or model
  tools.
- Local agent session metadata now includes the internal sandbox patch-review
  plan preview status and reason. RunOrchestrator records this diagnostic by
  querying the planning service with an empty patch draft, so it remains
  blocked until a real internal patch draft exists and still does not construct
  an adapter, runner, UI action, or model tool.
- `SandboxPatchReviewPlanningService.previewLocalNoteDiagnostic()` now makes
  that local-note restriction explicit: regular local agent sessions can only
  record a blocked sandbox patch-review diagnostic, even when the sandbox flag
  is enabled, because they do not carry an internal patch draft.
- [AGENT_EXECUTION_PATCH_DRAFT_SOURCE_DECISION.md](AGENT_EXECUTION_PATCH_DRAFT_SOURCE_DECISION.md)
  now defines the first-principles and reference-architecture boundary for
  future internal patch draft sources: ordinary local-note runs,
  provider-native payloads, host-process patch/command tools, and untrusted MCP
  output cannot directly create a ready sandbox patch-review plan.
- `SandboxPatchDraftSource` now has a source-local validator for the future
  execution lane: it accepts only typed sandbox/imported/side-quest/normalized
  connector sources, normalizes changed files and checks, and blocks local-note,
  provider-native, host-process, path-traversal, credential-passthrough, and
  non-Decision-promotion payloads before they can feed review planning.
- `SandboxPatchReviewPlanningService.previewFromSource()` now connects that
  validated source boundary to the existing non-executing run planner, with an
  optional selected-workspace match check and no adapter, runner, model tool, or
  UI-visible coding entrypoint.
- Sandbox patch-review request audit now carries optional patch draft source
  identity into idempotency keys and session manifest summaries, so future
  resumable review runs can trace a ready plan back to the validated source
  that produced it.
- Sandbox patch-review artifact content now stores an envelope with the patch
  artifact plus review metadata: sandbox session id, session summary, and
  optional audit/source identity. This keeps persisted review artifacts
  recoverable without changing the artifact table schema.
- Execution-layer planning docs now mark the patch draft source boundary as
  implemented and move the next task to designing the first real internal
  producer: sandboxed coding session output that can create a validated source
  without exposing broad coding powers to the normal model loop.
- [AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md](AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md)
  now drafts that first producer design: prepared sandboxed coding session,
  narrow ACI-style tools, staged writes, changed-file/diff collection, evidence
  summaries, source validation, and Decision-linked patch promotion. The next
  code work is non-live producer scaffolding, not UI exposure.
- `SandboxedCodingProducerRequest` now starts that non-live scaffolding with a
  pure validator for source/run/task/workspace identity, intent, sandbox-only
  tool exposure, allowlisted `test` / `lint` checks, bounded command policy,
  no credential passthrough, and Decision-required promotion. It does not start
  a model loop, runner, sandbox backend, or UI entrypoint.
- A non-live staged patch collector now converts text files from a sandbox
  staging root into a bounded patch draft by comparing against the selected
  workspace. It blocks staging roots inside the workspace, leaves workspace
  files untouched, and still does not run a model, command runner, backend, or
  UI entrypoint.
- Producer scaffolding now has a non-live source/preview bridge: a validated
  producer request plus staged patch draft can build a validated
  `SandboxPatchDraftSource` and preview the existing sandbox patch-review plan
  through `previewFromSource()`, still without starting a model loop, runner,
  sandbox backend, or UI entrypoint.
- `AgentCheckpointRecorder` now owns tool-permission and resume checkpoint
  persistence and returns canonical `checkpoint.created` events for callers to
  emit, while `agent-tool-exposure` centralizes text-prompt and provider-native
  tool visibility rules.
- Restart-safe checkpoint Decision handling is now covered at integration level:
  approved workspace-patch checkpoints resume after a database/service restart,
  while deferred or cancelled checkpoint Decisions settle the run as
  non-resumable without mutating workspace files.
- Home Recent Activity now routes cancelled Decisions through an explicit
  `重新评估决策` recovery action, matching the existing Home recommendation
  semantics and steering the user toward an alternative next step.
- The first user-facing registry-tool opt-in remains the existing task
  update/evidence toggle; workspace patch and command tools stay
  registry/checkpoint-review only until manual review shows repeated friction.
- `npm run release:mac:preflight` now provides a read-only local check for
  macOS signed/notarized release prerequisites: Developer ID signing source,
  `notarytool`, Apple notarization env vars, and package metadata. It does not
  sign, notarize, upload, or call Apple services.

## Verification Baseline

Use local verification as the source of truth while GitHub Actions is disabled:

```bash
npm run verify
```

Latest local baseline:

- 81 test files
- 588 tests
- TypeScript checks
- production renderer build
- Electron main-process build
- build smoke check
- macOS package and runtime smoke checks for the unpacked app, including ASAR contents, isolated startup, and packaged SQLite schema initialization
- `npm run smoke:release:mac` passed locally on 2026-04-25 for the combined
  unsigned macOS package path
- `npm run accept:agent-local` passed locally after adding the sandbox-coding
  acceptance gate
- `npm run accept:provider-native-live:preflight` reports the current local
  provider-native setup is ready; live provider validation remains opt-in
  because it spends configured provider credit
- `npm run verify` passed locally on 2026-04-26 after adding the sandbox
  patch-review request builder, audit persistence coverage, and non-executing
  run-plan/planning-service layer plus the explicit blocked local-note
  diagnostic guard: 78 test files / 564 tests
- `npm run verify` passed locally on 2026-04-26 after adding the
  `SandboxPatchDraftSource` validator boundary: 79 test files / 569 tests
- `npm run verify` passed locally on 2026-04-26 after connecting
  `previewFromSource()` to validated patch draft sources: 79 test files / 572
  tests
- `npm run verify` passed locally on 2026-04-26 after carrying patch draft
  source identity into sandbox audit/idempotency metadata: 79 test files / 574
  tests
- `npm run verify` passed locally on 2026-04-26 after adding
  `SandboxedCodingProducerRequest` validation: 80 test files / 579 tests
- `npm run verify` passed locally on 2026-04-26 after adding the non-live
  sandboxed coding staged patch collector: 81 test files / 584 tests
- `npm run verify` passed locally on 2026-04-26 after adding the non-live
  producer source/preview bridge: 81 test files / 588 tests
- `npm run release:mac:preflight` currently reports the host has `notarytool`
  and package metadata, but is not ready for signed/notarized release because
  Developer ID and Apple notarization credentials are not configured

Run `npm run smoke:build` when package, build, Electron entrypoint, or packaging
configuration changes. Run `npm run smoke:release:mac` for the combined
unsigned macOS package path. Run `npm run release:mac:preflight` before a
dedicated signed/notarized release pass.

## Current Risks

- GitHub Actions is intentionally unavailable for the rest of the monthly quota window, so remote CI should not be manually dispatched or watched.
- The product surface is already broad; more feature work should be tied to a concrete user flow or alpha acceptance criterion.
- README and testing documentation are comprehensive but long, so future docs should prefer concise status and decision notes over expanding the feature inventory.
- Dependency upgrades that touch Electron or Vite should stay out of opportunistic cleanup work and go through a dedicated upgrade pass.
- Actual signed/notarized release execution is still deferred; local smoke checks,
  isolated dev and packaged-app passes, and the read-only release preflight are
  the current substitute.

## Recommended Next Focus

1. Keep actual signed/notarized release execution deferred until Developer ID
   signing and Apple notarization credentials are available.
2. Keep using `npm run verify` after ordinary changes and `npm run smoke:build` for build/package changes.
3. Defer GitHub Actions work until quota is restored.
4. Avoid adding new domain objects until the release-readiness pass is cleaner.
5. Treat the execution-layer Slice 0 pass as locally accepted for the alpha
   path; the next execution design task is shared tool scaffold contracts, then
   `SandboxProvider` plus a narrow coding-agent patch lane, still behind the
   accepted sandbox and exposure boundaries.

See [ALPHA_ACCEPTANCE.md](ALPHA_ACCEPTANCE.md) for the manual checklist and [ALPHA_ACCEPTANCE_ASSESSMENT.md](ALPHA_ACCEPTANCE_ASSESSMENT.md) for the current coverage assessment.
See [AGENT_EXECUTION_LAYER_DESIGN.md](AGENT_EXECUTION_LAYER_DESIGN.md) for the next execution-layer design spine.
