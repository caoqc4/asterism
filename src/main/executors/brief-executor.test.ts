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
    highRiskTaskCount: 0,
    missingNextStepTaskCount: 0,
    recentTasks: [],
    waitingTasks: [],
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
    expect(brief).toContain('source=Launch memo');
    expect(brief).toContain('method=Launch workflow');
  });
});
