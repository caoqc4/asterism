import { describe, expect, it } from 'vitest';

import {
  buildSourceContextWritebackApplyPlan,
  buildStructuredWritebackApplyPlan,
} from './taskplane-writeback-apply-plan.js';
import type { TaskplaneStructuredWritebackProposal } from './taskplane-writeback-proposal.js';

describe('Taskplane writeback apply plans', () => {
  it('maps source context proposals to service input and timeline evidence', () => {
    const plan = buildSourceContextWritebackApplyPlan({
      capturedAt: '2026-05-24T00:00:00.000Z',
      proposal: {
        evidenceRunId: 'run_1',
        note: '官方文档入口。',
        title: 'Codex docs',
        uri: 'https://example.com/codex',
      },
      taskId: 'task_1',
    });

    expect(plan.input).toMatchObject({
      capturedAt: '2026-05-24T00:00:00.000Z',
      content: 'Source: https://example.com/codex\n\n官方文档入口。',
      kind: 'link',
      runId: 'run_1',
      sourceRole: 'raw',
      taskId: 'task_1',
      title: 'Codex docs',
      uri: 'https://example.com/codex',
    });
    expect(plan.timeline).toMatchObject({
      type: 'panel.source_updated',
      payload: {
        evidenceRunId: 'run_1',
        source: 'taskplane_write_intent',
      },
    });
  });

  it('maps structured decision and next-step proposals to deterministic apply plans', () => {
    const decisionPlan = buildStructuredWritebackApplyPlan({
      proposal: {
        detail: '范围影响页面结构。',
        evidenceRunId: 'run_2',
        title: '决策提案：确认首版范围',
        intent: {
          evidenceRunId: 'run_2',
          options: ['基础教程', '教程加案例'],
          proposedOutcome: '教程加案例',
          rationale: '范围影响页面结构。',
          taskId: 'task_1',
          title: '确认首版范围',
          type: 'decision.create',
        },
      },
      taskId: 'task_1',
    });
    const nextStepPlan = buildStructuredWritebackApplyPlan({
      proposal: nextStepProposal(),
      taskId: 'task_1',
    });

    expect(decisionPlan).toMatchObject({
      action: 'decision.create',
      input: {
        kind: 'direction_choice',
        sourceId: 'run_2',
        taskId: 'task_1',
        title: '确认首版范围',
      },
      requiredApi: 'createDecision',
    });
    expect(nextStepPlan).toMatchObject({
      action: 'task.update_next_step',
      input: {
        id: 'task_1',
        nextStep: '整理页面信息架构。',
      },
      timeline: {
        type: 'panel.task_goal_updated',
      },
    });
  });
});

function nextStepProposal(): TaskplaneStructuredWritebackProposal {
  return {
    detail: '目标已经足够推进。',
    evidenceRunId: 'run_3',
    intent: {
      evidenceRunId: 'run_3',
      nextStep: '整理页面信息架构。',
      reason: '目标已经足够推进。',
      taskId: 'task_1',
      type: 'task.update_next_step',
    },
    title: '下一步提案：整理页面信息架构。',
  };
}
