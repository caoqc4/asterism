# Testing Map

## Overview

Taskplane currently uses a layered testing strategy:

- service-level unit tests for domain and config logic
- SQLite-backed integration tests for repository behavior
- renderer `jsdom` interaction tests for key control-plane flows
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

These tests verify real SQLite behavior rather than mocked repository calls.

### Renderer interaction tests

Covered today:

- `Home recommended action -> Tasks detail`
- `Tasks quick decision submission`
- `Tasks quick run submission`
- `Decision cancel -> task signal refresh`
- `Run failed -> task signal refresh`
- `Decision action -> Home brief refresh`
- `Run failed -> Home brief refresh`

These tests focus on high-value control-plane interactions rather than broad page rendering snapshots.

## What Is Not Covered Yet

Still missing or intentionally light:

- renderer coverage for `Settings` interactions
- renderer coverage for `Runs` page detail inspection
- renderer coverage for explicit task state transitions from the UI
- repository integration coverage for `brief snapshots`
- IPC handler-focused tests
- preload bridge contract tests
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

1. `BriefSnapshotRepository` integration test
2. renderer test for task state transition affecting Home signals
3. renderer test for Settings save and scheduler toggle flow
4. a small IPC-focused test slice for critical handlers

The current goal is not exhaustive coverage. The goal is to protect the product's control-plane semantics and the most expensive-to-break local-first flows.
