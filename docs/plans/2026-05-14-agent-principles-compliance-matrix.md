# Agent Principles Compliance Matrix

Date: 2026-05-14

## Purpose

Runtime deepening is only useful if it turns the Agent Operating Principles into product behavior.

This matrix tracks each major section of `Taskplane Agent Operating Principles` against the current runtime implementation. It should be treated as a living checklist, not a claim that every rule is already enforced.

Source of truth in code:

- `src/shared/agent-principles.ts`
- `src/shared/agent-principles-compliance.ts`

## Current Summary

Current status is intentionally conservative:

- Fully implemented: none.
- Partially implemented: most core runtime areas.
- Missing: none tracked as fully absent, though every section still has known gaps.

The current runtime deepening work has made meaningful progress on information routing, context clearing, task closeout, run verification, confirmation boundaries, task creation checks, source inclusion checks, Decisions judgment, task dynamics, and subagent handoff boundaries. Current retained execution and creation entry points are guarded by shared evaluators or service-boundary checks; the remaining risk is preserving those boundaries for future execution surfaces, future creation paths, connector-level source quality signals, or future product entry points for subagent handoffs.

## Highest Priority Gaps

### P0

1. Required read order is enforced for retained provider-visible execution.
   `RuntimeContextAssemblyPolicy` exists; ordinary Run model execution and Code Agent model-producer execution are blocked when required inputs such as Task.md are missing. Source freshness, source quality, and selected-file relevance reasons are now represented in context manifests. The remaining gap is preserving this policy for future provider-visible execution boundaries and future connector ingestion paths.

2. Future task creation and subtask creation entry points must keep the shared pre-create evaluator.
   A first `RuntimeIntakeEvaluation` now routes RightPanel task capture away from Task Records, task files, Decisions, Work Habits, and discussion-only input. `TaskService.create` now enforces duplicate/generic capture checks, and child-task capture blocks generic phase-template titles or titles that only repeat the parent. Project decomposition also checks the full task list for existing children before generating another draft. The remaining gap is preserving this boundary for future retained child-task creation paths.

3. Project-level verification is only partially wired.
   Runtime verification now covers run, run step, task closeout, project, and context clear. Project completion uses project verification in the completion modal, and the project detail structure surface shows the same verification summary before completion. Project verification now includes artifact/source evidence counts and Decision effect summaries for pending, approved, deferred, and cancelled decisions. A first child-draft evaluator blocks duplicate, generic, parent-overlapping, or underspecified subtasks before confirmed project-child creation, including the case where existing children are linked by `parentTaskId` rather than only `childTaskIds`. Task creation, parent moves, and parent-side child list updates now keep both relationship fields synchronized at the service boundary. The remaining gap is routing more project state transitions through the same verification, not only completion/detail surfaces.

4. Future execution and write entry points must keep opting into runtime gates.
   `pre_step`, `post_step`, and `subtask_start` are wired into the current retained Run services, resume paths, Decision actions, panel durable actions, task transitions, and Agent durable tools. Direct task-bound service writes use `task_mutation` plus `pre_step` as the minimum boundary. The remaining risk is future scheduled/event execution, new provider-visible tools, or new panel write paths bypassing their matching gates.

5. Runtime entrypoint coverage is a regression registry, not automatic enforcement.
   Current retained execution, context-transition, decision-action, durable-write, and task-dynamics paths are covered by shared runtime gates and regression registries. Retained mutable/capability IPC channels now have to map to a registered entrypoint or an explicit read-only exemption. Future entrypoints must be registered with their kind-level gate baseline before they are treated as covered.

6. Runtime entrypoint gate protocol now belongs to the Agent execution contract.
   Before a retained entrypoint mutates durable state, starts or resumes execution, clears context, or changes a decision, it must be classified by affected object/boundary, routed through the smallest applicable shared gate, and registered in `RuntimeEntrypointCoverage`. UI-only read/filter/selection/display paths remain exempt unless they also change state.

### P1

1. Task.md update recommendations are partially systematic.
   Task.md is classified correctly, direct Task.md saves and important-file references use `TaskMdUpdateNeedEvaluation`, Agent durable-tool guidance can propose Task.md recovery writes, and ordinary file creation cannot bypass the reserved Task.md path. The remaining gap is keeping new durable state changes wired into the same evaluator.

2. Task Record worthiness is centralized for current retained creation paths.
   Context refresh, phase closeout, manual Task Record creation, completion handoff, project decomposition self-check, and Agent source-context recovery guidance use `TaskRecordWorthinessEvaluation`. Generic file creation cannot create `Task Records/` files. The remaining gap is preserving that boundary for future retained tool-driven Task Record creation paths.

3. Source ingestion needs richer connector signals.
   Freshness and source-quality checks now exist as shared runtime evaluators, and RuntimeContextManifest combines them into inclusion metadata. The remaining gap is passing explicit credibility, duplicate, and sensitivity signals from future connector ingestion paths.

4. Subagent protocol needs product entry-point wiring.
   A shared `SubagentHandoffEvaluation` now verifies inherited principles, task context, scope, allowed actions/files, confirmation boundaries, and handoff completeness. The remaining gap is wiring it into a future product delegation surface before any subagent result can update task memory or files.

### P2

1. Work Habit boundary should remain confirmation-based.
   Runtime intake now covers the main boundary between task-specific corrections, which should become Task Records, and cross-task corrections, which should become Work Habit proposals. The remaining gap is preserving that boundary as more intake surfaces are added.

## Implementation Direction

The next runtime-deepening packages should follow this order:

1. Keep future provider-visible execution boundaries on `RuntimeContextAssemblyPolicy` with full source and selected-file metadata.
2. Keep future execution services and panel durable actions registered in `RuntimeEntrypointCoverage` with their kind-level gate baseline.
3. Preserve the task creation boundary: intake for task capture, closeout gating for follow-up capture, and child-draft evaluation for project children.
4. Keep Task.md update and Task Record worthiness evaluators on every new retained memory write surface.
5. Keep Decisions grouped-context display read-only until a real multi-decision workflow needs batch action support.

This keeps the work aligned with the principle document instead of creating isolated fixes.

## Status Update - 2026-05-16

The Decisions judgment-center baseline is now implemented.

- `DecisionJudgmentProjection` centralizes category, urgency, task signal, options, recommendation, impact, reversibility, grouping, and ordering semantics.
- `DecisionService.listJudgments` exposes the projection from the domain boundary, so the renderer does not rebuild judgment semantics from raw Decisions.
- The Decisions page shows context, options, recommendation, grouped pending-decision context, and action effects after approve/defer/cancel.
- Decision actions are guarded, failed actions remain visible with retry feedback, and duplicate action clicks are disabled while an action is pending.
- Task hierarchy manual-review items and safe hierarchy repairs are surfaced in the Decisions page, so parent/child structure conflicts are handled as explicit user judgments instead of silent task-list mutations.

The remaining Decisions work is intentionally narrow: keep grouped Decisions read-only until a real multi-decision workflow requires batch approve/defer/cancel.
