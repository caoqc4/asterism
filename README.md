# Taskplane

Taskplane is a local-first desktop workbench for long-lived task work. It keeps
tasks, decisions, runs, source context, artifacts, and AI memory anchored to the
task instead of trapping important work inside a chat window.

The project is an Electron + React + TypeScript prototype.

## What It Does

- Create and manage structured tasks with state, next steps, blockers,
  dependencies, completion criteria, source context, and artifacts.
- Use a task-native Home surface to recover work by urgency, blockers,
  decisions, recent activity, and closeout readiness.
- Draft and act on Decisions that are linked back to tasks.
- Trigger Runs for AI-assisted work while keeping evidence, failures, and
  outputs attached to the task.
- Store non-sensitive config locally and secrets in the OS keychain.
- Keep higher-risk agent capabilities gated behind explicit local controls.

## Current Status

Taskplane is a working prototype. It is suitable for local development and
experimentation, not yet a polished production release.

The default safety posture is local-first and explicit-opt-in:

- no direct renderer access to SQLite or secrets;
- no provider calls unless a provider is configured and a user action requests
  them;
- no Docker-backed or workspace-mutating flows unless the matching feature gate
  and user confirmation are present;
- no signing, notarization, upload, or Apple network action during normal local
  verification.

## Stack

- Electron
- React + Vite + TypeScript
- SQLite + Drizzle ORM
- `node-cron`
- Vercel AI SDK
- OS keychain via `keytar`

## Project Shape

```text
src/
  main/       Electron main process: DB, domain services, scheduler, executors, IPC
  renderer/   React UI
  shared/     shared contracts and types
docs/         public developer documentation
scripts/      local verification, smoke, and release helper scripts
```

## Getting Started

Use Node `20.19+` or `22.12+` with npm `10+`.

```bash
npm install
npm run dev
```

The dev command starts the Vite renderer server, the Electron main-process
TypeScript watcher, and the Electron desktop shell.

## Common Commands

```bash
npm run lint
npm run test
npm run build
npm run verify
```

`npm run verify` runs tests, type-checking, and the production build.

For package-related checks:

```bash
npm run smoke:build
npm run dist:mac:dir
npm run smoke:release:mac
npm run accept:packaged-recovery:mac
npm run accept:release:mac-preflight
```

The macOS release commands currently validate local unsigned/ad-hoc packaging.
Signed and notarized releases require separate credentials and are not part of
the default local verification path.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Safety model](docs/SAFETY_MODEL.md)
- [Configuration](docs/CONFIGURATION.md)
- [Development](docs/DEVELOPMENT.md)
- [Testing](docs/TESTING.md)
- [Releases](docs/RELEASES.md)

## Contributing and Security

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [License](LICENSE)
