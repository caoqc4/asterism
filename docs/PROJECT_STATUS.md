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
- Agent execution layer Phase 1 has started: Runs now have a persisted step trace spine, current text runs write plan/model/final steps through a `RunOrchestrator`, agent run requests now have a typed working-context/policy contract, the internal tool registry can inspect task context, inspect recent task timeline, review completion evidence without changing closeout state, create local note artifacts with tool call/result steps, and use explicitly policy-gated read-only workspace search/file-read tools from a configurable workspace root surfaced in Settings and resolved dynamically at tool execution time, `agent` prompts now ask for a constrained JSON step proposal with workspace tools only when the run opts in, agent runs pass model output into an `AgentRunLoop` skeleton with a typed local observe-then-write step plan, fallback parser, visible plan-source run step, policy-gated workspace read steps, persisted readable and structured tool-observation summaries, an observation-aware planner gate before local writes, persisted paused/review-needed run outcomes with resume checkpoints, and enforced read-only observation steps before local writes, confirmation-required tools now create run checkpoints instead of executing, map those checkpoints into pending Decisions with explicit source metadata, approved checkpoint Decisions can resume the pending local tool, deferred/cancelled confirmations settle the run as non-resumable, paused resume checkpoints can be continued only from Runs detail after an open resume checkpoint payload is loaded, while Task detail routes to Run evidence first, the current local agent loop now sits behind an `AgentExecutor` adapter boundary with run-scoped session capability metadata and terminal session status surfaced in run detail, completed agent sessions return their final output instead of raw proposal JSON, Tasks/Runs agent trigger forms can explicitly enable read-only workspace context and task update/evidence tools per run, and the Runs / Decisions pages show checkpoint-aware summaries with readable agent-plan wording.
- The packaged read-only workspace agent path has been manually repeated with isolated user data and workspace root: a packaged `agent` run completed with `fileContext=true`, workspace search/read observations, note/run-output artifacts, and no open checkpoints.
- Run checkpoint payloads now have versioned v1 helper shapes for tool-permission and resume checkpoints, while old JSON payloads remain readable.
- The first local-write execution slice is in place but not model-exposed: `workspace.write_patch` requires explicit local file-write policy, creates a confirmation checkpoint with a diff preview, applies only after the linked Decision is approved, and has tests for normal-run fallback plus workspace-boundary / expected-file rejection.
- `npm run accept:agent-local` now combines the non-live agent acceptance checks
  for workspace patch approval, domain task tools, provider-native tool-call
  boundaries, sandbox-coding guardrails, and the visible Code Agent
  UI/config/IPC preflight gate without calling external providers. The
  agent-runtime gate preserves the same coverage through sequential Vitest
  calls so lifecycle/recorder-heavy tests do not hold the combined local gate
  open after passing.
- `npm run accept:sandbox-coding` now provides a focused non-live gate for the
  disabled sandbox provider contracts, local-container command planning,
  Code Agent model-context boundaries, sandbox patch-review
  persistence/adapter/factory, and session metadata readiness summaries without
  calling Docker. The script runs 40 Vitest files / 260 tests in ten
  sequential batches so the focused sandbox-coding gate exits cleanly in the
  combined local agent acceptance path.
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
- [AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md](AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md)
  adds Multica as the control-plane bridge reference: runtime registry,
  agent-profile/runtime separation, queue/claim lifecycle, local daemon/provider
  wrapping, and skill-informed automation readiness. It keeps automatic start
  as a future policy outcome for mature workflows, not as a blanket assignment
  side effect.
- [AGENT_EXECUTION_ORCHESTRATION_PLAN.md](AGENT_EXECUTION_ORCHESTRATION_PLAN.md)
  now drafts the next orchestration layer sequence: start with read-only
  `ExecutionRuntime`, `AgentProfile`, `OrchestrationRequest`, and
  `AgentRunLifecycle` snapshots, then add request contracts and lifecycle
  vocabulary before any queue/claim worker or automatic-start policy.
- [AGENT_EXECUTION_ORCHESTRATION_UI_DESIGN.md](AGENT_EXECUTION_ORCHESTRATION_UI_DESIGN.md)
  now records the first read-only orchestration UI pass: shared
  runtime/profile/lifecycle/recovery presentation helpers are applied to Task
  detail, Runs detail, and Settings without adding queue workers, automatic
  starts, or new tool authority.
- The first read-only orchestration snapshot helper is in place: Settings can
  summarize the local sandbox runtime, manual Code Agent profile,
  manual/operator-started lifecycle, and hidden connector families. The Task
  detail Code Agent surface uses the same snapshot, without enabling
  queue/claim, scheduler starts, provider calls, or automatic starts.
- The O2 orchestration request contract has started in shared code: manual Code
  Agent preview input and operator-started Browser Evidence requests can now be
  wrapped into a common runtime/profile/policy/idempotency envelope, while
  `policy_auto`, scheduler starts, and automatic starts remain blocked. The
  existing Code Agent and Browser Evidence services now record that envelope in
  their accepted RunSteps as diagnostics without changing execution behavior.
- O3 is locally accepted with a shared lifecycle projection helper that maps current
  Run statuses into orchestration vocabulary. Runs detail now surfaces that
  projection while keeping queue, claim, and automatic-start behavior disabled.
- O4 is locally accepted with a shared skill-informed automation readiness evaluator:
  mature low-risk tasks can be marked `eligible` only when procedure, inputs,
  runtime readiness, risk, and completion boundaries are present, and the
  evaluator still returns `automaticStartAllowed=false`. Task detail now
  surfaces the evaluator summary in the Code Agent area as diagnostics only.
- O5 coding lane recovery is locally accepted at the UI/review-helper layer:
  Code Agent recovery summary formatting is shared for task-side staged patch
  review, keeping Run/Decision recovery wording reusable without exposing host
  shell, queue workers, or automatic starts.
- Code Agent sandbox-run and promotion-Decision detection also moved into the
  shared renderer capability helpers, so task-side recovery uses tested coding
  lane predicates instead of page-local heuristics.
- Code Agent rerun intent formatting is now shared between Task detail and Runs
  staged-patch review, preserving bounded prefilled rerun prompts without
  starting a run or spending provider credit.
- [CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md](CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md)
  is accepted for the first visible code-agent product surface: Task detail /
  Action Desk entrypoint, manual runtime readiness action, default available
  `test` / `lint` checks with user deselection, staged patch wording, failed
  checks still reviewable through an explicit patch-promotion Decision, and no
  automatic start until skill/process readiness policy exists.
- The first code-agent UI slice has started: Task detail / Action Desk now
  shows a passive `Code Agent Runtime` readiness block with a manual runtime
  check action. The surface starts in a not-checked state, reuses the existing
  sandbox backend probe on demand, and does not trigger a Run or producer
  execution. The Code Agent start gate now consumes the same producer backend
  readiness fact: a manual sandbox preview cannot start from the UI until
  `producerBackendReadiness.ready` is true, and the blocked reason is covered
  by shared renderer capability tests.
- The manual code-agent intent surface now shows a static `manual sandbox
  producer` AgentProfile, selected Task, completion criteria, patch intent,
  allowlisted `test` / `lint` toggles, and explicit Docker/Decision
  confirmation. The check toggles now come from a main-process read-only
  `workspaceRoot/package.json` script availability check, so missing `test` or
  `lint` scripts are shown as unavailable and are not sent in the run payload;
  the `run:triggerCodeAgent` IPC handler also rechecks availability before
  creating the Run. The same start gates now render a compact Code Agent
  preflight summary covering runtime readiness, selected checks, producer mode,
  context-file requirement, Decision promotion, and the next required action.
  It initially recorded only a local diagnostic; the dedicated manual sandbox
  preview IPC path is now wired for this surface.
- The orchestration UI work has started with a shared read-only presentation
  helper for `ExecutionRuntime`, `AgentProfile`, `AgentRunLifecycle`, hidden
  tool families, and automation readiness. It centralizes the no-queue,
  no-auto-start, and hidden-tool-family wording before Task detail / Runs
  detail / Settings are regrouped into fuller orchestration cards.
- Task detail now uses that shared presentation helper in a compact
  `Orchestration readiness` sub-card under the existing Code Agent intent
  surface. App tests assert the grouped card still says manual-only,
  queue/claim/scheduler/auto-start are disabled, hidden reserved tool families
  stay model-hidden, and the sandbox preview start gates are unchanged.
- Runs detail now projects sandbox producer sessions into an
  `AgentRunLifecycle` summary with source id, check policy, network/promotion
  constraints, blocked reasons, and next recovery/review moves. Sandbox
  producer steps now show readable check evidence, staged patch source
  readiness, and blocked/failed/paused diagnostics while preserving
  Decision-only workspace mutation.
- Runs detail now also groups lifecycle projection, restart hint, replay
  review, and next safe move into a `Run recovery safety` strip before the
  operator returns to task focus. This keeps the existing open-checkpoint gate
  for `继续 paused run` while making inspect-first recovery easier to scan.
- The recovery strip now includes a shared `Recovery intent` projection, so
  interrupted/stale or failed sessions are explicitly marked as
  `prepare new manual run`, checkpoint-backed sessions remain manual-resume
  only, and all paths keep `autoReplay=no`.
- When that intent requires a new manual run, `回到任务推进` now preloads the
  Task quick-run instructions with the latest evidence and recovery judgment,
  but still leaves run creation as an explicit user action.
- RunService and DecisionService now pass checkpoint-backed session updates
  through a shared settlement projection, so `running` sessions are treated as
  requiring executor liveness rather than being checkpoint-settled.
- The runtime event spine now has explicit executor liveness/interruption
  events. Heartbeats remain non-terminal running evidence, while interrupted
  and cancelled sessions write terminal RunSteps for inspect-first recovery.
- Runtime events now also have a shared session-status projection:
  interruption settles as `failed`, cancellation settles as `cancelled`,
  completion/pause keep matching statuses, and heartbeat does not mutate
  session status.
- `RunOrchestrator` now consumes recorder terminal-status projection during
  agent session settlement, so a terminal cancellation/interruption event can
  settle persisted session status even if the executor later returns a generic
  failed result.
- Local-note agent sessions now have dedicated coverage for the same
  terminal-event settlement boundary, so a cancellation event persists the
  session as `cancelled` even when the local executor later returns a generic
  failed result.
- The first executor lifecycle adapter contract is now shared and locally
  tested: `AgentExecutorSessionHandle` identifies a future real executor
  session, lifecycle signals map heartbeat, interruption, cancellation, and
  completed/failed/paused settlement into the existing runtime event spine, and
  heartbeat still does not mutate `AgentSession.status`. This is type/test
  coverage only; no long-running process, queue worker, automatic start, or new
  model-visible tool authority is enabled.
- Executor lifecycle control requests are now typed for heartbeat, interrupt,
  and cancel commands, then mapped into the same lifecycle signal/event spine.
  This gives future real adapters a clearer control API while remaining
  dry-run/test-only.
- Shared lifecycle helpers now build and list supported control requests, so
  dry-run handles and availability diagnostics use the same source for
  `heartbeat`, `interrupt`, and `cancel` support.
- Dry-run availability diagnostics can now be built with partial control
  support, allowing future status surfaces to report reduced control support
  without implying runtime readiness.
- The main-process executor boundary now has a dry-run lifecycle adapter that
  can create a controllable executor handle and observe lifecycle signals
  through that same runtime event spine. It is adapter-facing test coverage
  only; the current local/provide-native execution paths still run exactly as
  before, and no real long-running process is started.
- The dry-run lifecycle adapter start input can now override advertised
  control support, so partial heartbeat/interrupt/cancel handles can be tested
  without mutating returned handles or connecting a live runtime.
- Monitor, service, and factory guard coverage now uses that start-input
  partial support path, keeping unsupported-control tests aligned with the
  adapter contract.
- The dry-run lifecycle adapter now also accepts typed control requests and
  routes them through observation, so interrupt/cancel projections are covered
  without connecting a live executor.
- Lifecycle control requests now check the executor handle's advertised control
  support first; unsupported requests reject before any runtime event or
  RunStep evidence is recorded.
- That control-support guard is now shared by the lifecycle contract, so future
  real executor adapters can reuse the same fail-closed behavior instead of
  reimplementing page- or adapter-local checks.
- The dry-run lifecycle path now has a small monitor boundary that records
  observed lifecycle events through `AgentSessionEventRecorder`, producing
  heartbeat and cancellation RunStep evidence plus projected session status
  without directly settling `AgentSession` or launching a real runtime.
- The monitor/service boundary now exposes typed `controlAndPlan` handling for
  heartbeat, interrupt, and cancel requests, returning the same RunStep
  evidence and settlement-plan shape while still requiring explicit
  `applySettlementPlan` for any `AgentSession` write.
- Monitor/service coverage now confirms unsupported control requests propagate
  without creating RunStep evidence, settlement plans, or session status
  updates.
- The default lifecycle service factory now covers that typed control planning
  path, so the assembled dry-run service can inspect interrupt requests without
  applying status updates implicitly.
- Factory coverage now also confirms unsupported control requests fail closed
  in the assembled dry-run service before evidence recording or status writes.
- That monitor now also produces an explicit settlement plan:
  heartbeat observations remain `no_status_change`, while terminal lifecycle
  observations produce `update_session_status` recommendations for the service
  layer to apply deliberately. The plan keeps `autoReplay=no` and still does
  not write `AgentSession` directly.
- Lifecycle settlement plans now also have an explicit apply helper: it leaves
  `no_status_change` plans untouched and calls `AgentSessionStore.updateStatus`
  only for `update_session_status` plans. This keeps session writes opt-in at
  the service layer instead of hidden inside observation.
- The monitor can now return a planned observation in one call: RunStep
  evidence, projected status, terminal marker, and settlement plan travel
  together, while settlement application remains a separate explicit step.
- A small `AgentExecutorLifecycleService` now wraps the monitor and status
  updater as the future service-facing boundary: `observeAndPlan` records
  evidence and returns a plan without writing status, while
  `applySettlementPlan` performs the explicit status update only when called.
- A default factory can now assemble that lifecycle service from a dry-run
  adapter, `AgentSessionEventRecorder`, `RunStepRepository`, and
  `AgentSessionStore`. The factory is tested as an injection point only; it is
  not wired into bootstrap, IPC, scheduler, queue, or model-visible execution.
- The factory now also exposes a dry-run-only availability summary for future
  diagnostics: `runtimeReady=no`, `modelExposure=hidden`,
  `automaticStart=no`, and `queueWorker=no`.
- The availability summary now also exposes supported dry-run control requests
  (`heartbeat`, `interrupt`, `cancel`) with `controlMode=dry_run_planned`, so
  UI diagnostics can show the typed control API without implying runtime
  readiness.
- That availability summary now also carries structured blocked reasons and a
  next-action hint, so future diagnostics can explain that no real executor is
  connected, the service is not wired into runtime entrypoints, and
  model-visible exposure remains hidden.
- Shared executor lifecycle diagnostics now turn that dry-run availability
  into read-only presentation copy for Settings orchestration diagnostics,
  while staying outside bootstrap, IPC, scheduler, queue, and model-visible
  runtime wiring.
- Main-process AI config status now passively carries the same executor
  lifecycle availability fact, so Settings displays the runtime-boundary
  diagnostic from status data instead of constructing it locally.
- Task detail `Orchestration readiness` now also consumes that status-sourced
  executor lifecycle diagnostic, keeping the Code Agent intent surface aligned
  with Settings while preserving manual-only execution.
- Runs detail `Run recovery safety` now uses the same executor lifecycle
  diagnostic during inspect-first recovery review, making dry-run/runtime
  unavailability visible before any new manual run is prepared.
- Renderer orchestration presentation now has one helper for executor
  lifecycle diagnostic lines, so Settings, Task detail, and Runs recovery
  surfaces share the same read-only copy without repeating page-local strings.
- Executor lifecycle terminal observation state is now scoped by agent session
  id inside the recorder/monitor boundary, so a reused lifecycle service cannot
  let one terminal session pollute another session's heartbeat or inspect-first
  settlement diagnostics; the monitor also binds adapter lifecycle events to
  the current handle's session id before recording, so adapter events that omit
  `sessionId` still settle against the correct scoped session.
- Executor lifecycle settlement plans, diagnostics, and explicit apply results
  now carry structured `terminalEventRecorded` and `terminalSessionStatus`
  evidence fields alongside the summary text, so future IPC/renderer recovery
  callers can verify terminal evidence without parsing settlement copy.
- Recorder pending tool state is also scoped by agent session id, including a
  sessionless legacy bucket, so a scoped tool result cannot close an older
  sessionless tool start for the same run/tool name.
- `RunOrchestrator` now consumes those recorder terminal checks by current
  agent session id in both local-note and provider-native execution paths,
  keeping terminal-event de-duplication aligned with session-scoped recording.
- Agent session settlement projections now carry structured
  `requiresOpenCheckpoint` and `autoReplayAllowed=false` fields alongside their
  existing summary text, so checkpoint-backed settlement and terminal evidence
  review can be consumed without parsing copy.
- Agent session settlement projection now uses an exhaustive status switch
  instead of an unreachable fallback action, so future session-status additions
  must define checkpoint, liveness, or terminal-evidence semantics at compile
  time.
- Newly created tool-permission and resume checkpoints now carry
  `agentSessionId` in their payloads, and Run / Decision recovery settlement
  prefers that binding before falling back to legacy latest-session selection,
  preventing newer unrelated checkpoint-backed sessions from being settled by
  an older checkpoint action.
- Runtime-event checkpoint RunSteps now include the scoped agent `session=` in
  their review input when the event carries one, aligning readable Run evidence
  with the session-bound checkpoint payloads while keeping legacy sessionless
  events unchanged.
- Runtime-event paused-session RunSteps now do the same for `session.paused`
  evidence, keeping pause review tied to the agent session before any manual
  checkpoint resume.
- Agent session replay reviews now carry latest-step kind/status/title as
  structured fields alongside the existing summary text, keeping inspect-first
  recovery evidence available without parsing the `latest=` segment.
- Agent session replay reviews now distinguish total open checkpoints from
  recovery-relevant checkpoints: paused sessions only treat open `resume`
  checkpoints as resumable, while confirmation sessions only treat
  `confirmation`, `tool_permission`, and `patch_promotion` checkpoints as
  recovery-relevant and ignore unrelated `resume` or `external_wait`
  checkpoints. The structured `recoveryCheckpointCount` keeps recovery routing
  from treating an unrelated open checkpoint as manual-resume authority.
- Replay review checkpoint evidence now has a shared
  `AgentSessionReplayCheckpointEvidence` input type, keeping future renderer,
  IPC, or service callers aligned on the `status` plus optional checkpoint
  `kind` fields used for recovery selection.
- Replay review coverage now locks created-time tie-breaking when run-step
  indexes match, keeping latest-step recovery evidence deterministic for
  imported or repaired traces with duplicate indexes.
- Agent session recovery intents now carry structured session id, status,
  restart-safety, open-checkpoint count, and recovery-checkpoint count fields
  alongside the summary text, keeping manual-run and checkpoint routing
  available without parsing copy.
- Recovery intent objects now also expose `recoveryCheckpointRequired` as the
  status-neutral checkpoint gate, while the older `resumeCheckpointRequired`
  field remains for current callers that still use the legacy name. The
  recovery intent summary also carries `recoveryCheckpointRequired=yes/no` so
  Run review copy and structured fields stay aligned.
- Executor lifecycle availability now carries structured `controlMode` and
  `settleMode` fields, so dry-run-planned control/settle diagnostics are
  available before renderer presentation formatting; AI config status coverage
  now locks those mode fields plus supported control and settle lists at the
  status boundary.
- Executor lifecycle availability now also carries structured
  `unsupportedControlRequests`, and Task detail, Runs recovery, Settings, and
  shared presentation coverage render that fail-closed adapter fact explicitly
  without implying runtime readiness.
- Settings now presents orchestration as diagnostics, not execution: a compact
  `Orchestration Diagnostics` block shows the shared read-only summary,
  lifecycle, hidden-tool-family facts, and dry-run executor lifecycle status
  with blocked reasons and next action while keeping Sandbox Backend detection
  as the only runtime action.
- The shared orchestration presentation model now keeps profile and lifecycle
  copy single-pass, so Task detail and Settings do not repeat the same
  queue/claim/scheduler/auto-start facts inside one card.
- The manual Code Agent intent surface now also shows automatic start as
  disabled, with the future maturity/input/tool/risk/evidence/runtime policy
  signals listed explicitly and no scheduler or auto-run flag persisted.
- The dedicated Task detail Code Agent button now starts a real manual sandbox
  preview Run through `run:triggerCodeAgent`: it requires operator confirmation,
  carries only selected `test` / `lint` checks, invokes the local-container
  producer execution service, and opens Runs detail for lifecycle/source
  evidence review. The preview path writes only a staged diagnostic patch inside
  the sandbox through the same bounded staged-file plan validator reserved for
  model-backed producer output. The default manual path stays on the local
  diagnostic producer unless the env capability is enabled and the individual
  run explicitly selects model producer usage.
- Source-ready manual Code Agent previews now bridge into the existing patch
  review chain: ready plans persist a patch artifact, open `patch_promotion`
  checkpoint, and pending Decision. This gives the preview path a formal review
  object while still leaving workspace mutation impossible without a later
  approved promotion flow.
- Code Agent producer output now has a fail-closed staged-file contract before
  any live model wiring: only strict JSON plans with bounded workspace-relative
  text files can write to sandbox staging, while path escapes, sensitive files,
  duplicate paths, binary content, and oversized output are blocked.
- The first model producer loop adapter is in place and wired only behind the
  manual Code Agent run gate: it builds a strict staged-file prompt from the
  normalized sandbox request, accepts an injected `generatePlanText` function,
  validates generated JSON through the same staged-file contract, writes only
  accepted files to staging, and blocks malformed output before any staged
  write.
- Model-backed Code Agent previews now have a bounded workspace-context input
  path: the Task detail UI collects explicit workspace-relative context files,
  the main service reads only those selected text files from the configured
  workspace root, the prompt includes them as read-only evidence, and the
  backend blocks model-backed runs with absent, escaping, sensitive, binary,
  missing, or oversized context before producer execution. Provider config is
  not resolved for model-backed starts that have no bounded context files or
  have invalid selected workspace context.
- [CODE_AGENT_MODEL_CONTEXT_DECISION.md](CODE_AGENT_MODEL_CONTEXT_DECISION.md)
  records the next model-context boundary: locally available task/source/run
  data is not automatically provider-visible. Selected workspace files are
  accepted prompt evidence, selected source-context content is accepted only
  through explicit per-run stored-snapshot opt-in, and selected artifacts remain
  manifest-only. Retrieval snippets, Skills/MCP observations, browser evidence,
  and artifact/run-output content still require explicit future policy before
  entering provider prompts.
- The first provider-visible context manifest helper is in place for
  model-backed Code Agent runs. It records selected workspace-file context as a
  bounded RunStep manifest after the selected files pass local workspace
  boundary checks and before provider runtime config is resolved. It marks
  content inclusion per item: selected workspace files can be provider-visible
  prompt evidence, while selected source-context ids/titles are manifest-only by
  default and selected artifacts are manifest-only audit entries. Browser, MCP,
  Skill, retrieval, and artifact/run-output content remain outside provider
  prompts.
- The source-context content gate is now wired separately from manifest
  selection: content becomes provider-visible only through explicit per-run
  opt-in, task-attached validation, per-item/total size bounds, no external URL
  fetching, no raw-content RunStep dump, and a separate read-only prompt
  evidence section. Without that opt-in, selected source context remains
  manifest-only. Duplicate or detached selected source-context ids fail closed
  before provider runtime config is resolved.
- The artifact/run-output model-context boundary now starts as manifest-only
  selection: task-attached artifact ids/titles/kinds/source-run metadata can be
  recorded in the provider-visible context manifest and Runs audit summary with
  `content=no`. Artifact content remains provider-invisible until kind-specific
  policy can separate prior generated output, rejected or stale patches,
  browser evidence, failed logs, and accepted facts.
- Code Agent run creation now also rejects any hidden
  `includeArtifactContent=true` request before resolving provider runtime
  config, so artifact content cannot become provider-visible through IPC or
  future UI drift before a dedicated policy slice is accepted.
- Runs detail now expands Code Agent context manifests into readable audit
  summaries with provider-prompt content state and per-item `content=yes/no`
  labels, while still avoiding raw prompt or source-content dumps.
- A default-closed Code Agent model producer runtime factory now backs that
  manual gate: it blocks before resolving AI config unless provider calls are
  explicitly allowed for the current run, requires
  `enableSandboxCodingAgent=true`, then wraps existing runtime text generation
  in the staged-file producer adapter.
- The Task detail manual Code Agent path now separates model-producer
  availability from provider-spend consent: `TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER=true`
  only exposes the capability, while each run must also select `Use model
  producer` before Taskplane resolves runtime AI config or can call the
  provider. If a run requests model producer usage without the env capability,
  it fails before sandbox execution starts.
- `npm run accept:sandbox-coding:model-producer-preflight` now provides a
  read-only local readiness check for the model-backed Code Agent opt-in,
  reporting required `.env` variables without calling providers, probing
  Docker, or touching the workspace.
- `npm run accept:sandbox-coding:model-producer-live` now provides a
  default-skipped one-request live smoke for the model producer contract. It
  requires `TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_LIVE=true`, reuses the
  preflight, validates the provider response through the staged-file plan
  parser, and still avoids Docker and workspace mutation.
- The sandboxed coding producer design now records completed slices through
  the env-gated model producer validation commands and names the next design
  decision: the first bounded workspace-context input path for model producer
  runs.
- Env-gated model producer runs can now receive explicit bounded workspace
  context via `TASKPLANE_CODE_AGENT_CONTEXT_FILES`; Taskplane collects only
  selected workspace-relative text files, blocks sensitive/path-escape/binary/
  oversized context, records a compact RunStep for collected context, and
  formats accepted files into the producer prompt as read-only evidence.
- The Task detail Code Agent intent panel now has a manual `Context files`
  field that accepts comma- or newline-separated workspace-relative paths and
  passes them as `CreateCodeAgentRunInput.contextFiles`; the renderer does not
  read files directly, and main-process validation still owns path/content
  checks.
- The Code Agent intent panel now shows bounded context-file candidate buttons
  derived from task/source/artifact text. Clicking a candidate appends the path
  to the field, but still does not read files in the renderer or bypass
  main-process validation.
- The same panel now shows a pre-run context selection summary. It reuses the
  run-payload parser, shows selected path count/list or candidate count, and
  reminds users that files are not read until the run starts.
- Runs detail now shows a display-only `Staged Patch Review` block when sandbox
  source or patch-promotion checkpoint evidence exists, summarizing source,
  files, checks, promotion status, linked Decision title, artifact summary, and
  bounded patch preview while keeping workspace mutation Decision-gated. The
  block now also carries the patch-promotion Decision id as an explicit
  `打开 promotion Decision` recovery action, so Run evidence can flow directly
  into the matching approval screen without broadening automatic starts.
- Pending `workspace.staged_patch` Decisions now include a review-only
  `查看 Run 证据` action that resolves the checkpoint id back to the owning Run
  and opens the staged patch review surface before any approval action.
- Patch promotion apply semantics are now documented in
  `AGENT_EXECUTION_PATCH_PROMOTION_APPLY_DECISION.md`. The document keeps the
  current approval path review-only, defines the pre-apply gates required before
  workspace mutation, and names a read-only promotion readiness model as the
  next implementation step.
- The first read-only patch-promotion readiness evaluator now classifies
  `workspace.staged_patch` checkpoints as `ready`, `missing_apply_metadata`,
  `blocked`, or `already_resolved`. Current review-only payloads intentionally
  report missing apply metadata such as `expectedFiles` and `patchDigest`, and
  the evaluator is included in `accept:sandbox-coding`.
- Runs detail now surfaces patch-promotion readiness in the `Staged Patch
  Review` block, and pending `workspace.staged_patch` Decisions tell users to
  inspect Run evidence and promotion readiness before acting. The evaluator was
  moved to shared code so renderer and main use the same classifier.
- Patch promotion now has a first durable metadata table/repository:
  `sandbox_patch_promotions`. It records checkpoint/run/task/artifact/source/
  Decision ids, patch digest, expected files, status, audit summary, blocked
  reasons, and applied timestamp, without being wired to Decision approval or
  file writes yet.
- Newly generated sandbox patch-promotion checkpoint payloads now include
  `expectedFiles` and a `sha256:` patch digest computed over the sandbox patch
  artifact diff. Older checkpoint payloads remain valid and continue to surface
  as `missing_apply_metadata`.
- Decision-linked patch-promotion checkpoint creation now writes a pending
  `sandbox_patch_promotions` record when `expectedFiles` and `patchDigest` are
  available. The record creation is idempotent by checkpoint id and is not wired
  to Decision approval or workspace file application.
- Patch promotion now has a read-only apply preflight service that loads the
  pending promotion record, checkpoint payload, and patch artifact, verifies
  they still agree on artifact/Decision/source ids, expected files, digest, run,
  and task ownership, and returns `ready`, `blocked`, or `already_applied`
  without reading or writing workspace files.
- Approving a `workspace.staged_patch` Decision now routes through that read-only
  preflight before settling the checkpoint. Ready/already-applied preflight closes
  the checkpoint with explicit no-write output; blocked preflight writes a failed
  RunStep, marks the Run failed, and does not fall through to model/tool resume
  or workspace file application.
- The first sandbox patch-promotion apply core now exists as a domain service
  but is not wired to Decision/UI approval yet. It parses the staged patch
  collector's review diff, verifies expected files and current workspace base
  content, prepares all writes before writing any file, detects already-promoted
  content idempotently, and marks promotion records applied or blocked.
- Sandbox patch promotion apply is now wired behind
  `enableSandboxPatchPromotionApply` /
  `TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY`. Default local config remains
  preflight-only and no-write; when the flag is enabled, approved
  `workspace.staged_patch` Decisions call the apply service and record applied,
  already-applied, or blocked outcomes in Run evidence. Settings and Decision
  copy reflect whether apply is enabled.
- DecisionService integration coverage now validates restart-safe sandbox patch
  promotion behavior against real SQLite and a temporary workspace: default
  approval keeps the durable promotion pending and leaves workspace files
  unchanged, while the enabled flag applies the reviewed patch and marks the
  promotion applied.
- Runs detail staged patch review now derives a workspace status from checkpoint
  and RunStep evidence, so open reviews still say the workspace is unchanged,
  default-off approvals say no files were written, and applied promotions show
  that the workspace promotion happened after Decision approval.
- Alpha acceptance now has an explicit isolated manual checklist for
  `TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY=true`, including disposable
  workspace setup, staged review, Decision approval, applied-state evidence,
  and the default-off no-write comparison pass.
- Release readiness now has a local `accept:release:mac-preflight` gate that
  runs the read-only signing/notarization preflight and tests both Apple ID and
  App Store Connect API key env groups without printing secret values or calling
  Apple services.
- `npm run accept:sandbox-coding:patch-promotion-apply-smoke` now provides a
  repeatable local smoke for sandbox patch promotion approval. It builds main
  code, uses real SQLite and a throwaway workspace, verifies default no-write
  approval, verifies flag-enabled apply, and does not start Docker or call AI.
- `npm run accept:agent-runtime` now explicitly gates the v2 runtime event
  spine: shared event types, event-to-RunStep mapping, and the session event
  recorder. `npm run accept:agent-local` runs it before workspace patch,
  domain-tool, provider-native, and sandbox-coding acceptance checks.
- Agent session event recording now persists the full current runtime event
  spine: session start, plan, tool start, tool result/failure,
  checkpoint-created, pause, completion, and failure. Started tool steps are
  updated to completed/failed when the matching result event arrives, so Runs
  detail does not retain stale running tool calls.
- Resume checkpoint validation now lives in the shared checkpoint payload
  contract instead of as RunService-private parsing. RunService consumes that
  shared validator when continuing paused runs, preserving the same fail-closed
  stale-payload wording while making the resume contract reusable by future UI
  and diagnostics.
- Local-container sandbox targeted checks now validate the staged candidate
  patch instead of the untouched workspace: Docker mounts the workspace and
  staging root read-only, builds a temporary merged work tree inside the
  container, removes internal `session.json`, and then runs only the selected
  `test` / `lint` script.
- The model producer preflight now validates configured
  `TASKPLANE_CODE_AGENT_CONTEXT_FILES` locally, including workspace-relative
  path checks, existence, file-vs-directory checks, text-only content, and size
  limits, without printing file contents or calling providers.
- `npm run accept:sandbox-coding:model-producer-preflight` passed locally on
  2026-04-26 in current skip state, temporary ready-with-context state, and
  invalid-context skip state; `npm test -- src/renderer/App.test.tsx
  src/main/domain/run/code-agent-workspace-context.test.ts`, `npm run lint`,
  and `npm run build` passed afterward.
- `npm test -- src/renderer/App.test.tsx src/main/ipc/handlers.test.ts
  src/main/preload.test.ts src/main/domain/run/code-agent-workspace-context.test.ts
  src/main/domain/run/code-agent-model-producer-loop.test.ts
  src/main/domain/run/code-agent-model-producer-runtime.test.ts`, `npm run
  accept:sandbox-coding`, `npm run lint`, and `npm run build` passed locally on
  2026-04-26 after adding the manual Code Agent context-file field.
- `npm test -- src/renderer/App.test.tsx src/main/ipc/handlers.test.ts
  src/main/domain/run/code-agent-workspace-context.test.ts`, `npm run
  accept:sandbox-coding`, `npm run lint`, and `npm run build` passed locally on
  2026-04-26 after adding renderer-only context-file candidate hints.
- `npm test -- src/renderer/App.test.tsx`, `npm run accept:sandbox-coding`,
  `npm run lint`, and `npm run build` passed locally on 2026-04-26 after
  adding the Code Agent context selection summary and staged patch review block.
- `npm test -- src/renderer/App.test.tsx`, `npm run accept:sandbox-coding`,
  `npm run lint`, and `npm run build` passed locally on 2026-04-26 after adding
  the patch-promotion Decision to Run evidence review link.
- `npm test -- src/main/domain/run/sandbox-patch-promotion-readiness.test.ts`,
  `npm run accept:sandbox-coding`, `npm run lint`, and `npm run build` passed
  locally on 2026-04-26 after adding the read-only patch-promotion readiness
  evaluator: 31 sandbox-coding files / 188 tests.
- `npm test -- src/main/domain/run/sandbox-patch-promotion-readiness.test.ts
  src/renderer/App.test.tsx`, `npm run accept:sandbox-coding`, `npm run lint`,
  and `npm run build` passed locally on 2026-04-26 after surfacing promotion
  readiness in Runs and Decision copy.
- `npm test -- src/main/db/repositories/sandbox-patch-promotion-repository.integration.test.ts`,
  `npm run accept:sandbox-coding`, `npm run lint`, and `npm run build` passed
  locally on 2026-04-26 after adding the durable patch-promotion metadata
  repository: 32 sandbox-coding files / 190 tests.
- `npm test -- src/shared/types/run-checkpoint-payload.test.ts
  src/main/domain/run/agent-checkpoint-recorder.test.ts
  src/main/domain/run/sandbox-patch-review-persister.test.ts
  src/main/domain/run/sandbox-patch-promotion-readiness.test.ts`, `npm run
  accept:sandbox-coding`, `npm run lint`, and `npm run build` passed locally on
  2026-04-26 after adding `expectedFiles` and `patchDigest` to newly generated
  sandbox patch-promotion checkpoint payloads.
- `npm test -- src/main/domain/run/agent-checkpoint-recorder.test.ts
  src/main/domain/run/sandbox-patch-review-persister.integration.test.ts
  src/main/domain/run/sandbox-patch-review-run-adapter.integration.test.ts
  src/main/db/repositories/sandbox-patch-promotion-repository.integration.test.ts`,
  `npm run accept:sandbox-coding`, `npm run lint`, and `npm run build` passed
  locally on 2026-04-26 after creating pending durable promotion records for
  metadata-complete sandbox patch-promotion checkpoints.
- `npm test -- src/main/domain/run/sandbox-patch-promotion-preflight-service.test.ts
  src/main/db/repositories/artifact-repository.integration.test.ts
  src/main/db/repositories/run-checkpoint-repository.integration.test.ts`, `npm
  run accept:sandbox-coding`, `npm run lint`, and `npm run build` passed locally
  on 2026-04-26 after adding the read-only patch-promotion apply preflight: 33
  sandbox-coding files / 194 tests.
- `npm test -- src/main/domain/decision/decision-service.test.ts
  src/main/domain/run/sandbox-patch-promotion-preflight-service.test.ts`, `npm
  run accept:sandbox-coding`, `npm run lint`, and `npm run build` passed locally
  on 2026-04-26 after connecting Decision approval to the read-only
  patch-promotion preflight: 34 sandbox-coding files / 208 tests.
- `npm test -- src/main/domain/run/sandbox-patch-promotion-apply-service.test.ts
  src/main/domain/run/sandbox-patch-promotion-preflight-service.test.ts`, `npm
  run accept:sandbox-coding`, `npm run lint`, and `npm run build` passed locally
  on 2026-04-26 after adding the sandbox patch-promotion apply core: 35
  sandbox-coding files / 211 tests.
- `npm test -- src/main/domain/decision/decision-service.test.ts
  src/main/config/app-config-service.test.ts src/renderer/App.test.tsx`, `npm
  run accept:sandbox-coding`, `npm run lint`, and `npm run build` passed locally
  on 2026-04-26 after wiring sandbox patch-promotion apply behind the default-off
  feature flag: 36 sandbox-coding files / 220 tests.
- `npm test -- src/main/domain/decision/decision-service.integration.test.ts`,
  `npm run accept:sandbox-coding`, `npm run lint`, and `npm run build` passed
  locally on 2026-04-26 after adding restart-safe sandbox patch-promotion
  approval coverage: 37 sandbox-coding files / 225 tests.
- `npm test -- src/renderer/App.test.tsx` passed locally on 2026-04-26 after
  adding Runs detail applied-promotion status copy coverage: 119 App tests.
- `TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true npm run
  accept:sandbox-coding:producer-preview-smoke` passed locally on 2026-04-26
  without Docker or AI calls, confirming the producer preview half of the
  staged patch flow still leaves the workspace unchanged.
- `npm run accept:sandbox-coding:patch-promotion-apply-smoke` passed locally on
  2026-04-26 with `default=no-write` and `enabled=applied`, without Docker or
  AI calls.
- `npm run accept:agent-runtime` passed locally on 2026-04-26 after promoting
  the runtime event spine to an explicit local acceptance gate.
- `npm run accept:agent-runtime`, targeted `run-orchestrator` / `agent-run-loop`
  / `run-service` tests, `npm run accept:provider-native-tools`, and `npm run
  accept:agent-local` passed locally on 2026-04-26 after recording agent
  session-start and checkpoint-created runtime events.
- `npm run accept:agent-runtime`, `npm run accept:agent-local`, `npm run lint`,
  and `npm run build` passed locally on 2026-04-26 after recording and
  completing/failing `tool.started` runtime events.
- `npm test -- src/shared/types/run-checkpoint-payload.test.ts
  src/main/domain/run/run-service.test.ts
  src/main/domain/run/run-service.integration.test.ts` and `npm run
  accept:agent-runtime` passed locally on 2026-04-26 after moving resume
  checkpoint validation into shared checkpoint payload helpers.
- `npm test -- src/main/domain/run/local-container-sandbox-backend.test.ts
  src/main/domain/run/local-container-sandboxed-coding-producer-runner.test.ts
  src/main/domain/run/local-container-sandboxed-coding-producer-preview-service.test.ts
  src/main/domain/run/local-container-sandboxed-coding-producer-execution-service.test.ts`
  and `npm run lint` passed locally on 2026-04-26 after making local-container
  checks run against the merged workspace/staging candidate patch.
- `npm run accept:sandbox-coding`, `npm run build`,
  `TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true npm run
  accept:sandbox-coding:producer-preview-smoke`, and
  `TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true
  TASKPLANE_RUN_SANDBOX_PRODUCER_DOCKER_CHECKS=true npm run
  accept:sandbox-coding:producer-preview-smoke` passed locally on 2026-04-26
  after the same local-container merged-worktree check change.
- `npm run accept:sandbox-coding:model-producer-preview-smoke` passed locally
  in default skipped mode on 2026-04-26 after adding the provider-backed
  disposable-workspace preview smoke. `npm run accept:sandbox-coding`,
  `npm run lint`, and `npm run build` passed afterward.
- `TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER=true
  TASKPLANE_ENABLE_SANDBOX_CODING_AGENT=true
  TASKPLANE_WORKSPACE_ROOT=/Users/caoq/git/Taskplane
  TASKPLANE_CODE_AGENT_CONTEXT_FILES=src/main/domain/run/code-agent-model-producer-loop.ts
  TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_PREVIEW_SMOKE=true npm run
  accept:sandbox-coding:model-producer-preview-smoke` passed locally on
  2026-04-26 with `fal-openrouter` / `google/gemini-2.5-flash`: provider was
  called once, preview reached `preview_ready`, Docker was not started, and the
  selected workspace stayed unchanged. The first attempt exposed a provider
  fenced-JSON response, so the staged-file parser now accepts a single fenced
  JSON object before applying the existing strict staged-file contract.
- The same model-producer preview smoke passed again locally on 2026-04-26 after
  the Code Agent env-template and local-acceptance updates, this time with
  `TASKPLANE_CODE_AGENT_CONTEXT_FILES=package.json`; it reached `preview_ready`,
  staged `.taskplane/code-agent-model-producer-preview-smoke.md`, did not start
  Docker, and left the selected workspace unchanged.
- `npm run accept:sandbox-coding:patch-promotion-apply-smoke` passed again
  locally after the model-producer preview rerun: default approval remained
  preflight-only `no-write`, flag-enabled approval applied only the reviewed
  disposable-workspace file, Docker was not started, and AI was not called.
- `npm run verify` passed locally after the latest Code Agent env-template,
  local-acceptance, model preview, and patch-promotion smoke updates: 99 test
  files / 703 tests, followed by type-checking and production build.
- `npm run manual:code-agent-ui-fixture` now creates a fresh isolated user-data
  directory and disposable workspace with `test` / `lint` scripts plus selected
  read-only context, then prints a launch command for the real Task detail Code
  Agent UI pass without starting Taskplane, probing Docker, calling a provider,
  or touching the real workspace.
- The Task detail Code Agent panel now surfaces whether the env-only
  `TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER` capability is active. Disabled
  mode states that manual preview uses the local diagnostic producer without
  provider calls; enabled mode reveals a per-run `Use model producer` checkbox,
  so provider spend requires both the env capability and explicit run-level
  selection with context files, selected checks, operator confirmation, sandbox
  preview, and Decision-gated promotion.
- The real Task detail Code Agent UI manual pass now runs on an isolated
  `TASKPLANE_USER_DATA_DIR` and disposable workspace from
  `npm run manual:code-agent-ui-fixture`. The pass created a task, opened Action
  Desk, probed runtime readiness to `ready`, and confirmed long runtime,
  workspace-path, and preflight text wrap inside the Run/Code Agent card. Action
  Setup and the Run card now span the detail grid, so Code Agent readiness is
  readable without horizontal overflow or narrow-column wrapping. Provider spend
  still requires explicit model-producer opt-in and was not triggered during the
  UI layout pass.
- The same isolated Task detail UI path now completes the local diagnostic
  staged-patch loop with one allowlisted Docker check: `lint` passes inside the
  local-container sandbox, Runs detail shows readable check evidence plus
  `Staged Patch Review`, the patch-promotion readiness is `ready`, and
  `打开 promotion Decision` opens the matching pending `workspace.staged_patch`
  Decision. This pass also fixed a real Electron/runtime gap by making
  local-container Docker command execution inherit the host process environment
  before applying sandbox-specific overrides.
- Task detail / Action Setup now projects the latest task-linked Code Agent
  sandbox preview as a `Code Agent Review` recovery card. It links back to the
  latest Run evidence and, when present, opens the pending promotion Decision,
  keeping the task object as the home base for the staged-patch review loop.
- The first real Task detail model-backed Code Agent UI pass is validated on a
  disposable workspace. With `Use model producer` selected and one explicit
  context file, Taskplane spent one configured `fal-openrouter` /
  `google/gemini-2.5-flash` provider request, collected bounded context, wrote
  one staged file through the staged-file contract, passed `lint` and `test` in
  the local-container sandbox, created a pending promotion Decision, and kept
  workspace mutation Decision-gated.
- Task detail Code Agent recovery now treats the pending
  `workspace.staged_patch` promotion Decision as the durable recovery anchor.
  The recovery card can appear even when the lightweight run list lacks Code
  Agent output text, and `查看 Code Agent Run` prefers checkpoint-to-Run lookup
  before falling back to a directly identified Code Agent run.
- The same recovery card now includes a `准备重跑 Code Agent` affordance that
  returns the operator to the Code Agent input surface and pre-fills a bounded
  rerun intent without starting a run or spending provider credit.
- Runs / Staged Patch Review now breaks Code Agent evidence into a compact
  checklist for source evidence, targeted checks, promotion Decision, and
  workspace mutation state, so review can happen from persisted records without
  parsing one long lifecycle sentence.
- From that same Runs review, `回到任务准备重跑` now returns to the Task Code
  Agent input surface with a bounded rerun intent pre-filled from the persisted
  run id, changed files, promotion Decision, and workspace mutation state.
- The Task and Runs rerun affordances now use the same tested Code Agent rerun
  intent formatter, so recovery wording can evolve once for both surfaces.
- Runs / Staged Patch Review now also shows a `Next review move` derived from
  failed checks, missing promotion Decisions, open Decisions, applied patches,
  or deferred/no-write workspace state, keeping rerun/apply guidance local to
  persisted evidence.
- Staged Patch Review checklist and next-move formatting now live in tested
  renderer helpers, keeping patch evidence review reusable as the Code Agent
  recovery loop grows.
- The next execution-lane decision is now drafted for Browser / Playwright
  read-only evidence. It keeps `browser.readonly_evidence` reserved and hidden,
  forbids login/post/publish/credential-bearing actions in the first lane, and
  names shared Browser Evidence Contract types as the next code slice.
- Browser Evidence Contract B1 is implemented as shared types plus validation:
  read-only actions, artifact kinds, credential-free isolated session policy,
  allowlisted-network requirement, bounded time/output, and fail-closed request
  checks. No browser runtime, UI, IPC, provider exposure, or network call is
  enabled.
- Browser read-only preflight B2 is implemented as a shared helper that reports
  the lane as reserved/hidden, counts configured allowed origins, and explicitly
  states no browser will start, no network will be called, and no model exposure
  exists.
- Settings surfaces that Browser Evidence preflight as read-only diagnostics
  alongside the existing tool-scaffold status, without adding controls, opening
  a browser, making network calls, or exposing browser tools to the model.
- Browser Evidence B3 now has a runner-smoke fixture contract that prepares a
  local read-only HTML fixture, allowlisted origin, expected screenshot/text/page
  summary artifacts, and a valid request while still reporting no browser start,
  no network call, no mutation action, and no model exposure.
- `npm run manual:browser-evidence-fixture` materializes that B3 fixture into a
  temp directory as local HTML, request JSON, and preflight JSON, still without
  starting a browser, making network calls, or exposing tools to the model.
- The first real Browser Evidence Tier 1 smoke is implemented behind
  `npm run manual:browser-evidence-smoke`: it starts a disposable local HTTP
  fixture, launches an isolated Playwright Chromium context, aborts browser
  requests outside the allowed origin, and writes page-summary/visible-text/
  screenshot artifacts while keeping credentials, mutation, and model exposure
  unavailable.
- Browser Evidence B4 has started at the persistence layer:
  `browser_evidence` artifacts can now be created from Runs, and
  `BrowserEvidencePersister` records capture plus artifact RunSteps without
  exposing browser control to prompts, provider-native schemas, IPC, or the
  scheduler.
- Runs detail now surfaces persisted Browser Evidence artifacts as a dedicated
  review card with URL, artifact kinds, artifact id, summary, screenshot path,
  and a review reminder before any controlled browser interaction is enabled.
- Browser Evidence Runs review parsing, metadata formatting, and next-review
  guidance now live in tested renderer helpers, so Tier 2 controlled-interaction
  planning can reuse persisted evidence review without widening browser access.
- [AGENT_EXECUTION_OPERATOR_STARTED_RUN_DECISION.md](AGENT_EXECUTION_OPERATOR_STARTED_RUN_DECISION.md)
  is accepted for manually started internal runs. The shared
  `OperatorStartedRunRequest` contract now covers `browser_evidence_smoke`,
  `code_agent_preview`, and `sandbox_patch_review`, requiring explicit operator
  confirmation, hidden model exposure, no scheduler start, no provider call by
  default, and descriptor/policy alignment.
- `OperatorStartedRunService` now provides the first service entry for
  `browser_evidence_smoke`: it validates the shared request, creates an agent
  Run, records an accepted RunStep, calls an injectable browser-evidence
  executor, persists captured evidence, and marks the Run completed or failed.
- Runs / Action Desk now exposes the first manual operator-started Browser
  Evidence smoke through `run:triggerOperatorStarted`. The UI constructs the
  shared request with `modelExposure=hidden`, `schedulerAllowed=false`, and
  `providerCallAllowed=false`, then opens the completed/failed Run for evidence
  review.
- The Browser Evidence Runs UI smoke passed on 2026-04-27 with isolated
  `TASKPLANE_USER_DATA_DIR=/tmp/taskplane-browser-evidence-ui-20260427`: the
  manual button created a completed agent Run, persisted a `browser_evidence`
  artifact, showed the Browser Evidence review card, and SQLite confirmed the
  accepted/captured/artifact RunSteps plus timeline events.
- T8's first service extraction is locally accepted: `CodeAgentRunService` now owns
  manual Code Agent launch orchestration, while `run:triggerCodeAgent` only
  delegates and emits app events. Service tests now cover the no-provider local
  diagnostic default, disabled model-producer env blocking, and invalid selected
  context blocking before producer execution. `npm run
  accept:sandbox-coding:code-agent-ui` and `npm run verify` passed after the
  extraction. Code Agent manual launches now also record an operator-started
  acceptance RunStep with descriptor, producer branch, provider-call policy, and
  selected checks.
- The shared executor/session boundary has its first domain-facing persistence
  layer: `AgentSessionStore` wraps `AgentSessionRepository`, and `RunService`,
  `RunOrchestrator`, sandboxed coding injected-producer preview, and sandboxed
  coding backend preflight now depend on the store instead of direct repository
  construction.
- The first source/tool-family summary slice is implemented in shared helpers:
  session metadata parsing and tool-family exposure summaries now feed Runs
  detail. Current summaries make the boundary visible: workspace/task/coding
  capabilities are described from the session record, while browser,
  computer-use, MCP, and creator connectors remain `not_exposed`.
- Runs detail also shows shared restart hints for the latest agent session:
  completed/failed sessions route users to evidence inspection or a new Run,
  while paused/confirmation sessions point back to checkpoint/Decision review.
  No automatic replay is enabled by this slice.
- Runs detail now also shows a shared replay review summary derived from the
  latest agent session plus RunSteps. It is an evidence/recovery hint only:
  inspect-only, manual-resume, or new-run recovery, always with
  `openCheckpoints`, `restartSafety`, and `autoReplay=no`. A persisted
  `running` session whose latest RunStep is no longer pending/running is now
  treated as `interrupted_or_stale`, so task recovery copy asks the user to
  inspect evidence and start a new Run if no executor is active instead of
  implying automatic replay.
- Paused-run continuation now synchronizes the latest checkpoint-backed
  AgentSession terminal status: successful resume marks the latest `paused` /
  `needs_confirmation` session `completed`, failed resume marks it `failed`,
  and invalid/stale checkpoint payloads still stop before any tool execution or
  session mutation. Stale `running` sessions are excluded from this settlement
  target so a restart/interruption record cannot be accidentally marked
  completed.
- Decision checkpoint settlement now uses the same checkpoint-backed
  AgentSession terminal-status synchronization through the shared service
  wiring: approved tool/browser/patch resume completion marks the latest
  checkpoint-backed session `completed`, failed or blocked resume marks it
  `failed`, and deferred/cancelled Decisions mark it `cancelled`, while
  unsupported/no-op approvals remain review-only.
- Runs detail now only exposes `继续 paused run` when the paused Run has an
  open and locally valid `resume` checkpoint payload for the current run/task.
  Paused Runs without a resumable checkpoint, or with a stale/incompatible
  payload, show review-first guidance instead of letting the user click into a
  known backend rejection path.
- Backend paused-run continuation now mirrors that selection rule: if multiple
  open resume checkpoints exist, stale/incompatible payloads are skipped until a
  valid supported payload for the current run/task is found; execution still
  fails closed when none is available.
- Shared resume checkpoint validation now also checks the currently supported
  `artifact.create_note` resume input shape before UI continuation or backend
  tool execution, so empty title/content payloads are treated as stale
  checkpoint data rather than failed resumed work.
- Supported resume-payload detection is now a shared helper used by both Runs UI
  gating and backend paused-run continuation, so future resume tools have one
  place to update before becoming clickable or executable.
- Scheduler stale-run recovery now only sweeps truly in-flight `pending` /
  `running` Runs. `paused` and `needs_confirmation` Runs remain checkpoint /
  Decision-owned and are not auto-failed by the local scheduler timeout.
- Runs Focus Moves now gives `needs_confirmation` Runs explicit checkpoint /
  Decision review guidance without adding a direct resume button or scheduler
  path.
- Replay review now also treats paused or confirmation sessions with no
  recovery-relevant open checkpoint as `checkpoint_missing` / inspect-only
  rather than checkpoint-gated, so restart guidance does not imply a resumable
  path after the checkpoint has already been resolved, cancelled, lost, or shown
  to belong to a different recovery lane.
- The coarse session restart hint now says checkpoint `expected` for paused or
  confirmation sessions and leaves actual resumability to the checkpoint-aware
  replay review, avoiding a false promise when the checkpoint is missing.
- Running-session restart hints no longer claim a single local session is
  currently in progress without a live executor/heartbeat fact; they now record
  the session and route recovery through latest-step inspection.
- Runs detail capability copy now uses `single-session record` for non-long-
  running sessions, keeping the visible session summary aligned with the
  inspect-first restart/replay boundary.
- Task detail Paused Run Recovery now routes users to the Run evidence first
  instead of directly executing continuation from a list-only Run summary. The
  actual continuation affordance lives on Runs detail, where checkpoint evidence
  is loaded and can be checked before execution.
- The Runs `回到任务推进` action now uses the replay review mode to prefill the
  task next-step draft, so manual-resume sessions point users back to open
  checkpoint / Decision review before continuing.
- The Decisions `回到任务推进` action now also carries pending agent-checkpoint
  context into the task next-step draft, so workspace patch, command, staged
  patch, and note confirmations route users through evidence review before task
  continuation.
- Decisions can open Run evidence from any agent checkpoint with a source
  checkpoint id, not only staged-patch promotion checkpoints; this keeps
  workspace patch and command confirmation review one click away without
  executing the pending action.
- Connector policy/evidence records are now generated from
  `agent-tool-scaffold`: each descriptor records model visibility, network,
  credential, checkpoint, and verification requirements. Settings diagnostics
  include verification-required counts, but reserved browser, MCP,
  computer-use, skill, and creator descriptors remain hidden from text prompts
  and provider-native tool exposure.
- Browser / Playwright Tier 1 now has an explicit acceptance checklist in
  [AGENT_EXECUTION_BROWSER_TIER1_ACCEPTANCE_CHECKLIST.md](AGENT_EXECUTION_BROWSER_TIER1_ACCEPTANCE_CHECKLIST.md).
  It accepts only read-only evidence review readiness and keeps model-visible
  browser tools, controlled interaction, authenticated browsing, and scheduled
  browser runs deferred.
- Tier 2 browser controlled interaction now has schema-only shared coverage:
  action names, operator-started policy, step drafts, checkpoint payload shape,
  and validation are drafted in `browser-controlled-interaction`. The descriptor
  is now registered only as hidden/reserved scaffold metadata, so no
  model-visible browser tool, generic IPC route, scheduler path, arbitrary URL
  runner, or provider schema is enabled.
- The Tier 2 local-dev QA fixture plan can now be materialized with
  `npm run manual:browser-controlled-fixture`. It writes HTML, request JSON, and
  plan JSON to a temporary directory while recording `browserStart=no`,
  `networkCall=no`, `pageMutation=no`, and `modelExposure=hidden`.
- That fixture now also writes expected RunStep drafts for the planned browser
  actions, giving the future runner a stable evidence shape to match without
  persisting or executing anything today.
- The Browser / Playwright boundary has been rechecked against public Codex,
  OpenClaw, Multica, CoWork OS, Hermes, Vercel `agent-browser`, Microsoft
  Foundry, and Pause references. The accepted direction is tiered capability:
  start with isolated read-only evidence, but explicitly reserve controlled
  click/type/select interaction for allowlisted non-sensitive flows after a
  separate policy decision.
- [AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_DECISION.md](AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_DECISION.md)
  now drafts the Tier 2 policy for future browser click/type/select actions:
  allowlisted non-sensitive interaction only, RunStep evidence for every
  action, and Decision checkpoints before submit/post/publish/purchase/delete
  side effects.
- [AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_ACCEPTANCE_PLAN.md](AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_ACCEPTANCE_PLAN.md)
  now breaks Tier 2 into BCI1-BCI6: review helpers, dry-run runner plan, local
  QA smoke, checkpoint boundary, Runs review surface, and a final
  operator-started entrypoint. BCI1-BCI6 are locally accepted for the local-QA
  path; broad browser capability expansion should pause unless a new acceptance
  plan covers arbitrary URLs, authenticated profiles, scheduler starts,
  provider schemas, or model-visible browser tools.
- Browser controlled interaction BCI1 is locally accepted with renderer review helpers
  that turn validated schema drafts into ready/checkpoint-required/blocked
  review summaries and planned RunStep titles. The descriptor is now
  hidden/reserved for operator-started policy validation, with no prompt or
  provider schema exposure.
- Browser controlled interaction BCI2 is locally accepted with a dry-run recorder that
  persists validated action plans as RunStep evidence while explicitly recording
  `browserStart=no`, `networkCall=no`, `pageMutation=no`, `modelExposure=hidden`,
  `scheduler=no`, and `providerCall=no`. It is not wired to IPC or UI.
- Runs manual Browser QA entrypoints now show that same operator-started boundary
  beside the buttons, keeping Browser Evidence and Controlled Local QA visibly
  local-review-only rather than model-visible browser control.
- Browser controlled interaction BCI3 is locally accepted with a local QA runner and
  manual smoke command for the existing localhost fixture. The runner validates
  every request before launch, blocks invalid or checkpoint-required actions
  before browser start, uses an isolated Playwright context, and remains
  unwired from IPC, UI, scheduler, provider schemas, and model-visible tools.
- Browser controlled interaction BCI4 is locally accepted with a shared checkpoint
  payload builder for possible side-effect actions. It requires a validated
  checkpoint-required request, captures URL/origin/action/policy/screenshot/text
  review fields, and explicitly leaves resume deferred.
- Browser controlled interaction BCI5 is locally accepted with a Runs review helper and
  read-only Runs detail card for dry-run, local-QA, blocked, and
  checkpoint-required evidence. It adds no generic browser prompt, IPC trigger,
  scheduler start, provider schema, or model-visible browser tool.
- Browser controlled interaction BCI6 is locally accepted with a hidden/reserved
  `browser.controlled_interaction` scaffold descriptor, an operator-started
  `browser_controlled_local_qa` request kind, service execution through the
  existing local QA fixture, and a Runs-page local QA button. It remains limited
  to localhost fixture QA and still does not expose generic URLs, scheduler
  starts, provider schemas, authenticated profiles, or model-visible tools.
- [AGENT_EXECUTION_BROWSER_CONTROLLED_RESUME_ACCEPTANCE_PLAN.md](AGENT_EXECUTION_BROWSER_CONTROLLED_RESUME_ACCEPTANCE_PLAN.md)
  now defines the next browser slice: checkpoint approval may resume exactly one
  previously recorded `browser.controlled_interaction` action after validation,
  not a general browser session. BCR1 is locally accepted with renderer review
  helpers for approved-ready, blocked, stale-payload, and already-consumed
  checkpoint resume states. BCR2 is locally accepted with a shared pure
  validator that returns either a one-action resume plan or blocked reasons for
  stale payloads, approval/checkpoint drift, descriptor mismatch,
  scheduler/provider/model exposure drift, action/origin drift, policy drift,
  or missing target metadata. BCR3 is locally accepted with a dry-run recorder
  that persists checkpoint review, validation result, planned one-action
  resume, and expected post-action evidence RunSteps while recording
  `browserStart=no`, `pageMutation=no`, `providerCall=no`, `scheduler=no`, and
  `modelExposure=hidden`. BCR4 is locally accepted with a local QA resume
  runner and manual smoke command: the runner validates immediately before
  browser launch, opens only the disposable localhost fixture in an isolated
  Playwright context, executes exactly one resumed action, captures
  page-summary / visible-text / screenshot artifacts, and blocks invalid resume
  contexts before browser start. BCR5 is locally accepted with a read-only Runs
  detail Browser Controlled Resume review card for approved-ready, resumed,
  blocked/stale, and consumed checkpoint payload states using linked Decision
  status, checkpoint state, resume evidence, reviewed payload evidence,
  consequence, policy, and next-review wording. BCR6 is locally accepted with
  Decision approval service integration: accepted
  `browser_controlled_interaction` payloads are recognized, non-local origins
  are blocked before executor launch, localhost-style payloads invoke the
  injected local-QA resume executor, successful resumes resolve the checkpoint
  and update the Run, and blocked/failed attempts write failed checkpoint
  RunSteps and cancel the checkpoint. Arbitrary URLs, authenticated profiles,
  scheduler starts, provider schemas, and model-visible browser tools remain
  deferred. A dev-app visual fixture pass on 2026-04-27 confirmed the
  approved-ready, resumed, blocked, stale-payload, and non-browser checkpoint
  review surfaces; the non-browser case also tightened the BCI review helper so
  an isolated `Browser action planned:*` step no longer misclassifies a generic
  checkpoint as browser-controlled evidence.
- Pending `browser.controlled_interaction` Decisions now use dedicated
  consequence and task-follow-up wording: approval resumes exactly one recorded
  browser action, does not grant a general browser session, does not enable
  scheduler/provider/model-visible browser tools, and routes task follow-up
  back through checkpoint evidence review.
- Task detail Code Agent Review now treats `needs_confirmation` / `paused`
  sandbox previews as checkpoint-owned recovery: users are routed to Run
  evidence and staged patch / checkpoint review before deciding whether to
  continue or rerun, without starting a replacement run from the task surface.
- Task detail Code Agent Review also avoids treating a `running` sandbox
  preview record as proof of a live executor; it now asks users to inspect Run
  evidence and the latest step before waiting, rerunning, or starting a new run.
- Approved checkpoint Decisions now say recovery results should be read from
  Run evidence instead of implying a future automatic restore promise from the
  Decision page alone.
- Pending generic checkpoint Decisions now use the same evidence-first language:
  approval enters a recovery path, while actual recovery results remain anchored
  in Run evidence.
- `npm test -- src/main/keychain/ai-config-service.test.ts
  src/renderer/lib/agentCapabilities.test.ts`, `npm test --
  src/main/ipc/handlers.test.ts src/renderer/App.test.tsx
  src/renderer/lib/agentCapabilities.test.ts`, `npm run accept:sandbox-coding`,
  `npm run lint`, and `npm run build` passed locally on 2026-04-26 after
  separating model-producer availability from per-run provider-spend selection.
- The same gate is now reflected in alpha/config/testing documentation, blocked
  start UI copy, IPC fallback coverage, and manual preview Run evidence: hidden
  or disabled model-producer UI state is inert, env capability alone remains
  passive, and manual diagnostic previews no longer claim the model loop is
  disconnected.
- Sandboxed coding producer session metadata now carries a bounded
  `producerSource` (`local_diagnostic` or `model_backed`), and Runs detail
  surfaces that source explicitly so local diagnostic previews are visible as
  no-provider-call evidence while model-backed runs are visible as provider
  credit already spent and still Decision-gated. The source marker is preserved
  for malformed model output and backend-preflight blocked runs as well.
- `npm test -- src/main/domain/run/code-agent-workspace-context.test.ts
  src/main/domain/run/code-agent-model-producer-loop.test.ts
  src/main/domain/run/code-agent-model-producer-runtime.test.ts
  src/main/ipc/handlers.test.ts`, `npm run
  accept:sandbox-coding:model-producer-preflight`, default-skipped `npm run
  accept:sandbox-coding:model-producer-live`, `npm run accept:sandbox-coding`,
  `npm run lint`, and `npm run build` passed locally on 2026-04-26 after adding
  explicit workspace context input for env-gated model producer runs: 30
  sandbox-coding files / 183 tests.
- Decisions now distinguish `workspace.staged_patch` promotion checkpoints from
  direct `workspace.write_patch` checkpoints: approving the current sandbox
  promotion review records and resolves the checkpoint, but does not auto-apply
  files to the workspace.
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
- Tool scaffold execution policies now have a shared fail-closed validator for
  descriptor identity, session kind, network policy, credential policy,
  timeout, output limit, and optional session ids. The sandbox coding lane
  readiness path reuses that validator before applying its stricter
  staged-patch-specific checks.
- Tool scaffold family summaries can now report implemented versus reserved
  descriptors, current text/provider-native exposure, checkpoint requirements,
  and credential gates for each future tool family without enabling those
  lanes.
- AI config status now carries the default no-opt-in tool scaffold family
  summaries, giving Settings and preflight surfaces a shared diagnostic fact
  source without exposing any reserved lane or model-visible tool.
- Settings now renders the tool scaffold family diagnostic summary from AI
  config status, so the reserved MCP/browser/skills/creator/computer-use lanes
  are visible as readiness facts without becoming available actions.
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
- Producer-local lifecycle/tool/check/source/terminal events now map into
  compact RunStep drafts, giving the future sandboxed coding producer a
  timeline projection path without expanding the ordinary agent event union or
  starting a live runner.
- Producer scaffolding now includes an injected-runner preview path for tests:
  the injected runner can write staged files, the collector converts them into
  a patch draft, producer output becomes a validated source, and the result
  previews the existing sandbox patch-review plan without starting a real model
  loop, command runner, sandbox backend, or UI entrypoint.
- Sandboxed coding producer integration coverage now exercises those
  pre-backend outcomes with real temp workspace/staging directories and an
  injected runner: source-ready, runner-blocked, runner-failed, and empty-diff
  failed paths.
- Producer planning docs now mark the pre-backend non-live producer slices and
  the first local-container targeted-check backend semantics as complete.
  Local-container checks validate the merged workspace/staging candidate patch
  without exposing a UI-visible generic coding shell.
- Sandboxed coding producer backend readiness now composes producer request
  validation, backend probe/profile readiness, the sandbox coding feature flag,
  and the shared coding-lane eligibility gate before any real backend can be
  connected.
- Sandboxed coding producer preview results now carry bounded session metadata
  for future `agent_sessions` persistence and Run detail diagnostics, including
  producer status, source id, provider, checks, network, promotion, backend,
  and blocked reasons without raw provider prompts or environment data.
- A non-live sandboxed coding producer preview persister can now record that
  bounded session metadata plus compact producer RunStep drafts through the
  existing `agent_sessions` and `run_steps` repositories, while leaving patch
  artifact creation and promotion checkpoints to the separate patch-review
  persister.
- A non-live injected producer preview service now composes preview generation
  and preview persistence into one orchestration boundary, with real repository
  integration coverage and no Docker, model, artifact, checkpoint, or UI
  execution path.
- Sandboxed coding producer backend connection now has an explicit gate that
  only opens after request validation, backend probe/profile readiness, feature
  flags, and coding-lane eligibility all pass; unavailable Docker/backend probes
  remain blocked before any real backend runner can be wired.
- Backend connection gates can now produce pure connection plans for the future
  real runner, naming backend id/kind, runner family, source id, workspace root,
  checks, network, and promotion policy without starting Docker or constructing
  a provider.
- Local Docker backend probe on 2026-04-26 is not ready: Docker CLI reached the
  configured socket path but the daemon/socket was unavailable at
  `/Users/caoq/.docker/run/docker.sock`. Real local-container backend live
  validation remains blocked until Docker is running; non-live producer and
  sandbox acceptance tests remain the current gate.
- `npm run accept:sandbox-coding:backend-preflight` now provides a read-only
  local backend probe for the future real sandbox provider pass. It checks
  Docker server availability and prints ready/blocked status without starting
  containers, pulling images, running checks, or spending provider credit.
- Settings sandbox backend detection now also returns and displays producer
  backend readiness, combining the manual backend probe with current AI config
  feature flags and workspace root before the UI can claim the producer backend
  is ready.
- Agent pre-run capability summaries now reuse producer backend readiness after
  sandbox backend detection has run, so blocked Docker/flag/workspace reasons
  are visible before a user starts an agent run.
- IPC coverage now asserts both ready and unavailable sandbox backend probe
  paths return producer backend readiness, keeping Settings diagnostics stable
  when Docker is not running.
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
  `notarytool`, Apple ID or App Store Connect API key notarization env vars,
  and package metadata. It does not sign, notarize, upload, or call Apple
  services.

## Verification Baseline

Use local verification as the source of truth while GitHub Actions is disabled:

```bash
npm run verify
```

Latest local baseline:

- 127 test files
- 909 tests
- TypeScript checks
- production renderer build
- Electron main-process build
- build smoke check
- macOS package and runtime smoke checks for the unpacked app, including ASAR contents, isolated startup, and packaged SQLite schema initialization
- `npm run accept:sandbox-coding` and `npm run verify` passed locally on
  2026-05-01 after moving Code Agent selected workspace-context validation
  ahead of provider runtime config resolution. Invalid selected context now
  fails before provider config is resolved, while valid selected files still
  produce the provider-visible context manifest before provider calls.
  Current local acceptance status: 127 test files / 909 tests
- `npm run accept:agent-local` passed locally on 2026-05-01 after the same
  Code Agent model-context validation ordering change, covering agent runtime,
  workspace patch, domain tools, provider-native tools, sandbox-coding, and
  Code Agent UI gates without external providers.
- `npm run accept:sandbox-coding` and `npm run accept:agent-local` passed
  locally on 2026-05-01 after expanding the focused sandbox-coding gate to
  include Code Agent model-context manifest, source-context, and run-service
  boundary tests. The sandbox-coding segment now runs 40 Vitest files / 260
  tests in ten sequential batches to keep the combined local agent acceptance
  path stable.
- `npm run verify` passed locally on 2026-05-01 after the same expanded
  sandbox-coding acceptance coverage and documentation update. Current local
  acceptance status: 127 test files / 909 tests
- `npm run accept:sandbox-coding` and `npm run accept:agent-local` passed
  locally on 2026-05-01 after extending Code Agent artifact context manifests
  with artifact kind/source-run metadata while keeping artifact content
  provider-invisible as `content=no`.
- `npm run verify` passed locally on 2026-05-01 after the same artifact
  manifest metadata update. Current local acceptance status: 127 test files /
  909 tests
- Renderer coverage now keeps Code Agent context-manifest display stable when
  selected artifact titles contain colon punctuation, while still rendering
  artifact metadata as audit-only `content=no`.
- Runs recovery coverage now also asserts interrupted/stale agent sessions
  prefill the task quick-run instructions with latest-step evidence and the
  structured recovery intent, keeping manual new-run preparation inspect-first.
- Agent recovery helper coverage now mirrors that interrupted/stale manual-run
  prefill contract below the App flow, so helper and renderer behavior both
  preserve inspect-first new-run preparation.
- Runs staged-patch review coverage now distinguishes preflight-only resolved
  promotion evidence and cancelled/no-write promotion evidence, alongside the
  already-covered open, failed-check, and applied promotion states.
- `npm run accept:agent-local` passed locally on 2026-05-01 after splitting the
  Code Agent model-producer sandbox-coding batch into smaller Vitest calls,
  covering agent runtime, workspace patch, domain tools, provider-native tools,
  sandbox-coding, and Code Agent UI gates without external providers.
- `npm run verify` passed locally on 2026-05-01 after the interrupted/stale
  recovery prefill coverage and acceptance-script split. Current local
  acceptance status: 127 test files / 912 tests
- `npm run accept:agent-local` passed locally on 2026-05-01 after binding new
  tool-permission/resume checkpoint payloads to their `agentSessionId` and
  further splitting the sandbox-coding Code Agent run-service/source-context
  batch for stable local acceptance.
- `npm run verify` passed locally on 2026-05-01 after the same
  checkpoint-to-session settlement binding update. Current local acceptance
  status: 127 test files / 913 tests
- `npm run accept:sandbox-coding` passed locally on 2026-05-01 after enforcing
  duplicate source-context selection as a fail-closed model-context boundary
  before provider runtime config resolution.
- `npm run accept:agent-local` passed locally on 2026-05-01 after the same
  duplicate source-context selection boundary change, covering agent runtime,
  workspace patch, domain tools, provider-native tools, sandbox-coding, and
  Code Agent UI gates without external providers.
- `npm run verify` passed locally on 2026-05-01 after the same duplicate
  source-context selection boundary update. Current local acceptance status:
  127 test files / 910 tests
- `npm run verify` passed locally on 2026-05-01 after stabilizing the
  acceptance scripts: `accept:agent-runtime` now runs lifecycle/recorder-heavy
  coverage in sequential Vitest calls, and `accept:sandbox-coding` now splits
  its producer batch while preserving the same focused coverage. Current local
  acceptance status: 127 test files / 909 tests
- `npm run accept:agent-local` passed locally on 2026-05-01 after the same
  acceptance-script stabilization, covering agent runtime, workspace patch,
  domain tools, provider-native tools, sandbox-coding, and Code Agent UI gates
  without external providers.
- `npm run verify` passed locally on 2026-05-01 after locking lifecycle mode
  fields at the AI config status boundary, making settlement projection
  exhaustive, and aligning recorder terminal detection with the shared
  runtime-event helper. Current local acceptance status: 127 test files / 909
  tests
- `npm run verify` passed locally on 2026-05-01 after changing agent-session
  settlement projection to an exhaustive status switch instead of an
  unreachable fallback action. Current local acceptance status: 127 test files
  / 909 tests
- `npm run verify` passed locally on 2026-05-01 after locking replay-review
  latest-step created-time tie-breaking when run-step indexes match. Current
  local acceptance status: 127 test files / 909 tests
- `npm run verify` passed locally on 2026-05-01 after adding a recorder
  regression that keeps sessionless pending tool starts separate from scoped
  tool results for the same run/tool name. Current local acceptance status:
  127 test files / 908 tests
- `npm run verify` passed locally on 2026-05-01 after binding lifecycle
  monitor adapter events to the current handle's agent session id before
  recording, keeping scoped terminal observations correct even when an adapter
  event omits `sessionId`. Current local acceptance status: 127 test files /
  907 tests
- `npm run verify` passed locally on 2026-05-01 after adding a recorder
  regression that keeps sessionless terminal events out of scoped
  agent-session terminal queries. Current local acceptance status: 127 test
  files / 906 tests
- `npm run accept:agent-local` passed locally on 2026-05-01 after the same
  recorder regression and after changing `accept:sandbox-coding:code-agent-ui`
  to split main-process config/IPC checks from renderer coverage, avoiding a
  combined-worker exit hang while preserving the same Code Agent UI gate
  coverage.
- `npm run accept:sandbox-coding` passed locally on 2026-05-01 after changing
  the sandbox-coding acceptance script to run its focused Vitest files in
  sequential batches, avoiding the combined-worker exit hang while preserving
  the focused gate coverage.
- `npm run accept:agent-runtime`, `npm run accept:sandbox-coding:code-agent-ui`,
  and `npm run verify` passed locally on 2026-05-01 after adding structured
  terminal-evidence fields to executor lifecycle settlement plan/diagnostic/apply
  results and separating replay-review `recoveryCheckpointCount` from total
  open checkpoint count. Current local acceptance status: 127 test files / 909
  tests
- `npm run accept:agent-local` passed locally on 2026-05-01 after the same
  settlement-evidence and recovery-checkpoint routing changes, covering the
  non-live agent runtime, workspace patch, domain tools, provider-native tools,
  sandbox-coding, and Code Agent UI gates.
- `npm run verify` and `npm run accept:agent-local` passed locally on
  2026-05-01 after tightening recovery copy from "open checkpoint" to
  "recovery checkpoint", adding symmetric confirmation/resume mismatch
  coverage, and introducing shared replay checkpoint evidence typing. Current
  local acceptance status: 127 test files / 909 tests
- `npm run verify` passed locally on 2026-05-01 after aligning the remaining
  agent replay/recovery docs and App test naming with recovery-relevant
  checkpoint semantics. Current local acceptance status: 127 test files / 909
  tests
- `npm run accept:agent-local` passed locally on 2026-05-01 after the same
  recovery-relevant checkpoint terminology alignment across docs, renderer
  tests, and shared replay review typing.
- `npm run verify` passed locally on 2026-05-01 after narrowing
  needs-confirmation recovery checkpoints to `confirmation`, `tool_permission`,
  and `patch_promotion`, excluding unrelated `resume` and `external_wait`
  checkpoints, and after adding the status-neutral
  `recoveryCheckpointRequired` recovery-intent field. Current local acceptance
  status: 127 test files / 909 tests
- `npm run accept:agent-local` passed locally on 2026-05-01 after the same
  recovery checkpoint whitelist and `recoveryCheckpointRequired` field changes.
- `npm run accept:sandbox-coding:code-agent-ui` passed locally on 2026-05-01
  after changing the Code Agent UI gate to keep main-process config/IPC checks
  separate while running renderer capability and App coverage together.
- `npm run accept:agent-local` passed locally on 2026-05-01 after binding
  lifecycle monitor adapter events to the current handle session id and keeping
  the sequential Code Agent UI acceptance script stable.
- `npm run accept:agent-local` passed locally on 2026-05-01 after the latest
  recorder pending-tool, runtime failed-status, and replay latest-step
  regression checks.
- `npm run verify` passed locally on 2026-04-30 after covering
  provider-native completed terminal events without duplicate result final
  steps. Current local acceptance status: 127 test files / 902 tests
- `npm run verify` passed locally on 2026-04-30 after covering local-note
  completed terminal events without duplicate result final steps. Current local
  acceptance status: 127 test files / 901 tests
- `npm run verify` passed locally on 2026-04-30 after covering
  provider-native interrupted terminal events ahead of generic failed executor
  results. Current local acceptance status: 127 test files / 900 tests
- `npm run verify` passed locally on 2026-04-30 after covering local-note
  interrupted terminal events ahead of generic failed executor results. Current
  local acceptance status: 127 test files / 899 tests
- `npm run verify` passed locally on 2026-04-30 after locking executor settle
  status ordering in the shared lifecycle contract. Current local acceptance
  status: 127 test files / 898 tests
- `npm run verify` passed locally on 2026-04-30 after locking visible
  Settings/Task/Runs settle diagnostics at the App level. Current local
  acceptance status: 127 test files / 897 tests
- `npm run verify` passed locally on 2026-04-30 after surfacing dry-run
  executor settle result support in lifecycle diagnostics without changing
  runtime readiness. Current local acceptance status: 127 test files / 897
  tests
- `npm run verify` passed locally on 2026-04-30 after extending service
  coverage for explicit application of `settleAndPlan` status updates. Current
  local acceptance status: 127 test files / 897 tests
- `npm run verify` passed locally on 2026-04-30 after covering assembled
  dry-run lifecycle service `settleAndPlan` planning without implicit session
  status writes. Current local acceptance status: 127 test files / 897 tests
- `npm run verify` passed locally on 2026-04-30 after exposing monitor/service
  `settleAndPlan` without implicit session status writes. Current local
  acceptance status: 127 test files / 896 tests
- `npm run verify` passed locally on 2026-04-30 after adding a dry-run adapter
  `settle` API that maps completed/paused outcomes through the runtime event
  spine. Current local acceptance status: 127 test files / 894 tests
- `npm run verify` passed locally on 2026-04-30 after adding an explicit
  executor lifecycle settle-result contract for completed/failed/paused adapter
  outcomes. Current local acceptance status: 127 test files / 893 tests
- `npm run verify` passed locally on 2026-04-30 after wiring renderer recovery
  intent presentation to structured manual-run/checkpoint/no-auto-replay
  fields. Current local acceptance status: 127 test files / 892 tests
- `npm run verify` passed locally on 2026-04-30 after wiring renderer recovery
  safety presentation to structured `automaticReplayAllowed=false` replay
  reviews. Current local acceptance status: 127 test files / 892 tests
- `npm run verify` passed locally on 2026-04-30 after adding structured
  `automaticReplayAllowed=false` to agent session replay reviews. Current local
  acceptance status: 127 test files / 892 tests
- `npm run verify` passed locally on 2026-04-30 after covering no-status
  settlement apply results at the lifecycle service boundary. Current local
  acceptance status: 127 test files / 892 tests
- `npm run verify` passed locally on 2026-04-30 after covering assembled
  lifecycle service heartbeat observations as no-status-change diagnostics.
  Current local acceptance status: 127 test files / 892 tests
- `npm run verify` passed locally on 2026-04-30 after covering heartbeat
  observations as service-level no-status-change settlement diagnostics.
  Current local acceptance status: 127 test files / 891 tests
- `npm run verify` passed locally on 2026-04-30 after covering lifecycle
  service access to structured settlement apply results. Current local
  acceptance status: 127 test files / 890 tests
- `npm run verify` passed locally on 2026-04-30 after adding structured fields
  to executor lifecycle settlement apply results. Current local acceptance
  status: 127 test files / 890 tests
- `npm run verify` passed locally on 2026-04-30 after covering assembled
  lifecycle service settlement diagnostics from the factory path. Current local
  acceptance status: 127 test files / 890 tests
- `npm run verify` passed locally on 2026-04-30 after covering lifecycle
  service access to planned settlement diagnostics. Current local acceptance
  status: 127 test files / 890 tests
- `npm run verify` passed locally on 2026-04-30 after carrying structured
  settlement diagnostics on planned lifecycle observations. Current local
  acceptance status: 127 test files / 890 tests
- `npm run verify` passed locally on 2026-04-30 after adding structured
  executor lifecycle settlement diagnostics for no-status and status-update
  plans. Current local acceptance status: 127 test files / 890 tests
- `npm run verify` passed locally on 2026-04-30 after renaming service
  settlement helpers to make the checkpoint-backed session boundary explicit.
  Current local acceptance status: 127 test files / 890 tests
- `npm run verify` passed locally on 2026-04-30 after covering DecisionService
  checkpoint-backed agent session selection with created-time tie-breaking.
  Current local acceptance status: 127 test files / 890 tests
- `npm run verify` passed locally on 2026-04-30 after covering RunService
  checkpoint-backed agent session selection with created-time tie-breaking.
  Current local acceptance status: 127 test files / 890 tests
- `npm run verify` passed locally on 2026-04-30 after covering created-time
  tie-breaking for checkpoint-backed agent session recovery selection. Current
  local acceptance status: 127 test files / 890 tests
- `npm run verify` passed locally on 2026-04-30 after covering created-time
  tie-breaking for continuable agent session recovery selection. Current local
  acceptance status: 127 test files / 889 tests
- `npm run verify` passed locally on 2026-04-30 after covering completed,
  failed, and cancelled agent sessions as terminal evidence review only.
  Current local acceptance status: 127 test files / 888 tests
- `npm run verify` passed locally on 2026-04-30 after explicitly covering
  needs-confirmation agent sessions as checkpoint-backed settlement only, with
  autoReplay disabled. Current local acceptance status: 127 test files / 888
  tests
- `npm run verify` passed locally on 2026-04-30 after adding a shared type
  guard for unsupported lifecycle control errors. Current local acceptance
  status: 127 test files / 888 tests
- `npm run verify` passed locally on 2026-04-30 after adding a structured
  diagnostic object for typed unsupported lifecycle control errors. Current
  local acceptance status: 127 test files / 888 tests
- `npm run verify` passed locally on 2026-04-30 after covering lifecycle
  service access to typed unsupported-control error summaries. Current local
  acceptance status: 127 test files / 888 tests
- `npm run verify` passed locally on 2026-04-30 after adding a shared formatter
  for typed unsupported lifecycle control errors. Current local acceptance
  status: 127 test files / 888 tests
- `npm run verify` passed locally on 2026-04-30 after covering typed
  unsupported lifecycle control errors propagating through dry-run adapter and
  service layers without recording evidence. Current local acceptance status:
  127 test files / 888 tests
- `npm run verify` passed locally on 2026-04-30 after adding a typed
  unsupported executor lifecycle control error while preserving the existing
  fail-closed message. Current local acceptance status: 127 test files / 888
  tests
- `npm run verify` passed locally on 2026-04-30 after covering dry-run
  executor handles that advertise no lifecycle control support. Current local
  acceptance status: 127 test files / 888 tests
- `npm run verify` passed locally on 2026-04-30 after routing AI config
  executor lifecycle availability through the main-process lifecycle service
  factory projection. Current local acceptance status: 127 test files / 887
  tests
- `npm run verify` passed locally on 2026-04-30 after allowing the lifecycle
  service factory availability projection to describe partial or absent control
  support. Current local acceptance status: 127 test files / 887 tests
- `npm run verify` passed locally on 2026-04-30 after centralizing executor
  lifecycle control request ordering in a shared contract constant. Current
  local acceptance status: 127 test files / 886 tests
- `npm run verify` passed locally on 2026-04-30 after adding a shared
  executor lifecycle control support predicate for adapter preflight checks.
  Current local acceptance status: 127 test files / 886 tests
- `npm run verify` passed locally on 2026-04-30 after covering assembled
  lifecycle service fail-closed heartbeat controls when no handle controls are
  supported. Current local acceptance status: 127 test files / 886 tests
- `npm run verify` passed locally on 2026-04-30 after covering service-level
  fail-closed heartbeat controls when an executor handle advertises no
  lifecycle controls. Current local acceptance status: 127 test files / 885
  tests
- `npm run verify` passed locally on 2026-04-30 after covering absent
  executor lifecycle control support in dry-run availability diagnostics.
  Current local acceptance status: 127 test files / 884 tests
- `npm run verify` passed locally on 2026-04-30 after covering partial
  executor lifecycle control support in dry-run availability summaries.
  Current local acceptance status: 127 test files / 883 tests
- `npm run verify` passed locally on 2026-04-30 after covering partial
  executor lifecycle control support in Runs recovery safety diagnostics.
  Current local acceptance status: 127 test files / 883 tests
- `npm run verify` passed locally on 2026-04-30 after covering partial
  executor lifecycle control support in Task detail orchestration readiness.
  Current local acceptance status: 127 test files / 883 tests
- `npm run verify` passed locally on 2026-04-30 after covering partial
  executor lifecycle control support in the Settings orchestration diagnostics
  surface. Current local acceptance status: 127 test files / 883 tests
- `npm run verify` passed locally on 2026-04-30 after covering partial
  executor lifecycle control support in renderer diagnostics. Current local
  acceptance status: 127 test files / 882 tests
- `npm run verify` passed locally on 2026-04-30 after allowing dry-run
  executor lifecycle availability diagnostics to describe partial control
  support. Current local acceptance status: 127 test files / 881 tests
- `npm run verify` passed locally on 2026-04-30 after moving unsupported
  lifecycle control guard tests to start-input partial support. Current local
  acceptance status: 127 test files / 880 tests
- `npm run verify` passed locally on 2026-04-30 after allowing dry-run
  lifecycle handles to advertise partial control support from start input.
  Current local acceptance status: 127 test files / 880 tests
- `npm run verify` passed locally on 2026-04-30 after centralizing executor
  lifecycle control support listing for handles and diagnostics. Current local
  acceptance status: 127 test files / 879 tests
- `npm run verify` passed locally on 2026-04-30 after centralizing executor
  lifecycle control support guards in the shared lifecycle contract. Current
  local acceptance status: 127 test files / 878 tests
- `npm run verify` passed locally on 2026-04-30 after covering unsupported
  executor lifecycle control requests through the default dry-run service
  factory. Current local acceptance status: 127 test files / 877 tests
- `npm run verify` passed locally on 2026-04-30 after covering fail-closed
  executor lifecycle control handling at the monitor/service boundary. Current
  local acceptance status: 127 test files / 876 tests
- `npm run verify` passed locally on 2026-04-30 after adding fail-closed
  executor lifecycle control capability checks. Current local acceptance
  status: 127 test files / 874 tests
- `npm run verify` passed locally on 2026-04-30 after adding Settings and Runs
  App coverage for the dry-run executor lifecycle control-request diagnostic.
  Current local acceptance status: 127 test files / 872 tests
- `npm run verify` passed locally on 2026-04-30 after adding dry-run control
  request support to executor lifecycle availability diagnostics. Current
  local acceptance status: 127 test files / 872 tests
- `npm run verify` passed locally on 2026-04-30 after covering typed executor
  lifecycle control planning through the default dry-run service factory.
  Current local acceptance status: 127 test files / 872 tests
- `npm run verify` passed locally on 2026-04-30 after threading typed executor
  lifecycle control requests through the monitor/service planned-observation
  boundary. Current local acceptance status: 127 test files / 871 tests
- `npm run verify` passed locally on 2026-04-30 after adding typed executor
  lifecycle control requests for heartbeat, interrupt, and cancel on the
  dry-run adapter boundary. Current local acceptance status: 127 test files /
  869 tests
- `npm run verify` passed locally on 2026-04-30 after centralizing renderer
  executor lifecycle diagnostic lines across Settings, Task detail, and Runs
  recovery surfaces. Current local acceptance status: 127 test files / 867
  tests
- `npm run verify` passed locally on 2026-04-30 after adding the
  status-sourced executor lifecycle diagnostic to Runs recovery safety.
  Current local acceptance status: 127 test files / 866 tests
- `npm run verify` passed locally on 2026-04-30 after surfacing the
  status-sourced executor lifecycle diagnostic in Task detail orchestration
  readiness. Current local acceptance status: 127 test files / 866 tests
- `npm run verify` passed locally on 2026-04-30 after carrying executor
  lifecycle availability through Main AI config status into Settings
  diagnostics. Current local acceptance status: 127 test files / 866 tests
- `npm run verify` passed locally on 2026-04-30 after adding blocked-reason and
  next-action executor lifecycle copy to the read-only Settings orchestration
  diagnostics card. Current local acceptance status: 127 test files / 866
  tests
- `npm run verify` passed locally on 2026-04-30 after surfacing dry-run
  executor lifecycle diagnostics inside the read-only Settings orchestration
  diagnostics card. Current local acceptance status: 127 test files / 866
  tests
- `npm run verify` passed locally on 2026-04-30 after adding shared read-only
  presentation helpers for executor lifecycle dry-run diagnostics. Current
  local acceptance status: 127 test files / 864 tests
- `npm run verify` passed locally on 2026-04-30 after adding structured
  blocked reasons and next-action guidance to the dry-run executor lifecycle
  availability summary. Current local acceptance status: 126 test files / 863
  tests
- `npm run verify` passed locally on 2026-04-30 after adding the dry-run
  executor lifecycle availability summary and fixing a date-sensitive
  blocker-source activity test baseline. Current local acceptance status: 126
  test files / 863 tests
- `npm run verify` passed locally on 2026-04-30 after adding the dry-run
  executor lifecycle service factory. Current local acceptance status: 126
  test files / 862 tests
- `npm run verify` passed locally on 2026-04-29 after adding the explicit
  executor lifecycle service boundary. Current local acceptance status: 125
  test files / 861 tests
- `npm run verify` passed locally on 2026-04-29 after adding the dry-run
  lifecycle planned-observation helper. Current local acceptance status: 124
  test files / 859 tests
- `npm run verify` passed locally on 2026-04-29 after adding explicit
  lifecycle settlement-plan application coverage. Current local acceptance
  status: 124 test files / 859 tests
- `npm run verify` passed locally on 2026-04-29 after adding explicit
  lifecycle settlement planning to the dry-run monitor. Current local
  acceptance status: 124 test files / 858 tests
- `npm run verify` passed locally on 2026-04-29 after adding the dry-run
  executor lifecycle monitor and folding it into `accept:agent-runtime`.
  Current local acceptance status: 124 test files / 858 tests
- `npm run verify` passed locally on 2026-04-29 after adding the dry-run
  executor lifecycle adapter and folding `agent-executor` coverage into
  `accept:agent-runtime`. Current local acceptance status: 123 test files /
  856 tests
- `npm run verify` passed locally on 2026-04-29 after adding the shared
  executor lifecycle adapter contract and folding it into
  `accept:agent-runtime`. Current local acceptance status: 123 test files /
  854 tests
- `npm run verify` passed locally on 2026-04-29 after adding local-note
  terminal-event settlement coverage and fixing a date-sensitive dependency
  recovery test baseline. Current local acceptance status: 122 test files /
  849 tests
- `npm run verify` passed locally on 2026-04-28 after wiring
  `RunOrchestrator` to settle `AgentSession.status` from recorder terminal
  event projection when cancellation/interruption evidence is emitted. Current
  local acceptance status: 122 test files / 848 tests
- `npm run verify` passed locally on 2026-04-28 after adding shared runtime
  event to `AgentSession.status` projection for heartbeat, paused, completed,
  failed, interrupted, and cancelled events. Current local acceptance status:
  122 test files / 847 tests
- `npm run verify` passed locally on 2026-04-28 after adding executor liveness
  and interruption session events (`session.heartbeat`,
  `session.interrupted`, `session.cancelled`) to the event spine, recorder, and
  RunStep mapper.
- `npm run verify` passed locally on 2026-04-28 after adding the main-process
  agent-session settlement projection for checkpoint-backed versus
  liveness-required sessions. Current local acceptance status: 122 test files /
  845 tests
- `npm run verify` passed locally on 2026-04-28 after adding shared recovery
  intent projection and manual recovery run-instruction prefill from Runs back
  to Tasks.
- `npm run verify` passed locally on 2026-04-28 after adding the shared
  read-only orchestration presentation helper and coverage for hidden tool
  families, automation readiness without automatic start, and the manual
  sandbox producer view.
- `npm run verify` passed locally on 2026-04-27 after tightening Code Agent
  model-context gates, checkpoint-backed session settlement, stale
  resume-payload UI/backend gating, supported resume-input validation,
  scheduler checkpoint-state exclusion, and browser controlled Decision
  consequence wording, Code Agent checkpoint recovery guidance, and approved
  checkpoint evidence wording, plus release-preflight and Code Agent
  model-producer preflight secret-redaction / shell-env override coverage,
  default local-smoke skip-boundary coverage, and inspect-first/new-run
  recovery for active, checkpoint-missing, or failed agent sessions.
- `npm run smoke:release:mac` passed locally on 2026-04-27 for the combined
  unsigned macOS package path after the Code Agent context-gate and
  restart/replay safety updates
- `npm run accept:release:mac-preflight` passed locally on 2026-04-27 and
  confirmed the read-only signed/notarized release prerequisite state:
  `notarytool`, app id, product name, and mac targets are present, while
  Developer ID signing and Apple notarization credentials remain missing; no
  signing, notarization, upload, or Apple network request was performed
- `npm run accept:release:mac-preflight` was re-run locally on 2026-04-27 after
  the checkpoint evidence wording pass with the same expected read-only result:
  status remains `not-ready` until Developer ID signing and Apple notarization
  credentials are configured.
- Release preflight script coverage now also locks the `CSC_LINK` path: strict
  mode fails closed when a certificate link is configured without
  `CSC_KEY_PASSWORD`, and the test asserts secret-like certificate/password
  values are not printed.
- The same release preflight coverage now verifies the configured `CSC_LINK` /
  `CSC_KEY_PASSWORD` happy path only prints redacted `<set>` markers for those
  sensitive values.
- Release preflight tests now also prove shell environment variables override
  `.env` values for signing inputs while still redacting both sources from
  output.
- `npm run accept:agent-local` passed locally after adding the sandbox-coding
  acceptance gate
- `npm run accept:provider-native-live:preflight` reports the current local
  provider-native setup is ready; live provider validation remains opt-in
  because it spends configured provider credit.
- Provider-native live acceptance coverage now also has a no-credit preflight
  unit path under the live Vitest config: shell environment values override
  `.env`, printed readiness stays redacted, and the actual provider call test
  remains opt-in/skipped unless the preflight is ready and the acceptance
  command is run deliberately.
- Code Agent model-producer preflight coverage now verifies shell environment
  values override `.env`, readiness output keeps API keys redacted, stale
  secret-like `.env` values do not leak, and no provider request, Docker probe,
  or workspace mutation is performed.
- Local smoke command boundary coverage now verifies sandbox producer preview,
  Code Agent model-producer live smoke, and Code Agent model-producer preview
  smoke stay skipped by default and report provider/Docker/workspace boundaries
  before any explicit env-gated local validation is run.
- Runs page recovery coverage now also asserts `live_status_unknown` running
  sessions with an active latest step route back to Tasks with inspect-first,
  no-auto-replay next-step wording.
- Runs page recovery coverage now also asserts paused agent sessions with no
  recovery checkpoint are treated as `checkpoint_missing`: no paused-run
  continuation button is shown, and task recovery is evidence-review first.
- Runs page recovery coverage now also asserts failed agent sessions route to
  new-run recovery wording from Run evidence, not replay or continuation.
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
- `npm run verify` passed locally on 2026-04-26 after adding producer-local
  event-to-RunStep projection: 81 test files / 590 tests
- `npm run verify` passed locally on 2026-04-26 after adding the injected
  sandboxed coding producer preview path: 81 test files / 592 tests
- `npm run verify` passed locally on 2026-04-26 after adding sandboxed coding
  producer integration coverage: 82 test files / 596 tests
- `npm run verify` passed locally on 2026-04-26 after adding sandboxed coding
  producer backend readiness gating: 83 test files / 601 tests
- `npm run verify` passed locally on 2026-04-26 after surfacing producer
  backend readiness in pre-run agent capability summaries: 83 test files / 602
  tests
- `npm run verify` passed locally on 2026-04-26 after covering unavailable
  producer backend readiness in the Settings IPC probe: 83 test files / 603
  tests
- `npm run accept:sandbox-coding` and `npm run verify` passed locally on
  2026-04-26 after adding shared execution policy validation: 83 test files /
  606 tests
- `npm test -- src/shared/agent-tool-scaffold.test.ts` and `npm run verify`
  passed locally on 2026-04-26 after adding scaffold family summaries: 83 test
  files / 607 tests
- `npm test -- src/renderer/App.test.tsx -t "saves settings"` and
  `npm run verify` passed locally on 2026-04-26 after rendering scaffold
  diagnostics in Settings: 83 test files / 607 tests
- `npm test -- src/shared/agent-session-metadata.test.ts
  src/renderer/lib/agentCapabilities.test.ts
  src/main/domain/run/sandboxed-coding-producer.test.ts`,
  `npm run accept:sandbox-coding`, and `npm run verify` passed locally on
  2026-04-26 after adding producer session metadata: 83 test files / 609 tests
- `npm test -- src/main/domain/run/sandboxed-coding-producer-persister.test.ts
  src/main/domain/run/sandboxed-coding-producer.test.ts`,
  `npm run accept:sandbox-coding`, and `npm run verify` passed locally on
  2026-04-26 after adding non-live producer preview persistence: 84 test files
  / 611 tests
- `npm test -- src/main/domain/run/sandboxed-coding-injected-producer-preview-service.test.ts
  src/main/domain/run/sandboxed-coding-injected-producer-preview-service.integration.test.ts`,
  `npm run accept:sandbox-coding`, and `npm run verify` passed locally on
  2026-04-26 after adding the injected producer preview service: 86 test files
  / 614 tests
- `npm test -- src/main/domain/run/temp-workspace-sandbox-provider.test.ts
  src/main/domain/run/sandboxed-coding-producer-backend.test.ts`,
  `npm run accept:sandbox-coding`, and `npm run verify` passed locally on
  2026-04-26 after adding the producer backend connection gate and tightening
  temp sandbox directory assertions: 86 test files / 616 tests
- `npm test -- src/main/domain/run/sandboxed-coding-producer-backend.test.ts`,
  `npm run accept:sandbox-coding`, and `npm run verify` passed locally on
  2026-04-26 after adding backend connection plans: 86 test files / 618 tests
- `npm test -- src/main/domain/run/sandboxed-coding-producer-backend.test.ts
  src/main/domain/run/sandboxed-coding-producer-persister.test.ts` passed
  locally on 2026-04-26 after mapping blocked backend connection plans into
  producer diagnostics that can be persisted through the preview persister
- `npm run accept:sandbox-coding` and `npm run verify` passed locally on
  2026-04-26 after adding blocked backend connection diagnostics: 86 test files
  / 620 tests
- `npm test -- src/main/domain/run/sandboxed-coding-producer-backend.test.ts`
  passed locally on 2026-04-26 after adding the producer backend launch
  envelope and fail-closed invariant validation
- `npm run accept:sandbox-coding` and `npm run verify` passed locally on
  2026-04-26 after adding the launch envelope: 86 test files / 623 tests
- `npm test -- src/main/domain/run/sandboxed-coding-producer-backend-preflight-service.test.ts`
  passed locally on 2026-04-26 after adding the producer backend preflight
  service that returns ready envelopes and persists blocked diagnostics
- `npm run accept:sandbox-coding` and `npm run verify` passed locally on
  2026-04-26 after adding the backend preflight service: 87 test files / 626
  tests
- Added `docs/AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md` as the accepted review
  gate before connecting the first real sandboxed coding producer runner
- `npm test -- src/main/domain/run/local-container-sandboxed-coding-producer-runner.test.ts`
  passed locally on 2026-04-26 after adding the local-container producer runner
  adapter with injected producer loop and injected command runner
- `npm run accept:sandbox-coding` and `npm run verify` passed locally on
  2026-04-26 after adding the local-container producer runner adapter: 88 test
  files / 629 tests
- `npm test -- src/main/domain/run/local-container-sandboxed-coding-producer-preview-service.test.ts`
  passed locally on 2026-04-26 after connecting backend preflight, local
  runner-session preparation, injected producer preview/persistence, and session
  disposal in a non-UI service
- `npm run accept:sandbox-coding` and `npm run verify` passed locally on
  2026-04-26 after adding the local-container producer preview service: 89 test
  files / 631 tests
- `npm run accept:sandbox-coding:producer-preview-smoke` passed locally on
  2026-04-26 in default skipped mode, and
  `TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true npm run
  accept:sandbox-coding:producer-preview-smoke` passed the non-live service
  wiring smoke with Docker not started, AI not called, and workspace unchanged
- The producer preview smoke now has a second explicit opt-in,
  `TASKPLANE_RUN_SANDBOX_PRODUCER_DOCKER_CHECKS=true`, for local Docker-backed
  `test` / `lint` checks; this path remains manual and was not run in the
  current Docker-unavailable environment
- `npm run accept:sandbox-coding:backend-preflight` passed locally on
  2026-04-26 with Docker Desktop available: backend ready,
  `dockerServer=29.3.1`
- `TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true
  TASKPLANE_RUN_SANDBOX_PRODUCER_DOCKER_CHECKS=true npm run
  accept:sandbox-coding:producer-preview-smoke` passed locally on 2026-04-26:
  Docker checks started, AI was not called, and the workspace stayed unchanged
- The first visible code-agent UI validation pass completed locally on
  2026-04-26: backend preflight ready with Docker Desktop, default/explicit
  producer preview smokes passed without external AI calls, Docker-check smoke
  passed with workspace unchanged, `npm run accept:sandbox-coding` passed with
  26 test files / 165 tests, and `npm run verify` passed with 90 test files /
  641 tests plus lint/build.
- `npm test -- src/main/ipc/handlers.test.ts src/main/preload.test.ts
  src/renderer/App.test.tsx src/main/domain/run/sandboxed-coding-staged-patch.test.ts`,
  `npm run lint`, `npm run build`, and `npm run accept:sandbox-coding` passed
  locally on 2026-04-26 after wiring the first manual Code Agent sandbox
  preview run path and excluding internal `session.json` manifests from staged
  patch collection.
- `npm test -- src/main/ipc/handlers.test.ts` and `npm run lint` passed locally
  on 2026-04-26 after bridging Code Agent source-ready previews into patch
  artifacts, `patch_promotion` checkpoints, and pending Decisions.
- `npm test -- src/main/domain/run/local-container-sandboxed-coding-producer-execution-service.test.ts`
  passed locally on 2026-04-26 after adding the explicit local-container
  producer execution service with operator confirmation before Docker probing
- `npm run accept:sandbox-coding` and `npm run verify` passed locally on
  2026-04-26 after adding the explicit execution service: 90 test files / 634
  tests
- Added `docs/AGENT_EXECUTION_SANDBOX_PRODUCER_INVOCATION_DECISION.md` to keep
  the explicit local-container producer execution service limited to tests,
  manual smoke, and future CLI/manual operator calls; Task/Run UI and prompt
  exposure remain deferred
- `npm test -- src/main/domain/run/code-agent-staged-file-plan.test.ts
  src/main/ipc/handlers.test.ts`, `npm run accept:sandbox-coding`,
  `npm run lint`, `npm run build`, and full `npm test -- --reporter=dot`
  passed locally on 2026-04-26 after adding the Code Agent staged-file plan
  contract: 91 test files / 649 tests in the full pass
- `npm test -- src/main/domain/run/code-agent-model-producer-loop.test.ts
  src/main/domain/run/code-agent-staged-file-plan.test.ts`, `npm run
  accept:sandbox-coding`, `npm run lint`, and `npm run build` passed locally on
  2026-04-26 after adding the injected non-live model producer loop adapter:
  28 sandbox-coding files / 174 tests
- `npm test -- src/main/domain/run/code-agent-model-producer-runtime.test.ts
  src/main/domain/run/code-agent-model-producer-loop.test.ts
  src/main/domain/run/code-agent-staged-file-plan.test.ts`, `npm run
  accept:sandbox-coding`, `npm run lint`, and `npm run build` passed locally on
  2026-04-26 after adding the default-closed provider runtime factory: 29
  sandbox-coding files / 177 tests
- `npm test -- src/main/ipc/handlers.test.ts
  src/main/domain/run/code-agent-model-producer-runtime.test.ts
  src/main/domain/run/code-agent-model-producer-loop.test.ts
  src/main/domain/run/code-agent-staged-file-plan.test.ts`, `npm run
  accept:sandbox-coding`, `npm run lint`, and `npm run build` passed locally on
  2026-04-26 after adding
  `TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER=true` as the explicit model
  producer opt-in for the manual Code Agent path.
- `npm run accept:sandbox-coding:model-producer-preflight` passed locally on
  2026-04-26 in current skip state, missing-env skip state, and temporary ready
  state; it reported readiness without provider calls, Docker probes, or
  workspace mutation. `npm run accept:sandbox-coding`, `npm run lint`, and
  `npm run build` passed afterward.
- `npm run accept:sandbox-coding:model-producer-live` passed locally on
  2026-04-26 in its default skipped state, after building main-process modules;
  it reported provider not called, Docker not started, and workspace unchanged.
  `npm run accept:sandbox-coding`, `npm run lint`, and `npm run build` passed
  afterward.
- Added `docs/CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md` as the proposed
  product-surface gate before any visible Task/Run code-agent mode or
  model-visible coding tools are built
- `npm test -- src/renderer/lib/agentCapabilities.test.ts
  src/renderer/App.test.tsx -t "sandbox producer|sandboxed coding producer"`
  passed locally on 2026-04-26 after making sandbox producer session
  capabilities truthful in Runs detail and covering staged source/check RunStep
  display
- `npm run verify` passed locally on 2026-04-26 after the Runs detail sandbox
  producer display update: 90 test files / 635 tests
- `npm test -- src/renderer/App.test.tsx -t "blocked sandbox producer diagnostics|sandbox producer session policy"`
  passed locally on 2026-04-26 after covering Runs detail display for blocked
  sandbox producer diagnostics as well as source-ready producer sessions
- `npm run verify` passed locally on 2026-04-26 after adding blocked sandbox
  producer diagnostics coverage: 90 test files / 636 tests
- Added `docs/CODE_AGENT_MODE_UI_TASK_BREAKDOWN.md` as a planning-only task
  sequence for the future visible code-agent mode; implementation remains gated
  on accepting the product surface decision
- `npm run release:mac:preflight` currently reports the host has `notarytool`
  and package metadata, but is not ready for signed/notarized release because
  Developer ID and Apple notarization credentials are not configured
- `npm run accept:release:mac-preflight` passed locally on 2026-04-27 and
  confirmed the same read-only state: `notarytool`, app id, product name, and
  mac targets are present, while Developer ID signing and Apple notarization
  credentials remain missing. It performed no signing, notarization, upload, or
  Apple network request.
- `npm run smoke:release:mac` passed locally on 2026-04-27 after the Code
  Agent context-gate and restart/replay safety updates: Electron native modules
  were rebuilt, the unsigned/ad-hoc `release/mac-arm64/Taskplane.app` was
  generated, package smoke/code-sign verification passed, and runtime smoke
  launched the packaged app with isolated user data and initialized config plus
  SQLite schema.
- `npm run smoke:build` and `npm run smoke:release:mac` passed locally on
  2026-04-26 after the Code Agent preflight/check-availability UI slice: the
  unsigned/ad-hoc macOS package was generated, code-sign verified, launched with
  isolated `TASKPLANE_USER_DATA_DIR`, and initialized `config.json` plus the core
  SQLite schema without GitHub Actions or Apple notarization credentials.
- `accept:agent-local` now includes `accept:sandbox-coding:code-agent-ui`, so
  the local agent acceptance gate covers the visible Code Agent preflight
  summary, package-script availability filtering, and IPC recheck in addition
  to the sandbox/code-agent domain boundary.

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
5. Treat the execution-layer Slice 0, hidden tool-scaffold baseline,
   provider-backed disposable-workspace Code Agent preview, real Task detail
   Code Agent UI layout pass, Code Agent lifecycle recovery/evidence slice, and
   manual Browser / Playwright Tier 1 smoke plus its operator-started Runs UI
   entrypoint as locally accepted for the alpha path. The T8 operator-started
   Code Agent boundary, shared connector policy/evidence records, read-only
   orchestration O1-O4 sequence, Code Agent O5 recovery helper layer, and
   Browser Evidence Tier 1 review helpers are now implemented locally.
   Browser Controlled Interaction BCI1-BCI6 are locally accepted for the
   local-QA path, and BCR1-BCR6 plus the dev-app resume review fixture are
   locally accepted for checkpoint-approved local-QA resume. Default local-smoke
   skip boundaries are now covered for provider/Docker/workspace safety, so the
   next execution task should keep the completed read-only orchestration UI
   stable and move into any remaining executor/session interruption,
   inspect-first recovery, and manual new-run preparation gaps, not broad
   browser/MCP/computer-use model exposure;
   do not expose browser, MCP, computer-use, skills, or creator connector tools
   to the model until that connector-specific slice is explicitly accepted.
6. For Code Agent model context, keep source-context content limited to the
   explicit opt-in stored-snapshot path; keep artifact, browser, MCP, Skills,
   retrieval, and external URL fetching out of that slice.
7. Keep task-attached artifact selection manifest-only; do not send artifact or
   run-output content to the model until a later kind-specific policy is
   accepted.

See [ALPHA_ACCEPTANCE.md](ALPHA_ACCEPTANCE.md) for the manual checklist and [ALPHA_ACCEPTANCE_ASSESSMENT.md](ALPHA_ACCEPTANCE_ASSESSMENT.md) for the current coverage assessment.
See [AGENT_EXECUTION_LAYER_DESIGN.md](AGENT_EXECUTION_LAYER_DESIGN.md) for the next execution-layer design spine.
See [AGENT_EXECUTION_ORCHESTRATION_UI_DESIGN.md](AGENT_EXECUTION_ORCHESTRATION_UI_DESIGN.md) for the completed first read-only orchestration UI slice and the next stability boundary.
See [AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md](AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md) for the browser evidence lane boundary.
See [AGENT_EXECUTION_BROWSER_CONTROLLED_RESUME_ACCEPTANCE_PLAN.md](AGENT_EXECUTION_BROWSER_CONTROLLED_RESUME_ACCEPTANCE_PLAN.md) for the next checkpoint-approved browser resume boundary.
See [AGENT_EXECUTION_BROWSER_CONTROLLED_RESUME_MANUAL_REVIEW.md](AGENT_EXECUTION_BROWSER_CONTROLLED_RESUME_MANUAL_REVIEW.md) for the packaged/manual review checklist before any broader browser connector work.
