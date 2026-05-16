import { describe, expect, it } from 'vitest';

import {
  RUNTIME_ENTRYPOINT_COVERAGE,
  findRuntimeEntrypointCoverageIssues,
  findRuntimeEntrypointPolicyIssues,
  requiredRuntimeEntrypointGatesForKind,
  runtimeEntrypointsByKind,
} from './runtime-entrypoint-coverage.js';

describe('runtime entrypoint coverage', () => {
  it('has no registered entrypoint with missing required gates', () => {
    expect(findRuntimeEntrypointCoverageIssues()).toEqual([]);
  });

  it('has no registered entrypoint below its kind-level gate baseline', () => {
    expect(findRuntimeEntrypointPolicyIssues()).toEqual([]);
  });

  it('keeps registered entrypoints uniquely owned and described', () => {
    const ids = RUNTIME_ENTRYPOINT_COVERAGE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of RUNTIME_ENTRYPOINT_COVERAGE) {
      expect(entry.owner.trim()).not.toBe('');
      expect(entry.description.trim()).not.toBe('');
      expect(entry.requiredGates.length).toBeGreaterThan(0);
    }
  });

  it('requires provider-visible execution to pass context assembly and task start gates', () => {
    expect(requiredRuntimeEntrypointGatesForKind('provider_visible_execution')).toEqual([
      'runtime_action',
      'runtime_context_assembly',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ]);
    for (const entry of runtimeEntrypointsByKind('provider_visible_execution')) {
      expect(entry.requiredGates).toContain('runtime_context_assembly');
      expect(entry.requiredGates).toContain('task_memory_coverage');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('pre_step');
      expect(entry.requiredGates).toContain('subtask_start');
    }
  });

  it('requires hidden local execution to keep memory and start gates without provider context assembly', () => {
    for (const entry of runtimeEntrypointsByKind('hidden_local_execution')) {
      expect(entry.requiredGates).not.toContain('runtime_context_assembly');
      expect(entry.requiredGates).toContain('task_memory_coverage');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('pre_step');
      expect(entry.requiredGates).toContain('subtask_start');
    }
  });

  it('requires resumed execution paths to check handoff or decision state before continuing', () => {
    const resumed = [
      ...runtimeEntrypointsByKind('execution_resume'),
      ...runtimeEntrypointsByKind('decision_resume'),
    ];

    expect(resumed.length).toBeGreaterThan(0);
    for (const entry of resumed) {
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('pre_step');
      expect(entry.requiredGates).toContain('subtask_start');
      expect(entry.requiredGates).toContain('checkpoint_eligibility');
    }
  });

  it('requires durable writes to pass task mutation boundaries', () => {
    for (const entry of runtimeEntrypointsByKind('durable_write')) {
      expect(entry.requiredGates).toContain('task_mutation');
      expect(entry.requiredGates).toContain('pre_step');
    }
  });

  it('requires task capture and decision actions to use their own runtime boundaries', () => {
    for (const entry of runtimeEntrypointsByKind('task_capture')) {
      expect(entry.requiredGates).toContain('runtime_action');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('pre_step');
    }
    for (const entry of runtimeEntrypointsByKind('decision_action')) {
      expect(entry.requiredGates).toContain('decision_action');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('pre_step');
      expect(entry.requiredGates).toContain('post_step');
    }
  });

  it('keeps the retained top-level runtime entrypoints explicit', () => {
    expect(RUNTIME_ENTRYPOINT_COVERAGE.map((entry) => entry.id).sort()).toEqual([
      'agent.toolDurableWrites',
      'context.clearOrSwitch',
      'decision.action',
      'decision.approvedCheckpointResume',
      'panel.timelineEventWrite',
      'project.decompositionConfirm',
      'run.continuePaused',
      'run.trigger',
      'run.triggerCodeAgent',
      'run.triggerOperatorStarted',
      'task.capture',
      'task.completionTransition',
      'task.fileAndArtifactWrites',
      'task.transitionToRunning',
    ]);
  });
});
