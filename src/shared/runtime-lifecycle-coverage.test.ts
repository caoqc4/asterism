import { describe, expect, it } from 'vitest';

import {
  RUNTIME_LIFECYCLE_COVERAGE,
  summarizeRuntimeLifecycleCoverage,
} from './runtime-lifecycle-coverage.js';

const requiredPhases = [
  'task_intake_and_capture',
  'context_entry_and_binding',
  'context_assembly',
  'priority_and_attention',
  'execution_start_and_step_loop',
  'information_routing_and_memory',
  'decision_and_confirmation',
  'verification_and_closeout',
  'pause_resume_and_handoff',
  'project_and_hierarchy_runtime',
  'activity_timeline_and_audit',
  'capabilities_and_external_access',
];

describe('runtime lifecycle coverage matrix', () => {
  it('tracks product runtime phases beyond Agent operating principles', () => {
    expect(RUNTIME_LIFECYCLE_COVERAGE.map((item) => item.phase)).toEqual(requiredPhases);
    expect(RUNTIME_LIFECYCLE_COVERAGE.some((item) => item.outOfAgentPrinciplesScope.length > 0)).toBe(true);
  });

  it('does not claim full runtime lifecycle coverage while gaps remain', () => {
    const summary = summarizeRuntimeLifecycleCoverage();

    expect(summary.implemented).toBe(0);
    expect(summary.partial).toBeGreaterThan(0);
    expect(RUNTIME_LIFECYCLE_COVERAGE.some((item) => (
      item.phase === 'capabilities_and_external_access' &&
      item.gaps.some((gap) => gap.includes('Capability state'))
    ))).toBe(true);
  });

  it('keeps every phase actionable', () => {
    for (const item of RUNTIME_LIFECYCLE_COVERAGE) {
      expect(item.coveredBy.length).toBeGreaterThan(0);
      expect(item.outOfAgentPrinciplesScope.length).toBeGreaterThan(0);
      expect(item.gaps.length).toBeGreaterThan(0);
      expect(item.nextImplementation.length).toBeGreaterThan(0);
    }
  });

  it('treats the old WorkbenchPage as retired instead of a runtime-deepening target', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('Legacy WorkbenchPage remains retired');
    expect(text).not.toContain('remaining Workbench');
    expect(text).not.toContain('Workbench write paths');
    expect(text).not.toContain('Implement Decisions Workbench');
  });

  it('keeps provider-visible context assembly separate from hidden non-model entries', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('RuntimeContextAssemblyGate distinguishes provider-visible task execution');
    expect(text).toContain('providerCall=no and modelExposure=hidden');
    expect(text).not.toContain('not every execution entry point blocks on it yet');
  });

  it('tracks pending-memory checks for task switching', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('TaskMemoryCoverageEvaluation maps the Task Memory Spec outcomes');
    expect(text).toContain('task-switch also consumes pending TaskMemoryGuidanceState through AutoContextClearReadiness');
  });

  it('tracks pending-memory checks for new run start', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('block run_start when prior task-memory guidance is still pending');
    expect(text).toContain('Run start pre-step verification consumes pending TaskMemoryGuidanceState');
  });

  it('tracks service-boundary task completion and waiting-state guards', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('completion transitions require task_completion memory coverage');
    expect(text).toContain('ignores Run and completion-check evidence older than the latest completion-criteria update');
    expect(text).toContain('waiting transitions require a waiting reason');
  });

  it('tracks service-boundary hierarchy ownership guards', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('parent is an open top-level project task');
  });

  it('tracks pending-memory checks for phase closeout handoff', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('Phase closeout requires TaskMemoryCoverageEvaluation and pending TaskMemoryGuidanceState checks');
    expect(text).toContain('unresolved blocker, dependency, user-confirmation, and follow-up-confirmation outcomes');
  });

  it('tracks pending-memory checks for paused run resume', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('Run resume passes through runtime action evaluation and pending TaskMemoryGuidanceState checks');
  });

  it('tracks pending-memory checks for approved decision checkpoint resume', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('Approved Decision checkpoint resume passes through pending TaskMemoryGuidanceState checks');
  });
});
