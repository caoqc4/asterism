import { describe, expect, it } from 'vitest';

import { buildRunCheck, buildTaskCompletionMemoryCoverage, selectRunCheckSource } from './TaskCompletionCheckModal';
import type { RuntimeVerificationResult } from '@shared/runtime-verification';
import type { RunDetailRecord, RunRecord } from '@shared/types/run';
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

function buildRun(partial: Partial<RunRecord> = {}): RunRecord {
  return {
    id: partial.id ?? 'run-1',
    taskId: partial.taskId ?? 'task-1',
    type: partial.type ?? 'agent',
    status: partial.status ?? 'completed',
    instructions: partial.instructions ?? 'Run the task.',
    output: partial.output ?? 'Completed with evidence.',
    outputSource: partial.outputSource ?? 'ai',
    failureReason: partial.failureReason ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildRunDetail(
  run: RunRecord,
  partial: Partial<RunDetailRecord> = {},
): RunDetailRecord {
  return {
    ...run,
    agentSessions: partial.agentSessions ?? [],
    artifacts: partial.artifacts ?? [],
    checkpoints: partial.checkpoints ?? [],
    steps: partial.steps ?? [],
    taskMemoryGuidance: partial.taskMemoryGuidance,
    verifications: partial.verifications ?? [],
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

describe('buildRunCheck', () => {
  it('recomputes stale pending-memory run verification after memory guidance is resolved', () => {
    const run = buildRun();
    const check = buildRunCheck(run, buildRunDetail(run, {
      taskMemoryGuidance: {
        latestGuidanceAt: now,
        outcome: 'satisfied',
        pendingTargets: [],
        reason: '任务记忆建议已有对应写入。',
        targets: ['task_record'],
      },
      verifications: [{
        id: 'verification-1',
        runId: run.id,
        targetType: 'run',
        targetId: run.id,
        tone: 'warn',
        label: 'Run 任务记忆待处理',
        detail: '最新任务记忆建议仍缺少对应写入：Task Record。',
        source: 'lightweight_rule_engine',
        createdAt: now,
        updatedAt: now,
      }],
    }));

    expect(check).toMatchObject({
      tone: 'pass',
      label: 'Run 验证通过',
      detail: '执行结果已有输出或步骤证据，可进入人工审查。',
    });
  });

  it('preserves non-memory persisted run verification results', () => {
    const run = buildRun();
    const check = buildRunCheck(run, buildRunDetail(run, {
      taskMemoryGuidance: {
        latestGuidanceAt: now,
        outcome: 'satisfied',
        pendingTargets: [],
        reason: '任务记忆建议已有对应写入。',
        targets: ['task_record'],
      },
      verifications: [{
        id: 'verification-1',
        runId: run.id,
        targetType: 'run',
        targetId: run.id,
        tone: 'fail',
        label: 'Run 检查未通过',
        detail: '最近执行失败。',
        source: 'lightweight_rule_engine',
        createdAt: now,
        updatedAt: now,
      }],
    }));

    expect(check).toMatchObject({
      tone: 'fail',
      label: 'Run 检查未通过',
      detail: '最近执行失败。',
    });
  });
});

describe('selectRunCheckSource', () => {
  it('uses the older run that owns pending memory guidance instead of the newest run', () => {
    const newer = buildRun({ id: 'run-newer', updatedAt: '2026-05-15T01:10:00.000Z' });
    const older = buildRun({ id: 'run-older', updatedAt: '2026-05-15T01:00:00.000Z' });
    const pendingGuidance = {
      latestGuidanceAt: now,
      outcome: 'pending' as const,
      pendingTargets: ['task_record' as const],
      reason: '旧 run 的任务记忆建议仍缺少对应写入。',
      targets: ['task_record' as const],
    };

    const source = selectRunCheckSource(
      [newer, older],
      [
        buildRunDetail(newer),
        buildRunDetail(older, { taskMemoryGuidance: pendingGuidance }),
      ],
    );

    expect(source?.run.id).toBe('run-older');
    expect(source?.detail?.id).toBe('run-older');
    expect(source?.detail?.taskMemoryGuidance).toBe(pendingGuidance);
  });

  it('uses the newest run when no pending memory guidance blocks completion', () => {
    const newer = buildRun({ id: 'run-newer', updatedAt: '2026-05-15T01:10:00.000Z' });
    const older = buildRun({ id: 'run-older', updatedAt: '2026-05-15T01:00:00.000Z' });

    const source = selectRunCheckSource(
      [newer, older],
      [buildRunDetail(newer), buildRunDetail(older)],
    );

    expect(source?.run.id).toBe('run-newer');
    expect(source?.detail?.id).toBe('run-newer');
  });
});
