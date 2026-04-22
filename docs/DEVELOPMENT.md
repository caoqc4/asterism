# Development

## Overview

The app is split into three layers:

- `src/main`
  This is the Electron main process. It owns SQLite access, scheduler jobs, AI execution, config loading, and IPC handlers.
- `src/renderer`
  This is the React UI. It renders pages and calls main-process capabilities through the preload bridge.
- `src/shared`
  This contains shared contracts and types.

## Commands

### Install

```bash
npm install
```

### Run in dev mode

```bash
npm run dev
```

### Type-check

```bash
npm run lint
```

### Test

```bash
npm run test
```

### Build

```bash
npm run build
```

## Runtime Boundaries

Renderer rules:

- no direct SQLite access
- no direct AI provider calls
- no direct keychain access

Main-process rules:

- owns DB connections
- owns scheduler lifecycle
- owns AI execution
- owns sensitive config resolution

## Current Main Modules

- `config/`
  Local config file loading and writing.
- `db/`
  SQLite bootstrap, repositories, and repository integration test support.
- `domain/`
  Task, decision, run, and brief services plus task signal linkage, task-side object semantics, deeper decision/run-to-task lifecycle annotations, and process-template selection before runs.
- `executors/`
  AI-backed execution logic.
- `scheduler/`
  Local cron-based jobs and recovery logic.
- `ipc/`
  request handlers and event bus.

## Current Product Surfaces

- `Home`
  Prioritized control surface with recommended actions first, then recent artifacts, recent lifecycle activity, recent brief snapshots, and key signals such as waiting, risk, and missing-next-step tasks. These home surfaces now act as intent-aware entrypoints into task follow-up work, not just passive status cards. Recent lifecycle activity now supports both returning to the related task with a follow-up draft, directly opening the linked `Decision` or `Run` object for closer review, and triggering lightweight follow-up actions for the clearest recent outcomes. Home brief generation now also aggregates active-task process-template candidates so the scheduler can optionally shape summaries through the most relevant attached methods.
- `Tasks`
  Primary task workbench organized into a current snapshot, an action desk, and an activity feed. It includes structured task signals, active waiting items, recent artifacts, editable source-context materials, reusable process-context templates, quick decision/run actions, related activity, and a task-lifecycle timeline that can surface lightweight follow-up actions. Source context currently serves as the task-side materials layer for external references and notes, with create/edit/archive flows directly in task detail. Process context now serves as the task-side methods layer, with reusable template creation, task-level binding/removal, in-detail editing/archive flows, and the first live execution linkages: `Run` evaluates bound process templates with a selector before deciding whether any template content should be injected into the run prompt, while `Brief` uses a parallel selector over active-task templates as optional summarization lenses rather than fixed execution steps. The related-activity area now also acts as an entrypoint into the linked `Decision` and `Run` objects themselves, and key task timeline events can now open the related `Decision` or `Run` object directly in addition to offering task follow-up actions.
- `Decisions`
  Decision work surface with a current focus, an action desk, and a decision queue. The current-focus area can now route directly back into the related task with follow-up guidance shaped by the decision status, and it now includes a lightweight related-task timeline slice to explain the most relevant recent task changes around that decision. The most important decision lifecycle events in that slice can now trigger task follow-up actions directly.
- `Runs`
  Run work surface with a current focus, an action desk, and a run queue. The current-focus area can now route directly back into the related task with follow-up guidance shaped by the run result, and it now includes a lightweight related-task timeline slice to explain the most relevant recent task changes around that run. The most important run lifecycle events in that slice can now trigger task follow-up actions directly.
- `Settings`
  Provider, model, API key, and scheduler configuration.

## Typical Development Flow

1. Add or update shared contracts in `src/shared`.
2. Implement main-process services and repositories.
3. Expose capability through preload and IPC.
4. Wire the renderer page to the new contract.
5. Run `npm run lint`, `npm run test`, and `npm run build`.

## Test Coverage Today

- Service-level tests cover config, task, decision, run, scheduler, and home brief logic, including deeper decision/run-to-task lifecycle annotations plus process-template selection behavior for both runs and briefs.
- SQLite integration tests currently cover `TaskRepository`, `RunRepository`, `DecisionRepository`, `BriefSnapshotRepository`, `WaitingItemRepository`, `ArtifactRepository`, `SourceContextRepository`, `ProcessTemplateRepository`, and `TaskProcessBindingRepository`.
- IPC handler tests cover critical event-emitting channels such as settings save, decision action, and run trigger.
- Renderer interaction tests cover the main control-plane flows from Home, Tasks, Decisions, Runs, Settings, timeline actions, waiting item flows, artifact flows, source-context flows, process-context flows, home intent-navigation flows, recent-activity follow-up entry flows, recent-activity object entry flows, recent-activity follow-up actions, task related-activity navigation, task timeline object entry flows, decision/run return-to-task flows, related-task timeline slices on object pages, timeline-driven follow-up actions on object pages, and failed Run refresh paths.
- GitHub Actions runs `npm run test`, `npm run lint`, and `npm run build` on every push to `main` and on pull requests.

For the current coverage map and recommended next targets, see [TESTING.md](TESTING.md).

## Native Dependencies

This project uses native modules such as:

- `better-sqlite3`
- `keytar`

If installation fails on a new machine, make sure standard native build tooling for your platform is available.
