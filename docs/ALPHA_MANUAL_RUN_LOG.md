# Alpha Manual Run Log

Use this file when running the manual alpha path. Keep entries short and actionable.

## Run Metadata

- Date: 2026-04-24
- Build / commit: local working tree after `7bb7685`
- Tester: Codex
- Local verification run: targeted main/preload tests, `npm run lint`, `npm run build`, `npm run verify`
- Smoke check run: `npm run dev` manual launch, isolated `TASKPLANE_USER_DATA_DIR=/tmp/taskplane-alpha-20260424-fresh npm run dev`, `npm run smoke:build`

## Result Summary

- Overall result: `pass with issues`
- Highest severity issue: dev launch path was blocked until Electron startup, native-module ABI, dev URL, and preload format issues were fixed.
- Follow-up owner: project maintainers

## Findings

| Area | Step | Result | Finding | Severity | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Verification Gate | `npm run verify` | Pass | Initially failed while `better-sqlite3` was rebuilt for Electron ABI; passed after adding and running `npm run rebuild:node`. | Medium | Keep Node/Electron ABI switch documented. |
| Verification Gate | `npm run smoke:build` when needed | Pass | Updated smoke check for `bootstrap.cjs` and `preload.cjs`; build smoke passes. | Low | Keep smoke check aligned with entrypoint changes. |
| Dev Launch | Start `npm run dev` | Pass | App launches to Home after clearing `ELECTRON_RUN_AS_NODE`, rebuilding native modules for Electron, loading `localhost`, using a CJS preload bundle, and prebuilding fresh Electron outputs before watchers start. | High | Keep as regression guard in development docs. |
| Dev Launch | Isolated userData env | Pass with issue | First isolated attempt used stale compiled output and wrote `Alpha manual task` to the default DB; after adding the prebuild step, Settings showed `/tmp/taskplane-alpha-20260424-fresh/config.json`. Accidental default-DB test data was deleted after approval. | Medium | Keep isolated userData required for manual alpha runs. |
| Core Task Loop | Create task and open detail | Pass | Created `Alpha manual task` in isolated userData; task event appeared and detail pane opened. | Low | Continue richer task-object coverage. |
| Core Task Loop | Update summary / next step / state | Partial | Saved summary and next step; list card and Home recovery preview reflected the next-step update. State transition was not changed. | Low | Run state transition in next manual pass. |
| Context Objects | Add source/process/blocker/dependency | Partial | In isolated userData, created `Prepare alpha onboarding brief`, saved summary/next step through UI, then seeded one key source, one bound process checklist, one active blocker, and two completion criteria to continue recovery validation. Dependency was not run. | Low | Re-run object creation through UI once long-detail editing is smoother. |
| Context Objects | Resolve blocker/dependency | Partial | Resolved the active blocker from Home. Home blocked count changed from 1 to 0 and Recent Activity showed the blocker resolution. Dependency recovery was not run. | Low | Add a dependency-specific manual pass. |
| Decision And Run Loop | Create or draft decision | Not run |  |  |  |
| Decision And Run Loop | Trigger run and inspect result | Not run |  |  |  |
| Completion Loop | Add/satisfy/reopen criteria | Partial | Seeded two open completion criteria and verified they participated in the task context path. Satisfy/reopen was not run. | Low | Exercise criteria toggle/reopen from UI. |
| Completion Loop | Inspect closeout evidence | Not run |  |  |  |
| Home Recovery Loop | Open items from Home | Partial | Home opened the created task from resume preview and exposed key source, current method, active blocker, and blocker source actions. A source-linked blocker produced two actions for one task. | Low | Re-test after the unique-task headline fix. |
| Home Recovery Loop | Inspect priority ordering | Partial | With one source-linked active blocker, Home headline incorrectly said `2 条任务` because blocker follow-up and source re-evaluation were both counted as tasks. Resume preview also showed `查看 Run` for a blocker-resolved activity. | Medium | Fixed in working tree; verify with unit and full local checks. |
| Settings And Local Config | Save settings and inspect status | Partial | Settings view opens, config path renders, and empty keychain status is visible. No settings were saved in this pass. | Low | Run save path with deliberate test config. |
| Release Readiness | Build/smoke/package readiness | Partial | `npm run build` passes, emits `preload.cjs`, and `npm run smoke:build` passes. Packaging install/run validation still pending. | Medium | Run packaged app validation before alpha acceptance. |

## Notes

- Record copy/layout friction separately from functional bugs.
- Do not expand the domain model during the run; capture new ideas as follow-up candidates.
- Do not manually dispatch or watch GitHub Actions while Actions quota is unavailable.
