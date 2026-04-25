# Completion Evidence Tool Decision

## Status

Proposed for the next agent execution-layer slice.

## Decision

Do not expose agent tools that directly satisfy completion criteria or transition
a task to `completed` in the next slice.

The next closeout-adjacent agent capability should be evidence review only:

- inspect current completion criteria
- inspect recent approved Decisions, completed Runs, and artifacts
- draft a run output that explains which evidence appears to support which
  criterion
- optionally create a draft Decision when completion readiness needs explicit
  human approval

The agent must not automatically:

- call `completion_criteria.satisfy`
- reopen or edit existing criteria
- transition a task to `completed`
- treat a successful workspace patch or command as completion evidence by
  itself

## Why

Completion criteria are task exit conditions. Satisfying one changes the user's
trust boundary more than adding context or updating a next step. A mistaken
criterion satisfaction can make Home and Action Desk present a task as ready to
close, so it needs stronger evidence handling and a visible human confirmation
path.

The product already has a good manual closeout loop:

- users can add, satisfy, and reopen criteria directly
- Home surfaces closeout-ready and near-complete tasks
- Tasks can show approved Decisions, completed Runs, and artifacts as possible
  evidence
- the final `completed` transition remains a user action

The agent should reinforce that loop before it can mutate it.

## Allowed Next Slice

Introduce a draft-only closeout review path before any mutating closeout tool.

Possible registry tool name:

```text
task.review_completion_evidence
```

Suggested behavior:

- read task completion status from working context
- read recent timeline evidence through existing context/timeline inspection
- return a structured observation summarizing:
  - open criteria
  - likely supporting evidence
  - missing evidence
  - whether a Decision is recommended before closeout
- write only run-step observations and final run output

This tool may be prompt-exposed behind `allowTaskMutationTools=true` only if it
does not mutate task state. If it later creates a draft Decision, that should use
the existing draft-only `decision.draft` behavior rather than creating a formal
Decision automatically.

## Deferred Tools

Keep these unavailable until a later decision accepts their confirmation model:

- `task.satisfy_completion_criterion`
- `task.reopen_completion_criterion`
- `task.transition_completed`

Before any of those tools are exposed, require:

- explicit evidence input naming the criterion and source object
- a confirmation checkpoint or formal Decision for high-risk tasks
- timeline entries that name the evidence source
- renderer coverage showing the user can see why the criterion changed
- fallback behavior when evidence is missing or ambiguous

## Acceptance Criteria

- normal agent runs cannot satisfy criteria or complete tasks
- task-tool opt-in copy continues to avoid promising automatic closeout
- closeout review output names missing evidence instead of silently closing work
- successful patch or command tools do not become completion evidence by default
- future mutating closeout tools require a separate accepted decision
