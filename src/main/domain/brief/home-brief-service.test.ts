import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { BlockerRecord } from '../../../shared/types/blocker.js';
import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
import type { RunRecord } from '../../../shared/types/run.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import type { TaskListItemRecord } from '../../../shared/types/task.js';
import type { WaitingItemRecord } from '../../../shared/types/waiting-item.js';
import { HomeBriefService } from './home-brief-service.js';

function buildTask(partial: Partial<TaskListItemRecord>): TaskListItemRecord {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? 'Task',
    summary: partial.summary ?? null,
    state: partial.state ?? 'planned',
    nextStep: partial.nextStep ?? null,
    waitingReason: partial.waitingReason ?? null,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    activeBlocker: partial.activeBlocker ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildBlocker(partial: Partial<BlockerRecord>): BlockerRecord {
  return {
    id: partial.id ?? 'blocker_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? 'Legal approval pending',
    kind: partial.kind ?? 'approval',
    detail: partial.detail ?? 'Need sign-off',
    owner: partial.owner ?? 'Legal',
    sourceContextId: partial.sourceContextId ?? null,
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildWaitingItem(partial: Partial<WaitingItemRecord>): WaitingItemRecord {
  return {
    id: partial.id ?? 'waiting_1',
    taskId: partial.taskId ?? 'task_1',
    reason: partial.reason ?? 'Waiting',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildDecision(partial: Partial<DecisionRecord>): DecisionRecord {
  return {
    id: partial.id ?? 'decision_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? 'Decision',
    status: partial.status ?? 'pending',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildRun(partial: Partial<RunRecord>): RunRecord {
  return {
    id: partial.id ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    type: partial.type ?? 'draft',
    status: partial.status ?? 'completed',
    instructions: partial.instructions ?? null,
    output: partial.output ?? null,
    outputSource: partial.outputSource ?? null,
    failureReason: partial.failureReason ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildArtifact(partial: Partial<ArtifactRecord>): ArtifactRecord {
  return {
    id: partial.id ?? 'artifact_1',
    taskId: partial.taskId ?? 'task_1',
    sourceType: partial.sourceType ?? 'run',
    sourceId: partial.sourceId ?? 'run_1',
    kind: partial.kind ?? 'run_output',
    title: partial.title ?? 'draft output',
    content: partial.content ?? 'Generated output',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildAppliedProcessTemplate(
  partial: Partial<AppliedProcessTemplateRecord>,
): AppliedProcessTemplateRecord {
  return {
    id: partial.id ?? 'process_template_1',
    title: partial.title ?? 'Risk review skill',
    summary: partial.summary ?? 'Prioritize risk and blockers',
    content: partial.content ?? '1. Review risks\n2. Highlight blockers',
    kind: partial.kind ?? 'skill',
    tags: partial.tags ?? ['risk'],
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    archivedAt: partial.archivedAt ?? null,
    bindingId: partial.bindingId ?? 'task_process_binding_1',
    taskId: partial.taskId ?? 'task_1',
    bindingStatus: partial.bindingStatus ?? 'active',
    bindingNote: partial.bindingNote ?? null,
    boundAt: partial.boundAt ?? '2026-01-01T00:00:00.000Z',
    bindingUpdatedAt: partial.bindingUpdatedAt ?? '2026-01-01T00:00:00.000Z',
    removedAt: partial.removedAt ?? null,
  };
}

function buildSourceContext(partial: Partial<SourceContextRecord>): SourceContextRecord {
  return {
    id: partial.id ?? 'source_context_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? 'Reference doc',
    kind: partial.kind ?? 'doc',
    isKey: partial.isKey ?? false,
    uri: partial.uri ?? 'https://example.com/reference',
    content: partial.content ?? null,
    note: partial.note ?? 'Use this as the primary source',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    archivedAt: partial.archivedAt ?? null,
  };
}

function buildTimelineDetail(
  events: Array<{ type: string; payload?: Record<string, unknown> | null }>,
) {
  return {
    timeline: events.map((event, index) => ({
      id: `timeline_${index}`,
      taskId: 'task_1',
      type: event.type,
      payload: event.payload ? JSON.stringify(event.payload) : null,
      createdAt: `2026-01-01T00:00:0${index}.000Z`,
    })),
  };
}

describe('HomeBriefService', () => {
  it('aggregates waiting, high-risk, and missing-next-step task signals', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_waiting',
            title: 'Waiting task',
            state: 'waiting_external',
            waitingReason: 'Waiting for reply',
            nextStep: 'Follow up on Friday',
          }),
          buildTask({
            id: 'task_risk',
            title: 'High risk task',
            state: 'running',
            riskLevel: 'high',
            riskNote: 'Deadline slipping',
            nextStep: 'Escalate today',
          }),
          buildTask({
            id: 'task_missing',
            title: 'Missing next step',
            state: 'planned',
            nextStep: null,
          }),
          buildTask({
            id: 'task_done',
            title: 'Done task',
            state: 'completed',
          }),
        ]),
        getDetail: vi.fn().mockImplementation(async (taskId: string) => {
          if (taskId === 'task_risk') {
            return buildTimelineDetail([
              {
                type: 'source_context.updated',
                payload: {
                  sourceContextId: 'source_context_risk',
                  title: 'Escalation source memo',
                },
              },
              {
                type: 'process_template.selected',
                payload: {
                  sourceType: 'run',
                  sourceId: 'run_1',
                  templateIds: ['process_template_risk'],
                  titles: ['Risk review skill'],
                  reason: '高风险任务需要先按风险复盘方法组织输出。',
                },
              },
            ]);
          }

          return buildTimelineDetail([]);
        }),
      } as never,
      {
        getActiveForTask: vi.fn().mockImplementation(async (taskId: string) =>
          taskId === 'task_waiting'
            ? buildWaitingItem({
                taskId,
                reason: 'Waiting for reviewer confirmation',
              })
            : null,
        ),
      } as never,
      null as never,
      {
        list: vi.fn().mockResolvedValue([
          buildDecision({ status: 'pending' }),
          buildDecision({ id: 'decision_2', status: 'approved' }),
        ]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([buildRun({}), buildRun({ id: 'run_2' })]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([
          buildArtifact({
            taskId: 'task_risk',
            sourceId: 'run_2',
            content: 'Escalation draft',
          }),
        ]),
      } as never,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([
          buildSourceContext({
            id: 'source_context_risk',
            taskId: 'task_risk',
            title: 'Escalation source memo',
            note: 'Contains the latest owner-facing language',
            updatedAt: '2026-01-01T01:30:00.000Z',
          }),
        ]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      () => null,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([
          buildAppliedProcessTemplate({
            id: 'process_template_risk',
            title: 'Risk review skill',
            taskId: 'task_risk',
            bindingNote: 'Use for escalation and risk-heavy work',
          }),
          buildAppliedProcessTemplate({
            id: 'process_template_risk',
            title: 'Risk review skill',
            taskId: 'task_waiting',
            bindingId: 'task_process_binding_2',
            bindingNote: 'Also helps summarize waiting blockers',
          }),
        ]),
      } as never,
    );

    const homeData = await service.getHomeData();

    expect(homeData.activeTaskCount).toBe(3);
    expect(homeData.completedTaskCount).toBe(1);
    expect(homeData.pendingDecisionCount).toBe(1);
    expect(homeData.recentRunCount).toBe(2);
    expect(homeData.waitingTaskCount).toBe(1);
    expect(homeData.highRiskTaskCount).toBe(1);
    expect(homeData.missingNextStepTaskCount).toBe(1);
    expect(homeData.waitingTasks.map((task) => task.id)).toEqual(['task_waiting']);
    expect(homeData.highRiskTasks.map((task) => task.id)).toEqual(['task_risk']);
    expect(homeData.missingNextStepTasks.map((task) => task.id)).toEqual(['task_missing']);
    expect(homeData.recommendedActions.map((action) => action.id)).toEqual([
      'risk:task_risk',
      'decision:decision_1',
      'waiting:task_waiting',
      'next-step:task_missing',
      'artifact:artifact_1',
    ]);
    expect(homeData.recentActivity.map((event) => event.id)).toEqual([
      'decision:decision_2',
      'run:run_1',
      'run:run_2',
    ]);
    expect(homeData.recentActivity[0]).toMatchObject({
      sourceType: 'decision',
      sourceId: 'decision_2',
      taskTitle: 'task_1',
      status: 'approved',
    });
    expect(homeData.waitingTasks[0]?.activeWaitingItem?.reason).toBe(
      'Waiting for reviewer confirmation',
    );
    expect(homeData.recentArtifacts[0]?.content).toBe('Escalation draft');
    expect(homeData.recentSourceContexts).toEqual([
      {
        id: 'source_context_risk',
        taskId: 'task_risk',
        taskTitle: 'High risk task',
        title: 'Escalation source memo',
        kind: 'doc',
        isKey: false,
        uri: 'https://example.com/reference',
        note: 'Contains the latest owner-facing language',
        updatedAt: '2026-01-01T01:30:00.000Z',
      },
    ]);
    expect(homeData.recentTaskResumes).toHaveLength(4);
    expect(homeData.recentTaskResumes[0]).toMatchObject({
      taskId: 'task_waiting',
      currentState: '状态：waiting_external · 等待：Waiting for reviewer confirmation',
      latestChange: {
        summary: '最近没有新的关键变化。',
      },
      currentBlocker: {
        title: null,
        priorityReason: null,
      },
      currentMethod: {
        title: 'Risk review skill',
        selectionReason: '当前方法：Prioritize risk and blockers',
      },
      nextSuggestedMove: 'Follow up on Friday',
      contextActionLabel: '跟进等待项',
    });
    expect(homeData.recentTaskResumes[1]).toMatchObject({
      taskId: 'task_risk',
      currentState: '状态：running · 风险：high · Deadline slipping',
      latestChange: {
        summary: '最近关键来源更新：Escalation source memo',
      },
      currentBlocker: {
        title: null,
        priorityReason: null,
      },
      keySource: {
        title: 'Escalation source memo',
        priorityReason: '材料架最近更新了该来源。',
      },
      currentMethod: {
        title: 'Risk review skill',
        selectionReason: '当前方法最近用于执行：高风险任务需要先按风险复盘方法组织输出。',
      },
      nextSuggestedMove: 'Escalate today',
      contextActionLabel: '处理风险',
    });
    expect(homeData.recentTaskResumes[2]).toMatchObject({
      taskId: 'task_missing',
      currentBlocker: {
        title: null,
        priorityReason: null,
      },
      nextSuggestedMove: '先补一个明确的下一步。',
      contextActionLabel: '采用建议下一步',
    });
    expect(homeData.recentTaskResumes[3]).toMatchObject({
      taskId: 'task_done',
      currentBlocker: {
        title: null,
        priorityReason: null,
      },
      nextSuggestedMove: '先补一个明确的下一步。',
      contextActionLabel: '采用建议下一步',
    });
    expect(homeData.processTemplateCandidates).toEqual([
      {
        id: 'process_template_risk',
        title: 'Risk review skill',
        summary: 'Prioritize risk and blockers',
        content: '1. Review risks\n2. Highlight blockers',
        kind: 'skill',
        tags: ['risk'],
        taskIds: ['task_risk', 'task_waiting'],
        taskTitles: ['High risk task', 'Waiting task'],
        notes: [
          'Use for escalation and risk-heavy work',
          'Also helps summarize waiting blockers',
        ],
      },
    ]);
    expect(homeData.recommendedActions.find((action) => action.id === 'waiting:task_waiting')?.reason).toBe(
      'Waiting for reviewer confirmation',
    );
    expect(homeData.recommendedActions.find((action) => action.id === 'risk:task_risk')?.intent).toEqual({
      type: 'focus_risk_review',
      focusArea: 'detail',
      prefillNextStep: '处理当前风险并确认是否需要降级：Deadline slipping',
      prefillRiskLevel: 'high',
      prefillRiskNote: 'Deadline slipping',
    });
    expect(homeData.recommendedActions.find((action) => action.id === 'artifact:artifact_1')?.intent).toEqual({
      type: 'continue_from_artifact',
      focusArea: 'detail',
      prefillNextStep: '基于产物继续推进：draft output',
      prefillRunInstructions: '请基于这份已有产物继续扩展、改写或整理：Escalation draft',
    });
  });

  it('returns a steady-state recommendation when there is no urgent work', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_done',
            title: 'Done task',
            state: 'completed',
            nextStep: 'Archive it',
          }),
        ]),
        getDetail: vi.fn().mockResolvedValue(buildTimelineDetail([])),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      null as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      () => null,
      null,
    );

    const homeData = await service.getHomeData();

    expect(homeData.recommendedActions).toEqual([
      {
        id: 'steady-state',
        label: '当前无需额外干预',
        reason: '暂时没有高风险、等待阻塞或缺少下一步的活跃任务。',
        taskId: null,
        priority: 'low',
        intent: {
          type: 'open_task',
        },
      },
    ]);
    expect(homeData.recentActivity).toEqual([]);
    expect(homeData.processTemplateCandidates).toEqual([]);
  });

  it('does not recommend artifact follow-up when the artifact belongs to an inactive task', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_done',
            title: 'Done task',
            state: 'completed',
          }),
        ]),
        getDetail: vi.fn().mockResolvedValue(buildTimelineDetail([])),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      null as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([
          buildArtifact({
            taskId: 'task_done',
            title: 'completed draft',
          }),
        ]),
      } as never,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      () => null,
      null,
    );

    const homeData = await service.getHomeData();

    expect(homeData.recommendedActions).toEqual([
      {
        id: 'steady-state',
        label: '当前无需额外干预',
        reason: '暂时没有高风险、等待阻塞或缺少下一步的活跃任务。',
        taskId: null,
        priority: 'low',
        intent: {
          type: 'open_task',
        },
      },
    ]);
    expect(homeData.recentActivity).toEqual([]);
  });

  it('recommends source-context follow-up when source materials are the best next handle', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_source_focus',
            title: 'Source-driven task',
            state: 'planned',
            nextStep: 'Review the latest material',
          }),
          buildTask({
            id: 'task_source_missing',
            title: 'Missing-next-step task',
            state: 'planned',
            nextStep: null,
          }),
        ]),
        getDetail: vi.fn().mockResolvedValue(buildTimelineDetail([])),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      null as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([
          buildSourceContext({
            id: 'source_context_focus',
            taskId: 'task_source_focus',
            title: 'Partner website shortlist',
            kind: 'website_list',
            uri: null,
            note: '最新整理的外链目标站点',
            updatedAt: '2026-01-02T00:00:00.000Z',
          }),
          buildSourceContext({
            id: 'source_context_missing',
            taskId: 'task_source_missing',
            title: 'Research notes',
            kind: 'note',
            uri: null,
            note: '缺下一步前先回看这些整理笔记',
            updatedAt: '2026-01-01T23:30:00.000Z',
          }),
        ]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      () => null,
      null,
    );

    const homeData = await service.getHomeData();

    expect(homeData.recommendedActions.map((action) => action.id)).toEqual([
      'next-step:task_source_missing',
      'source-context:source_context_focus',
      'source-context:next-step:source_context_missing',
    ]);
    expect(homeData.recommendedActions[1]).toMatchObject({
      label: '基于最新来源继续推进：Source-driven task',
      reason: '来源材料“Partner website shortlist”最近有更新，可据此继续推进。',
      taskId: 'task_source_focus',
      priority: 'low',
      intent: {
        type: 'focus_source_context',
        focusArea: 'detail',
        sourceContextId: 'source_context_focus',
        prefillNextStep: '基于来源材料继续推进：Partner website shortlist',
      },
    });
    expect(homeData.recommendedActions[2]).toMatchObject({
      label: '先查看关键来源，再补下一步：Missing-next-step task',
      reason: '该任务还缺少明确下一步，先参考来源材料“Research notes”。',
      taskId: 'task_source_missing',
      priority: 'medium',
      intent: {
        type: 'focus_source_context',
        focusArea: 'detail',
        sourceContextId: 'source_context_missing',
        prefillNextStep: '先吸收来源材料，再补下一步：Research notes',
      },
    });
    expect(homeData.recentTaskResumes.map((item) => item.taskId)).toEqual([
      'task_source_focus',
      'task_source_missing',
    ]);
  });

  it('prioritizes key source contexts ahead of newer non-key sources', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_key_source',
            title: 'Key source task',
            state: 'planned',
            nextStep: 'Review source updates',
          }),
        ]),
        getDetail: vi.fn().mockResolvedValue(buildTimelineDetail([])),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      null as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([
          buildSourceContext({
            id: 'source_context_non_key',
            taskId: 'task_key_source',
            title: 'Fresh non-key memo',
            isKey: false,
            updatedAt: '2026-01-03T00:00:00.000Z',
          }),
          buildSourceContext({
            id: 'source_context_key',
            taskId: 'task_key_source',
            title: 'Pinned source brief',
            isKey: true,
            updatedAt: '2026-01-02T00:00:00.000Z',
          }),
        ]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      () => null,
      null,
    );

    const homeData = await service.getHomeData();

    expect(homeData.recentSourceContexts.map((item) => item.id)).toEqual([
      'source_context_key',
      'source_context_non_key',
    ]);
    expect(homeData.recommendedActions[0]).toMatchObject({
      id: 'source-context:source_context_key',
      label: '基于最新来源继续推进：Key source task',
      intent: {
        type: 'focus_source_context',
        sourceContextId: 'source_context_key',
      },
    });
  });

  it('surfaces active blockers in resume previews and recommended actions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));

    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_blocked',
            title: 'Blocked task',
            state: 'planned',
            nextStep: null,
          }),
        ]),
        getDetail: vi.fn().mockResolvedValue(buildTimelineDetail([])),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([
          buildBlocker({
            taskId: 'task_blocked',
            title: 'Legal approval pending',
            detail: 'Need formal sign-off',
            sourceContextId: 'source_context_blocker',
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
        ]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([
          buildSourceContext({
            id: 'source_context_blocker',
            taskId: 'task_blocked',
            title: 'Legal brief',
            isKey: true,
          }),
        ]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      () => null,
      null,
    );

    const homeData = await service.getHomeData();

    expect(homeData.recommendedActions[0]).toMatchObject({
      id: 'blocker:blocker_1',
      label: '优先升级阻塞项：Blocked task',
      reason: '当前阻塞原因：Need formal sign-off 已阻塞 9 天，值得优先处理。',
      priority: 'high',
      intent: {
        type: 'focus_source_context',
        sourceContextId: 'source_context_blocker',
      },
    });
    expect(homeData.recommendedActions[1]).toMatchObject({
      id: 'next-step:task_blocked',
    });
    expect(homeData.recentTaskResumes[0]).toMatchObject({
      currentState: '状态：planned · 阻塞：Legal approval pending',
      latestChange: {
        summary: '当前阻塞项：Legal approval pending',
      },
      currentBlocker: {
        title: 'Legal approval pending',
        priorityReason: '当前阻塞原因：Need formal sign-off 已阻塞 9 天，值得优先处理。',
        ageLabel: 'blocked since 2026-01-01 · 已阻塞 9 天',
      },
      nextSuggestedMove: '优先升级当前阻塞项：Legal approval pending',
      contextActionLabel: '升级处理阻塞项',
    });

    vi.useRealTimers();
  });

  it('orders blocked tasks and blocker-driven actions by blocker age', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));

    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({ id: 'task_newer_blocked', title: 'Newer blocked task', state: 'planned' }),
          buildTask({ id: 'task_older_blocked', title: 'Older blocked task', state: 'planned' }),
        ]),
        getDetail: vi.fn().mockResolvedValue(buildTimelineDetail([])),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([
          buildBlocker({
            id: 'blocker_newer',
            taskId: 'task_newer_blocked',
            title: 'Newer blocker',
            createdAt: '2026-01-09T00:00:00.000Z',
          }),
          buildBlocker({
            id: 'blocker_older',
            taskId: 'task_older_blocked',
            title: 'Older blocker',
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
        ]),
      } as never,
      { list: vi.fn().mockResolvedValue([]) } as never,
      { list: vi.fn().mockResolvedValue([]) } as never,
      { listRecent: vi.fn().mockResolvedValue([]) } as never,
      { listActiveForTasks: vi.fn().mockResolvedValue([]) } as never,
      { listRecent: vi.fn().mockResolvedValue([]) } as never,
      () => null,
      null,
    );

    const homeData = await service.getHomeData();

    expect(homeData.escalationTaskCount).toBe(1);
    expect(homeData.escalationTasks[0]?.title).toBe('Older blocked task');
    expect(homeData.blockerTaskCount).toBe(1);
    expect(homeData.blockerTasks[0]?.title).toBe('Newer blocked task');
    expect(homeData.recommendedActions[0]?.label).toBe('优先升级阻塞项：Older blocked task');

    vi.useRealTimers();
  });

  it('prioritizes the latest lifecycle change when deriving home resume preview suggestions', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_resume_change',
            title: 'Resume from latest change',
            state: 'planned',
            nextStep: null,
            riskLevel: 'high',
            riskNote: 'Needs escalation',
          }),
        ]),
        getDetail: vi.fn().mockResolvedValue(buildTimelineDetail([])),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      null as never,
      {
        list: vi.fn().mockResolvedValue([
          buildDecision({
            id: 'decision_resume_change',
            taskId: 'task_resume_change',
            title: 'Approve escalation path',
            status: 'approved',
            updatedAt: '2026-01-02T00:00:00.000Z',
          }),
        ]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      () => null,
      null,
    );

    const homeData = await service.getHomeData();

    expect(homeData.recentTaskResumes).toHaveLength(1);
    expect(homeData.recentTaskResumes[0]).toMatchObject({
      taskId: 'task_resume_change',
      latestChange: {
        summary: '最近决策动态：Approve escalation path · approved',
      },
      nextSuggestedMove: '已获批准，继续推进：Approve escalation path',
      contextActionLabel: '继续推进任务',
    });
  });
});
