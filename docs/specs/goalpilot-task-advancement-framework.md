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

The framework is necessary as a product-level router, not as a script. Its job
is to choose the next kind of movement and keep task state recoverable. It must
not override a capable runtime's normal reasoning, research, or execution
abilities with unnecessary clarification rituals.

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

Agents should use this framework as a lightweight routing reference when the
next movement is ambiguous, state-changing, or cross-task. For obvious low-risk
turns, apply the smallest useful movement directly while preserving the same
principles.

## First Principles

Task advancement starts from one decision point:

What is the smallest movement that makes the task more clear, executable,
verified, or recoverable without creating unnecessary structure?

Prefer movement over interrogation. Mature agent runtimes usually gather
context, act, and verify in short loops. GoalPilot should preserve that loop:
use clarification only when it unlocks the next move, not as the default way to
make progress.

Clarification should stay focused, not artificially singular. Prefer one
decisive question when it is enough. Ask two or three tightly related questions
only when answering them together prevents another avoidable round trip, and
make clear which decision point they serve.

Do not ask questions just because a choice exists. If the user has already
given enough signal to establish a reasonable default, state the default and
move the task forward. Use research, source review, existing task memory, or a
draft artifact before asking the user to decide secondary structure, style, or
taxonomy.

For product, website, document, or tutorial tasks, theme, target audience, and
content shape are usually enough to advance. Do not ask whether the work is for
private or public use, directory or learning path, or similar secondary product
choices when those choices can be handled as adjustable defaults in the draft.

Use the framework silently as a reasoning aid. Expose the reasoning only when a
decision requires approval, the task is blocked, or the user asks why.

Do not turn this framework into a visible checklist. A normal turn should still
use the smallest useful output for the current phase.

## GoalPilot Loop

The Goal side understands the work:

- What is the real goal?
- Which task owns the current work: parent, child, successor, or new task?
- Is the current boundary clear enough to act?
- Would source review, web research, existing files, or prior task memory answer
  the uncertainty better than asking the user?
- What would count as success or acceptable progress?
- What is uncertain: goal, scope, evidence, execution, risk, or ownership?
- What blockers, dependencies, pending decisions, deadlines, sources, files, or
  work habits materially affect the next move?
- Is the current context clean, or is it contaminated by another task, stale
  prompt, unrelated selected file, or previous conversation?

The Pilot side chooses the movement:

- Should the Agent clarify, research, shape, decompose, select a next task,
  execute, verify, persist, hand off, or pause?
- What is the smallest useful next movement?
- Does the movement need user confirmation before changing durable state?
- Does the movement need a task file, Decision, Task Record, source, artifact,
  or only continued discussion?
- After the movement, should the Agent stay on this task, return to the parent,
  enter a child task, switch to a successor, or stop?

## Task Situation Map

When the next movement is not obvious, classify the current situation before
choosing a movement:

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
- Research-dependent task: useful progress depends on outside facts, product
  examples, current docs, source review, or comparable references.
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
- Research: gather or request evidence from web, files, docs, sources, or
  connectors before asking the user to decide details the Agent can investigate.
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
| Captured task missing goal, scope, criteria, or next step | Shape | Which missing field or tightly related set blocks useful progress? |
| Product, website, document, or tutorial task with theme, audience, and content shape | Research or Shape | Can sources, examples, or a draft answer the remaining uncertainty? |
| Project needing decomposition | Decompose | Is the task too broad for one execution loop? |
| Project with existing children | Select next task or Verify | Are existing children still the right structure? |
| Child task needing clarification | Clarify or Shape | Is the child boundary clean and parent-aligned? |
| Research-dependent task | Research | What source or tool should be used before asking the user? |
| Executable task | Execute | Are context, permissions, and acceptance criteria sufficient? |
| Blocked or waiting task | Pause or surface Decision | What exact blocker, dependency, or approval prevents progress? |
| Verification or closeout | Verify | What evidence proves or disproves completion? |
| Handoff or next task | Persist/Handoff or Select next task | What minimal recovery context must survive the switch? |
| Scheduled, event-triggered, or routine task | Shape or Execute | Are trigger, cadence, scope, and record cadence clear? |

The map is not a script. If a smaller movement would reduce uncertainty or
avoid unnecessary structure, choose the smaller movement.

## Research Guidance

Use Research when the task depends on current facts, public documentation,
market or product examples, implementation references, or source material that
the Agent can inspect more reliably than the user can describe from memory.

Research may use web search, source ingestion, MCP/connectors, local files,
confirmed task sources, or the selected Agent CLI runtime's native read-only
research capabilities. Taskplane-managed tools and official CLI-native tools are
separate capability layers; do not downgrade a capable CLI just because
Taskplane did not inject a matching product-owned tool.

If a live web, connector, or source tool is truly unavailable, do not invent
citations or ask the user to make secondary product choices. State the missing
research source as the next action and still produce a best-effort draft from
available context.

For website, tutorial, documentation, and product-planning tasks, the default
after theme, audience, and content shape are known is Research or Shape, not
Clarify. A good first movement is often: summarize the assumed positioning,
identify useful sources to inspect, propose first-pass scope/non-goals, and
name the next research or build action.

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

If the user only asks to start or continue, use the child title, summary, task
memory, and parent context to propose a reasonable first move. Ask only when the
task state is too empty to advance usefully, the missing information changes a
key risk, or it would materially alter the deliverable boundary.

For website or tutorial child tasks with enough intent, the default next move is
to produce a first-pass positioning, page/content scope, non-goals, and the next
research or build action. Do not keep the task in clarification mode.

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
