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

[BRIEF_RECOMMENDATION_RANKING_DESIGN.md](BRIEF_RECOMMENDATION_RANKING_DESIGN.md)
defines the product-level rules for how Brief chooses, ranks, and displays task
recommendations. This document only summarizes the navigation relationship.

[COMPOSITE_TASK_TYPE_FRAMEWORK_DESIGN.md](COMPOSITE_TASK_TYPE_FRAMEWORK_DESIGN.md)
defines how tasks can combine multiple task-type behaviors through a primary
type plus type facets. This document should use that framework when describing
task-type navigation.

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

User-facing task types include one-off, project, scheduled, event-triggered, and
routine tasks. Routine tasks cover long-lived work such as knowledge-base
maintenance, note organization, ongoing operations, and other persistent
responsibilities that are not tied to a fixed schedule or a single completion
event.

Some tasks may be composite, such as routine information tracking that is also
scheduled and event-triggered. The Tasks explorer should still group by one
primary type by default. Additional task-type facets should influence behavior
and detail display without duplicating the same task across every visible type
group.

### Brief Recommendation Display Rules

Brief is an attention surface, not a project tree or another task-management
view. It should show the most actionable task node, explain why now, and keep
parent/child/project context lightweight. The detailed ranking, parent-child
deduplication, dependency-chain, time-aware, progress-aware, and habit-aware
rules live in
[BRIEF_RECOMMENDATION_RANKING_DESIGN.md](BRIEF_RECOMMENDATION_RANKING_DESIGN.md).

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
Execution Queue
Task Type
Task Files
```

These are different ways into the same task resource space:

- Execution Queue groups tasks by actionability and current execution state. It
  is an execution view, not just a property filter.
- Task Type groups tasks by project, scheduled, event-triggered, and other task
  classifications. It is the task's structural classification and retrieval
  path.
- Task Files shows the current selected task's file tree.

The distinction is important:

- Task Type answers "what kind of task is this, and where would I file it?"
- Execution Queue answers "what can or should be acted on now?"

This mirrors mature task managers that separate structural organization from
execution views. Projects, areas, labels, or issue types provide context and
retrieval; today lists, filters, active views, blocked views, and saved views
provide execution focus.

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

- 优先处理
- 任务目录
- 活动记录

These replace the less clear `Priority Lane / List / Timeline` wording. V1
should use Chinese user-facing labels consistently; English labels may be
reintroduced later as a product-wide localization pass.

Intended semantics:

- **优先处理** answers "what should I act on first?" It is an
  execution queue. It should show the most actionable nodes, usually subtasks,
  with parent/project context as secondary information. A parent project should
  appear here only when the parent itself needs action, such as decomposition,
  clarification, a decision, or a blocker.
- **任务目录** answers "what tasks do I have and how are they structured?" It is
  a directory view. It should group by parent/root task and show child tasks
  underneath, rather than flattening parent and child tasks into one list.
- **活动记录** answers "what changed recently?" It shows task activity over
  time.

The previous `Priority Lane` name should not remain user-facing in v1. Priority
lane can remain an internal model or explanation detail where useful, but the
primary tab should describe the user-visible behavior.

The previous `全部列表` name is too broad after the Task Files merge. `任务目录`
better signals that the view is a structured task directory, not another
execution recommendation list.

### Execution Queue Sorting And Layout

The `优先处理` view should not be a decorative grouping of lane labels. It should
behave like an action queue. Mature products provide the reference pattern:
Today / Upcoming / My Tasks / Active Issues views combine date, priority,
status, project context, and manual order into a focused list. Taskplane should
use the same idea, but explain the recommendation in task language. It should
also follow the same recommendation philosophy as
[BRIEF_RECOMMENDATION_RANKING_DESIGN.md](BRIEF_RECOMMENDATION_RANKING_DESIGN.md):
actionability comes before abstract priority, and parent/child duplicates should
be collapsed unless the parent has its own distinct action.

Recommended v1 ordering:

1. User decision or approval that can unlock work.
2. A task that can unblock downstream work.
3. A task with a clear next step and no active blocker.
4. A task that needs clarification before execution.
5. A task waiting on external input or timing.

Within the same actionability band, use these tie-breakers:

- time pressure: due today, overdue, scheduled/event trigger reached,
  scheduled/event tasks, or recently surfaced work;
- impact: number of downstream tasks blocked, task risk, and parent/project
  priority;
- user intent: manual order changes, recent opens, recent right-panel
  discussion, and learned work habits;
- fallback: updated time, then created time.

V1 should implement the available subset honestly: actionability first, then
scheduled/event signals, recent update/create time, lane, and updated time.
Richer calendar ordering such as due date, start date, duration, or remaining
time requires explicit task fields before it becomes a user-facing promise.

The queue row should be more informative than the directory row:

```text
[1] Task title
    Status color block
    Parent/project context above the title
    Recommendation reason + next step
    Primary action
```

Do not make the queue look like a full project directory. It should display the
next actionable node and enough context to explain why it appears here. Avoid
repeating lane/status tags when the selected Execution Queue lens already
communicates the state. Use compact visual status markers for scanability and
put parent/project context before the title so users can orient before reading
the task name.

### Task Header

When a concrete task is selected, the main workspace should show the task
management surface and its task-local history. First-version task-level views:

```text
Task Management
Timeline
```

Task Management covers identity, progress, next step, blockers, dependencies,
subtasks, completion criteria, compact context, key files, and pending
decisions. This is the default view every time a task is selected.

Timeline covers the task activity history for the selected task. Do not expose
`Run` as a first-version task-level tab; structured execution belongs in the
Workbench, with task-local summaries or links surfaced here when useful.

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

## Tasks Page Filters And Lists

The left-side task filters should focus on high-signal retrieval, but they
should not collapse task classification and execution focus into the same
mental model.

Recommended v1 structure:

```text
Execution Queue
- 当前建议
- 推进中
- 等待中
- 有阻塞
- 待拍板
- 已完成 / 已归档

Task Type
- 一次性任务
- 项目型
- 定时任务
- 事件触发
- 常设任务
- 复合任务
```

In the updated Tasks workspace, these filters are expressed through the
Execution Queue and Task Type explorer groups rather than as separate Zone 1
navigation.

`All Tasks` should not be a child of Execution Queue because it is not an
execution state. The full task inventory belongs to the `任务目录` view in the
third column.

Display rules:

- selecting an Execution Queue item defaults the third column to `优先处理` and
  shows a queue of actionable task nodes;
- `推进中` is a product-level executable view, not a raw `running` database
  state. It includes tasks that are running or have a clear next step without an
  active blocker or waiting condition. Its count should match the actionable
  queue nodes shown in the third column, not double-count parent and child tasks
  when the child task is the actual executable node.
- selecting a Task Type item defaults the third column to `任务目录` and shows
  parent/root tasks with child tasks nested under them;
- selecting a concrete task still opens the task-management workspace;
- switching between task-list views does not change the current task unless the
  user selects a task row.

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
- detailed execution records remain available through the task workbench and
  selected task timeline, not through a first-version `Run` tab;
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

## Task Detail Workspace Layout

The selected-task workspace should borrow from mature task-management products
before adding Taskplane-specific AI and task-file behavior.

### Research Scope

The Tasks workspace is a core product surface, so its default layout should be
derived from mature task-management behavior before adding Taskplane-specific
AI behavior.

Reference sources checked during design:

- Todoist task view and compact task workflow:
  <https://todoist.com/help/articles/use-the-task-view-to-manage-tasks-in-todoist>
- Todoist new task view notes:
  <https://www.todoist.com/inspiration/todoist-new-task-view>
- Asana task dependencies:
  <https://help.asana.com/s/article/task-dependencies>
- Asana task types and follow-up/subtask behavior:
  <https://help.asana.com/s/article/different-types-of-tasks>
- Linear issue assignment and activity:
  <https://linear.app/docs/assigning-issues>
- ClickUp task view overview:
  <https://help.clickup.com/hc/en-us/articles/10552031987735-Task-View-3-0-overview>

### Mature Product Observations

#### Todoist

Todoist's strength is low-friction task capture and lightweight task detail.
The product keeps the task surface compact: task title and immediate properties
remain primary; comments, attachments, activity, and subtasks exist but should
not overwhelm the user's next action.

Useful principles for Taskplane:

- keep the default selected-task surface fast to scan;
- let simple tasks remain simple;
- avoid making every task look like a project management dossier;
- support compact/narrow layouts without losing the task's next action.

Taskplane should not copy Todoist's minimalism completely, because Taskplane
tasks also need task files, AI workbench access, records, and verification
signals.

#### Asana

Asana's strength is structured collaborative work. Its task model makes
dependencies, blockers, subtasks, followers/collaborators, and project context
visible. Its dependency model distinguishes "blocked by" and "blocking" so
users can understand sequencing and responsibility.

Useful principles for Taskplane:

- expose blockers and dependencies as first-class task-management signals;
- treat subtasks as structured work, not just indented text;
- keep project structure visible where it affects execution;
- separate task management fields from discussion/history.

Taskplane should not fully copy Asana's team-collaboration density in v1,
because Taskplane is currently optimized for an AI-assisted personal/agentic
workflow rather than a full team workspace.

#### Linear

Linear's strength is a restrained issue detail surface. It keeps status,
assignment, labels, project metadata, and activity legible without turning the
issue page into a heavy dashboard. Activity is important, but it is not the
main editing surface.

Useful principles for Taskplane:

- make status/type/priority signals compact and consistent;
- preserve a quiet issue/task detail feel;
- put activity in a readable history surface rather than forcing users to
  manage the task through raw logs;
- keep agent/delegation state close to the issue when it affects ownership.

Taskplane should adapt Linear's restraint, but add more explicit task files and
AI workbench entry because Taskplane's core workflow includes AI-generated
records and artifacts.

#### ClickUp

ClickUp's strength is completeness. Its task view can include fields,
description, attachments, subtasks, action items, comments, activity,
relationships, integrations, and AI-assisted task behavior. This proves that a
task can become the container for many work objects, but it also creates a v1
complexity risk.

Useful principles for Taskplane:

- task files, sources, artifacts, and execution records can legitimately live
  under the task;
- activity and comments/history need a clear place;
- relationships/integrations should be visible when they affect the current
  task;
- sections may be collapsible or progressively disclosed.

Taskplane should not copy ClickUp's surface area wholesale. ClickUp is a
capability reference, not the default density target.

### Product Logic Synthesized From Mature Tools

Across the mature tools, task management has a stable workflow:

1. Capture or select a task.
2. Understand what the task is.
3. Understand why it matters now and whether anything blocks it.
4. Decide the next action.
5. If the task is large, break it into structured work.
6. Attach or inspect context needed for execution.
7. Execute, update state, and preserve history.
8. Return to the task list with the task's state clearer than before.

The product surface should therefore answer four questions in order:

1. What is this task?
2. What should happen next?
3. What structure or context is needed to do it?
4. What has already happened?

This ordering is more important than copying a specific UI from Todoist,
Asana, Linear, or ClickUp.

### Base Functional Skeleton

The mature baseline for a selected task is:

```text
Task Detail
  Identity
  Progression
  Structure
  Context
  History
```

Definitions:

- Identity: title, type, state, lane/priority, parent/project relationship.
- Progression: next step, blocker, waiting state, decision need, primary action.
- Structure: subtasks, dependencies, checklists, completion criteria,
  decomposition state.
- Context: notes, sources, files, artifacts, links, attachments, task summary.
- History: comments, activity, state transitions, execution summaries.

This skeleton is the default product logic. It should exist before AI-specific
features are introduced.

### Base Layout Skeleton

The selected-task workspace should use a three-area relationship:

```text
Zone 1: product navigation
Zone 2: task resource explorer
Zone 3: selected object workspace
Zone 4: global AI discussion panel
```

For the Tasks page:

- Zone 2 is not a mode switch. It is a resource explorer containing task
  filters, task-type groupings, and the selected task's file tree.
- Zone 3 changes by selected object:
  - selecting a task shows Task Management or Timeline;
  - selecting a file shows the file editor/preview;
  - selecting a task-list lens shows task list views.
- Zone 4 remains the global AI discussion entry and should not be duplicated
  inside the task detail layout.

Task Management layout:

```text
Header / tabs: Task Management | Timeline

Identity
  title
  type/state/lane/parent signals

Progression
  why now
  next step
  waiting/blocker/decision signal
  primary action
  secondary actions

Structure
  project decomposition or child progress
  completion criteria/checks
  schedule/trigger for non-manual tasks

Context
  Task.md / task summary
  task files
  sources
  artifacts

History
  short recent activity preview
```

Timeline layout:

```text
Identity summary
Task-local activity stream
Run and state summaries when present
```

File layout:

```text
File header
Path / dirty state / actions
Editor or read-only preview
```

### Taskplane-Specific Extension Rules

Taskplane should combine the reference products as:

- Todoist's lightness;
- Linear's restraint;
- Asana's structure for projects and dependencies;
- only selective ClickUp-style completeness where task files, artifacts, and
  execution evidence genuinely need a surface.

Taskplane-specific features should extend the base skeleton as follows:

- AI planning belongs in Progression because it helps decide the next action.
- AI project decomposition belongs in Structure because it creates task
  structure.
- Task files belong in Context because they are durable task context and work
  products.
- Source contexts and artifacts belong in Context, projected as task files when
  useful.
- Execution runs belong in History and Workbench, not as a default v1 task
  detail tab.
- Decisions belong in Progression when they block the task, and in the
  Decisions page when they need cross-task prioritization.
- Agent operating principles are not task content. They remain product-level
  read-only execution rules.

This means Taskplane does not add features by creating more top-level pages or
task-level tabs first. It adds features by asking which mature task-management
layer the capability belongs to.

The selected-task workspace uses two task-level tabs:

```text
Task Management / Activity Log
```

In Chinese UI:

```text
任务管理 / 活动记录
```

Do not expose `Run` as a task-level tab in v1. `Run` is an internal execution
record concept. Execution should be reached through the task workbench, while
the selected task Activity Log shows task-local changes and execution events.

### Task Management Skeleton

The default selected-task tab is always Task Management. Switching to another
task returns to Task Management, even if the previous task was on Activity Log.

The page should be organized as a mature task detail surface:

1. Identity layer
   - title;
   - task type;
   - status / lane / risk signals;
   - project or parent-task relationship.
2. Progression layer
   - next step;
   - waiting, blocked, or decision state;
   - main action: choose the single next action for the current stage;
   - secondary actions: plan, defer, complete, more.
3. Structure layer
   - project tasks: child tasks, decomposition draft, progress;
   - simple tasks: completion criteria and checks;
   - scheduled/event tasks: cadence or trigger condition.
4. Task file access
   - task files remain visible in the Task Files resource explorer;
   - Task Management should not duplicate that file tree.
5. Activity history
   - full current-task history belongs in the Activity Log tab;
   - Task Management should not embed a repeated activity preview.

The Task Management tab answers: "what is this task, and how should I move it
forward now?"

The Activity Log tab answers: "what has happened inside this task?"

For a newly created project task with no child tasks and no decomposition draft,
Task Management should behave like a task empty state:

- use user-facing status language such as `待明确`, `项目型`, and `未开始`
  instead of internal labels such as `Clarify` or `Idle`;
- make the primary action open the task-bound AI panel and start the
  decomposition discussion there;
- explain that the AI-panel discussion comes before creating real child tasks
  and completion criteria;
- keep defer, complete, and more actions visually secondary;
- show project structure as the expected result area, not as the main action.

### Task Example Layouts

The five-layer skeleton should be validated against concrete task examples
before the implementation is treated as final.

#### Example A: One-Off Task With No Files

Example:

```text
Task: Reply to vendor pricing email
Type: one-off
State: waiting / running
Files: none
```

Expected layout:

1. Identity
   - task title;
   - one-off task type;
   - current state and lane;
   - no project metadata unless it belongs to a parent.
2. Progression
   - next step is the main content after the title;
   - waiting/blocker/decision state appears only if present;
   - primary action should be "plan" or "open workbench" depending on whether
     the next step is clear;
   - defer, complete, and more are secondary controls.
3. Structure
   - collapse or show a light empty state when there are no completion
     criteria;
   - do not force a project-style structure onto a simple task.
4. Context
   - show a compact empty state: no task files yet;
   - `Task.md` remains accessible from the file tree, but the task detail does
     not need to duplicate empty file content.
5. History
   - show only the latest 1-3 human-readable events;
   - if there is no history, this section should be visually quiet.

Design rule:

For simple tasks, Task Management should feel closer to Todoist/Linear than
Asana/ClickUp. It should not look heavy just because Taskplane has powerful
AI and file capabilities.

#### Example B: Project Task With Child Tasks

Example:

```text
Task: Launch mini program MVP
Type: project
State: running
Files: Task.md, Task Records/, product notes, design notes
Children: several child tasks
```

Expected layout:

1. Identity
   - project title;
   - project task type;
   - current project state;
   - project/parent relationship if nested later, though v1 should avoid deep
     hierarchy.
2. Progression
   - show the current project-level next step;
   - if the project needs decomposition, make the decomposition action primary;
   - if child tasks already exist, make "open workbench" or "continue planning"
     primary depending on whether execution has begun.
3. Structure
   - child task progress is important and should be visible;
   - decomposition draft belongs here, not in Context or History;
   - child tasks should be summarized in Task Management, while detailed
     browsing remains available in Zone 2 and list views.
4. Context
   - show important files and sources that explain the project;
   - show artifacts only as a compact summary unless the user selects a file.
5. History
   - show recent project-level changes;
   - full child-task execution history should remain on each child task, not
     flood the parent project detail.

Design rule:

For project tasks, Asana-style structure matters, but ClickUp-style density
should still be avoided. The user should understand project progress and the
next structural action without scrolling through every child detail.

#### Example C: Coding / Agent Task With Files And Records

Example:

```text
Task: Redesign task management detail layout
Type: project or one-off depending on scope
State: running
Files: Task.md, Task Records/, implementation mapping, source files, artifacts
Agent work: discussion, document generation, implementation, verification
```

Expected layout:

1. Identity
   - task title;
   - task type;
   - current execution state;
   - any parent/project relationship.
2. Progression
   - next action should be explicit: discuss design, update docs, implement,
     verify, or close phase;
   - if a decision is needed, "go to decision" becomes primary;
   - if execution is ready, "open workbench" becomes primary.
3. Structure
   - completion criteria and verification checks are important;
   - if this is a project, show child task progress;
   - if this is a one-off coding task, avoid fake child structure and rely on
     completion criteria plus task records.
4. Context
   - this is where Taskplane differs most from standard task tools;
   - show `Task.md`, Task Records, important files, sources, and artifacts as
     task context;
   - do not duplicate the full file editor in Task Management;
   - selecting any concrete file in Zone 2 should switch Zone 3 to file view.
5. History
   - show recent readable events;
   - full execution logs and run details remain in the workbench or timeline;
   - phase closeout and handoff records should be discoverable through Task
     Records.

Design rule:

For coding/agent tasks, Taskplane should feel like a task manager connected to
a workbench and task folder, not like a terminal clone inside the task detail.

### Section Visibility Rules

Default v1 behavior should be:

- Identity is always visible.
- Progression is always visible and should be visually prominent.
- Structure is visible when it contains project progress, completion criteria,
  schedule/trigger settings, or meaningful decomposition state; otherwise it
  can collapse to a subtle prompt.
- Context is visible when files, sources, artifacts, or important records exist;
  otherwise it should remain compact.
- History is visible but compact; full history belongs in Timeline.

Empty sections should not compete with real task information. They may show a
small prompt only when that prompt helps the task move forward.

### Action Priority Rules

Primary action order:

1. If a decision blocks progress: `Go to Decision`.
2. If project decomposition is needed: `Generate / Review Decomposition`.
3. If the task has a clear next execution step: `Open Workbench`.
4. If the task needs clarification: `Plan`.

Secondary actions:

- defer;
- complete;
- more actions;
- dependency resolution when dependency-ready.

Do not make all actions visually equal. The selected task should always have a
clear next primary action.

### Layout Principles

- The task detail should feel like a structured task-management page, not a
  log viewer or an AI control console.
- Use section headings, compact rows, and subtle dividers before introducing
  heavy cards.
- Highlight only urgent or decision-driving information, such as blockers,
  waiting states, missing decisions, and next-step actions.
- Task files are opened from the Task Files tree as their own selected-object
  file view; Task Management should not repeat the nearby file tree.
- Activity should not dominate Task Management. Keep the full activity stream
  in Activity Log.
- AI appears through task actions: plan, decompose, execute in workbench,
  summarize, record, and propose file writes. AI should not become its own
  visual layer competing with task management.

## Acceptance Notes

- The `Priority Lane` tab is renamed to `优先处理`; it is the
  actionability-ranked execution queue.
- The list tab is named `任务目录` and renders parent/child structure instead of
  a flat duplicate of the default queue.
- `活动记录` is the activity-based view.
- Zone 1 / Work is reduced to Brief, Tasks, and Decisions.
- Context is removed as a first-level Zone 1 page after its responsibilities are
  split.
- Task Files is integrated into Tasks through the Task Resource Explorer and
  selected-object workspace.
- The Task Resource Explorer uses collapsible Execution Queue, Task Type, and
  Task Files groups.
- New Task lives in the Task Resource Explorer header.
- The main workspace header is object-driven: task-list views, task-level
  `任务管理 / 活动记录` tabs, or file header/tabs.
- Selected tasks default to Task Management. Switching between concrete tasks
  resets the selected-task tab to Task Management.
- `Run` is not exposed as a first-version task-level tab; execution records are
  reached through the task workbench and summarized in task history surfaces.
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
