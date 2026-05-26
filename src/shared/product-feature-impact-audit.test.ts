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
    expect(rightPanel?.evidence.join(' ')).toContain('deferred Agent API task execution');
    expect(rightPanel?.evidence.join(' ')).toContain('skipped execution_run shape');
    expect(rightPanel?.evidence.join(' ')).toContain('execution_run as deferred');
    expect(rightPanel?.evidence.join(' ')).toContain('future provider-visible execution required gates');
    expect(rightPanel?.evidence.join(' ')).toContain('runtime context assembly, context_readiness, task-memory guidance, subtask_start, and post_step');
    expect(rightPanel?.evidence.join(' ')).toContain('derive deferred execution_run key gates from the future provider-visible execution contract');
    expect(rightPanel?.evidence.join(' ')).toContain('settings and safety reports expose context, task-memory, subtask-start, and post-step boundaries');
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
    expect(rightPanel?.gaps.join(' ')).toContain('explicit apply feedback');
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
    expect(decisions?.evidence.join(' ')).toContain('DecisionService.draft is registered as a task-bound decision_draft entrypoint');
    expect(decisions?.evidence.join(' ')).toContain('selected Agent CLI modes stay product_harness/skipped');
    expect(decisions?.evidence.join(' ')).toContain('Approved checkpoint Decision resume is limited to open tool_permission');
    expect(decisions?.evidence.join(' ')).toContain('cannot turn ordinary Decision approval into arbitrary tool execution');
    expect(decisions?.evidence.join(' ')).toContain('Decision actions in DecisionService and DecisionsPage pass through decision_action');
    expect(decisions?.cliOnlyClosure).toBe('supported');
    expect(decisions?.gaps.join(' ')).toContain('deferred proposal-only contract');
    expect(decisions?.nextActions.join(' ')).toContain('scheduler Decision proposal contract');
    expect(rightPanel?.evidence.join(' ')).toContain('artifact.propose Write Intent can now carry kind=patch');
    expect(rightPanel?.evidence.join(' ')).toContain('imported_patch_artifact sandbox draft sources');
    expect(taskFiles?.evidence.join(' ')).toContain('patch-promotion checkpoint and Decision status');
    expect(workHabits?.evidence.join(' ')).toContain('automation readiness as a diagnostic-only entrypoint');
    expect(workHabits?.evidence.join(' ')).toContain('no runtime_action/pre_step/post_step execution gates');
    expect(workHabits?.evidence.join(' ')).toContain('future scheduled/event/routine Agent execution as a separate deferred provider-visible execution contract');
    expect(workHabits?.evidence.join(' ')).toContain('before any IPC or scheduler trigger can exist');
    expect(workHabits?.evidence.join(' ')).toContain('autonomy ladder level');
    expect(workHabits?.evidence.join(' ')).toContain('L1 proposal capability');
    expect(workHabits?.evidence.join(' ')).toContain('standing_approval as an explicit deferred gate');
    expect(workHabits?.evidence.join(' ')).toContain('AgentStandingApprovalPolicy');
    expect(workHabits?.evidence.join(' ')).toContain('evaluateStandingApprovalForAutomation');
    expect(workHabits?.evidence.join(' ')).toContain('daily run limit');
    expect(workHabits?.evidence.join(' ')).toContain('buildStandingApprovalConfirmationDraft');
    expect(workHabits?.evidence.join(' ')).toContain('confirmation-only L2 authorization draft');
    expect(workHabits?.evidence.join(' ')).toContain('schedulerTriggerAllowed=false / workspaceWriteAllowed=false');
    expect(workHabits?.evidence.join(' ')).toContain('blocks other automation readiness gaps');
    expect(workHabits?.evidence.join(' ')).toContain('TasksPage Task Dynamics');
    expect(workHabits?.evidence.join(' ')).toContain('operator card');
    expect(workHabits?.evidence.join(' ')).toContain('panel.standing_approval_confirmed');
    expect(workHabits?.evidence.join(' ')).toContain('TaskService timeline mutation guard');
    expect(workHabits?.evidence.join(' ')).toContain('planScheduledEventAgentTrigger');
    expect(workHabits?.evidence.join(' ')).toContain('dry-run scheduled/event trigger planner');
    expect(workHabits?.evidence.join(' ')).toContain('runtimeStartAllowed=false');
    expect(workHabits?.evidence.join(' ')).toContain('SchedulerService.diagnoseScheduledEventAgentTriggers');
    expect(workHabits?.evidence.join(' ')).toContain('no-start scheduler diagnostic entrypoint');
    expect(workHabits?.evidence.join(' ')).toContain('does not resolve runtime config');
    expect(workHabits?.evidence.join(' ')).toContain('daily run-limit accounting input');
    expect(workHabits?.evidence.join(' ')).toContain('maxRunsPerDay has been reached');
    expect(workHabits?.evidence.join(' ')).toContain('RunRepository.countCreatedSinceByTask');
    expect(workHabits?.evidence.join(' ')).toContain('persisted same-day Run records');
    expect(workHabits?.evidence.join(' ')).toContain('future trigger Run evidence contract');
    expect(workHabits?.evidence.join(' ')).toContain('subtask_start, run-limit count, and post-step evidence');
    expect(workHabits?.gaps.join(' ')).toContain('L1 proposal diagnostics');
    expect(workHabits?.gaps.join(' ')).toContain('confirmed Task Dynamics authorization records');
    expect(workHabits?.gaps.join(' ')).toContain('dry-run trigger planner');
    expect(workHabits?.gaps.join(' ')).toContain('persisted daily run-limit accounting diagnostics');
    expect(workHabits?.gaps.join(' ')).toContain('trigger Run evidence contract projection');
    expect(workHabits?.nextActions.join(' ')).toContain('controlled native runtime start');
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
    expect(taskFiles?.evidence.join(' ')).toContain('workspace_write capability steps now require patch artifact');
    expect(taskFiles?.evidence.join(' ')).toContain('Terminal Run verification now carries same-run artifacts and checkpoints');
    expect(taskFiles?.evidence.join(' ')).toContain('can satisfy workspace_write promotion evidence');
    expect(taskFiles?.gaps.join(' ')).toContain('disabled by default');
    expect(taskFiles?.gaps.join(' ')).toContain('write-boundary guidance');
    expect(taskFiles?.gaps.join(' ')).not.toContain('post-apply verification copy');
    expect(taskFiles?.gaps.join(' ')).not.toContain('blocked preflight recovery copy');
    expect(taskFiles?.gaps.join(' ')).not.toContain('packaged smoke and recovery UX');
    expect(taskFiles?.nextActions.join(' ')).toContain('disabled by default');
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
    expect(capabilities?.evidence.join(' ')).toContain('selected Agent CLI native web/search readiness');
    expect(capabilities?.evidence.join(' ')).toContain('CapabilitySafetyStrip for agent_cli.runtimes');
    expect(capabilities?.evidence.join(' ')).toContain('safe-read-only probe policy');
    expect(capabilities?.evidence.join(' ')).toContain('CapabilitySafetyStrip for agent_api.runtime');
    expect(capabilities?.evidence.join(' ')).toContain('deferred execution_run boundary');
    expect(capabilities?.evidence.join(' ')).toContain('per-runtime capability chips');
    expect(capabilities?.evidence.join(' ')).toContain('visible native search, hook, and subagent readiness labels');
    expect(capabilities?.evidence.join(' ')).toContain('native CLI prompts');
    expect(capabilities?.evidence.join(' ')).toContain('native goal forwarding readiness summary and missing evidence');
    expect(capabilities?.evidence.join(' ')).toContain('runtime-neutral capability progress states');
    expect(capabilities?.evidence.join(' ')).toContain('Native CLI capability-tagged web/search events');
    expect(capabilities?.evidence.join(' ')).toContain('fallback copy now uses the selected runtime native web/search readiness');
    expect(capabilities?.evidence.join(' ')).toContain('unverified native search');
    expect(capabilities?.gaps.join(' ')).not.toContain('first web/search mapping');
    expect(capabilities?.gaps.join(' ')).not.toContain('provider-owned declarations');
    expect(capabilities?.gaps.join(' ')).not.toContain('compact/clear readiness checks');
    expect(capabilities?.gaps.join(' ')).not.toContain('hook config semantics');
    expect(capabilities?.gaps.join(' ')).not.toContain('richer hook/subagent semantics beyond current non-empty workspace metadata checks');
    expect(capabilities?.nextActions.join(' ')).toContain('provider-owned packaged CLI metadata probes');
    expect(workHabits?.evidence.join(' ')).toContain('diagnostic-only for automatic starts');
    expect(workHabits?.evidence.join(' ')).toContain('automatic-start boundary');
    expect(workHabits?.gaps.join(' ')).toContain('connected trigger service before L2 automatic native runtime starts');
    expect(workHabits?.nextActions.join(' ')).toContain('native runtime start');
    expect(workHabits?.nextActions.join(' ')).toContain('context readiness');
    expect(smoke?.evidence.join(' ')).toContain('Claude Code mode');
    expect(smoke?.evidence.join(' ')).toContain('TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude');
    expect(smoke?.evidence.join(' ')).toContain('accountReadiness=not-checked');
    expect(smoke?.evidence.join(' ')).toContain('manualEvidence=not-recorded');
    expect(smoke?.evidence.join(' ')).toContain('smoke:agent-cli-web-research');
    expect(smoke?.evidence.join(' ')).toContain('mocked OpenAI web_search output');
    expect(smoke?.evidence.join(' ')).toContain('without external network or provider calls');
    expect(smoke?.gaps.join(' ')).toContain('manual opt-in packaged harness');
  });
});
