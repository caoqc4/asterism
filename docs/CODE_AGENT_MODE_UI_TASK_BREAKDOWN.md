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

Status: completed for the manual run intent surface and later connected to the
dedicated sandbox preview IPC path.

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
- The first version originally recorded an intent-only diagnostic. The current
  implementation now calls only the dedicated `run:triggerCodeAgent` path after
  explicit operator confirmation, creates a real Run, and opens Runs detail for
  lifecycle/source review.
- Model-backed producer use is still a separate per-run opt-in. When that
  opt-in is absent, the manual surface uses the local diagnostic producer and
  does not call the provider.

### T4: AgentRunLifecycle Projection

Status: completed for sandbox producer Run detail projection and the current
manual Task detail start path.

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
- The manual Task detail path now starts a sandbox preview Run through
  `run:triggerCodeAgent`; Runs detail remains the review/recovery surface after
  launch.

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
wired. Broader model-backed execution is now available only through the
separate run-level model producer opt-in.

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
  labeled as a manual sandbox preview when the run has not requested model
  producer usage.
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

Status: adapter implemented; live use remains gated by the manual run-level
model producer opt-in.

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
- UI/runtime wiring can call the adapter only after a separate run-level
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

Status: default-closed runtime factory implemented; provider spend remains
run-level gated.

Goal: make live model-backed producer execution possible only through an
explicit opt-in boundary, rather than by importing the adapter from a UI path.

Work:

- add a runtime preparation helper that defaults to blocked
- do not resolve AI config or API keys until provider calls are explicitly
  allowed
- require `enableSandboxCodingAgent=true` before returning a model producer loop
- wrap existing runtime text generation behind the injected model producer loop
- keep the helper default-closed until the current run explicitly allows model
  producer provider calls

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

- `TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER` now exposes local model producer
  capability, but `run:triggerCodeAgent` selects the model producer loop only
  when the current run also sets `useModelProducer=true`.
- The run-level model producer path still requires the existing operator
  confirmation, explicit context files, selected checks, sandbox feature flag,
  disabled network, no credential passthrough, and Decision-only promotion.

### T12: Model Producer Local Preflight

Status: implemented as a read-only script.

Goal: give local alpha validation a clear readiness command before spending
provider credit on model-backed Code Agent producer runs.

Work:

- add `accept:sandbox-coding:model-producer-preflight`
- read `.env` / `TASKPLANE_ENV_FILE` consistently with existing live
  validation scripts
- require the model producer opt-in, sandbox coding flag, provider, model, API
  key, and workspace root
- require `TASKPLANE_AI_BASE_URL` for generic OpenAI-compatible relays
- validate Replicate model ids use `owner/model`

Acceptance:

- default local config reports `status=skip` with missing issues
- ready config reports `status=ready`
- the script does not call providers, probe Docker, or mutate workspace

Implemented notes:

- `scripts/code-agent-model-producer-preflight.mjs` prints redacted local
  readiness and explicitly states no provider/Docker/workspace action was
  performed.
- `docs/CONFIGURATION.md` and `docs/TESTING.md` now document the preflight and
  required env variables.

### T13: Model Producer Live Smoke

Status: implemented as a default-skipped script.

Goal: allow a deliberate one-request validation of the model producer contract
before wiring broader UI behavior.

Work:

- add `accept:sandbox-coding:model-producer-live`
- keep the command skipped unless
  `TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_LIVE=true`
- reuse the model producer preflight before making any provider request
- build the same producer prompt used by the runtime adapter
- validate the provider response through the staged-file plan parser
- avoid Docker startup and workspace mutation

Acceptance:

- default command reports skip and no provider call
- env-enabled command sends one provider request only after preflight is ready
- malformed model output fails the smoke without writing staged files

Implemented notes:

- `scripts/code-agent-model-producer-live-smoke.mjs` imports built main-process
  modules, calls `generateRuntimeText()`, parses the response with
  `parseCodeAgentStagedFilePlanPayload()`, and prints only redacted readiness
  plus bounded plan metadata.

### T14: Explicit Workspace Context Input

Status: first bounded file-context path implemented.

Goal: improve model producer quality by giving it deliberate read-only
evidence, without exposing arbitrary workspace read tools to the model.

Work:

- add `TASKPLANE_CODE_AGENT_CONTEXT_FILES` as a comma-separated local opt-in
  file list for env-gated model producer runs
- collect only explicit workspace-relative files under the selected workspace
  root
- block path escapes, `.env*`, `.git`, `node_modules`, missing files, binary
  content, oversized files, and too many files
- format accepted files into the producer prompt as read-only evidence
- record a compact RunStep when selected context is collected

Acceptance:

- no context files selected keeps existing behavior
- invalid selected context fails before sandbox execution or provider work
- accepted context appears in the model producer prompt as bounded evidence
- model still cannot ask to read additional files

Implemented notes:

- `code-agent-workspace-context` now collects and formats bounded selected
  files.
- `buildCodeAgentModelProducerPrompt()` includes an explicit workspace context
  section and states that it is read-only evidence, not permission to read more.
- `run:triggerCodeAgent` reads `TASKPLANE_CODE_AGENT_CONTEXT_FILES` only when
  the model producer env opt-in is active.

### T15: Manual Context File Selection UI

Status: first UI field implemented.

Goal: move the bounded workspace context path from env-only validation toward
the manual Code Agent product surface, while keeping selection explicit.

Work:

- add a `Context files` field to the Task detail Code Agent intent panel
- accept comma-separated or newline-separated workspace-relative paths
- pass selected files through `CreateCodeAgentRunInput.contextFiles`
- keep the env fallback for local smoke and alpha validation
- keep all path/content validation in the main-process context collector

Acceptance:

- empty context field keeps existing manual preview behavior
- filled context field sends a normalized file list with the Code Agent run
- renderer does not read local files directly
- main process remains the only file reader and validator

Implemented notes:

- The renderer now sends `contextFiles` only when the field contains at least
  one path.
- The UI copy frames context files as read-only evidence for the model producer,
  not as broad workspace read permission.

### T16: Context File Candidate Hints

Status: first renderer-only candidate hints implemented.

Goal: reduce manual typing while preserving explicit user selection before any
workspace file is read.

Work:

- derive path-like candidates from the selected task title, summary, next step,
  risk note, completion criteria, source contexts, and artifacts
- ignore path escapes and sensitive-looking paths in the renderer hint list
- show candidates as small action buttons near the `Context files` field
- clicking a candidate appends it to the context field without reading the file

Acceptance:

- candidate hints do not read local files
- user must click or type paths before the run carries context files
- main process remains the only authority for real validation and file reads

Implemented notes:

- The hint extractor recognizes common relative code/doc file patterns and
  keeps the list bounded.
- The existing main-process context collector remains unchanged as the security
  boundary.

### T17: Context File Preflight Validation

Status: implemented in the read-only model producer preflight.

Goal: catch bad selected context paths before a user spends provider credit or
starts sandbox execution.

Work:

- validate `TASKPLANE_CODE_AGENT_CONTEXT_FILES` in
  `accept:sandbox-coding:model-producer-preflight`
- block path escapes, sensitive paths, missing files, directories, binary
  files, oversized files, and too many selected files
- report selected context byte totals without printing file contents

Acceptance:

- context validation is local-only and read-only
- provider calls and Docker probes remain out of the preflight
- the main process remains the final authority when a real run starts

### T18: Context Selection Pre-Run Summary

Status: implemented in the Task detail Code Agent panel.

Goal: make the explicit workspace-context boundary visible before the user
starts a sandbox preview run.

Work:

- reuse one parser for the context-field summary and the run payload
- show the selected context-file count and selected workspace-relative paths
- show the available candidate count when nothing has been selected
- state that files are not read until the run starts

Acceptance:

- the summary never reads local files in the renderer
- the displayed selection matches the payload sent to
  `CreateCodeAgentRunInput.contextFiles`
- candidate hints remain suggestions only until the user clicks or types them

### T19: Staged Patch Review Summary

Status: first Runs detail surface implemented.

Goal: make the sandbox patch evidence reviewable as a single object before any
Decision promotion step is handled.

Work:

- add a `Staged Patch Review` block to Runs detail when sandbox source or
  patch-promotion checkpoint evidence exists
- summarize source id, changed files, check outcomes, promotion checkpoint
  status, and linked Decision title
- show artifact summary and bounded patch preview when available
- keep the invariant visible: workspace remains unchanged until Decision
  approval

Acceptance:

- ordinary runs without sandbox patch evidence do not show the review block
- the review block derives from existing RunSteps and RunCheckpoints
- approving or applying the patch remains outside this display-only surface

### T20: Patch Promotion Decision Review Link

Status: first Decision-to-Run review jump implemented.

Goal: keep patch-promotion Decisions anchored to their Run evidence before a
user approves, defers, or cancels.

Work:

- show `查看 Run 证据` on pending `workspace.staged_patch` checkpoint Decisions
- resolve the Decision source checkpoint id back to the owning Run detail
- open the matched Run in the Runs page for staged patch evidence review
- show a local fallback message if the linked Run cannot be found

Acceptance:

- the link is review-only and does not approve or apply a patch
- the lookup uses existing Run detail checkpoint records
- workspace mutation remains gated by separate Decision semantics

### T21: Patch Promotion Apply Decision

Status: decision proposal documented.

Goal: define what must be true before approving a sandbox patch-promotion
Decision can write workspace files.

Work:

- add `AGENT_EXECUTION_PATCH_PROMOTION_APPLY_DECISION.md`
- separate review-only `workspace.staged_patch` confirmation from future
  workspace mutation semantics
- define pre-apply gates for source identity, policy snapshot, expected files,
  digest, workspace state, and idempotency
- split implementation into readiness model, durable promotion record, apply
  service, Decision integration, and UI copy upgrade

Acceptance:

- no workspace file application is implemented in this slice
- the next implementation step is a read-only promotion readiness evaluator
- approval remains fail-closed until apply metadata and persistence exist

### T22: Patch Promotion Readiness Evaluator

Status: first read-only evaluator implemented.

Goal: give backend and UI code one safe way to classify whether a
`workspace.staged_patch` checkpoint could ever be promoted.

Work:

- add `evaluateSandboxPatchPromotionReadiness()`
- classify checkpoints as `ready`, `missing_apply_metadata`, `blocked`, or
  `already_resolved`
- require future apply metadata such as `expectedFiles` and `patchDigest`
  before returning `ready`
- keep current review-only checkpoint payloads classified as
  `missing_apply_metadata`
- add the evaluator to `accept:sandbox-coding`

Acceptance:

- evaluator is pure/read-only and does not inspect or write workspace files
- unsafe expected files block readiness
- current patch-promotion Decisions remain non-applying until metadata and
  service integration exist

### T23: Patch Promotion Readiness UI Copy

Status: first Runs and Decisions copy implemented.

Goal: make the read-only promotion readiness state visible before users handle
patch-promotion Decisions.

Work:

- move the readiness evaluator to shared code so renderer and main can reuse
  the same classifier
- show readiness status and summary in the Runs `Staged Patch Review` block
- update pending `workspace.staged_patch` Decision guidance to tell users to
  review Run evidence and promotion readiness first
- keep the current approval language explicit: no automatic workspace writes

Acceptance:

- renderer reads checkpoint payloads only from existing Run detail data
- no workspace file reads or writes are introduced
- current review-only payloads surface as `missing_apply_metadata`

### T24: Durable Patch Promotion Record

Status: first persistence layer implemented.

Goal: give future sandbox patch promotion a durable idempotency and audit
record before any workspace write path exists.

Work:

- add `sandbox_patch_promotions` to the SQLite schema/bootstrap
- add `SandboxPatchPromotionRepository`
- persist checkpoint id, run id, task id, artifact id, source id, Decision id,
  patch digest, expected files, status, audit summary, blocked reasons, and
  applied timestamp
- make `createPending()` idempotent by checkpoint id
- include the repository integration test in `accept:sandbox-coding`

Acceptance:

- no Decision approval path calls the repository yet
- no workspace file reads or writes are introduced
- future apply service can query by checkpoint id or source/digest

### T25: Patch Promotion Apply Metadata

Status: checkpoint payload metadata implemented.

Goal: let newly generated sandbox patch-promotion checkpoints become
readiness-eligible without introducing workspace writes.

Work:

- extend patch-promotion checkpoint payloads with optional `expectedFiles` and
  `patchDigest`
- compute `patchDigest` as `sha256:` over the sandbox patch artifact diff
- pass sandbox artifact files as `expectedFiles`
- preserve backwards compatibility for older review-only checkpoints that lack
  the fields

Acceptance:

- newly persisted sandbox patch review checkpoints carry apply metadata
- old checkpoints still parse and surface `missing_apply_metadata`
- no Decision approval path or apply service is enabled

### T26: Pending Patch Promotion Record Creation

Status: pending record creation implemented.

Goal: connect readiness-eligible patch-promotion checkpoints to the durable
promotion metadata table without applying files.

Work:

- inject `SandboxPatchPromotionRepository` into `AgentCheckpointRecorder`
- create a pending promotion record after a Decision-linked patch-promotion
  checkpoint has `expectedFiles` and `patchDigest`
- key pending creation by checkpoint id for idempotency
- wire the repository through service construction, IPC patch-review
  persistence, and sandbox patch-review adapter factory

Acceptance:

- generated sandbox patch evidence creates a pending promotion record
- missing apply metadata still skips pending record creation
- no Decision approval path or workspace apply path is enabled

### T27: Patch Promotion Apply Preflight

Status: read-only apply preflight implemented.

Goal: validate that the durable promotion record, checkpoint payload, and patch
artifact still describe the same staged patch before any approval path can write
workspace files.

Work:

- add `SandboxPatchPromotionPreflightService`
- load the pending promotion record by checkpoint id
- load the checkpoint and artifact by id through repository lookups
- compare artifact id, Decision id, source id, expected files, patch digest, run,
  and task ownership
- return `ready`, `blocked`, or `already_applied`
- include blocked reasons that explain which durable evidence diverged

Acceptance:

- no workspace file reads or writes are introduced
- no Decision approval path calls the preflight yet
- missing, blocked, mismatched, and already-applied records fail closed or return
  idempotent status
- `accept:sandbox-coding` covers the service and repository lookup helpers

### T28: Patch Promotion Decision Preflight Integration

Status: first fail-closed Decision integration implemented.

Goal: ensure approving a `workspace.staged_patch` Decision cannot silently close
or continue a promotion checkpoint when durable promotion evidence is missing or
mismatched.

Work:

- route approved `patch_promotion` checkpoints through
  `SandboxPatchPromotionPreflightService`
- keep model/tool execution out of the promotion path
- if preflight is ready or already-applied, close the checkpoint with a readable
  no-write diagnostic
- if preflight is blocked, record a failed RunStep, mark the Run failed, and
  state that no workspace files were written
- wire the preflight service into main-process service bootstrap

Acceptance:

- Decision approval still does not apply workspace files
- blocked preflight cannot fall through to generic tool resume
- ready preflight records the exact no-write boundary
- `accept:sandbox-coding` includes the Decision service coverage

### T29: Patch Promotion Apply Service Core

Status: first domain service implemented; Decision/UI integration still
deferred.

Goal: create the safe file-application unit behind the preflight gate without
yet exposing it to normal approval flow.

Work:

- add `SandboxPatchPromotionApplyService`
- reuse the preflight service as the first gate
- parse the sandbox review diff format generated by the staged patch collector
- validate touched files against expected files and workspace-relative safety
- compare current workspace content to the reviewed base content before writes
- compute every pending write before writing any file
- mark durable promotion records as `applied` or `blocked`

Acceptance:

- no UI or Decision approval path calls the apply service yet
- mismatched workspace base content blocks and writes nothing
- already-promoted workspace content is idempotently detected
- `accept:sandbox-coding` covers apply, blocked, and idempotent outcomes

### T30: Gated Patch Promotion Apply Integration

Status: feature-flagged Decision integration implemented.

Goal: close the approved sandbox patch promotion loop without making workspace
writes the default behavior for existing local alpha setups.

Work:

- add `enableSandboxPatchPromotionApply` and
  `TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY`
- wire `SandboxPatchPromotionApplyService` through main-process bootstrap
- keep default Decision behavior as preflight-only no-write output
- when the flag is enabled, route approved `patch_promotion` checkpoints through
  the apply service
- record applied / already-applied / blocked outcomes as checkpoint RunSteps and
  Run results
- update Decision and Settings copy so the UI reflects the active flag

Acceptance:

- default local config still does not apply staged patches
- enabled config applies only after the service passes preflight/base-content
  validation
- blocked apply results fail closed and write no files
- renderer copy distinguishes no-write mode from apply-enabled mode
- real SQLite integration coverage recreates DecisionService after persistence
  to verify restart-safe default no-write and flag-enabled apply behavior
- Runs detail staged patch review distinguishes open, preflight-only resolved,
  blocked/cancelled, and applied workspace-promotion evidence

## Deferred Tasks

These are intentionally outside the first visible mode:

- broad model-visible generic coding tools outside the sandboxed producer
- arbitrary shell
- package installation
- network-enabled coding
- MCP / Skills / browser / computer-use execution
- GitHub mutation
- scheduled autonomous coding
- assignment/mention-triggered coding without skill/process policy
- remote sandbox defaulting

Each needs its own decision before implementation.

## Next Decision

Local disposable-workspace validation for patch promotion apply has passed via
`npm run accept:sandbox-coding:patch-promotion-apply-smoke`: default mode stayed
`no-write`, apply-enabled mode wrote only the reviewed temp-workspace file, and
the smoke did not start Docker or call AI.

The manual-only product switch is now the accepted next step for validating the
real model-backed producer path without turning on broad autonomy. The env flag
only exposes capability; each run must still opt into model producer usage with
explicit context files, selected checks, visible provider-spend copy, sandbox
readiness, and Decision-gated promotion before the model loop can run.

Current support for the first option exists as
`accept:sandbox-coding:model-producer-preview-smoke`. It is skipped by default;
with `TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_PREVIEW_SMOKE=true`, it sends one
provider request, runs the model-backed loop through the sandbox producer
preview service on a disposable workspace, uses an injected check runner, and
does not start Docker or mutate the selected workspace.

Local validation passed with `fal-openrouter` / `google/gemini-2.5-flash`: the
smoke reached `preview_ready`, staged
`.taskplane/code-agent-model-producer-preview-smoke.md`, did not start Docker,
and left the selected workspace unchanged. The staged-file parser now accepts a
single fenced JSON object from providers before applying the same file/path/size
contract, while still rejecting mixed natural-language responses.

The Task detail Code Agent panel now also surfaces the env-only model producer
availability before the user starts a run. Disabled mode says the manual
preview uses the local diagnostic producer and does not call the provider;
enabled mode reveals a per-run `Use model producer` checkbox. The env flag is
therefore only capability availability; provider spend still requires explicit
operator confirmation, explicit context files, selected checks, sandbox preview,
and Decision-gated promotion.

Runs detail now also shows the sandbox producer source from session metadata:
local diagnostic previews are labeled as no-provider-call evidence, while
model-backed runs are labeled as provider-backed and still Decision-gated.
