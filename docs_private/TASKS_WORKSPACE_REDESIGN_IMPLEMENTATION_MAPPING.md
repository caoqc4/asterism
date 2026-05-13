# Tasks Workspace Redesign Implementation Mapping

Date: 2026-05-11

Status: implementation mapping and residual-gap assessment.

This document maps the implementation work completed for the Tasks workspace
redesign against the three testing discussion notes:

- [NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md](NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md)
- [TASK_FILES_AND_AGENT_MEMORY_DESIGN.md](TASK_FILES_AND_AGENT_MEMORY_DESIGN.md)
- [CONTEXT_CLEAR_AND_NEW_CONVERSATION_DECISION.md](CONTEXT_CLEAR_AND_NEW_CONVERSATION_DECISION.md)
- [COMPOSITE_TASK_TYPE_FRAMEWORK_DESIGN.md](COMPOSITE_TASK_TYPE_FRAMEWORK_DESIGN.md)

It also uses
[TASKS_WORKSPACE_REDESIGN_TASK_BREAKDOWN.md](TASKS_WORKSPACE_REDESIGN_TASK_BREAKDOWN.md)
as the execution checklist.

## Summary

The core v1 workspace shell described by the three optimization documents is
now implemented. The Tasks page has the intended navigation shape, selected
object model, task-file access, right-panel relationship, and safety rules.

The selected-task management surface should not be considered final merely
because the first structural version exists. Task management is a core product
capability, so its detailed layout should continue to be evaluated against the
mature task-management skeleton documented in
[NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md](NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md).

The main product shift is complete:

- task management, task files, task execution views, and right-panel discussion
  now converge in Tasks;
- Context is no longer a first-level Work page;
- Work Habits is a Zone 2 capability page;
- task files are represented through a task-file workspace with `Task.md` and
  `Task Records/`;
- product-level Agent principles govern task creation, task execution,
  verification, subagent usage, task-file routing, and context clearing;
- right-panel context clearing, new conversation, task binding, phase closeout,
  and task-file write proposals are separated into distinct user actions.

The remaining gaps are split into two kinds:

- task-management detail-layout refinements that should be product-designed
  before more implementation;
- larger runtime or modeling work that still belongs to the same product
  direction, but should be designed and accepted separately from the completed
  v1 workspace shell.

Composite task typing now has a separate design rule. It keeps the five base
task types and introduces Task Type Profiles with one primary type plus
additional facets. This is the intended foundation for system-managed Brief
recommendation ranking and for user tasks such as news tracking or
knowledge-base maintenance that combine routine, scheduled, event-triggered, or
project behavior.

## Status Legend

- `Done`: implemented and covered by tests or direct verification.
- `V1 Simplified`: implemented in the simplest useful form; deeper behavior
  still needs separate design and acceptance.
- `Needs Separate Design`: still part of the product direction, but large
  enough to require its own implementation plan.

## Navigation And Tasks View Mapping

| Requirement | Status | Implementation Notes |
| --- | --- | --- |
| Zone 1 contains Brief, Tasks, Decisions | Done | Sidebar Work section now exposes only these task work surfaces. |
| Context removed as first-level Zone 1 page | Done | Context responsibilities were split into Tasks task files and Work Habits. Legacy route redirects safely. |
| Work Habits becomes Zone 2 capability page | Done | Work Habits has its own Capabilities entry and manages learned/cross-task rules. |
| Connections renamed External Access | Done | Sidebar and page copy now use External Access; MCP remains MCP. |
| Tasks becomes unified task workspace | Done | Tasks uses resource explorer + selected-object workspace + right AI panel. |
| Task Resource Explorer has Execution Queue, Task Type, Task Files | V1 Improved | Groups are collapsible and do not require a separate task/file mode switch. Execution Queue is now positioned as an actionability view; Task Type remains structural classification. |
| Task Type uses five base types with composite facets | V1 Improved | UI groups by primary type and adds a cross-cutting Composite lens for tasks with more than one facet. Composite Task Type Profiles are now the bridge to the system-managed Brief task. |
| New Task action belongs in Task Resource Explorer header | Done | Task creation is no longer in the third-column workspace header. |
| Task Files shows current selected task's file tree | Done | Switching tasks refreshes the Task Files group for that task. |
| Selected object controls third column | Done | Task list, concrete task, and file all have distinct workspace headers and bodies. |
| Task-list views are 优先处理, 任务目录, 活动记录 | V1 Improved | `Priority Lane` and the flat `全部列表` wording were replaced with clearer view responsibilities: action queue, structured directory, and activity history. |
| 优先处理 behaves as an execution queue | V1 Improved | Queue rows are ranked by actionability first, then available time signals, impact, and intent fallbacks. V1 uses scheduled/event/recent timestamps until explicit due/start fields exist. Rows now keep parent context clear and reduce repeated status text. |
| Concrete task views are Task Management and Activity Log | Done | `Run` is no longer exposed as a task-level tab; execution remains available through the task workbench, while Activity Log shows selected-task history. |
| Task detail workspace follows mature task-management layout | V1 Improved | Task Management now focuses on identity, progression, and structure; nearby task files and activity history stay in their own surfaces. |
| File view replaces task navigation with file header | Done | File header supports path/name display, dirty indicator, save, rename, move, delete, and return. |
| Unsaved file switching guard | Done | Switching file/task/task-management prompts Save / Discard / Cancel. |
| Risk and waiting age are not first-level filters | Done | They remain task signals rather than primary navigation groups. |
| Committed removed from v1 navigation/filtering | Done | Commitment is not exposed as a first-version filter. |
| Decisions remains approval queue, not priority board | Done | Decisions routes pending approvals back to task workspace. |
| Brief remains attention surface | Done | Brief continues to answer what needs attention now. |

## Task Management Detail Layout Assessment

This section maps the current selected-task surface against the mature task
management skeleton documented in the navigation decision note. It is not an
implementation checklist yet; it is a product-layout assessment to prevent the
core Tasks module from moving too quickly.

### Baseline Skeleton

The product skeleton is:

```text
Task Detail
  Identity
  Progression
  Structure
  Context
  History
```

The current implementation has these layers in code, but that only proves the
surface has the correct first structure. It does not yet prove the information
hierarchy, interaction rhythm, or visual density are mature enough.

### Current Fit

| Layer | Current Fit | Assessment |
| --- | --- | --- |
| Identity | Present | Title, lane, type, status, and parent/subtask hints are visible. Needs layout review to ensure the title remains the strongest first-read element and metadata does not feel like scattered tags. |
| Progression | Present | Why-now, next step, waiting/decision state, planning, workbench, defer, complete, and more actions exist. Needs clearer ordering between "primary next action" and secondary task-state controls. |
| Structure | Present | Project progress, completion criteria, schedule, trigger, and commitment are represented. Needs better rules for when structure is expanded, summarized, or hidden for simple tasks. |
| Context | Present | Task files, sources, artifacts, and task-file entry points are summarized. Needs product review to decide whether `Task.md` recovery summary should be shown as content, metadata, or only as a file-tree entry. |
| History | Present | Recent activity preview exists and full current-task history lives in Timeline. Needs better event copy and payload summarization so it reads like useful history instead of raw audit data. |

### Layout And Interaction Questions Before More Code

- Should Progression be the visual anchor after the task title, or should
  Identity and Progression be merged into a compact header like Linear?
- Should project tasks show child-task progress inline in Task Management, or
  should child tasks remain primarily in the task-type/resource explorer?
- Should simple tasks without completion criteria show an empty-state prompt,
  or should that section collapse until criteria exist?
- Should Context show actual `Task.md` summary content, or only file/source
  references to avoid duplicating the file editor?
- Should History show only event labels, or should it show short human
  summaries generated from payloads?
- Should sections be collapsible in v1, or should v1 keep all five sections
  visible and rely on compact summaries?

### Recommended Next Product Pass

Before changing more code, run a focused Task Management layout pass. The
navigation decision note now defines three examples for this pass:

1. Define the ideal selected-task page for three task examples:
   - one-off task with no files;
   - project task with child tasks;
   - coding/agent task with task files, sources, artifacts, and records.
2. For each example, decide what appears in each of the five layers.
3. Decide which sections collapse, summarize, or disappear when empty.
4. Decide the exact top action order: plan, open workbench, defer, complete,
   decision, more.
5. Update this mapping with accepted layout rules before another implementation
   pass.

### Accepted Layout Rules From The Product Pass

These rules are now accepted as the basis for the next implementation pass:

1. Identity is always visible.
2. Progression is always visible and should be visually prominent.
3. Structure is visible when it contains project progress, completion criteria,
   schedule/trigger settings, or meaningful decomposition state; otherwise it
   should collapse or become a subtle prompt.
4. Context is visible when files, sources, artifacts, or important records
   exist; otherwise it should remain compact.
5. History is visible but compact; full current-task history belongs in
   Timeline.
6. Empty sections should not visually compete with real task information.
7. `Task.md` and Task Records are accessible from the Task Files tree; Task
   Management may summarize them but should not duplicate the full file editor.
8. Coding/agent tasks should feel like task management connected to a workbench
   and task folder, not like an embedded terminal clone.

Primary action priority:

1. Decision blocking progress: `Go to Decision`.
2. Project needs decomposition: `Generate / Review Decomposition`.
3. Clear execution next step: `Open Workbench`.
4. Needs clarification: `Plan`.

Secondary actions:

- defer;
- complete;
- more actions;
- dependency resolution when dependency-ready.

### Implementation Pass Against Accepted Rules

| Rule / Gap | Status | Notes |
| --- | --- | --- |
| Progression should be the visual anchor after the title. | V1 Improved | The title now leads the Identity layer, metadata follows it, and Progression uses a next-step/action strip so the primary action is read with the next step instead of competing with secondary controls. |
| Structure should collapse/summarize based on task type and emptiness. | V1 Improved | Simple tasks without structure now use a compact prompt; project, criteria, schedule, trigger, and commitment content still expand the section. |
| Context should not duplicate the file editor. | V1 Improved | Default `Task.md` / `Task Records`, sources, artifacts, and user files stay in the Task Files tree beside the task detail; Task Management no longer repeats them. |
| History should read less like raw audit data. | V1 Improved | Task Management no longer embeds activity previews; selected-task history lives in Activity Log with event labels and short payload summaries. More semantic summaries can be added later. |
| Primary action ordering should follow accepted priority rules. | V1 Improved | Task detail primary action now prioritizes Decision, then Project Decomposition, then Workbench readiness, then Plan. Workbench is no longer chosen from `nextStep` alone. |
| Project decomposition should be reviewed before child task creation. | V1 Improved | The first project-decomposition action opens the task-bound AI panel and auto-sends the decomposition prompt, so users can refine the plan conversationally before any child tasks are created. Existing reviewed drafts can still support later structured confirmation. |
| Long task-type groups should disclose hidden items. | V1 Improved | Task type groups show a "还有 N 个，点击查看全部" affordance after the first 12 visible tasks. |
| AI-inferred task type should not override confirmed user intent. | V1 Improved | Task attributes now track whether the type has been confirmed. Legacy unconfirmed `simple` tasks can still be migrated by title inference, while confirmed types remain stable. |

Remaining review:

- verify the new visual hierarchy in real manual testing across small screens
  and the right AI panel open/closed states;
- decide whether project decomposition controls in Task Management should
  become richer or remain a compact bridge into project/list views after manual
  testing;
- decide whether History should eventually summarize task records and phase
  closeouts, not only timeline events.

## Task Files And Agent Memory Mapping

| Requirement | Status | Implementation Notes |
| --- | --- | --- |
| Every task has logical task folder | Done | Each selected task exposes a task-file tree in Tasks. |
| Every task has `Task.md` | Done | `Task.md` appears as the primary task recovery file. |
| Every task has `Task Records/` | Done | `Task Records/` appears as the durable record location. |
| No default `outputs/` folder | Done | v1 does not create `outputs/` automatically. |
| Source contexts projected into task files | Done | Sources appear as `Sources/*.md` or `Task Records/*.md` where appropriate. |
| Artifacts projected into task files | Done | Artifacts appear as file-like entries under `Artifacts/`. |
| Timeline kept as activity/audit data | Done | Timeline remains separate from the user file tree. |
| Markdown/text editing | Done | Editable task files, text artifacts, source content, and `Task.md` can be edited inline. |
| Non-text files listed without full inline editing | Done | Non-editable entries use preview/read-only semantics. |
| Full file CRUD inside Tasks | V1 Simplified | Create, edit, rename, move, delete, and search exist for v1 task files/artifacts where supported; external/native file integration still needs separate design. |
| `Task.md` updates durable task state | Done | `Current Progress` and `Next Step` sync to structured task fields. Full `Task.md` content is also persisted via task files. |
| `Task.md` remains concise and not product-principles dump | Done | Product Agent principles were removed from `Task.md` and kept as read-only product-level context. |
| Task Records created for handoffs and phase closeouts | Done | Context-refresh, phase-closeout, follow-up-source, and manual task records write into `Task Records/`. |
| Agent principles read before task execution | Done | Agent principles are injected into AI chat, project decomposition, and agent working context. |
| Agent principles read-only | Done | Workspace patch tooling rejects edits to the product principles source. |
| Task-level closeout and next-task evaluation governed by principles | Done | The product principles now define next-task evaluation as a post-task-level action after verification, not a separate execution protocol. |
| No full chat transcript by default | Done | Records preserve compact summaries and selected signals, not full transcripts. |
| Cross-task preferences go to Work Habits, not task files | Done | Work Habits is separated and included in Agent principles. |
| RAG/embeddings not introduced by default | Done | Current implementation relies on structured data, task files, selected files, and ordinary context assembly. |

## Context Clear And New Conversation Mapping

| Requirement | Status | Implementation Notes |
| --- | --- | --- |
| Automatic context clearing is separate from new conversation | Done | Refresh task session and start new conversation are separate actions. |
| Generic handoff must not clear context | Done | Generic repeated prompts are rejected with a request for more specific recovery information. |
| Specific handoff persists to task memory | Done | Specific signals write source context and task-record files. |
| Manual clearing archives before clearing | Done | Manual mode first archives, then requires second confirmation. |
| Manual mode shows compact archive/safety result | Done | Manual archive reports message count and recent focus before final refresh. |
| Reminder-only mode exists | Done | Reminder-only warns without presenting a clear action. |
| New conversation starts global/unbound | Done | Starting a new conversation clears task binding and does not pretend to continue the prior task. |
| Task context chip is separate from clearing/new conversation | Done | Chip is labeled as leaving task context. |
| Playwright-style concrete discussion preserved | Done | Specific technical terms survive handoff records and tests cover this shape. |

## Discussion-To-Execution Workflow Mapping

| Workflow Step | Status | Implementation Notes |
| --- | --- | --- |
| Discussion can become a task | Done | Right panel can capture global discussion as pending task. |
| Captured task requires confirmation | Done | Pending captures stay out of Tasks until user confirms. |
| Discussion can become task output documents | Done | Right panel now creates a task-file write proposal with editable path/content preview. |
| File write requires confirmation | Done | The file is only created after `确认写入文件`; v1 does not overwrite existing files. |
| Generated document appears under Task Files | Done | Confirmed proposal writes through `createTaskFile` and Tasks refreshes the file tree on `task.changed`. |
| Generated document is referenced from `Task.md` | Done | Confirmed task-file writes append the path to `Task.md` `Important Files`. |
| Phase closeout creates durable handoff | Done | `收尾本阶段` writes phase closeout records. |
| Phase closeout asks whether to decompose follow-up work | Done | After closeout, the right panel offers follow-up task creation. |
| Follow-up tasks retain source links | Done | Created follow-up tasks get `后续任务来源` source context and `Task Records/*-followup-source.md`. |
| Next-task evaluation belongs after task-level verification | Done | Product principles require verification first, then classify closeout as complete, confirm-before-complete, pause-with-handoff, or continue-current-task before switching. |
| Project child completion can hand off to next child task | Done | After a project child task completes, Tasks can recommend the next unfinished child in recorded execution order, write a completion handoff Task Record, and rebuild the AI panel on the next task after user confirmation. |
| Subtasks require user confirmation | Done | Project decomposition and captured tasks require confirmation before entering real task flow. |

## Verification Mapping

Implemented coverage includes:

- sidebar navigation and naming;
- Work Habits / External Access split;
- task resource explorer groups;
- selected-object switching between task list, task, and file;
- file dirty guard;
- `Task.md` persistence and structured task field sync;
- source/artifact/task-record projections;
- task-file write proposal and confirmed write;
- `Task.md` important-file reference update after task-file creation;
- context refresh specific/generic handoff behavior;
- manual confirmation and reminder-only modes;
- new conversation global/unbound semantics;
- phase closeout and follow-up task creation;
- task-level closeout and next-task evaluation principles;
- project child completion handoff to the next recorded child task;
- Agent principles prompt/context injection and read-only protection.

Current verification gate:

```text
npm run verify
```

Latest local result: 135 test files passed, 916 tests passed, lint passed, build
passed.

## Remaining Items From The Three Documents

These items are still part of the broader direction captured by the three
optimization documents. They are not rejected and should not be understood as
outside scope. They are larger product/runtime capabilities that need their own
clear design, acceptance criteria, and implementation pass.

### 1. True Automatic Context Clearing

Current behavior is safe and user-visible: Taskplane suggests or prepares
context refresh and requires sufficient handoff quality. Fully automatic
background clearing can be revisited later after more real usage evidence.

### 2. File-Backed Source And Artifact Model

Source contexts and artifacts are currently projected into the task-file
workspace. A future migration may make them metadata views over task files, but
projection-first remains the simpler v1 choice.

### 3. Multi-File Editor Tabs And Rich Editor Behavior

The v1 file workspace uses a single active file header with dirty protection.
Multi-tab editing, richer Markdown preview, binary previews, and external
open-in-editor behavior still need a dedicated editor-workspace design.

### 4. AI Batch Document Generation

The right panel now supports one confirmed task-file write proposal at a time.
Batch generation of multiple files, diff review, templates, and overwrite
workflows should be designed as a separate agent-file-writing slice.

### 5. External Access Runtime Integrations

External Access is correctly named and framed, but live OAuth/sync ingestion is
not part of this redesign implementation.

### 6. Real Filesystem Task Folder Backend

The current task folder is logical and database-backed. A future local
filesystem-backed task folder can be considered later, especially for coding
tasks, but is not required for v1.

## Current Conclusion

The explicit v1 workspace shell adjustments from the three optimization
documents are materially implemented.

The selected-task management surface should remain under design review. It has
the correct initial five-layer structure, but task management is core enough
that the next step should be a focused layout and interaction pass before more
code is changed.

After the task-management layout is accepted, the next larger product
capability can be chosen deliberately from the remaining items above. A strong
candidate is the agent-file-writing workflow: multi-file proposals, diff
review, overwrite policy, and stronger task-file tool permissions.
