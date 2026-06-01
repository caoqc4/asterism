// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunDetailRecord, RunRecord } from '@shared/types/run';
import type { TaskDetail } from '@shared/types/task';
import { RightPanel } from './RightPanel';

describe('RightPanel review surface', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'api');
  });

  it('shows artifacts, files, run evidence, and verifier status in a compact review surface', async () => {
    const task = buildTaskDetail();
    const run = buildRun();
    const runDetail = buildRunDetail();
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getAiConfigStatus: vi.fn().mockResolvedValue({
          configured: true,
          runtimeMode: 'api',
          featureFlags: {
            contextCompressionThreshold: 80,
          },
          agentCliRuntimeStatus: {
            runtimes: [],
          },
        }),
        getRunDetail: vi.fn().mockResolvedValue(runDetail),
        getTaskDetail: vi.fn().mockResolvedValue(task),
        listRuns: vi.fn().mockResolvedValue([run]),
        subscribeToEvents: vi.fn(() => () => undefined),
      },
    });

    render(
      <RightPanel
        taskId="task_review"
        taskTitleHint="Review task"
        onClearTask={() => undefined}
        onClose={() => undefined}
      />,
    );

    const reviewSurface = await screen.findByLabelText('Side panel review surface');
    expect(within(reviewSurface).getByText('Generated')).toBeTruthy();
    expect(within(reviewSurface).getByText(/run_output: Projected artifact/)).toBeTruthy();
    expect(within(reviewSurface).getByText(/file: Drafts\/launch-note.md/)).toBeTruthy();
    expect(within(reviewSurface).getByText('Evidence')).toBeTruthy();
    expect(within(reviewSurface).getByText(/run_review: completed · warn 1 \/ pass 1 · verifier completed/)).toBeTruthy();
  });

  it('refreshes run evidence when a run.changed event arrives', async () => {
    const task = buildTaskDetail();
    const run = buildRun();
    const runDetail = buildRunDetail();
    const runs: RunRecord[] = [];
    let emitEvent: ((event: { entityId?: string; type: string }) => void) | null = null;
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getAiConfigStatus: vi.fn().mockResolvedValue({
          configured: true,
          runtimeMode: 'api',
          featureFlags: {
            contextCompressionThreshold: 80,
          },
          agentCliRuntimeStatus: {
            runtimes: [],
          },
        }),
        getRunDetail: vi.fn().mockResolvedValue(runDetail),
        getTaskDetail: vi.fn().mockResolvedValue(task),
        listRuns: vi.fn().mockImplementation(async () => runs),
        subscribeToEvents: vi.fn((handler: (event: { entityId?: string; type: string }) => void) => {
          emitEvent = handler;
          return () => undefined;
        }),
      },
    });

    render(
      <RightPanel
        taskId="task_review"
        taskTitleHint="Review task"
        onClearTask={() => undefined}
        onClose={() => undefined}
      />,
    );

    const reviewSurface = await screen.findByLabelText('Side panel review surface');
    expect(within(reviewSurface).queryByText('Evidence')).toBeNull();

    await act(async () => {
      runs.push(run);
      emitEvent?.({ entityId: 'run_review', type: 'run.changed' });
    });

    await waitFor(() => {
      const refreshedSurface = screen.getByLabelText('Side panel review surface');
      expect(within(refreshedSurface).getByText('Evidence')).toBeTruthy();
      expect(within(refreshedSurface).getByText(/run_review: completed · warn 1 \/ pass 1 · verifier completed/)).toBeTruthy();
    });
  });
});

function buildRun(): RunRecord {
  return {
    id: 'run_review',
    taskId: 'task_review',
    type: 'agent',
    status: 'completed',
    instructions: 'Review artifact evidence.',
    output: 'Done.',
    outputSource: 'ai',
    failureReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:10:00.000Z',
  };
}

function buildRunDetail(): RunDetailRecord {
  return {
    ...buildRun(),
    artifacts: [],
    checkpoints: [],
    steps: [{
      id: 'run_step_verify',
      runId: 'run_review',
      index: 1,
      kind: 'final',
      status: 'completed',
      title: 'verifier completed',
      input: null,
      output: 'Verifier decision: accept_for_review',
      error: null,
      createdAt: '2026-01-01T00:10:00.000Z',
      updatedAt: '2026-01-01T00:10:00.000Z',
    }],
    taskMemoryWriteProposals: [],
    verifications: [
      {
        id: 'verification_pass',
        runId: 'run_review',
        targetType: 'run',
        targetId: 'run_review',
        tone: 'pass',
        label: 'Output captured',
        detail: 'Run output is persisted.',
        source: 'lightweight_rule_engine',
        createdAt: '2026-01-01T00:10:00.000Z',
        updatedAt: '2026-01-01T00:10:00.000Z',
      },
      {
        id: 'verification_warn',
        runId: 'run_review',
        targetType: 'run',
        targetId: 'run_review',
        tone: 'warn',
        label: 'Needs review',
        detail: 'Human review recommended.',
        source: 'lightweight_rule_engine',
        createdAt: '2026-01-01T00:10:00.000Z',
        updatedAt: '2026-01-01T00:10:00.000Z',
      },
    ],
  };
}

function buildTaskDetail(): TaskDetail {
  return {
    id: 'task_review',
    title: 'Review task',
    summary: 'Review generated artifacts.',
    state: 'running',
    nextStep: 'Review the artifact evidence.',
    waitingReason: null,
    riskLevel: 'low',
    riskNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:10:00.000Z',
    activeWaitingItem: null,
    activeBlocker: null,
    artifacts: [{
      id: 'artifact_projected',
      taskId: 'task_review',
      sourceType: 'run',
      sourceId: 'run_review',
      kind: 'run_output',
      title: 'Projected artifact',
      content: 'Artifact content.',
      createdAt: '2026-01-01T00:10:00.000Z',
      updatedAt: '2026-01-01T00:10:00.000Z',
    }],
    completionCriteria: [],
    sourceContexts: [],
    taskFiles: [{
      id: 'task_file_launch',
      taskId: 'task_review',
      businessLineId: null,
      name: 'launch-note.md',
      path: 'Drafts/launch-note.md',
      kind: 'file',
      content: '# Launch note',
      createdAt: '2026-01-01T00:10:00.000Z',
      updatedAt: '2026-01-01T00:10:00.000Z',
    }],
    processTemplates: [],
    availableProcessTemplates: [],
    timeline: [],
    resumeCard: {
      summary: 'Review generated artifacts.',
      currentState: 'running',
      latestChange: {
        summary: 'Run completed.',
        action: {
          label: 'Review run',
          targetType: 'run',
          targetId: 'run_review',
        },
      },
      completionStatus: {
        total: 0,
        satisfied: 0,
        open: 0,
        summary: 'No criteria yet.',
      },
      currentBlocker: {
        blockerId: null,
        title: 'No blocker',
        detail: null,
      },
      keySource: {
        sourceContextId: null,
        title: 'No key source',
        detail: null,
        priorityReason: null,
      },
      currentMethod: {
        templateId: null,
        title: 'No method',
        detail: null,
        selectionReason: null,
      },
      nextSuggestedMove: 'Review the artifact evidence.',
    },
  };
}
