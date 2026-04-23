# Taskplane

Taskplane is a local-first desktop workbench for turning signals into long-lived tasks, decisions, runs, and briefs.

This repository currently contains an Electron + React + TypeScript prototype with:

- task creation, structured task signals, detail editing, and state transitions
- decision request creation, actions, and task linkage with task-side follow-up semantics
- run triggering for `draft` and `summarize`, with task linkage, failure signals, task restoration after runs settle, and dynamic process-template selection before execution
- local brief snapshot generation with recommended actions, recent artifact context, recent lifecycle activity, and intent-aware navigation plus lightweight follow-up actions for task follow-up and object-review flows
- source-context-aware home brief aggregation, including explicit key-source prioritization, key source-material surfacing, source-focused task recovery flows, and lightweight source-driven recommended actions
- blocker-aware recovery semantics, including a current blocker object in task detail, blocker-driven recommended actions and resume wording, optional linkage from blockers into source materials, blocker lifecycle timeline events, blocked-task key signals on the home surface, a distinct `Needs Escalation` home signal for stale blockers, mutually exclusive blocked-vs-escalation grouping on the home surface, direct escalation handling and lightweight blocker-source entry from those home signals, escalation-aware home headline/lede guidance, a conservative home-level `标记已解除` action that can also restore clearly blocker-driven waiting states, blocker `created / resolved` lifecycle activity on the home surface, lightweight blocker-age cues so the UI can distinguish fresh blockers from stale ones, and escalation wording when blockers have remained unresolved long enough to deserve stronger follow-up
- hidden `Priority Lanes` semantics that now classify cross-task urgency into escalation, unblock/decide, continue/review, clarify, and steady lanes, then reuse that same ordering backbone across `Recommended Actions`, the home headline/lede, and written briefs without adding another top-level homepage section; the home recommended-action cards now also surface lightweight lane labels so users can see why an item rose to the top
- home recent-activity cards now also surface the same lightweight lane labels, so lifecycle events read with the same urgency language as recommended actions instead of feeling like a separate stream
- home key-signal groups now also carry lightweight lane labels, so blocked, escalation, waiting, risk, and missing-next-step signals read with the same “escalate / unblock / continue / clarify” language as the rest of the control surface
- home resume previews now also inherit the same lane semantics, so recent-task recovery cards rise in the same escalation/unblock/continue/clarify order and show a lightweight lane badge instead of becoming a separate prioritization system
- the tasks list now also reuses those same hidden `Priority Lanes` semantics as its default ordering backbone, so task cards rise by escalation/unblock/continue/clarify urgency before falling back to recency, and each card carries a lightweight lane label instead of introducing a separate lane board inside the task work surface
- that same tasks list now also explains its lane-aware ordering with a lightweight summary under the heading, so users can see which urgency lane is currently leading the queue without turning the page into a second home dashboard
- blocker-linked source updates can now also surface on the home activity rail when they materially change the basis for an active blocker, so the control surface can suggest re-evaluating that blocker instead of treating the source update as generic progress
- task resume cards that compress current state, latest change, key source, current method, and next suggested move into a working-context recovery view, now deriving the suggested move from the clearest recent lifecycle change before falling back to static waiting, risk, source, or artifact heuristics, surface why the current key source is prioritized, explain why the current method was most recently selected, and offer lightweight actions to open the key source, inspect the current method, or adopt the suggested next step
- task resume cards now also expose direct entry from the latest-change slot into the most relevant related `Decision / Run / Source` context when that recent lifecycle change points to one
- home resume previews that surface a lightweight working-context recovery slice for recent tasks, now carry short explanations for key-source and current-method hints, expose direct entry from the latest-change slot into the most relevant related `Decision / Run / Source` context, derive their suggested next move from the clearest recent lifecycle change before falling back to static waiting/risk/source recovery cues, and derive context-aware follow-up actions that can prioritize the most recent `Decision / Run` change before falling back to waiting, risk, source, or next-step recovery
- brief text generation now also includes task resume previews so written briefs can carry the same recent-change-first recovery framing used by task resume cards and home resume previews
- brief text now also uses explicit priority-lane wording to organize summary sections, so written updates can lead with escalation work, then unblock/decide work, before falling back to continue/review or clarify lanes
- task-scoped timeline events with readable summaries, subtle event tones, lightweight action shortcuts, and direct `Decision / Run` object entry from key task events, now aligned through shared timeline semantics across task and object work surfaces
- waiting item lifecycle tracking with direct resolution and task/detail/home visibility
- text artifacts generated from successful runs, surfaced in task detail, timeline actions, home brief, and recommended-action semantics
- source context items for task-linked external materials, with task-detail create/edit/archive flows, explicit key-source marking, home-brief surfacing, source-focused task recovery entrypoints, and lifecycle timeline events
- blocker-linked source updates now feed recovery semantics too, so a freshly updated blocker source can tell the workbench and home surface to re-evaluate whether the current blocker should be cleared instead of only treating the update as generic source progress
- process context templates for task-linked working methods, with reusable template creation, task binding, and lifecycle timeline events
- run-time process-template selector that can decide whether to use bound task methods before execution, then record selected/skipped outcomes in task timelines
- decision and run pages organized as object work surfaces with a current focus, action desk, queue, direct return paths into task follow-up work, lightweight related-task timeline context, shared timeline semantics, timeline-based follow-up actions, and direct object entry from related task timeline events when the recent context points to the current `Decision / Run`
- local scheduler with config-driven enable/disable
- local configuration via `config.json` plus system keychain for secrets
- SQLite-backed repository integration tests

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
- home recommendation ordering, hero summary copy, and brief text now share the same lane-aware prioritization rules, so escalation, unblock/decide, continue/review, and clarify work are described in a more stable cross-task order instead of being assembled from unrelated signal snippets
- task detail organized into a recovery-first current snapshot, a narrowed action desk, and an activity feed
- task list ordering now also reflects the same lane-aware control-surface semantics used on Home, so the default `Tasks` view starts with the most urgent work without turning the page into a second home dashboard
- task detail acting as a task work surface, now organized more explicitly around recovery first: a resume card and current working slices stay in the first screen, the current snapshot only surfaces a single key slice for source/process/artifact context instead of trying to show complete collections, the action desk front-loads only a small set of primary moves before deferring detailed decision/run configuration and state transitions to a lower setup layer, related activity and timeline stay in the activity feed with key events prioritized over weaker trace entries, and full source/process management is intentionally pushed into a separate context-management layer where source materials and process templates are managed with clearly separated material-shelf and method-library semantics
- the task action-setup forms now also absorb `Priority Lanes` semantics, so quick decision/run defaults and helper wording lean toward escalation, unblock/decide, continue/review, or clarify behavior instead of always falling back to generic task summary text
- decision-draft and run prompts now also absorb task-level lane cues, so backend generation follows the same escalation / unblock / continue / clarify tone that the task action forms now expose in the UI
- the reasons shown in task resume cards and home resume previews now align more explicitly with those material-shelf and method-library semantics, so “why this source matters” and “why this method is active” use the same language as the context-management layer
- decision and run pages acting as object focus surfaces, with queue navigation, narrowed current-focus areas, direct return-to-task follow-up entrypoints, lightweight related-task timeline explanations, timeline-based follow-up actions, and direct object entry when related task history points at the current `Decision / Run`
- task-side objects now established: active `waiting items`, text `artifacts`, editable `source context` materials, and reusable `process context` templates
- task-side objects now also include a first-class `blocker` object for expressing why a task is currently blocked without collapsing that reason into waiting-state text alone
- decision and run actions now write back clearer task semantics, including follow-up next steps, waiting reasons, and lifecycle timeline events
- run execution now evaluates bound process templates with a Claude-skills-style selector instead of blindly injecting every template into every run
- brief generation now also evaluates active-task process templates with a separate selector, using them as optional summarization perspectives rather than fixed execution steps
- decision creation now supports AI-assisted draft composition, with a selector deciding whether attached process templates should shape the request before the user confirms creation
- process-template selectors now also absorb `Priority Lanes` guidance, so the method-selection reasoning for runs, briefs, and decision drafts stays aligned with the same escalation/unblock/continue/clarify language already visible in the UI and prompt defaults
- config + keychain setup
- service tests and SQLite repository integration coverage
- IPC handler coverage for critical event-emitting entrypoints
- renderer interaction coverage for key control-plane flows
- local macOS packaging pipeline
- local `test + lint + build` verification

What is still in progress:

- deeper workflow semantics and richer task-side objects
- broader persistence and UI coverage
- final branding and product polish
- signed and notarized releases
