# Agent Execution Orchestration UI Design

## Status

Draft design for the next read-only execution orchestration UI slice.

Read with:

- [AGENT_EXECUTION_ORCHESTRATION_PLAN.md](AGENT_EXECUTION_ORCHESTRATION_PLAN.md)
- [AGENT_EXECUTION_TASK_BREAKDOWN.md](AGENT_EXECUTION_TASK_BREAKDOWN.md)
- [AGENT_EXECUTION_LAYER_DESIGN.md](AGENT_EXECUTION_LAYER_DESIGN.md)
- [CODE_AGENT_MODE_UI_TASK_BREAKDOWN.md](CODE_AGENT_MODE_UI_TASK_BREAKDOWN.md)

## First-Principles Decision

The orchestration UI should answer one operator question before Taskplane starts
or resumes agent work:

```text
What runtime, profile, lifecycle state, policy, and recovery path am I looking
at, and what is still blocked?
```

This slice is not a queue, daemon, scheduler, or new agent capability. It is a
read-only control surface that makes the existing execution state legible before
Taskplane adds any worker, claim, automatic-start, or broader connector lane.

The product path remains:

```text
Task -> OrchestrationRequest -> Run -> AgentSession -> RunStep
  -> Checkpoint / Decision -> Artifact -> Timeline
```

## Current Baseline

Already implemented locally:

- `ExecutionRuntime` snapshot helper for the local sandbox runtime.
- `AgentProfile` snapshot for the manual sandbox producer.
- `OrchestrationRequest` envelopes for manual Code Agent and operator-started
  Browser Evidence / Browser Controlled local QA.
- `AgentRunLifecycle` projection in Runs detail.
- read-only skill-informed automation readiness diagnostics in Task detail.
- Code Agent Runtime readiness block in Task detail.
- Settings orchestration summary.
- Runs replay review for `interrupted_or_stale`, `live_status_unknown`,
  `checkpoint_missing`, and failed session new-run recovery.
- local smoke command boundary tests that keep provider/Docker/workspace
  defaults safe.

## Product Shape

### Task Detail

Task detail should remain the primary place to decide whether a task is ready
for execution. The read-only orchestration card should show:

- `ExecutionRuntime`: current runtime status, blocked reason, and manual check
  action when applicable.
- `AgentProfile`: selected profile, lane, tool-family posture, and why this
  profile does not grant authority by itself.
- `Automation readiness`: diagnostic-only state, evidence, blocked reasons, and
  `autoStart=no`.
- `Manual dispatch intent`: what would be required before a manual Code Agent
  run can start.
- `Hidden tool families`: browser, MCP, skills, computer-use, and creator
  connectors remain not exposed.

The card may prepare a run intent, but it must not start a run automatically.

### Runs Detail

Runs detail should remain the execution evidence surface. The orchestration
section should show:

- lifecycle projection: run status mapped into drafted / queued / claimed /
  running / paused / completed / failed vocabulary.
- session capability summary and tool-family summary.
- restart hint and replay review.
- checkpoint / Decision recovery path when present.
- next safe move: inspect evidence, handle checkpoint, or prepare a new manual
  Run.

The page should never imply that Taskplane can reconnect to a dead local
session or replay side effects without review.

### Settings

Settings should keep runtime readiness operational and diagnostic:

- current local sandbox status.
- provider/model/key state.
- scaffold family visibility.
- local checks that are read-only by default.

Settings should not become a run launcher.

## Non-Goals

- no queue worker
- no claim daemon
- no scheduler-started agent work
- no automatic start
- no new model-visible browser, MCP, skills, computer-use, creator, write, or
  command tools
- no credential-bearing connector action
- no generic shell or host-process runner

## Slice Plan

### OUI1: Shared Presentation Model

Goal: centralize read-only orchestration UI wording so Tasks, Runs, and Settings
do not assemble competing summaries.

Work:

- add shared renderer helpers for:
  - runtime card summary
  - profile card summary
  - lifecycle/recovery card summary
  - hidden-family summary
- keep helpers derived from existing shared orchestration and session replay
  helpers.

Acceptance:

- existing UI wording remains truthful.
- no execution behavior changes.
- renderer helper tests cover ready, blocked, not-checked, active-running,
  checkpoint-missing, and failed recovery states.

### OUI2: Task Detail Read-Only Orchestration Card

Prerequisite status: OUI1 has started. `src/renderer/lib/agentOrchestrationPresentation.ts`
now provides a shared read-only presentation model for runtime, profile,
lifecycle, hidden tool families, and automation readiness; renderer tests lock
the no-auto-start and hidden-family wording before the card is regrouped.

Implementation status: started. Task detail now renders an `Orchestration
readiness` sub-card inside the existing Code Agent intent surface. It reuses the
shared presentation model for runtime, profile, lifecycle, hidden tool families,
automation readiness, and no-auto-start summary while keeping the existing
manual runtime check and sandbox preview start gates unchanged.

Goal: make the current Code Agent Runtime / AgentProfile / readiness block read
like one coherent execution preparation surface.

Work:

- group runtime, profile, automation readiness, model-producer opt-in, and
  hidden-family facts under one compact card.
- keep the manual runtime check action.
- keep model producer as explicit per-run opt-in only.
- keep run start gated by existing operator confirmation, selected checks, and
  context requirements.

Acceptance:

- App tests assert the card says queue/auto-start are disabled.
- App tests assert hidden connector families are not exposed.
- Code Agent local diagnostic and model-backed start gates remain unchanged.

### OUI3: Runs Detail Recovery Strip

Implementation status: started. Runs detail now renders a `Run recovery safety`
strip in the Run Snapshot card. It groups lifecycle projection, restart hint,
replay review, and the next safe move while preserving the existing paused-run
resume gate.

Goal: make restart/replay state easy to scan before the operator returns to the
task.

Work:

- group lifecycle projection, restart hint, replay review, and next safe move
  into one evidence-first strip.
- keep paused run continuation visible only when a valid open resume checkpoint
  exists.
- keep failed and stale/running sessions routed to new manual Run preparation
  or evidence inspection.

Acceptance:

- current tests for `live_status_unknown`, `checkpoint_missing`, and failed
  sessions remain green.
- add one visual/renderer assertion for the grouped recovery strip once the UI
  card exists.

### OUI4: Settings Runtime Diagnostics Cleanup

Implementation status: started. Settings now renders an `Orchestration
Diagnostics` block with the shared read-only orchestration summary, lifecycle,
and hidden-tool-family facts. It remains a readiness console; no run trigger or
execution action is exposed from Settings.

Goal: make Settings a runtime readiness console, not an execution surface.

Work:

- show local sandbox readiness, provider config, scaffold family visibility, and
  no-auto-start summary in a compact diagnostic section.
- keep detection buttons read-only.
- keep scheduler copy scoped to brief snapshots and stale-run sweeps, not agent
  starts.

Acceptance:

- Settings tests keep scheduler/provider config coverage.
- no IPC run trigger is added to Settings.

## Recommended Next Implementation Task

The first orchestration UI pass has landed across Task detail, Runs detail, and
Settings. The next implementation slice should tighten visual polish and reduce
duplicated wording between the three cards, then move into the next execution
orchestration step only after these read-only surfaces stay stable.

## Verification

Use local verification while GitHub Actions quota is unavailable:

```bash
npm run verify
```

For focused UI slices, use:

```bash
npx vitest run src/renderer/lib/agentCapabilities.test.ts
npx vitest run src/renderer/App.test.tsx -t "Orchestration|Code Agent|Replay review|Runtime"
```
