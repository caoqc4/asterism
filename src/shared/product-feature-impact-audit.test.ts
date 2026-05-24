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
    const decisions = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'decisions_checkpoints_completion');
    const capabilities = PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'capabilities_external_skills_mcp');

    expect(rightPanel?.evidence.join(' ')).toContain('decisions, next-step updates, blockers, completion proposals');
    expect(rightPanel?.evidence.join(' ')).toContain('web research capture and native CLI web/search events');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback proposal builder');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback apply plans');
    expect(rightPanel?.evidence.join(' ')).toContain('Shared writeback dispatch');
    expect(rightPanel?.evidence.join(' ')).toContain('TaskService, DecisionService, and TaskFileRepository ports');
    expect(rightPanel?.evidence.join(' ')).toContain('source, structured, task-record, and task-memory confirmations');
    expect(rightPanel?.gaps.join(' ')).not.toContain('still need product UI paths');
    expect(rightPanel?.gaps.join(' ')).not.toContain('main-side writeback orchestration service is not yet wired');
    expect(PRODUCT_FEATURE_IMPACT_AUDIT.find((item) => item.id === 'task_creation_and_project_decomposition')?.gaps.join(' '))
      .toContain('not yet represented as a main-side writeback apply plan');
    expect(decisions?.evidence.join(' ')).toContain('user-confirmed Decision, blocker, next-step, and completion proposal cards');
    expect(decisions?.evidence.join(' ')).toContain('task, decision, and task-file services');
    expect(decisions?.gaps.join(' ')).not.toContain('proposal cards need unified right-panel handling');
    expect(decisions?.gaps.join(' ')).not.toContain('still need to call it through main-side ports');
    expect(capabilities?.evidence.join(' ')).toContain('Native CLI web/search events');
  });
});
