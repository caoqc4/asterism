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
- [AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md](AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md)

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

## Recommended Next Implementation Task

Start with the first non-live slices from
[AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md](AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md).

T1 through T7 now have Slice 0 implementation or design coverage, the shared
tool scaffold exists, the sandbox patch draft source boundary is implemented,
the first producer design is drafted, the non-live producer scaffolding is in
place with integration coverage for source-ready, blocked, failed, and
empty-diff outcomes, and the first real model-backed Task detail UI pass has
validated bounded context, staged-file output, targeted checks, patch artifact
review, and pending promotion Decision creation.

The next implementation slice is:

- continue Browser / Playwright read-only lane B2 from
  [AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md](AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md):
  add a read-only preflight summary that reports the lane as reserved, hidden,
  and configurable without opening a browser, calling the network, exposing
  tools to models, or creating runtime sessions

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
npm run verify
```

If the combined `npm run accept:agent-local` script hangs in Vitest child
processes, run the three acceptance subcommands separately.
