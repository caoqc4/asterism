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
});
