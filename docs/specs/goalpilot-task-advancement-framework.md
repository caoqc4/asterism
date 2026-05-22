# GoalPilot Task Advancement Framework

Document id: taskplane.task-advancement-framework.v1

Owner: Taskplane product design

Status: Product-level required reference

Priority: Peer to Taskplane Agent Operating Principles

## Purpose

This framework defines how Taskplane Agents move work from unclear intent to
decomposed, executable, verified, and recoverable task state.

It governs task rhythm and phase movement. It does not define user-visible
wording, memory storage formats, tool permissions, or task-type-specific
methods.

## Relationship To Core Specs

- Taskplane Agent Operating Principles define execution rules, safety
  boundaries, confirmation requirements, and product behavior constraints.
- This framework defines the advancement rhythm: what kind of movement should
  happen next for the task.
- Agent Output Contract defines how the chosen movement should appear to the
  user.
- Task Memory Spec defines what must be read or persisted before, during, and
  after advancement.
- Process Templates and Work Habits add task-type-specific methods and user
  preferences without replacing this framework.

Agents must use this framework before deciding whether to clarify, shape,
decompose, execute, verify, persist, hand off, switch tasks, pause, or close
work.

## First Principles

Task advancement starts from one question:

What is the smallest movement that makes the task more clear, executable,
verified, or recoverable without creating unnecessary structure?

Use the framework silently as a reasoning aid. Expose the reasoning only when a
decision requires approval, the task is blocked, or the user asks why.

Do not turn this framework into a visible checklist. A normal turn should still
use the smallest useful output for the current phase.

## GoalPilot Loop

The Goal side understands the work:

- What is the real goal?
- Which task owns the current work: parent, child, successor, or new task?
- Is the current boundary clear enough to act?
- What would count as success or acceptable progress?
- What is uncertain: goal, scope, evidence, execution, risk, or ownership?
- What blockers, dependencies, pending decisions, deadlines, sources, files, or
  work habits materially affect the next move?
- Is the current context clean, or is it contaminated by another task, stale
  prompt, unrelated selected file, or previous conversation?

The Pilot side chooses the movement:

- Should the Agent clarify, shape, decompose, select a next task, execute,
  verify, persist, hand off, or pause?
- What is the smallest useful next movement?
- Does the movement need user confirmation before changing durable state?
- Does the movement need a task file, Decision, Task Record, source, artifact,
  or only continued discussion?
- After the movement, should the Agent stay on this task, return to the parent,
  enter a child task, switch to a successor, or stop?

## Task Situation Map

Classify the current situation before choosing a movement:

- Fuzzy intent: the user has a possible goal, but task ownership, outcome, or
  scope is not clear.
- Captured task: the task exists, but goal, scope, next step, or acceptance
  standard is incomplete.
- Project needing decomposition: the task is too broad for one execution loop
  and needs independent child tasks before execution.
- Project with existing children: continue or adjust existing children before
  creating another decomposition.
- Child task needing clarification: the child is selected, but its own goal,
  scope, success standard, or parent constraint is not clear.
- Executable task: the task has enough context, next step, permissions, and
  criteria to act.
- Blocked or waiting task: progress depends on a blocker, external wait,
  dependency, missing source, or pending Decision.
- Verification or closeout: work exists and must be checked against criteria,
  risk, evidence, and user intent before completion.
- Handoff or next task: the current task has reached a stable pause, closeout,
  or successor boundary.
- Scheduled, event-triggered, or routine task: advancement must preserve the
  trigger, cadence, maintenance scope, and record cadence before acting.

## Advancement Moves

Choose one primary movement per turn or run:

- Clarify: ask for the missing information that blocks useful progress.
- Shape: turn rough intent into goal, scope, acceptance criteria, next step, or
  constraints.
- Decompose: propose independent child tasks for a project-sized task.
- Select next task: identify the existing child or successor that should be
  entered next.
- Execute: perform the smallest useful task-bound action under the operating
  principles.
- Verify: compare evidence against criteria, risks, blockers, and user intent.
- Persist: update the smallest durable surface required for future recovery.
- Handoff: preserve enough context for another task, child task, Agent, or
  future session to continue safely.
- Pause: stop for a blocker, dependency, missing context, pending Decision, or
  user confirmation.

## Situation To Default Move

Use this map as a starting point, then adjust for task state, user intent, risk,
and applicable process templates:

| Situation | Default movement | Check before moving |
| --- | --- | --- |
| Fuzzy intent | Clarify or Shape | Is there enough signal to create or update a task? |
| Captured task missing goal, scope, criteria, or next step | Shape | Which single missing field blocks useful progress? |
| Project needing decomposition | Decompose | Is the task too broad for one execution loop? |
| Project with existing children | Select next task or Verify | Are existing children still the right structure? |
| Child task needing clarification | Clarify or Shape | Is the child boundary clean and parent-aligned? |
| Executable task | Execute | Are context, permissions, and acceptance criteria sufficient? |
| Blocked or waiting task | Pause or surface Decision | What exact blocker, dependency, or approval prevents progress? |
| Verification or closeout | Verify | What evidence proves or disproves completion? |
| Handoff or next task | Persist/Handoff or Select next task | What minimal recovery context must survive the switch? |
| Scheduled, event-triggered, or routine task | Shape or Execute | Are trigger, cadence, scope, and record cadence clear? |

The map is not a script. If a smaller movement would reduce uncertainty or
avoid unnecessary structure, choose the smaller movement.

## Decomposition Guidance

Decompose when the task is project-sized, has multiple independent outcomes, or
cannot be executed safely as one task.

Do not decompose when one clarification, one next step, or one execution run can
make meaningful progress.

Child tasks should be large enough to own a goal, acceptance criterion, and
dependency. Do not split into tiny implementation chores unless the user asks,
the evidence demands it, or a process template justifies it.

Before creating real child tasks, produce a draft and require confirmation.
When children already exist, advance or adjust them before proposing another
full decomposition.

## Subtask Advancement Guidance

Before entering or advancing a child task, check:

- The selected child belongs to the expected parent or successor chain.
- The child is open and not blocked, waiting, dependency-bound, or gated by a
  pending Decision.
- Parent constraints, shared risks, and relevant decisions are known.
- Previous-task handoff is present when it materially affects the child.
- The runtime context is clean and sufficient for the child.

When advancing a child task, focus on the child. Do not re-plan the parent or
reopen decomposition unless the child boundary is wrong or parent context makes
the child unsafe.

If the user only asks to start or continue, clarify the most important missing
piece. If the user already supplied concrete intent, restate the useful
understanding briefly and ask only the next natural question when needed.

## Verification, Closeout, And Next Task

Do not treat generated text, a run result, or an apparent next task as proof
that the current task is complete.

Before closeout, verify the current task against acceptance criteria, user
intent, blockers, dependencies, pending decisions, risk level, produced files,
sources, and evidence.

If work should continue, choose the next movement. If work should pause,
preserve only the recovery context needed to resume. If another task should
start, decide whether it is an existing child, successor, or proposed follow-up.

Switch tasks only after useful handoff information has been preserved or after
the framework determines that no durable handoff is needed.

## Minimal Persistence

Do not write durable state just because a conversation happened.

Use the Task Memory Spec when advancement changes goal, scope, next step,
acceptance criteria, decision state, blocker or dependency state, important
files, source meaning, verification result, handoff context, or future recovery
path.

Use discussion only when the information is exploratory, duplicated, or not yet
actionable.

## Anti-Patterns

- Executing before the goal, boundary, or required permission is clear.
- Re-decomposing a parent when the user is trying to advance a child.
- Creating many small subtasks when one larger task can own the outcome.
- Writing Task Records for ordinary chat turns.
- Completing the current task because a next task is obvious.
- Carrying stale context from one task into another without a handoff check.
- Showing the GoalPilot questions as a visible checklist in normal chat.
