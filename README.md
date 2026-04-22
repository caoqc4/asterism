# Taskplane

Taskplane is a local-first desktop workbench for turning signals into long-lived tasks, decisions, runs, and briefs.

This repository currently contains an Electron + React + TypeScript prototype with:

- task creation, detail editing, and state transitions
- decision request creation and actions
- run triggering for `draft` and `summarize`
- local brief snapshot generation
- local scheduler with config-driven enable/disable
- local configuration via `config.json` plus system keychain for secrets

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

## Contributing and Security

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- License: [LICENSE](LICENSE)

## Project Status

Taskplane is currently a working prototype.

What exists today:

- local desktop workbench architecture
- core task / decision / run / brief flows
- config + keychain setup
- local macOS packaging pipeline
- GitHub Actions CI for `test + lint + build`

What is still in progress:

- deeper workflow semantics and business rules
- test coverage
- final branding and product polish
- signed and notarized releases
