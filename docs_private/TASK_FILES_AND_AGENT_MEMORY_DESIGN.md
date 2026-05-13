# Task Files And Agent Memory Design

Date: 2026-05-11

Status: testing discussion design note; not an implementation record.

This note records the product design direction that emerged during manual
alpha testing after the Context page and right-panel conversation discussions.
It is intended to guide later implementation after the current testing pass is
complete.

## Relationship To Context Clear Decision

[CONTEXT_CLEAR_AND_NEW_CONVERSATION_DECISION.md](CONTEXT_CLEAR_AND_NEW_CONVERSATION_DECISION.md)
defines a local decision about the right-panel conversation model:

- automatic context clearing continues the same task conversation;
- user-initiated new conversation starts a new free conversation space;
- clearing is only safe after a specific enough handoff has been archived.

This document is broader. It defines where those handoffs and other durable
task records should live, how Agents should read and write task memory, and how
the current Context page responsibilities should be split.

The context-clear decision should become one input into this design:

- a safe context-clear handoff should be written into the task's memory surface;
- a generic handoff should not be enough to clear conversation context;
- new conversations should not pretend to continue the old task, but they may
  later read the task files if the user explicitly binds or mentions that task.

## Problem

The current Context page mixes two different memory concepts:

1. task-related memory and files;
2. cross-task work habits.

These have different lifecycles and product meanings. Task memory belongs to a
specific task and helps the Agent resume, execute, and explain that task.
Work habits are long-lived execution preferences or patterns that may apply
across tasks.

Manual testing also showed that task execution produces many durable records:
summaries, handoffs, decisions, source material, generated artifacts, failure
analysis, and user corrections. Current storage already has tasks, source
contexts, artifacts, runs, decisions, timelines, and work habits, but there is
not yet a simple task-folder model that tells the Agent exactly where to read
and write task memory.

## Navigation Direction

Keep the existing two-zone navigation model.

Zone 1 / Work should contain task work surfaces:

- Brief
- Tasks
- Decisions

The current Context page should not remain as a first-level page. Its
task-file responsibility moves into Tasks as part of the task resource
workspace. Its work-habit responsibility moves into Work Habits in Zone 2.

Zone 2 / Capabilities should contain cross-task capabilities and configuration:

- External Access
- Skills
- MCP
- Model
- Work Habits
- Settings

Work Habits should become a first-level entry in Zone 2. It is an AI behavior
and preference capability, not a task work surface.

This document focuses on the task-file and Agent-memory model. The integrated
Tasks layout is recorded in
[NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md](NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md).

## Task Folder Model

Each task owns a logical task folder.

The task folder has two conceptual parts, but the UI does not need to expose
them as rigid sections:

1. task-related memory files;
2. task working files and output files.

The task-related memory surface must be simple and rule-governed. It primarily
serves Agent reading and writing. Human editing is supported, but it is a
secondary priority compared with clear Agent recovery.

The working/output area should remain flexible. The Agent and user may create
files and folders according to the task type. A coding task may naturally create
`src/`, `tests/`, or patch files. A research task may create `report.md` or
`sources.csv`. A design task may create `assets/` or draft files.

Taskplane should not require a default `outputs/` folder in v1. The Agent may
create an `outputs/`, `reports/`, `drafts/`, `assets/`, `evidence/`, or similar
folder only when the task or user instruction makes that structure useful.

## Default Task Folder Surface

The minimal required task-memory surface is:

```text
Task.md
Task Records/
```

Everything else in the folder is an open task workspace.

### Task.md

`Task.md` is the task's primary recovery file. The Agent must read it before
task execution and update it when durable task state changes.

Recommended structure:

```md
# Task

## Goal

## Current Progress

## Key Context

## Decisions

## Constraints

## Open Questions

## Next Step

## Important Files

## Recent Records
```

The file should remain current and concise. It is not a full transcript and
should not become a dumping ground for every execution detail.

### Task Records/

`Task Records/` stores durable, time-bound task records. It is the place for
handoffs, phase summaries, important user corrections, option comparisons,
decision rationale, failure reviews, and context-clear preservation records.

The Agent should write a record only when the information will materially help
future task recovery or execution. It should not write a record for every chat
turn or ordinary minor update.

Suggested filename style:

```text
Task Records/2026-05-11-context-clear-handoff.md
Task Records/2026-05-11-playwright-boundary-review.md
```

Suggested record structure:

```md
# Record: ...

## Trigger

## Summary

## Confirmed

## Open

## Next

## Links
```

## Task Working Files And Outputs

Task output files do not need a single mandatory home. They live in the task
folder and may be organized naturally by task type.

Rules:

- The Agent may create files and folders when execution policy allows.
- The Agent should choose clear, task-relevant names.
- The Agent should reference important created or modified files from
  `Task.md`.
- The Agent must not hide task state only inside arbitrary output files.
- Taskplane should infer current task state from structured task data,
  `Task.md`, relevant task records, timeline events, decisions, and runs, not
  from arbitrary output layout.

## Task Files In The Tasks Workspace

Task files should be integrated into Tasks rather than exposed as a separate
Task Files page in v1. The product goal is seamless switching between task
management and task-file reading/writing.

The Tasks page should use a resource-workspace layout:

```text
Zone navigation | Task Resource Explorer | Selected Object Workspace | AI Panel
```

The second column is a Task Resource Explorer with collapsible groups such as:

```text
Execution Queue
Task Type
Task Files
```

The Task Files group shows the file tree for the currently selected task. When
the user selects a different task through Execution Queue or Task Type, the
Task Files group should switch to that task's files.

`Task.md` and `Task Records/` should appear as ordinary file-tree items in v1.
They do not need a special pinned system section. This keeps the interaction
close to VS Code, Obsidian, and agent project folders while still giving the
Agent a stable task-memory surface.

The third column is a Selected Object Workspace:

- selecting a task shows task management and execution context;
- selecting a file shows file preview/editing;
- selecting the task list shows task-list views.

For file objects, the workspace should support the ordinary file actions users
expect in a task workspace:

- open file;
- preview text or Markdown;
- edit text or Markdown;
- create file;
- create folder;
- rename;
- move;
- delete;
- search.

The first implementation can keep file-type support simple. Plain text and
Markdown are enough for inline editing. Other file types can be listed and later
opened externally or previewed when support exists.

The right panel remains the existing AI discussion entry. The product should not
create a separate file-specific chat surface in v1. Users can use the global
right panel to discuss the current task or selected file.

If a file has unsaved edits, switching to another task, another file, or task
management should prompt the user to save, discard, or cancel.

## Task.md And Hidden Task Records

The UI can show the primary task record as `Task.md` even if the future
underlying representation becomes `.task`, `.taskplane/task.md`, a database
record, or a hybrid.

The product concept should be "primary task record", not a permanent commitment
to one physical filename.

In v1, showing `Task.md` and `Task Records/` plainly is acceptable. Later, if
the task record becomes more like `.claude` or another hidden agent-project
file, the UI may still expose it through a friendly display name.

## Sources, Artifacts, And Timeline

The file portion of Tasks should become the unified surface for task files and
task content. The task-management portion of Tasks should remain the
task-progression surface.

Use a projection-first approach rather than migrating data models immediately.

| Current Surface | Task Files Direction | Notes |
| --- | --- | --- |
| Source Context | Project into Task Files | Source material is task material. It can appear as file-like entries without immediate schema migration. |
| Artifact | Project into Task Files | Artifacts are task output files or generated evidence. They can appear as file-like entries first. |
| Timeline | Keep as activity/audit data | Timeline is not a user file and should not be migrated into the file tree by default. |
| Run Steps | Keep under execution records | Run steps should only create or reference files when they produce durable outputs. |

Short term:

- Task Files can display existing `source_contexts` and `artifacts` as file-like
  entries.
- The task-management workspace can keep source and artifact shortcuts for key
  sources, recent outputs, completion evidence, and recovery cues.
- Full file CRUD and organization should belong to the file workspace inside
  Tasks, not be duplicated across multiple task surfaces.

Long term:

- Source Context and Artifact records may become metadata views over task files.
- The task-management workspace can continue to surface important files for
  execution decisions without becoming the complete file manager.

This follows a first-principles split:

- the file workspace manages task content.
- the task-management workspace manages task progress.
- Timeline preserves audit history.

## Product-Level Agent Principles

Task-file reading and writing should be part of the product-level Agent
execution principles, not merely a page feature.

Taskplane should define a product-owned, read-only Agent principles document.
This document is not part of any task folder. It is a product rule source that
Agents must read before execution and must not modify.

The principles document should cover:

- task-file reading order;
- when to update `Task.md`;
- when to create a `Task Records/` entry;
- how to reference important working files;
- when to create or avoid output folders;
- decision, self-check, and user-confirmation boundaries;
- separation between task files and work habits;
- the rule that full chat transcripts are not automatically written into task
  memory;
- the rule that cross-task preferences belong in Work Habits, not task files;
- the rule that the Agent must not modify the product principles file.

The boundary should be:

| Surface | Writable By Agent | Owner | Purpose |
| --- | --- | --- | --- |
| Agent principles | No | Product design | Global execution rules |
| Work Habits | Only through confirmation rules | User and AI collaboration | Cross-task preferences |
| Task files | Yes, under execution policy | User and AI collaboration | Single-task memory and work products |

## Agent Read And Write Flow

Before execution:

1. Read product-level Agent principles.
2. Read the task's `Task.md`.
3. Read recent or relevant `Task Records/` entries when the task is ambiguous,
   long-running, recently cleared, or explicitly references prior records.
4. Inspect other task files only when selected, referenced, or necessary for the
   current task.

During execution:

1. Create or edit task working files only within the task folder and only when
   execution policy allows.
2. Keep task-progress state visible through `Task.md` and task records.
3. Do not treat arbitrary output files as the only source of task truth.

After execution:

1. Update `Task.md` if progress, decisions, constraints, open questions, or next
   step changed.
2. Create a task record if the run produced a meaningful handoff, decision
   rationale, failure analysis, phase closeout, or context-clear archive.
3. Add references to important created or modified files in `Task.md`.

## Framework And Retrieval Direction

Do not introduce RAG, embeddings, or a complex retrieval framework as the first
implementation step.

The first version should rely on:

- product principles;
- `Task.md`;
- relevant task records;
- referenced or selected working files;
- existing structured task data, runs, decisions, artifacts, source contexts,
  and timeline events.

RAG or summary indexing can be reconsidered after real task folders become large
enough that structured reading and ordinary file search are no longer enough.

The principle is: avoid adding retrieval infrastructure before there is a proven
scale problem.

## Open Product Questions

- Should `Task.md` and `Task Records/` be represented as real files, database
  records rendered as files, or a hybrid?
- Should the Tasks resource explorer show the task-memory surface as ordinary
  files, lightly system-marked files, or friendly aliases for hidden records?
- How much editing freedom should users have over `Task.md` before the Agent
  needs to reconcile or validate structure?
- How long should existing Source Context and Artifact records remain projected
  into the file workspace before becoming file-backed metadata, if ever?
- What exact product-owned path or storage location should hold the read-only
  Agent principles document?
- Which context-clear handoff fields are required before automatic clearing is
  allowed?

## Acceptance Notes

- Context is split into task files and Work Habits.
- Task files are integrated into Tasks rather than kept as a separate Zone 1
  page.
- Work Habits becomes a first-level Zone 2 / Capabilities page.
- Every task has a logical task folder.
- Every task has a primary `Task.md` recovery file.
- Every task has a `Task Records/` place for durable handoffs and milestone
  records.
- A default `outputs/` folder is not required.
- Task output files may be organized naturally by task type.
- Product-level Agent principles are read-only and must govern task-file
  reading and writing.
- The Agent does not write full chat transcripts into task files by default.
- RAG is deferred until real task-file scale proves it is needed.
