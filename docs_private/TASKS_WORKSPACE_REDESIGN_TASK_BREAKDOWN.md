# Tasks Workspace Redesign Task Breakdown

Date: 2026-05-11

Status: implementation planning draft; not an implementation record.

This task breakdown turns the current manual testing decisions into a reviewed
implementation plan. It is based on:

- [NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md](NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md)
- [TASK_FILES_AND_AGENT_MEMORY_DESIGN.md](TASK_FILES_AND_AGENT_MEMORY_DESIGN.md)
- [CONTEXT_CLEAR_AND_NEW_CONVERSATION_DECISION.md](CONTEXT_CLEAR_AND_NEW_CONVERSATION_DECISION.md)

## Parent Task

Redesign Taskplane's task workspace so task management, task execution, task
files, and task conversation work together in one Tasks surface.

## Target Outcome

After the redesign:

- Zone 1 contains Brief, Tasks, and Decisions.
- Context is no longer a first-level page.
- Work Habits is a first-level Zone 2 capability page.
- Connections is renamed External Access.
- Tasks becomes the unified task workspace.
- The second column is a Task Resource Explorer with Execution Status, Task
  Type, and Task Files groups.
- The third column is object-driven: task list, task management, or file
  editor/preview.
- The right AI panel remains the conversation and command entry.
- Context-clear handoffs can be preserved into task memory once the task-file
  model exists.

## Implementation Slices

### 1. Navigation Shell Simplification

Goal: align the app shell with the new Zone 1 / Zone 2 model.

Scope:

- Remove Context as a first-level Zone 1 page.
- Keep Zone 1 as Brief, Tasks, Decisions.
- Add or expose Work Habits as a first-level Zone 2 page.
- Rename Connections to External Access.
- Keep MCP named MCP.
- Keep Settings, Model, and Skills in Zone 2.

Acceptance:

- The sidebar no longer shows Context as a primary Work entry.
- Work Habits is reachable from Capabilities.
- External Access naming is visible wherever the old Connections entry was
  used.
- Existing routes do not strand users on removed navigation entries.
- Tests cover route labels and basic navigation.

### 2. Tasks Resource Explorer

Goal: make the second column a unified task resource explorer instead of a
mode-switching sidebar.

Scope:

- Add a Tasks explorer header with a New Task action.
- Move New Task out of the third-column workspace header.
- Add collapsible groups:
  - Execution Status
  - Task Type
  - Task Files
- Execution Status groups tasks by current state.
- Task Type groups tasks by task classification.
- Task Files shows the current selected task's file tree.
- Selecting a task updates the current task and refreshes Task Files.
- Selecting a file keeps or changes current task based on file ownership.

Acceptance:

- Users can select tasks through Execution Status or Task Type.
- Selecting a task changes the third column to the task workspace.
- The Task Files group follows the selected task.
- The explorer does not require a separate task/file mode switch.
- New Task opens from the explorer header.

### 3. Selected Object Workspace

Goal: make the third column switch based on selected object type.

Scope:

- Introduce a selected-object state model:
  - task list
  - concrete task
  - task file
- Task-list state shows Default Sort, All List, and Timeline.
- Concrete-task state shows task-level views:
  - Overview
  - Run
  - Timeline
- File state shows a file header or file tabs, replacing task-list/task-level
  navigation.
- Preserve right-panel task binding when switching between task and file views
  for the same task.

Acceptance:

- Task-list header does not appear while a file is selected.
- File header/tabs do not appear while a task list or task overview is selected.
- Selecting a file opens file preview/editing in the third column.
- Selecting a task returns to task management without losing task context.
- UI copy no longer exposes Priority Lane as the primary tab label.

### 4. Task File Workspace V1

Goal: provide a minimal file workspace inside Tasks.

Scope:

- Represent each task as a logical task folder.
- Ensure every task has a primary task record surface:
  - `Task.md` in the UI, even if backed by another storage shape.
- Ensure every task has a `Task Records/` place for durable records.
- Do not create a default `outputs/` folder.
- Project existing Source Context and Artifact records into the file workspace
  as file-like entries.
- Keep Timeline as activity/audit data, not a default file.
- Support basic file operations for text and Markdown:
  - open
  - preview
  - edit
  - create file
  - create folder
  - rename
  - move
  - delete
  - search

Acceptance:

- Selecting Task Files for a task shows `Task.md` and `Task Records/`.
- Existing task sources and artifacts can be surfaced as file-like items.
- Users can edit plain text or Markdown file content.
- File edits do not silently change task state unless the task record itself is
  updated through the intended path.
- Non-text files are listed without requiring full inline editing in v1.

### 5. Unsaved File Switching Guard

Goal: protect user edits when moving between tasks, files, and task management.

Scope:

- Track dirty state for editable files.
- Trigger a prompt when a dirty file would be closed or replaced by:
  - selecting another file;
  - selecting another task;
  - returning to task management;
  - creating and auto-selecting a new task;
  - closing a file tab.
- Prompt options:
  - Save
  - Discard
  - Cancel

Acceptance:

- Save persists changes and continues the requested switch.
- Discard drops changes and continues the requested switch.
- Cancel preserves the current file and aborts the switch.
- Dirty indicators are visible in the file header or tab.

### 6. Task Memory Model And Agent Principles

Goal: define the product-owned rules that govern Agent task-file reading and
writing.

Scope:

- Add a product-level Agent principles source.
- Make the principles source read-only to Agents.
- Include task-file reading order:
  - product principles;
  - `Task.md`;
  - relevant `Task Records/`;
  - referenced or selected working files.
- Include writing rules:
  - update `Task.md` when durable task state changes;
  - create `Task Records/` entries for meaningful handoffs, decisions, failure
    reviews, phase closeouts, or context-clear archives;
  - do not write full chat transcripts by default;
  - do not write cross-task preferences into task files.

Acceptance:

- Agent execution context can include the principles source.
- Agent cannot modify the principles source through ordinary task execution.
- The read/write rules are reflected in prompts or execution preparation where
  task-file access is used.

### 7. Context Clear Handoff Preservation

Goal: connect right-panel context clearing to durable task memory.

Scope:

- Keep automatic context clearing separate from user-initiated new conversation.
- Extract a specific handoff before automatic clearing.
- Reject or delay clearing when the handoff is generic.
- Persist accepted handoffs to the task memory surface once available.
- Preserve concrete technical progress, candidates, rejected options,
  unresolved questions, and next actions.

Acceptance:

- Automatic clearing does not proceed with a generic handoff.
- Manual clearing archives before clearing.
- New conversation starts unbound or explicitly rebound, not as a fake
  continuation.
- A Playwright-style discussion preserves named candidates and next comparison
  work.

### 8. Discussion-To-Execution Workflow

Goal: support discussion-heavy work becoming tasks, documents, phase closeout,
and implementation subtasks.

Scope:

- Add assistant guidance for suggesting task creation or binding when a
  conversation becomes durable work.
- Add routing rules for deciding whether information becomes:
  - `Task.md` update;
  - `Task Records/` entry;
  - task document;
  - Decision;
  - Work Habit proposal.
- Add a task phase-closeout action:
  - summarize produced documents;
  - record unresolved questions;
  - create a handoff;
  - ask whether to decompose follow-up work.
- Generate reviewed follow-up implementation tasks from accepted documents.
- Require user confirmation before creating real subtasks.

Acceptance:

- A testing discussion can become a task.
- The task can produce multiple design documents.
- The task can be closed or paused with a handoff.
- The assistant can propose implementation subtasks linked to source documents.
- Subtasks are not created until user confirmation.

### 9. Decisions And Brief Boundary

Goal: keep Decisions and Brief distinct after the Tasks redesign.

Scope:

- Brief remains the cross-task priority and attention surface.
- Decisions remains the cross-task approval queue.
- Decisions should focus on pending approvals, checkpoint confirmations,
  high-risk operations, patch promotion, or external writes.
- Do not turn Decisions into a generic task priority board.

Acceptance:

- Brief answers "what should I pay attention to now?"
- Decisions answers "what is waiting for my approval or rejection?"
- Pending decision entries route back to the relevant task workspace.

### 10. Verification And Acceptance Coverage

Goal: make the redesign testable before treating it as accepted.

Scope:

- Update renderer tests for sidebar navigation labels.
- Add Tasks workspace tests for:
  - explorer groups;
  - selected-object switching;
  - task-to-file linkage;
  - file-to-task context preservation;
  - dirty file guard;
  - New Task placement.
- Add task-file model tests for:
  - default `Task.md`;
  - `Task Records/`;
  - projected sources/artifacts;
  - no default `outputs/`.
- Add right-panel handoff tests for:
  - specific vs generic handoff;
  - new conversation semantics;
  - task-binding chip semantics.
- Update manual acceptance checklist.

Acceptance:

- `npm run verify` passes.
- Focused renderer/domain tests cover the new layout behavior.
- Manual alpha walkthrough covers discussion -> task -> documents -> closeout
  -> implementation decomposition.

## Suggested Execution Order

1. Navigation shell simplification.
2. Work Habits and External Access naming.
3. Tasks selected-object state model.
4. Task Resource Explorer.
5. Task workspace Overview / Run / Timeline split.
6. Task file workspace V1.
7. Dirty-file guard.
8. Agent principles and task memory prompts.
9. Context-clear handoff persistence.
10. Discussion-to-execution closeout and decomposition.
11. Decisions / Brief boundary polish.
12. Verification and manual acceptance update.

## Open Sequencing Questions

- Should the first implementation use virtual task files backed by existing
  database records, or create real filesystem-backed task folders immediately?
- Should Work Habits be split before or after the Tasks workspace redesign?
- Should context-clear handoff persistence wait for `Task Records/`, or first
  write to an interim source/artifact record?
- Should file tabs be included in v1, or should v1 use a single active file
  header with dirty-state protection?
- Should projected Source Context and Artifact entries be read-only in the first
  slice, then become editable later?
