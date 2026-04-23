import { describe, expect, it } from 'vitest';

import type { HomeBriefData } from '../../shared/types/brief.js';
import { buildFallbackBrief } from './brief-executor.js';

function buildHomeBriefData(): HomeBriefData {
  return {
    activeTaskCount: 1,
    pendingDecisionCount: 0,
    completedTaskCount: 0,
    recentRunCount: 1,
    waitingTaskCount: 0,
    blockerTaskCount: 0,
    escalationTaskCount: 0,
    highRiskTaskCount: 0,
    missingNextStepTaskCount: 0,
    recentTasks: [],
    waitingTasks: [],
    blockerTasks: [],
    escalationTasks: [],
    highRiskTasks: [],
    missingNextStepTasks: [],
    pendingDecisions: [],
    recommendedActions: [],
    recentArtifacts: [],
    recentSourceContexts: [],
    recentTaskResumes: [
      {
        taskId: 'task_resume_brief',
        taskTitle: 'Resume task',
        currentState: '状态：planned',
        latestChange: {
          summary: '最近决策动态：Approve launch · approved',
          action: {
            label: '查看 Decision',
            targetType: 'decision',
            targetId: 'decision_resume_brief',
          },
        },
        currentBlocker: {
          title: 'Legal approval pending',
          priorityReason: '当前阻塞原因：Need formal sign-off',
        },
        keySource: {
          sourceContextId: 'source_context_resume_brief',
          title: 'Launch memo',
          priorityReason: '关键来源：包含最新发布时间窗口。',
        },
        currentMethod: {
          title: 'Launch workflow',
          selectionReason: '最近用于执行：发布时间敏感，需要先按发布流程检查。',
        },
        nextSuggestedMove: '已获批准，继续推进：Approve launch',
        contextActionLabel: '继续推进任务',
        contextActionIntent: {
          type: 'focus_next_step',
          focusArea: 'detail',
          prefillNextStep: '已获批准，继续推进：Approve launch',
        },
      },
    ],
    recentActivity: [],
    recentBriefSnapshots: [],
    priorityLane: 'unblock_or_decide',
    priorityHeadline: '当前有 1 条任务需要先解阻塞或拍板',
    priorityLede: '当前最值得先处理的是解阻塞与拍板条件。',
    schedulerStatus: {
      enabled: true,
      running: true,
      lastBriefAt: null,
      lastRunSweepAt: null,
    },
    processTemplateCandidates: [],
  };
}

describe('buildFallbackBrief', () => {
  it('includes task resume previews with lifecycle-aware guidance', () => {
    const brief = buildFallbackBrief(buildHomeBriefData(), 'startup');

    expect(brief).toContain('任务恢复预览：');
    expect(brief).toContain('Resume task');
    expect(brief).toContain('latest=最近决策动态：Approve launch · approved');
    expect(brief).toContain('next=已获批准，继续推进：Approve launch');
    expect(brief).toContain('blocker=Legal approval pending');
    expect(brief).toContain('blocker_reason=当前阻塞原因：Need formal sign-off');
    expect(brief).toContain('source=Launch memo');
    expect(brief).toContain('method=Launch workflow');
    expect(brief).toContain('推荐动作：');
    expect(brief).toContain('当前没有推荐动作');
  });

  it('groups recommended actions and recent activity by priority lane wording', () => {
    const brief = buildFallbackBrief(
      {
        ...buildHomeBriefData(),
        recommendedActions: [
          {
            id: 'action_escalate',
            label: '优先升级阻塞项',
            reason: '阻塞项已停留太久。',
            taskId: 'task_resume_brief',
            priority: 'high',
            lane: 'escalate_now',
          },
          {
            id: 'action_continue',
            label: '基于结果继续推进',
            reason: '最新 run 已完成。',
            taskId: 'task_resume_brief',
            priority: 'medium',
            lane: 'continue_or_review',
          },
        ],
        recentActivity: [
          {
            id: 'run_lane',
            sourceType: 'run',
            sourceId: 'run_1',
            lane: 'continue_or_review',
            taskId: 'task_resume_brief',
            taskTitle: 'Resume task',
            title: 'draft',
            status: 'completed',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      'startup',
    );

    expect(brief).toContain('立即升级：');
    expect(brief).toContain('继续推进/复核：');
    expect(brief).toContain('优先升级阻塞项');
    expect(brief).toContain('run:draft [completed] | task=Resume task');
  });
});
