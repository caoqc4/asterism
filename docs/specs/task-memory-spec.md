# Taskplane Business Memory Spec

Document id: `taskplane.task-memory-spec.v1`
Owner: Taskplane product design
Layer: skill / memory rules plus hook-backed gates
Load: business or task resume, memory read/write, focus switch, context clear,
closeout, handoff, recovery sufficiency
Scope: durable business memory, Next Action execution memory, and legacy task
recovery
Authority: required when loaded; deterministic memory gates enforce must-follow
rules
Status: Product runtime specification

## Purpose

Taskplane assumes that chat is temporary working memory. The product can clear or
refresh chat only when durable memory is sufficient for an Agent to recover the
business line, active Next Action, or legacy task with high quality.

Business Line is the durable owner for long-lived business, product, content,
workflow, or automation work. Tasks remain execution units and Next Action
carriers. Task.md and Task Records remain valid for active Next Action execution
and historical task recovery; they are not the default durable owner for
business-line work.

The goal is not to record everything. The goal is to preserve the smallest
durable memory that lets a future Agent answer:

1. What business line, Next Action, or legacy task is being advanced?
2. What is the current state and next safe action?
3. Why did the work reach this state?
4. What constraints, risks, blockers, dependencies, sources, files, runs, and
   pending Decisions matter?
5. What has the user approved, rejected, corrected, or taught the system?
6. Which records, reviews, SOPs, sources, artifacts, or task files are needed for
   recovery?
7. Can chat context be cleared without losing business or execution quality?

## Relationship To Agent Operating Principles

The Agent Operating Principles define required Agent behavior. This spec defines
the memory contract that behavior must use.

Agents must follow this spec when they:

- start or resume a business line, Next Action, task, or legacy task;
- switch between business lines, Next Actions, tasks, subtasks, or sessions;
- update business-line state, Next Action state, or task state;
- write Business Records, Reviews, Skills/SOP revisions, Task.md, Task Records,
  files, sources, artifacts, Decisions, Runs, or Work Habits;
- evaluate phase closeout, post-action review, completion, context refresh, or
  handoff;
- decide whether chat can be cleared.

If this spec conflicts with a transient chat instruction, this spec wins unless
the user explicitly changes the product rule.

## Memory Surfaces

| Surface | Write Standard | Read / Reuse Standard |
| --- | --- | --- |
| Business Line | Write through business-line services and ownership gates. Use it for durable owner identity, scope, status, goals, active Next Actions, accepted SOPs, and business-level settings. | Read first for business-line work; it establishes ownership before task memory. |
| BusinessLineContextPack | Assemble through business-line services from records, sources, Next Actions, reviews, SOPs, decisions, and recent runs. Do not hand-edit as a durable record. | Read as the compact business memory pack for chat/run context; use source ids and why-now/risk fields for traceability. |
| Business Records | Write through business-line record services. Use for durable business memory: observations, source digests, decisions rationale, review summaries, customer/product/context changes, and business handoff. | Read as the main business-line recovery history, preferring recent, relevant, and future-context-enabled records. |
| Reviews | Write through post-action review services after execution, run completion, correction, or learning-worthy outcome. | Read for what worked, what failed, suggested Next Actions, and learning candidates. |
| Skills/SOP Revisions | Write through learning/SOP revision services and Decision gates for risky updates. | Read accepted revisions as business-line operating guidance; proposed/rejected/expired revisions are evidence, not active rules. |
| Next Action / Structured Task State | Write through task services and mutation gates. Use structured fields for execution status, hierarchy, blockers, dependencies, criteria, next step, dates, and run linkage. | Read when executing, verifying, or resuming a concrete action inside the business line. |
| Task.md | Write through the dedicated Task.md update evaluator. Keep concise execution recovery fields and important references for one active task / Next Action. | Read for active Next Action execution and legacy task recovery; do not treat as the whole business memory. |
| Task Records | Write only when Task Record worthiness is met for task-scoped handoff, closeout, correction, option rationale, failure review, source digest, or context archive. | Read as task-scoped recovery history, especially for legacy project/routine tasks. |
| Task Dynamics | Write from structured runtime, timeline, run, decision, file, source, artifact, and handoff events. Do not edit as user files. | Read for replay, audit, verification, and explaining what happened. |
| Runs / Run Steps | Write through Run services, tool execution, checkpoint, verification, and recovery-guidance writers. | Read for execution replay, debugging, and evidence; promote only the smallest durable recovery summary when needed. |
| Decisions | Write through Decision services or checkpoint approval boundaries. Never hide required user judgment only in chat. | Block or guide execution until resolved; read for approval effects and rationale. |
| Source Context | Write through explicit source capture with role, captured-at time, origin, credibility, duplicate, and sensitive-data metadata when known. | Read as evidence only after freshness, traceability, credibility, duplicate, and sensitivity checks. |
| AI Output | Write as generated context or run output, not as external evidence. | Read as generated context or recovery clue, with lower authority than user/source evidence. |
| Artifacts / Task Files | Write artifacts through artifact writers and ordinary task files through file writers. Reserved Task.md and Task Records paths are not ordinary file paths. | Read as produced output or support files when selected, referenced, or relevant; link from Business Records, Task.md, or Task Records when needed. |
| Work Habits | Write through proposal/confirmation for cross-business or cross-task behavior. Do not infer durable habits from one task fact. | Read only when applicable to the current business line, task, or execution mode. |
| Discussion | Do not persist by default. Persist only after routing decides it belongs to another surface. | Keep as temporary working context until captured, dismissed, or cleared. |

## Surface Routing

Route new information to the smallest durable surface that preserves future
usefulness:

- business-line identity, goals, settings, active SOPs, and ownership ->
  Business Line;
- compact business context for a run or chat -> BusinessLineContextPack;
- durable business observation, source digest, rationale, status change,
  handoff, or future-context note -> Business Record;
- post-action result, lesson, next-action suggestion, or failure analysis ->
  Review;
- reusable business-line procedure or rule -> Skills/SOP revision, with
  Decisions for risky activation;
- current execution status, blocker, dependency, criteria, or next step -> Next
  Action / structured task state;
- concise one-task execution recovery -> Task.md;
- task-scoped rationale, task handoff, phase closeout, correction, failure
  review, or context archive -> Task Record;
- user judgment or approval boundary -> Decision;
- raw input evidence, external facts, connector material, or source digest input
  -> Source Context;
- produced deliverable or support file -> Artifact / Task File;
- repeated cross-business or cross-task preference -> Work Habit proposal;
- ordinary brainstorming, duplicated facts, and low-value chat -> Discussion
  only.

Do not duplicate the same fact across multiple surfaces unless each surface has
a distinct recovery job.

## Handoff V2 Memory Contract

Handoff is a recovery boundary, not a transcript archive. Every handoff should
name its type before deciding where to write:

| Type | Memory Job | Default Write Surface |
| --- | --- | --- |
| `ephemeral_session_handoff` | Preserve just enough working-state recovery for compact, clear, restart, or session refresh. | Temporary file, context-clear archive, or no durable write when signals are already covered. |
| `durable_business_handoff` | Preserve business-line state, rationale, source/review summary, record gap, learning, or future context. | Business Record, with pointers to Reviews, SOP revisions, Decisions, Sources, Runs, files, and artifacts. |
| `next_action_handoff` | Transfer execution state for one active Next Action, child/successor task, resumed task, or legacy task. | Structured task state, Task.md update, or Task Record. |
| `runtime_or_subagent_handoff` | Evaluate runtime, tool, verifier, scheduler probe, or subagent output before writeback. | Run Step, runtime result, temporary file, or writeback proposal; durable writes happen only after service gates. |

Minimum handoff fields:

- source and target;
- reason;
- current state;
- next safe action;
- constraints and Decisions;
- evidence pointers to records, Runs, files, Decisions, sources, artifacts, or
  reviews;
- what not to duplicate, including transcripts, stdout, hidden prompts,
  unrelated prior context, and stale reasoning;
- target surface: Business Record, Task Record, Run Step, temporary file, or no
  write.

Do not assume every handoff becomes a Task Record. Business-line recovery goes
to Business Records. Next Action execution recovery may use Task.md or Task
Records. Runtime/subagent handoff must be evaluated before proposed writes are
applied. Ephemeral session handoff may remain temporary when durable memory is
already sufficient.

## Business-Line Read Order

Default read order for business-line execution:

1. Product Agent Operating Principles and this spec.
2. Business Line structured state: scope, goals, active Next Actions, accepted
   SOPs, settings, and ownership.
3. BusinessLineContextPack for the current business line, including why-now,
   source, risk, records, reviews, decisions, and accepted SOP guidance.
4. Current Next Action / task structured state when execution is concrete.
5. Task.md only when the active Next Action has one or when legacy recovery needs
   it.
6. Relevant Business Records and Reviews, preferring recent, future-context, and
   source-linked records.
7. Relevant Task Records when the active action is long-running, ambiguous,
   recently cleared, handed off, or legacy.
8. Source Context, Decisions, Runs, Run steps, artifacts, task files, Task
   Dynamics, applicable Work Habits, and process templates as needed.

For subtask start, read parent context only for scope, order, shared constraints,
risks, pending Decisions, and handoff notes that materially affect the subtask.
Do not reload the whole business-line or parent-project history by default.

For context refresh recovery, prefer BusinessLineContextPack, recent Business
Records, Reviews, open Decisions, active Next Action state, Task.md when
relevant, and context-clear records before reading older Task Dynamics.

## Legacy Task Recovery Read Order

Use this order when no canonical business line is available yet, or when a user
explicitly opens historical project/routine task recovery:

1. Product Agent Operating Principles and this spec.
2. Legacy task summary, structured state, parent/child relationships, blockers,
   dependencies, criteria, and next step.
3. Task.md when present, or a minimal recovery substitute from structured state.
4. Relevant Task Records for handoff, closeout, correction, context clear, or
   historical rationale.
5. Source Context, Decisions, Runs, artifacts, task files, Task Dynamics, Work
   Habits, and process templates as needed.
6. Resolve or create the corresponding Business Line before new durable
   business-level writes whenever possible.

Legacy task recovery is compatibility support. It should not silently become a
new task-first product model.

## Context Clearing Contract

Chat context is temporary working memory. It may be cleared only after useful
business or task knowledge has been preserved in durable memory.

Before clearing business-line or task-bound chat, the runtime or Agent must
evaluate:

1. Is there discussion worth preserving?
2. Is there a specific handoff signal, confirmed conclusion, unresolved
   question, decision rationale, correction, risk, next action, review lesson, or
   constraint?
3. Has that signal been written to a Business Record, Review, SOP revision,
   Task.md, Task Record, Decision, Run, Source Context, artifact reference, or
   other correct memory surface?
4. Can a future Agent answer the recovery questions in this spec without the old
   chat window?

If the answer is no, do not clear automatically. Ask for the missing conclusion,
option, unresolved question, constraint, or next action.

Automatic mode may suggest or perform clearing only after the memory coverage
check passes. Manual mode must show or summarize what was archived before the
user confirms clearing. Reminder-only mode must never clear automatically.

Clearing context, leaving business-line context, switching tasks, and starting a
new conversation are separate actions. When a transition is needed, load the
Context Transition Policy; this spec owns the durable memory surfaces and
recovery coverage check.

## Memory Coverage Check

A business line is memory-covered when the following are available or
intentionally not needed:

- current Business Line state and scope;
- BusinessLineContextPack or equivalent compact business recovery summary;
- current Next Action and next safe step when execution is expected;
- relevant blockers, dependencies, risks, and pending Decisions;
- relevant Business Records or Reviews for recent handoff, correction, source
  digest, learning, or context refresh;
- accepted Skills/SOP guidance that should affect future execution;
- Task.md or Task Records only when active Next Action / legacy recovery needs
  them;
- important files, sources, artifacts, or source digests needed for continuation;
- recent execution evidence when work was run and not invalidated by later
  criteria or business-state changes;
- applicable Work Habits.

A legacy task is memory-covered when structured task state, next step,
completion criteria or an explicit reason for absence, relevant blockers,
Decisions, Task.md or equivalent concise recovery, relevant Task Records, and
needed evidence/files are present or intentionally not needed.

The check should be lightweight. It should prevent unsafe clearing or execution,
not force busywork.

## Memory Coverage Outcomes

Every memory coverage check should return one of these outcomes:

- `pass`: required recovery information is present or intentionally not needed.
  The runtime may proceed with execution, focus switch, closeout, or context
  clearing according to the relevant confirmation boundary.
- `needs_memory_write`: the work can proceed after a small durable memory update,
  such as writing one Business Record, recording a Review, updating Task.md,
  writing one Task Record, linking an important output, or recording a Decision.
- `needs_user_clarification`: the missing information is not knowable from
  existing memory. Ask the user for the missing conclusion, choice, scope,
  constraint, next action, or acceptance boundary before proceeding.
- `blocked`: unresolved blocker, dependency, pending Decision, unsafe operation,
  or contradictory state prevents safe execution or clearing.
- `not_applicable`: the action is global, empty, exploratory, or unrelated to a
  durable memory surface.

Prefer the smallest next action that changes the outcome. Do not generate new
tasks, folders, records, prompts, or SOP revisions when one field update, one
concise record, or one user clarification is enough.

## Minimum Record Shapes

These shapes are minimum recovery structures, not rigid templates. Omit fields
that are not relevant. Add detail only when it improves future recovery.

### Business Record Minimum Shape

Use for durable business-line memory.

- Business Line: the owner and current scope.
- Signal: observation, source digest, status change, decision rationale,
  handoff, review summary, or context-refresh archive.
- Why It Matters: effect on future recovery, execution, source interpretation,
  risk, or prioritization.
- Evidence: source ids, Runs, Decisions, files, artifacts, or task ids.
- Future Context: whether it should affect future BusinessLineContextPack
  assembly.

### Review Minimum Shape

Use after an execution, correction, failure, or learning-worthy outcome.

- Action Reviewed: Next Action, run, task, artifact, or source event.
- Outcome: what happened and whether it helped.
- What Worked / Failed: concrete lesson with uncertainty if needed.
- Suggested Next Actions: executable follow-ups, not only rule text.
- Learning Candidate: whether a Skill/SOP revision should be proposed.
- Risk: whether a Decision gate is needed before activation.

### SOP Revision Minimum Shape

Use for reusable business-line operating guidance.

- Business Line: owner and scope.
- Proposed Rule / Procedure: the reusable behavior.
- Provenance: review id, run id, source record, user correction, or Decision.
- Applicability: when it should and should not apply.
- Risk: low/medium/high plus required Decision status for risky activation.
- Status: proposed, active, rejected, superseded, disabled, or expired.

### Task.md Minimum Shape

Task.md should let a future Agent resume one active Next Action or legacy task
without reading the old chat first.

- Goal: execution outcome and current scope.
- Current Progress: what is already true.
- Next Step: the next safe action.
- Key Context: constraints, blockers, dependencies, risks, or open questions.
- Decisions: approvals, rejections, or choices that affect execution.
- Important Files: files, source digests, artifacts, records, or Business
  Records needed for recovery.
- Recent Records: where to look for recent handoff, closeout, or recovery notes.

Keep sections concise. If a section becomes historical, move detail to a
Business Record or Task Record and leave only the current recovery pointer in
Task.md.

### Task Record Minimum Shape

Use when a task-scoped phase or meaningful work segment needs recovery value.

- Phase / Task: what work segment closed or changed.
- Completed: outputs, files, criteria, or decisions completed.
- Verification: quality checks performed and remaining evidence gaps.
- Carry Forward: risks, unresolved questions, constraints, or next actions.
- Handoff Target: business line, Next Action, child task, successor task, or
  reason no handoff is needed.
- Links: Business Records, Decisions, Runs, sources, files, or artifacts.

Do not use a Task Record to replace a Business Record when the information is
durable business-line memory.

### Context-Clear Archive

Use before clearing chat when useful signals exist.

- Trigger: why clearing or refresh is being considered.
- Preserved Signals: confirmed conclusions, corrections, options, constraints,
  risks, unresolved questions, review lessons, or handoff notes.
- Memory Updates: Business Records, Reviews, SOP revisions, Task.md, Task
  Records, Decisions, files, source digests, or artifacts written or referenced
  before clearing.
- Resume Point: what the next Agent should do first after refresh.
- Exclusions: chat details intentionally not preserved because they were
  exploratory, duplicate, or low value.

Never store the full chat transcript by default.

### Handoff Record Minimum Shape

Use only when the handoff has recovery value.

- Type: `ephemeral_session_handoff`, `durable_business_handoff`,
  `next_action_handoff`, or `runtime_or_subagent_handoff`.
- Source / Target: business line, Next Action/task, session, runtime, subagent,
  scheduler probe, or verifier.
- Reason: why this handoff is needed now.
- Current State: what is true, incomplete, blocked, or invalidated.
- Next Safe Action: first continuation step.
- Constraints / Decisions: approvals, risks, dependencies, blockers, or open
  questions.
- Evidence Pointers: Business Records, Task Records, Reviews, SOP revisions,
  Runs, Run Steps, files, Decisions, Source Context, artifacts, PRs, or URLs.
- Exclusions: transcript portions, raw output, duplicate facts, or unrelated
  context intentionally not copied.
- Surface: Business Record, Task Record, Run Step, temporary file, or no durable
  write.

### Failure Review Record

Use when failure affects future execution.

- Failure: what failed and where.
- Impact: what business state, task state, output, timeline, or user expectation
  was affected.
- Cause: known or likely cause, with uncertainty if needed.
- Recovery: what was tried, what worked, and what remains unresolved.
- Prevention: SOP revision or Work Habit candidate if repeated.
- Links: logs, Runs, files, patches, Decisions, sources, or artifacts.

Do not create a failure review for harmless transient noise that has no recovery
value.

## Lifecycle Memory Procedures

### Starting Or Resuming A Business Line

1. Read Agent Operating Principles and this spec.
2. Read Business Line state and BusinessLineContextPack.
3. Read the active Next Action / task state when execution is concrete.
4. Read relevant Business Records, Reviews, accepted SOPs, and Decisions.
5. Read Task.md or Task Records only when the active action or legacy recovery
   needs them.
6. Read selected files, sources, Runs, artifacts, Task Dynamics, Work Habits, and
   templates as needed.
7. Verify context cleanliness before context sufficiency.
8. If memory is insufficient, request or load the smallest missing context before
   execution.

### Starting Or Resuming A Legacy Task

1. Read structured task state and Task.md.
2. Read relevant Task Records only when the task is long-running, ambiguous,
   recently cleared, handed off, or explicitly references them.
3. Read files, Decisions, Runs, sources, artifacts, Task Dynamics, and Work
   Habits as needed.
4. Resolve a business line before new durable business-level writes when
   possible.
5. If memory is insufficient, request or load the smallest missing context before
   execution.

### During Execution

Record execution facts as Runs, Run steps, Task Dynamics, Decisions, Source
Context, artifacts, or task files according to their surface. Write Business
Records, Reviews, Task.md, or Task Records only when future recovery would
otherwise lose important state, rationale, or learning.

### Post-Action Review And Learning

After a completed run, meaningful correction, failure, or user review:

1. Record a Review when the outcome affects future execution.
2. Create real Next Action suggestions only when they are executable.
3. Propose a Skills/SOP revision when the lesson is reusable for the business
   line.
4. Require a Decision before activating risky SOP updates.
5. Keep rejected or expired SOP revisions as evidence, not active guidance.

### Phase Closeout

Before closing a phase:

1. Verify evidence against criteria and user intent.
2. Classify any handoff as `durable_business_handoff`,
   `next_action_handoff`, `runtime_or_subagent_handoff`, or
   `ephemeral_session_handoff`.
3. Decide whether the durable memory belongs in a Business Record, Review,
   Task.md, Task Record, Decision, Run Step, source digest, artifact,
   temporary file, or no write.
4. Preserve important files, Decisions, Runs, source digests, artifacts, risks,
   and next actions.
5. Hand off to an existing business line, Next Action, child task, or successor
   when available; otherwise ask or propose before creating new structure.

### Focus Switch

Before switching away from business line or task A:

1. Classify the handoff type.
2. Preserve useful handoff information only if it has recovery value.
3. Avoid carrying unrelated chat from A into B.
4. Rebuild B context from B memory surfaces.
5. Confirm B has a clean and sufficient runtime context before execution.

### Context Clearing

When context is long, repetitive, or degrading:

1. Run a memory coverage check.
2. If the outcome is `needs_memory_write`, perform the smallest durable memory
   write needed to preserve recovery.
3. If the outcome is `needs_user_clarification`, ask before clearing.
4. If the outcome is `blocked`, do not clear as a way to bypass the blocker.
5. If the outcome is `pass`, clear or refresh according to the selected mode.

Automatic mode may act only after coverage passes. Manual mode must show or
summarize the archive before clearing. Reminder-only mode must not clear.

## Write Thresholds

Use these thresholds to prevent over-recording:

- Write Business Line state when durable owner identity, scope, goals, settings,
  active Next Actions, or active SOP bindings change.
- Write a Business Record when future business recovery needs observation,
  source digest, rationale, handoff, correction, context-refresh archive, or
  external signal context.
- Write a Review when execution outcome, failure, correction, or learning should
  affect future actions.
- Propose a Skills/SOP revision when a reusable business-line behavior should be
  learned.
- Write structured task state when current execution state changes.
- Update Task.md when a future Agent would otherwise resume the active Next
  Action or legacy task with the wrong goal, scope, next step, constraint,
  blocker, open question, Decision, or important file reference.
- Create a Task Record when task-scoped recovery needs rationale, handoff,
  closeout, correction, failure review, context-clear archive, or source digest.
- Record Task Dynamics for system facts even when no user-readable record is
  needed.
- Record Runs and Run steps for execution evidence.
- Create Decisions for user judgment and approval, not ordinary notes.
- Record Source Context when evidence affects planning, verification, ranking,
  or decisions.
- Record artifacts or task files when produced work needs inspection, reuse, or
  export.
- Propose Work Habits only when the behavior applies across business lines or
  tasks.

Do not write durable memory when the information is exploratory, duplicate,
minor, already represented by the correct surface, or unlikely to affect future
execution.

## Cross-Business Memory Reuse

Cross-business memory reuse must be explicit and proposed. Do not silently load a
Business Record, Review, SOP, Work Habit, source, artifact, or task record from
another business line as active guidance.

Allowed reuse paths:

- accepted Work Habit that explicitly applies across businesses or task types;
- SOP revision intentionally promoted or copied through a Decision/proposal;
- source, artifact, or record linked as evidence with provenance and caution;
- legacy task recovery that resolves into the current business line.

If reuse is uncertain, surface a proposal or Decision instead of silently
changing context.

## Anti-Patterns

Avoid:

- treating chat history as durable memory;
- treating Task.md as the whole business-line memory;
- writing every chat turn into Business Records or Task Records;
- making BusinessLineContextPack, Task.md, or Task Records full transcript logs;
- treating every handoff as a Task Record;
- applying runtime/subagent write proposals before evaluating the handoff;
- relying on Task Dynamics as the only recovery source;
- classifying AI output as source material unless it is a synthesized digest;
- creating new records, Decisions, SOP revisions, folders, or prompts when one
  existing memory update would preserve recovery;
- replacing an existing Task.md with a fresh template when only a small memory
  supplement is needed;
- clearing context because the message count is high without checking memory
  coverage;
- carrying unrelated previous-business or previous-task chat into the next
  business line or task.

## Implementation Notes

Existing task-memory evaluators such as `TaskMemoryCoverageEvaluation`,
Task.md guidance, Task Record worthiness, and task-memory write proposals remain
valid for active Next Action and legacy task recovery. They should not be
weakened while business-memory gates are added.

Business-memory evaluators should converge on the same boundary style: coverage
checks before context clearing, focus switch, run start, phase closeout, review,
SOP activation, and completion claims.

Persisted memory guidance is not the same as a completed memory write. A Review
or Run Step that says "update memory" remains pending until the matching
Business Record, SOP revision, Task.md, Task Record, Decision, or source record
exists after that guidance.

When runtime finds pending memory guidance, it may prepare a minimal write
proposal. A proposal is not a write. It must name the surface, operation, reason,
target business line or task, and content template, and it must pass the normal
confirmation/write boundary before durable memory is changed.

When updating an existing Task.md, preserve current content by default. Append or
surgically update the smallest recovery section needed. Do not overwrite the
file with a new scaffold unless it is empty or the user explicitly asks.

Task switching, run start, phase closeout, paused Run resume, and approved
Decision checkpoint resume must check unresolved memory guidance before
execution continues. Do not compound missing recovery context by starting more
work on top of it.

UI may display Task Dynamics or Business Records as structured replay, but that
display is not required for this memory contract to hold. The contract is about
durable business recovery first and presentation second.
