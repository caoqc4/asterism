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

    expect(rightPanel?.evidence.join(' ')).toContain('decisions, next-step updates, blockers, completion proposals');
    expect(rightPanel?.evidence.join(' ')).toContain('web research capture and native CLI capability-tagged web/search events');
    expect(rightPanel?.evidence.join(' ')).toContain('command_execution items');
    expect(rightPanel?.evidence.join(' ')).toContain('while the native process is still running');
    expect(rightPanel?.evidence.join(' ')).toContain('local command or workspace activity');
    expect(rightPanel?.evidence.join(' ')).toContain('child-task advancement messages');
    expect(rightPanel?.evidence.join(' ')).toContain('context.readiness.evaluate');
    expect(rightPanel?.evidence.join(' ')).toContain('preserving operation mode');
    expect(rightPanel?.evidence.join(' ')).toContain('backendPlan');
    expect(rightPanel?.evidence.join(' ')).toContain('Pilot 决策辅助计划');
    expect(rightPanel?.evidence.join(' ')).toContain('Agent API chat invocations preserve');
    expect(rightPanel?.evidence.join(' ')).toContain('selected-runtime capability declarations');
    expect(rightPanel?.evidence.join(' ')).toContain('workspace write candidates that require reviewable promotion evidence');
    expect(rightPanel?.gates).toContain('context_readiness');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback proposal builder');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback apply plans');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback dispatch');
    expect(rightPanel?.evidence.join(' ')).toContain('TaskService, DecisionService, TaskFileRepository, and ArtifactRepository ports');
    expect(rightPanel?.evidence.join(' ')).toContain('source, structured, subtask, task-record, and task-memory confirmations');
    expect(rightPanel?.evidence.join(' ')).toContain('task records, task files, task artifacts');
    expect(rightPanel?.evidence.join(' ')).toContain('Task Dynamics now builds a Run-detail writeback approval queue');
    expect(rightPanel?.evidence.join(' ')).toContain('artifact.propose Write Intent can now carry kind=patch');
    expect(rightPanel?.writeIntents).toContain('task_file.propose');
    expect(rightPanel?.writeIntents).toContain('artifact.propose');
    expect(rightPanel?.writeIntents).toContain('subtask.propose');
    expect(rightPanel?.gaps.join(' ')).not.toContain('still need product UI paths');
    expect(rightPanel?.gaps.join(' ')).not.toContain('main-side writeback orchestration service is not yet wired');
    expect(rightPanel?.gaps.join(' ')).not.toContain('Non-UI runtime confirmation flows');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.evidence.join(' '))
      .toContain('subtask.create_many writeback apply plan');
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
      .toContain('recordPath evidence');
    expect(taskMemory?.evidence.join(' ')).toContain('TaskMemoryWriteProposal now routes Task Record proposals through TaskRecordWorthinessEvaluation');
    expect(taskMemory?.gaps.join(' ')).not.toContain('Automatic writeback should keep distinguishing');
    expect(taskFiles?.evidence.join(' ')).toContain('Native CLI task_file.propose Write Intent');
    expect(taskFiles?.evidence.join(' ')).toContain('Native CLI artifact.propose Write Intent');
    expect(taskFiles?.evidence.join(' ')).toContain('artifact.propose kind=patch');
    expect(taskFiles?.evidence.join(' ')).toContain('workspace_write capability steps now require patch artifact');
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
    expect(capabilities?.evidence.join(' ')).toContain('per-runtime capability chips');
    expect(capabilities?.evidence.join(' ')).toContain('native CLI prompts');
    expect(capabilities?.evidence.join(' ')).toContain('runtime-neutral capability progress states');
    expect(capabilities?.evidence.join(' ')).toContain('Native CLI capability-tagged web/search events');
    expect(capabilities?.gaps.join(' ')).not.toContain('first web/search mapping');
    expect(capabilities?.gaps.join(' ')).not.toContain('provider-owned declarations');
  });
});
