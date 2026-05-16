import { describe, expect, it } from 'vitest';

import { buildTaskCompletionMemoryCoverage } from './TaskCompletionCheckModal';
import type { RuntimeVerificationResult } from '@shared/runtime-verification';
import type { TaskDetail } from '@shared/types/task';

const now = '2026-05-15T01:00:00.000Z';

function buildDetail(partial: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: partial.id ?? 'task-1',
    title: partial.title ?? 'Task',
    summary: partial.summary ?? 'Ready to complete',
    state: partial.state ?? 'running',
    nextStep: partial.nextStep ?? 'Complete',
    waitingReason: partial.waitingReason ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    activeBlocker: partial.activeBlocker ?? null,
    activeDependency: partial.activeDependency ?? null,
    dependencyReevaluation: partial.dependencyReevaluation ?? null,
    artifacts: partial.artifacts ?? [],
    completionCriteria: partial.completionCriteria ?? [{
      id: 'criteria-1',
      taskId: 'task-1',
      text: 'Done',
      verificationResponsibility: null,
      verificationResponsibilityLabel: null,
      status: 'satisfied',
      createdAt: now,
      updatedAt: now,
      satisfiedAt: now,
    }],
    sourceContexts: partial.sourceContexts ?? [],
    taskFiles: partial.taskFiles ?? [],
    processTemplates: partial.processTemplates ?? [],
    availableProcessTemplates: partial.availableProcessTemplates ?? [],
    timeline: partial.timeline ?? [],
    resumeCard: partial.resumeCard ?? {
      summary: 'Ready',
      currentState: 'running',
      nextSuggestedMove: 'Complete',
      latestChange: {
        summary: 'Ready',
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
      },
      currentBlocker: {
        blockerId: null,
        title: 'No blocker',
        detail: null,
      },
      keySource: {
        sourceContextId: null,
        title: 'No source',
        detail: null,
        priorityReason: null,
      },
      currentMethod: {
        templateId: null,
        title: 'Default',
        detail: null,
        selectionReason: null,
      },
      completionStatus: { total: 1, satisfied: 1, open: 0, summary: 'done' },
    },
  };
}

function runCheck(tone: RuntimeVerificationResult['tone']): RuntimeVerificationResult {
  return {
    mode: 'run',
    tone,
    label: 'Run check',
    detail: 'Run detail',
    source: 'lightweight_rule_engine',
    canProceed: tone !== 'fail',
    requiresUserConfirmation: tone !== 'pass',
    shouldPersistTaskRecord: tone === 'fail',
    suggestedNextAction: tone === 'pass' ? 'continue' : 'confirm',
  };
}

describe('buildTaskCompletionMemoryCoverage', () => {
  it('keeps timeline-derived completed run evidence when no recent run check is loaded', () => {
    const coverage = buildTaskCompletionMemoryCoverage(buildDetail({
      timeline: [{
        id: 'event-1',
        taskId: 'task-1',
        type: 'run.completed',
        payload: null,
        createdAt: now,
      }],
    }), null);

    expect(coverage).toMatchObject({
      outcome: 'pass',
      canProceed: true,
    });
  });

  it('lets a failing recent run check override older completion evidence', () => {
    const coverage = buildTaskCompletionMemoryCoverage(buildDetail({
      timeline: [{
        id: 'event-1',
        taskId: 'task-1',
        type: 'run.completed',
        payload: null,
        createdAt: now,
      }],
    }), runCheck('fail'));

    expect(coverage).toMatchObject({
      outcome: 'needs_memory_write',
      canProceed: false,
    });
  });

  it('does not let a passing recent run check override stale timeline evidence', () => {
    const coverage = buildTaskCompletionMemoryCoverage(buildDetail({
      completionCriteria: [{
        id: 'criteria-1',
        taskId: 'task-1',
        text: 'Done',
        verificationResponsibility: null,
        verificationResponsibilityLabel: null,
        status: 'satisfied',
        createdAt: now,
        updatedAt: '2026-05-15T01:03:00.000Z',
        satisfiedAt: '2026-05-15T01:03:00.000Z',
      }],
      timeline: [{
        id: 'event-1',
        taskId: 'task-1',
        type: 'run.completed',
        payload: null,
        createdAt: '2026-05-15T01:01:00.000Z',
      }],
    }), runCheck('pass'));

    expect(coverage).toMatchObject({
      outcome: 'needs_memory_write',
      canProceed: false,
    });
  });
});
