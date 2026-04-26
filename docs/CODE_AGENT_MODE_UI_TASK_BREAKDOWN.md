# Code Agent Mode UI Task Breakdown

## Status

Ready for first implementation slice. The product surface decision is accepted
for a manual, sandboxed, Decision-gated code-agent UI.

Reference inputs:

- [CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md](CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md)
- [AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md](AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md)

## Purpose

This breaks the future visible code-agent mode into bounded product tasks. The
goal is to preserve the current sandbox invariants while eventually giving a
user a clear, explicit way to ask Taskplane to produce a staged patch through
the local-container producer path.

The first version is not a generic coding chat. It is a manual, review-first
execution flow:

```text
Task -> explicit code-agent run form -> sandbox producer execution
  -> RunSteps / diagnostics -> staged patch source
  -> patch promotion Decision -> task recovery
```

After the Multica reference assessment, this breakdown also reserves the
control-plane concepts that the UI should not accidentally blur:

- `ExecutionRuntime`: where/how the attempt can run, and whether it is ready
- `AgentProfile`: who/what instruction and skill policy is attached to the run
- `AgentRunLifecycle`: the claim/start/stream/complete/fail vocabulary that
  maps back into Taskplane Runs, RunSteps, Decisions, Artifacts, and Timeline

The first visible mode can still be manual. The structure should leave room for
future automatic starts once skill/process maturity and policy readiness exist.

## Preconditions

- Product surface decision accepted.
- Invocation decision remains accepted.
- Docker-backed producer preview smoke passes on a Docker-enabled machine.
- `npm run accept:sandbox-coding` and `npm run verify` pass.
- Runs detail can display producer session policy, blocked diagnostics,
  source/check RunSteps, and patch-promotion checkpoints.

## Task Sequence

### T0: Reconcile Product Surface With Multica Reference

Status: completed in
[CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md](CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md).

Goal: update the product decision so the first UI is manual without making the
architecture hostile to later policy-approved automatic starts.

Work:

- keep the first visible mode explicit and Decision-gated
- name `ExecutionRuntime`, `AgentProfile`, and `AgentRunLifecycle` as future
  product concepts even if the first UI only renders a narrow subset
- confirm automatic start requires skill/process maturity, complete inputs,
  known tool families, risk policy, and runtime readiness
- keep assignment or mention from becoming an unconditional execution trigger

Acceptance:

- `CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md` references the Multica
  assessment
- automatic start is described as a future policy result, not a first UI
  behavior
- no UI code is changed in this task

### T1: Accept Or Revise Product Surface Decision

Status: completed. The first UI decisions are accepted.

Goal: resolve the remaining open product questions before UI work starts.

Resolved decisions:

- first entrypoint: Task detail / Action Desk
- Docker readiness: explicit readiness action; opening the surface stays passive
- check selection: default to available allowlisted `test` / `lint`; user may
  deselect, missing checks are shown as unavailable
- failed checks: allow patch-promotion Decision review when a source exists,
  with failed-check consequences visible
- wording: "staged patch" / "patch source" before approval; "workspace changes"
  only after Decision approval
- later automatic start: deferred until skill/process maturity, input, tool,
  risk, runtime, and user/workspace policy signals exist

Acceptance:

- `CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md` is accepted
- out-of-scope tool families remain deferred
- no UI code is changed in this task

### T2: ExecutionRuntime Readiness Surface

Status: completed for the first passive Task detail surface.

Goal: show code-agent runtime readiness without starting Docker containers or
running a producer.

Work:

- introduce the UI vocabulary for `ExecutionRuntime`, even if backed initially
  by the existing sandbox backend probe
- surface backend readiness from the existing sandbox backend probe
- show workspace root, checks, network disabled, credentials disabled, and
  Decision-only promotion
- keep the action disabled when the backend or workspace is not ready
- state that Docker-backed checks require explicit confirmation later

Acceptance:

- opening the surface does not start containers
- normal agent run prompt remains unchanged
- renderer tests cover not-checked and probed blocked states; readiness
  formatting covers pending and blocked probe states

Implemented notes:

- Task detail / Action Desk now includes a `Code Agent Runtime` readiness block.
- The block defaults to `ExecutionRuntime: not checked`.
- The user must click `检查运行时` before sandbox backend status is probed.
- The probe reuses the existing sandbox backend IPC path and does not trigger a
  Run or producer execution.
- The block states the invariant: staged patch, network disabled, credentials
  none, Decision promotion.

### T3: Manual AgentProfile / Run Intent Form

Goal: collect deliberate user intent for one sandboxed coding attempt while
leaving room for future profile/skill policy.

Work:

- task title and instructions are visible
- completion criteria or patch intent is visible
- selected or default agent profile summary is visible when that concept exists;
  first version may render a static "manual sandbox producer" profile
- skill/process-template readiness is visible only as a future/disabled signal
  until accepted
- allowed checks are shown before start
- user must confirm that Docker may start containers
- call the execution service only with `operatorConfirmed: true`

Acceptance:

- no execution service call occurs without confirmation
- the form does not expose generic Read / Write / Edit / Bash tools
- failed preflight writes a readable run diagnostic

### T4: AgentRunLifecycle Projection

Goal: make the execution lifecycle reviewable before any workspace mutation.

Work:

- map sandbox producer state into lifecycle vocabulary: ready/blocked,
  confirmed, running checks, source-ready, failed, paused, completed
- show producer session policy and status
- show check evidence and changed-file summary
- show diff preview and source id
- show linked patch-promotion Decision
- keep approve/defer/cancel consequences explicit

Acceptance:

- source-ready runs are understandable without raw JSON
- blocked and failed runs explain the next recovery move
- approving a Decision remains the only path to workspace mutation

### T5: Future Automatic Start Policy Stub

Goal: reserve the product boundary for automatic starts without enabling them
in the first UI.

Work:

- define read-only UI copy or disabled diagnostics for why automatic start is
  not available yet
- list required future signals: mature skill/process, required inputs, allowed
  tools, risk policy, prior accepted evidence or explicit user enablement, and
  runtime readiness
- ensure the manual path does not persist any flag that implies the task should
  auto-run next time

Acceptance:

- first UI cannot schedule or auto-start a code-agent run
- docs explain what later policy work must prove before auto-start exists
- no scheduler integration is introduced

### T6: Manual Alpha Validation

Goal: validate the end-to-end local path before considering broader exposure.

Work:

- use a disposable workspace with `test` / `lint` scripts
- run Docker-backed producer smoke
- run the visible code-agent path when implemented
- confirm workspace unchanged before Decision approval
- confirm approved patch promotion applies only expected files

Acceptance:

- manual log is updated
- `npm run verify` passes afterward
- no GitHub Actions dispatch is required

## Deferred Tasks

These are intentionally outside the first visible mode:

- model-visible generic coding tools
- arbitrary shell
- package installation
- network-enabled coding
- MCP / Skills / browser / computer-use execution
- GitHub mutation
- scheduled autonomous coding
- assignment/mention-triggered coding without skill/process policy
- remote sandbox defaulting

Each needs its own decision before implementation.
