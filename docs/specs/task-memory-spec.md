# Taskplane Task Memory Spec

Document id: `taskplane.task-memory-spec.v1`
Owner: Taskplane product design
Layer: skill / memory rules plus hook-backed gates
Load: task resume, memory read/write, task switch, context clear, closeout, handoff, recovery sufficiency
Scope: durable task memory and recovery
Authority: required when loaded; deterministic memory gates enforce must-follow rules
Status: Product runtime specification

## Purpose

Taskplane assumes that long chat context should not be the primary task memory.
The product can clear or refresh chat context only when durable task memory is
sufficient for an Agent to recover the task with high quality.

This spec defines where task information belongs, how much should be recorded,
what must be read before execution, and what must be persisted before task
handoff, closeout, or context clearing.

The goal is not to record everything. The goal is to preserve the smallest
durable memory that lets a future Agent answer:

1. What is the task trying to achieve?
2. What is the current state?
3. What is the next safe action?
4. Why did the task reach this state?
5. What constraints, risks, blockers, dependencies, or pending decisions matter?
6. What has the user already approved, rejected, or corrected?
7. Where are important sources, files, runs, and outputs?
8. Can chat context be cleared without losing task quality?

## Relationship To Agent Operating Principles

The Agent Operating Principles define required Agent behavior. This Task Memory
Spec defines the memory contract that behavior must use.

Agents must follow this spec when they:

- start or resume a task;
- switch between tasks or subtasks;
- update task state;
- write Task.md, Task Records, files, sources, artifacts, Decisions, or Runs;
- evaluate phase closeout;
- evaluate task completion;
- clear or refresh chat context;
- create handoff material for another Agent or future session.

If this spec conflicts with a transient chat instruction, this spec wins unless
the user explicitly changes the product rule.

## Memory Surfaces

| Surface | Write Standard | Read / Reuse Standard |
| --- | --- | --- |
| Structured Task State | Write through task services and mutation gates. Use structured fields for status, hierarchy, blockers, dependencies, criteria, next step, and dates. | Treat as authoritative current state before reading narrative memory. |
| Task.md | Write through the dedicated Task.md update evaluator. Keep only concise recovery fields and important references. | Read for task resume, context assembly, handoff, and context-clear checks. |
| Task Records | Write only when Task Record worthiness is met: handoff, closeout, correction, option rationale, failure review, source digest, or durable state change. | Read as recovery history and rationale, with recent and relevant records preferred. |
| Task Dynamics | Write from structured runtime, timeline, run, decision, file, source, artifact, and handoff events. Do not edit as user files. | Read for replay, audit, verification, and explaining what happened. |
| Runs / Run Steps | Write through Run services, tool execution, checkpoint, verification, and recovery-guidance writers. | Read for execution replay, debugging, and evidence; promote only the smallest durable recovery summary when needed. |
| Decisions | Write through Decision services or checkpoint approval boundaries. Never hide required user judgment only in chat. | Block or guide execution until resolved; read for approval effects and rationale. |
| Source Materials | Write through explicit source capture with role, captured-at time, origin, credibility, duplicate, and sensitive-data metadata when known. | Read as evidence only after freshness, traceability, credibility, duplicate, and sensitivity checks. |
| AI Output | Write as generated context or run output, not as external evidence. | Read as generated context or recovery clue, with lower authority than user/source evidence. |
| Artifacts | Write through artifact writers or explicit artifact metadata. Do not infer artifact status from a folder name alone. | Read as produced output reference; link from Task.md or Task Records when needed for recovery. |
| Task Files | Write as ordinary task-bound support files. Reserved Task.md and Task Records paths are not ordinary file paths. | Read when selected, referenced, or relevant to the current task. |
| Work Habits | Write through proposal/confirmation for cross-task rules. Do not infer durable habits from one task fact. | Read only when applicable to the current task or execution mode. |
| Discussion | Do not persist by default. Persist only after routing decides it belongs to another surface. | Keep as temporary working context until captured, dismissed, or cleared. |

### Structured Task State

Structured task state is the authoritative current state.

Use it for:

- title, summary, task type, lane, status, parent and child relationships;
- dependencies and blockers;
- completion criteria;
- next step;
- important dates or scheduling fields;
- counts and relationships that the UI or runtime must compute reliably.

Do not hide authoritative state only inside chat, Task Records, or arbitrary
files. If structured state exists, treat it as authoritative until the user
confirms a correction.

### Task.md

Task.md is the primary recovery file for one task.

Use it for the concise current recovery summary:

- goal and scope;
- current progress;
- current next step;
- constraints, risks, blockers, and dependencies;
- open questions;
- user decisions that affect future execution;
- important files, source batches, artifacts, or records needed for recovery.

Keep Task.md short and current. Do not turn it into a transcript, a full event
history, or a dumping ground for every generated output.

Update Task.md when durable task state changes enough that a future Agent would
otherwise resume incorrectly.

### Task Records

Task Records are time-bound recovery notes.

Create a Task Record only when the information materially helps future recovery
or execution.

Good reasons:

- phase closeout or milestone summary;
- task-to-task or Agent-to-Agent handoff;
- user correction that changes future behavior;
- option comparison or rejected-option rationale;
- decision rationale;
- failure review or rollback explanation;
- context-clear archive;
- important external signal that changes the task plan;
- compact source digest that explains a batch of evidence.

Do not create a Task Record for every chat turn, minor status update, generic
summary, or duplicate fact already preserved elsewhere.

Task Records may include more detail than Task.md, but they should still be
selective. They should explain why recovery should proceed a certain way.

### Task Dynamics

Task Dynamics are structured facts about what happened to the task.

Use them for:

- task creation and state changes;
- Run and Run step events;
- task completion checks, including passed checks and explicit user overrides;
- Decision creation or resolution events;
- file, source, artifact, or Task Record writes;
- context refresh, task switch, and handoff events;
- replay or audit projections.

Task Dynamics are not user files and are not the primary recovery summary.
They support audit, replay, and verification. A future Agent may read them when
useful, but should not rely on them as the only source of task state.

### Runs And Run Steps

Runs and Run steps are execution evidence.

Use them for:

- tool calls and model execution;
- step outcomes;
- failures and recovery attempts;
- checkpoints;
- run-level verification and self-checks;
- artifacts or source materials produced by execution.

Runs explain what execution did. They should not replace Task.md or Task Records
when a durable recovery summary or rationale is needed.

### Run Detail Routing

Run detail is structured execution detail, not a Task Record by default.

Persist or project Run detail by recovery value:

- Write to Task.md only when the run changes the current goal, state, next
  step, blocker, risk, completion criteria, or important file reference.
- Write to a Task Record only when the run produces durable rationale or
  recovery material: failure review, rollback explanation, phase closeout,
  handoff, context-clear archive, decision rationale, or source digest.
- Show in Task Dynamics when the information explains what happened but does
  not need a user file: run started, step completed, verification result,
  checkpoint, tool action, file write, artifact creation, or replay grouping.
- Keep only as Run or Run step detail when it is useful for audit or debugging
  but not needed for normal task recovery.
- Drop transient execution noise when it has no recovery, audit, verification,
  source, or user-facing value.

Do not copy a full Run detail into Task Records. If a future Agent needs it,
write the smallest recovery summary and link or reference the relevant run,
step, file, source, or artifact.

### Decisions

Decisions preserve user judgment and authorization.

Use them for:

- meaningful choices;
- risky or irreversible operations;
- external writes;
- completion approvals;
- rejected options;
- paused approvals that block task progress.

Do not bury user approval only in chat. If execution depends on user judgment,
create or surface a Decision.

### Source Materials

Source materials are inputs or evidence.

Use them for:

- web pages, documents, messages, external connector records, pasted evidence,
  or captured notes that influence the task;
- source digests when a run collects many items.

Every recorded source should preserve a captured-at time, source role, and the
best available origin label. When known, also preserve credibility, duplicate,
and sensitive-data signals. Unknown credibility should stay explicit as
`unknown`; do not treat missing metadata as verified evidence.

Do not record every transient snippet or duplicate source.

Promote a source into a Task Record, task file, or artifact only when it has
been synthesized into durable task knowledge, rationale, or output.

### Artifacts, AI Output, And Task Files

Artifacts and AI outputs are produced work. Task files are task-specific working
or output files.

Use them for:

- drafts, reports, implementation files, designs, evidence files, and generated
  outputs;
- files the user needs to inspect, edit, export, or reuse.

Do not require a default output folder. Use natural task-relevant organization.

Reference important outputs from Task.md or a Task Record when they are needed
for future recovery.

### Work Habits

Work Habits are cross-task preferences or recurring working rules.

Use them for:

- user preferences that apply across tasks;
- repeated corrections;
- reusable process expectations.

Do not store cross-task behavior only in task files. Task files may mention a
task-specific constraint, but durable cross-task behavior belongs in Work
Habits through the confirmation or learning flow.

## Read Contract

Before task execution, the Agent must assemble enough context to recover safely.

Default read order:

1. Product Agent Operating Principles.
2. This Task Memory Spec.
3. Selected task summary and structured state.
4. Task.md when present, or create/read a minimal recovery substitute when
   missing.
5. Relevant Task Records when the task is ambiguous, long-running, recently
   cleared, being handed off, or explicitly references prior records.
6. Selected, referenced, or necessary working files.
7. Relevant Decisions, Runs, Run steps, artifacts, source materials, and Task
   Dynamics.
8. Applicable Work Habits.

For subtask start, read parent context only for scope, order, shared
constraints, risks, and pending decisions that materially affect the subtask.
Do not reload the entire parent project history by default.

For context refresh recovery, prefer Task.md, the context-clear Task Record,
recent handoff records, open Decisions, and the latest structured state before
reading older Task Dynamics.

## Write Contract

When new information appears, write it to the smallest durable surface that
preserves future usefulness.

Use this routing:

- current authoritative state -> structured task state;
- concise recovery summary -> Task.md;
- time-bound rationale, handoff, closeout, correction, or recovery archive ->
  Task Record;
- system fact that an action happened -> Task Dynamics;
- execution evidence -> Run or Run step;
- user judgment or approval -> Decision;
- raw input evidence -> Source material;
- produced work -> Artifact, AI output, or task file;
- cross-task preference -> Work Habit proposal.

Do not duplicate the same fact across multiple surfaces unless each surface has
a distinct recovery job.

## Context Clearing Contract

Chat context is temporary working memory. It may be cleared only after useful
task knowledge has been preserved in durable task memory.

Before clearing a task-bound chat context, the runtime or Agent must evaluate:

1. Is there task-bound discussion worth preserving?
2. Is there a specific handoff signal, confirmed conclusion, unresolved
   question, decision rationale, correction, risk, next action, or constraint?
3. Has that signal been written to Task.md, a Task Record, Decision, Run, source
   digest, artifact reference, or other correct memory surface?
4. Can a future Agent answer the recovery questions in this spec without the
   old chat window?

If the answer is no, do not clear automatically. Ask for the missing conclusion,
option, unresolved question, constraint, or next action.

Automatic mode may suggest or perform clearing only after the memory coverage
check passes. Manual mode must show or summarize what was archived before the
user confirms clearing. Reminder-only mode must never clear automatically.

Clearing context, leaving task context, switching tasks, and starting a new
conversation are separate actions.

## Memory Coverage Check

A task is memory-covered when the following are available or intentionally not
needed:

- current structured task state;
- current next step;
- completion criteria or explicit reason they are not yet available;
- relevant blockers, dependencies, risks, and pending Decisions;
- Task.md or equivalent concise recovery summary;
- relevant Task Records for recent handoff, closeout, correction, or context
  refresh;
- important files, sources, artifacts, or source digests needed for continuation;
- recent execution evidence when work was run and not invalidated by later
  completion-criteria changes;
- completion-check evidence when the user or runtime explicitly confirmed
  completion despite missing run evidence, provided the check is not older than
  the latest completion-criteria update;
- applicable Work Habits.

The check should be lightweight. It should prevent unsafe clearing or execution,
not force busywork.

## Memory Coverage Outcomes

Every task-memory coverage check should return one of these outcomes:

- `pass`: required recovery information is present or intentionally not needed.
  The runtime may proceed with execution, task switch, closeout, or context
  clearing according to the relevant confirmation boundary.
- `needs_memory_write`: the task can proceed after a small durable memory update,
  such as updating Task.md, writing one Task Record, linking an important output,
  or recording a Decision.
- `needs_user_clarification`: the missing information is not knowable from
  existing task memory. Ask the user for the missing conclusion, choice, scope,
  constraint, next action, or acceptance boundary before proceeding.
- `blocked`: unresolved blocker, dependency, pending Decision, unsafe operation,
  or contradictory task state prevents safe execution or clearing.
- `not_applicable`: the action is global, empty, exploratory, or unrelated to a
  task-bound memory surface.

Prefer the smallest next action that changes the outcome. Do not generate new
tasks, new folders, new records, or new prompts when one field update, one
concise record, or one user clarification is enough.

## Minimum Record Shapes

These shapes are minimum recovery structures, not rigid templates. Omit fields
that are not relevant. Add detail only when it improves future recovery.

### Task.md Minimum Shape

Task.md should let a future Agent resume without reading the old chat first.

Minimum useful sections:

- Goal: the task outcome and current scope.
- Current Progress: what is already true.
- Next Step: the next safe action.
- Key Context: important facts, constraints, blockers, dependencies, or open
  questions.
- Decisions: durable user approvals, rejections, or choices that affect
  execution.
- Important Files: files, source digests, artifacts, or records needed for
  recovery.
- Recent Records: where to look for recent handoff, closeout, or recovery notes.

Keep sections concise. If a section would become historical, move the detail to
a Task Record and leave only the current recovery pointer in Task.md.

### Phase Closeout Record

Use when a phase or meaningful work segment ends.

Minimum useful fields:

- Phase: what phase or work segment closed.
- Completed: outputs, files, criteria, or decisions completed.
- Verification: quality checks performed and remaining evidence gaps.
- Carry Forward: risks, unresolved questions, constraints, or next actions.
- Handoff Target: next task, child task, successor task, or reason no handoff is
  needed.
- Links: important files, Decisions, Runs, sources, or artifacts.

Do not use phase closeout to invent new subtasks when a valid project
decomposition already exists. If the next task is unclear, ask or create a draft
proposal instead of silently mutating structure.

### Context-Clear Archive

Use before clearing a task-bound chat context when useful task signals exist.

Minimum useful fields:

- Trigger: why clearing or refresh is being considered.
- Preserved Signals: confirmed conclusions, corrections, options, constraints,
  risks, or unresolved questions extracted from the conversation.
- Memory Updates: Task.md, Task Records, Decisions, files, source digests, or
  artifacts written or referenced before clearing.
- Resume Point: what the next Agent should do first after refresh.
- Exclusions: chat details intentionally not preserved because they were
  exploratory, duplicate, or low value.

Never store the full chat transcript by default.

### Handoff Record

Use when responsibility or execution moves from one task, Agent, or session to
another.

Minimum useful fields:

- From: source task, phase, Agent, or session.
- To: target task, child task, successor, Agent, or session.
- Why: reason for the handoff.
- Current State: what is ready, paused, blocked, or waiting.
- Next Action: first action for the receiver.
- Risks And Dependencies: blockers, pending Decisions, related tasks, or
  constraints.
- Evidence: important files, Runs, Decisions, sources, or artifacts.

### Failure Review Record

Use when failure affects future execution.

Minimum useful fields:

- Failure: what failed and where.
- Impact: what task state, output, timeline, or user expectation was affected.
- Cause: known or likely cause, with uncertainty if needed.
- Recovery: what was tried, what worked, and what remains unresolved.
- Prevention: future constraint, check, or Work Habit candidate if repeated.
- Links: logs, Runs, files, patches, Decisions, or artifacts.

Do not create a failure review for harmless transient noise that has no recovery
value.

### Decision Rationale Record

Use only when the rationale is more important than the Decision status alone.

Minimum useful fields:

- Decision: what was approved, rejected, deferred, or selected.
- Options: considered alternatives when relevant.
- Rationale: why this choice was made.
- Consequences: constraints, risks, follow-up work, or acceptance boundary.
- Links: Decision record, source evidence, Runs, files, or artifacts.

If a simple Decision record already preserves enough context, do not create an
extra Task Record.

## Lifecycle Memory Procedures

### Starting Or Resuming A Task

1. Read Agent Operating Principles and this spec.
2. Read structured task state and Task.md.
3. Read relevant Task Records only when the task is long-running, ambiguous,
   recently cleared, handed off, or explicitly references them.
4. Read selected or necessary files, Decisions, Runs, sources, artifacts, and
   Work Habits as needed.
5. Verify context cleanliness before context sufficiency.
6. If memory is insufficient, request or load the smallest missing context before
   execution.

### Starting A Subtask

Read the target subtask first. Read the parent only for scope alignment, order,
shared constraints, risks, pending Decisions, and handoff notes. Read siblings
only when they are dependencies or blockers.

Do not replan the whole parent project when the user is simply starting the next
known subtask.

### During Execution

Record execution facts as Runs, Run steps, Task Dynamics, Decisions, sources, or
artifacts according to their surface. Update Task.md or Task Records only when
future recovery would otherwise lose important state or rationale.

### Phase Closeout

Before closing a phase:

1. Verify completion evidence against criteria and user intent.
2. Decide whether Task.md needs a concise current-state update.
3. Decide whether a Phase Closeout Record has recovery value.
4. Preserve important files, Decisions, Runs, source digests, artifacts, risks,
   and next actions.
5. Hand off to an existing child or successor task when available; otherwise ask
   or propose before creating new structure.

### Task Switch

Before switching away from task A:

1. Preserve useful task A handoff information only if it has recovery value.
2. Avoid carrying unrelated task A chat into task B.
3. Rebuild task B context from task B memory surfaces.
4. Confirm task B has a clean and sufficient runtime context before execution.

### Context Clearing

When the context is long, repetitive, or quality appears to be degrading:

1. Run a memory coverage check.
2. If the outcome is `needs_memory_write`, perform the smallest memory write
   needed to preserve recovery.
3. If the outcome is `needs_user_clarification`, ask before clearing.
4. If the outcome is `blocked`, do not clear as a way to bypass the blocker.
5. If the outcome is `pass`, clear or refresh according to the selected mode.

Automatic mode may act only after coverage passes. Manual mode must show or
summarize the archive before clearing. Reminder-only mode must not clear.

### Task Completion

Before marking a task complete:

1. Verify completion criteria and residual risks.
2. Record the completion check result when completing through a confirmation
   flow, including explicit user overrides.
3. Preserve important final outputs and Decisions.
4. Update Task.md or write a final Task Record only when future recovery,
   auditing, or follow-up work would benefit.
5. Avoid creating a completion note when structured state, Runs, and existing
   records already preserve enough recovery context.

## Write Thresholds

Use these thresholds to prevent over-recording:

- Write structured task state when the current authoritative state changes.
- Update Task.md when a future Agent would otherwise resume with the wrong goal,
  scope, next step, constraint, blocker, open question, Decision, or important
  file reference.
- Create a Task Record when future recovery needs rationale, handoff, closeout,
  correction, failure review, context-clear archive, or external signal context.
- Record Task Dynamics for system facts even when no user-readable record is
  needed.
- Record Runs and Run steps for execution evidence.
- Create Decisions for user judgment and approval, not for ordinary notes.
- Record sources when evidence affects planning, verification, ranking, or
  decisions.
- Record artifacts or task files when produced work needs inspection, reuse, or
  export.
- Propose Work Habits only when the information applies across tasks.

Do not write durable memory when the information is exploratory, duplicate,
minor, already represented by the correct surface, or unlikely to affect future
execution.

## Anti-Patterns

Avoid:

- treating chat history as the only task memory;
- writing every chat turn into Task Records;
- making Task.md a full history log;
- relying on Task Dynamics as the only recovery source;
- classifying AI output as source material unless it represents synthesized
  evidence or digest;
- creating new folders, task records, Decisions, or prompts when one existing
  memory update would preserve recovery;
- replacing an existing Task.md with a fresh template when only a small memory
  supplement is needed;
- clearing context because the message count is high without checking memory
  coverage;
- carrying unrelated previous-task chat into the next task.

## Implementation Notes

Runtime evaluators should gradually converge on a shared
`TaskMemoryCoverageEvaluation` that can be used before context clearing, task
start, task switching, phase closeout, task completion, and run start.

Automatic context clearing should consume a runtime readiness verdict derived
from task memory coverage. It should not use a fixed message-count rule. Message
count may trigger inspection, but clearing is allowed only when the verdict says
the current task chat can be discarded without reducing task recovery quality.

Persisted task-memory guidance, such as a Run Step titled `任务记忆建议`, is not
the same as a completed memory write. Runtime should treat the latest guidance
as pending until a matching Task.md or Task Record write exists after that
guidance. This prevents automatic clearing from mistaking "please update memory"
for "memory has been updated."

When runtime finds pending task-memory guidance, it may prepare a minimal write
proposal for the missing surface. A proposal is not a write. It must name the
target (`Task.md` or Task Record), operation, path, reason, and content template,
and it must still pass the normal confirmation/write boundary before durable
task memory is changed. Prefer the smallest write that satisfies recovery:
update existing `Task.md` when the concise recovery file is missing information,
or create one Task Record when detailed handoff, rationale, correction, or
context archive material is required.

When updating an existing `Task.md`, the update must preserve current content by
default. Append or surgically update the smallest recovery section needed. Do not
overwrite the file with a new scaffold unless the existing file is empty or the
user explicitly asks for a rewrite.

Task switching should follow the same memory boundary for the task being left:
if the current task has unresolved task-memory guidance, runtime must block or
ask before leaving that task context, instead of silently carrying the gap into
another task.

Run start follows the same boundary for the task being executed. If the latest
task-memory guidance for that task still requires Task.md or Task Record writes,
runtime must block new execution until the smallest required memory write is
completed. This prevents a new Run from compounding missing recovery context.

Phase closeout follows the same boundary. A closeout record may satisfy pending
Task Record guidance, but if the latest guidance still requires Task.md or
another Task Record after closeout persistence, runtime must pause before
refreshing chat or handing off to the next task.

Writing a closeout record does not make an unresolved closeout result safe. If
the closeout result still indicates a blocker, dependency, required user
confirmation, or follow-up confirmation, runtime must preserve the current task
context and wait for that boundary to be handled before clearing chat or handing
off.

Paused Run resume also follows this boundary. Resuming from a checkpoint may
execute tools, so unresolved task-memory guidance must be handled before the
checkpoint continuation runs.

Approved Decision checkpoint resume follows the same boundary, because approving
the Decision can resume a pending tool, browser, command, or patch checkpoint.
Runtime must check unresolved task-memory guidance before executing that
continuation.

UI may display Task Dynamics as structured task replay, but that display is not
required for this memory contract to hold. The contract is about durable task
recovery first and presentation second.
