# Business-Line Rule-Layer Migration Plan

Date: 2026-05-30
Status: Execution plan for Codex goals
Owner: Product design / implementation
Related:
- `docs/plans/2026-05-29-business-line-centered-redesign.md`
- `docs/plans/2026-05-29-business-line-learning-loop-mvp.md`
- `docs/plans/2026-05-30-business-line-first-execution-plan.md`

## Purpose

Goal 0 through Goal 10 of the business-line-first implementation changed the
product center from task-first to business-line-first. The next step is not a
large architecture rewrite yet. The next step is to migrate the rule layer so
future Codex, Claude, API, scheduler, and matrix-runtime work does not keep
falling back to task-first assumptions.

This document breaks that migration into Codex-sized goals.

The target rule-layer shift is:

```text
task router / task memory / task handoff / task scheduler
-> business-line advancement / business memory / business handoff / loop scheduler
```

Tasks remain the execution unit. A task can still carry run state, files,
source contexts, artifacts, and completion checks. The rule layer should,
however, treat a business line as the durable owner whenever the work affects a
long-lived business, product, content channel, workflow, or automation loop.

## First Principles

Use these rules whenever a goal requires a design choice.

1. Rule-layer language should match the product object model.
   The user-facing and agent-facing default should be Business, Today, Chat,
   Decisions, Records, Next Actions, Learning, Skills/SOPs, and Capabilities.

2. Keep Task as execution infrastructure.
   Do not mechanically rename every task type or code path. Update the rules so
   task state is interpreted as next-action execution state inside a business
   line unless it is explicitly one-off or legacy recovery.

3. Handoff is a boundary, not a transcript dump.
   Handoff should preserve the smallest recoverable state needed by a future
   session, next action, subagent, scheduler, or runtime. Prefer pointers to
   existing records, runs, files, decisions, and artifacts over duplicated text.

4. Scheduler is a business-loop layer.
   Scheduled/event/routine work should be described as business-line
   automations and sensors. The scheduler should decide whether a loop is ready
   to observe, propose, or execute; it should not become a generic background
   task runner.

5. Wanman-style matrix runtimes are executor backends.
   Matrix coordination can run inside a delegated mission. Taskplane remains
   the business-line control layer that owns state, gates, evidence, review,
   and learning.

6. If a rule must always hold, make it testable.
   Do not rely on prose alone for durable writes, risky activations, context
   clearing, external effects, scheduler starts, or cross-business reuse.

## How To Run This With Codex

Run one goal at a time. After each goal, ask Codex for:

```text
checkpoint:
- current goal
- files changed
- rule behavior completed
- tests or checks run
- risks left
- suggested next goal
```

Commit only after review. If a goal starts changing unrelated runtime behavior,
pause it and split a follow-up implementation goal.

Recommended rhythm:

```text
Rule Goal 0 -> review -> commit
Rule Goal 1 -> review -> commit
Rule Goal 2 -> review -> commit
...
```

## Current State To Treat As Starting Point

The business-line-first MVP is implemented and audited:

- business-line-first readiness is ready;
- historical task data is recoverable through Legacy Tasks Explorer;
- tasks now act as Next Actions inside business lines;
- Today suggestions are business-line suggestions;
- BusinessLineContextPack exists and is injected into chat/runs;
- post-run review can update records, next actions, and SOP revisions;
- automations/sensors project scheduled/event/external signals into business
  lines.

Known rule-layer gaps:

- `AGENTS.md` still describes Taskplane as owning durable task state first;
- `GoalPilot Task Advancement Framework` is still task-named and task-scoped;
- `Task Memory Spec` still treats Task.md and Task Records as the primary
  durable memory model;
- `Priority Attention Routing` still ranks active tasks rather than business
  lines and next actions;
- handoff is present, but not yet separated into ephemeral, durable, and runtime
  handoff contracts;
- scheduler/orchestration specs still mostly describe scheduled/event tasks,
  not business-line loops;
- product audit does not yet guard against task-first language drift in core
  rule documents.

## Definition Of Done

This rule-layer migration is done when:

- AGENTS and always-loaded GoalPilot language present business lines as durable
  owners and tasks as execution units;
- memory rules define Business Records, BusinessLineContextPack, Learning/SOPs,
  and Next Action execution memory before legacy Task.md / Task Records;
- handoff rules distinguish ephemeral session handoff, durable business
  handoff, next-action handoff, and runtime/subagent handoff;
- scheduler rules describe business-line loops, sensors, automations, standing
  approval, and review gates;
- Pilot and priority rules select business lines and next actions, not generic
  task queues;
- writeback rules route business records, reviews, next actions, SOP
  revisions, source contexts, artifacts, and decisions through service gates;
- audit/tests can catch regressions where core specs reintroduce task-first
  language as the product default.

## Rule Goal 0: Inventory And Drift Map

### Objective

Build a concrete map of which specs, adapters, tests, and user-facing copy still
carry task-first assumptions after the business-line-first MVP.

### Scope

Do not rewrite rules yet. Inventory first:

- core docs and specs;
- shared evaluators and tests that encode task-first language;
- product audit and compliance matrices;
- AGENTS.md / native adapter docs;
- scheduler, handoff, memory, priority, and writeback rule surfaces.

### Required Behavior

- Produce a short migration map with:
  - keep as-is;
  - rename/reframe only;
  - rule behavior update needed;
  - later architecture update needed.
- Identify which task-first terms are acceptable because they describe execution
  units, and which terms should be replaced because they describe product
  ownership.

### Acceptance

- The repo contains a reviewed inventory document or section that future goals
  can use.
- No runtime behavior changes are introduced.
- The inventory distinguishes product-language drift from valid task execution
  infrastructure.

### Verification

```bash
rg -n "task router|task memory|multi-task|Task.md|Task Records|scheduled/event task|task-first|business-line-first" AGENTS.md docs/specs src/shared
git diff --check
```

### Codex Prompt

```text
Goal: Complete Rule Goal 0 only - inventory task-first rule-layer drift.

Read:
- AGENTS.md
- docs/plans/2026-05-29-business-line-centered-redesign.md
- docs/plans/2026-05-30-business-line-first-execution-plan.md
- docs/plans/2026-05-30-business-line-rule-layer-migration-plan.md
- docs/specs/goalpilot-task-advancement-framework.md
- docs/specs/task-memory-spec.md
- docs/specs/context-transition-policy.md
- docs/specs/priority-attention-routing.md
- docs/specs/pilot-decision-contract.md
- docs/specs/native-agent-runtime-orchestration.md
- docs/specs/decision-layer-writeback-orchestration.md

Do not rewrite specs yet.

Produce a migration inventory in docs/plans or an appended section in this plan.
Classify each task-first reference as:
- valid execution-unit language;
- product-language drift that should become business-line-first;
- handoff/scheduler/priority/writeback architecture follow-up.

Run the verification commands and stop with a checkpoint.
```

## Rule Goal 1: AGENTS And GoalPilot Business Advancement

### Objective

Make the always-loaded adapter and GoalPilot rule reflect the new product
center.

### Scope

Update only:

- `AGENTS.md`;
- `docs/specs/goalpilot-task-advancement-framework.md`;
- directly related tests or references.

Do not rename files unless the change is low-risk and all references are
updated. It is acceptable for the file path to remain task-named during this
slice if the content clearly states the new business-line-first model.

### Required Behavior

- AGENTS states that Taskplane owns business-line state, business memory,
  records, decisions, evidence, learning, and write gates.
- GoalPilot becomes the always-loaded business advancement router.
- Task is explicitly defined as the execution unit / Next Action carrier.
- The control sequence starts with business line / global / next action / run /
  correction / handoff / one-off chat scope.
- Situation map includes business-line creation, Today suggestion, Next Action
  execution, review, learning update, scheduler loop, and legacy task recovery.

### Acceptance

- A future Codex reading only AGENTS + GoalPilot would understand that Business
  is the durable product object.
- The spec still preserves small-movement routing and does not become a bulky
  total manual.
- Existing references to GoalPilot remain valid.

### Verification

```bash
rg -n "task router|durable task state|business-line advancement|Next Action|legacy task recovery" AGENTS.md docs/specs/goalpilot-task-advancement-framework.md
npm test -- src/shared/task-advancement-framework.test.ts src/shared/agent-principles.test.ts
git diff --check
```

### Codex Prompt

```text
Goal: Complete Rule Goal 1 only - reframe AGENTS and GoalPilot as
business-line-first.

Read the rule-layer migration plan and update only AGENTS.md,
docs/specs/goalpilot-task-advancement-framework.md, and directly affected
tests/references.

Requirements:
- Business line is the durable owner.
- Task is the execution unit / Next Action carrier.
- GoalPilot remains small and always-loaded.
- Preserve the phase-loaded rule hierarchy.
- Add business-line situations: creation, Today suggestion, Next Action
  execution, review, learning/SOP update, scheduler loop, and legacy recovery.

Do not perform runtime architecture changes.
Run verification and stop with a checkpoint.
```

## Rule Goal 2: Business Memory Model

### Objective

Upgrade memory rules from task memory first to business memory first.

### Scope

Update:

- `docs/specs/task-memory-spec.md`;
- memory-related shared rule files only if tests need wording alignment;
- tests that enforce read/write surfaces.

Do not remove Task.md, Task Records, or task-memory code. Reframe them as
execution and compatibility memory surfaces under the business-line memory
model.

### Required Behavior

- Add Business Line, Business Records, BusinessLineContextPack, Next Actions,
  Reviews, and Skills/SOPs as first-class memory surfaces.
- Define when memory belongs to:
  - business record;
  - next action / task state;
  - Task.md;
  - Task Record;
  - Source Context;
  - Artifact / Task File;
  - Decision;
  - Work Habit;
  - SOP revision.
- Define default read order for business-line execution.
- Define legacy task recovery read order separately.
- Preserve the rule that chat is temporary.

### Acceptance

- The memory spec can guide a future Agent through resuming a business line
  without treating Task.md as the only recovery source.
- Task.md and Task Records remain valid for Next Action / legacy recovery.
- Cross-business memory reuse is explicit and proposed, not silently loaded.

### Verification

```bash
rg -n "Business Records|BusinessLineContextPack|Next Action|legacy task recovery|Task.md|Task Records" docs/specs/task-memory-spec.md
npm test -- src/shared/task-memory-coverage.test.ts src/shared/memory-surface-policy.test.ts src/shared/task-memory-retrieval.test.ts
git diff --check
```

### Codex Prompt

```text
Goal: Complete Rule Goal 2 only - upgrade Task Memory Spec into a
business-memory-first contract.

Do not delete task memory surfaces. Reframe them.

Required:
- Business Records and BusinessLineContextPack are first-class memory surfaces.
- Reviews and Skills/SOP revisions are the learning memory path.
- Task.md and Task Records remain execution/legacy recovery surfaces.
- Add business-line read order and legacy task recovery read order.
- Preserve "chat is temporary" and durable writes through services/gates.

Update focused tests only where they enforce outdated wording.
Run verification and stop with a checkpoint.
```

## Rule Goal 3: Handoff V2 Contract

### Objective

Turn handoff from a mostly task-switch/context-clear concept into a reusable
business-line, next-action, session, runtime, and subagent boundary.

### Scope

Update:

- `docs/specs/context-transition-policy.md`;
- handoff sections in `docs/specs/task-memory-spec.md`;
- `docs/specs/agent-output-contract.md` if output language needs alignment;
- shared handoff evaluators/tests if they need terminology updates.

### Required Behavior

Define four handoff types:

```text
ephemeral_session_handoff
durable_business_handoff
next_action_handoff
runtime_or_subagent_handoff
```

Each handoff should specify:

- source and target;
- reason;
- current state;
- next safe action;
- constraints and decisions;
- evidence pointers;
- what not to duplicate;
- whether it should become a Business Record, Task Record, Run Step, or
  temporary file.

### Acceptance

- Handoff rules no longer imply that every handoff is a Task Record.
- Runtime/subagent handoff must be evaluated before writes are applied.
- Context clearing cannot bypass business-line recovery.
- The rule layer preserves the AIHero-style lesson: handoff should transfer
  just enough context, with pointers, not full transcripts.

### Verification

```bash
rg -n "ephemeral_session_handoff|durable_business_handoff|next_action_handoff|runtime_or_subagent_handoff|handoff" docs/specs src/shared
npm test -- src/shared/context-transition.test.ts src/shared/context-preservation.test.ts src/shared/runtime-handoff.test.ts src/shared/subagent-handoff-evaluator.test.ts
git diff --check
```

### Codex Prompt

```text
Goal: Complete Rule Goal 3 only - define Handoff V2 for business-line-first
operation.

Read the rule-layer migration plan and update context transition, memory, and
output handoff rules.

Required handoff types:
- ephemeral_session_handoff;
- durable_business_handoff;
- next_action_handoff;
- runtime_or_subagent_handoff.

Keep handoff minimal: preserve recovery fields and pointers to records, runs,
files, decisions, sources, and artifacts; do not duplicate transcripts.

Do not implement new runtime delegation behavior unless a test currently needs
terminology alignment.
Run verification and stop with a checkpoint.
```

## Rule Goal 4: Business Attention Routing

### Objective

Upgrade Priority Attention Routing from multi-task ranking to business-line and
next-action attention routing.

### Scope

Update:

- `docs/specs/priority-attention-routing.md`;
- references in Pilot/Brief specs if needed;
- shared ranking tests only where language or type expectations are stale.

### Required Behavior

- The primary ranking object is business line.
- The executable target is a Next Action.
- Today suggestions include progress, record_gap, and improvement lanes.
- Legacy task queues are compatibility inputs, not the product attention model.
- Decisions, blockers, stale reviews, sensor signals, and SOP expiry can raise
  business-line attention.

### Acceptance

- Brief/Today and Pilot share one attention language.
- A task can be ranked only as a next action or legacy recovery item.
- The output contract can explain "why this business line now".

### Verification

```bash
rg -n "business line|Next Action|Today|record_gap|improvement|legacy task" docs/specs/priority-attention-routing.md src/shared/priority-recommendation-ranking.test.ts src/shared/working-context/priority-lanes.test.ts
npm test -- src/shared/priority-recommendation-ranking.test.ts src/shared/working-context/priority-lanes.test.ts src/renderer/App.test.tsx -t "Today|suggestion|business|priority"
git diff --check
```

### Codex Prompt

```text
Goal: Complete Rule Goal 4 only - migrate Priority Attention Routing to
business-line attention.

Do not rebuild Today UI or ranking implementation unless tests require small
alignment.

Required:
- business line is the ranking object;
- Next Action is the executable target;
- progress, record_gap, and improvement suggestion types are represented;
- legacy task queues remain compatibility inputs;
- Pilot/Brief/Today share the same language for "why now".

Run verification and stop with a checkpoint.
```

## Rule Goal 5: Writeback And Decision Contract Alignment

### Objective

Make Write Intent, Decisions, and product writeback rules explicitly
business-line-first.

### Scope

Update:

- `docs/specs/decision-layer-writeback-orchestration.md`;
- related Write Intent / writeback rule tests if they enforce old wording;
- product feature audit notes only if needed.

### Required Behavior

Writeback rules should explicitly cover:

- business record creation;
- business-line review;
- next action creation/update;
- source context creation;
- artifact/task file proposal;
- Decision creation/action;
- SOP/skill revision proposal;
- handoff record proposal.

Rules must preserve:

- no direct runtime database mutation;
- Decision gates for risky action;
- service-level validation;
- cross-business isolation;
- preview/proposal before external or public writes.

### Acceptance

- A runtime result can be evaluated as business-line progress without first
  translating it into a project task closeout.
- Risky learning or external write cannot become active context without a
  Decision path.
- Writeback remains service-gated and testable.

### Verification

```bash
rg -n "business record|business-line review|Next Action|SOP|handoff|Decision|Write Intent" docs/specs/decision-layer-writeback-orchestration.md src/shared/taskplane-writeback-*.ts
npm test -- src/shared/taskplane-writeback-proposal.test.ts src/shared/taskplane-writeback-apply-plan.test.ts src/shared/taskplane-writeback-approval.test.ts src/shared/taskplane-writeback-dispatch.test.ts
git diff --check
```

### Codex Prompt

```text
Goal: Complete Rule Goal 5 only - align Write Intent and Decision rules to
business-line-first operation.

Do not weaken any write gate.

Required:
- writeback can target business records, reviews, next actions, source
  contexts, artifacts/files, decisions, SOP revisions, and handoff records;
- risky or external/public/money-affecting writes remain Decision-gated;
- runtime output may propose, but Taskplane services apply;
- cross-business reuse must be explicit.

Run verification and stop with a checkpoint.
```

## Rule Goal 6: Scheduler As Business-Line Loop Layer

### Objective

Reframe scheduler/orchestration rules from scheduled tasks to business-line
loops, automations, and sensors.

### Scope

Update:

- `docs/specs/native-agent-runtime-orchestration.md`;
- scheduler sections in capability mapping or Pilot contract as needed;
- scheduler/orchestration tests only for terminology or audit alignment.

Do not build a new scheduler architecture in this goal.

### Required Behavior

Rules should define:

- business-line loop;
- read-only sensor;
- automation;
- standing approval;
- trigger readiness;
- run-limit evidence;
- review after execution;
- Decision-gated mutation.

Scheduled/event/routine tasks should be described as execution carriers inside
business-line loops, not as the product-level scheduler object.

### Acceptance

- Scheduler rules can explain how a business line observes, proposes, executes,
  reviews, and learns.
- Wanman/matrix remains an executor backend, not the scheduler/control layer.
- Existing scheduled/event trigger gates remain intact.

### Verification

```bash
rg -n "business-line loop|sensor|automation|Standing Approval|scheduled/event|wanman|matrix" docs/specs/native-agent-runtime-orchestration.md docs/specs/native-agent-capability-mapping.md docs/specs/pilot-decision-contract.md src/shared/agent-orchestration.test.ts
npm test -- src/shared/agent-orchestration.test.ts src/shared/scheduler-decision-proposal.test.ts src/shared/runtime-entrypoint-coverage.test.ts
git diff --check
```

### Codex Prompt

```text
Goal: Complete Rule Goal 6 only - reframe scheduler/orchestration as a
business-line loop layer.

Do not implement new scheduler runtime behavior.

Required:
- define business-line loops, sensors, automations, standing approval, trigger
  readiness, run-limit evidence, review, and Decision-gated mutation;
- scheduled/event/routine tasks remain execution carriers;
- matrix/Wanman remains an executor backend below Taskplane Pilot;
- keep all existing scheduled/event trigger gates intact.

Run verification and stop with a checkpoint.
```

## Rule Goal 7: Product Audit For Rule-Layer Readiness

### Objective

Add a testable audit that prevents the core rule layer from drifting back to
task-first product language.

### Scope

Update:

- product feature impact audit or a new docs-readiness audit;
- tests for required business-line-first docs;
- local smoke summary if appropriate.

Do not make the audit brittle by banning all uses of the word "task". Task is
still a valid execution unit. The audit should catch task-first ownership
language in the always-loaded and core rule docs.

### Required Behavior

Audit checks should assert:

- AGENTS names business line as durable owner;
- GoalPilot describes business advancement;
- Memory spec includes business memory surfaces;
- Handoff V2 terms exist;
- Priority routing includes business-line attention;
- Scheduler/orchestration includes business-line loops;
- legacy task recovery remains documented.

### Acceptance

- Audit can distinguish valid task execution language from task-first product
  ownership drift.
- `businessLineFirst readiness` remains ready.
- A missing required rule-layer section produces a clear failure.

### Verification

```bash
npm test -- src/shared/product-feature-impact-audit.test.ts src/main/local-smoke-boundaries-script.test.ts
npm run audit:product-progress -- --next
git diff --check
```

### Codex Prompt

```text
Goal: Complete Rule Goal 7 only - add product audit coverage for
business-line-first rule-layer readiness.

Do not ban all task language. Task remains valid as an execution unit.

Required audit checks:
- AGENTS uses business-line durable ownership language;
- GoalPilot is business advancement oriented;
- memory spec includes business records/context/learning surfaces;
- Handoff V2 terms exist;
- priority routing is business-line attention oriented;
- scheduler/orchestration defines business-line loops;
- legacy task recovery remains documented.

Run verification and stop with a checkpoint.
```

## Architecture Follow-Up Goals

Do not start these until Rule Goals 0 through 7 are stable and committed. These
are intentionally larger and should be rewritten into implementation plans
after the rule layer has settled.

### Architecture Goal A: Business-Line Context Assembly Gate

```text
Goal: Draft an architecture implementation plan for a BusinessLineContext
Assembly Gate.

Do not implement it yet.

The plan should describe how every chat/run/scheduler/runtime path assembles
context from:
- business line state;
- Records;
- Next Actions;
- accepted SOPs;
- Decisions;
- source contexts;
- artifacts/files;
- Work Habits;
- permission boundaries;
- legacy task recovery when needed.

The plan must identify current duplicated task-context assembly paths and
propose the smallest migration order.
Stop with a checkpoint.
```

### Architecture Goal B: Handoff Service Boundary

```text
Goal: Draft an architecture implementation plan for a unified Handoff service
boundary.

Do not implement it yet.

The plan should cover:
- ephemeral session handoff;
- durable business handoff;
- next-action handoff;
- runtime/subagent handoff;
- scheduler handoff;
- which service writes Business Records, Task Records, Run Steps, or temporary
  handoff files;
- how handoff is evaluated before writeback.

Stop with a checkpoint.
```

### Architecture Goal C: Business-Line Loop Scheduler

```text
Goal: Draft an architecture implementation plan for a Business-Line Loop
Scheduler.

Do not implement it yet.

The plan should map current scheduled/event/routine task logic into:
- business-line loops;
- read-only sensors;
- candidate records;
- standing approval;
- trigger readiness;
- run-limit evidence;
- review and SOP update;
- Decision-gated mutations.

Keep MCP/runtime/provider configuration global and action-scoped.
Stop with a checkpoint.
```

## Suggested Commit Boundaries

Use one commit per completed rule goal:

```text
rules: inventory business-line drift
rules: reframe agents and goalpilot
rules: define business memory model
rules: define handoff v2 contract
rules: reframe priority as business attention
rules: align writeback to business lines
rules: define business loop scheduler
rules: audit business-line rule readiness
```

## Stop Conditions

Stop and checkpoint instead of continuing when:

- a rule goal starts changing durable runtime behavior;
- a docs-only slice requires schema changes;
- a test failure reveals a real product behavior gap;
- a proposed rename would require broad reference churn;
- the rule starts banning valid task execution language;
- scheduler or matrix language starts replacing Taskplane's control layer.
