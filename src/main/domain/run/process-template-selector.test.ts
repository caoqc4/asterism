import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateObjectMock = vi.fn();

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
}));

import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
import type { TaskDetail } from '../../../shared/types/task.js';

function buildTaskDetail(): TaskDetail {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state: 'planned',
    nextStep: 'Draft response',
    waitingReason: null,
    activeWaitingItem: null,
    activeBlocker: {
      id: 'blocker_1',
      taskId: 'task_1',
      title: 'Waiting on legal sign-off',
      kind: 'approval',
      detail: 'Legal has not approved the copy yet.',
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
      currentBlocker: {
        blockerId: 'blocker_1',
        title: 'Waiting on legal sign-off',
        detail: 'Legal has not approved the copy yet.',
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
      nextSuggestedMove: '先解除阻塞项，再继续推进：Waiting on legal sign-off',
    },
    artifacts: [],
    sourceContexts: [],
    processTemplates: [
      {
        id: 'process_template_1',
        title: 'Approval skill',
        summary: 'Structure unblock requests clearly',
        content: '1. Summarize blocker\n2. Ask for approval',
        kind: 'skill',
        tags: ['approval'],
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
        bindingId: 'binding_1',
        taskId: 'task_1',
        bindingStatus: 'active',
        bindingNote: null,
        boundAt: '2026-01-01T00:00:00.000Z',
        bindingUpdatedAt: '2026-01-01T00:00:00.000Z',
        removedAt: null,
      },
    ] satisfies AppliedProcessTemplateRecord[],
    availableProcessTemplates: [],
    timeline: [],
  };
}

describe('ProcessTemplateSelector', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it('includes priority-lane guidance in run template selection prompts', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        shouldUse: true,
        selectedTemplateIds: ['process_template_1'],
        reason: '当前更偏解阻塞，适合参考审批模板。',
      },
    });

    const { ProcessTemplateSelector } = await import('./process-template-selector.js');
    const selector = new ProcessTemplateSelector();

    const result = await selector.select(
      buildTaskDetail(),
      {
        taskId: 'task_1',
        type: 'draft',
        instructions: 'Draft a blocker update',
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

    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('当前优先级语义：立即升级。组织输出时优先帮助用户升级处理高风险或长期阻塞事项。'),
      }),
    );
    expect(result.reason).toBe('当前更偏解阻塞，适合参考审批模板。');
  });
});
