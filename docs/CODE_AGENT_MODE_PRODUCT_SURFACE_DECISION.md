# Code Agent Mode Product Surface Decision

## Status

Proposed. Do not expose a Task/Run UI entrypoint or model-visible coding tools
until this decision is accepted and manually validated.

This document describes the product surface that must exist before Taskplane can
turn the explicit sandboxed coding producer execution service into a visible
code-agent mode.

Read first:

- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
- [AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md](AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md)
- [AGENT_EXECUTION_SANDBOX_PRODUCER_INVOCATION_DECISION.md](AGENT_EXECUTION_SANDBOX_PRODUCER_INVOCATION_DECISION.md)
- [CODE_AGENT_MODE_UI_TASK_BREAKDOWN.md](CODE_AGENT_MODE_UI_TASK_BREAKDOWN.md)
- [WORKSPACE_TOOL_UI_OPT_IN_DECISION.md](WORKSPACE_TOOL_UI_OPT_IN_DECISION.md)

## Product Decision

Code-agent mode should be a dedicated run mode, not a hidden extension of the
normal `agent` run.

The normal agent run remains for planning, task updates, evidence, and read-only
workspace context. Code-agent mode is different because it may start Docker,
produce staged file changes, run project checks, and create a patch promotion
Decision. It needs a separate product surface with explicit user intent.

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

The primary action should read like an explicit manual command, not like a chat
message. The user should understand that containers may start and project checks
may run, while the workspace itself will not be modified until a Decision is
approved.

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
sandboxed coding lane is stable.

## Acceptance Before Implementation

Do not build the UI until these are true:

- `npm run accept:sandbox-coding` passes
- `npm run verify` passes
- backend preflight reports ready on a Docker-enabled machine
- producer preview smoke passes in non-live mode
- producer preview smoke passes with Docker-backed checks on a Docker-enabled
  machine
- the invocation decision remains accepted
- Run detail already has enough display vocabulary for producer sessions,
  staged diffs, check evidence, blocked diagnostics, and Decision promotion
  - current status: producer session policy, blocked diagnostics, source/check
    RunSteps, and patch-promotion checkpoint summaries are covered by renderer
    tests; the first UI task should still review wording on a real run detail
    screen before acceptance

## Open Questions

- Should the first visible entrypoint live on Task detail, Run creation, or a
  dedicated execution panel?
- Should Docker readiness be checked automatically when opening the form, or
  only after a manual button click?
- Should the user choose `test`, `lint`, or both, or should the first version
  always run both when available?
- Should failed checks still allow patch promotion review, or should the first
  version require passing checks before a Decision is created?
- What wording best separates "staged patch created" from "workspace modified"?
