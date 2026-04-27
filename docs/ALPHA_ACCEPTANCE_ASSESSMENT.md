# Alpha Acceptance Assessment

This assessment maps the alpha checklist to the current automated coverage and the remaining manual validation work.

## Summary

Current status: functionally alpha-accepted for the local unsigned build path, with signed/notarized release work still deferred. A focused manual alpha pass has covered the core local path through task creation, task state transition, decision creation, no-key run failure, successful AI-backed run, packaged read-only workspace agent execution, Home recovery, Settings config save, completion closeout, and unsigned macOS directory packaging.

Strong automated coverage already exists for the main control-plane semantics, repository persistence, IPC routing, config/keychain behavior, scheduler behavior, and many renderer interactions. The remaining acceptance work is now release-focused: keep local verification as the source of truth while GitHub Actions quota is unavailable, and defer signed/notarized release work until the unsigned package path stays stable.

## Verification Gate

Status: mostly covered.

- `npm run verify` has passed locally with tests, type-checking, and production build.
- on 2026-04-27, `npm run verify` passed locally with 119 test files / 830
  tests after tightening Code Agent model-context gates, checkpoint-backed
  session settlement, stale resume-payload UI/backend gating, supported
  resume-input validation, scheduler checkpoint-state exclusion, browser
  controlled Decision consequence wording, Code Agent checkpoint recovery
  guidance, approved checkpoint evidence wording, and updating the local
  acceptance status.
- on 2026-04-25, `npm run verify` passed locally with 66 test files / 484 tests
  after the Home recovery and execution-layer status cleanup.
- on 2026-04-25, `npm run verify` passed again after the runtime schema smoke
  coverage and local alpha gate documentation refresh.
- `npm run smoke:build` has passed locally for build/entrypoint smoke coverage.
- on 2026-04-25, `npm run smoke:build` passed again after the execution-layer
  checkpoint-event boundary refactor.
- `npm run accept:agent-local` passes locally for the non-live agent execution
  boundary.
- `npm run accept:provider-native-live:preflight` reports the current local
  provider-native `.env` as ready without calling the provider or spending
  test credit.
- on 2026-04-27, `npm run accept:release:mac-preflight` passed its local test
  wrapper and read-only preflight. It performed no signing, notarization,
  upload, or Apple network request, and reported `status=not-ready` because
  Developer ID signing and Apple notarization credentials are not configured.
- GitHub Actions should remain unused while monthly quota is unavailable.

Manual need:

- Keep using local verification as the temporary source of truth.

## Core Task Loop

Status: mostly covered for the first local pass.

Automated coverage:

- repository tests cover task creation, updates, transitions, and timeline writes
- service tests cover task transition validity, signal updates, and task-resume derivation
- renderer tests cover task creation, task detail recovery surfaces, transition guidance, timeline summaries, and follow-up flows

Manual result / need:

- real desktop task creation, detail open, summary save, and next-step save worked in isolated userData
- packaged app task UI transitioned `State transition alpha check` from `captured` to `planned` in isolated SQLite under `/tmp/taskplane-alpha-state-transition-20260424`; SQLite confirmed the final state and `task.transitioned` timeline payload
- first-screen recovery is coherent; a compact task-detail section jump bar now reduces lower-section navigation friction, and the packaged app confirmed jumping from Context Studio back to Action Desk

## Context Objects

Status: mostly validated manually, with UI navigation friction.

Automated coverage:

- repository tests cover source context, blocker, dependency, process template, and task-process binding persistence
- renderer tests cover source context create/edit, key-source behavior, blocker create/resolve, dependency routing, and process template create/apply/remove flows
- home and task tests cover blocker/dependency recovery semantics and escalation wording

Manual result / need:

- source/process/blocker/completion objects were seeded to continue recovery validation after detail scrolling became cumbersome through automation
- packaged app task UI created and resolved a downstream-to-upstream dependency in isolated SQLite under `/tmp/taskplane-alpha-dependency-ui-20260424`; queue priority and task cards reflected the dependency while active and returned after resolution
- first-screen context shortcuts now expose empty-state `新增来源材料` and `新增方法模板`; packaged app validated that the source shortcut lands on Source Context rather than Action Setup
- packaged app task UI created `DB source` and `DB process` in a clean isolated run under `/tmp/taskplane-alpha-db-probe-20260424`; SQLite confirmed the key source row, active process template row, and active task-process binding row
- packaged app task UI edited and archived source/process context under `/tmp/taskplane-alpha-source-process-edit-20260424`; SQLite confirmed `Edited source via UI`, source archived state, process archive checkpoint, and `Edited process via UI`
- Home and task resume reflected blocker/source/method context correctly after the Home fixes
- source/process create/edit/archive is functionally covered, with task-detail section jumps added and packaged-app checked for lower-section recovery

## Decision And Run Loop

Status: validated manually for no-key failure, successful AI-backed draft run, and packaged read-only workspace agent execution. The first write-capable slice is covered at code/integration level but is not yet exposed in agent prompts or the task UI.

Automated coverage:

- decision service tests cover draft/create/action behavior and task signal updates
- run service tests cover success, failure, artifact creation, and task restoration behavior
- repository tests cover decision/run timeline writes
- renderer tests cover quick decision, quick run, related object entry, and refresh behavior
- agent execution tests cover read-only workspace tools, an isolated RunService read-only workspace agent path through persisted run detail, policy-gated workspace plan steps, per-run workspace opt-in, session capability metadata, Runs-page workspace / patch-command capability visibility, prompt guidance that only exposes workspace tools when opted in, normal-run fallback when a model proposes `workspace.write_patch` or registry-only domain mutation tools, provider-native fallback when a relay returns workspace write/command proposals, confirmation-gated `workspace.write_patch`, workspace-boundary / expected-file rejection, service-routed task next-step / completion-criterion / source-context tools through real SQLite repositories, high-risk completion-criterion checkpointing before task mutation, RunService-level completion evidence review without satisfying criteria or completing tasks, draft-only Decision proposals, Runs-page patch and command checkpoint summaries, Decision checkpoint consequence wording, and Decision approval resumption through real SQLite repositories
- execution-layer v2 tests now cover typed agent runtime events, event-to-RunStep projection, local/provider-native session result projection, centralized tool-permission and resume checkpoint recording, Decision-linked checkpoint metadata, restart-safe resume payload fields, stale/incompatible resume payload rejection before tool execution, and the shared prompt/provider tool exposure matrix

Manual result / need:

- decision creation from the Decisions page worked and surfaced in Home recommended actions and Pending Decisions
- Decision page now keeps formal approve/defer/cancel actions limited to pending Decisions; resolved Decisions retain task recovery without exposing duplicate formal actions
- draft run without Keychain API key failed clearly with `AI API Key is not configured in system Keychain`
- with deliberate local `.env` Replicate credentials, the dev app triggered a `draft` run for `Replicate alpha successful run check` under isolated `TASKPLANE_USER_DATA_DIR=/tmp/taskplane-alpha-replicate-run-20260424`; SQLite confirmed `status=completed`, `output_source=ai`, output length `1540`, a `run.completed` timeline event, a `run_output` artifact, and a next-step update
- read-only workspace agent runs are covered in an isolated local RunService path with workspace root, per-run opt-in, persisted `fileContext` capability, workspace search/read observations, final agent output, and no patch or command execution
- packaged app manual pass under `TASKPLANE_USER_DATA_DIR=/tmp/taskplane-alpha-workspace-agent-manual-20260425` and `TASKPLANE_WORKSPACE_ROOT=/tmp/taskplane-alpha-workspace-root-manual-20260425` triggered an `agent` run with read-only workspace context enabled; SQLite confirmed the run completed with `output_source=ai`, agent session `fileContext=true`, workspace search/read observations for `docs/marker.txt`, note/run-output artifacts, and no open checkpoints
- `workspace.write_patch` now requires explicit local file-write policy, creates a confirmation checkpoint with expected files and diff preview, applies only after the linked Decision is approved, rejects path escapes or files outside `expectedFiles`, and falls back instead of accepting model-proposed patch steps in normal runs; `workspace.run_command` now follows the accepted `test` / `lint` allowlist decision as a registry-only confirmed package-script runner with Decision approval resume, while still staying out of model prompts and normal agent plans
- on 2026-04-25, `npm run accept:agent-local` passed locally, covering workspace patch approval, domain task tools, and provider-native tool-call boundaries without external provider calls; renderer coverage also confirms Runs and Decisions expose checkpoint review wording for patch and command tools without adding prompt exposure
- on 2026-04-25, `npm run accept:agent-local` passed again after the execution-layer v2 slices, covering workspace patch approval, domain task tools, provider-native tool-call boundaries, checkpoint recorder refactoring, and restart-safe resume payload validation without external provider calls
- on 2026-04-25, `npm run accept:agent-local` passed again after the runtime
  schema smoke coverage and alpha gate documentation refresh
- `npm run accept:provider-native-live:preflight` reports the current local
  `fal-openrouter` / `google/gemini-2.5-flash` setup is ready with
  provider-native tool calls enabled; the live provider-native validation
  commands remain deliberately opt-in because they spend configured provider
  credit
- domain tools can update a task next step, create a completion criterion, review completion evidence without satisfying criteria or completing the task, create source context, and draft a Decision through services; they are prompt-exposed and accepted from model plans only when a run explicitly opts into `allowTaskMutationTools`, and high-risk criterion creation now requires Decision approval before the task is mutated
- execution-layer design docs now define the accepted v2 boundary, sandbox boundary, tool exposure matrix, and future post-Slice-0 design; broad code-agent mode, arbitrary shell, browser/computer control, external posting, and always-on autonomy remain deferred
- the model-backed Code Agent producer path is now documented as a manual
  two-step gate: env capability is passive, and provider-backed runs require
  per-run `Use model producer`, explicit context files, selected `test` /
  `lint`, operator confirmation, sandbox preview, and Decision-gated promotion
- Runs detail now makes that gate auditable by labeling sandbox producer source
  as local diagnostic/no-provider-call or model-backed/provider-credit-spent
- Code Agent model context is now separately gated by context type: selected
  workspace files can enter the provider prompt as bounded read-only evidence;
  selected source-context content can enter only through explicit per-run
  stored-snapshot opt-in; selected artifacts are manifest-only with
  `content=no`; hidden `includeArtifactContent=true` requests and source-content
  opt-ins without selected source contexts fail before provider config is
  resolved
- Runs detail renders the provider-visible context manifest as readable audit
  evidence with provider-prompt content state and per-item `content=yes/no`
  labels, while still avoiding raw prompt/source/artifact dumps
- Restart/replay review now avoids false resumability: paused or confirmation
  sessions without an open checkpoint are `checkpoint_missing` inspect-only,
  and the coarse restart hint says checkpoint `expected` while leaving actual
  resumability to checkpoint-aware review

Manual need:

- run a deliberate packaged/manual pass for the model producer gate only when
  provider credit is intentionally being spent; until then, keep using
  preflight, default-skipped smokes, local renderer/IPC coverage, and
  manifest/context gate tests

## Completion Loop

Status: manually validated for criteria create/satisfy/reopen, closeout-ready Home wording, and pure UI transition to completed.

Automated coverage:

- repository tests cover completion-criteria create/update/satisfy/reopen flows
- service and renderer tests cover completion guidance, closeout evidence, satisfied criteria highlights, and likely matching criteria focus

Manual result / need:

- one satisfied and one open criterion surfaced on Home as closeout progress `1 / 2`
- packaged app task UI created a criterion, marked it satisfied, reopened it, and persisted the final open criterion in isolated SQLite under `/tmp/taskplane-alpha-criteria-ui-20260424`
- failed run surfaced as potential evidence without making the task closeout-ready
- packaged app Home showed closeout-ready wording from an isolated positive-evidence fixture with one satisfied criterion and one approved decision; `查看最终收尾依据` opened the approved Decision
- the criteria create/satisfy/reopen path is functionally covered, with task-detail section jumps added to make criteria and action sections easier to revisit
- the pure UI packaged pass for `Completion UI finish check` added and satisfied a completion criterion, surfaced closeout-ready Home wording, prioritized `转到 completed（完成标准已满足）` first in Action Desk, and SQLite confirmed `captured -> planned -> running -> completed` timeline events

## Home Recovery Loop

Status: manually exercised and improved.

Automated coverage:

- renderer tests cover recommended actions, key signals, recent activity, resume previews, blocker/dependency routing, stale escalation, lane labels, and closeout cues
- brief and shared working-context tests cover lane ordering and timeline priority semantics

Manual result / need:

- Home exposed high-risk, pending-decision, failed-run, and closeout-progress signals coherently in the same session
- fixed issues found during the pass: duplicate unblock task count, blocker activity mislabelled as `查看 Run`, and captured task activity being re-sorted by later updates
- packaged app Home fixture under `/tmp/taskplane-alpha-home-open-items-20260424` re-tested the unique-task headline fix and opened key source, recent activity, blocked key signal, and resume preview entries back into the expected task/source/blocker recovery targets
- approved-decision positive evidence validates closeout-ready Home wording, and the successful Replicate run now provides real completed-run evidence for the run/artifact timeline path

## Settings And Local Config

Status: non-sensitive config save validated manually; real keychain write still pending.

Automated coverage:

- config tests cover defaults, writes, legacy migration, corrupt legacy files, unknown provider fallback, and invalid feature flags
- keychain tests cover status config path, legacy key migration, save behavior, and missing API-key runtime errors
- renderer tests cover Settings save flow and scheduler status refresh

Manual result / need:

- Settings wrote non-sensitive provider/model/scheduler config to isolated `config.json`
- empty API key left Keychain status explicit and unchanged
- real OS keychain write should be tested only with deliberate test credentials

## Release Readiness

Status: locally ready for the unsigned macOS directory build path; signed and
notarized release remains deferred.

Automated/local coverage:

- `npm run build` passes through `npm run verify`
- `npm run smoke:build` passes
- `npm run dist:mac:dir` passes and produces `release/mac-arm64/Taskplane.app`
- `npm run smoke:package:mac` verifies unpacked app structure, `Info.plist`, native module unpacking, ASAR integrity metadata, required ASAR entries, absence of compiled test files, executable bit, and the ad-hoc code signature locally
- `npm run smoke:runtime:mac` launches the packaged executable with isolated user data, clears `ELECTRON_RUN_AS_NODE`, and confirms `config.json` plus `taskplane.db` are created with the core SQLite schema
- `npm run smoke:release:mac` combines the unsigned macOS package build and both package/runtime smoke checks
- on 2026-04-27, `npm run smoke:release:mac` passed locally after the Code
  Agent context-gate and restart/replay safety updates. It rebuilt Electron
  native modules, generated the unsigned/ad-hoc
  `release/mac-arm64/Taskplane.app`, passed package smoke and code-sign
  verification, launched the packaged runtime with isolated user data, and
  confirmed the app initializes its config and SQLite schema.
- on 2026-04-25, `npm run smoke:release:mac` passed locally after the execution-layer v2 work, including Electron native module rebuild, unsigned app packaging, package smoke, and runtime smoke
- on 2026-04-25, `npm run smoke:release:mac` passed again after runtime smoke
  started checking the packaged SQLite schema
- `npm run release:mac:preflight` now checks local signed/notarized release prerequisites without signing, notarizing, uploading, or calling Apple services
- on 2026-04-27, `npm run accept:release:mac-preflight` passed locally. The
  preflight found `notarytool`, `build.appId=com.taskplane.app`, product name
  `Taskplane`, and mac targets `dmg, zip`, but still reported `status=not-ready`
  because no Developer ID Application signing identity / `CSC_NAME` /
  `CSC_LINK` and no Apple ID or App Store Connect API notarization credentials
  are configured.
- on 2026-04-25, `npm run release:mac:preflight` reported the host has
  `notarytool` and package metadata, while Developer ID signing and Apple
  notarization credentials remain unconfigured. The preflight now recognizes
  either Apple ID app-specific password credentials or App Store Connect API
  key credentials as valid notarization inputs.
- packaged runtime launch now works with isolated `TASKPLANE_USER_DATA_DIR`; Home renders from `app.asar/dist/index.html`, SQLite/config are created in the isolated directory, and task creation persists

Manual need:

- keep using the fixed `dist:mac:dir` script, which rebuilds native modules for Electron before packaging and restores Node ABI afterward
- defer the actual signed/notarized release pass until product friction from the alpha path is addressed

## Recommended Next Step

Finish the remaining alpha work in this order:

1. Keep actual signed/notarized packaging out of scope until the next release-readiness pass explicitly targets signing and notarization execution.
2. Keep live provider-native validation opt-in because it spends configured
   provider credit, even though the local preflight is ready.
3. Keep any further alpha friction as small acceptance fixes rather than adding new domain objects.
4. Treat the current execution-layer v2 and Code Agent context-gate slices as
   locally accepted for the alpha path; next execution work should be
   acceptance/documentation cleanup, release-readiness hardening, or explicitly
   deferred design work, not new model-visible power.

Do not expand the domain model until signed/notarized release work is explicitly
in scope.
