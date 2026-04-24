# Alpha Acceptance Checklist

Use this checklist for manual local validation before treating the prototype as alpha-ready.

For the current coverage and manual-validation assessment, see [ALPHA_ACCEPTANCE_ASSESSMENT.md](ALPHA_ACCEPTANCE_ASSESSMENT.md).

## Verification Gate

- Run `npm run verify`.
- Run `npm run smoke:build` if package, build, Electron entrypoint, or packaging configuration changed.
- Do not manually dispatch or watch GitHub Actions while Actions quota is unavailable.

## Core Task Loop

- Create a new task from the Tasks page.
- Confirm the task opens into the recovery-first detail view.
- Add or update summary and next step.
- Move the task through at least one valid state transition.
- Confirm the timeline explains the change with readable wording.

## Context Objects

- Add a source context item and mark it as key.
- Add a process template and bind it to the task.
- Add a blocker or dependency.
- Confirm the task resume card and Home surface reflect the active bottleneck.
- Resolve the blocker or dependency and confirm recovery wording changes.

## Decision And Run Loop

- Draft or create a decision from a task.
- Act on the decision and confirm the task updates with follow-up semantics.
- Trigger a run from a task.
- Confirm run output or failure writes back to the task timeline.
- Open the related Decision or Run from task / object timeline actions.

## Completion Loop

- Add at least one completion criterion.
- Satisfy and reopen it.
- Confirm closeout guidance changes when criteria are satisfied or nearly satisfied.
- Confirm recent decisions, runs, or artifacts can surface as completion evidence when relevant.

## Home Recovery Loop

- Confirm Home recommended actions prioritize escalation, unblock/decide, continue/review, and clarify work coherently.
- Open a task from Home recent activity, key signals, and resume previews.
- Confirm follow-up drafts or suggested next moves are prefilled only when context supports them.
- Confirm stale blocker or stale dependency cases read as escalation instead of ordinary blocked work.

## Settings And Local Config

- Save Settings with provider, model, API key, and scheduler flag.
- Confirm status reflects the local config path.
- Restart locally if needed and confirm non-sensitive settings persist.
- Confirm missing API key behavior is explicit rather than silent.

## Release Readiness

- Build locally with `npm run build`.
- Run `npm run smoke:build` before packaging.
- Produce `npm run dist:mac:dir` only after the manual alpha path is coherent.
- Do not start signed/notarized release work until the local alpha path passes without major friction.
