import { describe, expect, it, vi } from 'vitest';

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

import type { TaskDetail } from '../../shared/types/task.js';
import { TextExecutor } from './text-executor.js';

function buildTaskDetail(): TaskDetail {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state: 'planned',
    nextStep: 'Draft the response',
    waitingReason: null,
    activeWaitingItem: null,
    activeBlocker: {
      id: 'blocker_1',
      taskId: 'task_1',
      title: 'Waiting on legal sign-off',
      kind: 'approval',
      detail: 'Legal has not approved the outbound copy yet.',
      owner: 'Legal',
      sourceContextId: null,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
    },
    riskLevel: 'medium',
    riskNote: 'Need confirmation soon',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    resumeCard: {
      summary: 'Resume summary',
      currentState: '状态：planned',
      latestChange: {
        summary: '最近没有新的生命周期变化。',
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
      },
      completionStatus: {
        total: 0,
        satisfied: 0,
        open: 0,
        summary: '尚未定义完成标准',
      },
      keySource: {
        sourceContextId: null,
        title: '暂无关键来源',
        detail: null,
        priorityReason: null,
      },
      currentMethod: {
        templateId: null,
        title: '暂无方法模板',
        detail: null,
        selectionReason: null,
      },
      currentBlocker: {
        blockerId: 'blocker_1',
        title: 'Waiting on legal sign-off',
        detail: 'Legal has not approved the outbound copy yet.',
      },
      nextSuggestedMove: '先解除阻塞项，再继续推进：Waiting on legal sign-off',
    },
    artifacts: [],
    completionCriteria: [],
    sourceContexts: [],
    processTemplates: [],
    availableProcessTemplates: [],
    timeline: [],
  };
}

describe('TextExecutor', () => {
  it('injects priority-lane guidance into run prompts', async () => {
    generateTextMock.mockResolvedValue({ text: 'Generated output' });
    const executor = new TextExecutor();

    const result = await executor.execute(
      buildTaskDetail(),
      {
        taskId: 'task_1',
        type: 'draft',
        instructions: 'Please draft the escalation update',
      },
      {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
        featureFlags: {
          enableScheduler: true,
        },
      },
    );

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('当前优先级语义：立即升级。组织输出时优先帮助用户升级处理高风险或长期阻塞事项。'),
      }),
    );
    expect(result).toBe('Generated output');
  });
});
