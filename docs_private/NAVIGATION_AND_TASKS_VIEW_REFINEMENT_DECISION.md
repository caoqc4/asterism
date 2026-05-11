# Navigation And Tasks View Refinement Decision

Date: 2026-05-11

Status: testing discussion decision note; not an implementation record.

This note records navigation and Tasks-page refinements identified during the
current manual testing pass. It should guide later implementation after testing
is complete.

## Relationship To Other Notes

[CONTEXT_CLEAR_AND_NEW_CONVERSATION_DECISION.md](CONTEXT_CLEAR_AND_NEW_CONVERSATION_DECISION.md)
is scoped to right-panel conversation clearing and new-conversation semantics.
This document is separate. It covers Tasks-page views, task filters, and
capability navigation naming.

[TASK_FILES_AND_AGENT_MEMORY_DESIGN.md](TASK_FILES_AND_AGENT_MEMORY_DESIGN.md)
covers the task-folder and Agent memory model. This document defines how that
model is surfaced in the app shell: Task Files should be integrated into Tasks
rather than kept as a separate Zone 1 page.

## Principles

Use first-principles and razor-based simplification:

- keep only navigation and filters that support a clear user action;
- avoid exposing internal model names as user-facing labels;
- avoid first-level entries for concepts without a complete v1 workflow;
- keep Zone 1 for task work surfaces;
- keep Zone 2 for AI capabilities, external access, and configuration.

## Zone 1 Direction

Zone 1 / Work should be reduced to the core task workflow:

```text
Brief
Tasks
Decisions
```

Context should not remain a first-level Zone 1 page after the redesign. Its
task-file responsibility moves into Tasks. Its work-habit responsibility moves
to Work Habits in Zone 2.

The first-principles split is:

- Brief answers "what should I pay attention to now?"
- Tasks answers "how do I manage, execute, and inspect this task?"
- Decisions answers "what is waiting for my approval or rejection?"

## Tasks Workspace Layout

Tasks should become the unified task workspace rather than a task-list page
plus separate detail and file pages.

The working layout is:

```text
Zone navigation | Task Resource Explorer | Selected Object Workspace | AI Panel
```

### Task Resource Explorer

The second column should be a single, low-friction resource explorer. It should
not force the user to switch between task mode and file mode before selecting
content.

Recommended collapsible groups:

```text
Execution Status
Task Type
Task Files
```

These are different ways into the same task resource space:

- Execution Status groups tasks by current work state.
- Task Type groups tasks by project, scheduled, event-triggered, and other task
  classifications.
- Task Files shows the current selected task's file tree.

Selection rules:

- selecting a task changes the current task and shows that task in the main
  workspace;
- selecting a task also changes Task Files to that task's file tree;
- selecting a file keeps the current task and shows the file in the main
  workspace;
- selecting a file that belongs to a different task switches both current task
  and selected file;
- the right AI panel follows the current task and may additionally reference
  the selected file.

The Task Files group should not show all task folders at once by default. It
should show the file tree for the current task, so the explorer stays usable.

### Create Task Action

The new-task action belongs in the Task Resource Explorer header, not in the
main workspace header.

Recommended placement:

```text
Tasks        +
```

The `+` action can open the normal task creation flow. Task type should be
chosen inside that flow rather than expanded into Zone 1 navigation.

If creating a task automatically selects the new task while a file has unsaved
changes, the same unsaved-change guard used for task switching should apply.

## Selected Object Workspace

The third column should be object-driven. It changes based on what the user
selects in the resource explorer.

Object states:

```text
Task list selected -> task-list workspace
Task selected      -> task-management workspace
File selected      -> file editor / preview workspace
```

This avoids treating task management and file editing as separate pages while
still keeping their interactions distinct.

### Task List Header

When the selected object is the task list, the top views should be:

- Default Sort
- All List
- Timeline

These replace the less clear `Priority Lane / List / Timeline` wording.

Intended semantics:

- **Default Sort** answers "what should I look at first?" It uses Taskplane's
  default ordering and priority signals without exposing an internal lane model.
- **All List** answers "what tasks do I have?" It is the stable full task list.
- **Timeline** answers "what changed recently?" It shows task activity over
  time.

The previous `Priority Lane` name should not remain user-facing in v1. Priority
lane can remain an internal model or explanation detail where useful, but the
primary tab should describe the user-visible behavior.

### Task Header

When a concrete task is selected, the main workspace should show the task
management and execution surface. Suggested task-level views:

```text
Overview
Run
Timeline
```

Overview covers task status, summary, next step, blockers, dependencies,
subtasks, key files, and pending decisions.

Run covers structured Agent execution records: active run state, steps, output,
self-checks, failures, retry/recovery, and checkpoints. The right AI panel can
summarize or discuss execution, but the detailed execution record should remain
structured in the task workspace.

Timeline covers the task activity history.

### File Header

When a task file is selected, the main workspace header should switch to a file
header or file-tab surface. It replaces the task-list or task-level navigation
while the selected object is a file.

Recommended behavior:

- show the file name and path or breadcrumb;
- support preview/edit for text and Markdown;
- support save, rename, move, delete, and close where implemented;
- show a dirty indicator for unsaved changes;
- if the user switches task, switches file, closes the file, or returns to task
  management with unsaved changes, prompt to save, discard, or cancel.

This follows the same object-driven model as editors like VS Code and Obsidian:
the header belongs to the selected object.

## Tasks Page Filters

The left-side task filters should focus on high-signal retrieval.

Recommended v1 structure:

```text
All

Status
- Running
- Waiting
- Blocked
- Needs Decision
- Completed / Archived

Type
- Project
- Scheduled
- Event Triggered
```

In the updated Tasks workspace, these filters are expressed through the
Execution Status and Task Type explorer groups rather than as separate Zone 1
navigation.

Signals such as risk and long waiting age should not be first-level filters in
v1 unless real usage proves they are frequent retrieval paths.

Recommended treatment:

- risk appears as a task-row badge, sorting signal, or Brief priority cue;
- waiting age appears as a task-row badge or sorting signal inside Waiting;
- "committed" is not shown in v1 because the product does not yet have a clear
  commitment object, commitment owner, due-date workflow, or follow-up loop.

## Capability Navigation Naming

The distinction between external accounts/data and callable tools should remain
clear.

Recommended Zone 2 direction:

```text
External Access
Skills
MCP
Model
Work Habits
Settings
```

`External Access` is preferred over `Connections` for v1 because it better
describes what the page does: user authorization and access to external
accounts, data sources, or apps such as Gmail, Calendar, Slack, GitHub, or
Notion.

`MCP` can keep its current name. In the target audience and product context,
MCP is a recognizable capability name. It represents tool/server capability
registration, such as Playwright MCP or other MCP servers the Agent may call
under policy.

Boundary:

- External Access = authorize external accounts, apps, and data sources.
- MCP = register or manage MCP tool servers.
- Skills = local or packaged task capabilities.
- Model = provider/model configuration.
- Work Habits = cross-task behavior preferences and learned rules.

If one external service involves both account authorization and MCP tools, the
product should still treat them as distinct steps: authorize access in External
Access, then enable or configure callable tool capability through MCP or Skills.

## Discussion-To-Execution Workflow Assessment

The current manual testing discussion itself is a useful target workflow for
the redesigned Tasks workspace.

Hypothetical Taskplane flow:

1. The user starts a testing discussion.
2. The assistant suggests creating or binding a testing task once the discussion
   becomes durable work.
3. The assistant and user discuss product findings.
4. The assistant decides, or the user requests, that specific conclusions should
   become task output documents.
5. The generated documents are saved into the selected task's files and
   referenced from `Task.md`.
6. The user says the testing task can pause or close for now.
7. The assistant summarizes the phase, records a task handoff, and asks whether
   to decompose implementation work from the accepted documents.
8. If the user confirms, Taskplane creates a reviewed decomposition draft with
   implementation, verification, and acceptance tasks.
9. The user confirms real subtasks before execution begins.
10. Each implementation subtask reads the product principles, `Task.md`, task
    records, and linked design documents before running.

This flow should be supported without forcing the user to move across multiple
top-level pages:

- the discussion happens in the right AI panel;
- the active testing task is selected in the Task Resource Explorer;
- generated documents appear under Task Files for that task;
- task state, phase closeout, and follow-up decomposition happen in the task
  management workspace;
- detailed execution records appear under the selected task's Run view;
- later implementation subtasks appear under Tasks, not as disconnected chat
  history.

Current design coverage:

- task capture and task binding are directionally supported by the right panel;
- task files and task records are covered by the task-folder design;
- project decomposition and confirmation are already part of the product
  direction;
- runs, decisions, artifacts, timelines, and completion checks provide the
  execution and audit substrate.

Gaps to close:

- the assistant needs a rule for suggesting task creation or binding when a
  conversation becomes durable work;
- the assistant needs a routing rule for whether new information should update
  `Task.md`, create a `Task Records/` entry, create a task document, create a
  Decision, or become a Work Habit proposal;
- phase closeout should become an explicit task action that summarizes outputs,
  records unresolved questions, and asks whether to decompose follow-up work;
- generated follow-up tasks should keep links back to the source documents and
  handoff record that justified them.

For this testing pass, the expected product behavior is:

```text
discussion -> testing task -> task documents -> phase closeout ->
implementation decomposition -> confirmed subtasks -> execution and acceptance
```

This is a core validation path for the redesigned Tasks workspace.

## Acceptance Notes

- The `Priority Lane` tab is renamed to `Default Sort`.
- The list tab is named `All List`.
- Timeline remains as the activity-based view.
- Zone 1 / Work is reduced to Brief, Tasks, and Decisions.
- Context is removed as a first-level Zone 1 page after its responsibilities are
  split.
- Task Files is integrated into Tasks through the Task Resource Explorer and
  selected-object workspace.
- The Task Resource Explorer uses collapsible Execution Status, Task Type, and
  Task Files groups.
- New Task lives in the Task Resource Explorer header.
- The main workspace header is object-driven: task-list views, task-level
  views, or file header/tabs.
- Unsaved file edits block task/file/object switches until the user saves,
  discards, or cancels.
- Risk and waiting age are badges or ranking signals, not first-level filters
  by default.
- `Committed` is removed from v1 navigation/filtering until the commitment
  workflow is defined.
- `Connections` is renamed to `External Access`.
- `MCP` remains named `MCP`.
- Discussion-heavy testing work can become a task, produce task documents,
  close out with a handoff, and generate reviewed follow-up implementation
  subtasks without leaving the Tasks workspace.
