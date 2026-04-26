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

Status: completed for an intent-only first surface. Producer execution IPC is
still deferred.

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

Implemented notes:

- Task detail / Action Desk now shows a static `manual sandbox producer`
  AgentProfile summary under the runtime block.
- The form shows the selected Task, current completion criteria, a patch intent
  textarea, allowlisted `test` / `lint` check toggles, and explicit Docker /
  Decision confirmation.
- The first button records an intent-only diagnostic and does not call
  `triggerRun`, sandbox backend probe, or producer execution.
- Real producer execution remains a later IPC/orchestration task after the Run
  lifecycle projection is visible.

### T4: AgentRunLifecycle Projection

Status: completed for sandbox producer Run detail projection. Producer start
from the UI remains deferred.

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

Implemented notes:

- Runs detail now projects sandbox producer session metadata into an
  `AgentRunLifecycle` line with lifecycle state, source id, check policy,
  network/promotion policy, blocked reasons when present, and the next recovery
  or review move.
- Sandbox producer RunSteps now render readable summaries for producer start,
  check evidence, staged patch source readiness, blocked/failed/paused terminal
  states, and sandbox tool events.
- Source-ready wording keeps staged patch review explicit: workspace mutation
  still requires an approved patch-promotion Decision.

### T5: Future Automatic Start Policy Stub

Status: completed as a disabled policy diagnostic on the manual intent surface.
No scheduler or auto-run behavior is enabled.

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

Implemented notes:

- The manual Code Agent intent surface now renders `Automatic start: disabled`
  and lists the future policy signals required before automatic start can be
  reconsidered: mature skill/process, complete inputs, allowed tools, risk
  policy, accepted evidence or explicit enablement, and runtime readiness.
- Preparing a Code Agent Run still records only a local intent diagnostic in
  the renderer; it does not persist an auto-run flag and does not call the
  scheduler or producer execution path.

### T6: Manual Alpha Validation

Status: completed for local non-live code-agent UI / sandbox producer
validation on 2026-04-26. A first manual sandbox preview run button is now
wired, but broader real model-backed execution remains deferred because the
actual producer model loop is not connected yet.

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

Implemented notes:

- `npm run accept:sandbox-coding:backend-preflight` reported local-container
  backend ready with Docker Desktop available and network disabled.
- `npm run accept:sandbox-coding:producer-preview-smoke` passed in default
  skipped mode, confirming Docker and AI were not started.
- `TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true npm run
  accept:sandbox-coding:producer-preview-smoke` passed the non-live service
  wiring smoke with workspace unchanged, Docker not started, and AI not called.
- `TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true
  TASKPLANE_RUN_SANDBOX_PRODUCER_DOCKER_CHECKS=true npm run
  accept:sandbox-coding:producer-preview-smoke` passed with Docker checks
  started, workspace unchanged, and AI not called.
- `npm run accept:sandbox-coding` passed: 26 test files / 165 tests.
- `npm run verify` passed afterward: 90 test files / 641 tests, then lint and
  build.

### T7: Manual Sandbox Preview Run Wiring

Status: completed for the first non-live/manual preview and review path.

Goal: let the accepted Task detail Code Agent surface create a real Run and
exercise the existing sandbox producer preview boundary without claiming full
AI coding-agent capability.

Work:

- add a dedicated IPC contract for manual Code Agent sandbox preview runs
- require `operatorConfirmed: true`
- pass only selected allowlisted `test` / `lint` checks
- create a real `agent` Run before producer execution starts
- call the local-container producer execution service
- keep the producer loop local and explicit while the real model producer loop
  remains unconnected
- persist sandbox producer session and RunSteps for Runs detail review
- convert source-ready preview plans into patch review artifacts, checkpoints,
  and Decisions
- ignore internal `session.json` manifests when collecting staged patch files

Acceptance:

- the Task detail button calls only the dedicated sandbox preview IPC path
- normal draft/summarize/agent run forms remain unchanged
- source-ready / blocked producer results are visible from Runs detail
- source-ready runs create a patch artifact plus patch-promotion Decision when
  checks did not fail
- no external AI provider call is made by this preview path
- workspace mutation remains impossible from this button alone

Implemented notes:

- `CreateCodeAgentRunInput` now carries `taskId`, patch intent, selected checks,
  and explicit operator confirmation.
- Main process `run:triggerCodeAgent` creates a real `agent` Run, builds a
  constrained sandboxed producer request, invokes the local-container producer
  execution service, and updates the Run result from the preview outcome.
- The first producer loop writes a staged `.taskplane/code-agent-preview.md`
  diagnostic inside the sandbox only through the same staged-file plan
  validator reserved for model-backed producer output. It is intentionally
  labeled as a manual sandbox preview because the real model producer loop is
  not connected yet.
- Renderer intent UI now starts that sandbox preview run and opens Runs detail
  for lifecycle/source evidence review.
- When the producer preview returns `preview_ready`, main process now persists
  the ready plan through the existing patch-review persister, creating a patch
  artifact, open `patch_promotion` checkpoint, and pending Decision. Failed
  checks still keep the artifact reviewable but do not create a promotion
  Decision.

### T8: Model Producer Staged-File Contract

Status: first fail-closed contract implemented; live model call remains
deferred.

Goal: prepare the real Code Agent producer loop without giving the model broad
write, shell, credential, or workspace mutation capability.

Work:

- define the only accepted producer output shape as strict JSON with summary,
  observations, and staged text files
- validate workspace-relative paths before any staged write
- block path escapes, absolute paths, internal `session.json`, `.env*`,
  `.git`, `node_modules`, duplicate paths, binary content, and oversized output
- write only validated files into the sandbox staging root
- keep checks, artifact creation, checkpointing, and Decision promotion on the
  existing sandbox producer / patch review chain

Acceptance:

- malformed model output produces a blocked producer result
- accepted output can only write bounded text files to staging
- the current manual preview path uses the same validator
- no external AI provider call is introduced by this slice

Implemented notes:

- `code-agent-staged-file-plan` now parses strict JSON payloads, normalizes a
  bounded staged-file plan, and writes accepted files only under the prepared
  staging root.
- The manual preview loop now builds its diagnostic patch as a staged-file plan
  and emits `staging.write_file` producer tool request/completion steps before
  normal check and source-ready review handling.
- `npm run accept:sandbox-coding` includes the staged-file plan contract tests
  so future model-backed producer work cannot bypass this gate silently.

### T9: Injected Model Producer Loop Adapter

Status: first non-live adapter implemented; real provider wiring remains
deferred.

Goal: make the future model-backed Code Agent path a small adapter around the
same staged-file contract instead of a new privileged execution surface.

Work:

- build the producer prompt from the normalized sandbox request
- require the model-facing prompt to return strict JSON only
- inject the text-generation function so tests and future providers share one
  loop boundary
- parse and validate generated output through the staged-file plan contract
- write only validated files to sandbox staging and emit producer tool events

Acceptance:

- valid generated JSON writes staged files and returns bounded evidence
- malformed generated output blocks before writing files
- no live provider call is made by the adapter itself
- the adapter remains unconnected from the current UI until a separate wiring
  decision accepts provider spend and runtime behavior

Implemented notes:

- `code-agent-model-producer-loop` now exposes
  `buildCodeAgentModelProducerPrompt()` and
  `createCodeAgentModelProducerLoop({ generatePlanText })`.
- The loop emits `staging.write_file` request/completion or blocked events,
  then lets the existing producer runner perform allowlisted checks and patch
  review planning.
- `accept:sandbox-coding` includes the non-live adapter tests.

### T10: Provider Runtime Factory Gate

Status: first default-closed runtime factory implemented; UI/provider spend
remains deferred.

Goal: make live model-backed producer execution possible only through an
explicit opt-in boundary, rather than by importing the adapter from a UI path.

Work:

- add a runtime preparation helper that defaults to blocked
- do not resolve AI config or API keys until provider calls are explicitly
  allowed
- require `enableSandboxCodingAgent=true` before returning a model producer loop
- wrap existing runtime text generation behind the injected model producer loop
- keep the helper unconnected from the current Task detail Code Agent button

Acceptance:

- default preparation blocks before reading AI config
- disabled sandbox coding flag blocks after config resolution
- explicit opt-in returns a loop that calls the injected text generator
- tests prove this path remains non-live under normal verification

Implemented notes:

- `prepareCodeAgentModelProducerRuntime()` now returns either a blocked
  diagnostic or a ready runtime with `createLoop()`.
- The ready path uses existing `generateRuntimeText` by default, but tests
  inject a fake text generator so `accept:sandbox-coding` still makes no
  provider call.

### T11: Explicit Env-Gated Model Producer Wiring

Status: first wiring implemented behind a local env opt-in; default manual
preview behavior remains unchanged.

Goal: let local alpha operators deliberately test the real model producer path
without making provider calls part of normal UI usage.

Work:

- add `TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER=true` as the explicit local
  provider-call opt-in
- keep the Task detail Code Agent button on the manual diagnostic producer when
  the env flag is absent or false
- when the env flag is true, prepare the default-closed model producer runtime
  before Docker execution
- if the model runtime cannot resolve config or sandbox coding is disabled,
  fail the Run before starting the sandbox execution service
- keep all model output behind staged-file validation, allowlisted checks, patch
  artifacts, checkpoints, and Decisions

Acceptance:

- default UI path does not resolve runtime AI config
- env-enabled path blocks clearly if AI runtime config is unavailable
- no provider call is made by tests

Implemented notes:

- `run:triggerCodeAgent` now selects either the existing manual preview loop or
  the model producer loop based on `TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER`.
- The env-enabled path still requires the existing operator confirmation,
  sandbox feature flag, disabled network, no credential passthrough, and
  Decision-only promotion.

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
