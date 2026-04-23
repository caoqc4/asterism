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
  Task, decision, run, and brief services plus task-signal linkage, task-side objects, blocker and dependency semantics, completion-criteria guidance, priority-lane classification, and process-template selection before runs/briefs/decision drafts.
- `executors/`
  AI-backed execution logic.
- `scheduler/`
  Local cron-based jobs and recovery logic.
- `ipc/`
  Request handlers and event bus.

## Current Product Surfaces

- `Home`
  Prioritized control surface with recommended actions first, then recent artifacts, key source materials, recent lifecycle activity, recent brief snapshots, key signals, and lightweight resume previews. Home now acts as a real control surface: it routes users back into task recovery with intent-aware drafts, opens related `Decision / Run` objects directly, distinguishes external blockers from task dependencies, surfaces stale blockers and stale dependency chains as escalation signals, and highlights dependency re-evaluation when an upstream task completes or clears a key blocker. The same hidden `Priority Lanes` backbone now drives the home headline/lede, recommended actions, recent activity, key signals, resume previews, and written briefs so escalation, unblock/decide, continue/review, clarify, and steady work all read with one shared language.
- `Tasks`
  Recovery-first task work surface with a narrowed current snapshot, a dedicated completion-criteria stage, a focused action desk, an explanatory activity feed, and full context management. Completion criteria now act as task-side exit-condition objects rather than process checklists: users can create, edit, satisfy, and reopen them directly in task detail, the resume card only carries a lightweight progress slice, and the state-transition area now gives explicit completion guidance before `completed` transitions without turning criteria into a hard gate. The same work surface also carries blocker context, dependency context, lane-aware list ordering, lane-aware list summaries, and clarify-first behavior for newly captured or triaged tasks. Action setup, prompt defaults, process-template selectors, timeline follow-ups, and transition suggestions all absorb `Priority Lanes` guidance so clarify, unblock, continue, and escalation work share one tone across UI and AI generation.
- `Decisions`
  Decision focus surface with a current focus, an action desk, and a decision queue. The current-focus area behaves like a local judgment surface instead of a second task page: it keeps a narrow decision snapshot, separates “return to task” flow from formal approve/defer/cancel moves, includes a lightweight related-task timeline slice, and supports AI-assisted decision drafting before the user confirms creation.
- `Runs`
  Run focus surface with a current focus, an action desk, and a run queue. The current-focus area behaves like a result-inspection surface instead of a second task page: it keeps a narrow run snapshot, separates result inspection from task recovery, and uses a lightweight related-task timeline slice to explain how this run changed the task.
- `Settings`
  Provider, model, API key, and scheduler configuration.

## Typical Development Flow

1. Add or update shared contracts in `src/shared`.
2. Implement main-process services and repositories.
3. Expose capability through preload and IPC.
4. Wire the renderer page to the new contract.
5. Run `npm run lint`, `npm run test`, and `npm run build`.

## Test Coverage Today

- Service-level tests cover config, task, decision, run, scheduler, and home brief logic, including completion-criteria lifecycle handling, deeper decision/run-to-task lifecycle annotations, task-resume derivation, cross-task priority-lane classification for home/brief semantics, blocker/dependency recovery semantics, and process-template selection behavior for runs, briefs, and decision drafts.
- SQLite integration tests currently cover `TaskRepository`, `RunRepository`, `DecisionRepository`, `BriefSnapshotRepository`, `WaitingItemRepository`, `ArtifactRepository`, `SourceContextRepository`, `BlockerRepository`, `TaskDependencyRepository`, `CompletionCriteriaRepository`, `ProcessTemplateRepository`, and `TaskProcessBindingRepository`.
- IPC handler tests cover critical event-emitting channels such as settings save, completion-criteria writes, decision action, and run trigger.
- Renderer interaction tests cover the main control-plane flows from Home, Tasks, Decisions, Runs, Settings, timeline actions, waiting-item flows, blocker flows, dependency flows, completion-criteria flows, source-context flows, process-context flows, task-resume visibility and recovery actions, home resume-preview recovery flows, lane-aware list ordering, lane-aware summaries, and failed-run refresh paths.
- Local development currently relies on running `npm run test`, `npm run lint`, and `npm run build` before pushing changes.

For the current coverage map and recommended next targets, see [TESTING.md](TESTING.md).

## Native Dependencies

This project uses native modules such as:

- `better-sqlite3`
- `keytar`

If installation fails on a new machine, make sure standard native build tooling for your platform is available.
