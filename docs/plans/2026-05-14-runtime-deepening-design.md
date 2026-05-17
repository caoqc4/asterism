# Runtime Deepening Design

Date: 2026-05-14

## Intent

Runtime deepening should not mean only "close current task and move to the next task".

For Taskplane, runtime is the product layer that turns a task from a static record into a guided execution loop:

1. Enter the right task context.
2. Assemble the minimum useful working context.
3. Execute with structured steps and bounded tools.
4. Detect blockers, decisions, stale context, missing evidence, and risky actions.
5. Route new information to the right durable surface.
6. Verify progress before changing task state.
7. Pause, hand off, resume, or move to the next task with traceable reasoning.

The current implementation already has many primitives for this:

- `Taskplane Agent Operating Principles`
- task state, task type, parent/child hierarchy
- task files, Task Records, source contexts, artifacts
- Runs, run steps, run verifications, run checkpoints
- Decisions and checkpoint-created decisions
- Work Habits
- Agent working context and tool policy
- closeout evaluator and task hierarchy shared helpers

The gap is not lack of pieces. The gap is that the product runtime is not yet represented as one explicit lifecycle with shared evaluators, clear state transitions, and consistent UI affordances.

Compliance tracking:

- Agent Operating Principles coverage is tracked in `src/shared/agent-principles-compliance.ts`.
- Human-readable status and priorities are tracked in `docs/plans/2026-05-14-agent-principles-compliance-matrix.md`.
- Additive scope clarification is tracked in `docs/plans/2026-05-14-agent-operating-principles-addendum.md`.
- Broader product runtime coverage is tracked in `src/shared/runtime-lifecycle-coverage.ts` and `docs/plans/2026-05-14-runtime-lifecycle-coverage.md`.
- Runtime deepening should not claim full principles compliance until the matrix has no `missing` entries and high-priority `partial` entries have concrete evaluators and tests.
- Runtime deepening should not claim full lifecycle coverage merely because Agent principles compliance improves; lifecycle coverage includes product UI state, data state, execution state, capability state, and audit surfaces beyond Agent execution rules.

## Runtime Lifecycle

The runtime should be modeled as six phases.

### 1. Context Entry

Question answered: "What task am I actually working on, and what context is active?"

Current state:

- Right panel can bind to a task.
- Task selection can switch panel context.
- Some switch notices exist, but behavior has been inconsistent.
- Context can still drift between visible task, panel task, selected file, and prompt draft.

Target behavior:

- There is one active runtime context: global or task-bound.
- A task-bound context contains `taskId`, selected file if any, source surface, and session mode.
- Switching tasks is a runtime event, not just a UI selection.
- The input box should show a short placeholder, not a long internal prompt.
- Prompt templates should be hidden execution inputs, not user-visible draft text unless explicitly opened as a proposal.

Needed design objects:

- `RuntimeContextSnapshot`
- `RuntimeContextSwitchEvaluation`
- `RuntimeContextSwitchEvent`

First implementation target:

- Centralize panel context switching into one shared renderer service.
- The service decides whether to silently switch, show a confirmation, preserve a handoff, or keep global context.

### 2. Context Assembly

Question answered: "What should the Agent read before acting?"

Current state:

- `buildAgentWorkingContext` assembles product principles, task state, sources, artifacts, files, process templates, and recent timeline.
- Code Agent has more explicit provider-visible context manifest logic.
- Right panel and lightweight chat context still assemble context separately.

Target behavior:

- All task execution surfaces use the same context assembly policy.
- Context assembly should expose:
  - required global principles;
  - task structured state;
  - Task.md if present;
  - recent Task Records only when useful;
  - selected file context;
  - relevant source contexts;
  - recent decisions/checkpoints/runs;
  - applicable work habits.
- Context assembly should produce both a model-facing manifest and a user-facing short explanation.

Needed design objects:

- `RuntimeContextManifest`
- `RuntimeContextAssemblyPolicy`
- `RuntimeContextAssemblyResult`

First implementation target:

- Extract shared task context assembly from `agent-working-context.ts`.
- Make RightPanel use the same manifest, at least for visible "what context is active" state.

### 3. Execution Step Loop

Question answered: "What happened during work, and what is allowed next?"

Current state:

- Runs and run steps exist.
- Agent tool registry has risk and confirmation boundaries.
- Some panel-only actions, such as phase closeout and file proposal, bypass the full run/step model.

Target behavior:

- Meaningful execution actions create runtime events.
- Tool calls, file proposals, confirmations, failures, and pauses are all step-like records.
- Lightweight panel actions can be cheaper than full Runs, but should still write consistent timeline or run-step-compatible events when they alter durable state.

Needed design objects:

- `RuntimeAction`
- `RuntimeStepEvaluation`
- `RuntimeEventRecord`

First implementation target:

- Add a small shared evaluator that classifies runtime actions into:
  - safe UI-only action;
  - timeline event needed;
  - Task Record needed;
  - Decision/checkpoint needed;
  - Run needed.

### 4. Information Routing

Question answered: "Where should new information be stored?"

Current state:

- Principles document defines routing rules.
- Implementations are scattered:
  - task file proposal;
  - source context creation;
  - artifacts;
  - Task Records;
  - Decisions;
  - Work Habits.
- File classification issues showed that surfaces are not yet strict enough.

Target behavior:

- The product owns one routing decision table.
- Chat text, run output, source material, AI output, user correction, and generated files should be routed by purpose, not by path guesswork alone.
- Every durable write should answer:
  - Is this task state?
  - Is this recovery context?
  - Is this source material?
  - Is this user-facing output?
  - Is this a decision?
  - Is this a cross-task habit?
  - Is this still just discussion?

Needed design objects:

- `InformationRoutingCandidate`
- `InformationRoutingDecision`
- `TaskSurfaceKind`

First implementation target:

- Move file/source/artifact classification into shared logic.
- Add tests for AI output, source material, Task.md, Task Records, local artifacts, and ordinary files.

### 5. Verification And Closeout

Question answered: "Can the task state change now?"

Current state:

- Run self-check exists.
- Task completion modal checks criteria and recent run verification.
- Shared closeout evaluator now exists.
- Phase closeout now avoids blindly creating follow-up tasks.

Target behavior:

- Verification is not only for "complete task".
- It should run at:
  - before execution;
  - after each meaningful step;
  - before mutating task state;
  - before context clearing;
  - before task completion;
  - before project phase handoff.
- Closeout should classify into:
  - continue current task;
  - pause with handoff;
  - needs user confirmation;
  - ready to complete;
  - hand off to existing child/successor;
  - propose new task only when no suitable existing task exists and evidence supports it.

Needed design objects:

- `RuntimeVerificationResult`
- `TaskCloseoutEvaluation`
- `ProjectProgressEvaluation`

First implementation target:

- Extend `task-closeout-evaluator` into a more general `runtime-verification` module instead of growing one closeout file forever.

### 6. Pause, Resume, And Handoff

Question answered: "How does work safely stop and restart?"

Current state:

- Run checkpoints and resume checkpoint payloads exist.
- Context clearing has some panel behavior.
- Task Records can archive handoffs.
- Subagent handoff is described in principles, but not consistently productized in UI.

Target behavior:

- Pause/resume is a first-class runtime path, not just a failed/paused run status.
- A handoff should be written only when useful and should be specific.
- Resume should reconstruct context from the manifest, not from stale chat.
- User can tell whether they are:
  - staying in same task after context refresh;
  - switching to another task;
  - starting global chat;
  - resuming a paused run.

Needed design objects:

- `RuntimeHandoff`
- `RuntimeResumePlan`
- `ContextClearEvaluation`

First implementation target:

- Unify context clear, phase closeout, and run resume around one handoff shape:
  - from task;
  - to task or same task;
  - reason;
  - evidence;
  - unresolved questions;
  - next action;
  - storage surface.

## Product Surfaces

### Brief

Brief is an attention summary, not the full runtime.

It should answer:

- What deserves attention today?
- Which task should start next?
- What is blocked, waiting, risky, or stale?
- What decisions need user input?

It should not own task ordering logic or execution state. It should project runtime signals.

### Tasks

Tasks is the control room.

It should answer:

- What tasks exist?
- What is their type and hierarchy?
- What needs action?
- What is the current task state?
- What files, records, runs, decisions, and sources belong to this task?

Tasks should not duplicate runtime policy in UI branches. It should use shared evaluators.

### Decisions

Decisions is the judgment inbox.

It should answer:

- What must the user decide?
- Why is this decision needed?
- What scope does it affect?
- What happens after approval/rejection?

It is broader than "tasks waiting for decision", but should be linkable back to tasks, runs, checkpoints, source materials, and risky operations.

### Right Panel

Right Panel is the active runtime cockpit.

It should answer:

- What context is active?
- What can I safely do next?
- What action will write durable state?
- What needs confirmation?
- What has been preserved before clearing or switching?

It should not expose long internal prompts as input text.

## Current Gaps

1. Runtime lifecycle is implicit.
   The system has rules, steps, checkpoints, decisions, and task state, but no single runtime lifecycle object or evaluator.

2. Context assembly is split.
   `agent-working-context.ts`, RightPanel, Code Agent, and task file flows still assemble or display context differently.

3. Information routing is not centralized.
   File classification and source/artifact/task-record routing still have scattered logic and can drift.

4. Runtime task-dynamics projection is surfaced through the retained task view.
   Core RightPanel and TasksPage durable actions now go through shared guards and persist `panel.*` timeline events. Tasks task dynamics consumes `RuntimeEventRecord` and replay groups; Run detail exposes the same replay data for future consumers without requiring a standalone Run Detail page.

5. Verification is now shared across the retained execution boundaries.
   Completion, closeout, before-step, after-step, context-clear, project-level completion, task switching, run start, and checkpoint resume now use shared runtime evaluators. The remaining risk is future entry points bypassing the same gates, not a missing core evaluator.

6. Decisions has a judgment-center baseline, with richer batch handling deferred.
   Decisions now projects category, urgency, task signal, options, recommendation, effect after action, and grouped pending context. Batch approve/defer/cancel should remain deferred until a real multi-decision workflow appears.

7. Source freshness and context boundaries are not visible enough.
   The principles describe freshness and relevance, but UI/runtime does not consistently expose why a source was included or excluded.

8. Task hierarchy is now moving into the data model, but migration is partial.
   `taskType`, `taskFacets`, `parentTaskId`, and `childTaskIds` are in DB, while some renderer-local attributes still exist for commitment/schedule/trigger/owner/visibility and legacy fallback.

9. Task intake is separated from discussion for the retained creation paths.
   RightPanel capture, explicit task creation, service-level task creation/update, and project decomposition now use shared intake, capture, or child-draft boundaries. Future creation entry points still need to declare which existing boundary owns them before writing tasks.

## Recommended Implementation Order

### Package A: Runtime Surface Taxonomy

Add shared classification for durable surfaces:

- task state;
- task file;
- Task Record;
- source material;
- artifact;
- decision;
- run step;
- work habit;
- discussion only.

Deliverables:

- `src/shared/runtime-surface-routing.ts`
- tests for source/file/artifact/record classification
- update Tasks file classification to consume it

Status: first pass implemented, with creation-entry normalization started.

Implemented:

- `runtime-surface-routing` classifies Task.md, Task Records, source materials, AI output, artifacts, and ordinary task files.
- Tasks file/resource explorer now consumes the shared classifier for labels, notes, ordering, and projection labels.
- Source context creation now normalizes missing roles through the shared routing rules before persistence.
- RightPanel phase records/session refresh records explicitly mark generated material as digest context.
- Task file creation now uses shared routing normalization for `Task.md`, `Task Records/`, ordinary files, and folders.
- Manual artifact creation now passes through shared artifact normalization before persistence.
- RightPanel file-write proposals now classify the proposed path before display and update the visible surface classification when the path changes.
- Non-file information candidates can now be classified into decision, work habit, run step, or discussion-only without writing durable state.
- Decision creation now uses shared routing normalization for scope, kind, source metadata, and task binding before validation/persistence.
- Decision drafts now carry shared routing suggestions for scope, kind, and source without creating a formal Decision.
- Work Habit proposals now use shared routing to create pending proposal records instead of confirmed manual habits.
- Runtime action events now use shared routing to classify session, plan, model, tool, checkpoint, pause, and terminal events into RunStep kinds.
- Direct checkpoint creation now also uses shared runtime action routing before writing checkpoint RunSteps.
- Checkpoint runtime actions are explicitly marked as RunStep records that may also require Decision/checkpoint handling.

Remaining:

- Package A first pass is complete. Later packages can reuse this taxonomy from context assembly, action evaluation, and verification.

### Package B: Runtime Context Manifest

Create one manifest builder for task-bound runtime context.

Deliverables:

- `src/shared/runtime-context.ts`
- context manifest for RightPanel and Runs
- short UI explanation of active context
- hidden model prompt inputs instead of visible long prompt drafts

Status: first pass implemented.

Implemented:

- Added shared `RuntimeContextManifest` projection for task state, selected file, sources, artifacts, task files, process templates, timeline, and work habits.
- Agent run request formatting now includes the shared runtime context manifest instead of relying only on scattered count lines.
- RightPanel now shows a compact user-facing context explanation near the input while keeping internal prompts out of the visible draft text.

Remaining:

- Extract deeper context assembly policy from `agent-working-context.ts` so RightPanel and Runs can share source freshness and inclusion/exclusion reasoning, not just the manifest projection.

### Package C: Runtime Action Evaluator

Create one evaluator for actions before they mutate state.

Deliverables:

- `src/shared/runtime-action-evaluator.ts`
- classify actions into UI-only, timeline, task record, decision/checkpoint, run
- apply to phase closeout, file write proposal, context clear, task switching

Status: first pass started.

Implemented:

- Added shared `evaluateRuntimeAction` for context switching, context clearing, phase closeout, file write proposal, and task capture.
- RightPanel now uses the shared evaluator for task capture, phase closeout, file write proposal availability, and context-switch guidance.
- RightPanel context refresh, manual refresh, start-new-conversation, and leave-task-context actions now pass through the shared context-clear guard before clearing active task memory.
- Decisions approve/defer/cancel actions now route through the shared decision-action evaluation before mutating the decision inbox.
- Tasks state transitions now pass through the shared task-state-transition evaluation before writing planned/completed/waiting/archived states.
- Brief task completion, waiting, and archive actions now also pass through the shared task-state-transition evaluation instead of bypassing the Tasks page rules.
- Legacy WorkbenchPage has been removed from the active renderer entry set; its task detail behavior is covered or replaced by TasksPage and RightPanel flows.
- Run start and paused-run resume now pass through the shared run action evaluation at `RunService` boundaries.
- Code Agent and operator-started Run entry points now also pass through the shared run-start evaluation before creating a Run.
- Agent task mutation tools now pass through the shared task-mutation evaluation before updating next step or creating completion criteria.

Remaining:

- Keep future state-mutating panel actions registered in `RuntimeEntrypointCoverage` with the smallest matching gate.
- Keep future source/artifact/file write tools on the existing durable-write guards instead of adding direct persistence.

### Package C2: Runtime Intake Evaluator

Create one evaluator for deciding whether user input should become durable work.

Deliverables:

- `src/shared/runtime-intake-evaluator.ts`
- route candidate input to task, Task Record, task file proposal, Decision, Work Habit, or discussion
- use it before task capture and later before project decomposition / follow-up creation

Status: first pass started.

Implemented:

- Added shared `RuntimeIntakeEvaluation` for task, Task Record, task file, Decision, Work Habit, and discussion outcomes.
- RightPanel task capture now refuses to create tasks from likely Task Records, file writes, Decisions, Work Habits, or underspecified discussion.

Remaining:

- Preserve the same intake boundary for future task creation entry points.
- Keep child-task creation paths on the stricter child-task evaluator for duplicate, over-broad, and wrong-parent subtasks.

Implemented follow-up:

- Added `runtime-subtask-evaluator` for confirmed project-child creation.
- Project child creation now blocks existing-child append, duplicate titles, generic phase templates, parent-overlapping titles, missing summaries, and missing acceptance criteria.
- AI project decomposition now refuses to generate another draft when the parent already has child tasks.

Remaining follow-up:

- Apply the same child-task evaluator to any future Agent/tool-created child task path.
- Add project-level verification over child completion, unresolved dependencies, decisions, artifacts, and risks.

Implemented verification follow-up:

- `runtime-verification` now has an initial `project` mode.
- Project verification checks missing structure, child completion, blocked/waiting children, parent completion criteria, pending decisions, and risk confirmation.
- Project parent completion now uses project verification in the completion modal and records child completion counts into the completion-check task dynamic.
- Project detail now displays the same project verification summary next to the child task structure.
- Project verification includes artifact/source evidence counts and Decision effect summaries for pending, approved, deferred, and cancelled decisions.
- `runtime-verification` now has first-pass `pre_step` and `post_step` modes for action permission, pending decisions, required context, and durable-change recovery notes.

Remaining verification follow-up:

- Route future project state transitions through project verification when they affect readiness or completion.
- Keep future Run services and panel durable actions on `pre_step` / `post_step` instead of adding direct writes.

### Package D: Verification Unification

Generalize closeout into runtime verification.

Deliverables:

- `src/shared/runtime-verification.ts`
- task, step, run, project, pre-step, post-step, context-clear verification modes
- replace direct completion-only logic gradually

Status: first pass started.

Implemented:

- Added shared `evaluateRuntimeVerification` for Run, RunStep, task closeout, and context clear verification modes.
- Run verification persistence now uses the shared runtime verification entry point instead of calling Run self-check directly.
- Task completion modal, Tasks completion handoff helper, and RightPanel phase closeout now call task closeout through runtime verification.
- Task completion modal recent Run checks now also use runtime verification, with persisted RunVerification records adapted into the same result shape.
- RightPanel task session refresh, manual refresh, new conversation, and leave-task-context now combine action evaluation with context-clear runtime verification before clearing task context.
- First-pass pre-step and post-step verification modes now exist for shared execution-boundary checks.
- RunService, CodeAgentRunService, and OperatorStartedRunService now pass run_start through pre-step verification before execution.
- Run step verification persistence now uses post-step verification for completed/failed/skipped steps.
- Added `runtime-step-effect-evaluator` so post-step verification receives durable-change and recovery-note signals instead of guessing inside UI code.
- RightPanel phase closeout now runs pre-step verification before saving and post-step verification before quality-check handoff.
- RightPanel task file proposal confirmation now runs pre-step verification after user confirmation and post-step verification after the durable file write.
- Added renderer runtime action guards for task state transitions and task mutations; Tasks and Brief now use them for primary state changes.
- Tasks special mutation paths for Task.md sync, risk updates, project moves, and project parent updates now use the same mutation guard.
- Tasks file actions for create, rename, move, delete, source key toggles, source archive, and artifact creation now use durable panel action guards.
- Decisions page approve/defer/cancel actions now use shared decision action guards and post-step verification.
- AgentToolRegistry task/source/artifact durable tools now use pre-step and post-step runtime verification.
- RightPanel task capture, captured-task confirmation, and captured-task abandonment now use runtime verification guards.
- Tasks file content saves for Task.md/Task Records, task files, source materials, and artifacts now use durable panel action guards plus post-step completion checks.
- Tasks project decomposition confirmation now guards child task creation, child planning transitions, dependency creation, parent updates, task records, and completion criteria writes.
- RightPanel session refresh, phase closeout, and Task.md reference writes now guard their internal source/task-record persistence.
- Added shared `RuntimeHandoff` and `RuntimeResumePlan` evaluation for context refresh, task switch, phase closeout, and run resume planning.
- RightPanel now consumes `RuntimeHandoff` for task-session refresh, manual refresh, global reset, leave-context, task switch confirmation, and phase-closeout child handoff.
- Added `RuntimeHandoffPreview` so manual refresh/archive preview text is generated from the shared handoff result and archive snapshot instead of being assembled only in RightPanel.
- RunService paused-run continuation now consumes `RuntimeHandoff` and `RuntimeResumePlan` before executing checkpoint resume tools.
- Added shared `RuntimeEventRecord` projection for timeline events, Runs, Run steps, Task Records, Decisions without timeline coverage, and runtime resume projections.
- `RuntimeEventRecord` is now the shared task-dynamics/audit projection; Tasks task dynamics consumes it, and retained Run-side views should follow the same projection instead of legacy Workbench-specific activity logic.
- Tasks task dynamics view now consumes `RuntimeEventRecord`, so timeline events, Runs, Run steps, Task Records, Decisions, runtime resume projections, and `panel.*` events share one display stream.
- Added shared replay grouping for `RuntimeEventRecord` so handoff, project structure changes, execution recovery, Decisions, durable records, source context, and task state changes can be replayed consistently without changing UI layout.
- Run detail now exposes optional `runtimeEvents` and `runtimeReplayGroups`, so retained Run-side consumers can use the same projection data without changing UI layout.
- Added `recordTaskTimelineEvent` IPC/service path so panel-only durable actions can persist RuntimeEventRecord-compatible timeline events.
- RightPanel context refresh, context switch confirmation/dismissal, phase closeout, and task file proposal writes now persist `panel.*` timeline events.
- Added `runtime-panel-events` so known `panel.*` event types are shared and unknown panel event types are rejected before persistence.
- TasksPage file/source/artifact actions and confirmed project decomposition now persist `panel.*` timeline events, so retained task-management panel actions flow into the same `RuntimeEventRecord` audit projection as RightPanel actions.
- TasksPage project membership changes and completion handoffs now persist `panel.*` timeline events with task-to-task context; core task update/transition/risk/waiting/next-step changes continue to use repository timeline events.
- `RuntimeEventRecord` now preserves task-to-task `relatedTaskId` from completion handoff and accepted context-switch timeline events, and replay groups retain `relatedTaskIds` for task A to task B recovery.
- Task closeout evaluation now prefers existing child handoff, can hand off to an existing successor when no child is available, and confirmation-gates any proposed new follow-up tasks instead of creating them during closeout.
- Added `runtime-task-capture-evaluator` so duplicate open-task captures and generic title-only candidates are blocked before persistence.
- TasksPage explicit task creation and RightPanel conversation capture now pass task candidates through the shared task-capture evaluator.
- `TaskService.create` now enforces the same task-capture evaluator at the service boundary before repository persistence.
- `TaskService.update` now reuses the same evaluator when a task title or parent scope changes, preventing duplicate sibling tasks during project moves.
- Project decomposition generation now uses the same `runtime-subtask-evaluator` as confirmed child creation, so projects with existing open or legacy follow-up children do not generate another decomposition draft.
- RightPanel task-context follow-up task capture now passes explicit follow-up proposals through task closeout evaluation before creating a new task, so existing child handoff can block duplicate follow-up creation.
- Added `PriorityAttentionProjection` so Brief and Tasks consume the same priority order, with Brief using an explicit capped attention summary and Tasks using the full ordered queue.
- TasksPage explicit task creation now passes through the shared `task_capture` pre-step guard before persistence.
- Added `RuntimeCapabilitySnapshot` for model availability, workspace checks, feature flags, and tool scaffold exposure; `RuntimeContextManifest` can now include it as a capability context item.
- `pre_step` runtime verification can now consume `RuntimeCapabilitySnapshot` when an execution explicitly requires model execution or workspace verification.
- `RunService` now passes `RuntimeCapabilitySnapshot` into run-start pre-step checks for model execution, and `CodeAgentRunService` passes it for model/workspace capability checks.
- Added `SourceFreshnessEvaluation`; `RuntimeContextManifest` can now carry source inclusion decisions and reasons such as selected, current-run, key, stable reference, recent, stale, archived, or undated.
- Added `SourceMaterialQualityEvaluation`; `RuntimeContextManifest` now combines freshness with traceability, credibility, duplicate, and sensitivity checks before including source context content.
- Added `SelectedFileRelevanceEvaluation`; `RuntimeContextManifest` can now carry selected-file relevance reasons such as Task.md, Task Record, explicit selected file, generated output, empty preview, or archived path.
- `AgentWorkingContext` now retains source id/status/capturedAt/run/sourceRole/uri metadata so ordinary Run context manifests can evaluate source freshness and source-quality traceability instead of relying only on title-level summaries.
- Code Agent model-producer preflight now passes selected source-context metadata into `RuntimeContextManifest`, so source freshness/relevance is evaluated before execution rather than only in the provider-visible manifest.
- Added `TaskRecordWorthinessEvaluation` so Task Record-worthy handoffs, closeouts, user corrections, option rationale, failure reviews, context archives, external signals, and durable state changes are classified by one shared runtime object.
- RightPanel context-refresh and phase-closeout Task Record writes now consume `TaskRecordWorthinessEvaluation` before creating `Task Records/` files.
- Added `TaskMdUpdateNeedEvaluation` so Task.md updates for recovery fields and important file references are evaluated by one shared runtime object.
- RightPanel Task.md important-file references now consume `TaskMdUpdateNeedEvaluation` before creating or updating `Task.md`.
- TasksPage direct `Task.md` saves now consume `TaskMdUpdateNeedEvaluation`, and manual Task Record creation consumes `TaskRecordWorthinessEvaluation`.
- Added `RuntimeRecoveryGuidance` so durable tool recovery recommendations have structured `recoveryGuidanceItems` plus legacy `recoveryGuidance` messages, without silently mutating `Task.md`.
- Added `SubagentHandoffEvaluation` as a data-only runtime boundary for future subagent delegation: it checks inherited principles, task context, assigned scope, allowed action/file scope, confirmation-boundary violations, and handoff completeness before main-Agent integration.
- Legacy WorkbenchPage has been retired from active renderer code and should not receive new runtime-deepening implementation. Its responsibilities are covered by TasksPage, RightPanel, Runs/task-dynamics projections, and Decisions.

Remaining:

- Keep future execution and state-transition paths on the existing project, pre-step, and post-step verification gates.
- Keep replay grouping in the retained task-dynamics surface; only add Run-side presentation if a retained Run-side view returns.
- Keep future task-context follow-up proposal entry points wired into the shared closeout evaluator.

### Package E: Decisions Judgment Center

Make Decisions a real judgment inbox. The baseline is now implemented; keep future additions focused on concrete multi-decision workflows rather than adding generic approval UI.

Deliverables:

- grouped pending decisions by source: task, run checkpoint, file write, external operation, risk approval
- show context, options, recommendation, effect after approval/rejection
- link decisions back to task/run/checkpoint
- defer batch actions unless users actually need to approve or defer multiple related decisions at once

Current implementation note: `DecisionJudgmentProjection` now exposes a
standard `sourceTarget` with kind, id, task binding, and route hint for task,
run, Agent checkpoint, tool, external access, workspace, system, manual, and
global decisions. This keeps Decisions as a judgment center and prevents pages
or runtime consumers from inferring source routing from display labels.

### Package F: Data Model Migration Cleanup

Finish moving task structure out of renderer-only attributes.

Deliverables:

- migration strategy for `commitment`, `schedule`, `trigger`, `owner`, `visibility`
- remove duplicate reads when DB field becomes authoritative
- preserve backward-compatible import from localStorage once

## First Next Step

The highest leverage next step is Package A: Runtime Surface Taxonomy.

Reason:

- It addresses multiple reported issues at once: AI output vs source material, file path/category confusion, Task Record vs artifact vs source.
- It is foundational but small enough to implement safely.
- It does not require redesigning Runs or Decisions first.
- It creates shared vocabulary for the rest of runtime deepening.

After Package A, Package B should follow so context assembly and panel behavior stop drifting.
