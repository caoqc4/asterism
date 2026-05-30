# Business-Line Architecture Migration Plan

Date: 2026-05-30
Status: Architecture migration plan for Codex goals
Owner: Product design / implementation
Related:
- `docs/plans/2026-05-29-business-line-centered-redesign.md`
- `docs/plans/2026-05-29-business-line-learning-loop-mvp.md`
- `docs/plans/2026-05-30-business-line-first-execution-plan.md`
- `docs/plans/2026-05-30-business-line-rule-layer-migration-plan.md`

## Purpose

The business-line MVP and rule-layer migration established the product
direction:

```text
Business Line = durable owner
Task / Next Action = execution carrier
Runtime = executor and evidence source
Taskplane services = write gate and source of truth
Business Records / Reviews / SOP revisions = business memory and learning
```

This document is the bridge from those rules to code architecture. It should be
used before broad implementation work so each future Codex goal can be checked
against the same target shape instead of rediscovering the same task-first
problems.

The document is intentionally complete, but implementation must still happen in
small goals. The purpose is not to rewrite Taskplane at once. The purpose is to
make the migration path explicit enough that each slice has a stable acceptance
boundary.

## First Principles

Use these principles when a future goal has more than one reasonable design.

1. Durable ownership must match the product object.
   If work affects a long-lived business, product, content channel, workflow, or
   automation loop, `business_line_id` is the durable owner. A task can carry
   execution state, but it should not be the only route to recover business
   memory.

2. Task is still necessary infrastructure.
   Do not delete or cosmetically rename task code. Treat task records, task
   files, subtasks, blockers, and completion decisions as execution-carrier
   surfaces unless they are explicitly legacy recovery.

3. Runtime output can propose; services apply.
   Codex, Claude, Agent API, scheduler, and matrix-runtime output may produce
   evidence and Write Intent. Product-side services validate ownership, risk,
   Decision gates, and persistence.

4. Review is the learning bridge.
   An action is not a closed loop until its result can become a Business Record,
   Review, Next Action, Decision, or SOP revision. A summary alone is not
   durable learning.

5. Default future context must be selective.
   Not every record, transcript, source, or SOP should enter future context.
   `shouldAffectFutureContext`, provenance, review state, status, expiry, and
   business-line scope decide what is loaded.

6. Keep compatibility explicit.
   Historical project/routine tasks can remain accessible through adapters.
   Compatibility must be labeled and tested so it does not become the hidden
   default model again.

7. If the rule is safety-critical, encode it.
   Durable writes, risky SOP activation, cross-business reuse, context clearing,
   scheduler execution, external writes, deployment, publish, and money-impacting
   actions need service guards, tests, or audit checks, not only prose.

## Non-Goals

Do not combine this migration with:

- broad `GoalPilot` naming or brand replacement;
- deleting Task, Task.md, Task Records, task files, subtasks, blockers, or
  completion Decisions;
- full historical data migration;
- a new generic workflow engine;
- per-business-line duplication of MCP, AI Runtime, External Access, or provider
  configuration;
- a full scheduler rewrite;
- matrix-runtime replacement of Taskplane's product control layer;
- exposing internal objects such as task packages as first-class user concepts;
- a dashboard for every possible business type.

If a future goal starts doing one of these, stop and split it.

## Architectural Target

### 1. Durable Domain Model

Business Line owns durable business state:

```text
business_lines
business_line_records
business_line_actions
business_line_reviews
business_line_skill_revisions
```

Task-linked tables should carry `business_line_id` when the work is business
scoped:

```text
tasks.business_line_id
runs.business_line_id
decision_requests.business_line_id
source_contexts.business_line_id
artifacts.business_line_id
task_files.business_line_id
```

Direct ownership is preferred when the object can outlive or cross task
execution. Resolution through task/run is acceptable for compatibility, but the
resolved owner must be visible in service output and tests.

### 2. Service Ownership

`BusinessLineService` should be the facade for business-line workspaces,
records, reviews, SOP revisions, next-action links, context packs, Today
suggestions, automations, and sensors.

Task services remain responsible for task execution mechanics:

```text
create/update task
next step
blockers
subtasks
task files
task completion proposal
legacy Task.md / Task Records recovery
```

The important boundary is not which service owns every helper function. The
important boundary is whether user-visible durable business memory is written
through a business-line-aware service path.

### 3. Write Intent And Apply Plan Boundary

Write Intent must become business-line aware without becoming business-line
only.

Minimum rule:

```text
If a Write Intent has business impact, it must carry or resolve businessLineId.
If it mutates execution state, it must also carry the executable task/run target.
If it is risky, it must route through Decision or Standing Approval.
```

Business-line-native write surfaces should include:

```text
business_record.create
business_review.record
business_sop_revision.propose
business_next_action.create
business_handoff.record
```

Task-native write surfaces remain valid:

```text
task.update_next_step
task.mark_blocked
task.complete.propose
task_file.propose
task_record.create
artifact.propose
source_context.create
decision.create
```

Task-native writes that happen inside a business line should preserve
`businessLineId` in proposal, apply plan, timeline event, dispatch result, and
post-run review.

### 4. Runtime Context And Evidence

Runs triggered from business-line surfaces should carry:

```text
run.businessLineId
run.taskId when there is an execution carrier
BusinessLineContextPack in prompt/context
selected runtime/provider evidence
writeback evidence
verification evidence
post-run review options
```

Runs may be one-off chat, business-line scoped, task scoped, scheduler scoped,
or compatibility task scoped. Runtime code should validate the scope instead of
guessing silently.

### 5. Business Memory And Learning

Business memory is assembled from:

```text
Business Line structured state
Business Records
Reviews
accepted and non-expired SOP revisions
open Next Actions
active Decisions
recent runs and artifacts
selected source contexts
task memory only when attached to the current Next Action or legacy recovery
```

Default exclusion is as important as inclusion:

- proposed/rejected/disabled/superseded SOP revisions are evidence, not active
  context;
- external previews are not future context until reviewed or confirmed;
- cross-business records and SOPs are excluded unless explicitly copied as
  proposed learning;
- Task Records are execution recovery unless promoted or summarized into
  Business Records.

### 6. UI Ownership

Primary Work navigation should present:

```text
Today
Business
Chat
Decisions
```

Tasks may remain as Legacy Tasks Explorer or compatibility recovery. They should
not be the default durable product entry.

Business workspace owns:

```text
Overview
Records
Next Actions
Learning / Skills/SOPs
Automations & Sensors
Settings
```

Right Panel and full Chat must always show the active context target:

```text
Global
Business Line
Next Action
Run / Review
Legacy Task
```

Writeback target must be visible before applying user-confirmed durable writes.

### 7. Scheduler, Automation, And Matrix Runtime

Scheduler/event/routine work should be modeled as business-line loops:

```text
Business Line Loop = product-level owner
Sensor = read-only observation
Automation = bounded loop action
Scheduled/event/routine task = execution carrier
Standing Approval = limited authorization gate
Review = learning/writeback gate
```

Wanman-style matrix or native runtime delegation is an executor backend, not a
new source of truth. It can coordinate subagents and tools inside a delegated
mission, but Taskplane still owns business-line state, write gates, Decisions,
evidence, and learning.

## Current Implementation Snapshot

This snapshot is based on the repository state after:

- business-line-first MVP goals;
- rule-layer migration goals;
- product audit readiness commit `b1b6f44d`.

### Already Aligned

- `business_lines`, `business_line_records`, `business_line_actions`,
  `business_line_reviews`, and `business_line_skill_revisions` exist.
- `tasks`, `runs`, `decision_requests`, `source_contexts`, `artifacts`, and
  `task_files` have `business_line_id` columns.
- `BusinessLineService` can create/list workspaces, records, reviews, next
  actions, Today suggestions, SOP revisions, automations, sensors, and context
  packs.
- `RunService` can resolve `businessLineId`, reject missing business lines, and
  append `BusinessLineContextPack` to run instructions.
- `RightPanel` carries `activeBusinessLineId` through writeback proposal and
  post-run review paths.
- Product audit reports `businessLineFirst readiness=ready` and
  `businessLineFirstRules readiness=ready`.

### Compatibility Adapter Areas

- Legacy project/routine tasks are still converted or exposed through
  `legacyTaskId`.
- Task.md and Task Records remain execution-memory surfaces and should stay
  usable.
- TasksPage is still the broadest task dynamics and writeback approval surface.
- Subtask decomposition still names subtask/task concepts because it is an
  execution-carrier workflow.

These areas are acceptable while they remain explicit compatibility or
execution infrastructure.

### Needs Architecture Migration

- Write Intent action vocabulary is still mostly task-native; business-line
  records, reviews, next actions, SOP revisions, and handoffs should become
  native proposal/apply-plan actions.
- Dispatch services validate task targets well, but need a clear business-line
  owner resolver and mismatch blocker across every durable write.
- BusinessLineService is becoming a facade, but record/review/SOP/next-action
  mutation paths need stricter method-level boundaries and tests.
- Run scopes need a shared resolver so one-off, business-line, task, scheduler,
  and legacy task runs do not diverge.
- UI still has many task-first labels and task-owned writeback flows in
  TasksPage and RightPanel; these should be cleaned only where they affect
  product ownership.
- Scheduler readiness still uses task carriers heavily; the code should expose
  business-line loop ownership even if carriers remain tasks.
- Product audit should eventually fail if new implementation surfaces create
  durable business state without a business-line owner.

## Architecture Goal 0 Implementation Drift Appendix

Audit date: 2026-05-30
Baseline: repository state after `b1b6f44d`
Scope inspected: data model, repositories, services, writeback, runtime, UI,
scheduler/automation paths, and audit tests.

This appendix is the route map for the later architecture goals. It classifies
implementation state without changing product behavior.

| Area | Files / surfaces inspected | Classification | Finding | Route |
| --- | --- | --- | --- | --- |
| Business-line schema | `src/main/db/client.ts`, `src/main/db/schema.ts` | aligned | Native business-line tables exist for lines, records, action links, reviews, and skill/SOP revisions. Task-linked tables already carry nullable `business_line_id` where needed for runs, Decisions, source contexts, artifacts, task files, and tasks. | Preserve. Future goals should not delete task columns or legacy surfaces. |
| Canonical action membership | `business_line_actions`, `tasks.business_line_id`, `BusinessLineRepository.listActionTaskIds()` | aligned | Canonical business lines no longer depend on a paged record window to recover open Next Actions. Action membership is persisted through task ownership and `business_line_actions`, with record links as additional evidence. | Preserve in Goals 1, 4, and 9. |
| Legacy project/routine recovery | `legacy_task_id`, `BusinessLineRepository.resolveBusinessLineForTask()`, `BusinessLinesPage`, Legacy Tasks Explorer | compatibility adapter | Legacy project/routine tasks and child tasks resolve to a business line through `legacy_task_id` or parent traversal. UI still exposes legacy recovery, but primary Work navigation does not promote Tasks. | Keep explicit. Do not migrate all history in this plan. |
| Owner resolution location | `BusinessLineRepository.resolveBusinessLineForTask/Run/Decision/Source/Artifact/TaskFile()` | needs service-boundary change | Ownership resolution exists, but it is repository-local and returns a nullable id rather than a typed owner result that distinguishes direct business-line owner, task/run carrier, legacy recovery, one-off scope, and mismatch evidence. | Goal 1 should introduce a shared resolver and use it from service write paths. |
| Direct id mismatch checks | `RunService.trigger()`, writeback dispatch, repository resolvers | needs service-boundary change | Several paths accept an explicit `businessLineId` and validate existence, but the common mismatch rule is not centralized. External Access has a local mismatch check; RunService and generic writeback dispatch still need a shared owner-vs-carrier check. | Goal 1 should reject explicit owner mismatch across task/run/source/artifact/file/Decision writes. |
| BusinessLineService workspace facade | `BusinessLineService.getWorkspace()`, `recordReview()`, SOP lifecycle, Today suggestions | aligned | BusinessLineService assembles workspace state, context pack, records, reviews, SOP revisions, Next Actions, automations, sensors, and Today suggestions. Risky SOP activation is Decision-gated, and SOP activation/rollback is transactional. | Preserve as facade. Tighten method boundaries in Goal 4. |
| Review to learning loop | `BusinessLineService.recordReview()`, `business_line_reviews`, `business_line_skill_revisions`, `business_line_actions` | aligned | Reviews are canonical review memory, can create Business Records, proposed SOP revisions, real Next Action tasks, and action links. Future context reads accepted non-expired SOPs and selected future-context records. | Preserve. Goal 2 should expose these as writeback-native intents. |
| Business-line creation seeding | `BusinessLineService.seedCreatedBusinessLine()` | aligned | Creation flow can seed initial records, proposed SOPs, and initial Next Actions under the canonical business line; inherited SOPs stay proposed instead of active context. | Preserve. Goal 7 should keep cross-business provenance explicit. |
| Cross-business reuse | creation flow source business line, inherited records/SOPs | compatibility adapter | Cross-business reuse is explicit only in the creation flow. It is not a general copy/reuse mechanism and does not silently activate copied SOPs. | Keep narrow until Goal 7. |
| Write Intent vocabulary | `src/shared/taskplane-write-intent.ts` | needs writeback change | The union is still task-native: task records, task files, artifacts, Decisions, source contexts, next-step/block/complete, and subtask proposals. It does not yet contain native `business_record.create`, `business_review.record`, `business_next_action.create`, `business_sop_revision.propose`, or `business_handoff.record`. | Goal 2. |
| Proposal and apply plans | `taskplane-writeback-proposal.ts`, `taskplane-writeback-apply-plan.ts`, `taskplane-writeback-approval.ts` | needs writeback change | Existing proposal/apply-plan paths preserve `businessLineId` for task-native surfaces when available, but business-line writes are still side paths such as post-run review confirmation rather than first-class apply-plan actions. | Goal 2. |
| Main-side writeback dispatch | `TaskplaneWritebackDispatchService.dispatch()` | needs writeback change | Dispatch validates the target task and task-file ownership, then calls task, source, artifact, Decision, and task-file services. It does not yet resolve and enforce business-line ownership for every durable write or dispatch native business-line actions. | Goals 1 and 2. |
| Runtime run scope | `RunService.trigger()`, `CreateRunInput`, `RunRecord` | needs runtime change | Runs require `taskId` and carry optional `businessLineId`. Business-line context injection works, and missing business lines are rejected, but scope is inferred from task/input instead of a typed scope such as global chat, business-line chat, Next Action execution, scheduler loop carrier, legacy recovery, or one-off. | Goal 3. |
| Run owner mismatch | `RunService.trigger()` | needs runtime change | `RunService` derives `businessLineId` from input or task and validates that the line exists, but the explicit id is not proven to match the task-derived owner through the shared resolver. | Goals 1 and 3. |
| Post-run review proposal | `shared/business-line-post-run-review.ts`, `RightPanel.confirmBusinessLineRunReview()` | needs writeback change | Completed business-line runs generate review options and RightPanel can save a review through `recordBusinessLineReview()`. This closes the MVP path, but it bypasses the generic Write Intent/apply-plan vocabulary for Business Record, Review, SOP, and Next Action writes. | Goal 2, then Goal 9 smoke. |
| Runtime surface routing | `runtime-surface-routing.ts`, context transition/handoff helpers | compatibility adapter | Runtime memory routing still contains Task.md and Task Records as valid execution surfaces. This is correct for active Next Action and legacy recovery, but should not become the business-line default. | Keep; audit in Goal 8 should allow this language only when execution-scoped. |
| Business workspace UI | `BusinessLinesPage.tsx` | aligned | Business workspace presents Overview, Records, Next Actions, Learning, Automations & Sensors, and Settings. It can open business-line chat/run context and records post-action reviews. | Preserve. Later UI cleanup should avoid broad product churn. |
| Primary navigation | `App.tsx` | aligned | Work navigation is Today, Business, Chat, Decisions. Tasks is reachable as `Legacy Tasks Explorer` in the footer, so it is recovery infrastructure rather than the primary owner. | Preserve and audit in Goal 8. |
| RightPanel context target | `RightPanel.tsx` | aligned | RightPanel shows `Context:` and `Writeback:` targets for Global, Business Line, and Business / Next Action, and passes `activeBusinessLineId` through proposal and post-run review paths. | Preserve. Goal 5 should remove remaining task-first fallback wording where it affects ownership. |
| RightPanel fallback/capture copy | `RightPanel.tsx` | needs UI change | Some fallback assistant text and capture messages still say "Tasks" as the default product destination. This is mostly mock/fallback copy, but it can reintroduce task-first product language if surfaced in business-line context. | Goal 5. |
| TasksPage | `TasksPage.tsx` | compatibility adapter | TasksPage remains the broad task dynamics, file, Task.md, Task Records, decomposition, completion, scheduler proposal, and writeback approval surface. This is acceptable as Legacy Tasks Explorer and execution infrastructure, not as primary Work navigation. | Keep. Goal 5 should label ownership boundaries rather than delete task mechanics. |
| Task files and Task Records | `TaskFileRepository`, `Task.md`, `Task Records/` guards | should not change now | Task.md, Task Records, task files, blockers, criteria, and subtasks remain necessary execution memory. They should not be renamed or removed during business-line architecture migration. | Preserve. Only add owner resolution around durable business-impacting writes. |
| Scheduler/automation projection | `BusinessLineService.automationSnapshotForBusinessLine()`, TasksPage scheduler readiness, scheduler smoke scripts | needs data-model change | Business workspace projects scheduled/event/routine tasks as Automations & Sensors, and existing scheduler gates use task carriers plus Standing Approval evidence. There is not yet a durable business-line loop object or loop-scoped standing approval owner. | Goal 6 should decide the smallest loop model; do not rewrite scheduler in earlier goals. |
| Scheduler execution gates | scheduled/event readiness, Standing Approval, run-limit evidence, product audit | aligned | Scheduler paths are currently gated as proposal/readiness flows with Standing Approval, run-limit, terminal evidence, and no default provider-visible background execution. | Preserve while adding business-line loop ownership in Goal 6. |
| External Access ingestion | `ExternalAccessSourceIngestionService` | aligned | Preview is read-only; commit requires confirmation; confirmed source ingestion rejects mismatched `businessLineId` vs selected task ownership and creates business records with `shouldAffectFutureContext=false`. | Preserve as pattern for owner mismatch checks. |
| Product and rule-layer audit | `product-feature-impact-audit.ts`, audit summary script, local smoke boundary test | aligned | Product audit reports `businessLineFirst readiness=ready`; rule-layer audit reports `businessLineFirstRules readiness=ready checks=7 issues=0`. | Preserve. |
| Implementation regression audit | audit registry and smoke tests | should not change now | Audit currently proves product/rule readiness and some implementation evidence, but it does not yet fail every new code path that drops business-line ownership in writeback, runtime, UI, or scheduler surfaces. | Goal 8 should add implementation-level regression checks after Goals 1-6 settle contracts. |
| Runtime-native goal and matrix runtime | native runtime orchestration, capability audit | should not change now | Runtime-native goal loops, Agent API promotion, and future matrix runtime remain executor/backend capabilities. They should not become business-line state owners during this architecture slice. | Keep as executor evidence paths. |

### Goal 0 Route Summary

- Goal 1 should centralize ownership resolution and mismatch rejection.
- Goal 2 should add business-line-native Write Intent, proposal, apply-plan, and
  dispatch actions.
- Goal 3 should make run scope explicit and stop relying on optional
  `businessLineId` inference.
- Goal 4 should tighten BusinessLineService mutation boundaries without
  splitting the facade.
- Goal 5 should clean UI ownership language and target display while keeping
  Legacy Tasks Explorer usable.
- Goal 6 should introduce the smallest durable business-line loop ownership
  model for scheduler/automation work.
- Goal 7 should keep cross-business reuse explicit, proposed, and traceable.
- Goal 8 should convert this appendix into implementation regression audits.
- Goal 9 should prove the full UI -> runtime -> writeback -> review -> learning
  loop.

## Migration Sequence

Run architecture goals after the rule-layer goals. Each goal should stop with a
checkpoint and should be reviewed before commit.

Recommended order:

```text
Architecture Goal 0 -> drift audit document and route map
Architecture Goal 1 -> ownership resolver and service boundary
Architecture Goal 2 -> business-line-native Write Intent actions
Architecture Goal 3 -> run scope and context-pack contract
Architecture Goal 4 -> review/record/SOP learning service boundary
Architecture Goal 5 -> UI ownership and writeback target cleanup
Architecture Goal 6 -> scheduler loop ownership and standing approval boundary
Architecture Goal 7 -> cross-business reuse and contamination controls
Architecture Goal 8 -> audit gates for implementation regressions
Architecture Goal 9 -> migration closeout smoke and product audit summary
```

Do not skip Goal 0. It should decide whether the later goals need adjustment
based on the current code.

## Architecture Goal 0: Implementation Drift Audit

### Objective

Create a code-level map of where implementation still assumes task-first
ownership, where compatibility is acceptable, and where architecture changes
are required.

### Scope

Read and classify:

- data model and repositories;
- BusinessLineService and TaskService interaction;
- Write Intent proposal, apply plan, approval, and dispatch;
- RunService context and post-run review;
- RightPanel, Business page, Today page, Tasks page;
- scheduler/automation readiness;
- product audit and smoke tests.

### Acceptance

- The architecture plan is updated with a concrete drift table or appendix.
- Each finding is classified as:
  - aligned;
  - compatibility adapter;
  - needs data-model change;
  - needs service-boundary change;
  - needs writeback change;
  - needs runtime change;
  - needs UI change;
  - should not change now.
- No product behavior changes are made.

### Verification

```bash
rg -n "businessLineId|business_line_id|legacyTaskId|Task Records|Task.md|WriteIntent|RunService|BusinessLineContextPack" src/main src/shared src/renderer
git diff --check
```

### Codex Prompt

```text
Goal: Complete Architecture Goal 0 only - implementation drift audit.

Read:
- AGENTS.md
- docs/specs/goalpilot-task-advancement-framework.md
- docs/specs/task-memory-spec.md
- docs/specs/decision-layer-writeback-orchestration.md
- docs/specs/native-agent-runtime-orchestration.md
- docs/plans/2026-05-30-business-line-architecture-migration-plan.md

Inspect the current implementation across data model, repositories, services,
writeback, runtime, UI, scheduler, and audit tests. Do not refactor product code.

Update this architecture migration plan with a concrete implementation drift
appendix. Classify each finding as aligned, compatibility adapter, needs
data-model change, needs service-boundary change, needs writeback change, needs
runtime change, needs UI change, or should not change now.

Run the verification commands for Architecture Goal 0 and stop with a checkpoint.
```

## Architecture Goal 1: Ownership Resolver And Service Boundary

### Objective

Centralize business-line ownership resolution so every durable write can answer:

```text
What business line owns this?
What task/run carries execution, if any?
Is this one-off or legacy recovery?
```

### Required Behavior

- Add a shared resolver that can resolve owner from direct `businessLineId`,
  task, run, source context, artifact, task file, decision, or legacy task.
- Reject mismatches where an explicit business line does not match the selected
  task/run owner.
- Keep one-off chat legal when no durable business write is requested.
- Keep legacy task recovery legal but labeled.

### Likely Files

- `src/shared/types/business-line.ts`
- `src/main/domain/business-line/business-line-service.ts`
- `src/main/db/repositories/business-line-repository.ts`
- `src/main/domain/run/run-service.ts`
- `src/main/domain/writeback/taskplane-writeback-dispatch-service.ts`
- focused tests in the same folders.

### Acceptance

- Business-line owner resolution has unit tests for direct, task-derived,
  run-derived, legacy, one-off, missing, and mismatch cases.
- BusinessLineService and RunService use the resolver instead of open-coded
  business-line guessing for new paths.
- No historical task-only path breaks.

### Verification

```bash
npm test -- src/main/domain/business-line/business-line-service.test.ts src/main/domain/run/run-service.test.ts src/main/domain/writeback/taskplane-writeback-dispatch-service.test.ts -t "business line|ownership|mismatch|legacy"
npm run lint
npm run build:main
git diff --check
```

### Codex Prompt

```text
Goal: Complete Architecture Goal 1 only - business-line ownership resolver and service boundary.

Read:
- AGENTS.md
- docs/specs/goalpilot-task-advancement-framework.md
- docs/specs/task-memory-spec.md
- docs/specs/decision-layer-writeback-orchestration.md
- docs/plans/2026-05-30-business-line-architecture-migration-plan.md

Implement the smallest shared ownership resolver needed to distinguish durable
business-line owner from task/run execution carrier. Do not migrate historical
data and do not remove task paths.

Requirements:
- resolve owner from explicit businessLineId, task, run, source/artifact/file,
  Decision, or legacy task where available;
- reject explicit businessLineId mismatches with task/run owner;
- keep one-off non-durable runs legal;
- keep legacy task recovery legal and labeled;
- update BusinessLineService, RunService, or writeback dispatch only where the
  resolver removes duplicate guessing.

Run the verification commands for Architecture Goal 1 and stop with a checkpoint.
```

## Architecture Goal 2: Business-Line-Native Write Intent Actions

### Objective

Promote business-line records, reviews, next actions, SOP revisions, and
handoffs from side effects into first-class Write Intent / proposal / apply-plan
actions.

### Required Behavior

Add business-line-native actions:

```text
business_record.create
business_review.record
business_next_action.create
business_sop_revision.propose
business_handoff.record
```

These actions must:

- carry or resolve `businessLineId`;
- include provenance and evidence;
- distinguish active context from proposed memory;
- route risky SOP activation through Decision;
- avoid direct runtime mutation.

### Likely Files

- `src/shared/taskplane-write-intent.ts`
- `src/shared/taskplane-writeback-proposal.ts`
- `src/shared/taskplane-writeback-apply-plan.ts`
- `src/shared/taskplane-writeback-approval.ts`
- `src/shared/taskplane-writeback-dispatch.ts`
- `src/main/domain/writeback/taskplane-writeback-dispatch-service.ts`
- `src/main/domain/business-line/business-line-service.ts`

### Acceptance

- Runtime output can propose a Business Record without converting it into a Task
  Record first.
- A post-run review can be applied through the same confirmation model as other
  writebacks.
- SOP revision proposal is separated from SOP activation.
- Task-native write intents still work.

### Verification

```bash
npm test -- src/shared/taskplane-writeback-proposal.test.ts src/shared/taskplane-writeback-apply-plan.test.ts src/shared/taskplane-writeback-approval.test.ts src/shared/taskplane-writeback-dispatch.test.ts src/main/domain/writeback/taskplane-writeback-dispatch-service.test.ts -t "business|record|review|sop|handoff|task"
npm run lint
npm run build:main
git diff --check
```

### Codex Prompt

```text
Goal: Complete Architecture Goal 2 only - business-line-native Write Intent actions.

Read:
- docs/specs/decision-layer-writeback-orchestration.md
- docs/specs/task-memory-spec.md
- docs/plans/2026-05-30-business-line-architecture-migration-plan.md

Add business-line-native Write Intent/proposal/apply-plan support without
breaking existing task-native actions.

Implement the smallest useful set from:
- business_record.create
- business_review.record
- business_next_action.create
- business_sop_revision.propose
- business_handoff.record

Requirements:
- every business-line-native write must carry or resolve businessLineId;
- runtime output may propose but product services apply;
- risky SOP activation remains separate and Decision-gated;
- task.update_next_step, task.mark_blocked, task.complete.propose, task_file,
  task_record, artifact, source_context, and decision writes keep working;
- add focused tests for proposal, apply plan, approval, and dispatch boundaries.

Run the verification commands for Architecture Goal 2 and stop with a checkpoint.
```

## Architecture Goal 3: Run Scope And Context-Pack Contract

### Objective

Make run scope explicit so every Agent CLI/API run knows whether it is:

```text
global chat
business-line chat
Next Action execution
scheduler loop carrier
legacy task recovery
one-off non-durable action
```

### Required Behavior

- Introduce a typed run scope or context target.
- Business-line runs include `BusinessLineContextPack`.
- Task/Next Action runs include both task execution memory and business-line
  context when available.
- Scheduler runs include business-line loop and carrier evidence.
- Missing business lines are hard errors for business-line-scoped runs.
- One-off chat does not pretend to have durable memory.

### Likely Files

- `src/shared/types/run.ts`
- `src/main/domain/run/run-service.ts`
- `src/shared/business-line-context-pack.ts`
- `src/shared/business-line-post-run-review.ts`
- `src/shared/runtime-context.ts`
- `src/shared/runtime-context-readiness.ts`
- `src/renderer/components/RightPanel.tsx`

### Acceptance

- Run creation tests prove context pack injection for business-line and
  Next Action runs.
- Missing/mismatched business-line scope is blocked before runtime start.
- Completed business-line runs produce post-run review options with source run,
  source action, evidence, and writeback candidates.
- One-off runs do not create business-line review options.

### Verification

```bash
npm test -- src/main/domain/run/run-service.test.ts src/shared/business-line-post-run-review.test.ts src/shared/runtime-context-readiness.test.ts -t "business line|context pack|scope|post-run|one-off|legacy"
npm run lint
npm run build:main
git diff --check
```

### Codex Prompt

```text
Goal: Complete Architecture Goal 3 only - run scope and context-pack contract.

Read:
- docs/specs/goalpilot-task-advancement-framework.md
- docs/specs/native-agent-runtime-orchestration.md
- docs/specs/task-memory-spec.md
- docs/plans/2026-05-30-business-line-architecture-migration-plan.md

Make runtime scope explicit. Do not change provider behavior or promote future
API paths.

Requirements:
- classify runs as global chat, business-line chat, Next Action execution,
  scheduler loop carrier, legacy task recovery, or one-off non-durable action;
- business-line and Next Action runs include BusinessLineContextPack when
  businessLineId is present;
- task/Next Action runs preserve task execution memory and business-line owner;
- missing/mismatched business-line scope blocks before runtime start;
- completed business-line runs expose post-run review options;
- one-off runs do not generate durable business review options.

Run the verification commands for Architecture Goal 3 and stop with a checkpoint.
```

## Architecture Goal 4: Business Memory And Learning Service Boundary

### Objective

Make Business Records, Reviews, SOP revisions, and Next Action links a coherent
service boundary instead of scattered helper behavior.

### Required Behavior

- `recordReview` is the primary bridge from action result to records, next
  actions, Decisions, and SOP proposals.
- `BusinessLineContextPack` reads only approved, non-expired, future-context
  eligible memory by default.
- SOP revision state transitions are explicit:
  `proposed -> active -> superseded/disabled`, `proposed -> rejected`, and
  rollback.
- Risky revision activation requires approved Decision.
- Cross-business reuse creates proposed learning in the target business line,
  not active copied context.

### Likely Files

- `src/main/domain/business-line/business-line-service.ts`
- `src/main/db/repositories/business-line-repository.ts`
- `src/shared/types/business-line.ts`
- `src/shared/memory-surface-policy.ts`
- `src/shared/task-memory-retrieval.ts`

### Acceptance

- Tests cover review-created records, review-created next actions, risky SOP
  Decision gate, expiry, rollback, disabled/rejected exclusion, and
  cross-business inheritance as proposed-only learning.
- Context pack excludes proposed/rejected/disabled/superseded/expired SOPs.
- Records marked `shouldAffectFutureContext=false` are visible as history but
  excluded from default future context.

### Verification

```bash
npm test -- src/main/domain/business-line/business-line-service.test.ts src/shared/memory-surface-policy.test.ts src/shared/task-memory-retrieval.test.ts -t "review|record|SOP|revision|context|inherit|cross-business"
npm run lint
npm run build:main
git diff --check
```

### Codex Prompt

```text
Goal: Complete Architecture Goal 4 only - business memory and learning service boundary.

Read:
- docs/specs/task-memory-spec.md
- docs/specs/context-transition-policy.md
- docs/plans/2026-05-30-business-line-architecture-migration-plan.md

Strengthen BusinessLineService as the memory/learning facade. Do not redesign UI.

Requirements:
- recordReview remains the bridge from action result to Business Records,
  Reviews, Next Actions, Decisions, and SOP revision proposals;
- context pack includes only accepted, non-expired, future-context-eligible
  records/SOPs by default;
- proposed/rejected/disabled/superseded/expired SOPs stay evidence only;
- risky SOP activation requires approved Decision;
- cross-business inheritance stays proposed or source-recorded, never silently
  active in the target business line;
- add tests for each state transition and exclusion rule.

Run the verification commands for Architecture Goal 4 and stop with a checkpoint.
```

## Architecture Goal 5: UI Ownership And Writeback Target Cleanup

### Objective

Align UI interaction with the architecture: business line is the durable
workspace, Next Action is the execution target, and every writeback shows a
target before mutation.

### Required Behavior

- Work navigation keeps Today, Business, Chat, Decisions as primary.
- Tasks remains Legacy Tasks Explorer or compatibility recovery.
- Business workspace exposes execution entrypoints without sending users back to
  task-first mental models.
- RightPanel and full Chat show context/writeback target:
  Global, Business Line, Next Action, Run/Review, or Legacy Task.
- Writeback approval cards show business owner and task carrier separately.
- UI copy does not imply Task is the durable product model.

### Likely Files

- `src/renderer/App.tsx`
- `src/renderer/pages/BriefPage.tsx`
- `src/renderer/pages/BusinessLinesPage.tsx`
- `src/renderer/components/RightPanel.tsx`
- `src/renderer/pages/TasksPage.tsx`
- `src/renderer/pages/ConnectionsPage.tsx`
- `src/renderer/pages/WorkHabitsPage.tsx`

### Acceptance

- Opening from Today or Business passes business-line context to RightPanel.
- Writeback cards display business-line owner when present.
- Legacy task recovery is visible but not the primary route.
- No broad UI redesign is required in this goal.

### Verification

```bash
npm test -- src/renderer/App.test.tsx src/renderer/lib/router.test.ts src/renderer/pages/BusinessLinesPage.test.tsx -t "business|Today|Chat|writeback|Legacy Tasks|context"
npm run lint
npm run build
git diff --check
```

Manual/UI verification should open the app and check:

- Today suggestion -> Business line -> RightPanel;
- Business Next Action -> RightPanel -> post-run review;
- Chat full view context indicator;
- Legacy Tasks Explorer remains reachable.

### Codex Prompt

```text
Goal: Complete Architecture Goal 5 only - UI ownership and writeback target cleanup.

Read:
- docs/specs/agent-output-contract.md
- docs/specs/priority-attention-routing.md
- docs/plans/2026-05-30-business-line-architecture-migration-plan.md

Clean up UI ownership boundaries without broad visual redesign.

Requirements:
- Today, Business, Chat, Decisions remain primary Work routes;
- Tasks remains Legacy Tasks Explorer / compatibility recovery;
- Business workspace execution entrypoints pass businessLineId into RightPanel;
- RightPanel and full Chat show context/writeback target: Global, Business Line,
  Next Action, Run/Review, or Legacy Task;
- writeback approval cards display business owner and execution carrier
  separately when both exist;
- do not remove task mechanics or redesign the whole page.

Run the verification commands for Architecture Goal 5, perform the listed manual
UI checks when practical, and stop with a checkpoint.
```

## Architecture Goal 6: Scheduler Loop Ownership

### Objective

Move scheduler/event/routine architecture from generic background task language
to business-line loop ownership while keeping task carriers and existing
readiness gates.

### Required Behavior

- Scheduled/event/routine tasks can be projected as business-line automations
  and sensors.
- Automation readiness proves business line, carrier task, runtime, Standing
  Approval, run limits, and review boundary.
- Sensors are read-only until user confirmation or a loop policy permits action.
- Scheduler Decision proposals use business-line scope when available.
- Scheduler direct persistence remains blocked unless the same gates pass.

### Likely Files

- `src/shared/agent-orchestration.ts`
- `src/shared/scheduler-decision-proposal.ts`
- `src/main/domain/run/run-service.ts`
- `src/main/domain/business-line/business-line-service.ts`
- `scripts/*scheduler*smoke*.mjs`
- `src/main/local-smoke-boundaries-script.test.ts`

### Acceptance

- Business workspace automations/sensors remain read-only projections unless
  explicitly authorized.
- Scheduled/event trigger readiness includes business-line loop evidence.
- Existing CLI-first scheduler path remains supported.
- Future API scheduler paths remain deferred until readiness gates prove real
  evidence.

### Verification

```bash
npm test -- src/shared/agent-orchestration.test.ts src/shared/scheduler-decision-proposal.test.ts src/main/local-smoke-boundaries-script.test.ts -t "business-line loop|sensor|automation|scheduled|standing approval|readiness"
npm run audit:product-progress -- --next
npm run lint
npm run build:main
git diff --check
```

### Codex Prompt

```text
Goal: Complete Architecture Goal 6 only - scheduler loop ownership.

Read:
- docs/specs/native-agent-runtime-orchestration.md
- docs/specs/pilot-decision-contract.md
- docs/plans/2026-05-30-business-line-architecture-migration-plan.md

Represent scheduler/event/routine work as business-line loops while keeping task
carriers and existing readiness gates. Do not rewrite the scheduler.

Requirements:
- scheduled/event/routine tasks project as business-line automations or sensors;
- automation readiness includes business line, carrier task, runtime, Standing
  Approval, run limit, and review boundary evidence;
- sensors are read-only until confirmation or valid loop policy;
- scheduler Decision proposals use business-line scope when available;
- future API scheduler paths remain deferred unless existing readiness gates pass.

Run the verification commands for Architecture Goal 6 and stop with a checkpoint.
```

## Architecture Goal 7: Cross-Business Reuse And Contamination Controls

### Objective

Allow one business line to learn from another without silently mixing context.

### Required Behavior

- Cross-business reuse requires explicit user action or creation-flow selection.
- Copied records/SOPs enter the target business line as proposed or template
  evidence, not active context.
- Context packs exclude other business lines by default.
- RightPanel/Chat show when another business line is referenced.
- Reuse creates provenance pointing to the source business line.

### Likely Files

- `src/shared/business-line-creation-template.ts`
- `src/main/domain/business-line/business-line-service.ts`
- `src/main/db/repositories/business-line-repository.ts`
- `src/shared/types/business-line.ts`
- `src/renderer/pages/BusinessLinesPage.tsx`

### Acceptance

- Creating a business line from another copies structure and active SOP text
  only into proposed learning or source records.
- Accepted SOPs from source line are not active in target line until accepted.
- Cross-business references are traceable and reversible.

### Verification

```bash
npm test -- src/main/domain/business-line/business-line-service.test.ts src/renderer/App.test.tsx -t "inherit|cross-business|proposed|context|source business line"
npm run lint
npm run build:main
git diff --check
```

### Codex Prompt

```text
Goal: Complete Architecture Goal 7 only - cross-business reuse and contamination controls.

Read:
- docs/specs/task-memory-spec.md
- docs/specs/context-transition-policy.md
- docs/plans/2026-05-30-business-line-architecture-migration-plan.md

Allow explicit reuse across business lines without silent context mixing.

Requirements:
- cross-business reuse requires explicit user action or creation-flow selection;
- copied structure/records/SOPs become proposed learning or source records in
  the target business line, not active context;
- BusinessLineContextPack excludes other business lines by default;
- RightPanel/Chat or creation surfaces show when another business line is
  referenced;
- provenance points to source business line;
- add tests for inheritance, exclusion, and explicit activation.

Run the verification commands for Architecture Goal 7 and stop with a checkpoint.
```

## Architecture Goal 8: Implementation Regression Audit

### Objective

Add tests/audit checks that prevent future code from drifting back to
task-first durable ownership.

### Required Behavior

Extend audit beyond rule docs to implementation signals:

- new durable business records require business-line owner;
- writeback proposal/apply/dispatch preserves businessLineId when present;
- run scope cannot silently drop businessLineId;
- UI primary navigation does not re-promote Tasks as main Work owner;
- scheduler loops do not become generic background tasks without business-line
  ownership language.

### Likely Files

- `src/shared/product-feature-impact-audit.ts`
- `src/shared/product-feature-impact-audit.test.ts`
- `scripts/product-feature-impact-audit-summary.mjs`
- `src/main/local-smoke-boundaries-script.test.ts`

### Acceptance

- `npm run audit:product-progress -- --next` reports architecture readiness or
  concrete blocked items.
- Tests fail if core code removes businessLineId preservation in Writeback,
  RunService, BusinessLineService, or primary UI routing.
- Compatibility task paths remain allowed when explicitly labeled.

### Verification

```bash
npm test -- src/shared/product-feature-impact-audit.test.ts src/main/local-smoke-boundaries-script.test.ts -t "businessLineFirst|architecture|business line|task-first"
npm run audit:product-progress -- --next
npm run lint
npm run build:main
git diff --check
```

### Codex Prompt

```text
Goal: Complete Architecture Goal 8 only - implementation regression audit.

Read:
- docs/specs/goalpilot-task-advancement-framework.md
- docs/plans/2026-05-30-business-line-architecture-migration-plan.md
- src/shared/product-feature-impact-audit.ts

Extend product audit and local smoke coverage so future code cannot silently
drift back to task-first durable ownership.

Requirements:
- audit checks distinguish rule-layer readiness from implementation readiness;
- fail when durable business writes drop businessLineId;
- fail when RunService business-line scope is silently lost;
- fail when writeback proposal/apply/dispatch drops businessLineId;
- fail when primary UI routing promotes Tasks as durable Work owner again;
- keep explicitly labeled legacy task recovery legal.

Run the verification commands for Architecture Goal 8 and stop with a checkpoint.
```

## Architecture Goal 9: Closeout Smoke

### Objective

Prove one full business-line architecture loop from UI entry to runtime evidence
to review and learning, without claiming future API paths are fully complete.

### Required Behavior

Smoke scenario:

```text
create/open business line
-> Today suggestion or Business Next Action
-> run with BusinessLineContextPack
-> runtime output proposes business record / next action / SOP revision
-> product writeback approval applies allowed writes
-> review records outcome
-> accepted non-risky SOP enters context
-> risky SOP stays behind Decision
-> next Today suggestion changes
```

### Acceptance

- One deterministic local smoke covers the above with mocked runtime/service
  evidence.
- Product audit distinguishes:
  - business-line architecture path ready;
  - future Agent API/provider automation paths still deferred where appropriate.
- Worktree has no unrelated product churn.

### Verification

```bash
npm test -- src/main/domain/business-line/business-line-service.test.ts src/main/domain/run/run-service.test.ts src/shared/product-feature-impact-audit.test.ts -t "business-line architecture|learning loop|post-run|Decision|Today"
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

### Codex Prompt

```text
Goal: Complete Architecture Goal 9 only - closeout smoke for business-line architecture.

Read:
- docs/specs/goalpilot-task-advancement-framework.md
- docs/specs/decision-layer-writeback-orchestration.md
- docs/specs/native-agent-runtime-orchestration.md
- docs/plans/2026-05-30-business-line-architecture-migration-plan.md

Add or update deterministic local smoke/tests proving one full business-line
architecture loop. Do not claim future API/provider automation is complete.

Scenario:
- create/open business line;
- produce Today suggestion or Business Next Action;
- run with BusinessLineContextPack;
- runtime output proposes Business Record / Next Action / SOP revision;
- product writeback approval applies allowed writes;
- review records outcome;
- accepted non-risky SOP enters context;
- risky SOP stays behind Decision;
- next Today suggestion changes.

Product audit must still distinguish architecture readiness from future API
deferred paths.

Run the verification commands for Architecture Goal 9 and stop with a checkpoint.
```

## Review Checklist For Each Goal

Before committing each architecture goal, answer:

- Did this change preserve Business Line as durable owner?
- Did it keep Task as execution carrier instead of deleting task mechanics?
- Did runtime output remain proposal/evidence rather than direct mutation?
- Are risky writes still gated by Decision or Standing Approval?
- Is legacy task recovery still usable and labeled?
- Did the change add or update tests that would catch the same drift later?
- Did it avoid broad naming/brand churn?
- Did audit output still distinguish current CLI-ready paths from future API
  deferred paths?

## Stop Conditions

Pause and split the goal if:

- a small service change turns into a scheduler/runtime rewrite;
- a UI copy cleanup starts moving navigation architecture;
- a business-line owner resolver starts migrating all historical data;
- a Write Intent change bypasses existing confirmation gates;
- a scheduler loop starts executing without Standing Approval or operator
  confirmation;
- a matrix-runtime integration claims product ownership instead of executor
  delegation;
- the goal needs a product naming decision.

## Expected End State

The architecture migration is complete when:

- business-line ownership can be resolved for every durable business write;
- Write Intent supports business-line-native records/reviews/next actions/SOPs;
- RunService scope is explicit and context-pack injection is tested;
- BusinessLineService owns the memory/learning facade;
- UI entrypoints show business owner and execution carrier separately;
- scheduler/event/routine work is represented as business-line loops with task
  carriers;
- cross-business reuse is explicit, proposed, and traceable;
- product audit catches task-first durable ownership regressions;
- future Agent API/provider paths can continue independently without blocking
  the business-line architecture.
