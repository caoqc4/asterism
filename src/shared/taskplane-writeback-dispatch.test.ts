import { describe, expect, it, vi } from 'vitest';

import { dispatchTaskplaneWritebackApplyPlan } from './taskplane-writeback-dispatch.js';
import type { TaskplaneStructuredWritebackApplyPlan } from './taskplane-writeback-apply-plan.js';

describe('Taskplane writeback dispatch', () => {
  it('dispatches source writes through provided ports and records timeline evidence', async () => {
    const createSourceContext = vi.fn().mockResolvedValue({});
    const recordTimelineEvent = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        createSourceContext,
        recordTimelineEvent,
      },
      plan: {
        action: 'source_context.create',
        input: {
          kind: 'link',
          taskId: 'task_1',
          title: 'Codex docs',
          uri: 'https://example.com/codex',
        },
        successMessage: '已确认并保存来源上下文：Codex docs。',
        timeline: {
          type: 'panel.source_updated',
          payload: {
            evidenceRunId: 'run_1',
            source: 'taskplane_write_intent',
          },
        },
      },
    });

    expect(result).toMatchObject({
      action: 'source_context.create',
      status: 'completed',
      successMessage: '已确认并保存来源上下文：Codex docs。',
    });
    expect(createSourceContext).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_1',
      title: 'Codex docs',
    }));
    expect(recordTimelineEvent).toHaveBeenCalledWith('task_1', 'panel.source_updated', {
      evidenceRunId: 'run_1',
      source: 'taskplane_write_intent',
    });
  });

  it('returns a blocked result instead of writing when a required port is missing', async () => {
    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {},
      plan: nextStepPlan(),
    });

    expect(result).toEqual({
      action: 'task.update_next_step',
      message: '下一步提案已暂停：当前环境不支持更新任务。',
      status: 'blocked',
    });
  });

  it('dispatches next-step updates and returns the updated task for local UI state', async () => {
    const updateTask = vi.fn().mockResolvedValue({
      id: 'task_1',
      nextStep: '整理页面信息架构。',
    });

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        updateTask,
        recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      },
      plan: nextStepPlan(),
    });

    expect(updateTask).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '整理页面信息架构。',
    });
    expect(result).toMatchObject({
      action: 'task.update_next_step',
      status: 'completed',
      updatedTask: {
        id: 'task_1',
        nextStep: '整理页面信息架构。',
      },
    });
  });
});

function nextStepPlan(): TaskplaneStructuredWritebackApplyPlan {
  return {
    action: 'task.update_next_step',
    input: {
      id: 'task_1',
      nextStep: '整理页面信息架构。',
    },
    nextStep: '整理页面信息架构。',
    requiredApi: 'updateTask',
    successMessage: '已确认并更新下一步：整理页面信息架构。',
    timeline: {
      type: 'panel.task_goal_updated',
      payload: {
        evidenceRunId: 'run_1',
        nextStep: '整理页面信息架构。',
        source: 'taskplane_write_intent',
      },
    },
  };
}
