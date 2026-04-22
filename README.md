# Taskplane

Taskplane is a local-first desktop workbench for turning signals into long-lived tasks, decisions, runs, and briefs.

This repository currently contains an Electron + React + TypeScript prototype with:

- task creation, structured task signals, detail editing, and state transitions
- decision request creation, actions, and task linkage
- run triggering for `draft` and `summarize`, with task linkage and failure signals
- local brief snapshot generation with recommended actions
- task-scoped timeline events with readable summaries, subtle event tones, and lightweight action shortcuts
- waiting item lifecycle tracking with direct resolution and task/detail/home visibility
- text artifacts generated from successful runs, surfaced in task detail, timeline actions, and home brief
- local scheduler with config-driven enable/disable
- local configuration via `config.json` plus system keychain for secrets
- SQLite-backed repository integration tests plus GitHub Actions CI

## Current Stack

- Electron
- React + Vite + TypeScript
- SQLite + Drizzle ORM
- `node-cron`
- Vercel AI SDK
- system keychain via `keytar`

## Project Shape

```text
src/
  main/       # Electron main process: DB, domain services, scheduler, executors, IPC
  renderer/   # React UI
  shared/     # shared contracts and types
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app in development mode

```bash
npm run dev
```

This starts:

- the Vite renderer dev server
- the Electron main-process TypeScript watcher
- the Electron desktop shell

### 3. Build the app

```bash
npm run build
```

### 4. Type-check the project

```bash
npm run lint
```

### 5. Run tests

```bash
npm run test
```

## Release Commands

### Produce a local macOS unpacked app

```bash
npm run dist:mac:dir
```

### Produce macOS release artifacts

```bash
npm run dist:mac
```

See [docs/RELEASES.md](docs/RELEASES.md) for the current release scope.

## Configuration

Taskplane uses a split configuration model:

- non-sensitive config is stored in a local `config.json`
- sensitive credentials such as API keys are stored in the OS keychain

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for details.

## Development Notes

- This repo intentionally keeps product-internal design discussion documents out of the public surface.
- The current prototype favors clear architecture boundaries over polished production UI.
- Renderer does not directly access SQLite or secrets. All business actions go through IPC to the Electron main process.

For local development details, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
For the current testing map, see [docs/TESTING.md](docs/TESTING.md).

## Contributing and Security

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- License: [LICENSE](LICENSE)

## Project Status

Taskplane is currently a working prototype.

What exists today:

- local desktop workbench architecture
- core task / decision / run / brief flows
- structured task signals: `nextStep`, `waitingReason`, `riskLevel`, `riskNote`
- home brief with waiting, risk, missing-next-step, and recommended action surfaces
- task detail with quick actions, related decisions/runs, recent artifacts, and a task-lifecycle timeline with lightweight suggested actions
- object-like task-side models starting to emerge: active `waiting items` and text `artifacts`
- config + keychain setup
- service tests and SQLite repository integration coverage
- IPC handler coverage for critical event-emitting entrypoints
- renderer interaction coverage for key control-plane flows
- local macOS packaging pipeline
- GitHub Actions CI for `test + lint + build`

What is still in progress:

- deeper workflow semantics and richer task-side objects
- broader persistence and UI coverage
- final branding and product polish
- signed and notarized releases
