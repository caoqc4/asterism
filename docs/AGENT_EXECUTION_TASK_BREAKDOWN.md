# Agent Execution Task Breakdown

## Status

Active task breakdown for the execution-layer work after the reference
architecture reassessment.

Read first:

- [AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)
- [AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md](AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md)
- [AGENT_EXECUTION_LAYER_V2_DECISION.md](AGENT_EXECUTION_LAYER_V2_DECISION.md)
- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
- [AGENT_EXECUTION_FUTURE_DESIGN.md](AGENT_EXECUTION_FUTURE_DESIGN.md)
- [AGENT_EXECUTION_LAYER_ROADMAP.md](AGENT_EXECUTION_LAYER_ROADMAP.md)
- [AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md](AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md)
- [AGENT_EXECUTION_ORCHESTRATION_PLAN.md](AGENT_EXECUTION_ORCHESTRATION_PLAN.md)
- [AGENT_EXECUTION_ORCHESTRATION_UI_DESIGN.md](AGENT_EXECUTION_ORCHESTRATION_UI_DESIGN.md)
- [AGENT_EXECUTION_OPERATOR_STARTED_RUN_DECISION.md](AGENT_EXECUTION_OPERATOR_STARTED_RUN_DECISION.md)
- [AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md](AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md)
- [AGENT_EXECUTION_BROWSER_TIER1_ACCEPTANCE_CHECKLIST.md](AGENT_EXECUTION_BROWSER_TIER1_ACCEPTANCE_CHECKLIST.md)
- [AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_DECISION.md](AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_DECISION.md)

## First-Principles Rule

Taskplane's execution layer should make task work recoverable and reviewable.
It should not become a generic agent shell.

The product control plane remains:

```text
Task -> Run -> AgentSession -> RunStep -> Checkpoint / Decision -> Artifact -> Timeline
```

Pi is the main inner-loop reference. OpenClaw is the main embedding reference.
Multica is the main task-management-to-runtime control-plane reference. All are
references, not runtime dependencies for this phase.

## Current Implementation Baseline

Completed:

- typed `AgentSessionEvent` shared types
- `mapAgentRuntimeEventToRunStep`
- text run plan/model/final writes routed through event-to-step mapping
- agent session terminal result steps routed through event-to-step mapping
- `AgentRunLoop` emits plan, tool-start, tool-result, checkpoint, paused,
  completed, and failed runtime events
- `AgentSessionEventRecorder` projects session-start, plan, tool-start,
  tool-result/failure, checkpoint-created, pause, completion, and failure
  events into RunSteps for real local/provider-native agent sessions; started
  tool steps are updated to completed/failed when the matching result event
  arrives
- tool-permission checkpoints surface `checkpointKind` and linked `decisionId`
  through `checkpoint.created` events
- resume checkpoint payloads include `runId` and a policy snapshot, and paused
  run continuation passes the snapshot back into tool execution
- paused run continuation rejects stale or incompatible resume payload versions,
  kinds, run ids, task ids, and policy snapshots before executing a tool
- resume checkpoint payload validation is now shared in
  `run-checkpoint-payload`, so RunService and future UI/diagnostics can rely on
  the same restart-safe contract
- tool-permission checkpoint creation is centralized in
  `AgentCheckpointRecorder`, covering RunCheckpoint, Decision, pending RunStep,
  and result metadata
- resume checkpoint creation also flows through `AgentCheckpointRecorder`,
  preserving the restart-safe payload shape
- `AgentCheckpointRecorder` now returns the canonical `checkpoint.created`
  event for each persisted checkpoint, so callers emit recorder-produced events
  instead of hand-assembling checkpoint events
- tool prompt/provider exposure is centralized in `agent-tool-exposure`, with
  text prompts and provider-native schemas consuming the same matrix
- sandbox decision accepted: Pi-coding-agent-like power is required for the
  AI programming lane, but broad code-agent mode remains deferred until a
  dedicated sandbox provider boundary exists
- post-Slice-0 future execution design drafted, covering side quests, replay,
  sandbox provider boundary, human feedback routing, and MCP constraints
- provider-native safe-read path remains gated and locally tested
- workspace write/command tools remain registry-only and Decision-gated
- local-container targeted checks now run against a container-internal merged
  workspace/staging work tree, so `test` / `lint` validate the candidate patch
  without mutating the selected workspace or staging root
- bounded workspace-context input for sandboxed model-producer runs is wired
  into the Task detail Code Agent panel and validated through a real
  disposable-workspace model-backed UI pass
- Task detail now exposes a Code Agent recovery card anchored on pending
  `workspace.staged_patch` promotion Decisions, with Run lookup routed through
  the checkpoint when available
- the recovery card can also prepare a bounded Code Agent rerun intent without
  automatically starting the run or spending provider credit
- Runs / Staged Patch Review now exposes a persisted evidence checklist for
  source evidence, targeted checks, promotion Decision, and workspace mutation
  state
- Runs can route a staged patch review back to the Task Code Agent input
  surface with a bounded rerun intent, without automatically starting execution
- staged patch review now derives a next review move from failed checks,
  missing/open Decisions, applied patches, and deferred/no-write workspace
  states
- the next lane decision is drafted for Browser / Playwright read-only
  evidence; it keeps browser tools hidden and names shared evidence-contract
  types as the next code slice
- Browser Evidence Contract B1 is implemented as shared types and validation
  tests only; no browser runtime, UI, IPC, provider exposure, or network call is
  enabled
- Browser read-only preflight B2 is implemented as a shared helper that reports
  reserved/hidden state, configured origin count, no browser start, and no
  network call
- Settings surfaces the B2 preflight as read-only diagnostics without adding a
  run control or starting browser/network activity
- B3 runner-smoke fixture contract is implemented without starting browser or
  network activity; it prepares local HTML, an allowlisted origin, expected
  read-only artifacts, and a validated request
- `npm run manual:browser-evidence-fixture` materializes the B3 fixture files
  for future runner smoke validation without starting a browser or making
  network calls
- `npm run manual:browser-evidence-smoke` now performs the first real Tier 1
  Playwright smoke: a disposable local HTTP fixture, isolated Chromium context,
  browser-level allowlist routing, page-summary/visible-text/screenshot
  artifacts, no credentials, no mutation, and no model-visible tool exposure
- Browser Evidence B4 has its first persistence building block:
  `browser_evidence` artifacts can be created from Runs, and
  `BrowserEvidencePersister` records capture plus artifact RunSteps without
  exposing browser control to the model
- Runs detail now shows a Browser Evidence review card for persisted
  `browser_evidence` artifacts, including URL, artifact kinds, artifact id,
  summary, screenshot path, and a reminder to review evidence before enabling
  controlled interaction
- the shared operator-started run contract is implemented for
  `browser_evidence_smoke`, `code_agent_preview`, and `sandbox_patch_review`;
  it requires explicit operator confirmation, hidden model exposure, no
  scheduler start, no provider call by default, and descriptor/policy alignment
- `OperatorStartedRunService` now implements the first concrete service entry
  for `browser_evidence_smoke`: create Run, record accepted RunStep, call an
  injectable browser-evidence executor, persist captured evidence, and mark the
  Run completed or failed without exposing scheduler/provider/model tools
- Runs / Action Desk can now manually start the operator-started Browser
  Evidence smoke through IPC. The UI builds the shared
  `OperatorStartedRunRequest`, preserves hidden model exposure, keeps scheduler
  and provider calls disabled, and opens the resulting Run for evidence review
- the Browser / Playwright decision has been rechecked against public Codex,
  OpenClaw, Multica, CoWork OS, Hermes, Vercel `agent-browser`, Microsoft
  Foundry, and Pause references; the chosen boundary is no longer "read-only
  forever", but a tiered web capability ladder starting with isolated
  read-only evidence and reserving controlled interaction for a separate
  policy decision
- the Tier 2 Browser Controlled Interaction draft decision now defines the
  future click/type/select policy, allowed local-dev and creator-preparation
  flows, side-effect checkpoint rules, and the explicit non-goal of broad
  authenticated real-world browser action

Pi reference boundary:

- implemented: Taskplane-owned small loop, typed runtime events,
  event-to-RunStep projection, tool registry execution, policy gates,
  checkpoint/Decision pauses, and restart-safe resume validation
- not implemented: Pi runtime embedding, Pi compatibility, Pi coding-agent
  Read/Write/Edit/Bash defaults, session branching, compaction, side quests,
  and full replay/idempotency
- required next: tighten the Taskplane-owned coding-agent lane lifecycle around
  source evidence, staged edits, targeted checks, patch artifacts, Decision
  review, and rerun/recovery affordances
- scaffold baseline: MCP, browser/Playwright, skills, computer-use, creator
  connectors, and future tool families now have common descriptor, exposure,
  execution-policy, session, artifact, checkpoint, credential, and diagnostic
  summary contracts before lane-specific exposure

Still incomplete:

- no known Slice 0 blocker remains
- the next execution-layer phase should continue the sandboxed coding lane from
  the accepted producer/source/preview/backend-readiness/model-backed UI work,
  not direct host shell/file access
- the next orchestration phase should start with read-only
  `ExecutionRuntime`, `AgentProfile`, `OrchestrationRequest`, and
  `AgentRunLifecycle` snapshots before queue/claim or automatic-start behavior

## Task Sequence

### T0: Keep Slice 0 Documentation Aligned

Goal: keep the current implementation sequence visible and bounded.

Work:

- maintain this task breakdown
- link it from the roadmap and project status
- keep the Pi/OpenClaw/Multica distinction in the execution-layer docs

Acceptance:

- docs name the next implementation task unambiguously
- docs do not imply broad workspace write/command exposure is available
- docs still say no external framework is adopted as a runtime dependency
- docs treat automatic start as a future skill/process-policy outcome, not as a
  blanket side effect of assignment

### T1: AgentRunLoop Event Emitter

Goal: make `AgentRunLoop` produce runtime events as it plans, starts tools,
finishes tools, fails tools, pauses, and completes.

Why:

Pi's strongest lesson is the small inner loop with granular lifecycle/tool
events. Taskplane needs the same shape, but projected into RunStep,
Checkpoint, Decision, Artifact, and Timeline.

Work:

- add a narrow event sink/callback to `AgentRunLoop`
- emit `plan.proposed` when execution plan is selected
- emit `tool.started` before registry execution
- emit `tool.completed` / `tool.failed` after registry execution
- emit `checkpoint.created` when the loop creates a resume checkpoint
- emit `session.paused`, `session.completed`, or `session.failed` at terminal
  loop result
- keep existing run-step writes until parity tests prove the event path can
  replace them

Acceptance:

- existing local agent behavior does not change
- unit tests assert emitted events for completed, failed, paused, and
  needs-confirmation paths
- `npm test -- src/main/domain/run/agent-run-loop.test.ts` passes
- `npm run accept:agent-local` subcommands pass locally

### T2: Event-Driven RunStep Projection For AgentRunLoop

Goal: move AgentRunLoop-visible plan/tool/session steps behind the event mapper.

Why:

The current code still writes many RunSteps directly. The runtime boundary will
be easier to resume and inspect if event projection is the default path.

Work:

- introduce a small `AgentSessionEventRecorder` or equivalent helper near
  `RunOrchestrator` / `AgentExecutor`
- route loop-emitted plan/tool/session events through
  `mapAgentRuntimeEventToRunStep`
- preserve current user-facing Chinese titles where product tests depend on
  them
- remove duplicated direct RunStep writes only when coverage proves parity

Acceptance:

- run detail still shows readable plan/tool/checkpoint/final steps
- provider-native and text-only paths still settle the same way
- no duplicate noisy steps in common completed runs
- `npm run accept:provider-native-tools` passes
- `npm run verify` passes

### T3: Checkpoint Event Normalization

Goal: make checkpoint creation flow through `checkpoint.created` before it
becomes `RunCheckpoint` and pending `Decision`.

Why:

LangGraph, Microsoft Agent Framework, CrewAI, and OpenClaw all point to the
same principle: pause/resume must be a first-class runtime event, not a special
case hidden in a tool.

Work:

- define a checkpoint event handling boundary
- normalize resume checkpoints and confirmation checkpoints through that
  boundary
- keep payload versioning compatible with existing v1 helpers
- link `checkpoint.created` events to the created checkpoint id and optional
  Decision id

Acceptance:

- approval, deferral, and cancellation continue to settle runs clearly
- existing workspace patch and command checkpoint flows still work
- high-risk completion-criterion checkpoint still works
- tests assert checkpoint event projection
- `npm run accept:workspace-patch` passes

### T4: Restart-Safe Resume Contract

Goal: prove a pending checkpoint can survive app/service restart and resume
exactly one pending action.

Why:

Durability is the smallest valuable v2 increment. A paused agent run is only
useful if Taskplane can explain and resume it after restart.

Work:

- extend checkpoint payloads to include:
  - run id / session id
  - next tool or continuation target
  - validated input
  - policy snapshot relevant to the pending action
  - user-visible reason
  - linked Decision id when applicable
- add integration tests that create services from persisted SQLite state before
  approving/resuming
- fail safely for stale or incompatible payload versions

Acceptance:

- approved Decisions resume exactly one pending action
- deferred/cancelled Decisions do not resume
- app restart does not lose pending reason, next action, or Decision link
- stale payloads fail with visible wording
- `npm run accept:agent-local` subcommands pass

### T5: Tool Exposure Matrix In Code

Goal: make registry availability, prompt/provider exposure, and runtime
execution permission explicit in code.

Why:

MCP and OpenAI Agents SDK are useful references, but they do not replace
Taskplane's policy layer. A tool can exist without being exposed or executable.

Work:

- introduce a shared exposure descriptor or helper
- use it from prompt construction and provider-native schema construction
- keep runtime policy checks as final authority
- assert workspace write/command tools are not exposed to normal model prompts
- assert provider-native denied write/command proposals fail closed

Acceptance:

- task read tools can be exposed
- workspace read tools require per-run opt-in
- task mutation tools require per-run opt-in
- workspace write/command tools remain unexposed
- provider-native unsafe proposals do not create checkpoints or mutate files
- `npm run accept:provider-native-tools` passes

### T6: Sandbox Decision Before Code-Agent Mode

Goal: write a separate sandbox decision before exposing broad coding-agent
execution.

Why:

OpenHands, SWE-agent, Plandex, Pi, and smolagents all show that code execution
is an environment-design problem before it is an agent-design problem.

Work:

- compare host process, Docker, and remote sandbox options
- define workspace root mount/read/write policy
- define environment variable and credential policy
- define network policy
- define command allowlist and timeout policy
- define output truncation, artifact promotion, and audit logging
- state whether Taskplane alpha will expose code-agent mode or keep it deferred

Acceptance:

- decision doc exists and is linked from roadmap
- no code-agent capability is exposed before the decision is accepted
- current registry-only write/command slices remain accurately described

### T7: Future Agent Execution Design

Goal: design the real post-Slice-0 execution layer after durability and sandbox
decisions are in place.

Potential inputs:

- Pi session branching / side quests
- OpenClaw session lanes and event bridge
- LangGraph replay/idempotency
- OpenHands sandbox providers
- SWE-agent ACI
- Plandex diff review
- CrewAI human feedback routing
- MCP external connector boundary

Non-goals until explicitly accepted:

- always-on autonomy
- cron/scheduled autonomous work
- messaging-channel execution
- browser/computer-control tools
- arbitrary shell
- skill marketplace
- external posting/email/calendar/social tools before connector-specific
  Decisions exist

### T8: Operator-Started Orchestration Boundary

Status: first service extraction accepted locally.

Goal: unify manually started runtime lanes without flattening their different
provider, sandbox, and confirmation policies.

Why:

Browser Evidence now uses `OperatorStartedRunService`, while Code Agent preview
still enters through a dedicated IPC handler. First principles say the common
unit is not "a button" and not "a model call"; it is an operator-started Run
that can state its policy before launch and project evidence back into
RunSteps, Artifacts, Checkpoints, Decisions, and Timeline. The Code Agent lane
also has a deliberate model-producer branch, so it cannot be naively forced
into the current `providerCallAllowed=false` Browser Evidence contract.

Work:

- split operator-started launch semantics into:
  - local/no-provider diagnostic runs
  - explicit provider-spending model-producer runs
  - future scheduler/automatic starts gated by skill/process policy
- keep Browser Evidence Tier 1 on the strict hidden/no-provider contract
- move manual Code Agent launch construction out of the IPC handler into a
  domain service boundary, while preserving the current `run:triggerCodeAgent`
  IPC contract
- record an operator-started acceptance RunStep for Code Agent local diagnostic
  previews only after the provider-call policy distinction is explicit
- keep model-backed Code Agent preview behind its existing explicit UI opt-in,
  selected context files, sandbox/Decision promotion, and provider-spend
  readiness checks

Acceptance:

- `run:triggerCodeAgent` handler delegates orchestration instead of owning the
  producer lifecycle directly
- local diagnostic Code Agent preview remains no-provider by default
- model-backed Code Agent preview still requires explicit `Use model producer`
  and does not inherit Browser Evidence's no-provider contract accidentally
- existing Code Agent UI tests and IPC tests still pass
- Browser Evidence operator-started UI remains unchanged
- `npm run accept:sandbox-coding:code-agent-ui` and `npm run verify` pass

Implementation note:

- `src/main/domain/run/code-agent-run-service.ts` owns manual Code Agent launch
  orchestration.
- `run:triggerCodeAgent` now delegates to `codeAgentRunService.trigger()`.
- Code Agent manual launches now write an `operator-started code-agent run
  accepted` RunStep that records `workspace.staged_patch`, producer branch,
  provider-call policy, and selected checks before producer execution.
- Dedicated service tests cover the key policy split: local diagnostic preview
  does not resolve provider runtime by default, disabled model-producer env
  blocks before execution, and invalid selected context blocks before producer
  execution.
- `npm run accept:sandbox-coding:code-agent-ui` and `npm run verify` passed
  after extraction.

## Recommended Next Implementation Task

Continue the executor/session boundary before adding more visible runtime
power.

T1 through T7 now have Slice 0 implementation or design coverage, the shared
tool scaffold exists, the sandbox patch draft source boundary is implemented,
the first producer design is drafted, the non-live producer scaffolding is in
place with integration coverage for source-ready, blocked, failed, and
empty-diff outcomes, and the first real model-backed Task detail UI pass has
validated bounded context, staged-file output, targeted checks, patch artifact
review, and pending promotion Decision creation.

The latest implementation slice:

- `AgentSessionStore` now exists as the domain-facing session persistence
  boundary, wrapping `AgentSessionRepository`.
- `RunService`, `RunOrchestrator`, sandboxed coding injected-producer preview,
  and sandboxed coding backend preflight now depend on the store boundary rather
  than direct repository construction.
- shared session metadata helpers now parse source metadata and provide a
  tool-family exposure summary for Runs detail; browser, computer-use, MCP, and
  creator connectors remain explicitly `not_exposed`
- shared restart hints now tell Runs detail whether to inspect completed/failed
  evidence, verify checkpoint evidence, or start a new Run
- shared replay review summaries now show Runs detail whether the latest agent
  session is inspect-only, manual-resume-only, or new-run recovery, while
  keeping automatic replay disabled and surfacing open checkpoint count;
  paused/confirmation sessions without an open checkpoint are treated as
  `checkpoint_missing` inspect-only recovery
- Runs `回到任务推进` now uses that replay review mode to prefill the task
  next-step draft, keeping manual-resume work anchored on checkpoint / Decision
  review instead of automatic replay
- Runs recovery now also has UI coverage for running sessions whose latest step
  is still active (`live_status_unknown`) and paused sessions with no open
  checkpoint (`checkpoint_missing`), so both routes stay inspect-first and
  no-auto-replay from Run evidence back into Task next-step recovery.
- Failed agent sessions now also have Runs-page recovery coverage that routes
  back to task work as new-run preparation from evidence rather than replay or
  continuation.
- Shared replay review now also projects a `Recovery intent` summary, separating
  inspect-only evidence review, manual checkpoint resume, and prepare-new-manual
  run paths while keeping `autoReplay=no`.
- Runs `回到任务推进` now uses the prepare-new-manual-run intent to prefill the
  task quick-run instructions with the latest failed/interrupted evidence; it
  still does not create or start a run automatically.
- Main-process session settlement now projects checkpoint-backed versus
  liveness-required sessions before updating `AgentSession` status, keeping
  stale `running` sessions out of checkpoint settlement paths.
- Runtime events now include `session.heartbeat`, `session.interrupted`, and
  `session.cancelled`; recorder and RunStep mapper tests keep heartbeat as
  running evidence and interruption/cancel as terminal evidence only.
- Shared event-status projection now maps terminal runtime events into
  `AgentSession.status` while leaving heartbeat non-mutating, giving future
  executor integration one settlement path.
- `RunOrchestrator` now consumes that terminal event projection when settling
  provider-native agent sessions, so emitted cancellation/interruption evidence
  can own the stored `AgentSession.status`.
- The first shared executor lifecycle adapter contract now exists for future
  real runtimes: `AgentExecutorSessionHandle` carries executor/session/runtime
  identity and supported control signals, lifecycle signals map heartbeat,
  interruption, cancellation, and completed/failed/paused settlement into the
  existing runtime event spine, and `accept:agent-runtime` covers the mapping.
  This is deliberately type/test only; no long-running process, queue worker,
  automatic start, or new model-visible tool exposure is enabled.
- A dry-run main-process lifecycle adapter now starts a controllable executor
  handle and observes lifecycle signals through that shared mapping. This keeps
  the adapter-facing interface testable before a real runtime is connected; it
  still does not launch a process, queue work, or grant additional tool
  authority.
- A dry-run lifecycle monitor now records those observed signals through
  `AgentSessionEventRecorder`, so the future adapter path already produces
  heartbeat/cancellation RunStep evidence and projected session status without
  directly settling `AgentSession` or launching a real runtime.
- The same monitor now returns an explicit settlement plan: heartbeat remains
  `no_status_change`, terminal lifecycle observations recommend
  `update_session_status`, and the service layer remains responsible for any
  actual `AgentSession` write.
- Settlement plans now have an explicit apply helper that leaves
  `no_status_change` untouched and updates `AgentSession.status` only when the
  service layer deliberately applies an `update_session_status` plan.
- The monitor can also return a planned observation in one call, keeping
  RunStep evidence, projected status, terminal marker, and settlement plan
  together while leaving settlement application explicit.
- A small `AgentExecutorLifecycleService` now wraps the monitor and status
  updater so future callers can observe/plan and apply settlement in two
  explicit service-layer steps.
- A default service factory now assembles the dry-run lifecycle service from
  repository/store dependencies as an injection point only; it is not wired into
  bootstrap, IPC, scheduler, queue, or model-visible execution.
- The factory now also reports a dry-run-only availability summary for future
  diagnostics, explicitly keeping runtime readiness, model exposure, automatic
  start, and queue worker authority disabled.
- The availability summary now includes structured blocked reasons and a next
  action, keeping future diagnostics explainable without implying real executor
  readiness.
- Shared executor lifecycle diagnostics now format that availability as
  read-only presentation copy and Settings surfaces it inside the existing
  `Orchestration Diagnostics` card, including blocked reasons and next action,
  without adding runtime entrypoints, automatic start, queue workers, or
  model-visible tools.
- Main-process AI config status now includes that executor lifecycle
  availability as passive diagnostics, keeping the Settings display sourced
  from status data rather than renderer-local assumptions.
- Task detail `Orchestration readiness` now consumes the same status-sourced
  executor lifecycle diagnostic, aligning the manual Code Agent intent surface
  with Settings without adding runtime authority.
- Runs detail `Run recovery safety` now consumes that same diagnostic during
  inspect-first recovery review, keeping replay/new-run decisions visibly
  separate from dry-run executor availability.
- Renderer orchestration presentation now has a shared line formatter for the
  executor lifecycle diagnostic, keeping Settings, Task detail, and Runs
  recovery copy aligned without adding authority.
- Decisions `回到任务推进` now preserves pending agent-checkpoint context in the
  task next-step draft, keeping workspace patch / command / staged patch / note
  confirmations anchored on evidence review before continuation
- Decisions `查看 Run 证据` now applies to all agent-checkpoint Decisions with a
  source checkpoint id, so patch and command confirmations can jump to their
  owning Run evidence without executing the pending action
- `agent-tool-scaffold` now builds connector policy records and local
  verification evidence requirements for every descriptor; Settings diagnostics
  show the verification-required count, and reserved connector families remain
  hidden from all model-visible channels
- Browser / Playwright Tier 1 now has an acceptance checklist drafted from
  those records:
  [AGENT_EXECUTION_BROWSER_TIER1_ACCEPTANCE_CHECKLIST.md](AGENT_EXECUTION_BROWSER_TIER1_ACCEPTANCE_CHECKLIST.md)
- Tier 2 controlled browser interaction now has shared schema-only coverage:
  allowed action names, policy, step draft, checkpoint payload shape, and
  validation live in `src/shared/types/browser-controlled-interaction.ts`.
  `browser.controlled_interaction` is still not registered in the tool scaffold
  and remains unavailable to prompts, provider-native tools, IPC, scheduler, and
  UI.
- `npm run manual:browser-controlled-fixture` now materializes the Tier 2
  local-dev QA fixture plan without starting a browser, opening a network
  connection, mutating a page, or exposing any model-visible browser tool.
  The fixture includes expected RunStep drafts for future runner comparison,
  but does not persist them.
- Browser Controlled Interaction local-QA execution and checkpoint-approved
  one-action resume are now locally accepted through manual smoke paths and
  review helpers, while remaining hidden from model-visible prompts, provider
  schemas, scheduler starts, authenticated profiles, and arbitrary URLs.
- Default local-smoke skip-boundary tests now lock the no-provider / no-Docker /
  no-workspace-mutation defaults for sandbox producer preview and Code Agent
  model-producer live/preview smoke commands.

The next implementation slice is:

- keep the completed read-only orchestration UI and recovery-intent layer
  stable: runtime/profile/lifecycle visibility, manual dispatch intent,
  restart/recovery review, Settings diagnostics, and manual recovery run
  prefill are now covered without any queue worker or automatic-start policy
- continue the executor/session boundary before adding more runtime power:
  next connect the shared lifecycle contract to an adapter-facing interface or
  dry-run fake executor, still without starting a real long-running runtime or
  exposing new tool authority
- keep recovery routed through inspect-first evidence review, checkpoint /
  Decision review, or explicit manual Run preparation rather than automatic
  replay
- keep browser, MCP, computer-use, skills, and creator connector tools hidden
  from model-visible channels until their connector-specific acceptance slices
  explicitly accept runtime authority, credentials, and side-effect policy

Do not expose Pi-style Read/Write/Edit/Bash powers, browser/computer control,
external posting, or social/media publishing as model-visible tools until the
real backend passes the shared eligibility gate and those other tool families
have their own sandbox or connector Decisions accepted.

## Verification Policy

GitHub Actions quota is unavailable, so use local verification:

```bash
npm test -- src/main/domain/run/agent-run-loop.test.ts
npm run accept:workspace-patch
npm run accept:domain-agent-tools
npm run accept:provider-native-tools
npm run manual:browser-controlled-fixture
npm run verify
```

If the combined `npm run accept:agent-local` script hangs in Vitest child
processes, run the three acceptance subcommands separately.
