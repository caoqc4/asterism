import { describe, expect, it } from 'vitest';

import { evaluateTaskCloseout } from './task-closeout-evaluator.js';
import {
  buildRuntimeResumePlan,
  evaluateRuntimeHandoff,
} from './runtime-handoff.js';
import {
  buildTaskMemoryCoverageInputForTask,
  evaluateTaskMemoryCoverage,
} from './task-memory-coverage.js';
import type { TaskDetail, TaskListItemRecord } from './types/task.js';

const now = '2026-01-01T00:00:00.000Z';

function task(partial: Partial<TaskListItemRecord> = {}): TaskListItemRecord {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? '开发小程序',
    summary: 'summary' in partial ? partial.summary ?? null : '开发一个微信小程序，从需求分析到最终上线。',
    taskType: partial.taskType,
    taskFacets: partial.taskFacets,
    parentTaskId: partial.parentTaskId,
    childTaskIds: partial.childTaskIds,
    state: partial.state ?? 'planned',
    nextStep: 'nextStep' in partial ? partial.nextStep ?? null : '继续推进',
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

function detail(partial: Partial<TaskDetail> = {}): TaskDetail {
  const base = task(partial);
  return {
    ...base,
    artifacts: partial.artifacts ?? [],
    availableProcessTemplates: partial.availableProcessTemplates ?? [],
    completionCriteria: partial.completionCriteria ?? [],
    processTemplates: partial.processTemplates ?? [],
    sourceContexts: partial.sourceContexts ?? [],
    taskFiles: partial.taskFiles ?? [],
    timeline: partial.timeline ?? [],
    resumeCard: partial.resumeCard ?? {
      summary: '项目已拆解，需要从第一项子任务开始推进。',
      currentState: '推进中',
      latestChange: { summary: '完成项目拆解', action: { label: null, targetType: null, targetId: null } },
      completionStatus: { total: 0, satisfied: 0, open: 0, summary: '0/0' },
      currentBlocker: { blockerId: null, title: '无', detail: null },
      keySource: { sourceContextId: null, title: '无', detail: null, priorityReason: null },
      currentMethod: { templateId: null, title: '无', detail: null, selectionReason: null },
      nextSuggestedMove: '进入第一项子任务',
    },
  };
}

describe('runtime end-to-end task workflow scenarios', () => {
  it('closes a project decomposition phase by handing off to the existing first child task', () => {
    const parent = detail({
      id: 'parent_1',
      title: '开发小程序',
      taskType: 'project',
      childTaskIds: ['child_1', 'child_2'],
    });
    const firstChild = task({
      id: 'child_1',
      title: '小程序需求分析与功能设计',
      parentTaskId: 'parent_1',
      nextStep: '明确核心功能和验收标准。',
    });
    const secondChild = task({
      id: 'child_2',
      title: '小程序界面设计与用户体验优化',
      parentTaskId: 'parent_1',
    });

    const closeout = evaluateTaskCloseout({
      intent: 'phase_closeout',
      task: parent,
      childTaskIds: parent.childTaskIds,
      childTasks: [secondChild, firstChild],
    });
    const handoff = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: parent.id,
      closeout,
      messageCount: 5,
      recordPath: 'Task Records/2026-01-01-phase-closeout.md',
    });
    const resumePlan = buildRuntimeResumePlan(handoff, {
      subtaskStartInput: {
        targetTask: firstChild,
        parentTask: parent,
        expectedParentTaskId: parent.id,
        previousHandoffAvailable: true,
        requiresPreviousHandoff: true,
        contextSignals: {
          activeTaskId: firstChild.id,
          inputPromptTaskId: firstChild.id,
          selectedFileTaskId: firstChild.id,
          targetTaskId: firstChild.id,
        },
        availableContext: {
          completionCriteria: true,
          decisions: true,
          files: true,
          handoffNotes: true,
          nextStep: true,
          parentConstraints: true,
          taskMd: true,
          taskState: true,
          workHabits: true,
        },
      },
    });

    expect(closeout).toMatchObject({
      outcome: 'handoff_to_existing_child',
      nextTaskId: 'child_1',
      recordNeeded: true,
    });
    expect(handoff).toMatchObject({
      action: 'handoff_to_task',
      canProceed: true,
      fromTaskId: 'parent_1',
      toTaskId: 'child_1',
      recordPath: 'Task Records/2026-01-01-phase-closeout.md',
    });
    expect(resumePlan).toMatchObject({
      taskId: 'child_1',
      source: 'handoff',
      contextMustBeReassembled: true,
      subtaskStart: {
        canProceed: true,
        label: '子任务启动检查通过',
      },
      nextAction: '进入目标任务并重新装配上下文。',
    });
  });

  it('blocks phase closeout handoff when pending task-memory guidance has not been written', () => {
    const closeout = evaluateTaskCloseout({
      intent: 'phase_closeout',
      task: detail({ id: 'parent_1', childTaskIds: ['child_1'] }),
      childTaskIds: ['child_1'],
      childTasks: [task({ id: 'child_1', parentTaskId: 'parent_1' })],
    });

    const handoff = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: 'parent_1',
      closeout,
      messageCount: 5,
      recordPath: 'Task Records/2026-01-01-phase-closeout.md',
      taskMemoryGuidance: {
        latestGuidanceAt: now,
        outcome: 'pending',
        pendingTargets: ['task_record'],
        reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
        targets: ['task_record'],
      },
    });

    expect(handoff).toMatchObject({
      action: 'block',
      canProceed: false,
      autoContextClear: {
        outcome: 'needs_memory_write',
        shouldAsk: true,
      },
    });
  });

  it('does not turn phase closeout into automatic follow-up task creation', () => {
    const closeout = evaluateTaskCloseout({
      intent: 'phase_closeout',
      task: detail(),
      proposedFollowUpTasks: [{
        title: '继续完善小程序',
        summary: '范围还不明确',
      }],
    });
    const handoff = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: 'parent_1',
      closeout,
      messageCount: 5,
      recordPath: 'Task Records/2026-01-01-phase-closeout.md',
    });

    expect(closeout).toMatchObject({
      outcome: 'needs_follow_up_confirmation',
      followUpProposalAllowed: false,
      recordNeeded: true,
    });
    expect(handoff).toMatchObject({
      action: 'block',
      canProceed: false,
      requiresUserConfirmation: true,
    });
  });

  it('blocks task completion until completion evidence has been recorded in task memory', () => {
    const completionCandidate = detail({
      completionCriteria: [{
        id: 'criteria_1',
        taskId: 'task_1',
        text: '用户已经验收核心功能。',
        status: 'satisfied',
        verificationResponsibility: 'self',
        verificationResponsibilityLabel: '我自己确认',
        createdAt: now,
        updatedAt: now,
        satisfiedAt: now,
      }],
      taskFiles: [],
      sourceContexts: [],
      artifacts: [],
      timeline: [],
    });

    expect(evaluateTaskMemoryCoverage(
      buildTaskMemoryCoverageInputForTask('task_completion', completionCandidate),
    )).toMatchObject({
      outcome: 'needs_memory_write',
      canProceed: false,
      recommendedWrites: ['run', 'source_digest', 'artifact_reference'],
    });
  });

  it('allows task completion after a passed completion check becomes durable evidence', () => {
    const checkedTask = detail({
      completionCriteria: [{
        id: 'criteria_1',
        taskId: 'task_1',
        text: '用户已经验收核心功能。',
        status: 'satisfied',
        verificationResponsibility: 'self',
        verificationResponsibilityLabel: '我自己确认',
        createdAt: now,
        updatedAt: now,
        satisfiedAt: now,
      }],
      taskFiles: [],
      sourceContexts: [],
      artifacts: [],
      timeline: [{
        id: 'event_completion_check',
        taskId: 'task_1',
        type: 'task.completion_check',
        payload: JSON.stringify({
          action: 'passed',
          criteriaTotal: 1,
          criteriaSatisfied: 1,
          criteriaOpen: 0,
          source: 'task_completion_modal',
        }),
        createdAt: '2026-01-01T00:01:00.000Z',
      }],
    });

    expect(evaluateTaskMemoryCoverage(
      buildTaskMemoryCoverageInputForTask('task_completion', checkedTask),
    )).toMatchObject({
      outcome: 'pass',
      canProceed: true,
      reason: '完成边界和恢复证据已具备。',
    });
  });

  it('blocks task switching when recoverable current-task discussion has not been archived', () => {
    const handoff = evaluateRuntimeHandoff({
      intent: 'switch_task',
      fromTaskId: 'task_current',
      toTaskId: 'task_next',
      messageCount: 6,
      hasSpecificHandoffSignal: true,
      archived: false,
    });

    expect(handoff).toMatchObject({
      action: 'block',
      canProceed: false,
      requiresArchive: true,
      shouldClearMessages: false,
    });
  });

  it('allows task switching after recoverable discussion has been archived', () => {
    const handoff = evaluateRuntimeHandoff({
      intent: 'switch_task',
      fromTaskId: 'task_current',
      toTaskId: 'task_next',
      messageCount: 6,
      hasSpecificHandoffSignal: true,
      archived: true,
      recordPath: 'Task Records/2026-01-01-context-switch.md',
    });

    expect(handoff).toMatchObject({
      action: 'switch_task',
      canProceed: true,
      fromTaskId: 'task_current',
      toTaskId: 'task_next',
      shouldClearMessages: false,
    });
  });

  it('blocks run start when the task lacks recovery context and a next step', () => {
    const runnableTask = detail({
      id: 'task_run',
      summary: null,
      nextStep: null,
      taskFiles: [],
      resumeCard: {
        summary: '',
        currentState: '未开始',
        latestChange: { summary: '暂无', action: { label: null, targetType: null, targetId: null } },
        completionStatus: { total: 0, satisfied: 0, open: 0, summary: '0/0' },
        currentBlocker: { blockerId: null, title: '无', detail: null },
        keySource: { sourceContextId: null, title: '无', detail: null, priorityReason: null },
        currentMethod: { templateId: null, title: '无', detail: null, selectionReason: null },
        nextSuggestedMove: '',
      },
    });

    expect(evaluateTaskMemoryCoverage(
      buildTaskMemoryCoverageInputForTask('run_start', runnableTask),
    )).toMatchObject({
      outcome: 'needs_user_clarification',
      canStartExecution: false,
      missing: ['缺少 Task.md、相关 Task Record 或等价恢复摘要。', '缺少明确下一步。'],
    });
  });

  it('allows run start when the task has recovery context and a next step', () => {
    const runnableTask = detail({
      id: 'task_run',
      summary: null,
      nextStep: '先完成需求核对。',
      taskFiles: [{
        id: 'file_task_md',
        taskId: 'task_run',
        kind: 'file',
        path: 'Task.md',
        name: 'Task.md',
        content: '# Task\n\n## Next Step\n先完成需求核对。',
        createdAt: now,
        updatedAt: now,
      }],
      resumeCard: {
        summary: '',
        currentState: '推进中',
        latestChange: { summary: '已有任务说明', action: { label: null, targetType: null, targetId: null } },
        completionStatus: { total: 0, satisfied: 0, open: 0, summary: '0/0' },
        currentBlocker: { blockerId: null, title: '无', detail: null },
        keySource: { sourceContextId: null, title: '无', detail: null, priorityReason: null },
        currentMethod: { templateId: null, title: '无', detail: null, selectionReason: null },
        nextSuggestedMove: '先完成需求核对。',
      },
    });

    expect(evaluateTaskMemoryCoverage(
      buildTaskMemoryCoverageInputForTask('run_start', runnableTask),
    )).toMatchObject({
      outcome: 'pass',
      canStartExecution: true,
      reason: '任务恢复摘要和下一步已具备，可以开始执行。',
    });
  });
});
