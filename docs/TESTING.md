# Testing Map

## Overview

Taskplane currently uses a layered testing strategy:

- service-level unit tests for domain and config logic
- SQLite-backed integration tests for repository behavior
- renderer `jsdom` interaction tests for key control-plane flows
- IPC handler tests for event-emitting main-process entrypoints
- local `test + lint + build` verification

Current test files:

- `src/main/config/app-config-service.test.ts`
- `src/main/domain/task/task-service.test.ts`
- `src/main/domain/decision/decision-service.test.ts`
- `src/main/domain/run/run-service.test.ts`
- `src/main/domain/brief/home-brief-service.test.ts`
- `src/main/scheduler/scheduler-service.test.ts`
- `src/main/db/repositories/task-repository.integration.test.ts`
- `src/main/db/repositories/run-repository.integration.test.ts`
- `src/main/db/repositories/decision-repository.integration.test.ts`
- `src/main/db/repositories/brief-snapshot-repository.integration.test.ts`
- `src/main/db/repositories/waiting-item-repository.integration.test.ts`
- `src/main/db/repositories/artifact-repository.integration.test.ts`
- `src/main/db/repositories/source-context-repository.integration.test.ts`
- `src/main/db/repositories/blocker-repository.integration.test.ts`
- `src/main/db/repositories/task-dependency-repository.integration.test.ts`
- `src/main/db/repositories/completion-criteria-repository.integration.test.ts`
- `src/main/db/repositories/process-template-repository.integration.test.ts`
- `src/main/db/repositories/task-process-binding-repository.integration.test.ts`
- `src/main/executors/text-executor.test.ts`
- `src/main/domain/run/process-template-selector.test.ts`
- `src/main/domain/decision/process-template-selector.test.ts`
- `src/main/ipc/handlers.test.ts`
- `src/main/preload.test.ts`
- `src/renderer/App.test.tsx`

## Coverage Map

### Service tests

Covered today:

- `AppConfigService`
  config defaults, persistence, migration behavior
- `TaskService`
  transitions, invalid transitions, signal updates, task-resume derivation, blocker/dependency/completion-criteria lifecycle writes, decision annotations, and run-settlement annotations
- `DecisionService`
  task existence checks, decision-to-task lifecycle linkage, and AI/fallback decision-draft composition
- `RunService`
  successful execution path, failure path, task restoration after settled runs, artifact creation on successful output, and process-template selector behavior
- `TextExecutor`
  lane-aware run prompt composition
- `HomeBriefService`
  waiting, risk, missing-next-step, recommended actions, recent artifacts, recent lifecycle activity, artifact-aware brief semantics, and active-task process-template candidate aggregation
- `SchedulerService`
  startup behavior, cron registration, fallback brief generation, and brief-time process-template selector behavior

These tests protect core business semantics before SQLite or renderer concerns enter the picture.

### Repository integration tests

Covered today:

- `TaskRepository`
  task creation, signal persistence, structured timeline writes, transitions
- `RunRepository`
  run creation, result persistence, stale run queries
- `DecisionRepository`
  decision creation, action persistence, timeline writes
- `BriefSnapshotRepository`
  source persistence, fallback reasons, recent ordering, and limit behavior
- `WaitingItemRepository`
  active waiting-item upserts and resolution behavior
- `ArtifactRepository`
  artifact persistence, recent ordering, and timeline writes
- `SourceContextRepository`
  source-context creation, updates, archiving, and active-task listing behavior
- `BlockerRepository`
  active blocker creation, updates, resolution, and per-task active lookup behavior
- `TaskDependencyRepository`
  active task-dependency creation, updates, resolution, and per-task active lookup behavior
- `CompletionCriteriaRepository`
  completion-criteria creation, updates, satisfy/reopen flows, and per-task ordering behavior
- `ProcessTemplateRepository`
  reusable process-template creation, updates, archive behavior, and active listing
- `TaskProcessBindingRepository`
  task-level template apply/remove flows and active binding listing

These tests verify real SQLite behavior rather than mocked repository calls.

### IPC handler tests

Covered today:

- `settings:setAiConfig`
  config writes, scheduler start/stop decisions, `settings.changed`
- `decision:act`
  decision action routing plus `decision.changed` and `task.changed`
- `run:trigger`
  run trigger routing plus `run.changed`, `task.changed`, and `brief.changed`
- `completionCriteria:create`
  completion-criteria writes plus `task.changed`

These tests protect the main-process edge where renderer calls become domain actions and event broadcasts.

### Preload bridge tests

Covered today:

- `window.api` exposure through `contextBridge`
- invoke-channel bindings for preload methods
- event subscription forwarding plus unsubscribe behavior

These tests protect the boundary between the Electron main process and the renderer workbench.

### Renderer interaction tests

Covered today:

- `Home recommended action -> Tasks detail`
- `Home recent artifact -> Tasks detail continuation`
- `Home key source material -> Tasks source-context focus`
- `Home source-context recommended action -> Tasks source-context focus`
- `Home key-source prioritization -> Tasks source-context focus`
- `Home recent activity -> Tasks detail follow-up intent`
- `Home recent activity -> Decisions / Runs`
- `Home recent activity` lightweight follow-up actions
- `Home recent activity` blocker created/resolved recovery actions
- `Home recent activity` blocker-linked source-update re-evaluation actions
- `Home resume preview -> Tasks` recovery flow
- `Home resume preview` key-source/current-method explanations, latest-change object entry, recent-change-aware follow-up actions, and lightweight priority-lane labels
- `Home brief` process-template-aware scheduling path
- `Home key signals -> Tasks detail follow-up intent`
- `Home blocked tasks -> Tasks blocker/source-context recovery`
- `Home blocked tasks -> blocker source entry`
- `Home blocked tasks -> resolve blocker and resume waiting when clearly linked`
- `Home blocked tasks -> stale-first blocker ordering and blocker-age cues`
- `Home needs-escalation signal -> task recovery with escalation guidance`
- `Home priority-lane headline/lede copy and lane-aware recommended-action ordering`
- `Home recommended actions` lightweight priority-lane labels
- `Home recent activity` lightweight priority-lane labels
- `Home key signal` lightweight priority-lane labels
- `Brief fallback output` lane-grouped wording
- `Tasks quick decision submission`
- `Tasks quick run submission`
- `Tasks related activity -> Decisions / Runs`
- `Tasks timeline -> Decisions / Runs`
- `Tasks source context create / edit flow`
- `Tasks blocker create / resolve flow`
- `Tasks completion criteria create / satisfy / reopen flow`
- `Tasks completed-transition guidance from completion criteria`
- `Tasks potential completion evidence from approved decisions, runs, and artifacts`
- `Home closeout tasks` for completion-ready and near-completion recovery flows
- `Tasks process context create / apply / remove flow`
- `Tasks resume card visibility, key-source prioritization explanation, method-selection explanation, lifecycle-aware suggested-move derivation, and recovery actions`
- `Tasks resume card` lightweight priority-lane cue
- `Tasks resume card latest-change object entry`
- `Tasks` first-screen recovery boundaries, key-slice snapshot behavior, and prioritized timeline previews
- `Tasks quick decision draft flow`
- `Tasks list` lane-aware ordering and lightweight lane labels
- `Tasks list` lane-aware summary copy
- stale task dependencies now also assert escalation-oriented home rendering instead of ordinary dependency-blocked rendering
- home recent activity now also covers dependency `created / resolved` lifecycle routing and upstream-task entry behavior
- `Tasks action setup` lane-aware quick decision/run defaults
- `Decision draft / Run` backend prompt composition now absorbs task-level lane guidance, and the run/brief/decision process-template selectors now assert the same lane guidance in their selection prompts
- task timeline actions and related-task timeline actions now assert lane-aware follow-up wording in renderer flows
- compact task timeline previews now assert lane-aware event selection in shared working-context tests
- `Decisions` page current-focus and queue navigation
- `Decisions / Runs -> Tasks` follow-up return flows
- `Decisions / Runs` related-task timeline context
- `Decisions / Runs` related-task timeline object entry
- `Decisions / Runs` related-task timeline follow-up actions
- `Decisions / Runs` focus-surface information density and action grouping
- shared timeline summaries across `Tasks / Decisions / Runs`
- `Settings save flow`
- `waiting item` visibility and direct resolution
- `source context` visibility plus create/edit interactions in task detail, explicit key-source marking, and source-focused recovery from Home
- `process context` visibility plus create/bind/remove interactions in task detail
- `Decision cancel -> task signal refresh`
- `Run failed -> task signal refresh`
- `Decision action -> Home brief refresh`
- `Run failed -> Home brief refresh`
- `Task transition -> Home signal refresh`
- `Runs` page current-focus detail inspection
- Timeline readable summaries and compact expansion behavior
- Timeline action shortcuts for failed, waiting, risk, and artifact events
- Timeline object entry shortcuts for decision, run, and run-backed artifact events
- task detail artifact visibility and Home recent-artifact visibility
- task detail current-snapshot/action-desk/activity-feed presentation paths
- lane-aware task transition guidance and recommended transition ordering in task detail
- newly created tasks reopening into clarify-first task detail focus instead of only appearing in the list
- early captured/triaged tasks reshaping the action desk toward clarification-first primary moves
- early captured/triaged tasks using clarify-first resume wording in recovery surfaces instead of generic lifecycle fallback copy
- early captured/triaged tasks surfacing as clarify-first home recent-activity items
- early captured/triaged tasks using clarify-first task-list summary and card copy
- early captured/triaged tasks using clarify-first wording in brief fallback output

These tests focus on high-value control-plane interactions rather than broad page rendering snapshots.

## What Is Not Covered Yet

Still missing or intentionally light:

- renderer coverage for more explicit `Runs` page state changes
- finer Home scheduler-state refresh assertions
- end-to-end packaged-app tests
- richer timeline filtering, grouping, and very long-history rendering behavior

## Current Quality Gates

Every meaningful change should pass:

```bash
npm run test
npm run lint
npm run build
```

Current verification is local-only:

- `npm run test`
- `npm run lint`
- `npm run build`

## Suggested Next Test Targets

Recommended next additions:

1. renderer test for more explicit `Runs` page refresh and repeated trigger behavior
2. IPC coverage for one or two additional task-oriented handlers
3. a small packaged-app or smoke-style end-to-end verification path
4. renderer coverage for richer timeline filtering or long-history behavior

The current goal is not exhaustive coverage. The goal is to protect the product's control-plane semantics and the most expensive-to-break local-first flows.
