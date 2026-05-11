# Tasks Workspace Redesign Implementation Mapping

Date: 2026-05-11

Status: implementation mapping and residual-gap assessment.

This document maps the implementation work completed for the Tasks workspace
redesign against the three testing discussion notes:

- [NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md](NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md)
- [TASK_FILES_AND_AGENT_MEMORY_DESIGN.md](TASK_FILES_AND_AGENT_MEMORY_DESIGN.md)
- [CONTEXT_CLEAR_AND_NEW_CONVERSATION_DECISION.md](CONTEXT_CLEAR_AND_NEW_CONVERSATION_DECISION.md)

It also uses
[TASKS_WORKSPACE_REDESIGN_TASK_BREAKDOWN.md](TASKS_WORKSPACE_REDESIGN_TASK_BREAKDOWN.md)
as the execution checklist.

## Summary

The core v1 behavior described by the three optimization documents is now
implemented.

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

The remaining gaps are larger runtime or modeling work that still belongs to
the same product direction, but should be designed and accepted separately from
the completed v1 workspace adjustment.

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
| Task Resource Explorer has Execution Status, Task Type, Task Files | Done | Groups are collapsible and do not require a separate task/file mode switch. |
| New Task action belongs in Task Resource Explorer header | Done | Task creation is no longer in the third-column workspace header. |
| Task Files shows current selected task's file tree | Done | Switching tasks refreshes the Task Files group for that task. |
| Selected object controls third column | Done | Task list, concrete task, and file all have distinct workspace headers and bodies. |
| Task-list views are Default Sort, All List, Timeline | Done | `Priority Lane` was removed from user-facing tab naming. |
| Concrete task views are Overview, Run, Timeline | Done | Task management and execution records are available inside Tasks. |
| File view replaces task navigation with file header | Done | File header supports path/name display, dirty indicator, save, rename, move, delete, and return. |
| Unsaved file switching guard | Done | Switching file/task/task-management prompts Save / Discard / Cancel. |
| Risk and waiting age are not first-level filters | Done | They remain task signals rather than primary navigation groups. |
| Committed removed from v1 navigation/filtering | Done | Commitment is not exposed as a first-version filter. |
| Decisions remains approval queue, not priority board | Done | Decisions routes pending approvals back to task workspace. |
| Brief remains attention surface | Done | Brief continues to answer what needs attention now. |

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

The explicit v1 adjustments from the three optimization documents are
materially implemented.

The remaining work is not another round of layout cleanup. The next meaningful
product capability should be chosen deliberately from the remaining items
above, with the strongest candidate being a more complete agent-file-writing workflow:
multi-file proposals, diff review, overwrite policy, and stronger task-file
tool permissions.
