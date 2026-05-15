import { describe, expect, it } from 'vitest';

import {
  guardDecisionAction,
  guardDurablePanelAction,
  guardTaskCapture,
  guardTaskMutation,
  guardTaskStateTransition,
  verifyDecisionActionCompleted,
  verifyDurablePanelActionCompleted,
} from './runtimeActionGuards';

describe('renderer runtime action guards', () => {
  it('allows ordinary task mutations with task context', () => {
    expect(guardTaskMutation({ taskId: 'task_1' })).toMatchObject({
      allowed: true,
      verification: {
        mode: 'pre_step',
        tone: 'pass',
      },
    });
  });

  it('allows explicit task capture through pre-step verification', () => {
    expect(guardTaskCapture({ confirmationSatisfied: true, messageCount: 1 })).toMatchObject({
      allowed: true,
      verification: {
        mode: 'pre_step',
        tone: 'pass',
      },
    });
  });

  it('blocks duplicate task capture candidates before persistence', () => {
    expect(guardTaskCapture({
      confirmationSatisfied: true,
      messageCount: 1,
      candidateTitle: '开发小程序',
      existingTasks: [
        {
          id: 'task_1',
          title: '开发小程序',
          state: 'running',
        },
      ],
    })).toMatchObject({
      allowed: false,
      reason: '任务捕获暂不能继续：已有未完成任务「开发小程序」，不应重复捕获同名任务。',
      verification: {
        mode: 'pre_step',
        tone: 'fail',
      },
    });
  });

  it('allows completed transition after explicit confirmation', () => {
    expect(guardTaskStateTransition({
      taskId: 'task_1',
      nextState: 'completed',
      confirmationSatisfied: true,
    })).toMatchObject({
      allowed: true,
      verification: {
        mode: 'pre_step',
        tone: 'pass',
      },
    });
  });

  it('keeps completed transition confirmation-gated when confirmation is missing', () => {
    expect(guardTaskStateTransition({
      taskId: 'task_1',
      nextState: 'completed',
    })).toMatchObject({
      allowed: false,
      verification: {
        mode: 'pre_step',
        tone: 'warn',
        suggestedNextAction: 'confirm',
      },
    });
  });

  it('allows confirmed durable panel actions', () => {
    expect(guardDurablePanelAction({
      taskId: 'task_1',
      confirmed: true,
    })).toMatchObject({
      allowed: true,
      verification: {
        mode: 'pre_step',
        tone: 'pass',
      },
    });
  });

  it('verifies durable panel actions after completion', () => {
    expect(verifyDurablePanelActionCompleted({
      title: '重命名文件',
      output: '已重命名 notes.md',
    })).toMatchObject({
      allowed: true,
      verification: {
        mode: 'post_step',
        tone: 'pass',
      },
    });
  });

  it('allows confirmed decision actions through pre-step verification', () => {
    expect(guardDecisionAction({
      action: 'approve',
      taskId: 'task_1',
    })).toMatchObject({
      allowed: true,
      verification: {
        mode: 'pre_step',
        tone: 'pass',
      },
    });
  });

  it('verifies decision actions after completion', () => {
    expect(verifyDecisionActionCompleted({
      title: '是否继续',
      action: 'defer',
    })).toMatchObject({
      allowed: true,
      verification: {
        mode: 'post_step',
        tone: 'pass',
      },
    });
  });
});
