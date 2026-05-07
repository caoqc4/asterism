import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateObjectMock = vi.fn();

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
}));

import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import type { TaskDetail } from '../../../shared/types/task.js';

function buildSourceContext(partial: Partial<SourceContextRecord>): SourceContextRecord {
  return {
    archivedAt: null,
    content: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    id: partial.id ?? 'source_context_1',
    isKey: partial.isKey ?? true,
    kind: partial.kind ?? 'note',
    note: partial.note ?? null,
    status: partial.status ?? 'active',
    taskId: 'task_1',
    title: partial.title ?? 'Source context',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    uri: null,
    ...partial,
  };
}

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
      responsibility: null,
      responsibilityLabel: null,
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
      currentBlocker: {
        blockerId: 'blocker_1',
        title: 'Waiting on legal sign-off',
        detail: 'Legal has not approved the copy yet.',
        responsibilitySummary: null,
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
    completionCriteria: [],
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

  it('uses only the latest active key sources in run template selection prompts', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        shouldUse: false,
        selectedTemplateIds: [],
        reason: '无需模板。',
      },
    });

    const task = buildTaskDetail();
    task.sourceContexts = [
      buildSourceContext({ id: 'source_old', title: '旧邮件', note: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_inactive', title: '归档材料', status: 'archived', updatedAt: '2026-01-05T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_ignore', title: '普通备注', isKey: false, updatedAt: '2026-01-06T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_2', title: 'CEO 批注', note: 'ceo', updatedAt: '2026-01-02T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_3', title: '法务意见', note: 'legal', updatedAt: '2026-01-03T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_4', title: '财务复核', note: 'finance', updatedAt: '2026-01-04T00:00:00.000Z' }),
    ];

    const { ProcessTemplateSelector } = await import('./process-template-selector.js');
    const selector = new ProcessTemplateSelector();

    await selector.select(
      task,
      {
        taskId: 'task_1',
        type: 'draft',
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

    const prompt = generateObjectMock.mock.calls[0]?.[0]?.prompt as string;
    expect(prompt).toContain('关键来源材料：');
    expect(prompt).toContain('- 财务复核 [note] | finance');
    expect(prompt).toContain('- 法务意见 [note] | legal');
    expect(prompt).toContain('- CEO 批注 [note] | ceo');
    expect(prompt).not.toContain('旧邮件');
    expect(prompt).not.toContain('归档材料');
    expect(prompt).not.toContain('普通备注');
  });

  it('skips model selection when the task has no active process templates', async () => {
    const { ProcessTemplateSelector } = await import('./process-template-selector.js');
    const selector = new ProcessTemplateSelector();
    const task = buildTaskDetail();
    task.processTemplates = task.processTemplates.map((item) => ({
      ...item,
      bindingStatus: 'removed',
      removedAt: '2026-01-02T00:00:00.000Z',
    }));

    const result = await selector.select(
      task,
      {
        taskId: 'task_1',
        type: 'draft',
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

    expect(result).toEqual({
      shouldUse: false,
      selectedTemplates: [],
      reason: '当前任务未挂载任何 process template。',
    });
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('does not enable template usage when selected ids do not match active templates', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        shouldUse: true,
        selectedTemplateIds: ['missing_template'],
        reason: '模型返回了一个不存在的模板。',
      },
    });

    const { ProcessTemplateSelector } = await import('./process-template-selector.js');
    const selector = new ProcessTemplateSelector();

    const result = await selector.select(
      buildTaskDetail(),
      {
        taskId: 'task_1',
        type: 'draft',
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

    expect(result).toEqual({
      shouldUse: false,
      selectedTemplates: [],
      reason: '模型返回了一个不存在的模板。',
    });
  });
});
