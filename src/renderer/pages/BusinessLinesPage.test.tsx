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

  it('passes business owner and executable Next Action from the overview suggestion into RightPanel', async () => {
    const user = userEvent.setup();

    render(
      <BusinessLinesPage
        onOpenBusinessLinePanel={openBusinessLinePanel}
        onOpenTask={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '执行' }));

    expect(openBusinessLinePanel).toHaveBeenCalledWith(
      workspace.businessLine.id,
      workspace.businessLine.title,
      expect.stringContaining('可能的待确认写入建议（TASKPLANE_WRITE_INTENTS）'),
      'task_business_next_action',
      'Check launch evidence.',
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
    await user.click(screen.getByRole('button', { name: '执行' }));

    expect(openBusinessLinePanel).toHaveBeenCalledWith(
      workspace.businessLine.id,
      workspace.businessLine.title,
      expect.stringContaining('可能的待确认写入建议（TASKPLANE_WRITE_INTENTS）'),
      'task_business_next_action',
      'Run launch evidence check',
      true,
    );
  });
});
