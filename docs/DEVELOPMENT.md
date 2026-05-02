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

Use Node `20.19+` or `22.12+` with npm `10+`. If you use `nvm`, run `nvm use` from the repo root. The repo enforces this range during npm installs.

```bash
npm install
```

### Run in dev mode

```bash
npm run dev
```

If native modules were last installed for a different Node/Electron ABI, rebuild them before starting Electron:

```bash
npm run rebuild:electron
```

Switch back to the local Node ABI before running the Node/Vitest verification suite after an Electron rebuild:

```bash
npm run rebuild:node
```

The dev Electron process clears `ELECTRON_RUN_AS_NODE` before launch so shells that export it for tooling do not accidentally start the app in Node mode.
It also builds the Electron main/preload outputs before starting the watchers so Electron never boots stale `dist-electron` files from a previous run.

For manual alpha checks that should not touch the default local app data, point both SQLite and config storage at a temporary directory:

```bash
TASKPLANE_USER_DATA_DIR=/tmp/taskplane-alpha npm run dev
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

### Build smoke check

```bash
npm run smoke:build
```

Use this when package/build entrypoints change. It runs the production build and checks that the packaged renderer, Electron main/preload entrypoints, and electron-builder file mapping still line up.

### macOS package smoke check

```bash
npm run smoke:package:mac
npm run smoke:runtime:mac
npm run smoke:home-recovery:mac
npm run smoke:code-agent-ui:mac
npm run smoke:run-decision-recovery:mac
npm run accept:packaged-recovery:mac
npm run smoke:release:mac
npm run release:mac:preflight
npm run accept:release:mac-preflight
```

Run this after `npm run dist:mac:dir`. It checks the unpacked app bundle,
`Info.plist`, native module unpacking, ASAR integrity metadata, required ASAR
entries, absence of compiled test files, executable bit, and local code
signature. The runtime smoke check launches the packaged executable with
isolated user data and confirms startup creates `config.json` and
`taskplane.db`, then verifies core SQLite tables were initialized; it also
clears `ELECTRON_RUN_AS_NODE` so shell tooling environment does not accidentally
force the packaged app into Node mode. Use `npm run smoke:release:mac` when you
want to build the unpacked macOS app and run package, runtime, and packaged
Timeline UI smoke checks in one command. Use `npm run smoke:home-recovery:mac`
as a targeted packaged UI check for Home key-source and resume-preview recovery.
Use `npm run smoke:code-agent-ui:mac` as a targeted packaged UI check for
visible Code Agent preflight boundaries without probing Docker or calling a
provider. Use
`npm run smoke:run-decision-recovery:mac` as a targeted packaged recovery check
for terminal agent-session evidence and checkpoint Decision-to-Run routing. Use
`npm run accept:packaged-recovery:mac` to run both targeted packaged recovery
smokes against an existing packaged app without expanding the release gate. Use
`npm run release:mac:preflight` before a dedicated signed/notarized release pass;
it only checks local prerequisites and does not sign, notarize, upload, or call
Apple services. Use `npm run accept:release:mac-preflight` when you want the
same read-only preflight plus regression coverage for both Apple ID and App
Store Connect API key notarization env groups without printing secret values.

### Standard verification

```bash
npm run verify
```

This runs tests, type-checking, and the production build in sequence.

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
  Prioritized control surface with recommended actions first, then recent artifacts, key source materials, recent lifecycle activity, recent brief snapshots, key signals, and lightweight resume previews. Home now acts as a real control surface: it routes users back into task recovery with intent-aware drafts, opens related `Decision / Run` objects directly, distinguishes external blockers from task dependencies, surfaces stale blockers and stale dependency chains as escalation signals, highlights dependency re-evaluation when an upstream task completes or clears a key blocker, and now also surfaces closeout tasks that already satisfy all completion criteria or only lack the final criterion. The same hidden `Priority Lanes` backbone now drives the home headline/lede, recommended actions, recent activity, key signals, resume previews, and written briefs so escalation, unblock/decide, continue/review, clarify, and steady work all read with one shared language; closeout-ready work is still grouped under `continue_or_review`, but now reads with an explicit `收尾判断` sub-tone on recovery surfaces instead of blending into generic continue/review copy, and inside that lane completion-ready work now sorts ahead of near-completion work. The closeout section itself now also distinguishes tasks that are already `可收尾` from those that still need to `核对最后证据`, so “completion-ready” and “near-complete” no longer collapse into the same home signal; near-complete cards now expose a direct `查看收尾证据` path and completion-ready cards now expose a direct `查看最终收尾依据` path into the approved decision or completed run most likely tied to the final criterion.
- `Tasks`
  Recovery-first task work surface with a narrowed current snapshot, a dedicated completion-criteria stage, a focused action desk, an explanatory activity feed, and full context management. Completion criteria now act as task-side exit-condition objects rather than process checklists: users can create, edit, satisfy, and reopen them directly in task detail, the resume card only carries a lightweight progress slice plus the already satisfied criteria highlights and the next unfinished criterion, the stage surfaces recent approved decisions, run results, and artifacts as possible completion evidence, those evidence cards can now jump directly to the likely matching unfinished criteria and also open the underlying `Decision / Run` object, closeout-ready tasks now also interpret those same decisions/runs/artifacts as explicit `收尾证据` in resume wording and next-step guidance, and the state-transition area now gives explicit completion guidance before `completed` transitions without turning criteria into a hard gate. The same work surface also carries blocker context, dependency context, lane-aware list ordering, lane-aware list summaries, and clarify-first behavior for newly captured or triaged tasks. Action setup, prompt defaults, process-template selectors, timeline follow-ups, and transition suggestions all absorb `Priority Lanes` guidance so clarify, unblock, continue, and escalation work share one tone across UI and AI generation. Timeline display semantics now live in shared helpers for event priority, preview selection, group headings, event labels, readable summaries, follow-up actions, and object entry gating; page-local timeline code should stay focused on layout and styling.
- `Decisions`
  Decision focus surface with a current focus, an action desk, and a decision queue. The current-focus area behaves like a local judgment surface instead of a second task page: it keeps a narrow decision snapshot, separates “return to task” flow from formal approve/defer/cancel moves, includes a lightweight related-task timeline slice that uses the same shared explanatory wording as task detail timelines, and supports AI-assisted decision drafting before the user confirms creation.
- `Runs`
  Run focus surface with a current focus, an action desk, and a run queue. The current-focus area behaves like a result-inspection surface instead of a second task page: it keeps a narrow run snapshot, separates result inspection from task recovery, and uses a lightweight related-task timeline slice with shared explanatory wording to explain how this run changed the task.
- `Settings`
  Provider, model, API key, and scheduler configuration.

## Typical Development Flow

1. Add or update shared contracts in `src/shared`.
2. Implement main-process services and repositories.
3. Expose capability through preload and IPC.
4. Wire the renderer page to the new contract.
5. Run `npm run verify`.
6. Run `npm run smoke:build` when package/build entrypoints change.

## Test Coverage Today

- Service-level tests cover config, task, decision, run, scheduler, and home brief logic, including completion-criteria lifecycle handling, deeper decision/run-to-task lifecycle annotations, task-resume derivation, cross-task priority-lane classification for home/brief semantics, blocker/dependency recovery semantics, and process-template selection behavior for runs, briefs, and decision drafts.
- SQLite integration tests currently cover `TaskRepository`, `RunRepository`, `DecisionRepository`, `BriefSnapshotRepository`, `WaitingItemRepository`, `ArtifactRepository`, `SourceContextRepository`, `BlockerRepository`, `TaskDependencyRepository`, `CompletionCriteriaRepository`, `ProcessTemplateRepository`, and `TaskProcessBindingRepository`.
- IPC handler tests cover critical event-emitting channels such as settings save, completion-criteria writes, decision action, and run trigger.
- Renderer interaction tests cover the main control-plane flows from Home, Tasks, Decisions, Runs, Settings, timeline actions, waiting-item flows, blocker flows, dependency flows, completion-criteria flows, source-context flows, process-context flows, task-resume visibility and recovery actions, home resume-preview recovery flows, lane-aware list ordering, lane-aware summaries, and failed-run refresh paths.
- Local development currently relies on running `npm run verify` before pushing changes, with `npm run smoke:build` added when package/build entrypoints change, `npm run smoke:release:mac` for the combined unsigned macOS package/runtime/Timeline UI path, and `npm run accept:release:mac-preflight` before signed/notarized release readiness checks.
- If GitHub Actions is unavailable or disabled because of monthly quota, treat local `npm run verify` as the required gate for ordinary code changes, add `npm run smoke:build` for package/build entrypoint changes, `npm run smoke:release:mac` for the unsigned macOS package/runtime/Timeline UI path, and `npm run accept:release:mac-preflight` for signed/notarized release preflight coverage. Do not manually dispatch or watch remote workflow runs during that period.

For the current coverage map and recommended next targets, see [TESTING.md](TESTING.md).

## Native Dependencies

This project uses native modules such as:

- `better-sqlite3`
- `keytar`

If installation fails on a new machine, make sure standard native build tooling for your platform is available.

Run `npm run rebuild:electron` after changing Electron, Node, or native dependency versions when validating the desktop app. Run `npm run rebuild:node` before `npm run verify` if those native modules were last rebuilt for Electron.

The supported local Node versions are `20.19+` or `22.12+`, matching the CI workflow and current Vite/Vitest engine requirements.

Dependency updates are managed through Dependabot PRs for npm packages and GitHub Actions. Prefer reviewing those PRs with `npm run verify` over applying broad `npm audit fix --force` upgrades directly.
