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
        responsibilitySummary: null,
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

  it('injects applicable confirmed work habits into run prompts', async () => {
    generateTextMock.mockResolvedValue({ text: 'Generated output' });
    const executor = new TextExecutor();

    await executor.execute(
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
      {
        applicableWorkHabitSummaries: [
          '数据报告初稿完成后先内部评审再对外发送（范围：全局；例：Q1 财报）',
        ],
      },
    );

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('执行时遵循以下已确认工作习惯：'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('- 数据报告初稿完成后先内部评审再对外发送（范围：全局；例：Q1 财报）'),
      }),
    );
  });

  it('asks agent runs for constrained JSON step proposals', async () => {
    generateTextMock.mockResolvedValue({ text: '{"finalOutput":"Generated output","steps":[]}' });
    const executor = new TextExecutor();

    await executor.execute(
      buildTaskDetail(),
      {
        taskId: 'task_1',
        type: 'agent',
        instructions: 'Create a local note',
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
        prompt: expect.stringContaining('你必须只输出一个合法 JSON 对象'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"tool": "artifact.create_note"'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"tool": "task.inspect_timeline"'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('只能使用 task.inspect_context、task.inspect_timeline、artifact.create_note'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('不允许使用 workspace.search 或 workspace.read_file'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining('"tool": "workspace.search"'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining('"tool": "task.update_next_step"'),
      }),
    );
  });

  it('allows task update/evidence tools in agent prompts only when explicitly enabled', async () => {
    generateTextMock.mockResolvedValue({ text: '{"finalOutput":"Generated output","steps":[]}' });
    const executor = new TextExecutor();

    await executor.execute(
      buildTaskDetail(),
      {
        taskId: 'task_1',
        type: 'agent',
        instructions: 'Update task fields',
        allowTaskMutationTools: true,
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
        prompt: expect.stringContaining('"tool": "task.update_next_step"'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"tool": "decision.draft"'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"tool": "task.review_completion_evidence"'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('不能满足完成标准，也不能把任务转为 completed'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('每次计划最多使用一个任务内更新/证据工具'),
      }),
    );
  });

  it('allows workspace read tools in agent prompts only when explicitly enabled', async () => {
    generateTextMock.mockResolvedValue({ text: '{"finalOutput":"Generated output","steps":[]}' });
    const executor = new TextExecutor();

    await executor.execute(
      buildTaskDetail(),
      {
        taskId: 'task_1',
        type: 'agent',
        instructions: 'Inspect local context',
        allowLocalWorkspaceRead: true,
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
        prompt: expect.stringContaining('workspace.search'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('workspace.read_file'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('不允许请求写文件、打补丁、运行命令或访问工作区外路径'),
      }),
    );
  });
});
