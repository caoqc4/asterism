# Business-Line-First Execution Plan

Date: 2026-05-30
Status: Execution plan for Codex goals
Owner: Product design / implementation
Related:
- `docs/plans/2026-05-29-business-line-centered-redesign.md`
- `docs/plans/2026-05-29-business-line-learning-loop-mvp.md`
- `docs/plans/2026-05-30-business-line-architecture-migration-plan.md`

## Purpose

This document breaks the business-line-first redesign into Codex-sized goals.
The intent is to avoid a shallow "business line shell" while also avoiding one
large, fragile rewrite.

The target product shift is:

```text
Task-first control layer
-> Business-line-first operating layer
```

That means a business line must own long-lived context, current action,
decision boundary, execution evidence, review, and reusable learning. Tasks
remain important, but they become next actions inside a business line or
one-off chat actions.

## First Principles

Use these rules whenever a goal requires a design choice.

1. Business line is the durable owner.
   If a record, action, run, source, artifact, decision, or SOP affects a
   long-lived effort, it must be traceable to a `business_line_id`.

2. Task is an execution unit.
   A task can carry next-step execution details, but it should not be the only
   way to recover business context.

3. Review must change future behavior.
   A review that only stores a summary is not enough. It should be able to
   create or update records, next actions, decisions, or business-line
   skill/SOP revisions.

4. Risk gates must be real gates.
   If a change is marked risky, it must not become active context before the
   relevant Decision is approved.

5. Keep system abstractions internal unless users repeatedly act on them.
   Users should see Business, Today, Decisions, Chat, Records, Next Actions,
   Learning, and Skills/SOPs. Avoid exposing extra objects such as Task Package
   until repeated usage proves demand.

6. Reuse existing Taskplane services before inventing parallel systems.
   Task, Decision, Run, Source Context, Artifact, Task File, Process Template,
   Work Habit, MCP, External Access, and AI Runtime surfaces already exist.
   Business lines should claim ownership and routing, not duplicate every
   capability immediately.

## How To Run This With Codex

Do not set one broad goal like "implement business line as first-class object".
Use the goal sequence below. After each goal, ask Codex for:

```text
checkpoint:
- current goal
- files changed
- behavior completed
- tests run
- risks left
- suggested next goal
```

Commit only after a goal has passed its acceptance criteria and review.

Recommended rhythm:

```text
Goal 0 -> review -> commit
Goal 1 -> review -> commit
Goal 2 -> review -> commit
...
```

If a goal starts expanding into unrelated UI polish, template design, or
automation, pause it and split a follow-up goal.

## Current State To Treat As Starting Point

The current MVP shell appears to include:

- `business_lines` as a minimal table.
- business-line records, reviews, and skill revisions.
- a Business page with Overview, Records, Next Actions, and Learning.
- Today suggestions that can reference a business line.
- post-action review that can create a real task from `nextActionSuggestions`.
- accepted SOP text used as learning context for suggestions.

Known gaps from review:

- risky SOP acceptance can still bypass the created Decision unless acceptance
  checks Decision state;
- canonical business-line next actions are linked through recent records, so
  the link can disappear when records fall out of the query window;
- business-line creation is not yet a real conversational/template flow;
- chat, runs, artifacts, source contexts, and task files are not yet
  consistently business-line-bound;
- UI still relies on old task surfaces for many workflows.

## Definition Of Done

The redesign is not done until these statements are true:

- A business line can be created, opened, executed against, reviewed, and
  improved without needing to mentally switch back to "project task" as the
  primary object.
- Every long-lived action has a durable `business_line_id` or an explicit
  adapter relationship.
- Today suggestions are generated from business-line state, not from generic
  task ordering with labels attached.
- The right panel, full Chat page, and focus chat all show the current context
  target and writeback target.
- Risky SOP, structure, permission, external-write, deploy, publish, or money
  changes cannot become active context without a Decision approval path.
- Accepted learning has provenance, scope, versioning, and rollback.
- Rejected or proposed learning does not affect future agent context.
- Cross-business reuse is explicit and copied as proposed learning, not loaded
  silently.
- Existing task, run, source, artifact, and decision capabilities still work.

## Goal 0: Stabilize The Current MVP Shell

### Objective

Make the current business-line MVP safe enough to commit before deeper
migration.

### Scope

Fix only the current shell:

- risky learning Decision gate;
- stable next-action ownership for canonical business lines;
- tests for the above.

### Required Behavior

- `recordReview(... requiresDecision: true)` creates a Decision and leaves
  proposed skill/SOP revisions inactive.
- `acceptSkillRevision` refuses risky revisions until the related Decision is
  approved, or requires an explicit non-risky path.
- canonical business-line next actions do not depend on recent record query
  limits.
- review-created next actions stay visible in Business workspace and Today
  until completed or archived.

### Suggested Data Shape

Prefer a small canonical link table instead of relying on recent records:

```text
business_line_actions
- id
- business_line_id
- task_id
- source_review_id nullable
- source_record_id nullable
- status: active | completed | archived
- created_at
- updated_at
```

For MVP, this table can coexist with task parent-child relationships.

### Acceptance

- A canonical business line with no `legacyTaskId` can create next actions
  through review and keep them visible after many newer records are inserted.
- A risky skill/SOP revision cannot be accepted until its Decision is approved.
- A non-risky skill/SOP revision can still be accepted inline.

### Likely Files

- `src/shared/types/business-line.ts`
- `src/main/db/schema.ts`
- `src/main/db/client.ts`
- `src/main/db/repositories/business-line-repository.ts`
- `src/main/domain/business-line/business-line-service.ts`
- `src/main/domain/business-line/business-line-service.test.ts`
- `src/renderer/pages/BusinessLinesPage.tsx`

### Verification

Run:

```bash
npx vitest run src/main/domain/business-line/business-line-service.test.ts
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Stabilize the current Business Line Learning Loop MVP shell.

Read:
- docs/specs/goalpilot-task-advancement-framework.md
- docs/plans/2026-05-29-business-line-learning-loop-mvp.md
- docs/plans/2026-05-30-business-line-first-execution-plan.md

Fix only Goal 0. Do not expand templates, chat, or UI polish.

Requirements:
- risky business-line skill/SOP revisions must not become active before the
  related Decision is approved;
- canonical business-line next actions must have durable ownership independent
  of recent records pagination;
- review-created next actions must show in Business workspace and Today until
  completed or archived;
- add focused tests for these cases.

Run the verification commands from Goal 0 and stop with a checkpoint.
```

## Goal 1: Canonical Business-Line Ownership

### Objective

Move from "business line shell around tasks" to "business line owns durable
work, while tasks remain execution units".

### Scope

Add direct business-line ownership fields or links to the existing domains that
need business recovery.

### Required Behavior

- Tasks created inside a business line carry `business_line_id`.
- Decisions can be business-line-scoped even when no task exists.
- Runs triggered from a business-line context carry or can resolve
  `business_line_id`.
- Source contexts, task files, and artifacts can be resolved to a business line
  through direct field or owner task/run.
- Existing task-only records continue to work through compatibility adapters.

### Suggested Schema Direction

Use minimal direct columns first where useful:

```text
tasks.business_line_id nullable
decision_requests.business_line_id nullable
runs.business_line_id nullable
source_contexts.business_line_id nullable
artifacts.business_line_id nullable
task_files.business_line_id nullable
```

Do not migrate every historical row immediately. Add resolver functions:

```text
resolveBusinessLineForTask(taskId)
resolveBusinessLineForRun(runId)
resolveBusinessLineForDecision(decisionId)
resolveBusinessLineForSource(sourceContextId)
```

### Acceptance

- Creating a next action from Business workspace creates a task with
  `business_line_id`.
- Business workspace can list actions from `tasks.business_line_id` even if
  there is no legacy parent task.
- A Decision created for a canonical business line keeps
  `business_line_id`.
- Existing project/routine legacy task business lines still load.

### Likely Files

- database schema/client/repositories for task, decision, run, source, artifact,
  task file as needed;
- `src/main/domain/business-line/business-line-service.ts`;
- task creation/update services and IPC types;
- focused service tests.

### Verification

Run focused tests for business line, task repository/service, decision service,
and build:

```bash
npx vitest run src/main/domain/business-line/business-line-service.test.ts src/main/domain/task/task-service.test.ts src/main/domain/decision/decision-service.test.ts
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Implement canonical business-line ownership for core durable objects.

Read the execution plan and complete only Goal 1.

Business line must stop being only a label around tasks:
- tasks created from a business line carry business_line_id;
- Decisions and Runs can resolve business_line_id;
- Business workspace reads canonical business-line actions directly;
- legacy project/routine adapters remain compatible.

Add focused tests and run the verification commands. Stop with a checkpoint.
```

## Goal 2: Business-Line Context Pack And Runtime Routing

### Objective

Make business-line context the default context payload for chat, suggestions,
and agent execution.

### Required Behavior

- A `BusinessLineContextPack` is assembled by a service, not scattered through
  UI code.
- Right-panel chat can receive business-line context, not only task context.
- Agent runs started from a business line include:
  - business-line id and title;
  - current goal/stage;
  - open next actions;
  - latest records;
  - accepted SOPs;
  - active decisions;
  - permission boundaries;
  - missing context.
- UI shows a context indicator:

```text
Context: Global
Context: Business / GoalPilot product
Context: Business / GoalPilot product / Next Action / ...
```

### Acceptance

- Opening AI from a business-line suggestion binds the panel to the business
  line and target next action.
- If no task is selected, the agent still receives the business-line context
  pack.
- A writeback proposal produced from this context targets the correct business
  line.

### Likely Files

- `src/main/domain/business-line/business-line-service.ts`
- runtime/run service context building files
- right panel IPC/types/components
- `src/renderer/components/RightPanel.tsx`
- `src/renderer/pages/BusinessLinesPage.tsx`
- tests for context payload and UI indicator.

### Verification

```bash
npx vitest run src/main/domain/business-line/business-line-service.test.ts src/main/domain/run/run-service.test.ts src/renderer/App.test.tsx -t "business line|context"
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Make BusinessLineContextPack the context payload for business-line chat
and execution.

Complete only Goal 2.

Do not redesign the entire chat UI. Bind the existing right panel and runtime
context to business_line_id, add a clear context indicator, and test that
business-line runs/chats receive accepted SOPs and open next actions.

Run verification and stop with a checkpoint.
```

## Goal 3: Business-Line Creation Wizard And Templates

### Objective

Create business lines as useful workspaces, not empty rows.

### Required Behavior

- Add a short creation flow with five questions:
  1. What is this business line?
  2. What outcome would make it better?
  3. What information must be recorded continuously?
  4. What work can AI do, and what needs confirmation?
  5. Is this based on an existing business line's structure or experience?
- Support first templates:
  - Web Product / Software Product;
  - Custom.
- Generate editable default structure, initial records, review prompts, and
  proposed business-line SOPs.
- Creation from existing business line copies structure and active SOPs as
  proposed revisions, not stale history.

### Non-Goals

- Do not add Personal Media or Ecommerce yet.
- Do not build a complex visual folder editor.
- Do not copy all old task memory into new business lines.

### Acceptance

- A user can create a useful Web Product business line in under two minutes.
- The generated workspace has records/files structure and initial suggestions.
- Inherited SOPs require explicit acceptance before active use.

### Verification

```bash
npx vitest run src/main/domain/business-line/business-line-service.test.ts src/renderer/App.test.tsx -t "business line|creation|template"
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Implement a lightweight Business Line creation wizard and first template.

Complete only Goal 3.

Add Web Product / Software Product plus Custom. Generate initial structure,
records, review prompts, and proposed SOPs. If creating from another business
line, copy structure and active SOPs as proposed learning only.

Keep the UI simple. Add focused tests and stop with a checkpoint.
```

## Goal 4: Records, Files, And Business Memory

### Objective

Make Records/Files a business memory surface rather than a passive list.

### Required Behavior

- Business records have stable types:
  `signal`, `hypothesis`, `decision`, `action`, `artifact`, `result`,
  `review`, `rule`.
- Generated folder structures map to records/files without making folder
  management the primary product.
- Source contexts and artifacts show as business records with provenance.
- Records can be marked as affecting or not affecting future context.
- Cross-business records are excluded by default.

### Acceptance

- Business workspace can show records from native business-line records and
  linked task/run/source/artifact records.
- Agent context includes only `should_affect_future_context` records by default.
- User can see why a record is in future context.

### Verification

```bash
npx vitest run src/main/domain/business-line/business-line-service.test.ts src/renderer/App.test.tsx -t "records|source|artifact|business"
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Implement Goal 4 only - business-line Records as a memory projection layer.

Complete only Goal 4.

Unify native business-line records with linked source contexts, artifacts,
task files, decisions, and reviews as a business memory surface.

Required:
- stable record types;
- provenance for every projected record;
- should_affect_future_context controls;
- cross-business records excluded by default;
- context pack reads only included records by default.

Keep this slice narrow:
- do not build a full document editor;
- do not build a visual folder editor;
- do not implement Goal 5 SOP versioning or rollback;
- do not redesign the whole Business workspace.

Add focused tests and stop with a checkpoint.
```

## Goal 5: Learning, SOP Versioning, And Rollback

### Objective

Make accepted learning safe, scoped, versioned, and reversible.

### Required Behavior

- Skill/SOP revisions include:
  - previous content;
  - next content;
  - change reason;
  - source review;
  - approved by;
  - status;
  - effective time;
  - rollback target;
  - optional review-after/expiration.
- Accepting a revision supersedes prior active revision for the same skill
  scope.
- Rejecting a revision prevents it from entering future context.
- Rolling back restores prior revision or disables the current one.
- Risky revisions require an approved Decision before activation.

### Acceptance

- Active context pack contains only active revisions.
- Proposed, rejected, disabled, and superseded revisions do not influence
  suggestions.
- UI shows provenance and rollback affordance.

### Verification

```bash
npx vitest run src/main/domain/business-line/business-line-service.test.ts src/renderer/App.test.tsx -t "SOP|revision|rollback|Decision"
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Implement Goal 5 only - safe business-line SOP revision lifecycle.

Complete only Goal 5.

Add proposed, active, rejected, superseded, and disabled SOP revisions with
provenance, source review, diff/previous content, approval source, rollback,
and optional review-after/expiration.

Risky activation must require an approved Decision before the revision can
enter future context.

Keep this slice narrow:
- keep the visible model as Business Line Skills/SOPs;
- do not introduce Task Packages, marketplace, or shareable task bundles;
- do not redesign global Skills;
- do not implement automation or sensor behavior.

Add tests and stop with a checkpoint.
```

## Goal 6: Today Suggestion Engine

### Objective

Make Today a business-line suggestion surface, not a task list with business
labels.

### Required Behavior

Each suggestion includes:

```text
type: progress | record_gap | improvement
business_line_id
title
why_now
expected_impact
effort
risk
confidence
source_record_ids
next_step
requires_decision
task_id nullable
```

Suggestions should be ranked across business lines using:

- blocked/risky decisions;
- open next actions;
- recent evidence;
- missing context;
- accepted learning;
- stale review or stale signal;
- user focus/order adjustments.

### Acceptance

- Today can explain why each suggestion appears.
- A completed review can change the next suggestion's `why_now` and sources.
- A record gap suggestion does not pretend to be executable work.
- Improvement suggestions do not replace progress suggestions when actionable
  work exists.

### Verification

```bash
npx vitest run src/main/domain/business-line/business-line-service.test.ts src/renderer/App.test.tsx -t "Today|suggestion|business"
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Implement Goal 6 only - Today business-line suggestion engine.

Complete only Goal 6.

Build deterministic, testable suggestion generation for progress, record_gap,
and improvement suggestions across business lines.

Each suggestion must carry:
- businessLineId;
- type;
- why_now;
- expected impact;
- effort;
- risk;
- confidence;
- source record ids;
- next step;
- requires_decision;
- optional taskId.

Keep this slice narrow:
- do not remove existing task attention logic until business suggestions pass
  focused tests;
- do not redesign the whole Today UI;
- do not make record_gap suggestions look like executable work;
- do not let improvement suggestions replace actionable progress suggestions.

Run tests and stop with a checkpoint.
```

## Goal 7: Execution And Post-Run Review Integration

### Objective

Connect business-line execution to the existing run/writeback/review system.

### Required Behavior

- Running a next action from Business workspace records business-line execution
  identity.
- Completed runs can prompt a structured review.
- Writeback proposals can create:
  - business records;
  - next actions;
  - source contexts;
  - artifacts;
  - decisions;
  - proposed SOP revisions.
- Verification evidence remains tied to task/run while also recoverable from
  the business line.

### Acceptance

- A business-line action can be executed, verified, reviewed, and reflected in
  future suggestions without manually opening the old Tasks page.
- Existing CLI-first evidence gates remain intact.
- Future API promotion paths do not regress.

### Verification

```bash
npx vitest run src/main/domain/business-line/business-line-service.test.ts src/main/domain/run/run-service.test.ts src/shared/product-feature-impact-audit.test.ts
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Implement Goal 7 only - business-line execution and post-run review
integration.

Complete only Goal 7.

Business-line Next Actions must be executable through the existing runtime
gates. Completed runs should produce review/writeback options that update the
business line.

Writeback/review options may create:
- business records;
- next actions;
- source contexts;
- artifacts;
- decisions;
- proposed SOP revisions.

Keep this slice narrow:
- do not weaken existing CLI/API evidence requirements;
- do not rebuild runtime orchestration;
- do not implement Goal 8 navigation redesign;
- do not implement Goal 9 automations or sensors.

Run verification and stop with a checkpoint.
```

## Goal 8: Business-First UI Interaction

### Objective

Make the app feel business-line-first at the interaction level.

### Required Behavior

- Work navigation:

```text
Today
Business
Chat
Decisions
```

- Capabilities navigation stays:

```text
External Access
Skills
MCP
AI Runtime
Work Habits
Settings
```

- Tasks is not a top-level mental model, but task detail remains reachable as
  Next Action detail.
- Business workspace supports:
  - Overview;
  - Records;
  - Next Actions;
  - Learning;
  - secondary Settings.
- Add full Chat page and Focus chat mode after business-line context is ready.
- Sidebar supports expanded, compact, and focus states.

### Acceptance

- New user can start from Today or Business without being taught "manage
  tasks first".
- Old task detail is reachable but visually subordinate.
- Chat always displays context and writeback target.
- No capability route disappears.

### Verification

```bash
npx vitest run src/renderer/App.test.tsx src/renderer/lib/router.test.ts -t "navigation|business|chat|sidebar|context"
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Implement Goal 8 only - business-first UI interaction pass.

Complete only Goal 8.

Make Today, Business, Chat, and Decisions the Work model. Keep capability
routes intact. Add compact/focus sidebar and full/focus chat only after context
target display is wired.

Required boundaries:
- Tasks should not be a top-level mental model, but task detail and legacy
  task explorer recovery route must remain reachable;
- do not move External Access, MCP, AI Runtime, or Work Habits into
  per-business-line configuration matrices;
- Chat must always display context and writeback target;
- no capability route may disappear.

Run verification and stop with a checkpoint.
```

## Goal 9: Business-Line Automations And Sensors

### Objective

Move scheduled/event work and external signals into business-line loops without
building a broad automation product.

### Required Behavior

- Scheduled/event tasks appear as business-line automations.
- External Access previews produce reviewable business records.
- Read-only sensors can collect candidates.
- Mutating/external write actions require Decisions according to risk level.
- MCP and runtime configuration remain global; usage is action-scoped.

### Acceptance

- A business line can show "this loop watches Gmail/calendar/source X" without
  per-business-line MCP/runtime matrices.
- No external evidence enters future context without review or confirmation.
- Existing scheduler/background tests still pass.

### Verification

```bash
npx vitest run src/main/domain/business-line/business-line-service.test.ts src/main/domain/run/run-service.test.ts src/renderer/App.test.tsx -t "automation|scheduled|external|business"
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Implement Goal 9 only - business-line automations and sensors.

Complete only Goal 9.

Keep MCP, runtime, and external authorization global. Business-line actions can
use them through action-level gates. Do not build a complex automation builder.

Required boundaries:
- scheduled/event tasks may appear as business-line automations;
- external previews may produce reviewable business records;
- sensors are read-only unless a Decision-approved action explicitly mutates
  local, external, public, or money-affecting state;
- no external evidence enters future context without review or confirmation;
- do not create per-business-line MCP/runtime/provider matrices.

Run verification and stop with a checkpoint.
```

## Goal 10: Migration, Cleanup, And Product Audit

### Objective

Remove task-first leftovers only after business-line replacements are proven.

### Required Behavior

- Identify old task-first labels, routes, and copy.
- Keep compatibility routes for recovery if needed.
- Update product feature audit to evaluate business-line-first readiness.
- Add smoke tests for core user journeys:
  - create business line;
  - get Today suggestion;
  - execute next action;
  - review result;
  - accept SOP;
  - see changed next suggestion;
  - route risky update through Decision.

### Acceptance

- The app's primary language is Business, Today, Decisions, Chat, Records,
  Next Actions, and Learning.
- Existing historical task data remains recoverable.
- Product audit can distinguish task-shell state from true business-line
  ownership.

### Verification

```bash
npm test -- src/main/domain/business-line/business-line-service.test.ts src/renderer/App.test.tsx
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Implement Goal 10 only - migration cleanup and business-line-first product
audit.

Complete only Goal 10.

Do not delete compatibility surfaces unless tests prove replacement behavior.
Update copy, route labels, audit checks, and smoke tests so the app can tell
whether business-line-first is truly implemented.

Required boundaries:
- keep historical task data recoverable;
- preserve compatibility routes until smoke tests cover replacement journeys;
- do not remove CLI/API evidence gates;
- do not introduce new top-level concepts beyond Business, Today, Chat,
  Decisions, Records, Next Actions, Learning, Skills/SOPs, and Capabilities.

Run verification and stop with a checkpoint.
```

## Suggested Commit Boundaries

Use one commit per completed goal:

```text
business-line: stabilize learning loop gates
business-line: add canonical ownership links
business-line: bind context pack to chat and runs
business-line: add creation wizard and web product template
business-line: unify records as business memory
business-line: version and gate SOP learning
business-line: rank Today by business suggestions
business-line: integrate execution review writeback
business-line: finish business-first navigation
business-line: audit migration readiness
```

## Stop Conditions

Stop a goal and checkpoint instead of continuing when:

- database migration touches more than two adjacent domains beyond the goal;
- tests require disabling existing task/run/decision behavior;
- a UI change requires new product decisions not covered here;
- a safety gate becomes weaker than before;
- a new top-level concept appears that is not Business, Today, Chat,
  Decisions, Records, Next Actions, Learning, Skills/SOPs, or Capabilities.

## What Not To Ask Codex To Do Yet

Do not ask for these until Goal 0 through Goal 7 are stable:

- full marketplace/task package system;
- Personal Media and Ecommerce templates;
- fully autonomous background self-improvement;
- token usage or company-brain analytics;
- complex per-business-line MCP/runtime matrices;
- folder-level Work Habits;
- full metrics dashboard.
