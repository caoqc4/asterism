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
        path: 'Task Records/phase-closeout.md',
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
});
