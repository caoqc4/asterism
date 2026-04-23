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
  Task, decision, run, and brief services plus task signal linkage, task-side object semantics, deeper decision/run-to-task lifecycle annotations, and process-template selection before runs.
- `executors/`
  AI-backed execution logic.
- `scheduler/`
  Local cron-based jobs and recovery logic.
- `ipc/`
  request handlers and event bus.

## Current Product Surfaces

- `Home`
  Prioritized control surface with recommended actions first, then recent artifacts, key source materials, recent lifecycle activity, recent brief snapshots, key signals such as waiting, risk, and missing-next-step tasks, plus lightweight resume previews for recent tasks. These home surfaces now act as intent-aware entrypoints into task follow-up work, not just passive status cards. Recent lifecycle activity now supports both returning to the related task with a follow-up draft, directly opening the linked `Decision` or `Run` object for closer review, and triggering lightweight follow-up actions for the clearest recent outcomes. Key source materials now surface task-linked external references directly on the home brief, prioritize user-marked key sources ahead of ordinary materials, can return the user to the related task with the matching source-context editor already focused, and now also influence recommended actions when a source is the clearest next handle for task recovery or next-step definition. Home resume previews compress the same working-context logic as the full task resume card into a smaller recovery slice, now carry short explanations for why a key source or current method matters, expose direct latest-change entry into related `Decision / Run / Source` context when a recent change points to a concrete object, derive their suggested next move from the clearest recent lifecycle change before falling back to static waiting/risk/source cues, then route the user back into task follow-up with a prefilled next step while also deriving a context-aware action that can prioritize the most recent decision/run change before falling back to waiting, risk, key-source focus, or plain next-step recovery. Home brief generation now also aggregates active-task process-template candidates so the scheduler can optionally shape summaries through the most relevant attached methods, and written brief output now includes task resume previews so the same recent-change-first recovery framing shows up in textual summaries as well.
- `Tasks`
  Primary task workbench organized into a current snapshot, an action desk, and an activity feed. It includes a derived `Task Resume Card` that compresses working-context recovery into one place, now surfaces why the current key source is prioritized, explains why the current method template was most recently selected, derives the suggested next move from the clearest recent lifecycle change before falling back to static waiting/risk/source/artifact cues, and offers lightweight recovery actions to open the key source, inspect the current method template, prefill the suggested next step, and jump directly into the most relevant related `Decision / Run / Source` context from the `Latest Change` slot when the most recent lifecycle change points to a concrete object. The rest of the surface still includes structured task signals, active waiting items, recent artifacts, key source materials, editable source-context materials, reusable process-context templates, quick decision/run actions, related activity, and a task-lifecycle timeline that can surface lightweight follow-up actions. Source context currently serves as the task-side materials layer for external references and notes, with create/edit/archive flows directly in task detail, explicit key-source marking for user-controlled prioritization, and source-focused recovery from the home brief. Process context now serves as the task-side methods layer, with reusable template creation, task-level binding/removal, in-detail editing/archive flows, and the first live execution linkages: `Run` evaluates bound process templates with a selector before deciding whether any template content should be injected into the run prompt, `Brief` uses a parallel selector over active-task templates as optional summarization lenses rather than fixed execution steps, and `Decision draft` now lets the workbench draft a request before creation while evaluating whether attached templates should shape the decision wording.
- `Decisions`
  Decision work surface with a current focus, an action desk, and a decision queue. The current-focus area can now route directly back into the related task with follow-up guidance shaped by the decision status, and it now includes a lightweight related-task timeline slice to explain the most relevant recent task changes around that decision. The most important decision lifecycle events in that slice can now trigger task follow-up actions directly. The action desk now also supports AI-assisted decision drafting: users can provide optional context, let the workbench draft a title and rationale, then confirm the actual Decision creation themselves.
- `Runs`
  Run work surface with a current focus, an action desk, and a run queue. The current-focus area can now route directly back into the related task with follow-up guidance shaped by the run result, and it now includes a lightweight related-task timeline slice to explain the most relevant recent task changes around that run. The most important run lifecycle events in that slice can now trigger task follow-up actions directly.
- `Settings`
  Provider, model, API key, and scheduler configuration.

## Typical Development Flow

1. Add or update shared contracts in `src/shared`.
2. Implement main-process services and repositories.
3. Expose capability through preload and IPC.
4. Wire the renderer page to the new contract.
5. Run `npm run lint`, `npm run test`, and `npm run build`.

## Test Coverage Today

- Service-level tests cover config, task, decision, run, scheduler, and home brief logic, including deeper decision/run-to-task lifecycle annotations, key-source prioritization, task-resume derivation, plus process-template selection behavior for runs, briefs, and decision drafts.
- SQLite integration tests currently cover `TaskRepository`, `RunRepository`, `DecisionRepository`, `BriefSnapshotRepository`, `WaitingItemRepository`, `ArtifactRepository`, `SourceContextRepository`, `ProcessTemplateRepository`, and `TaskProcessBindingRepository`.
- IPC handler tests cover critical event-emitting channels such as settings save, decision action, and run trigger.
- Renderer interaction tests cover the main control-plane flows from Home, Tasks, Decisions, Runs, Settings, timeline actions, waiting item flows, artifact flows, source-context flows, process-context flows, task-resume visibility and recovery actions, task-resume latest-change object entry, home resume-preview recovery flows, home resume-preview context actions, home intent-navigation flows, recent source-material recovery flows, recent-activity follow-up entry flows, recent-activity object entry flows, recent-activity follow-up actions, task related-activity navigation, task timeline object entry flows, decision/run return-to-task flows, related-task timeline slices on object pages, timeline-driven follow-up actions on object pages, and failed Run refresh paths.
- GitHub Actions runs `npm run test`, `npm run lint`, and `npm run build` on every push to `main` and on pull requests.

For the current coverage map and recommended next targets, see [TESTING.md](TESTING.md).

## Native Dependencies

This project uses native modules such as:

- `better-sqlite3`
- `keytar`

If installation fails on a new machine, make sure standard native build tooling for your platform is available.
