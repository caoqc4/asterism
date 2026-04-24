# Alpha Acceptance Assessment

This assessment maps the alpha checklist to the current automated coverage and the remaining manual validation work.

## Summary

Current status: not alpha-accepted yet, but ready for a focused manual alpha pass.

Strong automated coverage already exists for the main control-plane semantics, repository persistence, IPC routing, config/keychain behavior, scheduler behavior, and many renderer interactions. The remaining acceptance work is less about adding broad code coverage and more about using the built app end to end to catch product friction, information-density issues, and packaging/runtime gaps.

## Verification Gate

Status: mostly covered.

- `npm run verify` has passed locally with tests, type-checking, and production build.
- `npm run smoke:build` has passed locally for build/entrypoint smoke coverage.
- GitHub Actions should remain unused while monthly quota is unavailable.

Manual need:

- Keep using local verification as the temporary source of truth.

## Core Task Loop

Status: partially automated, still needs manual validation.

Automated coverage:

- repository tests cover task creation, updates, transitions, and timeline writes
- service tests cover task transition validity, signal updates, and task-resume derivation
- renderer tests cover task creation, task detail recovery surfaces, transition guidance, timeline summaries, and follow-up flows

Manual need:

- confirm the real desktop flow feels coherent from task creation into the recovery-first detail view
- confirm copy, density, and first-screen layout are usable without test fixtures guiding the path

## Context Objects

Status: strongly automated, still needs manual validation.

Automated coverage:

- repository tests cover source context, blocker, dependency, process template, and task-process binding persistence
- renderer tests cover source context create/edit, key-source behavior, blocker create/resolve, dependency routing, and process template create/apply/remove flows
- home and task tests cover blocker/dependency recovery semantics and escalation wording

Manual need:

- confirm the context-management layer is understandable in a real session
- confirm source/process/blocker/dependency terminology is clear enough without developer context

## Decision And Run Loop

Status: strongly automated, still needs manual validation.

Automated coverage:

- decision service tests cover draft/create/action behavior and task signal updates
- run service tests cover success, failure, artifact creation, and task restoration behavior
- repository tests cover decision/run timeline writes
- renderer tests cover quick decision, quick run, related object entry, and refresh behavior

Manual need:

- confirm AI-backed draft/run behavior with real local settings and keychain state
- confirm failure paths are legible when credentials are missing or provider calls fail

## Completion Loop

Status: strongly automated, still needs manual validation.

Automated coverage:

- repository tests cover completion-criteria create/update/satisfy/reopen flows
- service and renderer tests cover completion guidance, closeout evidence, satisfied criteria highlights, and likely matching criteria focus

Manual need:

- confirm closeout wording is understandable in a real task with several criteria
- confirm completion evidence does not feel too magical or too hidden

## Home Recovery Loop

Status: strongly automated, high-priority manual validation.

Automated coverage:

- renderer tests cover recommended actions, key signals, recent activity, resume previews, blocker/dependency routing, stale escalation, lane labels, and closeout cues
- brief and shared working-context tests cover lane ordering and timeline priority semantics

Manual need:

- confirm Home reads as a control surface rather than a long dashboard
- confirm priority ordering feels right with realistic mixed task data
- confirm resume previews and key signals do not compete for the same attention

## Settings And Local Config

Status: automated coverage is good, manual validation still needed.

Automated coverage:

- config tests cover defaults, writes, legacy migration, corrupt legacy files, unknown provider fallback, and invalid feature flags
- keychain tests cover status config path, legacy key migration, save behavior, and missing API-key runtime errors
- renderer tests cover Settings save flow and scheduler status refresh

Manual need:

- confirm Settings save behavior against the real OS keychain
- confirm config path display is useful and not too noisy for normal users

## Release Readiness

Status: not ready for release; ready for local alpha-path validation.

Automated/local coverage:

- `npm run build` passes through `npm run verify`
- `npm run smoke:build` passes

Manual need:

- run `npm run dist:mac:dir` only after the manual alpha path passes
- inspect the unpacked app before any signed/notarized release planning
- defer signed/notarized release work until product friction from the alpha path is addressed

## Recommended Next Step

Run the manual alpha path in one uninterrupted session:

1. Start the app locally.
2. Create a realistic task.
3. Add source context, a process template, a blocker or dependency, and at least one completion criterion.
4. Trigger a decision draft or run.
5. Inspect Home recovery and related object navigation.
6. Save Settings and confirm scheduler/config status.
7. Record every friction point as either a product copy issue, layout issue, missing state, or real bug.

Do not expand the domain model until that pass is complete.

