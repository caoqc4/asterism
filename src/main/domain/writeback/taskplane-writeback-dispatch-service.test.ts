import { describe, expect, it, vi } from 'vitest';

import { TaskplaneWritebackDispatchService } from './taskplane-writeback-dispatch-service.js';
import type {
  TaskplaneSourceContextWritebackApplyPlan,
  TaskplaneStructuredWritebackApplyPlan,
} from '../../../shared/taskplane-writeback-apply-plan.js';

describe('TaskplaneWritebackDispatchService', () => {
  it('adapts shared writeback dispatch to main task and decision services', async () => {
    const taskService = {
      createBlocker: vi.fn(),
      createSourceContext: vi.fn(),
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({
        id: 'task_1',
        nextStep: '整理页面信息架构。',
      }),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const service = new TaskplaneWritebackDispatchService(taskService, decisionService);

    const result = await service.dispatch({
      taskId: 'task_1',
      plan: nextStepPlan(),
    });

    expect(taskService.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '整理页面信息架构。',
    });
    expect(taskService.recordTimelineEvent).toHaveBeenCalledWith({
      payload: {
        evidenceRunId: 'run_1',
        nextStep: '整理页面信息架构。',
        source: 'taskplane_write_intent',
      },
      taskId: 'task_1',
      type: 'panel.task_goal_updated',
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

  it('routes source contexts and decisions through their main domain services', async () => {
    const taskService = {
      createBlocker: vi.fn(),
      createSourceContext: vi.fn().mockResolvedValue({
        id: 'source_1',
      }),
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn().mockResolvedValue({
        id: 'decision_1',
      }),
    };
    const service = new TaskplaneWritebackDispatchService(taskService, decisionService);

    await service.dispatch({
      taskId: 'task_1',
      plan: sourceContextPlan(),
    });
    await service.dispatch({
      taskId: 'task_1',
      plan: decisionPlan(),
    });

    expect(taskService.createSourceContext).toHaveBeenCalledWith({
      capturedAt: '2026-05-24T00:00:00.000Z',
      content: 'Source: https://example.com/codex\n\n官方文档入口。',
      credibility: 'verified',
      isKey: true,
      kind: 'link',
      note: '官方文档入口。',
      runId: 'run_1',
      sourceRole: 'raw',
      taskId: 'task_1',
      title: 'Codex docs',
      uri: 'https://example.com/codex',
    });
    expect(taskService.recordTimelineEvent).toHaveBeenCalledWith({
      payload: {
        evidenceRunId: 'run_1',
        source: 'taskplane_write_intent',
        title: 'Codex docs',
        uri: 'https://example.com/codex',
      },
      taskId: 'task_1',
      type: 'panel.source_updated',
    });
    expect(decisionService.create).toHaveBeenCalledWith({
      context: {
        impact: '建议结果：教程加案例',
        whyNow: '范围影响页面结构。',
      },
      kind: 'direction_choice',
      options: [
        {
          id: 'option_1',
          label: '基础教程',
        },
        {
          id: 'option_2',
          label: '教程加案例',
        },
      ],
      recommendation: {
        label: '教程加案例',
        reason: '范围影响页面结构。',
      },
      scope: 'task',
      sourceId: 'run_2',
      sourceLabel: 'Agent CLI Write Intent',
      sourceType: 'run',
      taskId: 'task_1',
      title: '确认首版范围',
    });
  });

  it('blocks writeback plans that target a different task', async () => {
    const taskService = {
      createBlocker: vi.fn(),
      createSourceContext: vi.fn(),
      recordTimelineEvent: vi.fn(),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const service = new TaskplaneWritebackDispatchService(taskService, decisionService);

    const result = await service.dispatch({
      taskId: 'task_2',
      plan: nextStepPlan(),
    });

    expect(result).toEqual({
      action: 'task.update_next_step',
      message: 'Write Intent 已暂停：计划目标任务与当前任务不一致。',
      status: 'blocked',
    });
    expect(taskService.update).not.toHaveBeenCalled();
  });
});

function sourceContextPlan(): TaskplaneSourceContextWritebackApplyPlan {
  return {
    action: 'source_context.create',
    input: {
      capturedAt: '2026-05-24T00:00:00.000Z',
      content: 'Source: https://example.com/codex\n\n官方文档入口。',
      credibility: 'verified',
      isKey: true,
      kind: 'link',
      note: '官方文档入口。',
      runId: 'run_1',
      sourceRole: 'raw',
      taskId: 'task_1',
      title: 'Codex docs',
      uri: 'https://example.com/codex',
    },
    successMessage: '已确认并保存来源上下文：Codex docs。',
    timeline: {
      payload: {
        evidenceRunId: 'run_1',
        source: 'taskplane_write_intent',
        title: 'Codex docs',
        uri: 'https://example.com/codex',
      },
      type: 'panel.source_updated',
    },
  };
}

function decisionPlan(): TaskplaneStructuredWritebackApplyPlan {
  return {
    action: 'decision.create',
    input: {
      context: {
        impact: '建议结果：教程加案例',
        whyNow: '范围影响页面结构。',
      },
      kind: 'direction_choice',
      options: [
        {
          id: 'option_1',
          label: '基础教程',
        },
        {
          id: 'option_2',
          label: '教程加案例',
        },
      ],
      recommendation: {
        label: '教程加案例',
        reason: '范围影响页面结构。',
      },
      scope: 'task',
      sourceId: 'run_2',
      sourceLabel: 'Agent CLI Write Intent',
      sourceType: 'run',
      taskId: 'task_1',
      title: '确认首版范围',
    },
    requiredApi: 'createDecision',
    successMessage: '已确认并创建 Decision：确认首版范围。',
  };
}

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
