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
      expect(new Set(entry.requiredGates).size).toBe(entry.requiredGates.length);
      expect(new Set(entry.coveredGates).size).toBe(entry.coveredGates.length);
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

  it('separates project decomposition planning, confirmation, and child start gates', () => {
    const draft = RUNTIME_ENTRYPOINT_COVERAGE.find((entry) => entry.id === 'project.decompositionDraft');
    const confirm = RUNTIME_ENTRYPOINT_COVERAGE.find((entry) => entry.id === 'project.decompositionConfirm');

    expect(draft).toBeTruthy();
    expect(confirm).toBeTruthy();
    expect(draft?.kind).toBe('provider_visible_planning');
    expect(draft?.requiredGates).toContain('runtime_context_assembly');
    expect(draft?.requiredGates).toContain('subtask_draft');
    expect(draft?.requiredGates).not.toContain('task_mutation');
    expect(draft?.requiredGates).not.toContain('runtime_action');

    expect(confirm?.kind).toBe('durable_write');
    expect(confirm?.requiredGates).toContain('task_mutation');
    expect(confirm?.requiredGates).toContain('post_step');
    expect(confirm?.requiredGates).toContain('subtask_draft');
    expect(confirm?.requiredGates).not.toContain('runtime_context_assembly');
    expect(confirm?.requiredGates).not.toContain('subtask_start');
    expect(confirm?.notes).toContain('Starting or entering a child task remains a separate subtask_start boundary');
  });

  it('requires provider-visible assistance to assemble context without execution gates', () => {
    expect(requiredRuntimeEntrypointGatesForKind('provider_visible_assistance')).toEqual([
      'simplicity_check',
      'runtime_context_assembly',
    ]);
    for (const entry of runtimeEntrypointsByKind('provider_visible_assistance')) {
      expect(entry.requiredGates).toContain('runtime_context_assembly');
      expect(entry.requiredGates).not.toContain('runtime_action');
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

  it('keeps local execution control limited to explicit operator confirmation', () => {
    expect(requiredRuntimeEntrypointGatesForKind('local_execution_control')).toEqual([
      'simplicity_check',
      'operator_confirmation',
    ]);
    for (const entry of runtimeEntrypointsByKind('local_execution_control')) {
      expect(entry.requiredGates).toContain('operator_confirmation');
      expect(entry.requiredGates).not.toContain('runtime_action');
      expect(entry.requiredGates).not.toContain('pre_step');
      expect(entry.requiredGates).not.toContain('runtime_context_assembly');
    }
  });

  it('keeps verifier and verifier-subagent work in a non-executing harness boundary', () => {
    expect(requiredRuntimeEntrypointGatesForKind('verification_harness')).toEqual([
      'simplicity_check',
      'post_step',
    ]);

    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'run.acceptanceVerification');
    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('verification_harness');
    expect(entry?.requiredGates).toEqual(['simplicity_check', 'post_step']);
    expect(entry?.requiredGates).not.toContain('runtime_action');
    expect(entry?.requiredGates).not.toContain('runtime_context_assembly');
    expect(entry?.requiredGates).not.toContain('subtask_start');
    expect(entry?.notes).toContain('future API verifier subagent may augment this entrypoint');
    expect(entry?.notes).toContain('same persisted Run Goal Contract');
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

  it('keeps capability probes read-only and out of execution gates', () => {
    expect(requiredRuntimeEntrypointGatesForKind('capability_probe')).toEqual([
      'simplicity_check',
      'capability_probe_boundary',
    ]);
    for (const entry of runtimeEntrypointsByKind('capability_probe')) {
      expect(entry.requiredGates).toContain('capability_probe_boundary');
      expect(entry.requiredGates).not.toContain('runtime_action');
      expect(entry.requiredGates).not.toContain('runtime_context_assembly');
      expect(entry.requiredGates).not.toContain('task_mutation');
    }
  });

  it('keeps runtime audit entries operator-confirmed and non-executing', () => {
    expect(requiredRuntimeEntrypointGatesForKind('runtime_audit')).toEqual([
      'simplicity_check',
      'operator_confirmation',
    ]);
    for (const entry of runtimeEntrypointsByKind('runtime_audit')) {
      expect(entry.requiredGates).toContain('operator_confirmation');
      expect(entry.requiredGates).not.toContain('runtime_action');
      expect(entry.requiredGates).not.toContain('runtime_context_assembly');
      expect(entry.requiredGates).not.toContain('pre_step');
      expect(entry.requiredGates).not.toContain('post_step');
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

  it('separates decision draft and decision creation from decision actions', () => {
    for (const entry of runtimeEntrypointsByKind('decision_draft')) {
      expect(entry.requiredGates).toContain('runtime_context_assembly');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('task_mutation');
      expect(entry.requiredGates).toContain('decision_draft_boundary');
      expect(entry.requiredGates).not.toContain('decision_action');
    }
    for (const entry of runtimeEntrypointsByKind('decision_write')) {
      expect(entry.requiredGates).toContain('decision_write_boundary');
      expect(entry.requiredGates).toContain('pre_step');
      expect(entry.requiredGates).not.toContain('decision_action');
      expect(entry.requiredGates).not.toContain('runtime_context_assembly');
    }
  });

  it('requires durable writes to pass task mutation boundaries', () => {
    for (const entry of runtimeEntrypointsByKind('durable_write')) {
      expect(entry.requiredGates).toContain('simplicity_check');
      expect(entry.requiredGates).toContain('task_mutation');
      expect(entry.requiredGates).toContain('pre_step');
    }
  });

  it('keeps product-owned task goals in the Taskplane harness instead of an execution runtime', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'task.goalControl');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('durable_write');
    expect(entry?.ipcChannels).toEqual(['task:update', 'completionCriteria:create', 'task:recordTimelineEvent']);
    expect(entry?.requiredGates).toContain('task_mutation');
    expect(entry?.requiredGates).toContain('panel_event_allowlist');
    expect(entry?.requiredGates).not.toContain('runtime_context_assembly');
    expect(entry?.requiredGates).not.toContain('subtask_start');
    expect(entry?.notes).toContain('independent of whether Agent CLI or future Agent API is selected');
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
      'ai.taskChat',
      'context.clearOrSwitch',
      'decision.action',
      'decision.approvedCheckpointResume',
      'decision.create',
      'decision.draft',
      'externalAccess.gmailOAuthCredential',
      'externalAccess.sourceIngestionCommit',
      'externalAccess.sourceIngestionPreview',
      'panel.timelineEventWrite',
      'processTemplate.libraryWrites',
      'project.decompositionConfirm',
      'project.decompositionDraft',
      'run.acceptanceVerification',
      'run.cancelAgentCli',
      'run.continuePaused',
      'run.recordRuntimeNativeGoalRequest',
      'run.trigger',
      'run.triggerAgentCli',
      'run.triggerCodeAgent',
      'run.triggerOperatorStarted',
      'settings.agentCliLoginProbe',
      'settings.aiRuntimeConfig',
      'settings.sandboxBackendProbe',
      'task.capture',
      'task.completionCheckRecord',
      'task.completionTransition',
      'task.fileAndArtifactWrites',
      'task.goalControl',
      'task.hierarchyMaintenance',
      'task.metadataUpdate',
      'task.stateTransition',
      'task.structuredStateWrites',
      'task.transitionToRunning',
      'workHabit.preferenceMemory',
    ]);
  });
});
