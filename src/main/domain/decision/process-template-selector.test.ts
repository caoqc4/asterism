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
    nextStep: 'Need stakeholder approval',
    waitingReason: null,
    activeWaitingItem: null,
    activeBlocker: null,
    riskLevel: 'high',
    riskNote: 'Approval is overdue',
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
        blockerId: null,
        title: '暂无当前阻塞项',
        detail: null,
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
      nextSuggestedMove: '处理当前风险并确认是否需要降级：Approval is overdue',
    },
    artifacts: [],
    sourceContexts: [],
    processTemplates: [
      {
        id: 'process_template_1',
        title: 'Escalation skill',
        summary: 'Frame urgent approvals clearly',
        content: '1. Explain risk\n2. Explain urgency',
        kind: 'skill',
        tags: ['risk'],
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

describe('DecisionProcessTemplateSelector', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it('includes priority-lane guidance in decision template selection prompts', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        shouldUse: true,
        selectedTemplateIds: ['process_template_1'],
        reason: '当前更偏升级处理，适合参考 escalation 模板。',
      },
    });

    const { DecisionProcessTemplateSelector } = await import('./process-template-selector.js');
    const selector = new DecisionProcessTemplateSelector();

    const result = await selector.select(
      buildTaskDetail(),
      {
        taskId: 'task_1',
        note: 'Need stakeholder sign-off',
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
    expect(result.reason).toBe('当前更偏升级处理，适合参考 escalation 模板。');
  });
});
