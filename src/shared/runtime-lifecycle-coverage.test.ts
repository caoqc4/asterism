import { describe, expect, it } from 'vitest';

import {
  RUNTIME_LIFECYCLE_COVERAGE,
  classifyRuntimeLifecycleNextAction,
  listRuntimeLifecycleNextActions,
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
  'task_dynamics_and_audit',
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
      item.gaps.some((gap) => gap.includes('future entry points'))
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
    expect(text).toContain('RuntimeContextManifest now consumes TaskMemoryRetrieval');
    expect(text).toContain('providerCall=no and modelExposure=hidden');
    expect(text).not.toContain('not every execution entry point blocks on it yet');
    expect(text).not.toContain('TaskMemoryRetrieval is a shared data projection; current Run and RightPanel context assembly still need to consume it');
  });

  it('tracks pending-memory checks for task switching', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('TaskMemoryCoverageEvaluation maps the Task Memory Spec outcomes');
    expect(text).toContain('convert them into Taskplane writeback plans');
    expect(text).toContain('task-switch also consumes pending TaskMemoryGuidanceState through AutoContextClearReadiness');
    expect(text).toContain('context.refreshOrLeave');
    expect(text).toContain('context.taskSwitch');
    expect(text).toContain('without claiming task completion or subtask_start');
  });

  it('tracks workspace-write candidates as promotion-evidence boundaries', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('workspace_write candidates');
    expect(text).toContain('requires promotion evidence');
  });

  it('tracks pending-memory checks for new run start', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('block run_start when prior task-memory guidance is still pending');
    expect(text).toContain('AgentCliRunService block run_start when prior task-memory guidance is still pending');
    expect(text).toContain('Agent CLI runs cannot bypass unresolved task-memory writes');
    expect(text).toContain('AgentCliRunService records context.readiness.evaluate before native CLI execution');
    expect(text).toContain('Retained RunService and CodeAgent API-like paths do not yet consume context_readiness');
  });

  it('tracks service-boundary task completion and waiting-state guards', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('AgentCliRunService run subtask_start target-readiness checks');
    expect(text).toContain('completion transitions require task_completion memory coverage');
    expect(text).toContain('ignores Run and completion-check evidence older than the latest completion-criteria update');
    expect(text).toContain('waiting transitions require a waiting reason');
    expect(text).toContain('guard task_mutation before repository writes');
  });

  it('tracks product-owned goals as harness flow rather than execution runtime work', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('Taskplane-owned /goal is registered as a durable harness entrypoint');
    expect(text).toContain('without invoking Agent CLI or future Agent API execution');
    expect(text).toContain('Agent API execution can remain deferred');
    expect(text).toContain('future Agent API execution as a deferred provider_visible_execution contract with the same gate set as Agent CLI');
    expect(text).toContain('cannot be treated as auxiliary provider assistance or bypass the harness');
    expect(text).toContain('Runtime-native goal audit is registered as a non-executing runtime_audit entrypoint');
    expect(text).toContain('future passthrough remains blocked until the native goal forwarding readiness gate proves');
    expect(text).toContain('first-version runtime-native goal requests stay audit-only');
    expect(text).toContain('task goals, decomposition, context assembly, verification, memory routing, completion, and handoff must stay owned by Taskplane harness entrypoints');
  });

  it('tracks verifier subagent as a harness boundary rather than an execution runtime', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('Run acceptance verification is registered as a non-executing verification_harness entrypoint');
    expect(text).toContain('future API verifier subagents may only augment that boundary');
    expect(text).toContain('rather than become a second execution runtime');
    expect(text).toContain('API verifier shadow readiness is modeled as a non-executing projection');
    expect(text).toContain('persisted lightweight and ai_verifier run-level records');
    expect(text).toContain('pass local readiness thresholds before it can affect assist-mode or user-visible acceptance decisions');
  });

  it('tracks service-boundary hierarchy ownership guards', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('parent is an open project task');
  });

  it('tracks decomposition confirmation separately from child execution start', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('using subtask_draft rather than subtask_start because confirming child tasks does not start execution');
  });

  it('tracks completion handoff as the task-to-task entry boundary', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('TasksPage completion handoff is registered as the task_to_task_handoff entry boundary');
    expect(text).toContain('checks the next child through subtask_start');
    expect(text).toContain('writes completion/received handoff records and timeline replay events before opening the next task context');
  });

  it('tracks phase closeout as a separate handoff boundary', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('RightPanel phase closeout is registered as a phase_closeout_handoff boundary');
    expect(text).toContain('records lightweight completion-check evidence');
    expect(text).toContain('only uses subtask_start when it is about to enter an existing child or successor');
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

  it('tracks the opt-in local inbox connector on the guarded source-ingestion path', () => {
    const text = JSON.stringify(RUNTIME_LIFECYCLE_COVERAGE);

    expect(text).toContain('LocalInboxConnectorAdapter');
    expect(text).toContain('GmailConnectorAdapter');
    expect(text).toContain('Gmail OAuth now has a guarded product entrypoint');
    expect(text).toContain('disconnect revokes and clears local credentials');
    expect(text).toContain('ExternalAccessSourceIngestionService bridges ConnectorSourceIngestionPlan previews');
    expect(text).toContain('packaged local-inbox smoke creates a task');
    expect(text).toContain('accept:external-access:gmail-oauth-local covers the mocked local Gmail OAuth control chain');
    expect(text).toContain('without changing task-management UI');
    expect(text).toContain('ConnectorSourceIngestionPlan previews instead of direct SourceContext writes');
    expect(text).toContain('Provider-native tool calls are rechecked against AgentToolExposureMatrix');
  });

  it('classifies next work without promoting future or UI-only gaps into current tasks', () => {
    expect(classifyRuntimeLifecycleNextAction(
      'Keep future context entry points on the RightPanel reducer.',
    )).toBe('preservation_constraint');
    expect(classifyRuntimeLifecycleNextAction(
      'Require any future connector ingestion service to use ConnectorSourceIngestionPlan.',
    )).toBe('deferred_surface');
    expect(classifyRuntimeLifecycleNextAction(
      'Keep legacy WorkbenchPage retired; new runtime behavior must land in retained surfaces.',
    )).toBe('preservation_constraint');
    expect(classifyRuntimeLifecycleNextAction(
      'Extend duplicate detection beyond exact normalized titles when enough semantic context is available.',
    )).toBe('current_candidate');
  });

  it('lists next actions by priority and timing for continuation planning', () => {
    const actions = listRuntimeLifecycleNextActions();

    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]?.priority).toBe('p0');
    expect(actions.some((action) => action.timing === 'preservation_constraint')).toBe(true);
    expect(actions.some((action) => action.timing === 'deferred_surface')).toBe(true);
    expect(actions.some((action) => (
      action.timing === 'current_candidate'
      && /duplicate detection/.test(action.action)
    ))).toBe(false);
    expect(actions.filter((action) => action.timing === 'current_candidate')).toEqual([]);
    expect(actions.find((action) => action.action.includes('ConnectorSourceIngestionPlan'))?.timing)
      .toBe('deferred_surface');
  });
});
