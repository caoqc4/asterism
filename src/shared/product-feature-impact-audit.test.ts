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
    expect(rightPanel?.evidence.join(' ')).toContain('command_execution items');
    expect(rightPanel?.evidence.join(' ')).toContain('while the native process is still running');
    expect(rightPanel?.evidence.join(' ')).toContain('local command or workspace activity');
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
    expect(rightPanel?.evidence.join(' ')).toContain('context_readiness and post_step');
    expect(rightPanel?.evidence.join(' ')).toContain('selected-runtime capability declarations');
    expect(capabilities?.evidence.join(' ')).toContain('configured workspace for native guidance');
    expect(capabilities?.evidence.join(' ')).toContain('native web/search readiness counts');
    expect(rightPanel?.evidence.join(' ')).toContain('workspace write candidates that require reviewable promotion evidence');
    expect(rightPanel?.evidence.join(' ')).toContain('SandboxPatchPromotionApplyService');
    expect(rightPanel?.evidence.join(' ')).toContain('missing-apply-record status');
    expect(rightPanel?.evidence.join(' ')).toContain('explicit apply-to-workspace action');
    expect(rightPanel?.evidence.join(' ')).toContain('reviewed patch promotion apply smoke');
    expect(rightPanel?.evidence.join(' ')).toContain('workspace-drift blocked recovery evidence');
    expect(rightPanel?.gates).toContain('context_readiness');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback proposal builder');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback apply plans');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback dispatch');
    expect(rightPanel?.evidence.join(' ')).toContain('TaskService, DecisionService, TaskFileRepository, and ArtifactRepository ports');
    expect(rightPanel?.evidence.join(' ')).toContain('source, structured, subtask, task-record, and task-memory confirmations');
    expect(rightPanel?.evidence.join(' ')).toContain('task records, task files, task artifacts');
    expect(rightPanel?.evidence.join(' ')).toContain('Task Dynamics now builds a Run-detail writeback approval queue');
    expect(rightPanel?.evidence.join(' ')).toContain('artifact.propose Write Intent can now carry kind=patch');
    expect(rightPanel?.evidence.join(' ')).toContain('imported_patch_artifact sandbox draft sources');
    expect(taskFiles?.evidence.join(' ')).toContain('patch-promotion checkpoint and Decision status');
    expect(workHabits?.evidence.join(' ')).toContain('automation readiness as a diagnostic-only entrypoint');
    expect(workHabits?.evidence.join(' ')).toContain('no runtime_action/pre_step/post_step execution gates');
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
    expect(taskMemory?.gaps.join(' ')).toContain('beyond RightPanel and Task Dynamics');
    expect(taskMemory?.nextActions.join(' ')).toContain('MemorySurfaceWriteCoverage');
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
    expect(taskFiles?.evidence.join(' ')).toContain('reviewed patch promotion apply smoke');
    expect(taskFiles?.evidence.join(' ')).toContain('blocked workspace-drift recovery evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('Packaged task-files smoke now covers the explicit reviewed-patch apply UI path');
    expect(taskFiles?.evidence.join(' ')).toContain('no-write recovery evidence');
    expect(taskFiles?.evidence.join(' ')).toContain('workspace was not written');
    expect(taskFiles?.evidence.join(' ')).toContain('post-apply verification results');
    expect(taskFiles?.evidence.join(' ')).toContain('only reviewed patch files passing promotion preflight');
    expect(taskFiles?.evidence.join(' ')).toContain('drift blocks apply');
    expect(taskFiles?.evidence.join(' ')).toContain('workspace_write capability steps now require patch artifact');
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
    expect(decisions?.gaps.join(' ')).not.toContain('proposal cards need unified right-panel handling');
    expect(decisions?.gaps.join(' ')).not.toContain('still need to call it through main-side ports');
    expect(decisions?.gaps.join(' ')).not.toContain('non-UI operator approval surfaces are still missing');
    expect(capabilities?.evidence.join(' ')).toContain('adapter-level native capability declarations');
    expect(capabilities?.evidence.join(' ')).toContain('provider help output');
    expect(capabilities?.evidence.join(' ')).toContain('compact/clear context affordances');
    expect(capabilities?.evidence.join(' ')).toContain('adapter capability support');
    expect(capabilities?.evidence.join(' ')).toContain('per-runtime capability chips');
    expect(capabilities?.evidence.join(' ')).toContain('native CLI prompts');
    expect(capabilities?.evidence.join(' ')).toContain('native goal forwarding readiness summary and missing evidence');
    expect(capabilities?.evidence.join(' ')).toContain('runtime-neutral capability progress states');
    expect(capabilities?.evidence.join(' ')).toContain('Native CLI capability-tagged web/search events');
    expect(capabilities?.gaps.join(' ')).not.toContain('first web/search mapping');
    expect(capabilities?.gaps.join(' ')).not.toContain('provider-owned declarations');
    expect(capabilities?.gaps.join(' ')).not.toContain('compact/clear readiness checks');
    expect(workHabits?.evidence.join(' ')).toContain('diagnostic-only for automatic starts');
    expect(workHabits?.evidence.join(' ')).toContain('automatic-start boundary');
    expect(workHabits?.gaps.join(' ')).toContain('cannot automatically start native runtimes');
    expect(workHabits?.nextActions.join(' ')).toContain('separate scheduled/event execution entrypoint');
    expect(smoke?.evidence.join(' ')).toContain('Claude Code mode');
    expect(smoke?.evidence.join(' ')).toContain('TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude');
    expect(smoke?.evidence.join(' ')).toContain('accountReadiness=not-checked');
    expect(smoke?.evidence.join(' ')).toContain('manualEvidence=not-recorded');
    expect(smoke?.gaps.join(' ')).toContain('manual opt-in packaged harness');
  });
});
