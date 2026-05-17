import { describe, expect, it } from 'vitest';
import { groupRuntimeEventsForReplay, projectRuntimeEvents } from './runtime-event-record.js';

describe('runtime event record projection', () => {
  it('projects timeline and run records into a unified audit stream', () => {
    const events = projectRuntimeEvents({
      taskId: 'task-1',
      timeline: [{
        id: 'timeline-1',
        taskId: 'task-1',
        type: 'task.waiting_changed',
        payload: '等待设计确认',
        createdAt: '2026-05-14T08:00:00.000Z',
      }],
      runs: [{
        id: 'run-1',
        taskId: 'task-1',
        type: 'agent',
        status: 'paused',
        instructions: '继续推进',
        output: null,
        outputSource: null,
        failureReason: null,
        createdAt: '2026-05-14T08:10:00.000Z',
        updatedAt: '2026-05-14T08:20:00.000Z',
      }],
      runStepsByRunId: {
        'run-1': [{
          id: 'step-1',
          runId: 'run-1',
          index: 1,
          kind: 'checkpoint',
          status: 'completed',
          title: 'Resume checkpoint created',
          input: null,
          output: '等待用户确认',
          error: null,
          createdAt: '2026-05-14T08:15:00.000Z',
          updatedAt: '2026-05-14T08:15:00.000Z',
        }],
      },
    });

    expect(events.map((event) => event.type)).toEqual([
      'run.paused',
      'runtime.resume_pending',
      'run_step.checkpoint.completed',
      'task.waiting_changed',
    ]);
    expect(events.find((event) => event.type === 'runtime.resume_pending')?.sourceType).toBe('runtime_projection');
    expect(events.find((event) => event.type === 'run_step.checkpoint.completed')?.priority).toBe('p2');
  });

  it('deduplicates identical projected sources', () => {
    const events = projectRuntimeEvents({
      runs: [{
        id: 'run-1',
        taskId: 'task-1',
        type: 'agent',
        status: 'completed',
        instructions: null,
        output: 'done',
        outputSource: 'system',
        failureReason: null,
        createdAt: '2026-05-14T08:10:00.000Z',
        updatedAt: '2026-05-14T08:20:00.000Z',
      }],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('run:run-1');
  });

  it('projects task records and decisions that are not already represented by timeline', () => {
    const events = projectRuntimeEvents({
      timeline: [{
        id: 'timeline-decision',
        taskId: 'task-1',
        type: 'decision.created',
        payload: JSON.stringify({ decisionId: 'decision-1' }),
        createdAt: '2026-05-14T08:00:00.000Z',
      }],
      taskFiles: [{
        id: 'file-1',
        taskId: 'task-1',
        name: 'phase-closeout.md',
        path: ' Task Records\\phase-closeout.md ',
        kind: 'file',
        content: '# closeout',
        createdAt: '2026-05-14T08:05:00.000Z',
        updatedAt: '2026-05-14T08:05:00.000Z',
      }],
      decisions: [
        {
          id: 'decision-1',
          taskId: 'task-1',
          title: 'Already in timeline',
          status: 'pending',
          scope: 'task',
          kind: 'direction_choice',
          createdAt: '2026-05-14T08:06:00.000Z',
          updatedAt: '2026-05-14T08:06:00.000Z',
        },
        {
          id: 'decision-2',
          taskId: 'task-1',
          title: 'Choose rollout path',
          status: 'pending',
          scope: 'task',
          kind: 'direction_choice',
          context: { whyNow: '需要确认发布范围。' },
          createdAt: '2026-05-14T08:07:00.000Z',
          updatedAt: '2026-05-14T08:07:00.000Z',
        },
      ],
    });

    expect(events.map((event) => event.type)).toEqual([
      'decision.pending',
      'task_record.updated',
      'decision.created',
    ]);
    expect(events.find((event) => event.type === 'decision.pending')?.title).toContain('Choose rollout path');
    expect(events.find((event) => event.type === 'task_record.updated')?.sourceType).toBe('task_record');
  });

  it('projects panel-only durable actions from timeline', () => {
    const events = projectRuntimeEvents({
      timeline: [{
        id: 'timeline-panel',
        taskId: 'task-1',
        type: 'panel.context_switch_accepted',
        payload: JSON.stringify({ toTaskId: 'task-2', toTaskTitle: 'Next task' }),
        createdAt: '2026-05-14T08:00:00.000Z',
      }],
    });

    expect(events[0]).toMatchObject({
      type: 'panel.context_switch_accepted',
      title: '任务上下文切换已确认',
      priority: 'p2',
      sourceType: 'timeline',
    });
    expect(events[0]?.relatedTaskId).toBe('task-2');
  });

  it('shows changed durable task fields in task update events', () => {
    const events = projectRuntimeEvents({
      timeline: [{
        id: 'timeline-update',
        taskId: 'task-1',
        type: 'task.updated',
        payload: JSON.stringify({
          summary: '完成需求确认。',
          nextStep: '推进设计方案。',
          riskLevel: 'medium',
          riskNote: '等待外部接口确认。',
          changedFields: ['summary', 'nextStep', 'riskLevel', 'riskNote'],
        }),
        createdAt: '2026-05-14T08:00:00.000Z',
      }],
    });

    expect(events[0]).toMatchObject({
      title: '任务字段已更新：摘要、下一步、风险等级、风险说明',
      detail: '摘要：完成需求确认。 / 下一步：推进设计方案。 / 风险：medium · 等待外部接口确认。',
    });
  });

  it('formats durable task memory timeline events as readable task dynamics', () => {
    const events = projectRuntimeEvents({
      timeline: [
        {
          id: 'criteria-created',
          taskId: 'task-1',
          type: 'completion_criteria.created',
          payload: JSON.stringify({ text: '完成核心验收清单', status: 'open' }),
          createdAt: '2026-05-14T08:00:00.000Z',
        },
        {
          id: 'dependency-created',
          taskId: 'task-1',
          type: 'task_dependency.created',
          payload: JSON.stringify({
            blockedByTaskTitle: '接口联调',
            reason: '等待接口完成',
            status: 'active',
          }),
          createdAt: '2026-05-14T08:01:00.000Z',
        },
        {
          id: 'source-archived',
          taskId: 'task-1',
          type: 'source_context.archived',
          payload: JSON.stringify({
            title: '旧调研材料',
            kind: 'note',
            sourceRole: 'raw',
            isKey: false,
          }),
          createdAt: '2026-05-14T08:02:00.000Z',
        },
      ],
    });

    expect(events.map((event) => event.title)).toEqual([
      '上下文已归档：旧调研材料',
      '新增依赖：接口联调',
      '完成标准已添加：完成核心验收清单',
    ]);
    expect(events.find((event) => event.type === 'completion_criteria.created')?.detail).toBe('状态：未满足');
    expect(events.find((event) => event.type === 'task_dependency.created')?.detail).toBe('上游：接口联调 / 原因：等待接口完成 / 状态：active');
    expect(events.find((event) => event.type === 'source_context.archived')?.detail).toBe('角色：raw / 类型：note');
  });

  it('preserves task-to-task handoff targets for replay grouping', () => {
    const events = projectRuntimeEvents({
      taskId: 'task-a',
      timeline: [
        {
          id: 'timeline-handoff',
          taskId: 'task-a',
          type: 'panel.completion_handoff',
          payload: JSON.stringify({ nextTaskId: 'task-b', nextTaskTitle: 'Task B' }),
          createdAt: '2026-05-14T08:00:00.000Z',
        },
        {
          id: 'timeline-switch',
          taskId: 'task-a',
          type: 'panel.context_switch_accepted',
          payload: JSON.stringify({ toTaskId: 'task-b', toTaskTitle: 'Task B', archived: true }),
          createdAt: '2026-05-14T08:01:00.000Z',
        },
      ],
    });

    expect(events.map((event) => event.relatedTaskId)).toEqual(['task-b', 'task-b']);

    const handoffGroup = groupRuntimeEventsForReplay(events).find((group) => group.kind === 'handoff');

    expect(handoffGroup).toMatchObject({
      taskId: 'task-a',
      relatedTaskIds: ['task-b'],
      eventIds: [
        'timeline:timeline-handoff',
        'timeline:timeline-switch',
      ],
      sourceTypes: ['timeline'],
    });
  });

  it('groups projected events into replay-oriented stories without UI assumptions', () => {
    const events = projectRuntimeEvents({
      taskId: 'task-1',
      timeline: [
        {
          id: 'timeline-state',
          taskId: 'task-1',
          type: 'task.next_step_changed',
          payload: '继续推进',
          createdAt: '2026-05-14T08:00:00.000Z',
        },
        {
          id: 'timeline-handoff',
          taskId: 'task-1',
          type: 'panel.completion_handoff',
          payload: JSON.stringify({ nextTaskId: 'task-2' }),
          createdAt: '2026-05-14T08:20:00.000Z',
        },
        {
          id: 'timeline-project',
          taskId: 'task-1',
          type: 'panel.project_membership_changed',
          payload: JSON.stringify({ parentTaskId: 'project-1' }),
          createdAt: '2026-05-14T08:10:00.000Z',
        },
      ],
      runs: [{
        id: 'run-1',
        taskId: 'task-1',
        type: 'agent',
        status: 'paused',
        instructions: '继续执行',
        output: null,
        outputSource: null,
        failureReason: null,
        createdAt: '2026-05-14T08:30:00.000Z',
        updatedAt: '2026-05-14T08:40:00.000Z',
      }],
      taskFiles: [{
        id: 'record-1',
        taskId: 'task-1',
        name: '2026-05-14-completion-handoff.md',
        path: 'Task Records/2026-05-14-completion-handoff.md',
        kind: 'file',
        content: '# handoff',
        createdAt: '2026-05-14T08:21:00.000Z',
        updatedAt: '2026-05-14T08:21:00.000Z',
      }],
      decisions: [{
        id: 'decision-1',
        taskId: 'task-1',
        title: '确认发布窗口',
        status: 'pending',
        scope: 'task',
        kind: 'direction_choice',
        createdAt: '2026-05-14T08:25:00.000Z',
        updatedAt: '2026-05-14T08:25:00.000Z',
      }],
    });

    const groups = groupRuntimeEventsForReplay(events);

    expect(groups.map((group) => group.kind)).toEqual([
      'execution_recovery',
      'decision',
      'handoff',
      'project_structure',
      'task_state',
    ]);
    expect(groups.find((group) => group.kind === 'handoff')?.eventIds).toEqual([
      'timeline:timeline-handoff',
      'task_record:record-1',
    ]);
    expect(groups.find((group) => group.kind === 'handoff')?.relatedTaskIds).toEqual(['task-2']);
    expect(groups.find((group) => group.kind === 'execution_recovery')?.priority).toBe('p2');
  });

  it('groups task memory guidance run steps as durable record replay', () => {
    const events = projectRuntimeEvents({
      runs: [{
        id: 'run-1',
        taskId: 'task-1',
        type: 'agent',
        status: 'completed',
        instructions: 'Update task memory',
        output: 'done',
        outputSource: 'system',
        failureReason: null,
        createdAt: '2026-05-14T08:00:00.000Z',
        updatedAt: '2026-05-14T08:03:00.000Z',
      }],
      runStepsByRunId: {
        'run-1': [{
          id: 'step-memory',
          runId: 'run-1',
          index: 1,
          kind: 'plan',
          status: 'completed',
          title: '任务记忆建议',
          input: null,
          output: '- Task.md: next_step',
          error: null,
          createdAt: '2026-05-14T08:01:00.000Z',
          updatedAt: '2026-05-14T08:01:00.000Z',
        }],
      },
    });

    const group = groupRuntimeEventsForReplay(events).find((item) => item.kind === 'durable_record');

    expect(group).toMatchObject({
      title: '任务记忆建议',
      eventIds: ['run_step:step-memory'],
    });
  });

  it('groups completion checks as quality gates instead of generic task state', () => {
    const events = projectRuntimeEvents({
      timeline: [{
        id: 'timeline-completion-check',
        taskId: 'task-1',
        type: 'task.completion_check',
        payload: JSON.stringify({
          reason: '完成标准已核对。',
          runVerificationDetail: 'Run 验证通过。',
        }),
        createdAt: '2026-05-14T08:00:00.000Z',
      }],
    });

    const group = groupRuntimeEventsForReplay(events)[0];

    expect(events[0]).toMatchObject({
      title: '任务完成检查',
      detail: '完成标准已核对。 · Run 验证通过。',
      priority: 'p2',
    });
    expect(group).toMatchObject({
      kind: 'quality_gate',
      title: '质量检查',
      summary: '完成标准已核对。 · Run 验证通过。',
    });
  });
});
