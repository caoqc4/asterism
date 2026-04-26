# Code Agent Mode Product Surface Decision

## Status

Accepted for the first visible code-agent product surface.

This acceptance only covers the manual, sandboxed, Decision-gated first UI. It
does not accept model-visible generic coding tools, host shell/file access,
automatic starts, MCP/browser/computer-use execution, external publishing, or
remote sandbox defaulting.

This document describes the product surface that must exist before Taskplane can
turn the explicit sandboxed coding producer execution service into a visible
code-agent mode.

Read first:

- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
- [AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md](AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md)
- [AGENT_EXECUTION_SANDBOX_PRODUCER_INVOCATION_DECISION.md](AGENT_EXECUTION_SANDBOX_PRODUCER_INVOCATION_DECISION.md)
- [AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md](AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md)
- [CODE_AGENT_MODE_UI_TASK_BREAKDOWN.md](CODE_AGENT_MODE_UI_TASK_BREAKDOWN.md)
- [WORKSPACE_TOOL_UI_OPT_IN_DECISION.md](WORKSPACE_TOOL_UI_OPT_IN_DECISION.md)

## Product Decision

Code-agent mode should be a dedicated run mode, not a hidden extension of the
normal `agent` run.

The normal agent run remains for planning, task updates, evidence, and read-only
workspace context. Code-agent mode is different because it may start Docker,
produce staged file changes, run project checks, and create a patch promotion
Decision. It needs a separate product surface with explicit user intent.

This does not permanently rule out automatic starts. It only sets the first UI
boundary. Future automatic starts are allowed when a task matches a mature
skill/process template, the required inputs and allowed tools are known, the
runtime is ready, and the user/workspace policy explicitly permits that workflow
to start without another manual click.

## First Version Shape

The first UI version should be narrow:

- one selected Task
- one selected workspace root
- visible Docker/backend readiness
- visible sandbox policy summary
- `test` / `lint` checks only
- network disabled
- credentials disabled
- staged patch output only
- Decision-required promotion
- no autonomous scheduling
- no automatic start until skill/process readiness policy exists

The primary action should read like an explicit manual command, not like a chat
message. The user should understand that containers may start and project checks
may run, while the workspace itself will not be modified until a Decision is
approved.

## Resolved First UI Decisions

### Entrypoint

The first visible entrypoint should live on Task detail / Action Desk.

Rationale:

- code-agent mode needs one selected Task, current context, completion criteria,
  blockers, Decisions, Runs, and artifacts
- Task detail is where the user can judge whether staged code work is relevant
- Runs remains the evidence/recovery surface after launch, not the primary
  starting point
- a dedicated execution panel can come later if there are multiple runtime
  modes, profiles, or policies to compare

### Docker / Runtime Readiness

Opening the surface should not start containers or run checks.

The first UI should render runtime readiness as `not checked` until the user
uses an explicit readiness action. That action may probe Docker/backend
availability, but the actual producer execution still requires the separate run
confirmation.

### Check Selection

The first UI should default to all available allowlisted checks:

- `test` when the selected workspace exposes an allowlisted test script
- `lint` when the selected workspace exposes an allowlisted lint script

The user may deselect a check before starting. Missing checks should be shown as
unavailable rather than silently ignored. No arbitrary command entry is allowed.

### Failed Checks

Failed checks should not hide a staged patch from review.

If a source is produced, Taskplane should still create the patch-promotion
Decision, but the Decision and Run detail must clearly show failed checks and
the consequence of approving anyway. The first version should not auto-promote
or auto-close anything based on check results.

### Wording

Use "staged patch" or "patch source" for files produced inside the sandbox.
Reserve "workspace changes" or "applied changes" for files written into the
user's selected workspace after a Decision is approved.

Required copy meaning:

```text
Sandbox may create a staged patch. Your workspace is unchanged until you approve
the patch promotion Decision.
```

### Later Automatic Start Signals

Automatic start remains deferred. The minimum future signals are:

- mature skill/process-template match
- required inputs present
- allowed tool families known
- runtime ready
- sandbox, credential, and network policy acceptable
- prior similar run accepted or user/workspace explicitly enabled this workflow
- risk classification below the configured manual-review threshold

## Required UI Elements

Before the run starts:

- backend readiness: ready, blocked, or not checked
- selected workspace root
- allowed checks
- network policy
- credential policy
- promotion policy
- clear statement that writes are staged, not applied
- clear statement that Docker may start containers
- explicit confirmation control

During and after the run:

- producer session status
- tool/check events as RunSteps
- changed files
- diff preview
- command evidence summaries
- blocked/failed/paused diagnostics
- linked Decision for patch promotion when a source is ready

Current rendering status: sandbox producer session policy, blocked diagnostics,
and staged source/check RunSteps are covered in renderer tests.
Patch-promotion checkpoint rendering is covered by the existing workspace patch
checkpoint tests.

## Explicit Non-Goals

The first code-agent mode must not include:

- model-visible generic Read / Write / Edit / Bash on the host
- arbitrary shell commands
- package installation or dependency upgrades outside allowlisted checks
- credential passthrough
- network-enabled coding sessions
- browser/computer control
- MCP or Skills execution
- GitHub mutation
- external publishing
- autonomous background coding

Those can be evaluated later as separate tool-family decisions after the
sandboxed coding lane is stable. Automatic execution should be revisited after
Taskplane has a runtime readiness model, skill/process maturity signals, and
policy evidence that the workflow is clear enough to start safely.

## Acceptance Before UI Implementation

The implementation phase may start when these remain true:

- `npm run accept:sandbox-coding` passes
- `npm run verify` passes
- backend preflight reports ready on a Docker-enabled machine
- producer preview smoke passes in non-live mode
- producer preview smoke passes with Docker-backed checks on a Docker-enabled
  machine
- the invocation decision remains accepted
- Run detail has enough display vocabulary for producer sessions,
  staged diffs, check evidence, blocked diagnostics, and Decision promotion
  - current status: producer session policy, blocked diagnostics, source/check
    RunSteps, and patch-promotion checkpoint summaries are covered by renderer
    tests; the first UI task should still review wording on a real run detail
    screen before acceptance
