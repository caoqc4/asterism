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
- Missing: subagent product-runtime compliance.

The current runtime deepening work has made meaningful progress on information routing, context clearing, task closeout, run verification, and confirmation boundaries. It has not yet fully enforced required read order, Task.md update policy, project-level verification, source freshness, or subagent handoff requirements.

## Highest Priority Gaps

### P0

1. Required read order is not yet enforced by a shared runtime policy.
   A first `RuntimeContextAssemblyPolicy` now exists; ordinary Run model execution and Code Agent model-producer execution are blocked when required inputs such as Task.md are missing. The remaining gap is enforcement at every execution boundary, plus source freshness and inclusion/exclusion reasons.

2. Task creation and subtask creation need a shared pre-create evaluator.
   A first `RuntimeIntakeEvaluation` now routes RightPanel task capture away from Task Records, task files, Decisions, Work Habits, and discussion-only input. `TaskService.create` now enforces duplicate/generic capture checks, and child-task capture blocks generic phase-template titles or titles that only repeat the parent. Project decomposition also checks the full task list for existing children before generating another draft. The remaining gap is applying one confirmation boundary to every retained child-task creation path.

3. Project-level verification is only partially wired.
   Runtime verification now covers run, run step, task closeout, project, and context clear. Project completion uses project verification in the completion modal, and the project detail structure surface shows the same verification summary before completion. Project verification now includes artifact/source evidence counts and Decision effect summaries for pending, approved, deferred, and cancelled decisions. A first child-draft evaluator blocks duplicate, generic, parent-overlapping, or underspecified subtasks before confirmed project-child creation, including the case where existing children are linked by `parentTaskId` rather than only `childTaskIds`. Task creation and parent moves now keep both relationship fields synchronized at the service boundary. The remaining gap is routing more project state transitions through the same verification, not only completion/detail surfaces.

4. Pre-step and post-step verification are not fully wired.
   First-pass `pre_step` and `post_step` modes now exist in `runtime-verification`, covering action permission, pending decisions, required context, and durable-change recovery notes. The remaining gap is wiring them into every Run service and panel durable action path.

5. Decisions judgment center is incomplete.
   Decisions exist as records and checkpoint gates, but the Decisions page is not yet a full judgment inbox with context, options, recommendation, and effect after approval or rejection.

### P1

1. Task.md update recommendations are not systematic.
   Task.md is classified correctly and can sync edits back to task fields, but runtime does not yet ask whether Task.md should be updated after every durable state change.

2. Task Record worthiness is not centralized.
   Context clearing and phase closeout behave better, but user corrections, option comparisons, failure reviews, and external signals need a shared evaluator.

3. Source freshness and traceability need runtime scoring.
   Source materials have metadata, but freshness, credibility, duplication, sensitivity, and inclusion/exclusion reasons are not yet first-class runtime checks.

4. Subagent protocol needs a product-runtime object.
   The principles define scope and handoff rules, but there is no `SubagentHandoffEvaluation` or equivalent yet.

### P2

1. Work Habit boundary should catch more user corrections.
   Work Habit proposals exist, but not every correction is routed through task-specific vs cross-task evaluation.

## Implementation Direction

The next runtime-deepening packages should follow this order:

1. Add `RuntimeContextAssemblyPolicy` for required read order and source inclusion reasons.
2. Extend `runtime-verification` with `project`, `pre_step`, and `post_step` modes.
3. Extend task creation and subtask creation evaluators beyond the initial RightPanel intake path.
4. Add Task.md update and Task Record worthiness evaluators.
5. Build the Decisions judgment center on top of the existing Decision/checkpoint data model.

This keeps the work aligned with the principle document instead of creating isolated fixes.
