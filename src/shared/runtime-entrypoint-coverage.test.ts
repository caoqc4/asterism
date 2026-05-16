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
      'simplicity_check',
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

  it('requires provider-visible planning to stay draft-only and pass subtask draft checks', () => {
    expect(requiredRuntimeEntrypointGatesForKind('provider_visible_planning')).toEqual([
      'simplicity_check',
      'runtime_context_assembly',
      'task_memory_guidance',
      'subtask_draft',
    ]);
    for (const entry of runtimeEntrypointsByKind('provider_visible_planning')) {
      expect(entry.requiredGates).toContain('runtime_context_assembly');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('subtask_draft');
      expect(entry.requiredGates).not.toContain('task_mutation');
      expect(entry.requiredGates).not.toContain('post_step');
    }
  });

  it('requires hidden local execution to keep memory and start gates without provider context assembly', () => {
    for (const entry of runtimeEntrypointsByKind('hidden_local_execution')) {
      expect(entry.requiredGates).toContain('simplicity_check');
      expect(entry.requiredGates).not.toContain('runtime_context_assembly');
      expect(entry.requiredGates).toContain('task_memory_coverage');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('pre_step');
      expect(entry.requiredGates).toContain('subtask_start');
    }
  });

  it('keeps product configuration, preference memory, and method-library writes out of task mutation gates', () => {
    const boundaries = [
      ['product_configuration', 'product_config_boundary'],
      ['preference_memory', 'preference_boundary'],
      ['method_library', 'method_library_boundary'],
    ] as const;

    for (const [kind, boundary] of boundaries) {
      expect(requiredRuntimeEntrypointGatesForKind(kind)).toEqual([
        'simplicity_check',
        boundary,
      ]);
      for (const entry of runtimeEntrypointsByKind(kind)) {
        expect(entry.requiredGates).toContain(boundary);
        expect(entry.requiredGates).not.toContain('task_mutation');
        expect(entry.requiredGates).not.toContain('runtime_context_assembly');
      }
    }
  });

  it('requires resumed execution paths to check handoff or decision state before continuing', () => {
    const resumed = [
      ...runtimeEntrypointsByKind('execution_resume'),
      ...runtimeEntrypointsByKind('decision_resume'),
    ];

    expect(resumed.length).toBeGreaterThan(0);
    for (const entry of resumed) {
      expect(entry.requiredGates).toContain('simplicity_check');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('pre_step');
      expect(entry.requiredGates).toContain('subtask_start');
      expect(entry.requiredGates).toContain('checkpoint_eligibility');
    }
  });

  it('requires durable writes to pass task mutation boundaries', () => {
    for (const entry of runtimeEntrypointsByKind('durable_write')) {
      expect(entry.requiredGates).toContain('simplicity_check');
      expect(entry.requiredGates).toContain('task_mutation');
      expect(entry.requiredGates).toContain('pre_step');
    }
  });

  it('requires task capture and decision actions to use their own runtime boundaries', () => {
    for (const entry of runtimeEntrypointsByKind('task_capture')) {
      expect(entry.requiredGates).toContain('simplicity_check');
      expect(entry.requiredGates).toContain('runtime_action');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('pre_step');
    }
    for (const entry of runtimeEntrypointsByKind('decision_action')) {
      expect(entry.requiredGates).toContain('simplicity_check');
      expect(entry.requiredGates).toContain('decision_action');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('pre_step');
      expect(entry.requiredGates).toContain('post_step');
    }
  });

  it('requires every retained runtime entrypoint to declare the simplicity gate', () => {
    for (const entry of RUNTIME_ENTRYPOINT_COVERAGE) {
      expect(entry.requiredGates).toContain('simplicity_check');
      expect(entry.coveredGates).toContain('simplicity_check');
    }
  });

  it('keeps the retained top-level runtime entrypoints explicit', () => {
    expect(RUNTIME_ENTRYPOINT_COVERAGE.map((entry) => entry.id).sort()).toEqual([
      'agent.toolDurableWrites',
      'context.clearOrSwitch',
      'decision.action',
      'decision.approvedCheckpointResume',
      'panel.timelineEventWrite',
      'processTemplate.libraryWrites',
      'project.decompositionConfirm',
      'project.decompositionDraft',
      'run.continuePaused',
      'run.trigger',
      'run.triggerCodeAgent',
      'run.triggerOperatorStarted',
      'settings.aiRuntimeConfig',
      'task.capture',
      'task.completionTransition',
      'task.fileAndArtifactWrites',
      'task.hierarchyMaintenance',
      'task.transitionToRunning',
      'workHabit.preferenceMemory',
    ]);
  });
});
