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

  it('keeps context readiness on Agent CLI, retained API, and future peer API runtimes', () => {
    const agentCli = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'run.triggerAgentCli');
    const codeAgent = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'run.triggerCodeAgent');
    const futureApi = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'run.triggerAgentApi.future');
    const retainedRun = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'run.trigger');

    expect(agentCli?.requiredGates).toContain('context_readiness');
    expect(agentCli?.coveredGates).toContain('context_readiness');
    expect(agentCli?.notes).toContain('context.readiness.evaluate');
    expect(agentCli?.notes).toContain('Selected Agent CLI decomposition drafts');
    expect(agentCli?.notes).toContain('subtask.propose Write Intent');
    expect(futureApi?.requiredGates).toContain('context_readiness');
    expect(futureApi?.coveredGates).toContain('context_readiness');
    expect(retainedRun?.requiredGates).toContain('context_readiness');
    expect(retainedRun?.coveredGates).toContain('context_readiness');
    expect(retainedRun?.notes).toContain('RunService records context.readiness.evaluate');
    expect(codeAgent?.requiredGates).toContain('context_readiness');
    expect(codeAgent?.coveredGates).toContain('context_readiness');
    expect(codeAgent?.notes).toContain('CodeAgentRunService records context.readiness.evaluate');
  });

  it('registers future Agent API execution as the same gated runtime class as Agent CLI', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'run.triggerAgentApi.future');
    const agentCli = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'run.triggerAgentCli');

    expect(entry).toBeTruthy();
    expect(agentCli).toBeTruthy();
    expect(entry?.kind).toBe('provider_visible_execution');
    expect(entry?.requiredGates).toEqual(agentCli?.requiredGates);
    expect(entry?.coveredGates).toEqual(agentCli?.coveredGates);
    expect(entry?.ipcChannels).toBeUndefined();
    expect(entry?.notes).toContain('future peer execution runtime');
    expect(entry?.notes).toContain('not auxiliary provider assistance');
    expect(entry?.notes).toContain('before exposing any IPC channel');
  });

  it('keeps Code Agent model producer classified as future Agent API compatibility, not helper fallback', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'run.triggerCodeAgent');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('provider_visible_execution');
    expect(entry?.requiredGates).toContain('runtime_context_assembly');
    expect(entry?.requiredGates).toContain('context_readiness');
    expect(entry?.requiredGates).toContain('task_memory_guidance');
    expect(entry?.notes).toContain('future Agent API adapter');
    expect(entry?.notes).toContain('CodeAgentRunService records context.readiness.evaluate');
    expect(entry?.notes).toContain('blocks selected Agent CLI modes before resolving API config');
    expect(entry?.notes).toContain('must not be exposed as auxiliary provider assistance');
    expect(entry?.notes).toContain('implicit fallback for selected Agent CLI runtimes');
  });

  it('classifies retained RunService execution as API Runtime-like, not Agent CLI fallback', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'run.trigger');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('provider_visible_execution');
    expect(entry?.requiredGates).toContain('runtime_context_assembly');
    expect(entry?.requiredGates).toContain('subtask_start');
    expect(entry?.notes).toContain('provider-visible API Runtime / Agent API-like execution surface');
    expect(entry?.notes).toContain('IPC boundary confirms API Runtime is selected');
    expect(entry?.notes).toContain('conservative local agent plan inside the same run');
    expect(entry?.notes).toContain('not the first-version Agent CLI entrypoint');
    expect(entry?.notes).toContain('must not be used as an implicit fallback');
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
    expect(draft?.notes).toContain('decomposition_draft API-runtime invocation');
    expect(draft?.notes).toContain('retained API path');
    expect(draft?.notes).toContain('rejects selected Agent CLI modes');
    expect(draft?.notes).toContain('run.triggerAgentCli plus right-panel subtask.propose');
    expect(draft?.notes).toContain('Neither path directly creates child tasks');
    expect(draft?.notes).toContain('project.decompositionConfirm');

    expect(confirm?.kind).toBe('durable_write');
    expect(confirm?.requiredGates).toContain('task_mutation');
    expect(confirm?.requiredGates).toContain('post_step');
    expect(confirm?.requiredGates).toContain('subtask_draft');
    expect(confirm?.requiredGates).not.toContain('runtime_context_assembly');
    expect(confirm?.requiredGates).not.toContain('subtask_start');
    expect(confirm?.notes).toContain('product-harness durable write');
    expect(confirm?.notes).toContain('does not depend on which AI runtime produced the draft');
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

  it('registers completion handoff as the task-to-task entry boundary', () => {
    expect(requiredRuntimeEntrypointGatesForKind('task_to_task_handoff')).toEqual([
      'simplicity_check',
      'task_completion',
      'task_memory_coverage',
      'subtask_start',
      'task_mutation',
      'pre_step',
      'post_step',
      'panel_event_allowlist',
    ]);

    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'task.completionHandoff');
    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('task_to_task_handoff');
    expect(entry?.requiredGates).toContain('task_completion');
    expect(entry?.requiredGates).toContain('subtask_start');
    expect(entry?.requiredGates).toContain('panel_event_allowlist');
    expect(entry?.ipcChannels).toEqual(['task:transition', 'taskFile:create', 'task:recordTimelineEvent', 'ai:chat']);
    expect(entry?.notes).toContain('TasksPage evaluates the target child with subtask_start before writing handoff records');
  });

  it('records API runtime provenance for provider-visible chat assistance', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'ai.taskChat');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('provider_visible_assistance');
    expect(entry?.notes).toContain('global_assistant or task_assistant invocation provenance');
    expect(entry?.notes).toContain('rejects selected Agent CLI modes');
  });

  it('registers scheduled Brief generation as API Runtime assistance with local product-harness recovery', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'brief.scheduledSnapshot');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('provider_visible_assistance');
    expect(entry?.requiredGates).toContain('runtime_context_assembly');
    expect(entry?.notes).toContain('bounded Brief context projection');
    expect(entry?.notes).toContain('resolved API Runtime config');
    expect(entry?.notes).toContain('only when API Runtime is selected');
    expect(entry?.notes).toContain('Selected Agent CLI modes skip API config resolution');
    expect(entry?.notes).toContain('local product-harness brief snapshot');
    expect(entry?.notes).toContain('not a hidden Agent CLI fallback');
  });

  it('classifies scheduler stale-run recovery as local maintenance, not automated Agent execution', () => {
    expect(requiredRuntimeEntrypointGatesForKind('scheduler_maintenance')).toEqual([
      'simplicity_check',
      'product_config_boundary',
      'post_step',
    ]);

    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'scheduler.staleRunRecovery');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('scheduler_maintenance');
    expect(entry?.requiredGates).toEqual([
      'simplicity_check',
      'product_config_boundary',
      'post_step',
    ]);
    expect(entry?.requiredGates).not.toContain('runtime_action');
    expect(entry?.requiredGates).not.toContain('runtime_context_assembly');
    expect(entry?.notes).toContain('scheduler feature flag');
    expect(entry?.notes).toContain('does not start an Agent CLI/API runtime');
    expect(entry?.notes).toContain('terminal Run evidence');
  });

  it('registers automation readiness as diagnostic-only rather than runtime execution', () => {
    expect(requiredRuntimeEntrypointGatesForKind('automation_diagnostic')).toEqual([
      'simplicity_check',
      'runtime_context_assembly',
    ]);

    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'automation.readinessDiagnostic');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('automation_diagnostic');
    expect(entry?.requiredGates).toEqual([
      'simplicity_check',
      'runtime_context_assembly',
    ]);
    expect(entry?.requiredGates).not.toContain('runtime_action');
    expect(entry?.requiredGates).not.toContain('pre_step');
    expect(entry?.requiredGates).not.toContain('post_step');
    expect(entry?.notes).toContain('automaticStartAllowed remains false');
    expect(entry?.notes).toContain('separate_scheduled_event_entrypoint_required');
    expect(entry?.notes).toContain('cannot use this diagnostic as a hidden Agent CLI/API execution entrypoint');
  });

  it('registers future scheduled/event Agent execution as a separate deferred contract', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'automation.scheduledEventAgentRun.future');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('provider_visible_execution');
    expect(entry?.ipcChannels).toBeUndefined();
    expect(entry?.requiredGates).toEqual(expect.arrayContaining([
      'product_config_boundary',
      'operator_confirmation',
      'runtime_action',
      'runtime_context_assembly',
      'context_readiness',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ]));
    expect(entry?.notes).toContain('Deferred contract only');
    expect(entry?.notes).toContain('readiness diagnostics do not start Agent CLI/API runtimes');
    expect(entry?.notes).toContain('before exposing any IPC or scheduler trigger');
  });

  it('registers phase closeout as a handoff boundary without equating it to completion', () => {
    expect(requiredRuntimeEntrypointGatesForKind('phase_closeout_handoff')).toEqual([
      'simplicity_check',
      'runtime_action',
      'runtime_handoff',
      'task_memory_coverage',
      'task_memory_guidance',
      'task_completion',
      'subtask_start',
      'task_mutation',
      'pre_step',
      'post_step',
      'panel_event_allowlist',
    ]);

    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'rightPanel.phaseCloseoutHandoff');
    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('phase_closeout_handoff');
    expect(entry?.requiredGates).toContain('runtime_handoff');
    expect(entry?.requiredGates).toContain('task_memory_guidance');
    expect(entry?.requiredGates).toContain('task_completion');
    expect(entry?.requiredGates).toContain('subtask_start');
    expect(entry?.ipcChannels).toEqual(['taskFile:create', 'task:recordCompletionCheck', 'task:transition']);
    expect(entry?.notes).toContain('Phase closeout is not task completion by itself');
    expect(entry?.notes).toContain('subtask_start applies only when RuntimeHandoff chooses an existing next task');
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
    expect(entry?.notes).toContain('verification_assist product-harness provenance');
    expect(entry?.notes).toContain('future API verifier subagent may augment this entrypoint');
    expect(entry?.notes).toContain('same persisted Run Goal Contract');
    expect(entry?.notes).toContain('lightweight and ai_verifier run-level records');
    expect(entry?.notes).toContain('API verifier shadow readiness thresholds');
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
    const nativeGoalAudit = RUNTIME_ENTRYPOINT_COVERAGE.find((entry) => entry.id === 'run.recordRuntimeNativeGoalRequest');
    expect(nativeGoalAudit?.notes).toContain('runtime-native goal passthrough remains closed');
    expect(nativeGoalAudit?.notes).toContain('native goal forwarding readiness gate');
    expect(nativeGoalAudit?.notes).toContain('packaged fake-runtime smoke');
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
    const checkpointResume = RUNTIME_ENTRYPOINT_COVERAGE.find((entry) => entry.id === 'decision.approvedCheckpointResume');
    expect(checkpointResume?.notes).toContain('open checkpoint linked to that Decision');
    expect(checkpointResume?.notes).toContain('validated tool_permission, browser-controlled, or patch-promotion checkpoints');
    expect(checkpointResume?.notes).toContain('pending task-memory guidance');
    expect(checkpointResume?.notes).toContain('does not turn ordinary Decision approval into arbitrary tool execution');
  });

  it('separates decision draft and decision creation from decision actions', () => {
    for (const entry of runtimeEntrypointsByKind('decision_draft')) {
      expect(entry.requiredGates).toContain('runtime_context_assembly');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('task_mutation');
      expect(entry.requiredGates).toContain('decision_draft_boundary');
      expect(entry.requiredGates).not.toContain('decision_action');
    }
    const taskDraft = RUNTIME_ENTRYPOINT_COVERAGE.find((entry) => entry.id === 'decision.draft');
    expect(taskDraft?.notes).toContain('decision_draft API-runtime invocations');
    expect(taskDraft?.notes).toContain('only when API Runtime is selected');
    expect(taskDraft?.notes).toContain('selected Agent CLI modes stay local product_harness/skipped');
    for (const entry of runtimeEntrypointsByKind('decision_write')) {
      expect(entry.requiredGates).toContain('decision_write_boundary');
      expect(entry.requiredGates).toContain('pre_step');
      expect(entry.requiredGates).not.toContain('decision_action');
      expect(entry.requiredGates).not.toContain('runtime_context_assembly');
    }
  });

  it('registers future scheduler decisions as proposal-only before writeback', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'decision.schedulerDraft.future');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('decision_draft');
    expect(entry?.ipcChannels).toBeUndefined();
    expect(entry?.requiredGates).toEqual(expect.arrayContaining([
      'product_config_boundary',
      'operator_confirmation',
      'runtime_context_assembly',
      'task_memory_guidance',
      'task_mutation',
      'pre_step',
      'decision_draft_boundary',
    ]));
    expect(entry?.requiredGates).not.toContain('decision_write_boundary');
    expect(entry?.requiredGates).not.toContain('decision_action');
    expect(entry?.notes).toContain('draft an approval item');
    expect(entry?.notes).toContain('cannot persist a Decision');
    expect(entry?.notes).toContain('TaskplaneWritebackApprovalItem dispatch');
  });

  it('requires durable writes to pass task mutation boundaries', () => {
    for (const entry of runtimeEntrypointsByKind('durable_write')) {
      expect(entry.requiredGates).toContain('simplicity_check');
      expect(entry.requiredGates).toContain('task_mutation');
      expect(entry.requiredGates).toContain('pre_step');
    }
  });

  it('keeps agent tool durable writes behind registry gates and out of provider-native direct exposure', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'agent.toolDurableWrites');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('durable_write');
    expect(entry?.requiredGates).toContain('task_mutation');
    expect(entry?.requiredGates).toContain('post_step');
    expect(entry?.notes).toContain('Provider-native tool schemas never expose local write');
    expect(entry?.notes).toContain('decision.draft tool returns a draft/proposal only');
    expect(entry?.notes).toContain('Decision persistence remains behind decision.create');
    expect(entry?.notes).toContain('inside an already-gated run');
    expect(entry?.notes).toContain('task_mutation/pre-step checks');
    expect(entry?.notes).toContain('tool-permission checkpoints');
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
    const taskCapture = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'task.capture');
    expect(taskCapture?.notes).toContain('inferTaskTypeProfile');
    expect(taskCapture?.notes).toContain('without a hidden AI call');
    expect(taskCapture?.notes).toContain('separate proposal and confirmation boundary');
    for (const entry of runtimeEntrypointsByKind('decision_action')) {
      expect(entry.requiredGates).toContain('simplicity_check');
      expect(entry.requiredGates).toContain('decision_action');
      expect(entry.requiredGates).toContain('task_memory_guidance');
      expect(entry.requiredGates).toContain('pre_step');
      expect(entry.requiredGates).toContain('post_step');
    }
  });

  it('registers task type review as a proposal boundary before metadata writes', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'task.typeReview');

    expect(requiredRuntimeEntrypointGatesForKind('task_type_review')).toEqual([
      'simplicity_check',
      'task_memory_guidance',
    ]);
    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('task_type_review');
    expect(entry?.ipcChannels).toBeUndefined();
    expect(entry?.requiredGates).toContain('task_memory_guidance');
    expect(entry?.requiredGates).not.toContain('task_mutation');
    expect(entry?.notes).toContain('proposal/confirmation split');
    expect(entry?.notes).toContain('first-version task-type review contract');
    expect(entry?.notes).toContain('selected-runtime or API-runtime provenance');
  });

  it('separates context refresh or leave from cross-task switching', () => {
    const refreshOrLeave = RUNTIME_ENTRYPOINT_COVERAGE.find((entry) => entry.id === 'context.refreshOrLeave');
    const taskSwitch = RUNTIME_ENTRYPOINT_COVERAGE.find((entry) => entry.id === 'context.taskSwitch');

    expect(refreshOrLeave).toBeTruthy();
    expect(taskSwitch).toBeTruthy();
    expect(refreshOrLeave?.kind).toBe('context_transition');
    expect(taskSwitch?.kind).toBe('context_transition');
    for (const entry of [refreshOrLeave, taskSwitch]) {
      expect(entry?.requiredGates).toEqual([
        'simplicity_check',
        'runtime_action',
        'runtime_handoff',
        'task_memory_coverage',
        'task_memory_guidance',
      ]);
      expect(entry?.requiredGates).not.toContain('task_completion');
      expect(entry?.requiredGates).not.toContain('subtask_start');
      expect(entry?.requiredGates).not.toContain('task_mutation');
    }
    expect(refreshOrLeave?.notes).toContain('AutoContextClearReadiness');
    expect(taskSwitch?.notes).toContain('pending TaskMemoryGuidanceState');
    expect(taskSwitch?.notes).toContain('does not use subtask_start');
  });

  it('requires every retained runtime entrypoint to declare the simplicity gate', () => {
    for (const entry of RUNTIME_ENTRYPOINT_COVERAGE) {
      expect(entry.requiredGates).toContain('simplicity_check');
      expect(entry.coveredGates).toContain('simplicity_check');
    }
  });

  it('keeps the registered top-level runtime entrypoints explicit', () => {
    expect(RUNTIME_ENTRYPOINT_COVERAGE.map((entry) => entry.id).sort()).toEqual([
      'agent.toolDurableWrites',
      'ai.taskChat',
      'artifact.runSandboxPatchReview',
      'automation.readinessDiagnostic',
      'automation.scheduledEventAgentRun.future',
      'brief.scheduledSnapshot',
      'context.refreshOrLeave',
      'context.taskSwitch',
      'decision.action',
      'decision.approvedCheckpointResume',
      'decision.create',
      'decision.draft',
      'decision.schedulerDraft.future',
      'externalAccess.gmailOAuthCredential',
      'externalAccess.sourceIngestionCommit',
      'externalAccess.sourceIngestionPreview',
      'panel.timelineEventWrite',
      'processTemplate.libraryWrites',
      'project.decompositionConfirm',
      'project.decompositionDraft',
      'rightPanel.phaseCloseoutHandoff',
      'run.acceptanceVerification',
      'run.cancelAgentCli',
      'run.continuePaused',
      'run.recordRuntimeNativeGoalRequest',
      'run.trigger',
      'run.triggerAgentApi.future',
      'run.triggerAgentCli',
      'run.triggerCodeAgent',
      'run.triggerOperatorStarted',
      'sandboxPatchPromotion.apply',
      'scheduler.staleRunRecovery',
      'settings.agentCliLoginProbe',
      'settings.aiRuntimeConfig',
      'settings.sandboxBackendProbe',
      'task.capture',
      'task.completionCheckRecord',
      'task.completionHandoff',
      'task.completionTransition',
      'task.fileAndArtifactWrites',
      'task.goalControl',
      'task.hierarchyMaintenance',
      'task.metadataUpdate',
      'task.stateTransition',
      'task.structuredStateWrites',
      'task.transitionToRunning',
      'task.typeReview',
      'taskplane.writebackApply',
      'workHabit.preferenceMemory',
    ]);
  });

  it('registers explicit reviewed-patch workspace apply as an operator-gated local control path', () => {
    const entry = RUNTIME_ENTRYPOINT_COVERAGE.find((candidate) => candidate.id === 'sandboxPatchPromotion.apply');

    expect(entry).toBeTruthy();
    expect(entry?.kind).toBe('local_execution_control');
    expect(entry?.ipcChannels).toEqual(['sandboxPatchPromotion:apply']);
    expect(entry?.requiredGates).toEqual(expect.arrayContaining([
      'operator_confirmation',
      'decision_action',
      'checkpoint_eligibility',
      'post_step',
    ]));
    expect(entry?.notes).toContain('enableSandboxPatchPromotionApply');
    expect(entry?.notes).toContain('records applied or blocked Run evidence');
  });
});
