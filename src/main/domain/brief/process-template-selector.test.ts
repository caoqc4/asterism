import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HomeBriefData } from '../../../shared/types/brief.js';

const generateObjectMock = vi.fn();

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
}));

function buildHomeData(): HomeBriefData {
  return {
    activeTaskCount: 2,
    pendingDecisionCount: 1,
    completedTaskCount: 0,
    recentRunCount: 2,
    waitingTaskCount: 1,
    blockerTaskCount: 0,
    escalationTaskCount: 0,
    highRiskTaskCount: 1,
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
    recentTaskResumes: [],
    recentActivity: [],
      recentBriefSnapshots: [],
      briefFocusTasks: [],
      schedulerStatus: {
      enabled: true,
      running: true,
      lastBriefAt: null,
      lastRunSweepAt: null,
    },
    processTemplateCandidates: [],
  };
}

describe('BriefProcessTemplateSelector', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it('returns skipped when there are no candidate templates', async () => {
    const { BriefProcessTemplateSelector } = await import('./process-template-selector.js');
    const selector = new BriefProcessTemplateSelector();

    const result = await selector.select(
      buildHomeData(),
      'hourly',
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
      reason: '当前活跃任务未提供可用于 brief 的 process templates。',
    });
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('returns selected candidate templates from the selector response', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        shouldUse: true,
        selectedTemplateIds: ['process_template_1'],
        reason: '当前局势高风险和等待并存，适合参考风险审阅模板。',
      },
    });
    const { BriefProcessTemplateSelector } = await import('./process-template-selector.js');
    const selector = new BriefProcessTemplateSelector();
    const homeData = {
      ...buildHomeData(),
      processTemplateCandidates: [
        {
          id: 'process_template_1',
          title: 'Risk review skill',
          summary: 'Prioritize risk and blockers',
          content: '1. Review risks\n2. Highlight blockers',
          kind: 'skill' as const,
          tags: ['risk'],
          taskIds: ['task_1'],
          taskTitles: ['Task 1'],
          notes: ['Use for risky work'],
        },
      ],
      briefFocusTasks: [
        {
          id: 'task_1',
          title: 'Task 1',
          lane: 'escalate',
          status: 'blocked',
          whyNow: '当前阻塞影响发布。',
          action: '解除阻塞',
        },
      ],
    };

    const result = await selector.select(
      homeData,
      'startup',
      {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
        featureFlags: {
          enableScheduler: true,
        },
      },
    );

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('当前优先级语义：稳态推进。组织输出时优先围绕现有下一步平稳推进。'),
      }),
    );
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Brief 焦点任务：Task 1 [lane=escalate status=blocked] (当前阻塞影响发布。)'),
      }),
    );
    expect(result).toEqual({
      shouldUse: true,
      selectedTemplates: homeData.processTemplateCandidates,
      reason: '当前局势高风险和等待并存，适合参考风险审阅模板。',
    });
  });

  it('does not enable template usage when selected ids do not match candidates', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        shouldUse: true,
        selectedTemplateIds: ['missing_template'],
        reason: '模型返回了一个不存在的模板。',
      },
    });
    const { BriefProcessTemplateSelector } = await import('./process-template-selector.js');
    const selector = new BriefProcessTemplateSelector();
    const homeData = {
      ...buildHomeData(),
      processTemplateCandidates: [
        {
          id: 'process_template_1',
          title: 'Risk review skill',
          summary: 'Prioritize risk and blockers',
          content: '1. Review risks\n2. Highlight blockers',
          kind: 'skill' as const,
          tags: ['risk'],
          taskIds: ['task_1'],
          taskTitles: ['Task 1'],
          notes: ['Use for risky work'],
        },
      ],
    };

    const result = await selector.select(
      homeData,
      'startup',
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
