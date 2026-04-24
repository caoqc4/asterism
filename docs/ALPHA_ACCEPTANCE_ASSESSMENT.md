# Alpha Acceptance Assessment

This assessment maps the alpha checklist to the current automated coverage and the remaining manual validation work.

## Summary

Current status: not alpha-accepted yet. A focused manual alpha pass is now underway and has covered the core local path through task creation, decision creation, no-key run failure, Home recovery, Settings config save, and unsigned macOS directory packaging.

Strong automated coverage already exists for the main control-plane semantics, repository persistence, IPC routing, config/keychain behavior, scheduler behavior, and many renderer interactions. The remaining acceptance work is now narrower: validate a successful AI-backed run with deliberate test credentials, smooth the long task-detail navigation around context-object creation, and defer signed/notarized release work until the unsigned package path stays stable.

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
- state transition still needs a deliberate manual pass
- first-screen recovery is coherent, but long-detail navigation remains awkward for lower sections

## Context Objects

Status: partially validated manually, with UI navigation friction.

Automated coverage:

- repository tests cover source context, blocker, dependency, process template, and task-process binding persistence
- renderer tests cover source context create/edit, key-source behavior, blocker create/resolve, dependency routing, and process template create/apply/remove flows
- home and task tests cover blocker/dependency recovery semantics and escalation wording

Manual result / need:

- source/process/blocker/completion objects were seeded to continue recovery validation after detail scrolling became cumbersome through automation
- packaged app task UI created and resolved a downstream-to-upstream dependency in isolated SQLite under `/tmp/taskplane-alpha-dependency-ui-20260424`; queue priority and task cards reflected the dependency while active and returned after resolution
- Home and task resume reflected blocker/source/method context correctly after the Home fixes
- source/process creation still needs a smoother UI-only manual pass

## Decision And Run Loop

Status: no-key failure path validated manually; real-key success still pending.

Automated coverage:

- decision service tests cover draft/create/action behavior and task signal updates
- run service tests cover success, failure, artifact creation, and task restoration behavior
- repository tests cover decision/run timeline writes
- renderer tests cover quick decision, quick run, related object entry, and refresh behavior

Manual result / need:

- decision creation from the Decisions page worked and surfaced in Home recommended actions and Pending Decisions
- draft run without Keychain API key failed clearly with `AI API Key is not configured in system Keychain`
- real AI-backed draft/run behavior still needs deliberate test credentials

## Completion Loop

Status: manually validated for criteria create/satisfy/reopen and closeout-ready Home wording with approved-decision evidence.

Automated coverage:

- repository tests cover completion-criteria create/update/satisfy/reopen flows
- service and renderer tests cover completion guidance, closeout evidence, satisfied criteria highlights, and likely matching criteria focus

Manual result / need:

- one satisfied and one open criterion surfaced on Home as closeout progress `1 / 2`
- packaged app task UI created a criterion, marked it satisfied, reopened it, and persisted the final open criterion in isolated SQLite under `/tmp/taskplane-alpha-criteria-ui-20260424`
- failed run surfaced as potential evidence without making the task closeout-ready
- packaged app Home showed closeout-ready wording from an isolated positive-evidence fixture with one satisfied criterion and one approved decision; `查看最终收尾依据` opened the approved Decision
- long-detail navigation remains a usability debt, but the criteria create/satisfy/reopen path is now functionally covered

## Home Recovery Loop

Status: manually exercised and improved.

Automated coverage:

- renderer tests cover recommended actions, key signals, recent activity, resume previews, blocker/dependency routing, stale escalation, lane labels, and closeout cues
- brief and shared working-context tests cover lane ordering and timeline priority semantics

Manual result / need:

- Home exposed high-risk, pending-decision, failed-run, and closeout-progress signals coherently in the same session
- fixed issues found during the pass: duplicate unblock task count, blocker activity mislabelled as `查看 Run`, and captured task activity being re-sorted by later updates
- approved-decision positive evidence now validates closeout-ready Home wording; real completed-run evidence remains pending until test credentials exist

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

Finish the remaining alpha checks in this order:

1. Run a successful AI-backed draft/run only with deliberate test credentials.
2. Smooth or re-test source/process creation through the long task-detail UI.
3. Keep signed/notarized packaging out of scope until those product-path checks pass.

Do not expand the domain model until that pass is complete.
