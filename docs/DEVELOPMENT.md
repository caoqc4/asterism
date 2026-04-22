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
  Task, decision, run, and brief services plus task signal linkage.
- `executors/`
  AI-backed execution logic.
- `scheduler/`
  Local cron-based jobs and recovery logic.
- `ipc/`
  request handlers and event bus.

## Current Product Surfaces

- `Home`
  Brief-style overview with waiting, risk, missing-next-step, and recommended actions.
- `Tasks`
  Primary task workbench with structured task signals, quick decision/run actions, related activity, and a task-lifecycle timeline that can surface lightweight follow-up actions.
- `Decisions`
  Decision queue with approve/defer/cancel actions.
- `Runs`
  Run trigger and result inspection.
- `Settings`
  Provider, model, API key, and scheduler configuration.

## Typical Development Flow

1. Add or update shared contracts in `src/shared`.
2. Implement main-process services and repositories.
3. Expose capability through preload and IPC.
4. Wire the renderer page to the new contract.
5. Run `npm run lint`, `npm run test`, and `npm run build`.

## Test Coverage Today

- Service-level tests cover config, task, decision, run, scheduler, and home brief logic.
- SQLite integration tests currently cover `TaskRepository`, `RunRepository`, `DecisionRepository`, and `BriefSnapshotRepository`.
- IPC handler tests cover critical event-emitting channels such as settings save, decision action, and run trigger.
- Renderer interaction tests cover the main control-plane flows from Home, Tasks, Decisions, Settings, Timeline actions, and failed Run refresh paths.
- GitHub Actions runs `npm run test`, `npm run lint`, and `npm run build` on every push to `main` and on pull requests.

For the current coverage map and recommended next targets, see [TESTING.md](TESTING.md).

## Native Dependencies

This project uses native modules such as:

- `better-sqlite3`
- `keytar`

If installation fails on a new machine, make sure standard native build tooling for your platform is available.
