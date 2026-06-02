// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ElectronApi } from '@shared/types/ipc';
import type { BusinessLineListItem, BusinessLineWorkspace } from '@shared/types/business-line';
import type { TaskListItemRecord } from '@shared/types/task';
import { BusinessLinesPage } from './BusinessLinesPage';

const now = '2026-01-01T00:00:00.000Z';
type BusinessLinesPageProps = Parameters<typeof BusinessLinesPage>[0];

function buildTask(partial: Partial<TaskListItemRecord> = {}): TaskListItemRecord {
  return {
    id: partial.id ?? 'task_business_next_action',
    title: partial.title ?? 'Run launch evidence check',
    summary: partial.summary ?? 'Check launch evidence.',
    state: partial.state ?? 'planned',
    nextStep: partial.nextStep ?? 'Check launch evidence.',
    waitingReason: partial.waitingReason ?? null,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    activeBlocker: partial.activeBlocker ?? null,
    activeDependency: partial.activeDependency ?? null,
    dependencyReevaluation: partial.dependencyReevaluation ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    businessLineId: partial.businessLineId ?? 'business_line_execution',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildWorkspace(): BusinessLineWorkspace {
  const line: BusinessLineListItem = {
    id: 'business_line_execution',
    title: 'Execution product',
    summary: 'Customer activation loop.',
    goal: 'Improve activation.',
    kind: 'software_product',
    legacyTaskId: null,
    createdAt: now,
    updatedAt: now,
    nextActionCount: 1,
    latestRecordSummary: 'Launch evidence changed.',
    activeSkillCount: 0,
  };
  const nextAction = buildTask({ businessLineId: line.id });
  return {
    businessLine: line,
    overview: {
      nextSuggestion: {
        id: `business-line-progress:${line.id}:${nextAction.id}`,
        type: 'progress',
        businessLineId: line.id,
        businessLineTitle: line.title,
        whyNow: 'Launch evidence changed the next recommendation.',
        expectedImpact: 'Move the business line forward.',
        effort: { level: 'medium', note: null },
        confidence: 80,
        nextStep: nextAction.nextStep ?? nextAction.title,
        sourceRecords: ['review: launch evidence'],
        sourceRecordIds: ['business_line_review_launch'],
        risk: { level: 'low', note: null },
        requiresDecision: false,
        taskId: nextAction.id,
      },
      recentChanges: ['Launch evidence changed.'],
      blockedDecisions: [],
      missingContext: [],
      latestResult: null,
      latestImprovement: null,
    },
    records: [],
    sourceRecords: [],
    nextActions: [nextAction],
    automations: { automations: [], sensors: [] },
    learning: { reviews: [], skillRevisions: [], acceptedSkills: [] },
    contextPack: {
      businessSummary: line.summary,
      currentGoal: line.goal,
      recentChanges: [],
      activeDecisions: [],
      openNextActions: [nextAction],
      latestRecords: [],
      acceptedSkills: [],
      knownConstraints: [],
      permissionBoundaries: [],
      missingContext: [],
    },
  };
}

describe('BusinessLinesPage', () => {
  let workspace: BusinessLineWorkspace;
  let openBusinessLinePanel: ReturnType<typeof vi.fn<BusinessLinesPageProps['onOpenBusinessLinePanel']>>;

  beforeEach(() => {
    workspace = buildWorkspace();
    openBusinessLinePanel = vi.fn<BusinessLinesPageProps['onOpenBusinessLinePanel']>();
    window.api = {
      listBusinessLines: vi.fn().mockResolvedValue([workspace.businessLine]),
      getBusinessLineWorkspace: vi.fn().mockResolvedValue(workspace),
    } as Partial<ElectronApi> as ElectronApi;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows first-run creation copy and examples for Business and Next Action setup', async () => {
    const user = userEvent.setup();

    render(
      <BusinessLinesPage
        onOpenBusinessLinePanel={openBusinessLinePanel}
        onOpenTask={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '新建' }));

    expect(screen.getByText(/Business 是长期工作线，不是一次性 task/)).toBeTruthy();
    expect(screen.getByText(/Agent 输出会先成为待确认建议/)).toBeTruthy();
    expect(screen.getByLabelText('Business name')).toBeTruthy();
    expect(screen.getByLabelText('Goal for this long-running business')).toBeTruthy();
    expect(screen.getByLabelText('Long-term records / review notes')).toBeTruthy();
    expect(screen.getByLabelText('AI help and save boundary')).toBeTruthy();
    expect(screen.getByPlaceholderText('asterism public alpha polish')).toBeTruthy();
    expect(screen.getByPlaceholderText('检查 README 到首次 Business run 的体验')).toBeTruthy();
  });

  it('passes business owner and executable Next Action from the overview suggestion into RightPanel', async () => {
    const user = userEvent.setup();

    render(
      <BusinessLinesPage
        onOpenBusinessLinePanel={openBusinessLinePanel}
        onOpenTask={vi.fn()}
      />,
    );

    const runButton = await screen.findByRole('button', { name: '执行' });
    expect(runButton.getAttribute('title')).toBe('启动当前 Next Action 的 Agent run');
    await user.click(runButton);

    expect(openBusinessLinePanel).toHaveBeenCalledWith(
      workspace.businessLine.id,
      workspace.businessLine.title,
      expect.stringContaining('可能的待确认写入建议（TASKPLANE_WRITE_INTENTS）'),
      'task_business_next_action',
      'Check launch evidence.',
      true,
    );
  });

  it('opens the overview collaboration panel without auto-starting a run', async () => {
    const user = userEvent.setup();

    render(
      <BusinessLinesPage
        onOpenBusinessLinePanel={openBusinessLinePanel}
        onOpenTask={vi.fn()}
      />,
    );

    const collaborationButton = await screen.findByRole('button', { name: '协作' });
    expect(collaborationButton.getAttribute('title')).toBe('打开协作面板，不会自动启动 run');
    await user.click(collaborationButton);

    expect(openBusinessLinePanel).toHaveBeenCalledWith(
      workspace.businessLine.id,
      workspace.businessLine.title,
      expect.stringContaining('请推进这个业务线 Next Action'),
      'task_business_next_action',
    );
    expect(openBusinessLinePanel).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      true,
    );
  });

  it('passes business owner and carrier when executing a Business Next Action', async () => {
    const user = userEvent.setup();

    render(
      <BusinessLinesPage
        onOpenBusinessLinePanel={openBusinessLinePanel}
        onOpenTask={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Next Actions' }));
    const runButton = screen.getByRole('button', { name: '执行' });
    expect(runButton.getAttribute('title')).toBe('启动当前 Next Action 的 Agent run');
    await user.click(runButton);

    expect(openBusinessLinePanel).toHaveBeenCalledWith(
      workspace.businessLine.id,
      workspace.businessLine.title,
      expect.stringContaining('可能的待确认写入建议（TASKPLANE_WRITE_INTENTS）'),
      'task_business_next_action',
      'Run launch evidence check',
      true,
    );
  });

  it('opens a Business Next Action collaboration panel without auto-starting a run', async () => {
    const user = userEvent.setup();

    render(
      <BusinessLinesPage
        onOpenBusinessLinePanel={openBusinessLinePanel}
        onOpenTask={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Next Actions' }));
    const collaborationButton = screen.getByRole('button', { name: '协作' });
    expect(collaborationButton.getAttribute('title')).toBe('打开协作面板，不会自动启动 run');
    await user.click(collaborationButton);

    expect(openBusinessLinePanel).toHaveBeenCalledWith(
      workspace.businessLine.id,
      workspace.businessLine.title,
      undefined,
      'task_business_next_action',
      'Run launch evidence check',
    );
    expect(openBusinessLinePanel).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      true,
    );
  });
});
