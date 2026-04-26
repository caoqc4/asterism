# Code Agent Mode UI Task Breakdown

## Status

Planning only. Do not implement these UI tasks until
[CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md](CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md)
is accepted.

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

## Preconditions

- Product surface decision accepted.
- Invocation decision remains accepted.
- Docker-backed producer preview smoke passes on a Docker-enabled machine.
- `npm run accept:sandbox-coding` and `npm run verify` pass.
- Runs detail can display producer session policy, blocked diagnostics,
  source/check RunSteps, and patch-promotion checkpoints.

## Task Sequence

### T1: Accept Or Revise Product Surface Decision

Goal: resolve the open product questions before UI work starts.

Decisions needed:

- first entrypoint: Task detail, Run creation, or dedicated execution panel
- Docker readiness: auto-check on open or manual button only
- check selection: `test`, `lint`, or both
- failed checks: allow patch review or block Decision creation
- wording for staged patch versus workspace modification

Acceptance:

- `CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md` is accepted or explicitly
  revised
- out-of-scope tool families remain deferred
- no UI code is changed in this task

### T2: Read-Only Capability Preview Surface

Goal: show code-agent readiness without starting Docker containers or running a
producer.

Work:

- surface backend readiness from the existing sandbox backend probe
- show workspace root, checks, network disabled, credentials disabled, and
  Decision-only promotion
- keep the action disabled when the backend or workspace is not ready
- state that Docker-backed checks require explicit confirmation later

Acceptance:

- opening the surface does not start containers
- normal agent run prompt remains unchanged
- renderer tests cover ready, blocked, and not-checked states

### T3: Explicit Code-Agent Run Form

Goal: collect deliberate user intent for one sandboxed coding attempt.

Work:

- task title and instructions are visible
- completion criteria or patch intent is visible
- allowed checks are shown before start
- user must confirm that Docker may start containers
- call the execution service only with `operatorConfirmed: true`

Acceptance:

- no execution service call occurs without confirmation
- the form does not expose generic Read / Write / Edit / Bash tools
- failed preflight writes a readable run diagnostic

### T4: Run Detail And Decision Review Loop

Goal: make the output reviewable before any workspace mutation.

Work:

- show producer session policy and status
- show check evidence and changed-file summary
- show diff preview and source id
- show linked patch-promotion Decision
- keep approve/defer/cancel consequences explicit

Acceptance:

- source-ready runs are understandable without raw JSON
- blocked and failed runs explain the next recovery move
- approving a Decision remains the only path to workspace mutation

### T5: Manual Alpha Validation

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
- remote sandbox defaulting

Each needs its own decision before implementation.
