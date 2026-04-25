# Alpha Acceptance Assessment

This assessment maps the alpha checklist to the current automated coverage and the remaining manual validation work.

## Summary

Current status: functionally alpha-accepted for the local unsigned build path, with signed/notarized release work still deferred. A focused manual alpha pass has covered the core local path through task creation, task state transition, decision creation, no-key run failure, successful AI-backed run, Home recovery, Settings config save, completion closeout, and unsigned macOS directory packaging.

Strong automated coverage already exists for the main control-plane semantics, repository persistence, IPC routing, config/keychain behavior, scheduler behavior, and many renderer interactions. The remaining acceptance work is now release-focused: keep local verification as the source of truth while GitHub Actions quota is unavailable, and defer signed/notarized release work until the unsigned package path stays stable.

## Verification Gate

Status: mostly covered.

- `npm run verify` has passed locally with tests, type-checking, and production build.
- `npm run smoke:build` has passed locally for build/entrypoint smoke coverage.
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

Status: validated manually for no-key failure and successful AI-backed draft run; read-only workspace agent runs now have an isolated automated acceptance path, with a desktop manual pass deferred to release-readiness.

Automated coverage:

- decision service tests cover draft/create/action behavior and task signal updates
- run service tests cover success, failure, artifact creation, and task restoration behavior
- repository tests cover decision/run timeline writes
- renderer tests cover quick decision, quick run, related object entry, and refresh behavior
- agent execution tests cover read-only workspace tools, an isolated RunService read-only workspace agent path through persisted run detail, policy-gated workspace plan steps, per-run workspace opt-in, session capability metadata, Runs-page workspace / patch-command capability visibility, and prompt guidance that only exposes workspace tools when opted in

Manual result / need:

- decision creation from the Decisions page worked and surfaced in Home recommended actions and Pending Decisions
- Decision page now keeps formal approve/defer/cancel actions limited to pending Decisions; resolved Decisions retain task recovery without exposing duplicate formal actions
- draft run without Keychain API key failed clearly with `AI API Key is not configured in system Keychain`
- with deliberate local `.env` Replicate credentials, the dev app triggered a `draft` run for `Replicate alpha successful run check` under isolated `TASKPLANE_USER_DATA_DIR=/tmp/taskplane-alpha-replicate-run-20260424`; SQLite confirmed `status=completed`, `output_source=ai`, output length `1540`, a `run.completed` timeline event, a `run_output` artifact, and a next-step update
- read-only workspace agent runs are covered in an isolated local RunService path with workspace root, per-run opt-in, persisted `fileContext` capability, workspace search/read observations, final agent output, and no patch or command execution; repeat the same path manually in the packaged app before release-readiness signoff

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

Status: not ready for release; local unsigned directory packaging and runtime launch pass after packaging fixes.

Automated/local coverage:

- `npm run build` passes through `npm run verify`
- `npm run smoke:build` passes
- `npm run dist:mac:dir` passes and produces `release/mac-arm64/Taskplane.app`
- unpacked app structure, `Info.plist`, native module unpacking, and ad-hoc code signature were inspected locally
- packaged runtime launch now works with isolated `TASKPLANE_USER_DATA_DIR`; Home renders from `app.asar/dist/index.html`, SQLite/config are created in the isolated directory, and task creation persists

Manual need:

- keep using the fixed `dist:mac:dir` script, which rebuilds native modules for Electron before packaging and restores Node ABI afterward
- defer signed/notarized release work until product friction from the alpha path is addressed

## Recommended Next Step

Finish the remaining alpha work in this order:

1. Keep signed/notarized packaging out of scope until the next release-readiness pass explicitly targets signing and notarization.
2. Repeat the read-only workspace agent path manually in the packaged app before release-readiness signoff.
3. Keep any further alpha friction as small acceptance fixes rather than adding new domain objects.

Do not expand the domain model until the release-readiness pass is cleaner.
