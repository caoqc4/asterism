# Runtime Lifecycle Coverage

Date: 2026-05-14

## Purpose

Runtime deepening is broader than Agent execution compliance.

The Agent Operating Principles describe how Agents should behave during task work. The runtime lifecycle describes how the product should coordinate task intake, context, execution, memory, verification, decisions, hierarchy, task dynamics, and capabilities across UI, data, and Agent surfaces.

Source of truth in code:

- `src/shared/runtime-lifecycle-coverage.ts`

Related but narrower:

- `src/shared/agent-principles.ts`
- `src/shared/agent-principles-compliance.ts`

## Lifecycle Phases

The current coverage matrix tracks these phases:

1. Task intake and capture
2. Context entry and binding
3. Context assembly
4. Priority and attention
5. Execution start and step loop
6. Information routing and memory
7. Decision and confirmation
8. Verification and closeout
9. Pause, resume, and handoff
10. Project and hierarchy runtime
11. Task dynamics and audit
12. Capabilities and external access

Each phase records:

- current status;
- priority;
- runtime scope;
- what currently covers it;
- what sits outside the Agent principles;
- known gaps;
- next implementation steps.

## Current Read

The product is not yet runtime-complete.

Strongest areas:

- information routing taxonomy;
- task closeout and context clearing;
- run, run-step, task closeout, context clear, and first-pass project verification wired into completion and project detail surfaces;
- initial task intake routing for the global capture flow;
- initial context snapshot and required read-order assembly policy, including ordinary Run and Code Agent model-producer execution blocking when required inputs are missing;
- Decision/checkpoint boundaries for risky tools;
- early task hierarchy model migration;
- first-pass project child draft validation before confirmed subtask creation.
- service-level child task capture now blocks generic phase-template titles and parent-title repeats.
- project decomposition generation checks the full task list for existing children, including `parentTaskId` links.
- task creation, parent moves, and parent-side child list updates keep `parentTaskId` and parent `childTaskIds` synchronized at the service boundary.
- hierarchy consistency diagnostics can find old parent/child mismatches through the service/IPC boundary, can produce a non-mutating repair plan, can apply only revalidated safe repairs, can explain manual-review conflicts, and can apply explicit manual hierarchy resolutions through Decisions judgment-center maintenance actions.
- renderer hierarchy projection treats persisted task type, facets, parent id, and child ids as authoritative, with local attributes retained only as a legacy missing-field fallback.
- legacy title-pattern phase follow-up inference is now limited to objects without a parent field, and Tasks no longer mutates local hierarchy attributes during list loading.
- Brief focus projection, RightPanel closeout checks, and task completion checks now share the same persisted-field hierarchy authority instead of reading local task attributes directly.
- Tasks project moves, project decomposition, workspace selection context, completion handoff, Brief projection, RightPanel closeout, and task completion checks no longer write or consume renderer-local parent/child hierarchy attributes for active workflows.
- task attribute storage no longer writes empty local hierarchy fields by default, and Tasks clears legacy local hierarchy fields once persisted task records provide parent/child authority.
- PriorityAttentionProjection now centralizes shared priority ordering plus optional display limits, so Tasks can use the full queue while Brief uses the same ordered queue as a capped attention summary.
- RuntimeHandoffPreview now centralizes manual refresh/archive preview generation from the shared handoff result plus archive snapshot, while preserving the existing RightPanel layout.
- RuntimeRecoveryGuidance now centralizes structured Task.md / Task Record recovery recommendations for durable Agent tools, while preserving the existing legacy guidance strings.
- RuntimeIntakeEvaluation now has regression coverage for task-specific user corrections going to Task Records versus cross-task corrections going to Work Habit proposals.
- SourceMaterialQualityEvaluation now combines with SourceFreshnessEvaluation in RuntimeContextManifest, so source inclusion can account for freshness, traceability, credibility, duplication, and sensitivity.
- ordinary task files stay in the task-file class instead of being projected as artifacts.

Weakest areas:

- future task creation entry points preserving the current service-boundary intake and pre-create evaluation;
- future child-task creation entry points preserving the same service-boundary capture checks and project child-draft evaluation;
- future provider-visible entry points preserving full context snapshot metadata;
- future connector ingestion preserving source quality signals;
- future multi-decision workflows, if a concrete batch approve/defer/cancel need appears;
- renderer-local task hierarchy attributes are now compatibility fallback data only for old records that still lack persisted hierarchy fields; the remaining cleanup is deleting that fallback when old-record support can end.
- future entry points preserving capability state in context/action evaluation;
- Run-side grouped replay presentation if retained Run-side runtime views are resumed.

`RuntimeEntrypointCoverage` remains a regression registry by design, not a dynamic discovery system. New runtime entrypoints should be added explicitly and fail tests if they do not meet their kind-level gate baseline.

Provider-visible planning is tracked separately from provider-visible execution. A draft-only planner such as project decomposition generation must assemble task context, include task-memory guidance, and pass subtask-draft checks, while durable creation stays behind a separate mutation entrypoint.

Provider-visible assistance is tracked separately from execution and planning. Global assistance can rely on product principles, but task-bound assistance must load persisted task detail before model exposure and must stay read-only.

Product-level durable configuration is also tracked separately from task mutation. AI runtime settings, Work Habit preference memory, and reusable process-template library writes affect future runtime behavior, but they do not mutate a specific task and should not be forced through `task_mutation`.

Capability probes are tracked separately from execution. A sandbox backend probe may inspect local runtime readiness, but it must remain read-only: no Run start, no task mutation, and no implicit scheduler decision.

## Design Rule

Do not treat Agent Principles compliance as equivalent to runtime lifecycle completion.

Agent Principles compliance asks:

> Did Agent execution follow the operating contract?

Runtime Lifecycle coverage asks:

> Did the product coordinate UI state, data state, execution state, memory, verification, and user decisions across the whole task lifecycle?

Both are needed.

## Recommended Order

1. Keep future provider-visible entry points on `RuntimeContextSnapshot` and `RuntimeContextAssemblyPolicy`.
2. Preserve task creation routing through intake, closeout gating, or child-draft evaluation according to context.
3. Keep `pre_step`, `post_step`, and `subtask_start` as the required baseline for future execution services and panel durable actions.
4. Keep project state transitions on project verification before adding new completion paths.
5. Keep Decisions grouped context read-only until a real multi-decision workflow needs batch action support.
6. Keep future model, external-access, workspace, or tool-exposure changes on `RuntimeCapabilitySnapshot`.
7. Finish data model migration for task hierarchy and facets, and route every child-task creation path through shared child draft evaluation.

## Status Update - 2026-05-16

The Decisions judgment-center baseline is now implemented.

- Pending Decisions are projected through `DecisionJudgmentProjection` and exposed by `DecisionService.listJudgments`.
- The Decisions page now presents judgment context, options, recommendation, grouped pending-decision context, and approve/defer/cancel effects.
- The Decisions page now also surfaces task hierarchy manual-review items and safe repair actions, so historical parent/child conflicts have a user-facing judgment-center path without adding another Tasks page workflow.
- The page keeps failed action attempts visible with retry feedback and disables duplicate actions while an action is pending.

The remaining lifecycle gap is not a generic Decisions inbox gap anymore. It is limited to future multi-decision workflows, which should stay deferred until users need batch approve/defer/cancel.

Task dynamics has also moved closer to the intended task-memory/audit role: the Tasks task-dynamics view now consumes selected Run details and projects Run steps into the same visible `RuntimeEventRecord` stream as task timeline events, Task Records, and Decisions. The remaining replay gap is limited to future Run-side grouped replay presentation if retained Run-side runtime views are resumed.
