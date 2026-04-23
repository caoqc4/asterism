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
  Task, decision, run, and brief services plus task signal linkage, task-side object semantics, blocker semantics, deeper decision/run-to-task lifecycle annotations, and process-template selection before runs.
- `executors/`
  AI-backed execution logic.
- `scheduler/`
  Local cron-based jobs and recovery logic.
- `ipc/`
  request handlers and event bus.

## Current Product Surfaces

- `Home`
  Prioritized control surface with recommended actions first, then recent artifacts, key source materials, recent lifecycle activity, recent brief snapshots, key signals such as waiting, blocked, escalation-needed, risk, and missing-next-step tasks, plus lightweight resume previews for recent tasks. These home surfaces now act as intent-aware entrypoints into task follow-up work, not just passive status cards. Recent lifecycle activity now supports both returning to the related task with a follow-up draft, directly opening the linked `Decision` or `Run` object for closer review, triggering lightweight follow-up actions for the clearest recent outcomes, and now also surfacing blocker `created / resolved` events as state-changing recovery signals on the same activity rail. When a source update belongs to the source currently linked from an active blocker, that source update can now surface on the same activity rail as a blocker re-evaluation event instead of reading like generic source progress. Key source materials now surface task-linked external references directly on the home brief, prioritize user-marked key sources ahead of ordinary materials, can return the user to the related task with the matching source-context editor already focused, and now also influence recommended actions when a source is the clearest next handle for task recovery or next-step definition. Active blockers now also feed home recovery semantics, so the home surface can explain why a task is blocked, expose blocked-task key signals, split stale blockers into a stronger `Needs Escalation` signal instead of collapsing them into generic risk, keep fresh blockers and stale blockers in mutually exclusive home groupings so attention is not split across duplicate cards, route the user back into the task with blocker-aware follow-up guidance, expose a direct escalation-handling move for stale blockers, offer a lightweight `查看阻塞来源` entry when the blocker is tied to a source-context item, and now also expose a conservative `标记已解除` action that resolves the blocker first and only restores `waiting_external` back to `planned` when the waiting reason is clearly driven by that same blocker. As blocker age increases, the same home recovery surfaces now shift from plain “follow up” wording to stronger escalation guidance so stale blockers are treated as more urgent than freshly created ones, and the hero headline/lede now also prioritize escalation language before falling back to ordinary blocked/risk/waiting summaries. Home resume previews compress the same working-context logic as the full task resume card into a smaller recovery slice, now carry short explanations for why a key source or current method matters, expose direct latest-change entry into related `Decision / Run / Source` context when a recent change points to a concrete object, derive their suggested next move from the clearest recent lifecycle change before falling back to static waiting/risk/source cues, then route the user back into task follow-up with a prefilled next step while also deriving a context-aware action that can prioritize the most recent decision/run change before falling back to waiting, risk, blocker, key-source focus, or plain next-step recovery. Home brief generation now also aggregates active-task process-template candidates so the scheduler can optionally shape summaries through the most relevant attached methods, and written brief output now includes task resume previews so the same recent-change-first recovery framing shows up in textual summaries as well.
  The home layer now also carries hidden cross-task `Priority Lanes` semantics: the control surface classifies tasks into escalation, unblock/decide, continue/review, clarify, or steady lanes, then reuses that same urgency model to sort recommended actions, choose the hero headline/lede, shape written brief text, and order lightweight resume previews without adding another top-level UI block. Recommended-action cards, recent-activity cards, key-signal group headers, and resume-preview cards now also surface lightweight lane labels so users can see why an item was prioritized without turning the home surface into an explicit lane board, and written brief output now mirrors that same language by grouping fallback summary lines with explicit lane wording instead of treating all actions and activity as one flat list.
- `Tasks`
  Primary task workbench organized into a recovery-first current snapshot, a narrowed action desk, an activity feed, and a separate context-management layer. The first screen now stays focused on resuming and continuing work: the derived `Task Resume Card` compresses working-context recovery into one place, surfaces why the current key source is prioritized, explains why the current method template was most recently selected, includes the current blocker alongside the current waiting item, derives the suggested next move from the clearest recent lifecycle change before falling back to static waiting/risk/blocker/source/artifact cues, and offers lightweight recovery actions to open the key source, inspect the current method template, prefill the suggested next step, and jump directly into the most relevant related `Decision / Run / Source` context from the `Latest Change` slot when the most recent lifecycle change points to a concrete object. When the most recent source update belongs to the source currently linked from the active blocker, the same recovery layer now upgrades that generic source change into a blocker re-evaluation cue instead of treating it as ordinary material progress. The same recovery semantics now flow through a shared working-context assembler so `Tasks`, `Home`, and written briefs stay aligned when recent lifecycle changes, blocker state, source priority, or method-selection reasoning evolve. The current snapshot then stays intentionally sliced: structured task signals, the active waiting item, the current blocker, a single latest artifact, the single highest-priority key source, and the current active method remain visible, while full source-context and process-context management now sit in a lower `Context Studio` layer instead of competing for first-screen attention. That lower studio is now explicitly split into a materials shelf for task-linked sources, a blocker context area for the current constraint, and a methods shelf/library for active and reusable process templates, so materials, blockers, and methods no longer read like one blended “context” bucket. The same split now also drives resume wording: task resume cards and home resume previews describe why a source matters or why a method is active using the same materials-shelf / methods-library language shown in `Context Studio`, and active blockers now also explain why a task is currently stalled in the same recovery layer. Blocker-heavy views now also carry lightweight age cues and stale-first ordering so the control plane can distinguish fresh blockers from older ones that deserve faster escalation. The action desk now front-loads only a small set of primary moves, then pushes full decision/run configuration and state-transition details into a lower setup layer so the middle of the page stays focused on the most valuable next actions instead of turning into a generic toolbox. The activity feed now explicitly prioritizes key and explanatory timeline events above weaker trace entries, so task history remains a recovery aid instead of growing into a flat log wall. The tasks list now also reuses the same hidden priority-lane backbone as the home surface, so cards default to escalation/unblock/continue/clarify ordering before falling back to recency, lightweight lane badges explain why a task rose to the top, and a short lane-aware summary under the list heading explains which urgency lane is currently leading the queue without turning the page into a second lane board. Source context currently serves as the task-side materials layer for external references and notes, with create/edit/archive flows directly in task detail, explicit key-source marking for user-controlled prioritization, and source-focused recovery from the home brief. Blockers now serve as a task-side constraint object with create/update/resolve flows, optional linkage to source materials, direct visibility in the resume layer and context studio, lifecycle timeline events, and age-aware recovery semantics across task and home views. Process context now serves as the task-side methods layer, with reusable template creation, task-level binding/removal, in-detail editing/archive flows, and the first live execution linkages: `Run` evaluates bound process templates with a selector before deciding whether any template content should be injected into the run prompt, `Brief` uses a parallel selector over active-task templates as optional summarization lenses rather than fixed execution steps, and `Decision draft` now lets the workbench draft a request before creation while evaluating whether attached templates should shape the decision wording.
- `Decisions`
  Decision focus surface with a current focus, an action desk, and a decision queue. The current-focus area now behaves more explicitly like a local judgment surface instead of a second task page: it keeps a narrow decision snapshot, separates “return to task” flow from the formal approve/defer/cancel moves, and includes a lightweight related-task timeline slice to explain the most relevant recent task changes around that decision. The most important decision lifecycle events in that slice can now trigger task follow-up actions directly and reuse the same shared task-timeline semantics as the task page itself, including direct `Decision` object entry when the recent context points back to the active decision. The action desk now also supports AI-assisted decision drafting: users can provide optional context, let the workbench draft a title and rationale, then confirm the actual Decision creation themselves.
- `Runs`
  Run focus surface with a current focus, an action desk, and a run queue. The current-focus area now behaves more explicitly like a result-inspection surface instead of a second task page: the snapshot keeps only the run’s current state and minimal execution metadata, a dedicated result section holds output/failure inspection, the return-to-task path stays front-loaded, and the related-task timeline remains a lightweight explanation layer for how this run changed the task. The most important run lifecycle events in that slice can now trigger task follow-up actions directly and reuse the same shared task-timeline semantics as the task page itself, including direct `Run` object entry when the recent context points back to the active run.
- `Settings`
  Provider, model, API key, and scheduler configuration.

## Typical Development Flow

1. Add or update shared contracts in `src/shared`.
2. Implement main-process services and repositories.
3. Expose capability through preload and IPC.
4. Wire the renderer page to the new contract.
5. Run `npm run lint`, `npm run test`, and `npm run build`.

## Test Coverage Today

- Service-level tests cover config, task, decision, run, scheduler, and home brief logic, including deeper decision/run-to-task lifecycle annotations, key-source prioritization, task-resume derivation, cross-task priority-lane classification for home/brief semantics, plus process-template selection behavior for runs, briefs, and decision drafts.
- SQLite integration tests currently cover `TaskRepository`, `RunRepository`, `DecisionRepository`, `BriefSnapshotRepository`, `WaitingItemRepository`, `ArtifactRepository`, `SourceContextRepository`, `BlockerRepository`, `ProcessTemplateRepository`, and `TaskProcessBindingRepository`.
- IPC handler tests cover critical event-emitting channels such as settings save, decision action, and run trigger.
- Renderer interaction tests cover the main control-plane flows from Home, Tasks, Decisions, Runs, Settings, timeline actions, waiting item flows, blocker flows, artifact flows, source-context flows, process-context flows, task-resume visibility and recovery actions, task-resume latest-change object entry, home resume-preview recovery flows, home resume-preview context actions, home intent-navigation flows, recent source-material recovery flows, recent-activity follow-up entry flows, recent-activity object entry flows, recent-activity follow-up actions, task related-activity navigation, task timeline object entry flows, decision/run return-to-task flows, related-task timeline slices on object pages, shared timeline wording across task/object views, object-entry flows from related task timeline slices, timeline-driven follow-up actions on object pages, and failed Run refresh paths.
- local development currently relies on running `npm run test`, `npm run lint`, and `npm run build` before pushing changes.

For the current coverage map and recommended next targets, see [TESTING.md](TESTING.md).

## Native Dependencies

This project uses native modules such as:

- `better-sqlite3`
- `keytar`

If installation fails on a new machine, make sure standard native build tooling for your platform is available.
