# Alpha Manual Run Log

Use this file when running the manual alpha path. Keep entries short and actionable.

## Run Metadata

- Date: 2026-04-24
- Build / commit: local working tree after `787a27e`
- Tester: Codex
- Local verification run: targeted main/preload tests, `npm run lint`, `npm run build`, `npm run verify`
- Smoke check run: `npm run dev` manual launch, isolated `TASKPLANE_USER_DATA_DIR=/tmp/taskplane-alpha-20260424 npm run dev`, `npm run smoke:build`

## Result Summary

- Overall result: `pass with issues`
- Highest severity issue: dev launch path was blocked until Electron startup, native-module ABI, dev URL, and preload format issues were fixed.
- Follow-up owner: project maintainers

## Findings

| Area | Step | Result | Finding | Severity | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Verification Gate | `npm run verify` | Pass | Initially failed while `better-sqlite3` was rebuilt for Electron ABI; passed after adding and running `npm run rebuild:node`. | Medium | Keep Node/Electron ABI switch documented. |
| Verification Gate | `npm run smoke:build` when needed | Pass | Updated smoke check for `bootstrap.cjs` and `preload.cjs`; build smoke passes. | Low | Keep smoke check aligned with entrypoint changes. |
| Dev Launch | Start `npm run dev` | Pass | App launches to Home after clearing `ELECTRON_RUN_AS_NODE`, rebuilding native modules for Electron, loading `localhost`, and using a CJS preload bundle. | High | Keep as regression guard in development docs. |
| Core Task Loop | Create task and open detail | Pass | Created `Alpha manual task` in isolated userData; task event appeared and detail pane opened. | Low | Continue richer task-object coverage. |
| Core Task Loop | Update summary / next step / state | Partial | Saved summary and next step; list card and Home recovery preview reflected the next-step update. State transition was not changed. | Low | Run state transition in next manual pass. |
| Context Objects | Add source/process/blocker/dependency | Not run |  |  |  |
| Context Objects | Resolve blocker/dependency | Not run |  |  |  |
| Decision And Run Loop | Create or draft decision | Not run |  |  |  |
| Decision And Run Loop | Trigger run and inspect result | Not run |  |  |  |
| Completion Loop | Add/satisfy/reopen criteria | Not run |  |  |  |
| Completion Loop | Inspect closeout evidence | Not run |  |  |  |
| Home Recovery Loop | Open items from Home | Partial | Home showed the created task in Recent Activity and Resume Previews after detail save. | Low | Click recovery actions in next manual pass. |
| Home Recovery Loop | Inspect priority ordering | Partial | Home counters updated to one active task and zero missing next steps after adding a next step. | Low | Add mixed lane/risk data in a later pass. |
| Settings And Local Config | Save settings and inspect status | Partial | Settings view opens, config path renders, and empty keychain status is visible. No settings were saved in this pass. | Low | Run save path with deliberate test config. |
| Release Readiness | Build/smoke/package readiness | Partial | `npm run build` passes, emits `preload.cjs`, and `npm run smoke:build` passes. Packaging install/run validation still pending. | Medium | Run packaged app validation before alpha acceptance. |

## Notes

- Record copy/layout friction separately from functional bugs.
- Do not expand the domain model during the run; capture new ideas as follow-up candidates.
- Do not manually dispatch or watch GitHub Actions while Actions quota is unavailable.
