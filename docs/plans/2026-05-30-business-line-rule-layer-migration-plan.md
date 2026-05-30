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

### Inventory Checkpoint - 2026-05-30

This checkpoint is inventory-only. It does not rewrite the core specs or change
runtime behavior. The references below are grouped by rule surface, because many
`src/shared` matches are implementation fields such as `taskId` and should not be
treated as product-language drift by themselves.

Classification key:

- `valid execution-unit language`: keep task wording when it names an executable
  unit, a run target, a child/parent execution relationship, task-scoped files,
  or legacy task recovery.
- `product-language drift`: wording makes Task the durable product owner or the
  default user/agent mental model; migrate to business line, records, next
  actions, learning, and SOPs.
- `architecture follow-up`: the wording encodes scheduler, handoff, priority, or
  writeback behavior that needs a later rule or implementation slice, not only a
  rename.

Summary:

| Class | Count | Main action |
| --- | ---: | --- |
| Valid execution-unit language | 5 | Keep as-is for now; preserve task ids and child tasks as run/write targets. |
| Product-language drift | 5 | Reframe in Rule Goals 1-3 so Business is durable owner and Task is execution unit. |
| Architecture follow-up | 7 | Split later scheduler, priority, handoff, memory, and writeback behavior goals. |

#### Valid Execution-Unit Language

| Surface | References | Classification | Action bucket | Notes |
| --- | --- | --- | --- | --- |
| Task as Next Action carrier | This plan lines 28-31 and 41-44 | Valid execution-unit language | Keep as-is | The migration plan already says tasks remain execution units and task state should be interpreted as next-action execution state. |
| Native runtime selected target | `docs/specs/native-agent-runtime-orchestration.md` lines 430-490, 523-533 | Valid execution-unit language | Keep as-is | `taskId`, `parentTaskId`, and selected target validation are still needed for runtime result evidence and reversible write intent. |
| Shared Write Intent validators | `src/shared/taskplane-write-intent.ts` lines 138-190 | Valid execution-unit language | Keep as-is | These validators guard concrete task-bound write targets. Later business-line write intents should add explicit `businessLineId`, not remove task target checks. |
| Task files and reserved memory paths | `src/shared/task-memory-path.ts`; `src/shared/runtime-surface-routing.test.ts`; `src/shared/task-memory-write-proposal.test.ts`; `src/shared/task-memory-coverage.test.ts` | Valid execution-unit language | Keep as compatibility | Task files, `Task.md`, and `Task Records/` are still concrete legacy/execution surfaces and need compatibility until business memory write paths are first-class. |
| Legacy task recovery audit | `src/shared/product-feature-impact-audit.ts` lines 87, 95, 143, 920-958 | Valid execution-unit language | Keep as recoverable compatibility | `historical_task_recovery` is correctly recoverable rather than blocking business-line-first readiness. |

#### Product-Language Drift To Reframe

| Surface | References | Classification | Action bucket | Notes |
| --- | --- | --- | --- | --- |
| Native adapter ownership statement | `AGENTS.md` lines 6-15 and 24-35 | Product-language drift | Rename/reframe only in Rule Goal 1 | AGENTS still says Taskplane owns durable task state and GoalPilot is a task router. It should say business-line state, business memory, records, decisions, evidence, and learning are durable owners; task remains execution unit. |
| GoalPilot title, id, layer, purpose, core question, control sequence | `docs/specs/goalpilot-task-advancement-framework.md` lines 1-23, 53-86, 98-115, 147-165 | Product-language drift | Rule behavior update in Rule Goal 1 | The always-loaded router is task-named and asks for owner task/focus task. It should route business-line advancement first, then choose a Next Action/task when execution is needed. |
| Shared GoalPilot mirror | `src/shared/task-advancement-framework.ts` lines 1-120 | Product-language drift | Rule Goal 1 test/code mirror update | The shared constant mirrors the spec. When the spec is reframed, this mirror and related tests must update together to keep product/runtime prompts aligned. |
| Task Memory Spec as primary memory model | `docs/specs/task-memory-spec.md` lines 1-31, 38-67, 86-147, 165-186, 304-370, 381-428, 488-517, 555-650 | Product-language drift | Rule behavior update in Rule Goal 2 | The spec treats Task.md and Task Records as the primary durable memory model. It should introduce Business Records, BusinessLineContextPack, reviews, Learning/SOP revisions, and Next Action execution memory before legacy task memory. |
| Context transition write surfaces | `docs/specs/context-transition-policy.md` lines 19-33, 49-61, 81-107, 122-130 | Product-language drift | Rule Goal 3 handoff/memory reframe | The policy preserves task-bound chat into Task.md/Task Records by default. It needs a business handoff path, with task handoff retained for active Next Actions and legacy recovery. |

#### Architecture Follow-Ups

| Surface | References | Classification | Action bucket | Notes |
| --- | --- | --- | --- | --- |
| Priority and Brief focus | `docs/specs/priority-attention-routing.md` lines 5-20, 41-78 | Architecture follow-up | Priority rule behavior update | The current output is `focusTaskId`. The business-line-first version should rank business lines, record gaps, decisions, and Next Actions, then return an execution task only when a concrete action is selected. |
| Pilot multi-task coordination | `docs/specs/pilot-decision-contract.md` lines 41-58, 71-93, 110-119, 135-156 | Architecture follow-up | Pilot/priority follow-up | Pilot currently coordinates across tasks and missions. It should coordinate across business lines and next actions while preserving executor task identity for runtime calls. |
| Decision/writeback owner model | `docs/specs/decision-layer-writeback-orchestration.md` lines 57-66, 108-168, 187-223 | Architecture follow-up | Writeback rule behavior update | The closed loop still names task state, Task.md, Task Records, and task-scoped intents as the product control model. Business records, reviews, SOP revisions, source records, and Next Action creation need explicit Write Intent/writeback targets. |
| Native runtime state authority | `docs/specs/native-agent-runtime-orchestration.md` lines 30-39, 112-170, 193-370, 430-533 | Architecture follow-up | Runtime identity split | The spec should distinguish business-line source-of-truth identity from execution task identity. Runtime runs can stay task-bound, but context, source ownership, and learning writeback must be business-line-aware. |
| Scheduler and standing approval | `docs/specs/native-agent-runtime-orchestration.md` lines 791-907; `src/shared/agent-orchestration.ts` lines 796 and 1285; `src/shared/product-feature-impact-audit.ts` lines 728-797 | Architecture follow-up | Scheduler/loop rule goal | Scheduled/event/routine work is currently modeled as scheduled/event tasks. The rule layer should describe business-line automations, sensors, standing approval, run limits, review gates, and loop scheduler health. |
| Task memory implementation gates | `src/shared/task-memory-coverage.ts`; `src/shared/task-memory-guidance-state.ts`; `src/shared/task-memory-write-proposal.ts`; `src/shared/context-preservation.ts`; `src/shared/auto-context-clear-readiness.ts` | Architecture follow-up | Memory implementation follow-up | These gates correctly protect existing task memory writes. Later implementation should add business memory gates rather than weakening the current task-memory safety checks. |
| Product compliance/audit matrices | `src/shared/agent-principles-compliance.ts`; `src/shared/product-feature-impact-audit.ts` lines 403, 728-797, 920-958 | Architecture follow-up | Audit follow-up | Compliance evidence still records many task-memory and task-dynamics surfaces. Add a future audit that prevents core rule docs from reintroducing task-first product ownership language while allowing execution-unit `taskId`. |

#### Term Decision Map

Keep these terms when they describe execution infrastructure:

- `taskId`, `parentTaskId`, `child task`, `subtask`, `target task`, and
  `selected task` for runtime calls, run evidence, write-intent validation,
  parent/child decomposition, and legacy task recovery.
- `Task.md`, `Task Records`, `Task Files`, and `Task Dynamics` while referring
  to existing compatibility surfaces or active Next Action execution memory.
- `scheduled/event task` only when naming the current implementation boundary or
  compatibility tests.

Replace or reframe these terms when they describe product ownership:

- `task router` -> `business-line advancement router`.
- `task memory` as the default durable memory -> `business memory`, `Business
  Records`, `Learning/SOPs`, and `BusinessLineContextPack`, with task memory as
  execution/legacy support.
- `multi-task ranking` -> `business-line and next-action ranking`.
- `owner task` / `focus task` as the default control object -> `business line`
  first, then `Next Action` / execution task when needed.
- `task scheduler` / `scheduled/event task` as the product loop -> business-line
  loop scheduler, automation, sensor, standing approval, and review gate.

#### Suggested Goal Split

1. Rule Goal 1 should reframe `AGENTS.md`, GoalPilot, and the shared GoalPilot
   mirror so the always-loaded rule starts from business-line advancement.
2. Rule Goal 2 should introduce business memory rules before legacy Task.md /
   Task Records, then map existing task-memory gates to compatibility support.
3. Rule Goal 3 should split handoff into durable business handoff, next-action
   execution handoff, session transition, and runtime/subagent handoff.
4. Rule Goal 4 should migrate Priority/Pilot routing from task queues to
   business lines, record gaps, decisions, and Next Actions.
5. Rule Goal 5 should update writeback and runtime orchestration contracts with
   explicit business-line targets while preserving task/run evidence targets.
6. Rule Goal 6 should update scheduler language from scheduled/event tasks to
   business-line loops, sensors, automations, and standing approval gates.
7. Rule Goal 7 should add audit coverage for task-first rule-layer drift, with
   allowlists for execution-unit terms.

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
