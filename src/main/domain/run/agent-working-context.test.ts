import { describe, expect, it } from 'vitest';

import type { TaskDetail } from '../../../shared/types/task.js';
import { TASKPLANE_AGENT_PRINCIPLES } from '../../../shared/agent-principles.js';
import { buildAgentRunRequest, buildAgentWorkingContext, formatAgentRunRequestForStep } from './agent-working-context.js';

type SourceContext = TaskDetail['sourceContexts'][number];

function buildSourceContext(partial: Partial<SourceContext>): SourceContext {
  return {
    archivedAt: null,
    content: 'Source content',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: partial.id ?? 'source_1',
    isKey: partial.isKey ?? true,
    kind: partial.kind ?? 'note',
    note: partial.note ?? null,
    status: partial.status ?? 'active',
    taskId: 'task_1',
    title: partial.title ?? 'Source',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    uri: null,
    ...partial,
  };
}

function buildTaskDetail(): TaskDetail {
  return {
    id: 'task_1',
    title: 'Agent context task',
    summary: 'Prepare the launch note',
    state: 'running',
    nextStep: 'Draft the note',
    waitingReason: null,
    activeWaitingItem: null,
    activeBlocker: {
      id: 'blocker_1',
      taskId: 'task_1',
      title: 'Legal review',
      kind: 'approval',
      detail: 'Need legal to approve the claim',
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
    riskNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    resumeCard: {
      summary: 'Resume the launch note.',
      currentState: '状态：running',
      latestChange: {
        summary: '最近没有新的生命周期变化。',
        action: { label: null, targetType: null, targetId: null },
      },
      completionStatus: {
        total: 2,
        satisfied: 1,
        open: 1,
        summary: '已满足 1/2 条完成标准',
        nextOpenCriterion: 'Legal approved the launch claim',
      },
      keySource: {
        sourceContextId: 'source_1',
        title: 'Launch source',
        detail: 'Primary source',
        priorityReason: null,
      },
      currentMethod: {
        templateId: 'process_template_1',
        title: 'Launch writing skill',
        detail: null,
        selectionReason: null,
      },
      currentBlocker: {
        blockerId: 'blocker_1',
        title: 'Legal review',
        detail: 'Need legal to approve the claim',
      },
      nextSuggestedMove: 'Draft the note',
    },
    artifacts: [
      {
        id: 'artifact_1',
        taskId: 'task_1',
        sourceType: 'run',
        sourceId: 'run_1',
        kind: 'note',
        title: 'launch_note.md',
        content: 'Draft launch note',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
      {
        id: 'artifact_2',
        taskId: 'task_1',
        sourceType: 'run',
        sourceId: 'run_2',
        kind: 'browser_evidence',
        title: 'qa_screenshot.png',
        content: 'screenshot path',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-04T00:00:00.000Z',
      },
    ],
    completionCriteria: [],
    taskFiles: [
      {
        id: 'task_file_1',
        taskId: 'task_1',
        name: 'Task.md',
        path: 'Task.md',
        kind: 'file',
        content: '# Task\n\nCurrent recovery context.',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    sourceContexts: [
      buildSourceContext({
        content: 'This is the source content that should be summarized for the agent context.',
        id: 'source_1',
        note: 'Primary source',
        title: 'Launch source',
        uri: 'https://example.com/launch',
      }),
    ],
    processTemplates: [
      {
        id: 'process_template_1',
        title: 'Launch writing skill',
        summary: 'Use the launch-note style',
        content: 'Write clearly',
        kind: 'skill',
        tags: [],
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
    ],
    availableProcessTemplates: [],
    timeline: [
      {
        id: 'timeline_1',
        taskId: 'task_1',
        type: 'task.created',
        payload: JSON.stringify({ title: 'Agent context task' }),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
}

describe('agent working context', () => {
  it('assembles task context for agent run requests', () => {
    const task = buildTaskDetail();
    const context = buildAgentWorkingContext(task);

    expect(context.productPrinciples).toBe(TASKPLANE_AGENT_PRINCIPLES);
    expect(context.task.title).toBe('Agent context task');
    expect(context.priorityLane).toBe('escalate_now');
    expect(context.completion).toMatchObject({
      total: 2,
      satisfied: 1,
      open: 1,
      nextOpenCriterion: 'Legal approved the launch claim',
    });
    expect(context.blockers[0]).toMatchObject({ title: 'Legal review', owner: 'Legal' });
    expect(context.sources[0]).toMatchObject({
      id: 'source_1',
      title: 'Launch source',
      isKey: true,
      status: 'active',
      updatedAt: '2026-01-01T00:00:00.000Z',
      uri: 'https://example.com/launch',
    });
    expect(context.artifacts.map((artifact) => artifact.title)).toEqual([
      'qa_screenshot.png',
      'launch_note.md',
    ]);
    expect(context.artifacts[1]?.contentPreview).toBe('Draft launch note');
    expect(context.processTemplates[0]).toMatchObject({ title: 'Launch writing skill' });
    expect(context.recentTimeline[0]).toMatchObject({
      type: 'task.created',
      dateGroup: '2026-01-01',
      objectFamily: '任务字段',
      priorityGroup: '留痕事件',
    });
  });

  it('limits agent source context to latest active key sources with active fallback', () => {
    const task = buildTaskDetail();
    task.sourceContexts = [
      buildSourceContext({ id: 'source_old', title: '旧邮件', updatedAt: '2026-01-01T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_inactive', title: '归档材料', status: 'archived', updatedAt: '2026-01-05T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_ignore', title: '普通备注', isKey: false, updatedAt: '2026-01-06T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_2', title: 'CEO 批注', updatedAt: '2026-01-02T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_3', title: '法务意见', updatedAt: '2026-01-03T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_4', title: '财务复核', updatedAt: '2026-01-04T00:00:00.000Z' }),
    ];

    expect(buildAgentWorkingContext(task).sources.map((source) => source.title)).toEqual([
      '财务复核',
      '法务意见',
      'CEO 批注',
    ]);

    task.sourceContexts = [
      buildSourceContext({ id: 'source_a', title: '普通备注 A', isKey: false, updatedAt: '2026-01-01T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_b', title: '普通备注 B', isKey: false, updatedAt: '2026-01-03T00:00:00.000Z' }),
      buildSourceContext({ id: 'source_c', title: '普通备注 C', isKey: false, updatedAt: '2026-01-02T00:00:00.000Z' }),
    ];

    expect(buildAgentWorkingContext(task).sources.map((source) => source.title)).toEqual([
      '普通备注 B',
      '普通备注 C',
      '普通备注 A',
    ]);
  });

  it('formats a compact plan-step summary from an agent run request', () => {
    const request = buildAgentRunRequest({
      run: {
        id: 'run_1',
        taskId: 'task_1',
        type: 'draft',
        status: 'running',
        instructions: 'Draft carefully',
        output: null,
        outputSource: null,
        failureReason: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      task: buildTaskDetail(),
      input: { taskId: 'task_1', type: 'draft', instructions: 'Draft carefully' },
      applicableWorkHabitSummaries: [
        '对外材料发布前先做一次事实核对（范围：全局；例：公告初稿）',
      ],
    });

    expect(request.goal).toBe('产出一份可继续编辑的工作草稿');
    expect(formatAgentRunRequestForStep(request)).toContain('优先级语义：escalate_now');
    expect(formatAgentRunRequestForStep(request)).toContain('可用产物：2');
    expect(formatAgentRunRequestForStep(request)).toContain('可用方法模板：1');
    expect(formatAgentRunRequestForStep(request)).toContain('适用工作习惯：1');
    expect(formatAgentRunRequestForStep(request)).toContain('产品原则：read-only');
    expect(formatAgentRunRequestForStep(request)).toContain('上下文装配：Runtime context assembly ready.');
    expect(formatAgentRunRequestForStep(request)).toContain('Do not store full chat transcripts');
    expect(formatAgentRunRequestForStep(request)).toContain(
      '- 对外材料发布前先做一次事实核对（范围：全局；例：公告初稿）',
    );
  });
});
