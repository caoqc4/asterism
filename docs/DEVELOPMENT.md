# Development

## Overview

asterism is split into three layers:

- `src/main`
  Electron main process. Owns SQLite access, scheduler jobs, AI execution,
  config loading, keychain access, and IPC handlers.
- `src/renderer`
  React UI. Renders pages and calls main-process capabilities through the
  preload bridge.
- `src/shared`
  Shared contracts, types, and pure helpers used by both sides.

## Setup

Use Node `20.19+` or `22.12+` with npm `10+`.

```bash
npm install
```

If you use `nvm`, run:

```bash
nvm use
```

## Run Locally

```bash
npm run rebuild:electron
npm run dev
```

The dev command starts:

- Vite renderer dev server;
- Electron main-process TypeScript watcher;
- Electron desktop shell.

The dev launcher clears `ELECTRON_RUN_AS_NODE` before starting Electron so a
shell configured for tooling does not accidentally start the desktop app in
Node mode.

## Native Modules

asterism uses native modules such as `better-sqlite3` and `keytar`.

After a fresh install, or after changing Electron, Node, or native dependency
versions, rebuild for Electron before testing the desktop app:

```bash
npm run rebuild:electron
```

Before running the Node/Vitest suite after an Electron rebuild, switch native
modules back to the local Node ABI:

```bash
npm run rebuild:node
```

## Common Commands

```bash
npm run lint
npm run test
npm run build
npm run verify
```

`npm run verify` runs tests, type-checking, and the production build.

Use `npm run smoke:build` when package/build entrypoints change.

## Package Checks

For local macOS packaging:

```bash
npm run dist:mac:dir
npm run smoke:package:mac
npm run smoke:runtime:mac
npm run smoke:release:mac
```

`npm run smoke:release:mac` builds the unpacked macOS app and runs package,
runtime, and packaged Timeline UI smoke checks.

Targeted packaged recovery/config checks:

```bash
npm run accept:packaged-recovery:mac
```

Read-only release readiness preflight:

```bash
npm run accept:release:mac-preflight
```

This preflight does not sign, notarize, upload, or contact Apple services.

## Runtime Boundaries

Renderer rules:

- no direct SQLite access;
- no direct AI provider calls;
- no direct keychain access;
- no direct filesystem or shell execution.

Main-process rules:

- owns DB connections;
- owns scheduler lifecycle;
- owns AI execution;
- owns sensitive config resolution;
- validates IPC inputs before mutating local state.

## Main Modules

- `config/`
  Local config file loading and writing.
- `db/`
  SQLite bootstrap, schema, repositories, and integration test support.
- `domain/`
  Task, decision, run, brief, context, blocker, dependency, completion, and
  agent-domain services.
- `executors/`
  AI-backed and local text execution logic.
- `scheduler/`
  Local cron-based scheduling and recovery logic.
- `ipc/`
  Main-process request handlers and event bus.

## Development Flow

1. Update shared contracts in `src/shared` when needed.
2. Implement or update main-process services and repositories.
3. Expose the capability through preload and IPC.
4. Wire the renderer page to the contract.
5. Add focused tests for the changed surface.
6. Run `npm run verify`.
7. Add package smoke checks when package/build entrypoints change.
