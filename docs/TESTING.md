# Testing Map

## Overview

Taskplane currently uses a layered testing strategy:

- service-level unit tests for domain and config logic
- SQLite-backed integration tests for repository behavior
- renderer `jsdom` interaction tests for key control-plane flows
- IPC handler tests for event-emitting main-process entrypoints
- GitHub Actions CI for `test + lint + build`

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
- `src/main/ipc/handlers.test.ts`
- `src/renderer/App.test.tsx`

## Coverage Map

### Service tests

Covered today:

- `AppConfigService`
  config defaults, persistence, migration behavior
- `TaskService`
  transitions, invalid transitions, signal updates
- `DecisionService`
  task existence checks and decision-to-task linkage
- `RunService`
  successful execution path, failure path, task linkage
- `HomeBriefService`
  waiting, risk, missing-next-step, recommended actions
- `SchedulerService`
  startup behavior, cron registration, fallback brief generation

These tests protect core business semantics before SQLite or renderer concerns enter the picture.

### Repository integration tests

Covered today:

- `TaskRepository`
  task creation, signal persistence, timeline writes, transitions
- `RunRepository`
  run creation, result persistence, stale run queries
- `DecisionRepository`
  decision creation, action persistence, timeline writes
- `BriefSnapshotRepository`
  source persistence, fallback reasons, recent ordering, and limit behavior

These tests verify real SQLite behavior rather than mocked repository calls.

### IPC handler tests

Covered today:

- `settings:setAiConfig`
  config writes, scheduler start/stop decisions, `settings.changed`
- `decision:act`
  decision action routing plus `decision.changed` and `task.changed`
- `run:trigger`
  run trigger routing plus `run.changed`, `task.changed`, and `brief.changed`

These tests protect the main-process edge where renderer calls become domain actions and event broadcasts.

### Renderer interaction tests

Covered today:

- `Home recommended action -> Tasks detail`
- `Tasks quick decision submission`
- `Tasks quick run submission`
- `Settings save flow`
- `Decision cancel -> task signal refresh`
- `Run failed -> task signal refresh`
- `Decision action -> Home brief refresh`
- `Run failed -> Home brief refresh`
- `Task transition -> Home signal refresh`

These tests focus on high-value control-plane interactions rather than broad page rendering snapshots.

## What Is Not Covered Yet

Still missing or intentionally light:

- renderer coverage for `Runs` page detail inspection
- preload bridge contract tests
- renderer coverage for more explicit `Runs` page state changes
- finer Home scheduler-state refresh assertions
- end-to-end packaged-app tests

## Current Quality Gates

Every meaningful change should pass:

```bash
npm run test
npm run lint
npm run build
```

GitHub Actions runs the same checks on:

- pushes to `main`
- pull requests

## Suggested Next Test Targets

Recommended next additions:

1. renderer test for `Runs` page detail and refresh behavior
2. preload bridge contract tests
3. IPC coverage for one or two additional task-oriented handlers
4. a small packaged-app or smoke-style end-to-end verification path

The current goal is not exhaustive coverage. The goal is to protect the product's control-plane semantics and the most expensive-to-break local-first flows.
