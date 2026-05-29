import { describe, expect, it } from 'vitest';

import {
  PRODUCT_FEATURE_IMPACT_AUDIT,
  findProductFeatureImpactAuditIssues,
} from './product-feature-impact-audit.js';

describe('product feature impact audit', () => {
  it('covers the high-priority execution and writeback feature families', () => {
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.map((item) => item.id)).toEqual([
      'right_panel_agent_run',
      'task_creation_and_project_decomposition',
      'subtask_start_and_task_switch',
      'task_memory_and_context_clear',
      'decisions_checkpoints_completion',
      'task_files_artifacts_local_writes',
      'capabilities_external_skills_mcp',
      'work_habits_settings_scheduled',
      'smoke_tests_runtime_readiness_recovery',
    ]);
  });

  it('keeps every feature family routed through GoalPilot and boundary gates', () => {
    expect(findProductFeatureImpactAuditIssues()).toEqual([]);
  });

  it('does not let deferred contracts count as covered product completion', () => {
    const partialRuntimeItem = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'right_panel_agent_run');
    expect(partialRuntimeItem).toBeDefined();

    expect(findProductFeatureImpactAuditIssues([
      {
        ...partialRuntimeItem!,
        status: 'covered',
        cliOnlyClosure: 'supported',
        futureApiClosure: 'supported',
        evidence: [
          'Deferred Agent API execution_run invocations carry future provider-visible execution required gates.',
        ],
      },
    ])).toEqual([
      {
        featureId: 'right_panel_agent_run',
        issue: 'Covered feature audit item must not use deferred or future-only evidence as completion proof.',
      },
    ]);
  });

  it('requires covered product completion to have closed runtime coverage', () => {
    const coveredItem = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'subtask_start_and_task_switch');
    expect(coveredItem).toBeDefined();

    expect(findProductFeatureImpactAuditIssues([
      {
        ...coveredItem!,
        futureApiClosure: 'partial',
      },
    ])).toEqual([
      {
        featureId: 'subtask_start_and_task_switch',
        issue: 'Covered feature audit item must not have partial or missing runtime closure.',
      },
    ]);
  });

  it('requires every P0 runtime/writeback feature to have CLI-only closure and gates', () => {
    const p0Items = PRODUCT_FEATURE_IMPACT_AUDIT.filter((item) => item.priority === 'p0');
    expect(p0Items.length).toBeGreaterThan(0);

    for (const item of p0Items) {
      expect(item.cliOnlyClosure).not.toBe('missing');
      expect(item.gates.length).toBeGreaterThan(0);
      expect(item.ruleSkills).toContain('goalpilot.task_router');
      if (item.writeIntents.some((intent) => intent !== 'none')) {
        expect(item.ruleSkills).toContain('decision.writeback_orchestration');
      }
    }
  });

  it('requires every unfinished feature family to keep an actionable gap and next step', () => {
    const partialItem = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'right_panel_agent_run');
    expect(partialItem).toBeDefined();

    expect(findProductFeatureImpactAuditIssues([
      {
        ...partialItem!,
        gaps: [],
        nextActions: [],
      },
    ])).toEqual([
      {
        featureId: 'right_panel_agent_run',
        issue: 'Uncovered feature audit item must declare current gaps.',
      },
      {
        featureId: 'right_panel_agent_run',
        issue: 'P0 feature audit item must declare next actions.',
      },
    ]);

    expect(findProductFeatureImpactAuditIssues([
      {
        ...partialItem!,
        priority: 'p1',
        gaps: ['Current gap remains open.'],
        nextActions: [],
      },
    ])).toEqual([
      {
        featureId: 'right_panel_agent_run',
        issue: 'Uncovered feature audit item must declare next actions.',
      },
    ]);
  });

  it('tracks the current native CLI writeback and research progress support without stale gaps', () => {
    const rightPanel = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'right_panel_agent_run');
    const taskMemory = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_memory_and_context_clear');
    const taskFiles = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_files_artifacts_local_writes');
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');
    const capabilities = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'capabilities_external_skills_mcp');
    const workHabits = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'work_habits_settings_scheduled');
    const smoke = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'smoke_tests_runtime_readiness_recovery');

    expect(rightPanel?.evidence.join(' ')).toContain('decisions, next-step updates, blockers, completion proposals');
    expect(rightPanel?.evidence.join(' ')).toContain('web research capture and native CLI capability-tagged web/search events');
    expect(rightPanel?.evidence.join(' ')).toMatch(/web research query[\s\S]*persisted source_context_ids/);
    expect(rightPanel?.evidence.join(' ')).toContain('ignore bare runtime names');
    expect(rightPanel?.evidence.join(' ')).toContain('web research bridge smoke');
    expect(rightPanel?.evidence.join(' ')).toContain('mocked OpenAI web_search output');
    expect(rightPanel?.evidence.join(' ')).toContain('renderer progress mapping');
    expect(rightPanel?.evidence.join(' ')).toContain('non-low-credibility fresh Source Context evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('future-dated');
    expect(rightPanel?.evidence.join(' ')).toContain('low-credibility source evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('explicit no-research opt-outs');
    expect(rightPanel?.evidence.join(' ')).toContain('command_execution items');
    expect(rightPanel?.evidence.join(' ')).toContain('while the native process is still running');
    expect(rightPanel?.evidence.join(' ')).toContain('local command or workspace activity');
    expect(rightPanel?.evidence.join(' ')).toContain('reviewable write candidates');
    expect(rightPanel?.evidence.join(' ')).toContain('no-direct-write reviewable write candidates');
    expect(rightPanel?.evidence.join(' ')).toContain('patch artifact, ready task_file Write Intent, ready patch artifact Write Intent, or patch-review/promotion evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('workspace_write steps are prioritized as no-direct-write reviewable write candidates');
    expect(rightPanel?.evidence.join(' ')).toContain('even when web activity is also present');
    expect(rightPanel?.evidence.join(' ')).toContain('child-task advancement messages');
    expect(rightPanel?.evidence.join(' ')).toContain('context.readiness.evaluate');
    expect(rightPanel?.evidence.join(' ')).toContain('preserving operation mode');
    expect(rightPanel?.evidence.join(' ')).toContain('backendPlan');
    expect(rightPanel?.evidence.join(' ')).toContain('Pilot 决策辅助计划');
    expect(rightPanel?.evidence.join(' ')).toContain('Agent API chat invocations preserve');
    expect(rightPanel?.evidence.join(' ')).toContain('RunService runs now record context.readiness.evaluate');
    expect(rightPanel?.evidence.join(' ')).toContain('Code Agent model-producer / future Agent API compatibility runs now record context.readiness.evaluate');
    expect(rightPanel?.evidence.join(' ')).toContain('Code Agent model-producer live and preview smokes default to skipReason=opt_in_required');
    expect(rightPanel?.evidence.join(' ')).toContain('explicitly enabled runs with incomplete provider config report skipReason=config_missing');
    expect(rightPanel?.evidence.join(' ')).toContain('provider=not-called, docker=not-started, and workspace=unchanged');
    expect(rightPanel?.evidence.join(' ')).toContain('deferred Agent API task execution');
    expect(rightPanel?.evidence.join(' ')).toContain('skipped execution_run shape');
    expect(rightPanel?.evidence.join(' ')).toContain('promotionReady=no');
    expect(rightPanel?.evidence.join(' ')).toContain('promotionRequirements=0/11');
    expect(rightPanel?.evidence.join(' ')).toContain('requiredGates=0/9');
    expect(rightPanel?.evidence.join(' ')).toContain('promotionMissingRequirements=...');
    expect(rightPanel?.evidence.join(' ')).toContain('executionRunMissingRequirements=...');
    expect(rightPanel?.evidence.join(' ')).toContain('missingGates=...');
    expect(rightPanel?.evidence.join(' ')).toContain('execution_run as deferred');
    expect(rightPanel?.evidence.join(' ')).toContain('future provider-visible execution required gates');
    expect(rightPanel?.evidence.join(' ')).toContain('runtime context assembly, context_readiness, task-memory guidance, subtask_start, and post_step');
    expect(rightPanel?.evidence.join(' ')).toContain('structured promotion requirements');
    expect(rightPanel?.evidence.join(' ')).toContain('selected-runtime contract');
    expect(rightPanel?.evidence.join(' ')).toContain('target-task identity');
    expect(rightPanel?.evidence.join(' ')).toContain('provider-visible preflight');
    expect(rightPanel?.evidence.join(' ')).toContain('Run Goal Contract, Write Intent extraction, reviewed-patch apply boundary');
    expect(rightPanel?.evidence.join(' ')).toContain('evaluateAgentApiExecutionPromotionReadiness');
    expect(rightPanel?.evidence.join(' ')).toContain('evaluateAgentApiExecutionPromotionReadinessFromEvidence');
    expect(rightPanel?.evidence.join(' ')).toContain('evaluateAgentApiExecutionPromotionReadinessForInvocation');
    expect(rightPanel?.evidence.join(' ')).toContain('structured service evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('Run evidence persistence, and runtime gates');
    expect(rightPanel?.evidence.join(' ')).toContain('persisted post-run Run evidence task identity to match targetTaskId');
    expect(rightPanel?.evidence.join(' ')).toContain('run_evidence_persistence can stay ready');
    expect(rightPanel?.evidence.join(' ')).toContain('run_evidence_persistence to carry a terminal run status');
    expect(rightPanel?.evidence.join(' ')).toContain('selected_runtime_contract to carry same-run, target-task');
    expect(rightPanel?.evidence.join(' ')).toContain('provider_visible_preflight');
    expect(rightPanel?.evidence.join(' ')).toContain('runtime_context_manifest to carry the target task identity');
    expect(rightPanel?.evidence.join(' ')).toContain('context_readiness_step to carry target-task identity evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('treats task_memory_guidance as ready when there is no pending guidance or when completed guidance exists');
    expect(rightPanel?.evidence.join(' ')).toContain('while still requiring target-task identity evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('run_goal_contract to carry persisted same-run and target-task identity evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('requires reviewed_patch_apply_boundary to carry either applied patch promotion status plus same-run and target-task identity evidence or explicit noWorkspaceWriteRequired/not_required evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('requires post_step_verification to carry same-run and target-task identity evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('targetTask, runEvidenceTask, targetTaskEvidenceChain, runEvidenceTaskEvidenceChain, selectedRuntimeRun, selectedRuntimeRunEvidenceChain, selectedRuntimeTask, selectedRuntimeTaskEvidenceChain');
    expect(rightPanel?.evidence.join(' ')).toContain('providerPreflightStatus, providerConfigured, configuredProvider, providerStartupProbe, providerPreflightRun, providerPreflightRunEvidenceChain, providerPreflightTask, providerPreflightTaskEvidenceChain, runId, writeIntentRun, writeIntentRunEvidenceChain, writeIntentTask, writeIntentTaskEvidenceChain, writeIntentExtraction, writeIntentSupportedActionCount, writeIntentActions, writeIntentDeclaredActionCount, declaredWriteIntentActions, writeIntentMode, noWriteIntentRequired');
    expect(rightPanel?.evidence.join(' ')).toContain('contextStep, contextStepTask, contextStepTaskEvidenceChain, contextManifest, contextManifestTask, contextManifestEvidenceChain');
    expect(rightPanel?.evidence.join(' ')).toContain('taskMemoryGuidance, taskMemoryGuidanceCount, taskMemoryGuidanceTask, taskMemoryGuidanceTaskEvidenceChain');
    expect(rightPanel?.evidence.join(' ')).toContain('runGoalRun, runGoalRunEvidenceChain, runGoalTask, runGoalTaskEvidenceChain');
    expect(rightPanel?.evidence.join(' ')).toContain('subtaskStartGateEvidenceChain, reviewedPatchApplyBoundary, reviewedPatchExplicitApply, noWorkspaceWriteRequired, patchPromotionPreflight, patchPromotionStatus, patchPromotionRun');
    expect(rightPanel?.evidence.join(' ')).toContain('patchPromotionRunEvidenceChain, patchPromotionTask, patchPromotionTaskEvidenceChain');
    expect(rightPanel?.evidence.join(' ')).toContain('postStepRun, postStepRunEvidenceChain, postStepTask, postStepTaskEvidenceChain, postStepVerifier');
    expect(rightPanel?.evidence.join(' ')).toContain('terminalRunStatus, terminalRunStatusEvidenceChain, terminalEvidence');
    expect(rightPanel?.evidence.join(' ')).toContain('hand-filled requirement arrays');
    expect(rightPanel?.evidence.join(' ')).toContain('matching service evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('Retained API Runtime / Agent API-like RunService runs now persist an Agent API execution promotion readiness Run step');
    expect(rightPanel?.evidence.join(' ')).toContain('from real service evidence before provider-visible execution');
    expect(rightPanel?.evidence.join(' ')).toContain('provider-visible preflight run/task identity');
    expect(rightPanel?.evidence.join(' ')).toContain('simplicity_check, runtime_action, pre-step, and subtask-start gates');
    expect(rightPanel?.evidence.join(' ')).toContain('missing Write Intent extraction, reviewed-patch apply boundary, post-step verification, and terminal Run evidence explicit');
    expect(rightPanel?.evidence.join(' ')).toContain('Completed retained API Runtime / Agent API-like RunService runs now persist a post-run Agent API execution promotion readiness Run step');
    expect(rightPanel?.evidence.join(' ')).toContain('Failed retained API Runtime / Agent API-like RunService runs now also persist a post-run Agent API execution promotion readiness Run step');
    expect(rightPanel?.evidence.join(' ')).toContain('treating failureReason as reviewable terminal evidence when output is absent');
    expect(rightPanel?.evidence.join(' ')).toContain('adding post-step verification and terminal Run evidence persistence');
    expect(rightPanel?.evidence.join(' ')).toContain('keeping Write Intent extraction and reviewed-patch apply boundary closed');
    expect(rightPanel?.evidence.join(' ')).toContain('Post-run Agent API execution promotion readiness now reads same-run sandbox patch promotion records');
    expect(rightPanel?.evidence.join(' ')).toContain('SandboxPatchPromotionRepository.listForRun');
    expect(rightPanel?.evidence.join(' ')).toContain('real applied promotion evidence exists');
    expect(rightPanel?.evidence.join(' ')).toContain('belongs to the same run and target task');
    expect(rightPanel?.evidence.join(' ')).toContain('blocked and pending patch promotion evidence remains visible as patchPromotionStatus');
    expect(rightPanel?.evidence.join(' ')).toContain('missing for reviewedPatchApplyBoundary until explicit apply completes successfully');
    expect(rightPanel?.evidence.join(' ')).toContain('parsed TASKPLANE_WRITE_INTENTS artifact.propose plus task_file.propose output and same-run patch promotion evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('without hand-filled readiness');
    expect(rightPanel?.evidence.join(' ')).toContain('derive deferred execution_run promotion requirements and missing lists through evaluateAgentApiExecutionPromotionReadinessFromEvidence');
    expect(rightPanel?.evidence.join(' ')).toContain('settings and safety reports aligned with service-evidence readiness');
    expect(rightPanel?.evidence.join(' ')).toContain('derive deferred execution_run key gates from the future provider-visible execution contract');
    expect(rightPanel?.evidence.join(' ')).toContain('settings and safety reports expose context, task-memory, subtask-start, and post-step boundaries');
    expect(rightPanel?.evidence.join(' ')).toContain('Agent API promotion readiness smoke');
    expect(rightPanel?.evidence.join(' ')).toContain('deferred=0/11 requirements and 0/9 gates');
    expect(rightPanel?.evidence.join(' ')).toContain('partial=5/11 requirements and 3/9 gates');
    expect(rightPanel?.evidence.join(' ')).toContain('service-evidence=3/11 requirements and 7/9 gates');
    expect(rightPanel?.evidence.join(' ')).toContain('selectedRuntimeRunEvidenceChain=missing, providerPreflightRunEvidenceChain=missing, and providerPreflightTaskEvidenceChain=ready');
    expect(rightPanel?.evidence.join(' ')).toContain('until persisted same-run Run evidence exists');
    expect(rightPanel?.evidence.join(' ')).toContain('synthetic-ready=11/11 requirements and 9/9 gates');
    expect(rightPanel?.evidence.join(' ')).toContain('Agent API execution preflight smoke');
    expect(rightPanel?.evidence.join(' ')).toContain('provider-visible text-call readiness');
    expect(rightPanel?.evidence.join(' ')).toContain('skipReason=opt_in_required');
    expect(rightPanel?.evidence.join(' ')).toContain('skipReason=config_missing');
    expect(rightPanel?.evidence.join(' ')).toContain('provider=not-called, executionRun=deferred, promotionReady=no, promotionRequirements=0/11, requiredGates=0/9, promotionMissingRequirements=..., executionRunMissingRequirements=..., executionRunMissingGates=..., missingGates=..., and workspace=unchanged');
    expect(rightPanel?.evidence.join(' ')).toContain('fal-openrouter / google/gemini-2.5-flash');
    expect(rightPanel?.evidence.join(' ')).toContain('provider=called, phrase=matched, workspace=unchanged, and status=passed');
    expect(rightPanel?.evidence.join(' ')).toContain('selected-runtime capability declarations');
    expect(capabilities?.evidence.join(' ')).toContain('configured workspace for native guidance');
    expect(capabilities?.evidence.join(' ')).toContain('native web/search readiness counts');
    expect(rightPanel?.evidence.join(' ')).toContain('workspace write candidates that require reviewable promotion evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('SandboxPatchPromotionApplyService');
    expect(rightPanel?.evidence.join(' ')).toContain('missing-apply-record status');
    expect(rightPanel?.evidence.join(' ')).toContain('explicit notice and file context-menu apply-to-workspace actions');
    expect(rightPanel?.evidence.join(' ')).toContain('file context-menu apply-to-workspace actions');
    expect(rightPanel?.evidence.join(' ')).toContain('reviewed patch promotion apply smoke');
    expect(rightPanel?.evidence.join(' ')).toContain('workspace-drift blocked recovery evidence');
    expect(rightPanel?.gaps.join(' ')).not.toContain('broader recovery copy is still needed');
    expect(rightPanel?.cliOnlyClosure).toBe('supported');
    expect(rightPanel?.gaps.join(' ')).toContain('General Agent API task execution promotion remains partial');
    expect(rightPanel?.nextActions.join(' ')).toContain('read-only promotion readiness smoke');
    expect(rightPanel?.nextActions.join(' ')).toContain('evaluateAgentApiExecutionPromotionReadiness, and evaluateAgentApiExecutionPromotionReadinessFromEvidence all report ready');
    expect(rightPanel?.nextActions.join(' ')).toContain('evaluateAgentApiExecutionPromotionReadinessFromEvidence all report ready');
    expect(rightPanel?.gaps.join(' ')).toContain('selected-runtime contract and reviewed-patch apply already own the operator-facing workspace mutation boundary');
    expect(rightPanel?.gates).toContain('context_readiness');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback proposal builder');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback apply plans');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback dispatch');
    expect(rightPanel?.evidence.join(' ')).toContain('TaskService, DecisionService, TaskFileRepository, and ArtifactRepository ports');
    expect(rightPanel?.evidence.join(' ')).toContain('source, structured, subtask, task-record, and task-memory confirmations');
    expect(rightPanel?.evidence.join(' ')).toContain('task records, task files, task artifacts');
    expect(rightPanel?.evidence.join(' ')).toContain('Task Dynamics now builds a Run-detail writeback approval queue');
    expect(decisions?.evidence.join(' ')).toContain('scheduler/background Decisions as proposal-only decision_draft work');
    expect(decisions?.evidence.join(' ')).toContain('without operator confirmation or standing approval');
    expect(decisions?.evidence.join(' ')).toContain('planSchedulerDecisionProposal');
    expect(decisions?.evidence.join(' ')).toContain('planSchedulerDecisionProposalFromEvidence');
    expect(decisions?.evidence.join(' ')).toContain('structured service evidence');
    expect(decisions?.evidence.join(' ')).toContain('target-scoped Standing Approval');
    expect(decisions?.evidence.join(' ')).toContain('approval-item-only');
    expect(decisions?.evidence.join(' ')).toContain('target-task identity');
    expect(decisions?.evidence.join(' ')).toContain('concrete operator confirmation');
    expect(decisions?.evidence.join(' ')).toContain('completed local recovery evidence');
    expect(decisions?.evidence.join(' ')).toContain('decisionPersistenceAllowed=false');
    expect(decisions?.evidence.join(' ')).toContain('writebackDispatchAllowed=false');
    expect(decisions?.evidence.join(' ')).toContain('schedulerTriggerAllowed=false');
    expect(decisions?.evidence.join(' ')).toContain('satisfied and missing requirement lists');
    expect(decisions?.evidence.join(' ')).toContain('proposalReady');
    expect(decisions?.evidence.join(' ')).toContain('requirements=x/4');
    expect(decisions?.evidence.join(' ')).toContain('proposalRequirements=x/4');
    expect(decisions?.evidence.join(' ')).toContain('proposalSatisfiedRequirements=...');
    expect(decisions?.evidence.join(' ')).toContain('approvalQueueSurface');
    expect(decisions?.evidence.join(' ')).toContain('localRecoveryRunId');
    expect(decisions?.evidence.join(' ')).toContain('localRecoveryCompleted');
    expect(decisions?.evidence.join(' ')).toContain('operatorId');
    expect(decisions?.evidence.join(' ')).toContain('standingApprovalPolicyId');
    expect(decisions?.evidence.join(' ')).toContain('standingApprovalScopeTask');
    expect(decisions?.evidence.join(' ')).toContain('standingApprovalActive');
    expect(decisions?.evidence.join(' ')).toContain('standingApprovalScopeMatched');
    expect(decisions?.evidence.join(' ')).toContain('missingRequirements=...');
    expect(decisions?.evidence.join(' ')).toContain('proposalMissingRequirements=...');
    expect(decisions?.evidence.join(' ')).toContain('CapabilityRegistry now includes scheduler/background Decision proposal readiness');
    expect(decisions?.evidence.join(' ')).toContain('runtime.scheduler summary through planSchedulerDecisionProposalFromEvidence');
    expect(decisions?.evidence.join(' ')).toContain('ConfigurationSafetyReport surfaces the approval queue, target-task, authorization source, standing-approval policy identity, no-persistence, no-writeback, and no-trigger boundary');
    expect(decisions?.evidence.join(' ')).toContain('Settings configuration safety rows now render runtime.scheduler evidence chips');
    expect(decisions?.evidence.join(' ')).toContain('proposalRequirements, proposalSatisfiedRequirements, proposalMissingRequirements, missingRequirements');
    expect(decisions?.evidence.join(' ')).toContain('decisionPersistenceAllowed, writebackDispatchAllowed, schedulerTriggerAllowed');
    expect(decisions?.evidence.join(' ')).toContain('triggerPlanReady, runtimeStartAllowed, runtimeStartReady');
    expect(decisions?.evidence.join(' ')).toContain('schedulerTriggerServiceConnected');
    expect(decisions?.evidence.join(' ')).toContain('scheduler Decision proposal payload gaps');
    expect(decisions?.evidence.join(' ')).toContain('closed persistence/writeback/trigger gates');
    expect(decisions?.evidence.join(' ')).toContain('scheduled/event runtime-start state');
    expect(decisions?.evidence.join(' ')).toContain('runtimeStartRequirements');
    expect(decisions?.evidence.join(' ')).toContain('runtimeStartSatisfiedRequirements');
    expect(decisions?.evidence.join(' ')).toContain('runtimeStartMissingRequirements');
    expect(decisions?.evidence.join(' ')).toContain('scheduler Decision proposal readiness smoke');
    expect(decisions?.evidence.join(' ')).toContain('approvalQueueSurface=task_dynamics');
    expect(decisions?.evidence.join(' ')).toContain('authorization missing when Standing Approval scope does not match the target task');
    expect(decisions?.evidence.join(' ')).toContain('panel.scheduler_decision_proposed timeline events');
    expect(decisions?.evidence.join(' ')).toContain('converts only ready proposals into the existing TaskplaneWritebackApprovalItem queue');
    expect(decisions?.evidence.join(' ')).toContain('SchedulerService.proposeSchedulerDecision');
    expect(decisions?.evidence.join(' ')).toContain('records panel.scheduler_decision_proposed only when ready');
    expect(decisions?.evidence.join(' ')).toContain('failed terminal runs now route a deduplicated failure-review policy');
    expect(decisions?.evidence.join(' ')).toContain('at most one target-scoped panel.scheduler_decision_proposed recovery Decision proposal per task per UTC day');
    expect(decisions?.evidence.join(' ')).toContain('failureDecisionProposals summary evidence');
    expect(decisions?.evidence.join(' ')).toContain('daily run-limit blocks now route a deduplicated run-limit review policy');
    expect(decisions?.evidence.join(' ')).toContain('runLimitDecisionProposals summary evidence');
    expect(decisions?.evidence.join(' ')).toContain('invalid run-limit accounting evidence now routes a deduplicated run-count evidence review policy');
    expect(decisions?.evidence.join(' ')).toContain('runtimeStartMissingRequirements includes run_limit_count');
    expect(decisions?.evidence.join(' ')).toContain('runLimitAccountingDecisionProposals summary evidence');
    expect(decisions?.evidence.join(' ')).toContain('automation-readiness blocks now route a deduplicated readiness-review policy');
    expect(decisions?.evidence.join(' ')).toContain('readinessDecisionProposals summary evidence');
    expect(decisions?.evidence.join(' ')).toContain('trigger-port sweep failures now route a deduplicated sweep-failure review policy');
    expect(decisions?.evidence.join(' ')).toContain('sweepFailureDecisionProposals summary evidence');
    expect(decisions?.evidence.join(' ')).toContain('task-source sweep failures now explicitly record taskSourceFailureDecisionProposals=not_required_no_target_task');
    expect(decisions?.evidence.join(' ')).toContain('no-generic-Decision boundary');
    expect(decisions?.evidence.join(' ')).toContain('timeline evidence write failures after a Run starts now route a deduplicated timeline-failure review policy');
    expect(decisions?.evidence.join(' ')).toContain('timelineFailureDecisionProposals summary evidence');
    expect(decisions?.evidence.join(' ')).toContain('Run target-task mismatches now block target timeline evidence');
    expect(decisions?.evidence.join(' ')).toContain('runIdentityDecisionProposals summary evidence');
    expect(decisions?.evidence.join(' ')).toContain('operator-started runs return blocked recovery evidence instead of throwing to IPC');
    expect(decisions?.evidence.join(' ')).toContain('completed runs without reviewable output or failureReason');
    expect(decisions?.evidence.join(' ')).toContain('terminalEvidenceDecisionProposals summary evidence');
    expect(decisions?.evidence.join(' ')).toMatch(/duplicate task-source candidates now skip duplicate runtime starts[\s\S]*duplicateCandidateDecisionProposals summary evidence[\s\S]*task-id evidence for failed-run, missing-terminal-evidence, run-limit, run-limit accounting, readiness, duplicate-candidate, sweep-failure, run-identity, and timeline-failure scheduler Decision proposals/);
    expect(decisions?.evidence.join(' ')).toContain('stale-run recovery now routes each recovered run');
    expect(decisions?.evidence.join(' ')).toContain('staleRunRecoveryDecisionProposals summary evidence');
    expect(decisions?.evidence.join(' ')).toContain('DecisionService.draft is registered as a task-bound decision_draft entrypoint');
    expect(decisions?.evidence.join(' ')).toContain('selected Agent CLI modes stay product_harness/skipped');
    expect(decisions?.evidence.join(' ')).toContain('Approved checkpoint Decision resume is limited to open tool_permission');
    expect(decisions?.evidence.join(' ')).toContain('cannot turn ordinary Decision approval into arbitrary tool execution');
    expect(decisions?.evidence.join(' ')).toContain('Decision actions in DecisionService and DecisionsPage pass through decision_action');
    expect(decisions?.cliOnlyClosure).toBe('supported');
    expect(decisions?.gaps.join(' ')).toContain('deduplicated failed-run recovery policy');
    expect(decisions?.gaps.join(' ')).toContain('deduplicated daily run-limit review policy');
    expect(decisions?.gaps.join(' ')).toContain('deduplicated run-limit accounting evidence review policy');
    expect(decisions?.gaps.join(' ')).toContain('deduplicated automation-readiness review policy');
    expect(decisions?.gaps.join(' ')).toContain('deduplicated trigger-service-disconnected review policy');
    expect(decisions?.gaps.join(' ')).toContain('deduplicated sweep-failure trigger review policy');
    expect(decisions?.gaps.join(' ')).toContain('no-target task-source failure policy');
    expect(decisions?.gaps.join(' ')).toContain('deduplicated timeline-failure review policy');
    expect(decisions?.gaps.join(' ')).toContain('deduplicated run-identity review policy');
    expect(decisions?.gaps.join(' ')).toContain('terminal-evidence review policy');
    expect(decisions?.gaps.join(' ')).toContain('duplicate-candidate review policy');
    expect(decisions?.gaps.join(' ')).toContain('future scheduler/background Decision drafts still remain without direct IPC persistence');
    expect(decisions?.nextActions.join(' ')).toContain('Promote future scheduler/background Decision drafts only through SchedulerService.proposeSchedulerDecision');
    expect(decisions?.nextActions.join(' ')).toContain('deduplication');
    expect(decisions?.nextActions.join(' ')).toContain('real run/sweep evidence');
    expect(decisions?.nextActions.join(' ')).toContain('TaskplaneWritebackApprovalItem confirmation');
    expect(rightPanel?.evidence.join(' ')).toContain('artifact.propose Write Intent can now carry kind=patch');
    expect(rightPanel?.evidence.join(' ')).toContain('imported_patch_artifact sandbox draft sources');
    expect(taskFiles?.evidence.join(' ')).toContain('patch-promotion checkpoint and Decision status');
    expect(workHabits?.evidence.join(' ')).toContain('automation readiness as a diagnostic-only entrypoint');
    expect(workHabits?.evidence.join(' ')).toContain('no runtime_action/pre_step/post_step execution gates');
    expect(workHabits?.evidence.join(' ')).toContain('scheduled/event/routine Agent execution as a separate gated provider-visible execution contract');
    expect(workHabits?.evidence.join(' ')).toContain('explicit operator IPC before any background scheduler trigger can exist');
    expect(workHabits?.evidence.join(' ')).toContain('satisfied and missing requirement lists');
    expect(workHabits?.evidence.join(' ')).toContain('automationReady');
    expect(workHabits?.evidence.join(' ')).toContain('requirements=x/9');
    expect(workHabits?.evidence.join(' ')).toContain('missingRequirements=...');
    expect(workHabits?.evidence.join(' ')).toContain('automationMissingRequirements=...');
    expect(workHabits?.evidence.join(' ')).toContain('default scheduled/event diagnostics show scheduled_event_entrypoint missing');
    expect(workHabits?.evidence.join(' ')).toContain('connected trigger-service plans can satisfy it');
    expect(workHabits?.evidence.join(' ')).toContain('autonomy ladder level');
    expect(workHabits?.evidence.join(' ')).toContain('L1 proposal capability');
    expect(workHabits?.evidence.join(' ')).toContain('standing_approval as an explicit deferred gate');
    expect(workHabits?.evidence.join(' ')).toContain('AgentStandingApprovalPolicy');
    expect(workHabits?.evidence.join(' ')).toContain('evaluateStandingApprovalForAutomation');
    expect(workHabits?.evidence.join(' ')).toContain('daily run limit');
    expect(workHabits?.evidence.join(' ')).toContain('standingApprovalReady');
    expect(workHabits?.evidence.join(' ')).toContain('requirements=x/13');
    expect(workHabits?.evidence.join(' ')).toContain('missingRequirements=...');
    expect(workHabits?.evidence.join(' ')).toContain('standingApprovalMissingRequirements=...');
    expect(workHabits?.evidence.join(' ')).toContain('buildStandingApprovalConfirmationDraft');
    expect(workHabits?.evidence.join(' ')).toContain('confirmation-only L2 authorization draft');
    expect(workHabits?.evidence.join(' ')).toContain('schedulerTriggerAllowed=false / workspaceWriteAllowed=false');
    expect(workHabits?.evidence.join(' ')).toContain('readiness evidence chips');
    expect(workHabits?.evidence.join(' ')).toContain('blocks other automation readiness gaps');
    expect(workHabits?.evidence.join(' ')).toContain('TasksPage Task Dynamics');
    expect(workHabits?.evidence.join(' ')).toContain('operator card');
    expect(workHabits?.evidence.join(' ')).toContain('panel.standing_approval_confirmed');
    expect(workHabits?.evidence.join(' ')).toContain('TaskService timeline mutation guard');
    expect(workHabits?.evidence.join(' ')).toContain('Work Habits now explain the boundary between learned execution context and L2 autonomous authorization');
    expect(workHabits?.evidence.join(' ')).toContain('Work Habits do not directly start scheduler jobs or write the workspace');
    expect(workHabits?.evidence.join(' ')).toContain('Settings confirmation threshold now clarifies');
    expect(workHabits?.evidence.join(' ')).toContain('does not bypass Standing Approval, workspace writes, external connectors, paid actions, or release/deploy hard confirmations');
    expect(workHabits?.evidence.join(' ')).toContain('planScheduledEventAgentTrigger');
    expect(workHabits?.evidence.join(' ')).toContain('planScheduledEventAgentTriggerFromEvidence');
    expect(workHabits?.evidence.join(' ')).toContain('shared scheduled/event trigger planner');
    expect(workHabits?.evidence.join(' ')).toContain('structured service evidence');
    expect(workHabits?.evidence.join(' ')).toContain('confirmed Standing Approval timeline record');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartAllowed=false');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartAllowed=true only when a dedicated trigger service is connected and daily run-limit count evidence is present');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartSatisfiedRequirements');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartMissingRequirements');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartReady');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartRequirements=x/4');
    expect(workHabits?.evidence.join(' ')).toContain('selected_runtime_identity');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartSatisfiedRequirements=...');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartMissingRequirements=...');
    expect(workHabits?.evidence.join(' ')).toContain('CapabilityRegistry now includes scheduled/event trigger runtime-start readiness');
    expect(workHabits?.evidence.join(' ')).toContain('runtime.scheduler summary through planScheduledEventAgentTriggerFromEvidence');
    expect(workHabits?.evidence.join(' ')).toContain('ConfigurationSafetyReport shows trigger-plan, scheduler-trigger-service, and run-limit-count gaps');
    expect(workHabits?.evidence.join(' ')).toContain('scheduled/event trigger readiness smoke');
    expect(workHabits?.evidence.join(' ')).toContain('read-only build-gated harness with stale-build detection');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartAllowed=false with runtimeStartRequirements=2/4');
    expect(workHabits?.evidence.join(' ')).toContain('service-evidence=2/4 runtime-start requirements');
    expect(workHabits?.evidence.join(' ')).toContain('run_limit_count missing');
    expect(workHabits?.evidence.join(' ')).toContain('daily-cap-reached plans stay blocked');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartRequirements=4/4');
    expect(workHabits?.evidence.join(' ')).toContain('SchedulerService.diagnoseScheduledEventAgentTriggers and triggerScheduledEventAgentRun');
    expect(workHabits?.evidence.join(' ')).toContain('build scheduled/event trigger plans through planScheduledEventAgentTriggerFromEvidence');
    expect(workHabits?.evidence.join(' ')).toContain('no-start diagnostics and real trigger attempts share the same service-evidence contract');
    expect(workHabits?.evidence.join(' ')).toContain('daily run-limit accounting input');
    expect(workHabits?.evidence.join(' ')).toContain('maxRunsPerDay has been reached');
    expect(workHabits?.evidence.join(' ')).toContain('RunRepository.countCreatedSinceByTask');
    expect(workHabits?.evidence.join(' ')).toContain('persisted same-day Run records');
    expect(workHabits?.evidence.join(' ')).toContain('trigger Run evidence contract');
    expect(workHabits?.evidence.join(' ')).toContain('subtask_start, run-limit count, and post-step evidence');
    expect(workHabits?.evidence.join(' ')).toContain('SchedulerService.triggerScheduledEventAgentRun');
    expect(workHabits?.evidence.join(' ')).toContain('injected Code Agent trigger port');
    expect(workHabits?.evidence.join(' ')).toContain('schedulerTriggerServiceConnected=true');
    expect(workHabits?.evidence.join(' ')).toContain('operatorConfirmed=true');
    expect(workHabits?.evidence.join(' ')).toContain('target task id');
    expect(workHabits?.evidence.join(' ')).toContain('task-memory guidance');
    expect(workHabits?.evidence.join(' ')).toContain('first open completion criterion');
    expect(workHabits?.evidence.join(' ')).toContain('first source title');
    expect(workHabits?.evidence.join(' ')).toContain('automation readiness evidence including scheduledEventEntrypoint=available');
    expect(workHabits?.evidence.join(' ')).toContain('Standing Approval policy id and scope');
    expect(workHabits?.evidence.join(' ')).toContain('runtime-start requirement evidence');
    expect(workHabits?.evidence.join(' ')).toContain('run-limit evidence');
    expect(workHabits?.evidence.join(' ')).toContain('post-step terminal-evidence guidance');
    expect(workHabits?.evidence.join(' ')).toContain('workspaceWriteAllowed=false proposal-only boundary');
    expect(workHabits?.evidence.join(' ')).toContain('scheduler:triggerScheduledEventAgentRun');
    expect(workHabits?.evidence.join(' ')).toContain('blocked operator-started run preserves recovery evidence');
    expect(workHabits?.evidence.join(' ')).toContain('run-identity mismatch');
    expect(workHabits?.evidence.join(' ')).toContain('启动一次');
    expect(workHabits?.evidence.join(' ')).toContain('without enabling a background scheduler job');
    expect(workHabits?.evidence.join(' ')).toContain('operator feedback now includes the required trigger evidence items, run-limit usage, and proposal-mode write boundary');
    expect(workHabits?.evidence.join(' ')).toContain('without requiring the operator to open event detail first');
    expect(workHabits?.evidence.join(' ')).toContain('terminalRunEvidenceStatus and triggerRunEvidenceStatus for the single-run operator action');
    expect(workHabits?.evidence.join(' ')).toContain('terminal run status plus reviewable output or failureReason');
    expect(workHabits?.evidence.join(' ')).toContain('completed/failed runs without inspectable evidence remain pending_terminal_run_evidence');
    expect(workHabits?.evidence.join(' ')).toContain('panel.scheduled_event_agent_triggered');
    expect(workHabits?.evidence.join(' ')).toContain('terminalRunEvidenceStatus');
    expect(workHabits?.evidence.join(' ')).toContain('triggerRunEvidenceStatus');
    expect(workHabits?.evidence.join(' ')).toContain('target task id');
    expect(workHabits?.evidence.join(' ')).toContain('Standing Approval policy id');
    expect(workHabits?.evidence.join(' ')).toContain('automation readiness summary plus satisfied/missing requirements');
    expect(workHabits?.evidence.join(' ')).toContain('runtime-start satisfied/missing requirements');
    expect(workHabits?.evidence.join(' ')).toContain('workspaceWriteAllowed=false');
    expect(workHabits?.evidence.join(' ')).toContain('required trigger evidence');
    expect(workHabits?.evidence.join(' ')).toContain('triggerKind=manual|cron');
    expect(workHabits?.evidence.join(' ')).toContain('operator-started runs from background scheduler starts');
    expect(workHabits?.evidence.join(' ')).toContain('operator action feedback now surfaces run.failureReason');
    expect(workHabits?.evidence.join(' ')).toContain('failed terminal state');
    expect(workHabits?.evidence.join(' ')).toContain('blocks even operator-confirmed scheduled/event starts when the Task Dynamics timeline evidence port is not connected');
    expect(workHabits?.evidence.join(' ')).toContain('L2 Agent action evidence mandatory before any Code Agent run can start');
    expect(workHabits?.evidence.join(' ')).toContain('emits run.changed, task.changed, and brief.changed after a started scheduled/event Agent run');
    expect(workHabits?.evidence.join(' ')).toContain('refreshes run plus target/returned task surfaces');
    expect(workHabits?.evidence.join(' ')).toContain('RuntimeEventRecord now formats panel.scheduled_event_agent_triggered');
    expect(workHabits?.evidence.join(' ')).toContain('readable Task Dynamics detail with run id');
    expect(workHabits?.evidence.join(' ')).toContain('target task id');
    expect(workHabits?.evidence.join(' ')).toContain('trigger plan summary');
    expect(workHabits?.evidence.join(' ')).toContain('runtime-start gate status');
    expect(workHabits?.evidence.join(' ')).toContain('automation-readiness gate status');
    expect(workHabits?.evidence.join(' ')).toContain('failure reason when present');
    expect(workHabits?.evidence.join(' ')).toContain('required trigger evidence items');
    expect(workHabits?.evidence.join(' ')).toContain('localized trigger kind labels for 自动巡检 and 手动启动');
    expect(workHabits?.evidence.join(' ')).toContain('run-limit usage');
    expect(workHabits?.evidence.join(' ')).toContain('workspace proposal-mode write boundary');
    expect(workHabits?.evidence.join(' ')).toContain('runScheduledEventAgentTriggerSweep');
    expect(workHabits?.evidence.join(' ')).toContain('15-minute background scheduler job');
    expect(workHabits?.evidence.join(' ')).toContain('scheduledEventAgentSweepJobConnected');
    expect(workHabits?.evidence.join(' ')).toContain('lastScheduledEventAgentSweepSummary');
    expect(workHabits?.evidence.join(' ')).toContain('registered */15 scheduled/event Agent cron callback');
    expect(workHabits?.evidence.join(' ')).toContain('triggerKind=cron, operatorConfirmed=true');
    expect(workHabits?.evidence.join(' ')).toContain('consecutive */15 scheduled/event Agent cron ticks');
    expect(workHabits?.evidence.join(' ')).toContain('persisted same-day run counts');
    expect(workHabits?.evidence.join(' ')).toContain('no second Code Agent trigger when the Standing Approval daily cap is reached');
    expect(workHabits?.evidence.join(' ')).toContain('persisted sweep_failed summary');
    expect(workHabits?.evidence.join(' ')).toContain('released in-flight guard');
    expect(workHabits?.evidence.join(' ')).toContain('operator-visible and recoverable instead of becoming unhandled scheduler promises');
    expect(workHabits?.evidence.join(' ')).toContain('timeline-recording failures after a run starts also preserve startedRunIds');
    expect(workHabits?.evidence.join(' ')).toContain('triggerRunEvidenceStatus=pending_terminal_run_evidence without counting the started run as blocked');
    expect(workHabits?.evidence.join(' ')).toContain('task-source failures before candidate loading persist sweep_failed');
    expect(workHabits?.evidence.join(' ')).toContain('checked=0, checkedTaskIds=none');
    expect(workHabits?.evidence.join(' ')).toContain('no Code Agent trigger, no timeline evidence');
    expect(workHabits?.evidence.join(' ')).toContain('publishes a sweep result listener after completed, skipped, and failed sweep summaries');
    expect(workHabits?.evidence.join(' ')).toContain('bootstrap wires it to brief.changed');
    expect(workHabits?.evidence.join(' ')).toContain('refresh even when no Agent run starts');
    expect(workHabits?.evidence.join(' ')).toContain('skipReason=in_flight');
    expect(workHabits?.evidence.join(' ')).toContain('do not start a second Code Agent run');
    expect(workHabits?.evidence.join(' ')).toContain('Task Dynamics timeline port');
    expect(workHabits?.evidence.join(' ')).toContain('scheduled/event task-source port');
    expect(workHabits?.evidence.join(' ')).toContain('missingPorts=run_port,timeline_port,task_source_port');
    expect(workHabits?.evidence.join(' ')).toContain('deduplicates scheduled/event task candidates before runtime start');
    expect(workHabits?.evidence.join(' ')).toContain('routes duplicate task-source evidence to a scheduler Decision proposal');
    expect(workHabits?.evidence.join(' ')).toContain('skipReason, checkedTaskIds, startedRunIds, blockedReasons, blockedTaskSummaries, runFailureReasons, automationMissingRequirements, automationSatisfiedRequirements, runtimeStartMissingRequirements, terminalRunEvidenceMissingRunIds, triggerRunEvidenceRequired, and triggerRunEvidenceStatus at the top level');
    expect(workHabits?.evidence.join(' ')).toContain('which automation-readiness requirements are satisfied or missing');
    expect(workHabits?.evidence.join(' ')).toContain('Brief now surfaces schedulerStatus.lastScheduledEventAgentSweepAt');
    expect(workHabits?.evidence.join(' ')).toContain('lastScheduledEventAgentSweepSummary');
    expect(workHabits?.evidence.join(' ')).toContain('scheduledEventAgentSweepJobConnected as automatic-sweep status chips');
    expect(workHabits?.evidence.join(' ')).toContain('skipped ports_not_connected and in_flight sweeps also update lastScheduledEventAgentSweepAt');
    expect(workHabits?.evidence.join(' ')).toContain('Brief automatic-sweep chips now derive the visible label from lastScheduledEventAgentSweepSummary');
    expect(workHabits?.evidence.join(' ')).toContain('waiting_for_first_tick stays 已接线');
    expect(workHabits?.evidence.join(' ')).toContain('ports_not_connected shows 未接线');
    expect(workHabits?.evidence.join(' ')).toContain('in_flight shows 运行中');
    expect(workHabits?.evidence.join(' ')).toContain('sweep_failed shows 异常');
    expect(workHabits?.evidence.join(' ')).toContain('ports_not_connected automatic-sweep chips now include a missing port count');
    expect(workHabits?.evidence.join(' ')).toContain('operators can see the recovery scope without opening the tooltip');
    expect(workHabits?.evidence.join(' ')).toContain('automatic-sweep chips now parse automationMissingRequirements');
    expect(workHabits?.evidence.join(' ')).toContain('show 准备缺 N only when automation readiness is missing');
    expect(workHabits?.evidence.join(' ')).toContain('Brief completed automatic-sweep chips now show 限额');
    expect(workHabits?.evidence.join(' ')).toContain('scheduled/event daily run limit');
    expect(workHabits?.evidence.join(' ')).toContain('parse terminalRunEvidenceMissingRunIds and show 终态缺 N');
    expect(workHabits?.evidence.join(' ')).toContain('pending post-step review is visible without opening the tooltip');
    expect(workHabits?.evidence.join(' ')).toContain('completed automatic-sweep chips now include checked, started, blocked, run-failure count, and trigger Run evidence labels');
    expect(workHabits?.evidence.join(' ')).toContain('whether terminal runs failed');
    expect(workHabits?.evidence.join(' ')).toContain('waiting for terminal Run evidence or ready for review');
    expect(workHabits?.evidence.join(' ')).toContain('failed automatic-sweep chips now parse startedRunIds and triggerRunEvidenceStatus');
    expect(workHabits?.evidence.join(' ')).toContain('show 启动 N and 证据待终态 instead of only 异常 and checked count');
    expect(workHabits?.evidence.join(' ')).toContain('records completed sweep time from the triggering now value');
    expect(workHabits?.evidence.join(' ')).toContain('automatic-sweep status chip');
    expect(workHabits?.evidence.join(' ')).toContain('scheduled/event Agent sweep smoke');
    expect(workHabits?.evidence.join(' ')).toContain('checked=2 duplicate candidates');
    expect(workHabits?.evidence.join(' ')).toContain('checkedTaskIdsEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('blocked=1 by duplicate candidate skip before runtime start');
    expect(workHabits?.evidence.join(' ')).toContain('duplicateCandidateDecision=proposed');
    expect(workHabits?.evidence.join(' ')).toContain('skipReason=none');
    expect(workHabits?.evidence.join(' ')).toContain('startedRunIds evidence');
    expect(workHabits?.evidence.join(' ')).toContain('blockedReasons evidence');
    expect(workHabits?.evidence.join(' ')).toContain('blockedTaskSummaryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('runFailureReasons evidence');
    expect(workHabits?.evidence.join(' ')).toContain('automationMissingRequirements evidence');
    expect(workHabits?.evidence.join(' ')).toContain('automationSatisfiedRequirements evidence');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartRequirements=passed');
    expect(workHabits?.evidence.join(' ')).toContain('terminalRunEvidenceMissingRunIds evidence');
    expect(workHabits?.evidence.join(' ')).toContain('triggerRunEvidenceRequired evidence');
    expect(workHabits?.evidence.join(' ')).toContain('triggerRunEvidenceStatus=pending_terminal_run_evidence');
    expect(workHabits?.evidence.join(' ')).toContain('manualSweepSummary evidence');
    expect(workHabits?.evidence.join(' ')).toContain('terminalSweepSummary evidence');
    expect(workHabits?.evidence.join(' ')).toContain('cronSweepSummary evidence');
    expect(workHabits?.evidence.join(' ')).toContain('disconnectedSkipReason=ports_not_connected');
    expect(workHabits?.evidence.join(' ')).toContain('disconnectedTriggerRunEvidenceStatus=not_started');
    expect(workHabits?.evidence.join(' ')).toContain('inFlightSkipReason=in_flight');
    expect(workHabits?.evidence.join(' ')).toContain('inFlightTriggerRunEvidenceStatus=not_started');
    expect(workHabits?.evidence.join(' ')).toContain('failedSkipReason=sweep_failed');
    expect(workHabits?.evidence.join(' ')).toContain('failedTriggerRunEvidenceStatus=not_started');
    expect(workHabits?.evidence.join(' ')).toContain('failedSweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('failedSweepRecoveryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('timelineFailedStartedRunEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('timelineFailedNotBlockedEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('timelineFailedTriggerRunEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('timelineFailedSweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('timelineFailedDecisionProposalEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('runIdentityFailedStartedRunEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('runIdentityFailedDecisionProposalEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('sourceFailedSkipReason=sweep_failed');
    expect(workHabits?.evidence.join(' ')).toContain('sourceFailedTriggerRunEvidenceStatus=not_started');
    expect(workHabits?.evidence.join(' ')).toContain('sourceFailedSweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('sourceFailedSweepRecoveryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('readinessBlockedDecisionProposalEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('readinessBlockedNoTriggerEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('cronSoakRunLimitEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('cronSoakAutomationReadinessEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('cronSoakNoSecondTriggerEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('completedSweepTimeEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('skippedSweepTimeEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTargetTask=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTaskMemoryGuidance=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunAutomationReadiness=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunFirstCriterion=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunFirstSource=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunPostStepGuidance=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunWorkspaceWriteBoundary=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunStandingApprovalScope=passed');
    expect(workHabits?.evidence.join(' ')).toContain('terminalTriggerRunEvidenceStatus=ready_for_terminal_review');
    expect(workHabits?.evidence.join(' ')).toContain('cronTriggerRunEvidenceStatus=ready_for_terminal_review');
    expect(workHabits?.evidence.join(' ')).toContain('manualTriggerKind=manual');
    expect(workHabits?.evidence.join(' ')).toContain('terminalTriggerKind=manual');
    expect(workHabits?.evidence.join(' ')).toContain('cronTriggerKind=cron');
    expect(workHabits?.evidence.join(' ')).toContain('startupSweepJobConnected=yes');
    expect(workHabits?.evidence.join(' ')).toContain('triggerRunEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('sweepAutomationReadinessEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('terminalTriggerRunEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('cronTriggerRunEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('cronRunFailureReasonEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('failedRunDecisionDedupeEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('triggerKindEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTargetTaskEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTaskMemoryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunAutomationReadinessEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunFirstCriterionEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunFirstSourceEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunPostStepEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunWorkspaceBoundaryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunStandingApprovalScopeEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('runLimitEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartRequirements=passed');
    expect(workHabits?.evidence.join(' ')).toContain('targetTaskId timeline evidence');
    expect(workHabits?.evidence.join(' ')).toContain('timelineEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('missingTimelineEvidenceGate=blocked');
    expect(workHabits?.evidence.join(' ')).toContain('missingTimelineTriggerCalls=0');
    expect(workHabits?.evidence.join(' ')).toContain('terminalTimelineEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('cronTimelineEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('timelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('terminalTimelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('cronTimelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('startupSweepJobEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('sweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('sweepListenerEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('disconnectedSweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('disconnectedSweepListenerEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('inFlightSweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('inFlightSweepListenerEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('failedSweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('failedSweepListenerEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('timeline-failure Decision proposal path');
    expect(workHabits?.evidence.join(' ')).toContain('timelineFailedStartedRunEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('timelineFailedNotBlockedEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('timelineFailedTriggerRunEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('timelineFailedSweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('timelineFailedDecisionProposalEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('sourceFailedSweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('readinessBlockedDecisionProposalEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('runLimitAccountingDecisionProposalEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('invalidRunLimitNoTriggerEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('runStatusEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('terminalRunStatusEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('cronRunStatusEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('Local scheduled/event Agent sweep acceptance on 2026-05-28 passed');
    expect(workHabits?.evidence.join(' ')).toContain('cronRunFailureReasonEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('failedRunDecisionDedupeEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('durableRunLimitCountEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('runLimitCountSince=2026-05-26T00:00:00.000Z');
    expect(workHabits?.evidence.join(' ')).toContain('manual scheduled/event Agent background live preflight');
    expect(workHabits?.evidence.join(' ')).toContain('backgroundLiveRun=deferred');
    expect(workHabits?.evidence.join(' ')).toContain('status=ready');
    expect(workHabits?.evidence.join(' ')).toContain('backgroundLiveRun=ready_to_attempt');
    expect(workHabits?.evidence.join(' ')).toContain('requiredEvidence=scheduler_job_connected,standing_approval,context_readiness,task_memory_guidance,subtask_start,task_source_port,code_agent_trigger_port,timeline_evidence,durable_run_limit_counting,terminal_run_evidence,post_step_gates');
    expect(workHabits?.evidence.join(' ')).toContain('manual scheduled/event Agent background live smoke');
    expect(workHabits?.evidence.join(' ')).toContain('TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_SMOKE=true');
    expect(workHabits?.evidence.join(' ')).toContain('backgroundLiveRun=not-started');
    expect(workHabits?.evidence.join(' ')).toContain('SchedulerService.runScheduledEventAgentTriggerSweep("cron")');
    expect(workHabits?.evidence.join(' ')).toContain('Opt-in scheduled/event Agent background live smoke passed locally on 2026-05-27');
    expect(workHabits?.evidence.join(' ')).toContain('backgroundLiveRun=attempted');
    expect(workHabits?.evidence.join(' ')).toContain('sweepStatus=completed');
    expect(workHabits?.evidence.join(' ')).toContain('provider=called');
    expect(workHabits?.evidence.join(' ')).toContain('stagedFiles=.taskplane/scheduled-event-agent-background-live-smoke.md');
    expect(workHabits?.evidence.join(' ')).toContain('manual scheduled/event Agent packaged background soak');
    expect(workHabits?.evidence.join(' ')).toContain('TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_PACKAGED_BACKGROUND_SOAK=true');
    expect(workHabits?.evidence.join(' ')).toContain('packagedApp=not-launched');
    expect(workHabits?.evidence.join(' ')).toContain('triggers scheduler:triggerScheduledEventAgentRun through the preload IPC');
    expect(workHabits?.evidence.join(' ')).toContain('accepted Code Agent check evidence');
    expect(workHabits?.evidence.join(' ')).toContain('Opt-in scheduled/event Agent packaged background soak passed locally on 2026-05-27');
    expect(workHabits?.evidence.join(' ')).toContain('terminalRunEvidenceStatus=present');
    expect(workHabits?.evidence.join(' ')).toContain('runSteps=15');
    expect(workHabits?.evidence.join(' ')).toContain('docker=attempted_by_packaged_code_agent');
    expect(workHabits?.evidence.join(' ')).toContain('cronSoakRunLimitEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('cronSoakNoSecondTriggerEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('npm run accept:scheduled-event-agent-sweep-smoke');
    expect(workHabits?.evidence.join(' ')).toContain('status=completed, checked=2, started=1, blocked=1');
    expect(workHabits?.evidence.join(' ')).toContain('triggerKindEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTargetTaskEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTaskMemoryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunAutomationReadinessEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunFirstCriterionEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunFirstSourceEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunPostStepEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunWorkspaceBoundaryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunStandingApprovalScopeEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('timelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('terminalTimelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('cronTimelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('startupSweepJobEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('terminalRunEvidenceMissingRunIds=run_scheduled_event_sweep_smoke');
    expect(workHabits?.evidence.join(' ')).toContain('provider=not-called');
    expect(workHabits?.cliOnlyClosure).toBe('supported');
    expect(workHabits?.gaps.join(' ')).toContain('CLI-first packaged scheduled/event Agent path is now supported');
    expect(workHabits?.gaps.join(' ')).not.toContain('passing packaged soak run after rebuilding the app');
    expect(workHabits?.gaps.join(' ')).not.toContain('run-evidence persistence checks across live execution');
    expect(workHabits?.nextActions.join(' ')).toContain('Keep scheduled/event execution on the supported CLI-first packaged path');
    expect(workHabits?.nextActions.join(' ')).toContain('future API-backed scheduled execution');
    expect(workHabits?.nextActions.join(' ')).toContain('read-only scheduled/event trigger readiness smoke');
    expect(workHabits?.nextActions.join(' ')).toContain('planScheduledEventAgentTriggerFromEvidence');
    expect(workHabits?.nextActions.join(' ')).toContain('standing-approval');
    expect(rightPanel?.writeIntents).toContain('task_file.propose');
    expect(rightPanel?.writeIntents).toContain('artifact.propose');
    expect(rightPanel?.writeIntents).toContain('subtask.propose');
    expect(rightPanel?.gaps.join(' ')).not.toContain('still need product UI paths');
    expect(rightPanel?.gaps.join(' ')).not.toContain('main-side writeback orchestration service is not yet wired');
    expect(rightPanel?.gaps.join(' ')).not.toContain('Non-UI runtime confirmation flows');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('subtask.create_many writeback apply plan');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('draft-only before operator confirmation');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('Selected native Agent CLI decomposition');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.cliOnlyClosure)
      .toBe('supported');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.gaps.join(' '))
      .not.toContain('not yet represented as a main-side writeback apply plan');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.gaps.join(' '))
      .not.toContain('API-only paths');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('agent_api_decomposition subtask.create_many apply plan');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('subtask create-many apply plan readiness smoke');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('read-only build-gated harness with stale-build detection');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('confirmationBoundary=operator_confirmed_subtask_create_many');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('draftOnlyBeforeConfirmation=true');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('evaluateAgentApiDecompositionPromotionReadiness');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('evaluateAgentApiDecompositionPromotionReadinessFromEvidence');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('structured service evidence');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('operator confirmation boundary, and draft-only timeline evidence');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('keeps parent-task identity missing when the service parentTaskId is absent or does not match the apply-plan parentTaskId');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('keeps agent_api_decomposition_source missing when apply-plan input source and timeline source diverge');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('keeps draft_only_timeline_evidence missing when apply-plan evidenceRunId and timeline evidenceRunId diverge or when both run identities are absent');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('keeps the reversible proposal card missing when its proposalId, parentTaskId, subtask count, subtask title identity, subtask rationale identity, subtask dependency identity, or subtask-title uniqueness does not match the same apply-plan evidence chain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('satisfied and missing requirement lists');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('promotionReady');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('promotionRequirements=x/7');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('missingRequirements=...');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('promotionMissingRequirements=...');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('proposalId, expectedProposalId, proposalIdEvidenceChain, proposalParentTask, proposalTaskEvidenceChain, proposalSubtaskCount, applyPlanSubtaskCount, proposalSubtaskEvidenceChain, proposalSubtaskTitles, applyPlanSubtaskTitles, proposalDependencies, applyPlanDependencies, proposalDependencyEvidenceChain, applyPlanDependencyEvidenceChain, proposalSubtaskUniqueChain, proposalSubtaskIdentityChain, parentTask, applyPlanParentTask, parentTaskEvidenceChain, subtaskCount, evidenceRunId, timelineEvidenceRunId, sourceEvidenceChain, evidenceRunIdChain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('confirmationBoundary, draftOnlyBeforeConfirmation, runtimeMode, invocationLayer');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('timelineRuntimeMode, timelineInvocationLayer, timelineInvocationPhase');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('selected-runtime contract');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('parent-task identity');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('reversible proposal card');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('derive decomposition promotion requirements and missing lists through evaluateAgentApiDecompositionPromotionReadinessFromEvidence');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('selectedRuntimeContract matches the apply-plan timeline runtimeContract');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('preserve explicit decomposition timeline runtimeContract evidence without inferring evidenceRunId or parentTaskId from apply-plan inputs');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('capability, settings, and safety-report surfaces share the same evidence-based promotion contract');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('Tasks project decomposition confirmation now calls evaluateAgentApiDecompositionPromotionReadinessFromEvidence');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('before dispatching TaskplaneWritebackApplyPlan');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('persists the selected runtime contract into the subtask.create_many panel.project_decomposed timeline payload');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('including evidenceRunId and parentTaskId');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('invocationLayer=api_runtime');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('runtimeMode=api');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('Agent API project decomposition drafts now return a task-scoped, response-hashed evidenceRunId plus promotionReadiness');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('before the operator confirms child creation');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('draft generation and renderer confirmation now pass the task-scoped evidenceRunId and parentTaskId into selectedRuntimeContract');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('selectedRuntimeEvidenceRunChain, selectedRuntimeParentTaskEvidenceChain, and selectedRuntimeProviderEvidenceChain can become ready from real draft evidence');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('Right-panel AI decomposition draft readiness now projects promotionReadiness identity chips');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('selectedRuntimeEvidenceChain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('selectedRuntimeEvidenceRunId');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('selectedRuntimeParentTaskEvidenceChain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('proposal-id chain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('subtask-count chain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('subtask-title identity chain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('subtask dependency identity chain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('subtask-title uniqueness');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('source chain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('evidence-run chain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('Agent API decomposition promotion readiness smoke');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('blocked=0/7 requirements');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('partial=6/7 requirements');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('service-evidence=6/7 requirements');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('proposalId, expectedProposalId, proposalIdEvidenceChain, proposalParentTask, proposalTaskEvidenceChain, proposalSubtaskCount, applyPlanSubtaskCount, proposalSubtaskEvidenceChain, proposalSubtaskTitles, applyPlanSubtaskTitles, proposalDependencies, applyPlanDependencies, proposalDependencyEvidenceChain, applyPlanDependencyEvidenceChain, proposalSubtaskUniqueChain, proposalSubtaskIdentityChain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('timelineEvidenceRunId, sourceEvidenceChain, evidenceRunIdChain');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('selectedRuntimeEvidenceRunId, selectedRuntimeEvidenceRunChain, selectedRuntimeParentTask, selectedRuntimeParentTaskEvidenceChain, selectedRuntimeProvider, selectedRuntimeProviderEvidenceChain, providerConfigured, configuredProvider, configuredProviderEvidenceChain, timelineRuntimeMode');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('identity evidence plus agent_api_decomposition_source missing');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('synthetic-ready=7/7 requirements');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.gaps.join(' '))
      .toContain('proves selected-runtime contract');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.gaps.join(' '))
      .toContain('parent-task identity');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.nextActions.join(' '))
      .toContain('read-only subtask create-many apply plan readiness smoke');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.nextActions.join(' '))
      .toContain('read-only decomposition promotion readiness smoke');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.nextActions.join(' '))
      .toContain('evaluateAgentApiDecompositionPromotionReadinessFromEvidence');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('deferred execution_run invocation shape');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('recordPath evidence');
    expect(taskMemory?.evidence.join(' ')).toContain('TaskMemoryWriteProposal now routes Task Record proposals through TaskRecordWorthinessEvaluation');
    expect(taskMemory?.evidence.join(' ')).toContain('Task Dynamics now surfaces run-detail task-memory proposals');
    expect(taskMemory?.evidence.join(' ')).toContain('MemorySurfaceWriteCoverage registers retained task-memory proposal confirmation entrypoints');
    expect(taskMemory?.evidence.join(' ')).toContain('TaskMemoryWriteApplyPlan, TaskMdUpdateNeedEvaluation, TaskRecordWorthinessEvaluation');
    expect(taskMemory?.evidence.join(' ')).toContain('binds retained task-memory write IPC channels');
    expect(taskMemory?.status).toBe('covered');
    expect(taskMemory?.nextActions.join(' ')).toContain('MemorySurfaceWriteCoverage');
    expect(taskMemory?.nextActions.join(' ')).toContain('TaskMemoryWriteApplyPlan plus main-side writeback dispatch');
    expect(taskMemory?.gaps.join(' ')).not.toContain('Automatic writeback should keep distinguishing');
    expect(taskMemory?.gaps.join(' ')).not.toContain('Future non-RightPanel task-memory confirmation surfaces');
    expect(taskFiles?.evidence.join(' ')).toContain('Native CLI task_file.propose Write Intent');
    expect(taskFiles?.evidence.join(' ')).toContain('Native CLI artifact.propose Write Intent');
    expect(taskFiles?.evidence.join(' ')).toContain('artifact.propose kind=patch');
    expect(taskFiles?.evidence.join(' ')).toContain('SandboxPatchReviewPlanningService as imported_patch_artifact sources');
    expect(taskFiles?.evidence.join(' ')).toContain('sandbox-review preview action through main-side IPC');
    expect(taskFiles?.evidence.join(' ')).toContain('run sandbox review from a confirmed patch artifact');
    expect(taskFiles?.evidence.join(' ')).toContain('enableSandboxPatchPromotionApply');
    expect(taskFiles?.evidence.join(' ')).toContain('approved-but-unapplied');
    expect(taskFiles?.evidence.join(' ')).toContain('sandboxPatchPromotions');
    expect(taskFiles?.evidence.join(' ')).toContain('explicitly apply approved reviewed-patch promotions');
    expect(taskFiles?.evidence.join(' ')).toContain('approval is still no-write');
    expect(taskFiles?.evidence.join(' ')).toContain('no apply-to-workspace action is available');
    expect(taskFiles?.evidence.join(' ')).toContain('disabled apply-to-workspace action');
    expect(taskFiles?.evidence.join(' ')).toContain('default no-write boundary visible');
    expect(taskFiles?.evidence.join(' ')).toContain('ConfigurationSafetyReport now describes sandbox patch promotion apply as an explicit operator action');
    expect(taskFiles?.evidence.join(' ')).toContain('apply-to-workspace actions hidden');
    expect(taskFiles?.evidence.join(' ')).toContain('reviewed patch promotion apply smoke');
    expect(taskFiles?.evidence.join(' ')).toContain('blocked workspace-drift recovery evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('Packaged task-files smoke now covers the explicit reviewed-patch apply UI path');
    expect(taskFiles?.evidence.join(' ')).toContain('no-write recovery evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('workspace was not written');
    expect(taskFiles?.evidence.join(' ')).toContain('post-apply verification results');
    expect(taskFiles?.evidence.join(' ')).toContain('only reviewed patch files passing promotion preflight');
    expect(taskFiles?.evidence.join(' ')).toContain('drift blocks apply');
    expect(taskFiles?.evidence.join(' ')).toContain('requirements=x/12');
    expect(taskFiles?.evidence.join(' ')).toContain('missingRequirements=...');
    expect(taskFiles?.evidence.join(' ')).toContain('sandbox patch promotion readiness smoke');
    expect(taskFiles?.evidence.join(' ')).toContain('read-only build-gated harness with stale-build detection');
    expect(taskFiles?.evidence.join(' ')).toContain('missing_apply_metadata at 10/12 requirements');
    expect(taskFiles?.evidence.join(' ')).toContain('ready at 12/12 requirements');
    expect(taskFiles?.evidence.join(' ')).toContain('unsafe expected files stay blocked');
    expect(taskFiles?.evidence.join(' ')).toContain('workspace_write capability steps now require patch artifact');
    expect(taskFiles?.evidence.join(' ')).toContain('Terminal Run verification now carries same-run artifacts and checkpoints');
    expect(taskFiles?.evidence.join(' ')).toContain('can satisfy workspace_write promotion evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('evaluateRuntimePatchPromotionRoutingReadiness');
    expect(taskFiles?.evidence.join(' ')).toContain('evaluateRuntimePatchPromotionRoutingReadinessFromEvidence');
    expect(taskFiles?.evidence.join(' ')).toContain('structured service evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('artifact evidence chain');
    expect(taskFiles?.evidence.join(' ')).toContain('checkpoint evidence chain');
    expect(taskFiles?.evidence.join(' ')).toContain('target-task identity as an evidence chain');
    expect(taskFiles?.evidence.join(' ')).toContain('targetTaskId, patchArtifact.taskId, promotionDecision.taskId, promotionPreflight.taskId, and postApplyRunEvidence.taskId must all match');
    expect(taskFiles?.evidence.join(' ')).toContain('promotion Decision checkpoint and promotion preflight checkpoint as one checkpointEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('patch artifact, promotion Decision artifact, and promotion preflight artifact as one artifactEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('approved promotion Decision artifact to match the reviewed patch artifact');
    expect(taskFiles?.evidence.join(' ')).toContain('cannot appear as a satisfied promotion Decision');
    expect(taskFiles?.evidence.join(' ')).toContain('explicit operator apply as an operatorApplyEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('same target task, same run, and same checkpoint');
    expect(taskFiles?.evidence.join(' ')).toContain('same_run_evidence_chain missing when explicit operator apply is absent or diverges');
    expect(taskFiles?.evidence.join(' ')).toContain('expected patch files and post-apply touched files as one touchedFileEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('expected patch files and post-apply touched files as one filePathSafetyChain');
    expect(taskFiles?.evidence.join(' ')).toContain('unsafe workspace paths');
    expect(taskFiles?.evidence.join(' ')).toContain('normalize workspace-relative path separators before duplicate checks, touched-file matching, and workspace writes');
    expect(taskFiles?.evidence.join(' ')).toContain('equivalent slash/backslash paths and repeated-separator aliases cannot satisfy duplicate-free evidence as separate files');
    expect(taskFiles?.evidence.join(' ')).toContain('cannot write a separate alias-named file on POSIX');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeContract to carry the same run id and target task id');
    expect(taskFiles?.evidence.join(' ')).toContain('requires API runtime contracts to carry selectedRuntimeProvider identity');
    expect(taskFiles?.evidence.join(' ')).toContain('cannot be promoted from mode/layer/phase metadata alone');
    expect(taskFiles?.evidence.join(' ')).toContain('satisfied and missing requirement lists');
    expect(taskFiles?.evidence.join(' ')).toContain('promotionReady');
    expect(taskFiles?.evidence.join(' ')).toContain('promotionRequirements=x/8');
    expect(taskFiles?.evidence.join(' ')).toContain('promotionSatisfiedRequirements=...');
    expect(taskFiles?.evidence.join(' ')).toContain('missingRequirements=...');
    expect(taskFiles?.evidence.join(' ')).toContain('promotionMissingRequirements=...');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeRun');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeRunEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeTask');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeTaskEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeProvider');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeProviderEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('targetTaskEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('decisionArtifactEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('artifactEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('checkpointEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('operatorApplyEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('operatorId');
    expect(taskFiles?.evidence.join(' ')).toContain('operatorApplyTask');
    expect(taskFiles?.evidence.join(' ')).toContain('operatorApplyRun');
    expect(taskFiles?.evidence.join(' ')).toContain('operatorApplyCheckpoint');
    expect(taskFiles?.evidence.join(' ')).toContain('patchArtifactId');
    expect(taskFiles?.evidence.join(' ')).toContain('decisionArtifactId');
    expect(taskFiles?.evidence.join(' ')).toContain('preflightArtifactId');
    expect(taskFiles?.evidence.join(' ')).toContain('promotionDecisionId');
    expect(taskFiles?.evidence.join(' ')).toContain('patchRunId');
    expect(taskFiles?.evidence.join(' ')).toContain('decisionRunId');
    expect(taskFiles?.evidence.join(' ')).toContain('preflightRunId');
    expect(taskFiles?.evidence.join(' ')).toContain('postApplyRunId');
    expect(taskFiles?.evidence.join(' ')).toContain('sameRunId');
    expect(taskFiles?.evidence.join(' ')).toContain('expectedFileCount');
    expect(taskFiles?.evidence.join(' ')).toContain('expectedFiles');
    expect(taskFiles?.evidence.join(' ')).toContain('expectedFileEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('touchedFileCount');
    expect(taskFiles?.evidence.join(' ')).toContain('touchedFiles');
    expect(taskFiles?.evidence.join(' ')).toContain('filePathSafetyChain');
    expect(taskFiles?.evidence.join(' ')).toContain('touchedFileEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('expected file evidence to be safe and duplicate-free before patchArtifact can be ready');
    expect(taskFiles?.evidence.join(' ')).toContain('expected and touched file evidence to be duplicate-free');
    expect(taskFiles?.evidence.join(' ')).toContain('blocks duplicate patch file entries before writing workspace files');
    expect(taskFiles?.evidence.join(' ')).toContain('selected-runtime contract, target-task identity, same-run patch artifact, promotion Decision, promotion preflight, explicit operator apply, and post-apply Run evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('ConfigurationSafetyReport now exposes runtime patch promotion routing readiness');
    expect(taskFiles?.evidence.join(' ')).toContain('sandbox.patch_promotion diagnostic summary');
    expect(taskFiles?.evidence.join(' ')).toContain('settings and safety-report surfaces show the selected-runtime, target-task, same-run artifact');
    expect(taskFiles?.evidence.join(' ')).toContain('Settings configuration safety rows now render sandbox.patch_promotion evidence chips');
    expect(taskFiles?.evidence.join(' ')).toContain('promotionRequirements, promotionSatisfiedRequirements, promotionMissingRequirements, missingRequirements');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeRun, selectedRuntimeRunEvidenceChain, selectedRuntimeTask, selectedRuntimeTaskEvidenceChain, selectedRuntimeProvider, selectedRuntimeProviderEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('targetTaskIdentity, targetTaskEvidenceChain, checkpointEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('patchArtifactId, decisionArtifactId, preflightArtifactId, decisionArtifactEvidenceChain, artifactEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('operatorApplyTask, operatorApplyRun, operatorApplyCheckpoint, operatorApplyEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('promotionCheckpointId, preflightCheckpointId');
    expect(taskFiles?.evidence.join(' ')).toContain('patchArtifactTask, promotionDecisionTask, promotionPreflightTask, postApplyTask');
    expect(taskFiles?.evidence.join(' ')).toContain('patchRunId, decisionRunId, preflightRunId, postApplyRunId');
    expect(taskFiles?.evidence.join(' ')).toContain('patch promotion routing gaps and identity');
    expect(taskFiles?.evidence.join(' ')).toContain('runtime patch promotion routing readiness smoke');
    expect(taskFiles?.evidence.join(' ')).toContain('stale-build detection');
    expect(taskFiles?.evidence.join(' ')).toContain('blocked=2/8 requirements');
    expect(taskFiles?.evidence.join(' ')).toContain('same-run-blocked=7/8 requirements');
    expect(taskFiles?.evidence.join(' ')).toContain('service-evidence=2/8 requirements');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeRunEvidenceChain=missing');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeTaskEvidenceChain=missing');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeProvider=openai');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeProviderEvidenceChain=ready');
    expect(taskFiles?.evidence.join(' ')).toContain('patchArtifactId, decisionArtifactId, preflightArtifactId, decisionArtifactEvidenceChain, artifactEvidenceChain, promotionDecisionId');
    expect(taskFiles?.evidence.join(' ')).toContain('patchArtifactTask, promotionDecisionTask, promotionPreflightTask, targetTaskEvidenceChain, checkpointEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('selected_runtime_contract, target_task_identity, explicit_operator_apply, same_run_evidence_chain, and post_apply_run_evidence missing');
    expect(taskFiles?.evidence.join(' ')).toContain('synthetic-ready=8/8 requirements');
    expect(taskFiles?.evidence.join(' ')).toContain('SandboxPatchPromotionApplyService now appends evaluateRuntimePatchPromotionRoutingReadinessFromEvidence output');
    expect(taskFiles?.evidence.join(' ')).toContain('real workspace apply evidence records target-task identity across patch artifact, promotion Decision, preflight, and post-apply evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('explicit operator apply with same task/run/checkpoint evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('remaining selected-runtime-contract gap only when first-party run-step evidence is unavailable');
    expect(taskFiles?.evidence.join(' ')).toContain('resolves selectedRuntimeContract from first-party completed same-run RunStep evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('runtime=codex/claude steps become selected_runtime execution_run evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('Agent API promotion readiness steps become api_runtime execution_run evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeProviderEvidenceChain is ready with a concrete provider');
    expect(taskFiles?.evidence.join(' ')).toContain('instead of accepting renderer-supplied runtime identity');
    expect(taskFiles?.evidence.join(' ')).toContain('Decision-driven apply and explicit IPC apply both satisfy the operatorApplyEvidenceChain');
    expect(taskFiles?.evidence.join(' ')).toContain('preflight reports an already_applied promotion');
    expect(taskFiles?.evidence.join(' ')).toContain('idempotent apply responses aligned with applied audit evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('blocked by workspace drift or validation failure');
    expect(taskFiles?.evidence.join(' ')).toContain('missing post-apply evidence without writing workspace files');
    expect(taskFiles?.cliOnlyClosure).toBe('supported');
    expect(taskFiles?.gaps.join(' ')).toContain('Future API/runtime-generated patch promotion');
    expect(taskFiles?.nextActions.join(' ')).toContain('read-only sandbox patch promotion readiness smoke');
    expect(taskFiles?.nextActions.join(' ')).toContain('read-only runtime patch promotion routing smoke');
    expect(taskFiles?.gaps.join(' ')).toContain('selected-runtime contract');
    expect(taskFiles?.gaps.join(' ')).toContain('target-task identity');
    expect(taskFiles?.gaps.join(' ')).toContain('reviewed-patch apply workflow');
    expect(taskFiles?.gaps.join(' ')).toContain('same-run evidence chain');
    expect(taskFiles?.gaps.join(' ')).not.toContain('post-apply verification copy');
    expect(taskFiles?.gaps.join(' ')).not.toContain('blocked preflight recovery copy');
    expect(taskFiles?.nextActions.join(' ')).toContain('evaluateRuntimePatchPromotionRoutingReadiness');
    expect(taskFiles?.nextActions.join(' ')).toContain('evaluateRuntimePatchPromotionRoutingReadinessFromEvidence');
    expect(taskFiles?.gaps.join(' ')).not.toContain('packaged smoke and recovery UX');
    expect(taskFiles?.nextActions.join(' ')).toContain('product-controlled mutation path');
    expect(taskFiles?.nextActions.join(' ')).toContain('selected-runtime, target-task, same-run patch artifacts');
    expect(rightPanel?.gaps.join(' ')).not.toContain('still need an apply implementation');
    expect(rightPanel?.gaps.join(' ')).not.toContain('fully normal operator-facing apply workflow');
    expect(rightPanel?.gaps.join(' ')).not.toContain('post-apply status projection');
    expect(rightPanel?.gaps.join(' ')).not.toContain('broader packaged smoke and recovery UX');
    expect(rightPanel?.gaps.join(' ')).not.toContain('broader packaged UI smoke');
    expect(taskFiles?.gaps.join(' ')).not.toContain('Task-file and artifact Write Intent should be represented explicitly');
    expect(taskFiles?.gaps.join(' ')).not.toContain('Artifact Write Intent still needs a dedicated artifact proposal/apply plan');
    expect(decisions?.evidence.join(' ')).toContain('user-confirmed Decision, blocker, next-step, and completion proposal cards');
    expect(decisions?.evidence.join(' ')).toContain('task, decision, and task-file services');
    expect(decisions?.evidence.join(' ')).toContain('Task Dynamics can approve Run-detail structured Write Intent');
    expect(decisions?.evidence.join(' ')).toContain('without IPC or scheduler triggers');
    expect(decisions?.gaps.join(' ')).not.toContain('proposal cards need unified right-panel handling');
    expect(decisions?.gaps.join(' ')).not.toContain('still need to call it through main-side ports');
    expect(decisions?.gaps.join(' ')).not.toContain('non-UI operator approval surfaces are still missing');
    expect(capabilities?.evidence.join(' ')).toContain('adapter-level native capability declarations');
    expect(capabilities?.evidence.join(' ')).toContain('provider help output');
    expect(capabilities?.evidence.join(' ')).toContain('compact/clear context affordances');
    expect(capabilities?.evidence.join(' ')).toContain('adapter capability support');
    expect(capabilities?.evidence.join(' ')).toContain('non-empty configured hook commands or hook entries');
    expect(capabilities?.evidence.join(' ')).toContain('empty .claude/settings hook placeholders no longer count as hook readiness');
    expect(capabilities?.evidence.join(' ')).toContain('usable .claude/agents/*.md files');
    expect(capabilities?.evidence.join(' ')).toContain('placeholder directories, empty files, or placeholder-only files no longer count as subagent readiness');
    expect(capabilities?.evidence.join(' ')).toContain('.codex/config.* and .claude/settings*.json');
    expect(capabilities?.evidence.join(' ')).toContain('usable agent markdown with a heading or metadata');
    expect(capabilities?.evidence.join(' ')).toContain('provider-owned package.json capability/tool declarations');
    expect(capabilities?.evidence.join(' ')).toContain('ignoring arbitrary wrapper packages');
    expect(capabilities?.evidence.join(' ')).toContain('auth-gates native web/search capability promotion');
    expect(capabilities?.evidence.join(' ')).toContain('installed-but-not-logged-in runtime');
    expect(capabilities?.evidence.join(' ')).toContain('selected Agent CLI native web/search readiness');
    expect(capabilities?.evidence.join(' ')).toContain('CapabilitySafetyStrip for agent_cli.runtimes');
    expect(capabilities?.evidence.join(' ')).toContain('safe-read-only probe policy');
    expect(capabilities?.evidence.join(' ')).toContain('CapabilitySafetyStrip for agent_api.runtime');
    expect(capabilities?.evidence.join(' ')).toContain('deferred execution_run boundary');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunPromotionReady=no');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunPromotionRequirements=0/11');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunGateRequirements=0/9');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunPromotionSatisfiedRequirements=none');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunMissingRequirements=...');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunPromotionMissingRequirements=...');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunPromotionSatisfiedGates=none');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunPromotionMissingGates=...');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunMissingGates=...');
    expect(capabilities?.evidence.join(' ')).toContain('decompositionPromotionReady=no');
    expect(capabilities?.evidence.join(' ')).toContain('decompositionPromotionRequirements=0/7');
    expect(capabilities?.evidence.join(' ')).toContain('decompositionPromotionSatisfiedRequirements=none');
    expect(capabilities?.evidence.join(' ')).toContain('decompositionMissingRequirements=...');
    expect(capabilities?.evidence.join(' ')).toContain('decompositionPromotionMissingRequirements=...');
    expect(capabilities?.evidence.join(' ')).toContain('providerToolReadiness=not_declared');
    expect(capabilities?.evidence.join(' ')).toContain('providerToolStatus=blocked|not_declared|declared');
    expect(capabilities?.evidence.join(' ')).toContain('selectedApiRuntime');
    expect(capabilities?.evidence.join(' ')).toContain('providerConfigured');
    expect(capabilities?.evidence.join(' ')).toContain('configuredProvider');
    expect(capabilities?.evidence.join(' ')).toContain('providerOwnedMetadata');
    expect(capabilities?.evidence.join(' ')).toContain('providerMetadataMatchesSelected');
    expect(capabilities?.evidence.join(' ')).toContain('explicitToolDeclaration');
    expect(capabilities?.evidence.join(' ')).toContain('explicitToolDeclarationPackage');
    expect(capabilities?.evidence.join(' ')).toContain('explicitToolDeclarationPackageMatchesMetadata');
    expect(capabilities?.evidence.join(' ')).toContain('startupProbe=never');
    expect(capabilities?.evidence.join(' ')).toContain('generic unknown-provider metadata');
    expect(capabilities?.evidence.join(' ')).toContain('mismatched provider metadata');
    expect(capabilities?.evidence.join(' ')).toContain('mismatched declaration package identity');
    expect(capabilities?.evidence.join(' ')).toContain('provider tool/search readiness is not implied');
    expect(capabilities?.evidence.join(' ')).toContain('Agent API execution_run readiness chips');
    expect(capabilities?.evidence.join(' ')).toContain('promotion ready state');
    expect(capabilities?.evidence.join(' ')).toContain('promotion satisfied requirement list');
    expect(capabilities?.evidence.join(' ')).toContain('promotion missing requirement list');
    expect(capabilities?.evidence.join(' ')).toContain('gate requirement count');
    expect(capabilities?.evidence.join(' ')).toContain('promotion satisfied gate list');
    expect(capabilities?.evidence.join(' ')).toContain('promotion missing gate list');
    expect(capabilities?.evidence.join(' ')).toContain('key gate count');
    expect(capabilities?.evidence.join(' ')).toContain('key gate list');
    expect(capabilities?.evidence.join(' ')).toContain('missing gate count');
    expect(capabilities?.evidence.join(' ')).toContain('missing requirement list');
    expect(capabilities?.evidence.join(' ')).toContain('missing gate list');
    expect(capabilities?.evidence.join(' ')).toContain('Agent API decomposition readiness chips');
    expect(capabilities?.evidence.join(' ')).toContain('promotion ready state');
    expect(capabilities?.evidence.join(' ')).toContain('promotion satisfied requirement list');
    expect(capabilities?.evidence.join(' ')).toContain('missing requirement list visible');
    expect(capabilities?.evidence.join(' ')).toContain('promotion missing requirement list visible');
    expect(capabilities?.evidence.join(' ')).toContain('Agent API provider tool readiness, providerToolStatus, providerToolRequirements, providerToolMissingRequirements');
    expect(capabilities?.evidence.join(' ')).toContain('providerToolStatus');
    expect(capabilities?.evidence.join(' ')).toContain('evaluateAgentApiProviderToolReadinessFromEvidence');
    expect(capabilities?.evidence.join(' ')).toContain('structured service evidence');
    expect(capabilities?.evidence.join(' ')).toContain('requires unknown-provider metadata to identify the configured provider by exact owner, package scope, package basename, or package basename prefix rather than a loose substring match');
    expect(capabilities?.evidence.join(' ')).toContain('OpenAI Responses web_search_preview legacy tool declarations');
    expect(capabilities?.evidence.join(' ')).toContain('CapabilityRegistry now derives Agent API Runtime providerToolReadiness');
    expect(capabilities?.evidence.join(' ')).toContain('keeps selected Agent API Runtime disabled when provider identity is missing');
    expect(capabilities?.evidence.join(' ')).toContain('no-start local provider package metadata for @ai-sdk/openai and @ai-sdk/anthropic');
    expect(capabilities?.evidence.join(' ')).toMatch(/providerToolStatus[\s\S]*providerToolRequirements[\s\S]*providerToolMissingRequirements[\s\S]*selectedApiRuntime[\s\S]*providerConfigured[\s\S]*configuredProvider[\s\S]*selectedRuntimeProvider[\s\S]*selectedRuntimeProviderEvidenceChain[\s\S]*providerOwnedMetadata[\s\S]*providerMetadataMatchesSelected[\s\S]*providerMetadataOwner[\s\S]*providerMetadataPackage[\s\S]*explicitToolDeclaration[\s\S]*explicitToolDeclarationSource[\s\S]*explicitToolDeclarationPackage[\s\S]*explicitToolDeclarationPackageMatchesMetadata[\s\S]*declaredToolCount[\s\S]*declaredWebSearchToolCount[\s\S]*declaredWebSearchTools[\s\S]*trustedWebSearchToolCount[\s\S]*trustedWebSearchTools[\s\S]*untrustedWebSearchToolCount[\s\S]*untrustedWebSearchTools/);
    expect(capabilities?.evidence.join(' ')).toContain('provider-owned package declarations');
    expect(capabilities?.evidence.join(' ')).toContain('web/search-specific declarations');
    expect(capabilities?.evidence.join(' ')).toContain('trusted provider-owned web/search declarations');
    expect(capabilities?.evidence.join(' ')).toContain('raw-but-untrusted declarations');
    expect(capabilities?.evidence.join(' ')).toContain('Agent API provider tool readiness smoke');
    expect(capabilities?.evidence.join(' ')).toContain('providerToolStatus=not_declared');
    expect(capabilities?.evidence.join(' ')).toContain('providerToolRequirements=4/5');
    expect(capabilities?.evidence.join(' ')).toContain('providerToolMissingRequirements=explicit_tool_declaration');
    expect(capabilities?.evidence.join(' ')).toContain('configuredProvider=openai');
    expect(capabilities?.evidence.join(' ')).toContain('providerMetadataMatchesSelected=yes');
    expect(capabilities?.evidence.join(' ')).toContain('providerMetadataPackage=@ai-sdk/openai');
    expect(capabilities?.evidence.join(' ')).toContain('explicitToolDeclarationPackage=@ai-sdk/openai');
    expect(capabilities?.evidence.join(' ')).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
    expect(capabilities?.evidence.join(' ')).toMatch(/declaredWebSearchToolCount=0[\s\S]*declaredWebSearchTools=none[\s\S]*trustedWebSearchToolCount=0[\s\S]*trustedWebSearchTools=none/);
    expect(capabilities?.evidence.join(' ')).toMatch(/untrustedWebSearchToolCount=0[\s\S]*untrustedWebSearchTools=none/);
    expect(capabilities?.evidence.join(' ')).toContain('service-evidence=4/5 requirements');
    expect(capabilities?.evidence.join(' ')).toContain('explicit_tool_declaration missing');
    expect(capabilities?.evidence.join(' ')).toContain('genericHelperTrustedWebSearchToolCount=0');
    expect(capabilities?.evidence.join(' ')).toContain('genericHelperUntrustedWebSearchToolCount=0');
    expect(capabilities?.evidence.join(' ')).toContain('legacyPreviewProviderToolStatus=declared');
    expect(capabilities?.evidence.join(' ')).toContain('legacyPreviewDeclaredWebSearchTools=web_search_preview');
    expect(capabilities?.evidence.join(' ')).toContain('web_search_cache remains excluded');
    expect(capabilities?.evidence.join(' ')).toContain('runtimeExecutable=no');
    expect(capabilities?.evidence.join(' ')).toContain('provider=not-called');
    expect(capabilities?.evidence.join(' ')).toContain('network=not-called');
    expect(capabilities?.evidence.join(' ')).toContain('per-runtime capability chips');
    expect(capabilities?.evidence.join(' ')).toContain('visible native search, hook, and subagent readiness labels');
    expect(capabilities?.evidence.join(' ')).toContain('native CLI prompts');
    expect(capabilities?.evidence.join(' ')).toContain('native goal forwarding readiness summary and missing evidence');
    expect(capabilities?.evidence.join(' ')).toContain('nativeGoalReady');
    expect(capabilities?.evidence.join(' ')).toContain('requirements=x/8');
    expect(capabilities?.evidence.join(' ')).toContain('missingEvidence=...');
    expect(capabilities?.evidence.join(' ')).toContain('requires the selected adapter to declare native goal capability');
    expect(capabilities?.evidence.join(' ')).toContain('taskplaneGoalLoop=available');
    expect(capabilities?.evidence.join(' ')).toContain('skipReason=opt_in_required');
    expect(capabilities?.evidence.join(' ')).toContain('continueWith=taskplane_goal_loop');
    expect(capabilities?.evidence.join(' ')).toContain('native goal forwarding readiness smoke');
    expect(capabilities?.evidence.join(' ')).toContain('adapter capability missing');
    expect(capabilities?.evidence.join(' ')).toContain('ready_to_open_passthrough');
    expect(capabilities?.evidence.join(' ')).toContain('requirements=3/8');
    expect(capabilities?.evidence.join(' ')).toContain('requirements=4/8');
    expect(capabilities?.evidence.join(' ')).toContain('requirements=8/8');
    expect(capabilities?.evidence.join(' ')).toContain('Provider-native and Gmail connector preflights now report skipReason=config_missing');
    expect(capabilities?.evidence.join(' ')).toContain('before any provider, Gmail, task-memory, or workspace effect is allowed');
    expect(capabilities?.evidence.join(' ')).toContain('runtime-neutral capability progress states');
    expect(capabilities?.evidence.join(' ')).toContain('Native CLI capability-tagged web/search events');
    expect(capabilities?.evidence.join(' ')).toContain('fallback copy now uses the selected runtime native web/search readiness');
    expect(capabilities?.evidence.join(' ')).toContain('unverified native search');
    expect(capabilities?.evidence.join(' ')).toContain('Source Context batch id and persisted source_context_ids');
    expect(capabilities?.evidence.join(' ')).toContain('renderer progress surfaces those evidence ids');
    expect(capabilities?.evidence.join(' ')).toContain('manual Agent CLI native web/search smoke');
    expect(capabilities?.evidence.join(' ')).toContain('cli=not-called, network=not-called, and workspace=unchanged');
    expect(capabilities?.evidence.join(' ')).toContain('Codex CLI 0.125.0 passed the opt-in native web/search smoke on 2026-05-27');
    expect(capabilities?.evidence.join(' ')).toContain('--search is a top-level Codex option before exec');
    expect(capabilities?.gaps.join(' ')).not.toContain('first web/search mapping');
    expect(capabilities?.gaps.join(' ')).not.toContain('provider-owned declarations');
    expect(capabilities?.gaps.join(' ')).not.toContain('compact/clear readiness checks');
    expect(capabilities?.gaps.join(' ')).not.toContain('hook config semantics');
    expect(capabilities?.gaps.join(' ')).not.toContain('richer hook/subagent semantics beyond current non-empty workspace metadata checks');
    expect(capabilities?.gaps.join(' ')).toContain('provider-owned package metadata checks');
    expect(capabilities?.gaps.join(' ')).toContain('Agent API no-start provider tool/search non-declaration');
    expect(capabilities?.gaps.join(' ')).toContain('now-recorded Codex opt-in live smoke evidence');
    expect(capabilities?.gaps.join(' ')).not.toContain('and one Codex opt-in live smoke pass');
    expect(capabilities?.gaps.join(' ')).toContain('auth-gated no-start help-output');
    expect(capabilities?.gaps.join(' ')).toContain('no longer blocks the Codex-verified CLI-first capability path');
    expect(capabilities?.nextActions.join(' ')).toContain('opportunistically when local account support is available');
    expect(capabilities?.nextActions.join(' ')).toContain('not as a CLI-first blocker');
    expect(capabilities?.nextActions.join(' ')).toContain('stable non-executing metadata');
    expect(capabilities?.nextActions.join(' ')).toContain('evaluateAgentApiProviderToolReadinessFromEvidence');
    expect(capabilities?.nextActions.join(' ')).toContain('read-only Agent API provider tool readiness smoke');
    expect(capabilities?.nextActions.join(' ')).toContain('read-only native goal forwarding readiness smoke');
    expect(capabilities?.cliOnlyClosure).toBe('supported');
    expect(capabilities?.futureApiClosure).toBe('partial');
    expect(workHabits?.evidence.join(' ')).toContain('diagnostic-only for automatic starts');
    expect(workHabits?.evidence.join(' ')).toContain('automatic-start boundary');
    expect(workHabits?.gaps.join(' ')).not.toContain('connected trigger service before L2 automatic native runtime starts');
    expect(workHabits?.nextActions.join(' ')).toContain('supported CLI-first packaged path');
    expect(workHabits?.nextActions.join(' ')).toContain('terminal-evidence');
    expect(smoke?.evidence.join(' ')).toContain('Claude Code mode');
    expect(smoke?.evidence.join(' ')).toContain('TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude');
    expect(smoke?.evidence.join(' ')).toContain('accountReadiness=not-checked');
    expect(smoke?.evidence.join(' ')).toContain('manualEvidence=not-recorded');
    expect(smoke?.evidence.join(' ')).toContain('smoke:agent-cli-web-research');
    expect(smoke?.evidence.join(' ')).toContain('mocked OpenAI web_search output');
    expect(smoke?.evidence.join(' ')).toContain('without external network or provider calls');
    expect(smoke?.evidence.join(' ')).toContain('manual Agent CLI native web/search smoke');
    expect(smoke?.evidence.join(' ')).toContain('skipReason=opt_in_required');
    expect(smoke?.evidence.join(' ')).toContain('network=not-called');
    expect(smoke?.evidence.join(' ')).toContain('Codex native web/search smoke passed locally on 2026-05-27');
    expect(smoke?.evidence.join(' ')).toContain('status=passed');
    expect(smoke?.evidence.join(' ')).toContain('Scheduler stale-run recovery now records lastRunSweepSummary');
    expect(smoke?.evidence.join(' ')).toContain('Brief surfaces that recovery summary as a run-recovery status chip');
    expect(smoke?.evidence.join(' ')).toContain('agentRuntimeStarted=no');
    expect(smoke?.evidence.join(' ')).toContain('Claude Code 2.1.144 stream-json execution now uses --verbose');
    expect(smoke?.evidence.join(' ')).toContain('optional secondary adapter compatibility evidence');
    expect(smoke?.evidence.join(' ')).toContain('must not block Codex CLI, Agent API, scheduled/event, or writeback acceptance progress');
    expect(smoke?.gaps.join(' ')).toContain('not a mainline product-completion blocker');
    expect(smoke?.nextActions.join(' ')).toContain('Continue non-Claude runtime and recovery coverage first');
    expect(smoke?.evidence.join(' ')).toContain('401 authentication_failed');
    expect(smoke?.gaps.join(' ')).toContain('manual opt-in packaged harness');
  });

  it('records operator-started scheduled/event runtime-start blocked Decision proposal coverage', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');

    expect(decisions?.evidence.join(' ')).toContain('Operator-started scheduled/event Agent triggers now reuse scheduler runtime-start blocked review policies');
    expect(decisions?.evidence.join(' ')).toContain('automation-readiness gaps');
    expect(decisions?.evidence.join(' ')).toContain('missing/invalid run-limit accounting evidence');
    expect(decisions?.evidence.join(' ')).toContain('disconnected trigger-service blocks through SchedulerService.proposeSchedulerDecision');
    expect(decisions?.evidence.join(' ')).toContain('deduplicated Standing Approval authorized triggerServiceDecisionProposal');
  });

  it('records background trigger-service disconnected scheduler Decision proposal coverage', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');
    const workHabits = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'work_habits_settings_scheduled');

    expect(decisions?.evidence.join(' ')).toContain('background sweeps with Task Source and Task Dynamics timeline connected but the Run trigger service disconnected');
    expect(decisions?.evidence.join(' ')).toContain('trigger-service-disconnected Decision proposals');
    expect(decisions?.evidence.join(' ')).toContain('keep triggerRunEvidenceStatus=not_started without starting a runtime');
    expect(workHabits?.evidence.join(' ')).toContain('triggerServiceDisconnectedDecisionProposalEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('triggerServiceDisconnectedNoTriggerEvidence=passed');
  });

  it('records near-duplicate subtask title blocking for decomposition promotion readiness', () => {
    const decomposition = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition');

    expect(decomposition?.evidence.join(' ')).toContain('near-duplicate subtask titles cannot satisfy duplicate-free promotion readiness');
  });

  it('records empty create-many title evidence blocking for decomposition promotion readiness', () => {
    const decomposition = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition');
    const evidence = decomposition?.evidence.join(' ');

    expect(evidence).toContain('applyPlanSubtaskTitleEvidenceChain and proposalSubtaskTitleEvidenceChain missing for empty create-many apply plans');
    expect(evidence).toContain('generic and service-evidence evaluators');
    expect(evidence).toContain('zero-subtask draft cannot report title evidence as ready');
  });

  it('records decomposition selected-runtime provider identity evidence', () => {
    const decomposition = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition');
    const evidence = decomposition?.evidence.join(' ');

    expect(evidence).toContain('same evidenceRunId, parentTaskId, and provider identity');
    expect(evidence).toContain('configured provider evidence separate from selected-runtime provider identity');
    expect(evidence).toContain('configuredProvider evidence is stitched from another provider');
    expect(evidence).toContain('selectedRuntimeProvider, selectedRuntimeProviderEvidenceChain');
    expect(evidence).toContain('providerConfigured');
    expect(evidence).toContain('configuredProviderEvidenceChain');
    expect(evidence).toContain('timelineRuntimeProvider');
    expect(evidence).toContain('selectedRuntimeProviderEvidenceChain can become ready');
  });

  it('records Agent API provider namespaced tool readiness coverage', () => {
    const capabilities = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'capabilities_external_skills_mcp');

    expect(capabilities?.evidence.join(' ')).toContain('colon/dot/slash provider-namespaced web_search/web_fetch declarations');
    expect(capabilities?.evidence.join(' ')).toContain('colon, dot, or slash provider-namespace mismatches');
  });

  it('records mandatory Agent API selected-runtime provider identity evidence', () => {
    const capabilities = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'capabilities_external_skills_mcp');
    const evidence = capabilities?.evidence.join(' ');

    expect(evidence).toContain('requires nonempty selected-runtime provider identity to match configured provider identity before satisfying selected_api_runtime');
    expect(evidence).toContain('missing or mismatched selected-runtime provider identity');
  });

  it('records deduplicated Agent API provider tool declaration evidence', () => {
    const capabilities = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'capabilities_external_skills_mcp');

    expect(capabilities?.evidence.join(' ')).toContain('case-insensitive and separator-normalized deduplication');
    expect(capabilities?.evidence.join(' ')).toContain('without overstating duplicate tool evidence');
    expect(capabilities?.evidence.join(' ')).toContain('colon/dot/slash provider namespace aliases');
    expect(capabilities?.evidence.join(' ')).toContain('untrustedWebSearchToolCount');
    expect(capabilities?.evidence.join(' ')).toContain('raw-but-untrusted declarations');
  });

  it('records Agent API provider generic helper negative readiness coverage', () => {
    const capabilities = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'capabilities_external_skills_mcp');

    expect(capabilities?.evidence.join(' ')).toContain('generic-helper service evidence remains genericHelperProviderToolStatus=not_declared');
    expect(capabilities?.evidence.join(' ')).toContain('genericHelperDeclaredWebSearchToolCount=0');
    expect(capabilities?.evidence.join(' ')).toContain('browser.search/search.web_fetch/task_browser/vendor:browse/web_search_cache-style helpers');
  });

  it('records provider-native session payload identity gating', () => {
    const capabilities = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'capabilities_external_skills_mcp');

    expect(capabilities?.evidence.join(' ')).toContain('Provider-native agent session gates now require both provider-native payload provider identity and normalized plan provider identity');
    expect(capabilities?.evidence.join(' ')).toContain('plus nonempty providerCallIds identity evidence');
    expect(capabilities?.evidence.join(' ')).toContain('hand-shaped proposal without provider tool-call identity evidence cannot cross the provider-native session boundary');
  });

  it('records exact Agent API execution Write Intent action identity coverage', () => {
    const rightPanel = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'right_panel_agent_run');

    expect(rightPanel?.evidence.join(' ')).toContain('requires write_intent_extraction to either include exactly one artifact.propose and exactly one task_file.propose with persisted same-run and target-task identity evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('explicit noWorkspaceWriteRequired/not_required evidence for no-patch runs');
    expect(rightPanel?.evidence.join(' ')).toContain('source_context.create as a reviewable non-workspace Write Intent');
    expect(rightPanel?.evidence.join(' ')).toContain('source-context-only runs can satisfy write_intent_extraction');
    expect(rightPanel?.evidence.join(' ')).toContain('noWorkspaceWriteRequired=yes plus patchPromotionStatus=not_required');
    expect(rightPanel?.evidence.join(' ')).toContain('writeIntentMode');
    expect(rightPanel?.evidence.join(' ')).toContain('writeIntentSupportedActionCount');
    expect(rightPanel?.evidence.join(' ')).toContain('writeIntentDeclaredActionCount');
    expect(rightPanel?.evidence.join(' ')).toContain('noWriteIntentRequired');
    expect(rightPanel?.evidence.join(' ')).toContain('noWorkspaceWriteRequired');
    expect(rightPanel?.evidence.join(' ')).toContain('noWriteRequired=11/11 requirements and 9/9 gates');
    expect(rightPanel?.evidence.join(' ')).toContain('writeIntentMode=no_write_intents_required');
    expect(rightPanel?.evidence.join(' ')).toContain('patchPromotionStatus=not_required');
    expect(rightPanel?.evidence.join(' ')).toContain('duplicate, missing, or non-proposal write actions still blocked');
    expect(rightPanel?.evidence.join(' ')).toContain('writeIntentActionIdentityChain, writeIntentActionBoundary');
  });

  it('records Agent API execution subtask-start gate evidence coverage', () => {
    const rightPanel = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'right_panel_agent_run');
    const evidence = rightPanel?.evidence.join(' ');

    expect(evidence).toContain('requires task_memory_coverage to carry target-task memory coverage evidence instead of a naked gate boolean');
    expect(evidence).toContain('selected_runtime_contract to carry same-run, target-task, and selected-provider identity evidence');
    expect(evidence).toContain('provider_visible_preflight configured provider identity to match the selected runtime provider');
    expect(evidence).toContain('requires simplicity_check to carry the target-task smallest movement evidence');
    expect(evidence).toContain('requires runtime_action to carry run_start/run service evidence tied to the selected run and target task');
    expect(evidence).toContain('requires subtask_start to carry target-task readiness evidence instead of a naked gate boolean');
    expect(evidence).toContain('simplicity_check, runtime_action, runtime_context_assembly, context_readiness');
    expect(evidence).toContain('task_memory_coverage, task_memory_guidance, pre_step, subtask_start');
    expect(evidence).toContain('post_step gates to their matching service-evidence chains');
    expect(evidence).toContain('simplicityCheck, simplicityCheckTask, simplicityCheckSmallestMovement, simplicityCheckGateEvidenceChain');
    expect(evidence).toContain('selectedRuntimeProvider, selectedRuntimeProviderEvidenceChain');
    expect(evidence).toContain('runtimeAction, runtimeActionStatus, runtimeActionSurface, runtimeActionRun, runtimeActionRunIdentityChain, runtimeActionTask, runtimeActionGateEvidenceChain');
    expect(evidence).toContain('providerConfigured=ready, configuredProvider=openai, selectedRuntimeProvider=openai, selectedRuntimeProviderEvidenceChain=ready, providerStartupProbe=not_called');
    expect(evidence).toContain('simplicityCheckGateEvidenceChain=ready');
    expect(evidence).toContain('runtimeActionGateEvidenceChain=ready');
    expect(evidence).toContain('taskMemoryGuidance=ready, taskMemoryGuidanceCount=0');
    expect(evidence).toContain('taskMemoryCoverage, taskMemoryCoverageTask, taskMemoryCoverageEvidenceChain, taskMemoryCoverageGateEvidenceChain');
    expect(evidence).toContain('taskMemoryCoverageGateEvidenceChain=ready');
    expect(evidence).toContain('runGoalConditions=1');
    expect(evidence).toContain('subtaskStart, subtaskStartTask, subtaskStartEvidenceChain, subtaskStartGateEvidenceChain');
    expect(evidence).toContain('subtaskStartGateEvidenceChain=ready');
  });

  it('records Agent API execution configured provider evidence-chain coverage', () => {
    const rightPanel = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'right_panel_agent_run');
    const evidence = rightPanel?.evidence.join(' ');

    expect(evidence).toContain('configuredProviderEvidenceChain');
    expect(evidence).toContain('providerConfigured=true is visible as configuration evidence only');
    expect(evidence).toContain('provider-visible preflight still requires matching selected-runtime provider identity');
  });

  it('records real no-write API RunService promotion evidence', () => {
    const rightPanel = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'right_panel_agent_run');
    const evidence = rightPanel?.evidence.join(' ');

    expect(evidence).toContain('derives no-write completion evidence from real RunService output');
    expect(evidence).toContain('no parsed structured Write Intent actions, and no same-run sandbox patch promotions');
    expect(evidence).toContain('without requiring a fake patch');
    expect(evidence).toContain('derives a default Run Goal Contract completion condition from run instructions, next step, or task summary');
    expect(evidence).toContain('runGoalConditions=1 can be backed by a concrete run objective');
    expect(evidence).toContain('instead of leaving run_goal_contract missing');
  });

  it('records selected-runtime identity evidence for runtime patch promotion routing', () => {
    const taskFiles = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_files_artifacts_local_writes');

    expect(taskFiles?.evidence.join(' ')).toContain('selectedRuntimeContract stays missing when the selected runtime run id, target task identity, or API provider identity diverges');
    expect(taskFiles?.evidence.join(' ')).toContain('API provider identity diverges or is absent');
    expect(taskFiles?.evidence.join(' ')).toContain('first-party completed same-run RunStep evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('only when the step belongs to the promotion run');
  });

  it('records operator-facing reviewed patch apply file-count evidence', () => {
    const taskFiles = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_files_artifacts_local_writes');
    const evidence = taskFiles?.evidence.join(' ');

    expect(evidence).toContain('expectedFileCount, touchedFileCount, and filesMatched');
    expect(evidence).toContain('applied and already-applied audit summaries');
    expect(evidence).toContain('touched files match the reviewed patch file set');
  });

  it('records post-apply file-set match evidence for runtime patch promotion routing', () => {
    const taskFiles = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_files_artifacts_local_writes');
    const evidence = taskFiles?.evidence.join(' ');

    expect(evidence).toContain('postApplyFilesMatched=yes/no');
    expect(evidence).toContain('post-apply file-set match directly');
    expect(evidence).toContain('postApplyFilesMatched, filePathSafetyChain');
    expect(evidence).toContain('postApplyFilesMatched=no');
  });

  it('records structured unsaved web research evidence coverage', () => {
    const capabilities = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'capabilities_external_skills_mcp');
    const evidence = capabilities?.evidence.join(' ');

    expect(evidence).toContain('attempted_sources, failed_sources, and the Source Context batch id');
    expect(evidence).toContain('renderer progress surfaces the attempted/failed counts');
    expect(evidence).toContain('unsaved research evidence remains structured and auditable');
  });

  it('records repeated-separator alias protection for runtime patch promotion routing', () => {
    const taskFiles = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_files_artifacts_local_writes');
    const evidence = taskFiles?.evidence.join(' ');

    expect(evidence).toContain('slash/backslash paths and repeated-separator aliases');
    expect(evidence).toContain('cannot satisfy duplicate-free evidence as separate files');
    expect(evidence).toContain('cannot write a separate alias-named file on POSIX');
    expect(evidence).toContain('blocks symlink-backed workspace patch targets');
    expect(evidence).toContain('cannot follow a workspace symlink outside the configured workspace root');
    expect(evidence).toContain('recording blocked routing evidence instead of post-apply evidence');
  });

  it('records blocked apply evidence for malformed patch promotion metadata', () => {
    const taskFiles = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_files_artifacts_local_writes');

    expect(taskFiles?.evidence.join(' ')).toContain('blocks unsafe or duplicate expected-file promotion metadata');
    expect(taskFiles?.evidence.join(' ')).toContain('malformed reviewed patch diffs before writing workspace files');
    expect(taskFiles?.evidence.join(' ')).toContain('instead of throwing out of the operator-facing apply path');
    expect(taskFiles?.evidence.join(' ')).toContain('ready preflight reaches invalid reviewed-patch artifact JSON');
    expect(taskFiles?.evidence.join(' ')).toContain('records selected-runtime, preflight, explicit-operator, and missing post-apply evidence before blocking without workspace writes');
    expect(taskFiles?.evidence.join(' ')).toContain('marks durable promotion records blocked and appends runtime patch promotion routing readiness when promotion preflight itself fails before workspace validation');
    expect(taskFiles?.evidence.join(' ')).toContain('metadata divergence leaves selected-runtime and explicit-operator evidence plus missing target-task, preflight, same-run, and post-apply evidence');
  });

  it('records service-level operator confirmation coverage for patch-promotion apply', () => {
    const taskFiles = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_files_artifacts_local_writes');
    const evidence = taskFiles?.evidence.join(' ');

    expect(evidence).toContain('blocks before promotion preflight when explicit operator confirmation or operator identity is missing');
    expect(evidence).toContain('cannot write workspace files or mutate promotion records');
  });

  it('records missing terminal failure evidence in scheduler recovery proposals', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');

    expect(decisions?.evidence.join(' ')).toContain('failed terminal runs without reviewable output or failureReason');
    expect(decisions?.evidence.join(' ')).toContain('missing terminal failure evidence explicit');
    expect(decisions?.evidence.join(' ')).toContain('record missing failure evidence instead of seeing only a generic failed-run recovery card');
  });

  it('records missing terminal output provenance in scheduler review proposals', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');
    const evidence = decisions?.evidence.join(' ');

    expect(evidence).toContain('completed runs with output text but missing outputSource provenance');
    expect(evidence).toContain('terminalRunEvidenceStatus=pending');
    expect(evidence).toContain('does not silently treat unowned terminal output as review-ready evidence');
  });

  it('records normalized scheduler Decision proposal title dedupe coverage', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');

    expect(decisions?.evidence.join(' ')).toContain('normalizes proposal titles before matching');
    expect(decisions?.evidence.join(' ')).toContain('whitespace-varied duplicate history');
  });

  it('records duplicate-free scheduler Decision option coverage', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');

    expect(decisions?.evidence.join(' ')).toContain('nonblank duplicate-free option list');
    expect(decisions?.evidence.join(' ')).toContain('repeated choices');
    expect(decisions?.evidence.join(' ')).toContain('whitespace/case-equivalent duplicate choices');
  });

  it('records scheduler Decision approval queue payload validation coverage', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');

    expect(decisions?.evidence.join(' ')).toContain('valid Decision payload');
    expect(decisions?.evidence.join(' ')).toContain('decisionPayload, decisionTitle, decisionRationale, decisionOptions, decisionOptionIdentity, decisionProposedOutcome, decisionProposedOutcomeMatchesOption');
    expect(decisions?.evidence.join(' ')).toContain('blocked=0/4 requirements');
    expect(decisions?.evidence.join(' ')).toContain('operator-confirmed=4/4 requirements with operatorId and decisionPayload=ready evidence');
    expect(decisions?.evidence.join(' ')).toContain('local-recovery=4/4 requirements with decisionPayload=ready, localRecoveryRunId');
    expect(decisions?.evidence.join(' ')).toContain('standing-approval=4/4 requirements with standingApprovalPolicyId, standingApprovalScopeTask, and standingApprovalScopeMatched=yes evidence');
    expect(decisions?.evidence.join(' ')).toContain('scope-mismatch=3/4 requirements with authorization missing');
    expect(decisions?.evidence.join(' ')).toContain('service-evidence=3/4 requirements');
    expect(decisions?.evidence.join(' ')).toContain('decisionPayload=ready');
    expect(decisions?.evidence.join(' ')).toContain('Task Dynamics scheduler Decision proposal consumption now reuses shared decision_payload readiness');
    expect(decisions?.evidence.join(' ')).toContain('explicit payload targetTaskId plus timeline event taskId to both match the current task');
    expect(decisions?.evidence.join(' ')).toContain('SchedulerService proposalReadinessSummary evidence with proposalReady=yes');
    expect(decisions?.evidence.join(' ')).toContain('matching targetTask');
    expect(decisions?.evidence.join(' ')).toContain('duplicate-free option labels');
    expect(decisions?.evidence.join(' ')).toContain('cannot bypass the SchedulerService producer validation');
  });

  it('records scheduler Decision no-direct-side-effect approval evidence coverage', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');
    const evidence = decisions?.evidence.join(' ');

    expect(evidence).toContain('requires proposalReadinessSummary to preserve decisionPersistenceAllowed=false, writebackDispatchAllowed=false, and schedulerTriggerAllowed=false');
    expect(evidence).toContain('cannot enter the confirmation queue unless producer evidence explicitly keeps direct Decision persistence, direct writeback, and runtime triggering closed');
  });

  it('records scheduler Decision approval queue dedupe coverage', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');

    expect(decisions?.evidence.join(' ')).toContain('approval items now use evidenceRunId plus normalized title');
    expect(decisions?.evidence.join(' ')).toContain('collapse into one operator confirmation card');
    expect(decisions?.evidence.join(' ')).toContain('duplicating approval queue work');
  });

  it('records scheduler Decision source semantics coverage', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');

    expect(decisions?.evidence.join(' ')).toContain('approval plans now preserve evidence source semantics');
    expect(decisions?.evidence.join(' ')).toContain('proposals with evidenceRunId remain sourceType=run');
    expect(decisions?.evidence.join(' ')).toContain('no-Run scheduler proposals');
    expect(decisions?.evidence.join(' ')).toContain('sourceType=system');
  });

  it('records system-sourced scheduler Decision approval dedupe coverage', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');

    expect(decisions?.evidence.join(' ')).toContain('system-sourced scheduler Decision approval items now use target task plus normalized title');
    expect(decisions?.evidence.join(' ')).toContain('when evidenceRunId is absent');
    expect(decisions?.evidence.join(' ')).toContain('repeated no-Run policy-review timeline events');
  });

  it('records stable no-Run scheduler Decision durable source identity coverage', () => {
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');

    expect(decisions?.evidence.join(' ')).toContain('system-sourced scheduler Decision approval plans now use that same stable target-task-plus-title identity');
    expect(decisions?.evidence.join(' ')).toContain('durable Decision sourceId');
    expect(decisions?.evidence.join(' ')).toContain('suppresses later duplicate timeline proposals after refresh');
  });

  it('records explicit right-panel Agent API execution routing coverage', () => {
    const rightPanel = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'right_panel_agent_run');

    expect(rightPanel?.evidence.join(' ')).toContain('explicit selected Agent API execution requests');
    expect(rightPanel?.evidence.join(' ')).toContain('through Taskplane RunService triggerRun');
    expect(rightPanel?.evidence.join(' ')).toContain('pass the bounded Pilot decision snapshot into RunService');
    expect(rightPanel?.evidence.join(' ')).toContain('persist it in the Agent API execution promotion readiness step input');
    expect(rightPanel?.evidence.join(' ')).toContain('completed Agent API execution summaries now surface Agent API execution promotion readiness Run-step evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('missing requirement lists from slash-separated readiness summaries');
    expect(rightPanel?.evidence.join(' ')).toContain('noWorkspaceWriteRequired=yes readiness as an operator-visible no-workspace-write completion signal');
    expect(rightPanel?.evidence.join(' ')).toContain('prefer post-run promotion readiness over earlier pre-run readiness');
    expect(rightPanel?.evidence.join(' ')).toContain('final execution evidence is not masked by the initial readiness gate');
    expect(rightPanel?.evidence.join(' ')).toContain('normal API assistant behavior for ordinary task discussion');
    expect(rightPanel?.gaps.join(' ')).toContain('explicit right-panel execution requests can enter RunService');
    expect(rightPanel?.nextActions.join(' ')).toContain('expanding from explicit right-panel execution requests');
  });

  it('records Agent API execution terminal evidence summary coverage', () => {
    const rightPanel = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'right_panel_agent_run');
    const evidence = rightPanel?.evidence.join(' ');

    expect(evidence).toContain('terminalEvidenceSummary, terminalEvidenceSummaryChain');
    expect(evidence).toContain('terminalEvidenceSummary in post-run Agent API execution promotion evidence as output_chars or failure_reason_chars');
    expect(evidence).toContain('run_evidence_persistence remains missing when terminal evidence is marked present without that reviewable evidence summary');
    expect(evidence).toContain('postRunNoWriteback=9/11 requirements and 9/9 gates with terminalEvidenceSummary=output_chars=42');
  });

  it('records Agent API provider configured identity evidence-chain coverage', () => {
    const capabilities = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'capabilities_external_skills_mcp');
    const evidence = capabilities?.evidence.join(' ');

    expect(evidence).toContain('configuredProviderEvidenceChain');
    expect(evidence).toContain('mismatched configured-provider identity evidence');
    expect(evidence).toContain('configured provider identity evidence');
    expect(evidence).toContain('configuredProviderEvidenceChain=ready');
  });

  it('records right-panel Agent API decomposition routing coverage', () => {
    const decomposition = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition');

    expect(decomposition?.evidence.join(' '))
      .toContain('Right-panel Agent API decomposition requests now call the task-bound ai:decomposeProject adapter');
    expect(decomposition?.evidence.join(' '))
      .toContain('confirm through subtask.create_many TaskplaneWritebackApplyPlan with agent_api_decomposition source plus runtimeContract evidence');
    expect(decomposition?.evidence.join(' '))
      .toContain('Right-panel Agent API decomposition confirmation now re-evaluates evaluateAgentApiDecompositionPromotionReadinessFromEvidence');
    expect(decomposition?.evidence.join(' '))
      .toContain('missing runtime identity evidence blocks apply');
    expect(decomposition?.gaps.join(' '))
      .toContain('right-panel explicit decomposition request and Tasks project action');
    expect(decomposition?.nextActions.join(' '))
      .toContain('right-panel and Tasks confirmation on TaskplaneWritebackApplyPlan');
  });

  it('records Tasks project Agent API decomposition provider identity coverage', () => {
    const decomposition = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition');
    const evidence = decomposition?.evidence.join(' ');

    expect(evidence).toContain('preserve selectedRuntimeProvider identity in the runtime contract');
    expect(evidence).toContain('selectedRuntimeProviderEvidenceChain is not lost between draft generation and operator-confirmed subtask.create_many apply');
    expect(evidence).toContain('Tasks project decomposition draft readiness now projects selectedRuntimeProvider, selectedRuntimeProviderEvidenceChain, and timelineRuntimeProvider evidence chips');
  });
});
