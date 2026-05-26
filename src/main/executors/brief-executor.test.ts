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
    briefAttention: {
      items: [],
      totalCount: 0,
      displayedCount: 0,
      displayLimit: 5,
      truncated: false,
      summary: 'Brief shows 0 attention items using the shared priority order.',
    },
    priorityLane: 'unblock_or_decide',
    priorityHeadline: '当前有 1 条任务需要先解阻塞或拍板',
    priorityLede: '当前最值得先处理的是解阻塞与拍板条件。',
    schedulerStatus: {
      enabled: true,
      running: true,
      lastBriefAt: null,
      lastRunSweepAt: null,
      lastScheduledEventAgentSweepAt: null,
    },
    processTemplateCandidates: [],
    briefFocusTasks: [],
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
    expect(brief).not.toContain('推荐动作：');
    expect(brief).toContain('Brief 焦点任务：');
    expect(brief).toContain('当前没有 Brief 焦点任务');
  });

  it('uses attention boundary and recent activity without exposing hidden recommended actions', () => {
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
        briefAttention: {
          items: [
            {
              actionId: 'action_escalate',
              taskId: 'task_resume_brief',
              lane: 'unblock_or_decide',
              reason: 'Needs a decision, unblock, risk review, or dependency check before work can continue.',
            },
            {
              actionId: 'action_continue',
              taskId: 'task_resume_brief',
              lane: 'review_evidence',
              reason: 'New or important evidence may change the next action.',
            },
          ],
          totalCount: 6,
          displayedCount: 2,
          displayLimit: 2,
          truncated: true,
          summary: 'Brief shows 2 of 6 attention items; Tasks owns the full queue.',
        },
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

    expect(brief).toContain('继续推进/复核：');
    expect(brief).toContain('Brief 注意力边界：');
    expect(brief).toContain('Brief shows 2 of 6 attention items; Tasks owns the full queue.');
    expect(brief).toContain('display=2/6 limit=2 truncated=yes');
    expect(brief).toContain('action_escalate | lane=unblock_or_decide');
    expect(brief).not.toContain('优先升级阻塞项');
    expect(brief).not.toContain('推荐动作：');
    expect(brief).toContain('run:draft [completed] | task=Resume task');
  });

  it('uses the same brief focus task projection as the visible Brief surface', () => {
    const brief = buildFallbackBrief(
      {
        ...buildHomeBriefData(),
        briefFocusTasks: [
          {
            id: 'task_focus_1',
            title: '先处理发布阻塞',
            lane: 'unblock',
            status: 'blocked',
            state: 'running',
            parentTaskId: 'task_parent',
            parentTitle: '发布项目',
            whyNow: '当前阻塞影响上线。',
            action: '解除阻塞',
          },
        ],
      },
      'startup',
    );

    expect(brief).toContain('Brief 焦点任务：');
    expect(brief).toContain('先处理发布阻塞');
    expect(brief).toContain('lane=unblock');
    expect(brief).toContain('status=blocked');
    expect(brief).toContain('parent=发布项目');
    expect(brief).toContain('why=当前阻塞影响上线。');
    expect(brief).toContain('action=解除阻塞');
  });

  it('labels brief source context as recent source material with key priority', () => {
    const brief = buildFallbackBrief(
      {
        ...buildHomeBriefData(),
        recentSourceContexts: [
          {
            id: 'source_context_general',
            taskId: 'task_resume_brief',
            taskTitle: 'Resume task',
            title: 'General research note',
            kind: 'note',
            isKey: false,
            uri: null,
            note: 'Not marked key, but recently updated.',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      'startup',
    );

    expect(brief).toContain('最近来源材料（关键优先）：');
    expect(brief).toContain('General research note');
    expect(brief).not.toContain('关键来源材料：');
  });

  it('uses neutral empty wording when no brief source context changed recently', () => {
    const brief = buildFallbackBrief(buildHomeBriefData(), 'startup');

    expect(brief).toContain('- 最近没有来源材料更新');
    expect(brief).not.toContain('- 最近没有关键来源材料');
  });

  it('uses clarify-first wording for captured task resumes in briefs', () => {
    const brief = buildFallbackBrief(
      {
        ...buildHomeBriefData(),
        recentTaskResumes: [
          {
            taskId: 'task_captured_brief',
            taskTitle: 'Captured brief task',
            lane: 'clarify',
            currentState: '状态：captured',
            latestChange: {
              summary: '最近刚捕获这条任务，先补清摘要与下一步。',
              action: {
                label: null,
                targetType: null,
                targetId: null,
              },
            },
            currentBlocker: {
              title: null,
              priorityReason: null,
            },
            keySource: {
              sourceContextId: null,
              title: null,
              priorityReason: null,
            },
            currentMethod: {
              title: null,
              selectionReason: null,
            },
            nextSuggestedMove: '先补一句任务摘要，再明确下一步。',
            contextActionLabel: '补摘要与下一步',
            contextActionIntent: {
              type: 'focus_next_step',
              focusArea: 'detail',
              prefillNextStep: '先补一句任务摘要，再明确下一步。',
            },
          },
        ],
      },
      'startup',
    );

    expect(brief).toContain('clarify=整理任务');
    expect(brief).toContain('latest=最近刚捕获这条任务，先补清摘要与下一步。');
    expect(brief).toContain('next=先补一句任务摘要，再明确下一步。');
  });
});
