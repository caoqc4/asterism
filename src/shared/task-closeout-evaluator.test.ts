import { describe, expect, it } from 'vitest';

import type { TaskDetail, TaskListItemRecord } from './types/task.js';
import { evaluateTaskCloseout } from './task-closeout-evaluator.js';

const now = '2026-01-01T00:00:00.000Z';

function buildTask(partial: Partial<TaskListItemRecord> = {}): TaskListItemRecord {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? '开发小程序',
    summary: partial.summary ?? null,
    state: partial.state ?? 'planned',
    nextStep: partial.nextStep ?? null,
    waitingReason: partial.waitingReason ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    activeBlocker: partial.activeBlocker ?? null,
    activeDependency: partial.activeDependency ?? null,
    dependencyReevaluation: partial.dependencyReevaluation ?? null,
  };
}

function buildDetail(partial: Partial<TaskDetail> = {}): TaskDetail {
  const base = buildTask(partial);
  return {
    ...base,
    artifacts: partial.artifacts ?? [],
    completionCriteria: partial.completionCriteria ?? [],
    sourceContexts: partial.sourceContexts ?? [],
    taskFiles: partial.taskFiles ?? [],
    processTemplates: partial.processTemplates ?? [],
    availableProcessTemplates: partial.availableProcessTemplates ?? [],
    timeline: partial.timeline ?? [],
    resumeCard: partial.resumeCard ?? {
      summary: '当前任务摘要',
      currentState: '推进中',
      latestChange: { summary: '最近更新', action: { label: null, targetType: null, targetId: null } },
      completionStatus: { total: 0, satisfied: 0, open: 0, summary: '尚未定义完成标准' },
      currentBlocker: { blockerId: null, title: '无', detail: null },
      keySource: { sourceContextId: null, title: '无', detail: null, priorityReason: null },
      currentMethod: { templateId: null, title: '无', detail: null, selectionReason: null },
      nextSuggestedMove: '继续推进',
    },
  };
}

describe('evaluateTaskCloseout', () => {
  it('hands off a phase closeout to the first existing open child task', () => {
    const first = buildTask({ id: 'child_1', title: '需求分析', updatedAt: '2026-01-01T01:00:00.000Z' });
    const second = buildTask({ id: 'child_2', title: '实现开发', updatedAt: '2026-01-01T02:00:00.000Z' });

    const result = evaluateTaskCloseout({
      intent: 'phase_closeout',
      task: buildDetail(),
      childTaskIds: ['child_2', 'child_1'],
      childTasks: [first, second],
    });

    expect(result).toMatchObject({
      outcome: 'handoff_to_existing_child',
      nextTaskId: 'child_2',
      nextTaskKind: 'existing_child',
      runVerificationTone: 'pass',
    });
  });

  it('hands off a phase closeout to an existing successor only when no child is available', () => {
    const successor = buildTask({
      id: 'successor_1',
      title: '发布准备',
      updatedAt: '2026-01-01T01:00:00.000Z',
    });

    const result = evaluateTaskCloseout({
      intent: 'phase_closeout',
      task: buildDetail(),
      successorTaskIds: ['successor_1'],
      successorTasks: [successor],
    });

    expect(result).toMatchObject({
      outcome: 'handoff_to_existing_successor',
      nextTaskId: 'successor_1',
      nextTaskKind: 'existing_successor',
      runVerificationTone: 'pass',
    });
  });

  it('does not let phase closeout create new follow-up tasks without confirmation evidence', () => {
    const result = evaluateTaskCloseout({
      intent: 'phase_closeout',
      task: buildDetail(),
      proposedFollowUpTasks: [
        { title: '继续完善小程序' },
        { title: '做后续优化', summary: '范围还不明确' },
      ],
    });

    expect(result).toMatchObject({
      outcome: 'needs_follow_up_confirmation',
      followUpProposalAllowed: false,
      proposedFollowUpCount: 2,
      runVerificationTone: 'warn',
    });
  });

  it('still requires confirmation before creating evidenced follow-up tasks', () => {
    const result = evaluateTaskCloseout({
      intent: 'phase_closeout',
      task: buildDetail(),
      proposedFollowUpTasks: [{
        title: '补充验收回归',
        evidence: ['用户要求收尾后补一轮回归验收。'],
      }],
    });

    expect(result).toMatchObject({
      outcome: 'needs_follow_up_confirmation',
      followUpProposalAllowed: true,
      proposedFollowUpCount: 1,
      runVerificationTone: 'warn',
    });
  });

  it('pauses before handoff when blockers remain', () => {
    const result = evaluateTaskCloseout({
      intent: 'phase_closeout',
      task: buildDetail({
        activeBlocker: {
          id: 'blocker_1',
          taskId: 'task_1',
          title: '等待安全评审',
          kind: 'approval',
          detail: null,
          owner: null,
          responsibility: null,
          responsibilityLabel: null,
          sourceContextId: null,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          resolvedAt: null,
        },
      }),
      childTasks: [buildTask({ id: 'child_1', title: '需求分析' })],
    });

    expect(result.outcome).toBe('pause_with_handoff');
    expect(result.reason).toContain('等待安全评审');
  });

  it('continues the current task when completion criteria are still open', () => {
    const result = evaluateTaskCloseout({
      intent: 'task_completion',
      task: buildDetail({
        resumeCard: {
          ...buildDetail().resumeCard,
          completionStatus: { total: 2, satisfied: 1, open: 1, summary: '已满足 1/2 条完成标准' },
        },
      }),
    });

    expect(result).toMatchObject({
      outcome: 'continue_current_task',
      criteriaOpen: 1,
      runVerificationTone: 'pending',
    });
  });

  it('requires user confirmation before completing high-risk work', () => {
    const result = evaluateTaskCloseout({
      intent: 'task_completion',
      task: buildDetail({ riskLevel: 'high' }),
    });

    expect(result.outcome).toBe('needs_user_confirmation');
  });
});
