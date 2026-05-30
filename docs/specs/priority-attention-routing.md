# Priority Attention Routing

Document id: `taskplane.priority-attention-routing.v1`
Owner: Taskplane product architecture
Layer: phase-loaded coordination skill / business-line attention
Load: Brief generation, Today suggestion ranking, Pilot focus selection,
Next Action choice, escalation review
Scope: business lines, Today suggestions, Next Actions, blockers,
dependencies, decisions, artifacts, source contexts, runs, waiting items,
completion readiness, legacy task queues
Authority: implementation-guiding; product ranking must remain explainable

## Purpose

Priority Attention Routing is the shared "why now" language for Today, Brief,
and Pilot. It decides which business line deserves attention when multiple
business lines or Next Actions can be advanced. It is not a total rule; it is a
phase-loaded skill for focus selection.

GoalPilot stays small and always-loaded. When more than one business line,
Next Action, Decision, record gap, or legacy task recovery item competes for
attention, GoalPilot loads this skill and asks Pilot to choose a focus before
launching execution.

The primary ranking object is the Business Line. The executable target is a
Next Action. A task can appear in this route only as a Next Action carrier or as
a legacy task recovery compatibility input.

## Priority Lanes

| Lane | Meaning | Typical movement |
| --- | --- | --- |
| `escalate_now` | High risk, stale blocker/dependency, unsafe user-owned boundary, risky SOP expiry, or urgent business-line Decision. | Escalate, pause, or create Decision. |
| `unblock_or_decide` | Current blocker, pending Decision, dependency chain, or stale review blocks progress. | Resolve blocker, push upstream, ask for decision. |
| `continue_or_review` | Recent artifact, source, run, sensor signal, accepted learning, or executable Next Action can be verified or continued. | Verify, review, continue, or close phase. |
| `clarify` | Missing business goal, record gap, missing next action, waiting reason, or insufficient recovery context. | Shape, clarify, create a Business Record, or create a small Next Action. |
| `steady` | No urgent signal; business line can progress normally. | Execute the selected Next Action or maintain current plan. |

Lane order is fixed:

```text
escalate_now -> unblock_or_decide -> continue_or_review -> clarify -> steady
```

Within a lane, prefer the business line with the shortest path to unblocking,
the most recent actionable evidence, the clearest executable Next Action, or
the highest recovery value.

## Today Suggestion Types

Today, Brief, and Pilot use the same suggestion language:

| Type | Meaning | Executable target |
| --- | --- | --- |
| `progress` | The business line has an executable Next Action, recent evidence, or completion opportunity. | A Next Action task id when available. |
| `record_gap` | The business line needs a goal, source, review, record, or next-action bridge before execution is safe. | Usually none; the next move is shape/persist/review. |
| `improvement` | Accepted learning, SOP review, stale review, or improvement opportunity should affect future execution. | A Next Action only if one already exists; otherwise review or persist. |

Suggestion `whyNow` must explain why the business line deserves attention now:
source/risk/record gap/Decision/learning signal plus the next safe action. Brief
cards, Today suggestions, and Pilot decisions should preserve this phrasing
instead of inventing separate explanations.

## Shared Surfaces

Today, Brief, and Pilot must use the same attention semantics:

- Today presents business-line suggestions with `type`, `whyNow`, source, risk,
  and optional executable Next Action.
- Brief presents the capped business-line attention summary for the user.
- Pilot uses the same queue to select the next business line and executable
  Next Action, or explain why it is not selecting the currently visible focus.
- Next Action prompts receive the active lane as compact guidance.
- Run events should record the lane, suggestion type, and why-now reason when
  ranking changes a route.
- Legacy task queues may feed compatibility candidates, but they must resolve
  to a business line when possible and must not become the product attention
  model.

## Routing Questions

When ranking business lines, answer:

1. Is anything risky, stale, blocked, or waiting on user approval?
2. Is a pending decision blocking downstream work?
3. Is there a dependency chain with an actionable upstream Next Action?
4. Did a recent run, source, or artifact create a review/continue opportunity?
5. Is a Next Action close to completion and only waiting for final evidence?
6. Is the business line missing a goal, record, source, review, or Next Action?
7. Does accepted learning, SOP expiry, stale review, or sensor signal change
   what should happen next?
8. Does the selected focus have enough context to run, or should it shape first?

## Output Contract

`priority.route` should return:

```ts
type TodaySuggestionType = 'progress' | 'record_gap' | 'improvement';

type PriorityRoute = {
  focusBusinessLineId: string | null;
  executableTaskId: string | null;
  focusTaskId: string | null; // legacy compatibility alias when input is task-only.
  suggestionType: TodaySuggestionType | null;
  lane: PriorityLane;
  whyNow: string;
  reason: string; // compatibility alias for whyNow.
  recommendedMovement: 'ask' | 'research' | 'shape' | 'execute' | 'verify' | 'persist' | 'pause';
  escalationRequired: boolean;
};
```

This output is routing evidence. Durable state changes still require Write
Intent validation and Taskplane service gates.

## Anti-Patterns

- Ranking by newest chat message alone.
- Letting a steady task hide an unresolved decision.
- Treating a task queue as the durable product attention model.
- Treating Brief prose, Today prose, or Pilot prose as the source of truth
  instead of the shared attention evaluator.
- Starting execution before deciding whether the business line should instead
  be shaped, recorded, reviewed, unblocked, verified, or escalated.
- Turning `record_gap` or `improvement` into fake executable tasks.
