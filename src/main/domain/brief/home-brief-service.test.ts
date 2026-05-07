import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { BlockerRecord } from '../../../shared/types/blocker.js';
import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
import type { RunRecord, RunVerificationRecord } from '../../../shared/types/run.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import type { TaskDependencyRecord } from '../../../shared/types/task-dependency.js';
import type { TaskListItemRecord } from '../../../shared/types/task.js';
import type { WaitingItemRecord } from '../../../shared/types/waiting-item.js';
import type { CompletionCriteriaRecord } from '../../../shared/types/completion-criteria.js';
import { PANEL_CAPTURE_SUMMARY_PREFIX } from '../../../shared/panel-capture.js';
import { HomeBriefService } from './home-brief-service.js';

afterEach(() => {
  vi.useRealTimers();
});

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
    activeDependency: partial.activeDependency ?? null,
    dependencyReevaluation: partial.dependencyReevaluation ?? null,
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
    responsibility: partial.responsibility ?? null,
    responsibilityLabel: partial.responsibilityLabel ?? null,
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

function buildTaskDependency(partial: Partial<TaskDependencyRecord>): TaskDependencyRecord {
  return {
    id: partial.id ?? 'task_dependency_1',
    taskId: partial.taskId ?? 'task_1',
    blockedByTaskId: partial.blockedByTaskId ?? 'task_2',
    blockedByTaskTitle: partial.blockedByTaskTitle ?? 'Upstream task',
    reason: partial.reason ?? 'Need the upstream task to complete first',
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

function buildRunVerification(partial: Partial<RunVerificationRecord>): RunVerificationRecord {
  return {
    id: partial.id ?? 'run_verification_1',
    runId: partial.runId ?? 'run_1',
    targetType: partial.targetType ?? 'run',
    targetId: partial.targetId ?? partial.runId ?? 'run_1',
    tone: partial.tone ?? 'pass',
    label: partial.label ?? 'Run 验证通过',
    detail: partial.detail ?? '执行结果已有输出或步骤证据，可进入人工审查。',
    source: partial.source ?? 'lightweight_rule_engine',
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

function buildCompletionCriteria(
  partial: Partial<CompletionCriteriaRecord>,
): CompletionCriteriaRecord {
  return {
    id: partial.id ?? 'criteria_1',
    taskId: partial.taskId ?? 'task_1',
    text: partial.text ?? 'Final approval captured',
    verificationResponsibility: partial.verificationResponsibility ?? null,
    verificationResponsibilityLabel: partial.verificationResponsibilityLabel ?? null,
    status: partial.status ?? 'open',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    satisfiedAt: partial.satisfiedAt ?? null,
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
      'artifact:artifact_1',
      'waiting:task_waiting',
      'next-step:task_missing',
    ]);
    expect(homeData.recommendedActions.map((action) => action.lane)).toEqual([
      'escalate_now',
      'unblock_or_decide',
      'continue_or_review',
      'clarify',
      'clarify',
    ]);
    expect(homeData.priorityLane).toBe('escalate_now');
    expect(homeData.priorityHeadline).toBe('当前有 1 个高风险任务需要优先处理');
    expect(homeData.recentActivity.map((event) => event.id)).toEqual([
      'decision:decision_2',
      'run:run_1',
      'run:run_2',
    ]);
    expect(homeData.recentActivity[0]).toMatchObject({
      sourceType: 'decision',
      sourceId: 'decision_2',
      lane: 'continue_or_review',
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
    expect(homeData.recentTaskResumes.map((item) => item.taskId)).toEqual([
      'task_risk',
      'task_missing',
      'task_waiting',
      'task_done',
    ]);
    expect(homeData.recentTaskResumes[0]).toMatchObject({
      taskId: 'task_risk',
      lane: 'escalate_now',
      currentState: '状态：running · 风险：high · Deadline slipping',
      latestChange: {
        summary: '最近更新了来源材料：Escalation source memo。',
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
    expect(homeData.recentTaskResumes[1]).toMatchObject({
      taskId: 'task_missing',
      lane: 'clarify',
      currentBlocker: {
        title: null,
        priorityReason: null,
      },
      nextSuggestedMove: '先补一个明确的下一步。',
      contextActionLabel: '采用建议下一步',
    });
    expect(homeData.recentTaskResumes[2]).toMatchObject({
      taskId: 'task_waiting',
      lane: 'clarify',
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

  it('uses dependency-recovery summary wording when upstream work has just reopened a downstream task', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'));

    const upstreamTask = buildTask({
      id: 'task_upstream_done',
      title: 'Publish partner list',
      state: 'completed',
      updatedAt: '2026-01-08T00:00:00.000Z',
    });
    const downstreamTask = buildTask({
      id: 'task_downstream_resume',
      title: 'Resume outreach draft',
      state: 'planned',
      nextStep: null,
      updatedAt: '2026-01-09T00:00:00.000Z',
      activeDependency: buildTaskDependency({
        id: 'task_dependency_resume_link',
        taskId: 'task_downstream_resume',
        blockedByTaskId: 'task_upstream_done',
        blockedByTaskTitle: 'Publish partner list',
        reason: 'Need the approved partner list before drafting outreach.',
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z',
      }),
    });

    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([downstreamTask, upstreamTask]),
        getDetail: vi.fn().mockImplementation(async (taskId: string) => {
          if (taskId === upstreamTask.id) {
            return {
              ...buildTimelineDetail([]),
              id: upstreamTask.id,
              title: upstreamTask.title,
              state: upstreamTask.state,
              updatedAt: upstreamTask.updatedAt,
            };
          }

          return {
            ...buildTimelineDetail([]),
            id: downstreamTask.id,
            title: downstreamTask.title,
            state: downstreamTask.state,
            updatedAt: downstreamTask.updatedAt,
          };
        }),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      null,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      null,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      () => null,
      null,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([downstreamTask.activeDependency]),
      } as never,
    );

    const homeData = await service.getHomeData();

    expect(homeData.priorityLane).toBe('continue_or_review');
    expect(homeData.priorityHeadline).toBe('当前有 1 条任务依赖已具备恢复推进条件');
    expect(homeData.priorityLede).toBe(
      '当前最值得先处理的是依赖刚解除或上游任务刚就绪的任务；首页会优先提示重新判断是否解除依赖，再回到普通执行结果、产物和来源复核。 当前推进责任：当前主要由上游任务“Publish partner list”推进',
    );
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
        responsibilitySummary: null,
        taskId: null,
        priority: 'low',
        lane: 'steady',
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
        listActiveForTasks: vi.fn().mockResolvedValue([
          buildSourceContext({
            id: 'source_context_blocker_activity',
            taskId: 'task_blocker_source_activity',
            title: 'Updated source memo',
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

    expect(homeData.recommendedActions).toEqual([
      {
        id: 'steady-state',
        label: '当前无需额外干预',
        reason: '暂时没有高风险、等待阻塞或缺少下一步的活跃任务。',
        responsibilitySummary: null,
        taskId: null,
        priority: 'low',
        lane: 'steady',
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
      'source-context:source_context_focus',
      'next-step:task_source_missing',
      'source-context:next-step:source_context_missing',
    ]);
    expect(homeData.recommendedActions).toContainEqual(
      expect.objectContaining({
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
      }),
    );
    expect(homeData.recommendedActions).toContainEqual(
      expect.objectContaining({
      label: '先查看最近来源，再补下一步：Missing-next-step task',
      reason: '该任务还缺少明确下一步，先参考来源材料“Research notes”。',
      taskId: 'task_source_missing',
      priority: 'medium',
      intent: {
        type: 'focus_source_context',
        focusArea: 'detail',
        sourceContextId: 'source_context_missing',
        prefillNextStep: '先吸收来源材料，再补下一步：Research notes',
      },
      }),
    );
    expect(homeData.recentTaskResumes.map((item) => item.taskId)).toEqual([
      'task_source_missing',
      'task_source_focus',
    ]);
    expect(homeData.recentTaskResumes.find((item) => item.taskId === 'task_source_focus')).toMatchObject({
      latestChange: {
        summary: '最近来源材料更新：Partner website shortlist',
      },
      contextActionLabel: '查看来源材料',
    });
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

  it('recommends re-evaluating blockers when their linked source context updates', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_blocked_source',
            title: 'Blocked by source update',
            state: 'waiting_external',
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
            id: 'blocker_source',
            taskId: 'task_blocked_source',
            title: 'Partner list pending review',
            kind: 'document_or_material',
            detail: 'Need updated partner list before resuming outreach',
            sourceContextId: 'source_context_blocker_link',
            createdAt: '2026-01-02T00:00:00.000Z',
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
            id: 'source_context_blocker_link',
            taskId: 'task_blocked_source',
            title: 'Partner website shortlist',
            kind: 'website_list',
            uri: null,
            note: '最新整理的合作站点清单',
            updatedAt: '2026-01-03T00:00:00.000Z',
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

    expect(homeData.recommendedActions).toContainEqual(
      expect.objectContaining({
        id: 'source-context:blocker:source_context_blocker_link',
        label: '基于来源更新重新判断阻塞：Blocked by source update',
        reason: '阻塞来源材料“Partner website shortlist”最近有更新，可重新判断是否解除当前阻塞。',
        taskId: 'task_blocked_source',
        priority: 'high',
        intent: {
          type: 'focus_source_context',
          focusArea: 'detail',
          sourceContextId: 'source_context_blocker_link',
          prefillNextStep: '基于来源更新重新判断是否解除阻塞：Partner list pending review',
        },
      }),
    );
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
      id: 'source-context:blocker:source_context_blocker',
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

  it('surfaces blocker-linked source updates as recent blocker activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'));

    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_blocker_source_activity',
            title: 'Blocker source activity task',
            state: 'planned',
            nextStep: 'Review the updated source memo',
            activeBlocker: buildBlocker({
              id: 'blocker_activity_source',
              taskId: 'task_blocker_source_activity',
              title: 'Need revised outreach list',
              sourceContextId: 'source_context_blocker_activity',
              createdAt: '2026-04-23T00:00:00.000Z',
              updatedAt: '2026-04-23T00:00:00.000Z',
            }),
          }),
        ]),
        getDetail: vi.fn().mockResolvedValue(
          buildTimelineDetail([
            {
              type: 'source_context.updated',
              payload: {
                sourceContextId: 'source_context_blocker_activity',
                title: 'Updated source memo',
              },
            },
          ]),
        ),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      {
        listActiveForTasks: vi.fn().mockResolvedValue([
          buildBlocker({
            id: 'blocker_activity_source',
            taskId: 'task_blocker_source_activity',
            title: 'Need revised outreach list',
            sourceContextId: 'source_context_blocker_activity',
            createdAt: '2026-04-23T00:00:00.000Z',
            updatedAt: '2026-04-23T00:00:00.000Z',
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
            id: 'source_context_blocker_activity',
            taskId: 'task_blocker_source_activity',
            title: 'Updated source memo',
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

    expect(homeData.recentActivity).toContainEqual(
      expect.objectContaining({
        sourceType: 'blocker',
        sourceId: 'blocker_activity_source',
        responsibilitySummary: '当前由 Legal 推动解除',
        relatedSourceContextId: 'source_context_blocker_activity',
        taskId: 'task_blocker_source_activity',
        title: 'Need revised outreach list',
        status: 'source_updated',
      }),
    );
    expect(homeData.priorityLane).toBe('unblock_or_decide');
    expect(homeData.priorityHeadline).toBe('当前有 1 条任务需要先解阻塞或拍板');
    expect(homeData.recommendedActions.map((action) => action.id)).toEqual([
      'blocker:blocker_activity_source',
      'source-context:blocker:source_context_blocker_activity',
    ]);
    expect(homeData.recentTaskResumes[0]?.latestChange).toMatchObject({
      summary: '阻塞项相关来源刚更新：Need revised outreach list。',
      action: {
        label: '查看来源',
        targetType: 'source_context',
        targetId: 'source_context_blocker_activity',
      },
    });
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

  it('surfaces captured tasks as clarify-first recent activity', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_captured',
            title: 'Captured task',
            state: 'captured',
            nextStep: null,
            updatedAt: '2026-01-02T00:00:00.000Z',
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

    expect(homeData.recentActivity).toContainEqual(
      expect.objectContaining({
        sourceType: 'task',
        sourceId: 'task_captured',
        taskId: 'task_captured',
        taskTitle: 'Captured task',
        title: 'Captured task',
        status: 'captured',
        lane: 'clarify',
      }),
    );
    expect(homeData.recentTaskResumes[0]?.latestChange.summary).toBe(
      '最近刚捕获这条任务，先补清摘要与下一步。',
    );
  });

  it('keeps unconfirmed right-panel captures out of home brief workflow data', async () => {
    const decisions = {
      list: vi.fn().mockResolvedValue([
        buildDecision({
          id: 'decision_panel_capture',
          taskId: 'task_panel_capture',
          status: 'pending',
        }),
        buildDecision({
          id: 'decision_planned',
          taskId: 'task_planned',
          status: 'pending',
        }),
      ]),
    };
    const runs = {
      list: vi.fn().mockResolvedValue([
        buildRun({
          id: 'run_panel_capture',
          taskId: 'task_panel_capture',
          status: 'completed',
        }),
        buildRun({
          id: 'run_planned',
          taskId: 'task_planned',
          status: 'completed',
        }),
      ]),
    };
    const artifacts = {
      listRecent: vi.fn().mockResolvedValue([
        buildArtifact({
          id: 'artifact_panel_capture',
          taskId: 'task_panel_capture',
        }),
        buildArtifact({
          id: 'artifact_planned',
          taskId: 'task_planned',
        }),
      ]),
    };

    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_panel_capture',
            title: 'Panel capture',
            state: 'captured',
            summary: `${PANEL_CAPTURE_SUMMARY_PREFIX}Panel capture`,
            nextStep: null,
            updatedAt: '2026-01-03T00:00:00.000Z',
          }),
          buildTask({
            id: 'task_planned',
            title: 'Planned task',
            state: 'planned',
            nextStep: 'Continue',
            updatedAt: '2026-01-02T00:00:00.000Z',
          }),
        ]),
        getDetail: vi.fn().mockResolvedValue(buildTimelineDetail([])),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      null as never,
      decisions as never,
      runs as never,
      artifacts as never,
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

    expect(homeData.activeTaskCount).toBe(1);
    expect(homeData.pendingDecisionCount).toBe(1);
    expect(homeData.recentRunCount).toBe(1);
    expect(homeData.recentTasks.map((task) => task.id)).toEqual(['task_planned']);
    expect(homeData.pendingDecisions.map((decision) => decision.id)).toEqual(['decision_planned']);
    expect(homeData.recentArtifacts.map((artifact) => artifact.id)).toEqual(['artifact_planned']);
    expect(homeData.missingNextStepTasks.map((task) => task.id)).not.toContain('task_panel_capture');
    expect(homeData.recentActivity.map((item) => item.taskId)).not.toContain('task_panel_capture');
    expect(homeData.recentTaskResumes.map((item) => item.taskId)).not.toContain('task_panel_capture');
  });

  it('does not resurface captured-task activity ahead of later run outcomes after task updates', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_captured_run_failed',
            title: 'Captured task with failed run',
            state: 'captured',
            nextStep: 'Review failed run',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
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
        list: vi.fn().mockResolvedValue([
          buildRun({
            id: 'run_failed_after_capture',
            taskId: 'task_captured_run_failed',
            status: 'failed',
            type: 'draft',
            updatedAt: '2026-01-02T00:00:00.000Z',
          }),
        ]),
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

    expect(homeData.recentActivity.map((event) => event.id)).toEqual([
      'run:run_failed_after_capture',
      'task:task_captured_run_failed:2026-01-01T00:00:00.000Z',
    ]);
  });

  it('includes recent run verification in home resume preview latest change', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_run_verified',
            title: 'Run verified task',
            state: 'planned',
            nextStep: 'Review verified output',
            updatedAt: '2026-01-02T00:00:00.000Z',
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
        list: vi.fn().mockResolvedValue([
          buildRun({
            id: 'run_verified',
            taskId: 'task_run_verified',
            status: 'completed',
            type: 'agent',
            updatedAt: '2026-01-03T00:00:00.000Z',
          }),
        ]),
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
      null,
      null,
      {
        listForRun: vi.fn().mockResolvedValue([
          buildRunVerification({
            runId: 'run_verified',
            targetId: 'run_verified',
            label: 'Run 验证通过',
            detail: '执行结果已有输出或步骤证据，可进入人工审查。',
          }),
        ]),
      } as never,
    );

    const homeData = await service.getHomeData();

    expect(homeData.recentTaskResumes[0]?.latestChange.summary).toBe(
      '最近执行动态：agent · completed；验证结论：Run 验证通过，执行结果已有输出或步骤证据，可进入人工审查。',
    );
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

  it('treats closeout decision activity as completion evidence in home resume previews', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_closeout_preview',
            title: 'Closeout preview task',
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
        list: vi.fn().mockResolvedValue([
          buildDecision({
            id: 'decision_closeout',
            taskId: 'task_closeout_preview',
            title: 'Approve final launch brief',
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
      null,
      {
        listForTasks: vi.fn().mockResolvedValue([
          buildCompletionCriteria({
            id: 'criteria_done',
            taskId: 'task_closeout_preview',
            text: 'Draft delivered',
            status: 'satisfied',
            satisfiedAt: '2026-01-01T00:00:00.000Z',
          }),
          buildCompletionCriteria({
            id: 'criteria_open',
            taskId: 'task_closeout_preview',
            text: 'Final launch brief approved',
            status: 'open',
          }),
        ]),
      } as never,
    );

    const homeData = await service.getHomeData();

    expect(homeData.recentTaskResumes).toHaveLength(1);
    expect(homeData.recentTaskResumes[0]).toMatchObject({
      taskId: 'task_closeout_preview',
      latestChange: {
        summary: '最近决策动态：Approve final launch brief · approved，这可能说明某些完成标准已具备',
      },
      nextSuggestedMove: '先对照 Completion Criteria，判断这次批准是否已满足完成标准。',
    });
  });

  it('surfaces completion-ready and near-completion tasks on home', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_ready',
            title: 'Ready to finish',
            state: 'planned',
            nextStep: 'Close out the task',
          }),
          buildTask({
            id: 'task_near',
            title: 'Almost done',
            state: 'planned',
            nextStep: 'Finish the final review',
          }),
        ]),
        getDetail: vi.fn().mockResolvedValue(buildTimelineDetail([])),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      null as never,
      { list: vi.fn().mockResolvedValue([]) } as never,
      { list: vi.fn().mockResolvedValue([]) } as never,
      { listRecent: vi.fn().mockResolvedValue([]) } as never,
      { listActiveForTasks: vi.fn().mockResolvedValue([]) } as never,
      { listRecent: vi.fn().mockResolvedValue([]) } as never,
      () => null,
      null,
      null,
      {
        listForTasks: vi.fn().mockResolvedValue([
          buildCompletionCriteria({
            id: 'criteria_ready_1',
            taskId: 'task_ready',
            text: 'Final review recorded',
            status: 'satisfied',
            satisfiedAt: '2026-01-02T00:00:00.000Z',
          }),
          buildCompletionCriteria({
            id: 'criteria_ready_2',
            taskId: 'task_ready',
            text: 'Approval confirmed',
            status: 'satisfied',
            satisfiedAt: '2026-01-02T00:10:00.000Z',
          }),
          buildCompletionCriteria({
            id: 'criteria_near_1',
            taskId: 'task_near',
            text: 'Draft delivered',
            status: 'satisfied',
            satisfiedAt: '2026-01-02T00:00:00.000Z',
          }),
          buildCompletionCriteria({
            id: 'criteria_near_2',
            taskId: 'task_near',
            text: 'Final review recorded',
            status: 'open',
            verificationResponsibility: 'external_person',
            verificationResponsibilityLabel: '客户确认',
          }),
        ]),
      } as never,
    );

    const homeData = await service.getHomeData();

    expect(homeData.completionReadyTaskCount).toBe(1);
    expect(homeData.nearCompletionTaskCount).toBe(1);
    expect(homeData.completionReadyTasks?.[0]).toMatchObject({
      id: 'task_ready',
      completionProgress: { total: 2, satisfied: 2, open: 0 },
    });
    expect(homeData.nearCompletionTasks?.[0]).toMatchObject({
      id: 'task_near',
      completionProgress: { total: 2, satisfied: 1, open: 1 },
    });
    expect(homeData.recommendedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: 'task_ready',
          label: '收尾并完成任务：Ready to finish',
        }),
        expect.objectContaining({
          taskId: 'task_near',
          label: '补最后一个完成标准：Almost done',
          responsibilitySummary: '当前由 客户确认 负责确认',
        }),
      ]),
    );
  });

  it('orders completion-ready resumes ahead of near-completion resumes within continue/review', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_near_resume',
            title: 'Near completion resume',
            state: 'planned',
            nextStep: 'Verify final evidence',
            updatedAt: '2026-01-03T00:00:00.000Z',
          }),
          buildTask({
            id: 'task_ready_resume',
            title: 'Completion ready resume',
            state: 'planned',
            nextStep: 'Finalize and complete',
            updatedAt: '2026-01-02T00:00:00.000Z',
          }),
        ]),
        getDetail: vi.fn().mockResolvedValue(buildTimelineDetail([])),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      null as never,
      { list: vi.fn().mockResolvedValue([]) } as never,
      { list: vi.fn().mockResolvedValue([]) } as never,
      { listRecent: vi.fn().mockResolvedValue([]) } as never,
      { listActiveForTasks: vi.fn().mockResolvedValue([]) } as never,
      { listRecent: vi.fn().mockResolvedValue([]) } as never,
      () => null,
      null,
      null,
      {
        listForTasks: vi.fn().mockResolvedValue([
          buildCompletionCriteria({
            taskId: 'task_near_resume',
            text: 'Draft delivered',
            status: 'satisfied',
            satisfiedAt: '2026-01-02T00:00:00.000Z',
          }),
          buildCompletionCriteria({
            taskId: 'task_near_resume',
            text: 'Final review recorded',
            status: 'open',
          }),
          buildCompletionCriteria({
            taskId: 'task_ready_resume',
            text: 'Stakeholder approved',
            status: 'satisfied',
            satisfiedAt: '2026-01-02T00:00:00.000Z',
          }),
          buildCompletionCriteria({
            taskId: 'task_ready_resume',
            text: 'Draft delivered',
            status: 'satisfied',
            satisfiedAt: '2026-01-02T00:10:00.000Z',
          }),
        ]),
      } as never,
    );

    const homeData = await service.getHomeData();

    expect(homeData.recentTaskResumes[0]).toMatchObject({
      taskId: 'task_ready_resume',
      lane: 'continue_or_review',
      completionStatus: { total: 2, satisfied: 2, open: 0 },
    });
    expect(homeData.recentTaskResumes[1]).toMatchObject({
      taskId: 'task_near_resume',
      lane: 'continue_or_review',
      completionStatus: { total: 2, satisfied: 1, open: 1 },
    });
  });
});
