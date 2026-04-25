# Agent Execution Task Breakdown

## Status

Active task breakdown for the execution-layer work after the reference
architecture reassessment.

Read first:

- [AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)
- [AGENT_EXECUTION_LAYER_V2_DECISION.md](AGENT_EXECUTION_LAYER_V2_DECISION.md)
- [AGENT_EXECUTION_LAYER_ROADMAP.md](AGENT_EXECUTION_LAYER_ROADMAP.md)

## First-Principles Rule

Taskplane's execution layer should make task work recoverable and reviewable.
It should not become a generic agent shell.

The product control plane remains:

```text
Task -> Run -> AgentSession -> RunStep -> Checkpoint / Decision -> Artifact -> Timeline
```

Pi is the main inner-loop reference. OpenClaw is the main embedding reference.
Both are references, not runtime dependencies for this phase.

## Current Implementation Baseline

Completed:

- typed `AgentSessionEvent` shared types
- `mapAgentRuntimeEventToRunStep`
- text run plan/model/final writes routed through event-to-step mapping
- agent session terminal result steps routed through event-to-step mapping
- provider-native safe-read path remains gated and locally tested
- workspace write/command tools remain registry-only and Decision-gated

Still incomplete:

- `AgentRunLoop` does not yet emit a first-class runtime event stream
- checkpoint creation still happens inside tool/loop code paths
- checkpoint payloads are not yet the full restart-safe resume contract
- tool exposure is spread across registry, schema builder, prompt construction,
  and runtime policy checks
- no dedicated sandbox decision for broad code execution

## Task Sequence

### T0: Keep Slice 0 Documentation Aligned

Goal: keep the current implementation sequence visible and bounded.

Work:

- maintain this task breakdown
- link it from the roadmap and project status
- keep the Pi/OpenClaw distinction in the execution-layer docs

Acceptance:

- docs name the next implementation task unambiguously
- docs do not imply broad workspace write/command exposure is available
- docs still say no external framework is adopted as a runtime dependency

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
- external posting/email/calendar/social tools

## Recommended Next Implementation Task

Start with **T1: AgentRunLoop Event Emitter**.

This is the smallest step that aligns Taskplane with the Pi-style inner loop
without expanding capability. It should be implemented as an internal event
stream first, with no new user-facing execution power.

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
