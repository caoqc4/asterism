# asterism

English | [简体中文](README.zh-CN.md)

**Local-first AI workbench to record decisions, execute tasks, and improve your work system.**<br>
**记录决策，推进执行，让你的事业系统持续升级。**

asterism is a local-first AI desktop workbench for recording decisions,
executing tasks, and improving your work system over time. It keeps the why,
what, evidence, and follow-up of serious work attached to the work itself.

Instead of leaving important context in one-off chats, asterism gives decisions,
tasks, runs, reviews, source context, and artifacts a local control layer with
explicit gates for higher-risk agent actions.

## Source-only Alpha

asterism is currently distributed as source code only. No official
signed/notarized binaries or auto-update channel are provided yet.

To try it, clone the repository and run:

```bash
npm install
npm run rebuild:electron
npm run dev
```

For a fresh public-alpha checkout, the shortest path is:

1. install dependencies with `npm install` or `npm ci`;
2. rebuild native modules for Electron with `npm run rebuild:electron`;
3. start the desktop shell with `npm run dev`.

If you later run Node/Vitest verification in the same checkout, switch native
modules back with `npm run rebuild:node` first.

To create a local unpacked macOS app for your own machine:

```bash
npm run dist:mac:dir
open release/mac-arm64/Asterism.app
```

The local app is unsigned/not notarized and may trigger macOS warnings.

## What it helps you do

- Record decisions, context, blockers, and acceptance criteria while the work is
  still fresh.
- Execute tasks with gated agent assistance instead of uncontrolled automation.
- Keep runs, evidence, reviews, and artifacts attached to the work they affect.
- Improve your operating system over repeated record, execute, and review
  cycles.

## How it works

**Loop:** record decisions and context -> execute tasks with gated agents ->
review evidence and outcomes -> improve the work system.

## Architecture at a glance

| Layer | Role |
| --- | --- |
| React renderer | Presents Today, Business, Chat, Decisions, and review surfaces without direct data or secret access. |
| Typed preload IPC | Keeps renderer-to-main calls explicit and validated. |
| Electron main services | Own domain services, scheduler jobs, run orchestration, and writeback gates. |
| Local storage | SQLite stores task/business records; OS keychain stores sensitive provider config. |
| Agent/workspace gates | Provider calls and workspace-changing flows stay opt-in and reviewable. |

## Current Status

asterism is an alpha-stage Electron + React + TypeScript application. It is
usable for local development and experimentation, but it is not yet a polished
production release or a stable end-user distribution.

The repository may contain product planning material and internal architecture
notes while the public surface is being prepared. See
[Open source strategy](docs/OPEN_SOURCE_STRATEGY.md) for the current release
posture.

## Why asterism

AI-assisted work often gets split across chats, local files, issue trackers,
notes, and terminal logs. That makes it hard to recover why something changed,
what evidence was used, which decision is still pending, or what the next useful
action should be.

asterism treats the task as the durable control layer. Agent runs, human
decisions, source context, artifacts, and verification results are attached back
to the work they affect, with explicit gates for higher-risk actions.

## Features

- Structured task records with state, next steps, blockers, dependencies,
  completion criteria, source context, and artifacts.
- A task-native Home surface for recovering work by urgency, blockers,
  decisions, recent activity, and closeout readiness.
- Decision drafts and approvals that stay linked to the relevant task.
- Agent run records that keep evidence, failures, outputs, and verification
  near the task instead of leaving them in an ephemeral transcript.
- Local SQLite storage for product data, with renderer access routed through
  typed IPC boundaries.
- OS keychain storage for provider credentials and other sensitive local config.
- Explicit local controls for higher-risk agent and workspace-mutating flows.

## Local-first and Safety Posture

The default posture is local-first and explicit-opt-in:

- no direct renderer access to SQLite or secrets;
- no provider calls unless a provider is configured and a user action requests
  them;
- no Docker-backed or workspace-mutating flows unless the matching feature gate
  and user confirmation are present;
- no signing, notarization, upload, or Apple network action during normal local
  verification.

`package.json` intentionally keeps `"private": true` to prevent accidental npm
publishing. That npm safety flag does not define whether the GitHub repository
can be public.

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
npm run rebuild:electron
npm run dev
```

The dev command starts the Vite renderer server, the Electron main-process
TypeScript watcher, and the Electron desktop shell.
If you later run Node/Vitest commands in the same checkout, switch native modules
back with `npm run rebuild:node`.

After first launch, local records, Business, and Tasks can be used without an
AI runtime. Agent execution requires either a logged-in Codex CLI / Claude Code
installation or an optional Provider/API configuration from the AI Runtime page.

## Common Commands

```bash
npm run lint
npm run test
npm run build
npm run verify:alpha
npm run verify
```

`npm run verify:alpha` is the source-only alpha quick check for public
contributors. It runs production dependency audit, type-checking, the public
product audit test, product-progress audit, production build, and whitespace
diff checks. Run `npm run rebuild:node` before Node/Vitest commands if you just
rebuilt native modules for Electron.

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
- [Open source strategy](docs/OPEN_SOURCE_STRATEGY.md)

## Not Yet Ready

- Public binary releases, signing, notarization, and update channels.
- A stable plugin or extension API.
- Hosted sync, team collaboration, or enterprise connector surfaces.
- A finalized public support and security contact model.
- A full public-readiness pass over all historical planning notes.

## License

asterism is released under the [MIT License](LICENSE).

## Contributing and Security

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
