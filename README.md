# Taskplane

Taskplane is a local-first desktop workbench for turning signals into long-lived tasks, decisions, runs, and briefs.

This repository currently contains an Electron + React + TypeScript prototype with:

- task creation, structured task signals, detail editing, and state transitions
- decision request creation, actions, and task linkage with task-side follow-up semantics
- run triggering for `draft` and `summarize`, with task linkage, failure signals, task restoration after runs settle, and dynamic process-template selection before execution
- local brief snapshot generation with recommended actions, recent artifact context, recent lifecycle activity, and intent-aware navigation plus lightweight follow-up actions for task follow-up and object-review flows
- source-context-aware home brief aggregation, including explicit key-source prioritization, key source-material surfacing, source-focused task recovery flows, and lightweight source-driven recommended actions
- task resume cards that compress current state, latest change, key source, current method, and next suggested move into a working-context recovery view, surface why the current key source is prioritized, explain why the current method was most recently selected, and offer lightweight actions to open the key source, inspect the current method, or adopt the suggested next step
- task resume cards now also expose direct entry from the latest-change slot into the most relevant related `Decision / Run / Source` context when that recent lifecycle change points to one
- home resume previews that surface a lightweight working-context recovery slice for recent tasks, now carry short explanations for key-source and current-method hints, and derive context-aware follow-up actions for waiting, risk, source, or next-step recovery
- task-scoped timeline events with readable summaries, subtle event tones, lightweight action shortcuts, and direct `Decision / Run` object entry from key task events
- waiting item lifecycle tracking with direct resolution and task/detail/home visibility
- text artifacts generated from successful runs, surfaced in task detail, timeline actions, home brief, and recommended-action semantics
- source context items for task-linked external materials, with task-detail create/edit/archive flows, explicit key-source marking, home-brief surfacing, source-focused task recovery entrypoints, and lifecycle timeline events
- process context templates for task-linked working methods, with reusable template creation, task binding, and lifecycle timeline events
- run-time process-template selector that can decide whether to use bound task methods before execution, then record selected/skipped outcomes in task timelines
- decision and run pages organized as object work surfaces with a current focus, action desk, queue, direct return paths into task follow-up work, lightweight related-task timeline context, and timeline-based follow-up actions
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
- home brief organized around recommended actions, recent artifacts, key source materials, recent lifecycle activity, recent brief snapshots, and key signals, with direct intent-aware entry into task follow-up work across artifacts, prioritized key sources, lifecycle activity, and task signals, plus direct `Decision / Run` object entry, source-driven recovery suggestions, and lightweight follow-up actions from recent activity
- home surface now also includes lightweight resume previews for recent tasks, so users can scan current state, latest change, key source/method hints, and jump back into task recovery with a prefilled next step while also triggering context-aware follow-up actions for waiting, risk, source, or next-step recovery
- task detail organized into a current snapshot, action desk, and activity feed
- task detail acting as a task work surface, with a derived task resume card and lightweight resume actions, quick actions, active waiting items, recent artifacts, key source materials, editable source context materials with explicit key-source marking, process context templates, related decisions/runs, and a task-lifecycle timeline with lightweight suggested actions plus direct entry into related `Decision / Run` objects from key lifecycle events
- task detail acting as a task work surface, with a derived task resume card, direct latest-change context entry, lightweight resume actions, quick actions, active waiting items, recent artifacts, key source materials, editable source context materials with explicit key-source marking, process context templates, related decisions/runs, and a task-lifecycle timeline with lightweight suggested actions plus direct entry into related `Decision / Run` objects from key lifecycle events
- decision and run pages acting as object work surfaces, with queue navigation, focused detail/action areas, direct return-to-task follow-up entrypoints, lightweight related-task timeline explanations, and timeline-based follow-up actions
- task-side objects now established: active `waiting items`, text `artifacts`, editable `source context` materials, and reusable `process context` templates
- decision and run actions now write back clearer task semantics, including follow-up next steps, waiting reasons, and lifecycle timeline events
- run execution now evaluates bound process templates with a Claude-skills-style selector instead of blindly injecting every template into every run
- brief generation now also evaluates active-task process templates with a separate selector, using them as optional summarization perspectives rather than fixed execution steps
- decision creation now supports AI-assisted draft composition, with a selector deciding whether attached process templates should shape the request before the user confirms creation
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
