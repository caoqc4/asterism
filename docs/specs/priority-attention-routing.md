# Priority Attention Routing

Document id: `taskplane.priority-attention-routing.v1`
Owner: Taskplane product architecture
Layer: phase-loaded coordination skill / multi-task focus
Load: Brief generation, multi-task ranking, Pilot focus selection, next-task
choice, escalation review
Scope: active tasks, blockers, dependencies, decisions, artifacts, source
contexts, runs, waiting items, completion readiness
Authority: implementation-guiding; product ranking must remain explainable

## Purpose

Priority Attention Routing is the shared ranking language for Brief and Pilot.
It decides which task deserves attention when multiple tasks can be advanced.
It is not a total rule; it is a phase-loaded skill for focus selection.

GoalPilot stays small and always-loaded. When more than one task or mission is
competing for attention, GoalPilot loads this skill and asks Pilot to choose a
focus before launching execution.

## Priority Lanes

| Lane | Meaning | Typical movement |
| --- | --- | --- |
| `escalate_now` | High risk, stale blocker/dependency, unsafe or user-owned boundary. | Escalate, pause, or create Decision. |
| `unblock_or_decide` | Current blocker, pending decision, or dependency chain blocks progress. | Resolve blocker, push upstream, ask for decision. |
| `continue_or_review` | Recent artifact, source, run, or nearly complete criteria can be verified or continued. | Verify, review, continue, or close phase. |
| `clarify` | Missing next step, waiting reason, or insufficient task definition. | Shape, clarify, or create a small next step. |
| `steady` | No urgent signal; task can progress normally. | Execute or maintain current plan. |

Lane order is fixed:

```text
escalate_now -> unblock_or_decide -> continue_or_review -> clarify -> steady
```

Within a lane, prefer the task with the shortest path to unblocking, the most
recent actionable evidence, or the clearest completion opportunity.

## Shared Surfaces

Brief and Pilot must use the same priority semantics:

- Brief presents the attention queue for the user.
- Pilot uses the queue to select the next focus task or explain why it is not
  selecting the currently visible task.
- Task detail prompts receive the active lane as compact guidance.
- Run events should record the lane and reason when ranking changes a route.

## Routing Questions

When ranking tasks, answer:

1. Is anything risky, stale, blocked, or waiting on user approval?
2. Is a pending decision blocking downstream work?
3. Is there a dependency chain with an actionable upstream task?
4. Did a recent run, source, or artifact create a review/continue opportunity?
5. Is a task close to completion and only waiting for final evidence?
6. Is the task missing a next step or clear recovery context?
7. Does the selected focus have enough context to run, or should it shape first?

## Output Contract

`priority.route` should return:

```ts
type PriorityRoute = {
  focusTaskId: string | null;
  lane: PriorityLane;
  reason: string;
  recommendedMovement: 'ask' | 'research' | 'shape' | 'execute' | 'verify' | 'persist' | 'pause';
  escalationRequired: boolean;
};
```

This output is routing evidence. Durable state changes still require Write
Intent validation and Taskplane service gates.

## Anti-Patterns

- Ranking by newest chat message alone.
- Letting a steady task hide an unresolved decision.
- Treating Brief prose as the source of truth instead of the shared priority
  evaluator.
- Starting execution before deciding whether the task should instead be
  unblocked, verified, or escalated.
