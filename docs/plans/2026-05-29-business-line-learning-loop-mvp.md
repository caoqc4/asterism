# Business Line Learning Loop MVP

Date: 2026-05-29
Status: Draft experiment spec
Owner: Product design
Related: [Business-Line-Centered GoalPilot Redesign](2026-05-29-business-line-centered-redesign.md)

## Product Hypothesis

GoalPilot becomes meaningfully different from task managers, note apps, and
generic agent chat when it can prove this loop:

```text
business line -> suggestion -> action -> review -> skill/SOP update -> better next suggestion
```

The MVP should prove one thing:

> After one real business action, GoalPilot can turn the result into durable
> learning and make the next recommendation better.

Do not use this slice to prove multi-template coverage, full automation,
marketplace sharing, company brain, or advanced chat layouts.

## Target Dogfood Scenario

Use GoalPilot's own development as the first business line.

```text
Business line: GoalPilot product
Goal: make GoalPilot a business-line-centered AI workbench
Template: Web Product / Software Product
```

The slice should support:

1. Create or import the GoalPilot product business line.
2. Show a Today suggestion tied to that business line.
3. Execute or assist one action, such as refining the navigation model or
   updating a design doc.
4. Capture the result as a structured review.
5. Propose a skill/SOP update, such as a product-design decision rule.
6. Accept the update and apply it to the next suggestion.

## MVP Surface

### Work Navigation

```text
Work
- Today
- Business
- Chat
- Decisions

Capabilities
- External Access
- Skills
- MCP
- AI Runtime
- Work Habits
- Settings
```

Chat can keep the existing right panel at first. A full Chat page and focus
chat can follow after the learning loop is real.

### Business Workspace

MVP visible areas:

```text
Overview
Records
Next Actions
Learning
```

Settings and deeper skill editing can be secondary.

### Today Suggestion

Each suggestion must show:

```text
type: progress | record_gap | improvement
business line
why now
next step
source records
risk
requires decision
```

This is the minimum trust layer. A vague AI suggestion is not enough.

## Minimal Data

### Business Line

```text
id
title
summary
goal
kind
legacy_task_id nullable
created_at
updated_at
```

### Business Line Context Pack

Assemble for business-line-bound chat, run, and suggestions:

```text
business summary
current goal
recent changes
active decisions
open next actions
latest records
accepted skills/SOPs
known constraints
permission boundaries
missing context
```

### Record

```text
type: signal | hypothesis | decision | action | artifact | result | review | rule
business_line_id
source
summary
created_at
confidence
linked_action_id
linked_decision_id
should_affect_future_context
```

### Review

```text
review_id
business_line_id
source_action_id
result_summary
evidence_items[]
hypothesis_change
skill_update_suggestions[]
next_action_suggestions[]
confidence
requires_decision
created_at
```

### Skill/SOP Revision

```text
skill_id
business_line_id
scope_path
previous_content
next_content
change_reason
source_review_id
approved_by
status: proposed | active | disabled | superseded
effective_at
rollback_target_revision_id
```

## User Flow

1. User opens Today.
2. GoalPilot shows one suggestion for the GoalPilot product business line.
3. User opens the business line and sees the context behind the suggestion.
4. User executes or asks the agent to assist.
5. Completion opens a lightweight Learning prompt:

```text
What changed?
What evidence came back?
Did this validate or change the assumption?
Should any skill/SOP change?
What next action follows?
```

6. GoalPilot creates a review record and proposes a skill/SOP revision.
7. User accepts, edits, or rejects the revision.
8. The next Today suggestion references the accepted learning.

## Acceptance Criteria

- A business line exists as a real product object, even if it adapts legacy task
  data.
- A Today suggestion can be traced to one business line and at least one source
  record or missing-context reason.
- A completed action can produce a structured review.
- A review can propose a business-line skill/SOP update.
- Accepted skill/SOP updates are loaded into the next business-line context
  pack.
- Rejected updates do not influence future suggestions.
- Cross-business records and skills are not loaded unless explicitly selected.
- Risky updates route through Decisions.

## Non-Goals

- multiple polished business templates;
- full-screen chat;
- marketplace or task packages;
- autonomous background code changes;
- full metrics dashboard;
- per-business-line MCP/runtime configuration matrix;
- folder-level Work Habits;
- importing all historical task memory into a new canonical schema.

## Implementation Notes

Prefer the smallest adaptation over a rewrite:

- add a minimal `business_lines` shell;
- adapt existing top-level project/routine tasks with `legacy_task_id`;
- reuse `BriefPage` logic for Today ordering;
- reuse `TasksPage` detail capabilities inside the business workspace;
- reuse `DecisionsPage` for approval;
- reuse existing process templates/work habits concepts, but expose accepted
  business-line SOPs separately from global user habits.

The MVP is successful only if the next suggestion demonstrably changes because
of accepted learning from the previous action.
