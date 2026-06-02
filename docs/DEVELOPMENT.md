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

## Source-only Alpha Contributor Path

For a fresh public checkout:

```bash
npm install
npm run rebuild:electron
npm run dev
```

`npm ci` is also supported when you want an install that exactly follows
`package-lock.json`.

Use this quick verification path for docs, UI copy, public-alpha onboarding, and
small renderer or shared-contract changes:

```bash
npm run rebuild:node
npm run verify:alpha
```

`verify:alpha` runs production dependency audit, type-checking, the public
product audit test, product-progress audit, production build, and `git diff
--check`. It does not build a packaged app, call providers, require a real Agent
CLI account, write to an external workspace, sign, notarize, upload, or enable
GitHub Actions.

Use the full local gate when changing runtime orchestration, domain services,
IPC contracts, native modules, or broad product behavior:

```bash
npm run rebuild:node
npm run verify
```

The production build may print Vite's large chunk warning. That warning is
expected in the current alpha and should be recorded, not treated as a failed
verification, unless the build exits non-zero.

## Common Commands

```bash
npm run lint
npm run test
npm run build
npm run verify:alpha
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

Run packaged smoke checks only when the change affects Electron packaging,
native ABI behavior, packaged renderer routing, app startup, or macOS runtime
recovery. These checks are macOS-specific and use isolated `userData`
directories; they do not imply an official signed or notarized binary.

Targeted packaged recovery/config checks:

```bash
npm run accept:packaged-recovery:mac
```

Read-only release readiness preflight:

```bash
npm run accept:release:mac-preflight
```

This preflight does not sign, notarize, upload, or contact Apple services.

## Agent CLI Path

Agent execution in the public alpha is CLI-first. Use the AI Runtime page to
connect an already logged-in Codex CLI or Claude Code installation. CLI
authentication stays in the official CLI; asterism only detects readiness and
starts opted-in task-bound runs.

The packaged Agent CLI task smoke is safe by default because it uses a fake
Codex executable and an isolated temporary workspace:

```bash
npm run smoke:agent-cli-task:mac
```

Real local CLI validation is manual and opt-in:

```bash
TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:agent-cli-task-live:mac
```

The default manual command skips without calling the CLI unless the opt-in
environment variable is set. Agent API task execution remains deferred; provider
configuration is optional and does not make task execution ready by itself.

## Common Failures

- Native ABI mismatch after switching between `npm run dev` and Vitest: run
  `npm run rebuild:electron` before the desktop app, and `npm run rebuild:node`
  before Node/Vitest verification.
- macOS unsigned app warning: local `dist:mac:dir` output is unsigned/ad-hoc and
  not notarized. There is no official signed binary or auto-update channel yet.
- Missing Codex CLI / Claude Code login: log in with the official CLI first,
  then re-detect from the AI Runtime page.
- Vite chunk warning during `npm run build`: currently expected for alpha; keep
  it visible in reports, but do not treat it as failure unless the command
  exits non-zero.
- Agent API execution confusion: provider/API config is optional and the full
  task execution path is still deferred.

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
6. Run `npm run verify:alpha` for small public-alpha changes, or `npm run verify`
   for broader runtime/product changes.
7. Add package smoke checks when package/build entrypoints change.
