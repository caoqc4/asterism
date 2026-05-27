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
    expect(rightPanel?.evidence.join(' ')).toContain('web research query');
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
    expect(rightPanel?.evidence.join(' ')).toContain('evaluateAgentApiExecutionPromotionReadinessForInvocation');
    expect(rightPanel?.evidence.join(' ')).toContain('matching service evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('derive deferred execution_run key gates from the future provider-visible execution contract');
    expect(rightPanel?.evidence.join(' ')).toContain('settings and safety reports expose context, task-memory, subtask-start, and post-step boundaries');
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
    expect(rightPanel?.gaps.join(' ')).toContain('Future Agent API execution remains deferred');
    expect(rightPanel?.nextActions.join(' ')).toContain('evaluateAgentApiExecutionPromotionReadiness reports ready');
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
    expect(decisions?.evidence.join(' ')).toContain('approval-item-only');
    expect(decisions?.evidence.join(' ')).toContain('target-task identity');
    expect(decisions?.evidence.join(' ')).toContain('decisionPersistenceAllowed=false');
    expect(decisions?.evidence.join(' ')).toContain('writebackDispatchAllowed=false');
    expect(decisions?.evidence.join(' ')).toContain('schedulerTriggerAllowed=false');
    expect(decisions?.evidence.join(' ')).toContain('satisfied and missing requirement lists');
    expect(decisions?.evidence.join(' ')).toContain('proposalReady');
    expect(decisions?.evidence.join(' ')).toContain('requirements=x/3');
    expect(decisions?.evidence.join(' ')).toContain('proposalRequirements=x/3');
    expect(decisions?.evidence.join(' ')).toContain('missingRequirements=...');
    expect(decisions?.evidence.join(' ')).toContain('proposalMissingRequirements=...');
    expect(decisions?.evidence.join(' ')).toContain('DecisionService.draft is registered as a task-bound decision_draft entrypoint');
    expect(decisions?.evidence.join(' ')).toContain('selected Agent CLI modes stay product_harness/skipped');
    expect(decisions?.evidence.join(' ')).toContain('Approved checkpoint Decision resume is limited to open tool_permission');
    expect(decisions?.evidence.join(' ')).toContain('cannot turn ordinary Decision approval into arbitrary tool execution');
    expect(decisions?.evidence.join(' ')).toContain('Decision actions in DecisionService and DecisionsPage pass through decision_action');
    expect(decisions?.cliOnlyClosure).toBe('supported');
    expect(decisions?.gaps.join(' ')).toContain('deferred proposal-only contract');
    expect(decisions?.nextActions.join(' ')).toContain('planSchedulerDecisionProposal');
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
    expect(workHabits?.evidence.join(' ')).toContain('scheduled_event_entrypoint remains missing');
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
    expect(workHabits?.evidence.join(' ')).toContain('planScheduledEventAgentTrigger');
    expect(workHabits?.evidence.join(' ')).toContain('shared scheduled/event trigger planner');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartAllowed=false');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartAllowed=true only when a dedicated trigger service is connected and daily run-limit count evidence is present');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartSatisfiedRequirements');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartMissingRequirements');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartReady');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartRequirements=x/3');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartMissingRequirements=...');
    expect(workHabits?.evidence.join(' ')).toContain('SchedulerService.diagnoseScheduledEventAgentTriggers');
    expect(workHabits?.evidence.join(' ')).toContain('no-start scheduler diagnostic entrypoint');
    expect(workHabits?.evidence.join(' ')).toContain('does not resolve runtime config');
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
    expect(workHabits?.evidence.join(' ')).toContain('Standing Approval policy id and scope');
    expect(workHabits?.evidence.join(' ')).toContain('runtime-start requirement evidence');
    expect(workHabits?.evidence.join(' ')).toContain('run-limit evidence');
    expect(workHabits?.evidence.join(' ')).toContain('post-step terminal-evidence guidance');
    expect(workHabits?.evidence.join(' ')).toContain('workspaceWriteAllowed=false proposal-only boundary');
    expect(workHabits?.evidence.join(' ')).toContain('scheduler:triggerScheduledEventAgentRun');
    expect(workHabits?.evidence.join(' ')).toContain('启动一次');
    expect(workHabits?.evidence.join(' ')).toContain('without enabling a background scheduler job');
    expect(workHabits?.evidence.join(' ')).toContain('terminalRunEvidenceStatus and triggerRunEvidenceStatus for the single-run operator action');
    expect(workHabits?.evidence.join(' ')).toContain('panel.scheduled_event_agent_triggered');
    expect(workHabits?.evidence.join(' ')).toContain('terminalRunEvidenceStatus');
    expect(workHabits?.evidence.join(' ')).toContain('triggerRunEvidenceStatus');
    expect(workHabits?.evidence.join(' ')).toContain('target task id');
    expect(workHabits?.evidence.join(' ')).toContain('Standing Approval policy id');
    expect(workHabits?.evidence.join(' ')).toContain('runtime-start satisfied/missing requirements');
    expect(workHabits?.evidence.join(' ')).toContain('workspaceWriteAllowed=false');
    expect(workHabits?.evidence.join(' ')).toContain('required trigger evidence');
    expect(workHabits?.evidence.join(' ')).toContain('triggerKind=manual|cron');
    expect(workHabits?.evidence.join(' ')).toContain('operator-started runs from background scheduler starts');
    expect(workHabits?.evidence.join(' ')).toContain('RuntimeEventRecord now formats panel.scheduled_event_agent_triggered');
    expect(workHabits?.evidence.join(' ')).toContain('readable Task Dynamics detail with run id');
    expect(workHabits?.evidence.join(' ')).toContain('target task id');
    expect(workHabits?.evidence.join(' ')).toContain('trigger plan summary');
    expect(workHabits?.evidence.join(' ')).toContain('runtime-start gate status');
    expect(workHabits?.evidence.join(' ')).toContain('trigger kind');
    expect(workHabits?.evidence.join(' ')).toContain('run-limit usage');
    expect(workHabits?.evidence.join(' ')).toContain('workspace proposal-mode write boundary');
    expect(workHabits?.evidence.join(' ')).toContain('runScheduledEventAgentTriggerSweep');
    expect(workHabits?.evidence.join(' ')).toContain('15-minute background scheduler job');
    expect(workHabits?.evidence.join(' ')).toContain('scheduledEventAgentSweepJobConnected');
    expect(workHabits?.evidence.join(' ')).toContain('lastScheduledEventAgentSweepSummary');
    expect(workHabits?.evidence.join(' ')).toContain('registered */15 scheduled/event Agent cron callback');
    expect(workHabits?.evidence.join(' ')).toContain('triggerKind=cron, operatorConfirmed=true');
    expect(workHabits?.evidence.join(' ')).toContain('skipReason=in_flight');
    expect(workHabits?.evidence.join(' ')).toContain('do not start a second Code Agent run');
    expect(workHabits?.evidence.join(' ')).toContain('Task Dynamics timeline port');
    expect(workHabits?.evidence.join(' ')).toContain('scheduled/event task-source port');
    expect(workHabits?.evidence.join(' ')).toContain('missingPorts=run_port,timeline_port,task_source_port');
    expect(workHabits?.evidence.join(' ')).toContain('increments the in-sweep run-limit count');
    expect(workHabits?.evidence.join(' ')).toContain('duplicate candidates in one sweep cannot exceed the Standing Approval daily cap');
    expect(workHabits?.evidence.join(' ')).toContain('skipReason, startedRunIds, blockedReasons, runtimeStartMissingRequirements, terminalRunEvidenceMissingRunIds, triggerRunEvidenceRequired, and triggerRunEvidenceStatus at the top level');
    expect(workHabits?.evidence.join(' ')).toContain('Brief now surfaces schedulerStatus.lastScheduledEventAgentSweepAt');
    expect(workHabits?.evidence.join(' ')).toContain('lastScheduledEventAgentSweepSummary');
    expect(workHabits?.evidence.join(' ')).toContain('scheduledEventAgentSweepJobConnected as automatic-sweep status chips');
    expect(workHabits?.evidence.join(' ')).toContain('skipped ports_not_connected and in_flight sweeps also update lastScheduledEventAgentSweepAt');
    expect(workHabits?.evidence.join(' ')).toContain('automatic-sweep status chip');
    expect(workHabits?.evidence.join(' ')).toContain('scheduled/event Agent sweep smoke');
    expect(workHabits?.evidence.join(' ')).toContain('checked=2 duplicate candidates');
    expect(workHabits?.evidence.join(' ')).toContain('blocked=1 by in-sweep run-limit counting');
    expect(workHabits?.evidence.join(' ')).toContain('skipReason=none');
    expect(workHabits?.evidence.join(' ')).toContain('startedRunIds evidence');
    expect(workHabits?.evidence.join(' ')).toContain('blockedReasons evidence');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartMissingRequirements evidence');
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
    expect(workHabits?.evidence.join(' ')).toContain('skippedSweepTimeEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTargetTask=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTaskMemoryGuidance=passed');
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
    expect(workHabits?.evidence.join(' ')).toContain('terminalTriggerRunEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('cronTriggerRunEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('triggerKindEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTargetTaskEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTaskMemoryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunFirstCriterionEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunFirstSourceEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunPostStepEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunWorkspaceBoundaryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunStandingApprovalScopeEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('runLimitEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartRequirements=passed');
    expect(workHabits?.evidence.join(' ')).toContain('targetTaskId timeline evidence');
    expect(workHabits?.evidence.join(' ')).toContain('timelineEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('terminalTimelineEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('cronTimelineEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('timelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('terminalTimelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('cronTimelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('startupSweepJobEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('sweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('disconnectedSweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('inFlightSweepSummaryEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('runStatusEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('terminalRunStatusEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('cronRunStatusEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('Local scheduled/event Agent sweep acceptance on 2026-05-27 passed');
    expect(workHabits?.evidence.join(' ')).toContain('npm run accept:scheduled-event-agent-sweep-smoke');
    expect(workHabits?.evidence.join(' ')).toContain('status=completed, checked=2, started=1, blocked=1');
    expect(workHabits?.evidence.join(' ')).toContain('triggerKindEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTargetTaskEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunTaskMemoryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunFirstCriterionEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunFirstSourceEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunPostStepEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunWorkspaceBoundaryEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('boundedRunStandingApprovalScopeEvidence=passed');
    expect(workHabits?.evidence.join(' ')).toContain('timelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('terminalTimelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('cronTimelineWorkspaceBoundary=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('startupSweepJobEvidence=recorded');
    expect(workHabits?.evidence.join(' ')).toContain('terminalRunEvidenceMissingRunIds=none');
    expect(workHabits?.evidence.join(' ')).toContain('provider=not-called');
    expect(workHabits?.gaps.join(' ')).toContain('narrow trigger-service connection, explicit operator IPC, Task Dynamics launch action, trigger timeline evidence, background scheduler job wiring, and a local sweep smoke');
    expect(workHabits?.gaps.join(' ')).toContain('broader runtime coverage and live soak evidence');
    expect(workHabits?.gaps.join(' ')).not.toContain('run-evidence persistence checks across live execution');
    expect(workHabits?.nextActions.join(' ')).toContain('live background-triggered execution');
    expect(workHabits?.nextActions.join(' ')).toContain('durable run-limit counting');
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
      .toContain('evaluateAgentApiDecompositionPromotionReadiness');
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
      .toContain('selected-runtime contract');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('parent-task identity');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('reversible proposal card');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.gaps.join(' '))
      .toContain('prove the selected-runtime contract');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.gaps.join(' '))
      .toContain('parent-task identity');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.nextActions.join(' '))
      .toContain('evaluateAgentApiDecompositionPromotionReadiness to pass');
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
    expect(taskFiles?.evidence.join(' ')).toContain('workspace_write capability steps now require patch artifact');
    expect(taskFiles?.evidence.join(' ')).toContain('Terminal Run verification now carries same-run artifacts and checkpoints');
    expect(taskFiles?.evidence.join(' ')).toContain('can satisfy workspace_write promotion evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('evaluateRuntimePatchPromotionRoutingReadiness');
    expect(taskFiles?.evidence.join(' ')).toContain('satisfied and missing requirement lists');
    expect(taskFiles?.evidence.join(' ')).toContain('promotionReady');
    expect(taskFiles?.evidence.join(' ')).toContain('promotionRequirements=x/8');
    expect(taskFiles?.evidence.join(' ')).toContain('missingRequirements=...');
    expect(taskFiles?.evidence.join(' ')).toContain('promotionMissingRequirements=...');
    expect(taskFiles?.evidence.join(' ')).toContain('selected-runtime contract, target-task identity, same-run patch artifact, promotion Decision, promotion preflight, explicit operator apply, and post-apply Run evidence');
    expect(taskFiles?.cliOnlyClosure).toBe('supported');
    expect(taskFiles?.gaps.join(' ')).toContain('Future API/runtime-generated patch promotion');
    expect(taskFiles?.gaps.join(' ')).toContain('selected-runtime contract');
    expect(taskFiles?.gaps.join(' ')).toContain('target-task identity');
    expect(taskFiles?.gaps.join(' ')).toContain('reviewed-patch apply workflow');
    expect(taskFiles?.gaps.join(' ')).toContain('same-run evidence chain');
    expect(taskFiles?.gaps.join(' ')).not.toContain('post-apply verification copy');
    expect(taskFiles?.gaps.join(' ')).not.toContain('blocked preflight recovery copy');
    expect(taskFiles?.nextActions.join(' ')).toContain('evaluateRuntimePatchPromotionRoutingReadiness');
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
    expect(capabilities?.evidence.join(' ')).toContain('executionRunPromotionRequirements=0/11');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunMissingRequirements=...');
    expect(capabilities?.evidence.join(' ')).toContain('executionRunMissingGates=...');
    expect(capabilities?.evidence.join(' ')).toContain('decompositionPromotionRequirements=0/7');
    expect(capabilities?.evidence.join(' ')).toContain('decompositionMissingRequirements=...');
    expect(capabilities?.evidence.join(' ')).toContain('providerToolReadiness=not_declared');
    expect(capabilities?.evidence.join(' ')).toContain('startupProbe=never');
    expect(capabilities?.evidence.join(' ')).toContain('provider tool/search readiness is not implied');
    expect(capabilities?.evidence.join(' ')).toContain('Agent API execution_run readiness chips');
    expect(capabilities?.evidence.join(' ')).toContain('missing gate count visible');
    expect(capabilities?.evidence.join(' ')).toContain('Agent API decomposition readiness chips');
    expect(capabilities?.evidence.join(' ')).toContain('Agent API provider tool readiness chips');
    expect(capabilities?.evidence.join(' ')).toContain('per-runtime capability chips');
    expect(capabilities?.evidence.join(' ')).toContain('visible native search, hook, and subagent readiness labels');
    expect(capabilities?.evidence.join(' ')).toContain('native CLI prompts');
    expect(capabilities?.evidence.join(' ')).toContain('native goal forwarding readiness summary and missing evidence');
    expect(capabilities?.evidence.join(' ')).toContain('requires the selected adapter to declare native goal capability');
    expect(capabilities?.evidence.join(' ')).toContain('taskplaneGoalLoop=available');
    expect(capabilities?.evidence.join(' ')).toContain('skipReason=opt_in_required');
    expect(capabilities?.evidence.join(' ')).toContain('continueWith=taskplane_goal_loop');
    expect(capabilities?.evidence.join(' ')).toContain('Provider-native and Gmail connector preflights now report skipReason=config_missing');
    expect(capabilities?.evidence.join(' ')).toContain('before any provider, Gmail, task-memory, or workspace effect is allowed');
    expect(capabilities?.evidence.join(' ')).toContain('runtime-neutral capability progress states');
    expect(capabilities?.evidence.join(' ')).toContain('Native CLI capability-tagged web/search events');
    expect(capabilities?.evidence.join(' ')).toContain('fallback copy now uses the selected runtime native web/search readiness');
    expect(capabilities?.evidence.join(' ')).toContain('unverified native search');
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
    expect(capabilities?.cliOnlyClosure).toBe('supported');
    expect(capabilities?.futureApiClosure).toBe('partial');
    expect(workHabits?.evidence.join(' ')).toContain('diagnostic-only for automatic starts');
    expect(workHabits?.evidence.join(' ')).toContain('automatic-start boundary');
    expect(workHabits?.gaps.join(' ')).not.toContain('connected trigger service before L2 automatic native runtime starts');
    expect(workHabits?.nextActions.join(' ')).toContain('live background-triggered execution');
    expect(workHabits?.nextActions.join(' ')).toContain('context readiness');
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
    expect(smoke?.evidence.join(' ')).toContain('Claude Code 2.1.144 stream-json execution now uses --verbose');
    expect(smoke?.evidence.join(' ')).toContain('optional secondary adapter compatibility evidence');
    expect(smoke?.evidence.join(' ')).toContain('must not block Codex CLI, Agent API, scheduled/event, or writeback acceptance progress');
    expect(smoke?.gaps.join(' ')).toContain('not a mainline product-completion blocker');
    expect(smoke?.nextActions.join(' ')).toContain('Continue non-Claude runtime and recovery coverage first');
    expect(smoke?.evidence.join(' ')).toContain('401 authentication_failed');
    expect(smoke?.gaps.join(' ')).toContain('manual opt-in packaged harness');
  });
});
