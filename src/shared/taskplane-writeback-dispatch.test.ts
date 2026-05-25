import { describe, expect, it, vi } from 'vitest';

import { dispatchTaskplaneWritebackApplyPlan } from './taskplane-writeback-dispatch.js';
import type { TaskplaneStructuredWritebackApplyPlan } from './taskplane-writeback-apply-plan.js';

describe('Taskplane writeback dispatch', () => {
  it('dispatches source writes through provided ports and records timeline evidence', async () => {
    const createSourceContext = vi.fn().mockResolvedValue({});
    const recordTimelineEvent = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        createSourceContext,
        recordTimelineEvent,
      },
      plan: {
        action: 'source_context.create',
        input: {
          kind: 'link',
          taskId: 'task_1',
          title: 'Codex docs',
          uri: 'https://example.com/codex',
        },
        successMessage: '已确认并保存来源上下文：Codex docs。',
        timeline: {
          type: 'panel.source_updated',
          payload: {
            evidenceRunId: 'run_1',
            source: 'taskplane_write_intent',
          },
        },
      },
    });

    expect(result).toMatchObject({
      action: 'source_context.create',
      status: 'completed',
      successMessage: '已确认并保存来源上下文：Codex docs。',
    });
    expect(createSourceContext).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_1',
      title: 'Codex docs',
    }));
    expect(recordTimelineEvent).toHaveBeenCalledWith('task_1', 'panel.source_updated', {
      evidenceRunId: 'run_1',
      source: 'taskplane_write_intent',
    });
  });

  it('returns a blocked result instead of writing when a required port is missing', async () => {
    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {},
      plan: nextStepPlan(),
    });

    expect(result).toEqual({
      action: 'task.update_next_step',
      message: '下一步提案已暂停：当前环境不支持更新任务。',
      status: 'blocked',
    });
  });

  it('dispatches next-step updates and returns the updated task for local UI state', async () => {
    const updateTask = vi.fn().mockResolvedValue({
      id: 'task_1',
      nextStep: '整理页面信息架构。',
    });

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        updateTask,
        recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      },
      plan: nextStepPlan(),
    });

    expect(updateTask).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '整理页面信息架构。',
    });
    expect(result).toMatchObject({
      action: 'task.update_next_step',
      status: 'completed',
      updatedTask: {
        id: 'task_1',
        nextStep: '整理页面信息架构。',
      },
    });
  });

  it('dispatches task file writes through provided ports and records timeline evidence', async () => {
    const createTaskFile = vi.fn().mockResolvedValue({});
    const recordTimelineEvent = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        createTaskFile,
        recordTimelineEvent,
      },
      plan: {
        action: 'task_file.create',
        input: {
          content: '# 本轮结论',
          kind: 'file',
          name: 'record.md',
          path: 'Task Records/record.md',
          taskId: 'task_1',
        },
        requiredApi: 'createTaskFile',
        successMessage: '已确认并写入任务文件：Task Records/record.md。',
        taskId: 'task_1',
        timeline: {
          payload: {
            path: 'Task Records/record.md',
            source: 'taskplane_write_intent',
          },
          type: 'panel.task_file_written',
        },
      },
    });

    expect(createTaskFile).toHaveBeenCalledWith({
      content: '# 本轮结论',
      kind: 'file',
      name: 'record.md',
      path: 'Task Records/record.md',
      taskId: 'task_1',
    });
    expect(recordTimelineEvent).toHaveBeenCalledWith('task_1', 'panel.task_file_written', {
      path: 'Task Records/record.md',
      source: 'taskplane_write_intent',
    });
    expect(result).toMatchObject({
      action: 'task_file.create',
      status: 'completed',
    });
  });

  it('dispatches artifact proposals through provided ports and records timeline evidence', async () => {
    const createArtifact = vi.fn().mockResolvedValue({});
    const recordTimelineEvent = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        createArtifact,
        recordTimelineEvent,
      },
      plan: {
        action: 'artifact.create_note_from_run',
        input: {
          content: '# 首版教程结构',
          runId: 'run_6',
          taskId: 'task_1',
          title: 'codex-tutorial-structure.md',
        },
        successMessage: '已确认并保存任务产物：codex-tutorial-structure.md。',
        timeline: {
          payload: {
            evidenceRunId: 'run_6',
            source: 'taskplane_write_intent',
            title: 'codex-tutorial-structure.md',
          },
          type: 'panel.artifact_written',
        },
      },
    });

    expect(createArtifact).toHaveBeenCalledWith({
      content: '# 首版教程结构',
      runId: 'run_6',
      taskId: 'task_1',
      title: 'codex-tutorial-structure.md',
    });
    expect(recordTimelineEvent).toHaveBeenCalledWith('task_1', 'panel.artifact_written', {
      evidenceRunId: 'run_6',
      source: 'taskplane_write_intent',
      title: 'codex-tutorial-structure.md',
    });
    expect(result).toMatchObject({
      action: 'artifact.create_note_from_run',
      status: 'completed',
    });
  });

  it('dispatches subtask creation through the unified writeback port', async () => {
    const createSubtasks = vi.fn().mockResolvedValue({
      createdTasks: [
        { id: 'child_1', title: '确认网站范围' },
        { id: 'child_2', title: '整理信息架构' },
      ],
      updatedTask: {
        id: 'task_project',
        taskType: 'project',
      },
    });
    const recordTimelineEvent = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_project',
      ports: {
        createSubtasks,
        recordTimelineEvent,
      },
      plan: {
        action: 'subtask.create_many',
        input: {
          evidenceRunId: 'run_5',
          nextStep: '进入第一个子任务。',
          parentTaskId: 'task_project',
          review: '拆解保持大块粒度。',
          source: 'agent_cli_decomposition',
          subtasks: [{
            acceptanceCriteria: '页面范围已确认。',
            dependency: null,
            summary: '确认首版网站页面范围。',
            title: '确认网站范围',
          }, {
            acceptanceCriteria: '首版信息架构已形成。',
            dependency: '确认网站范围',
            summary: '整理首页、教程和案例页面结构。',
            title: '整理信息架构',
          }],
        },
        successMessage: '已根据拆解草案创建 2 个子任务。',
        timeline: {
          type: 'panel.project_decomposed',
          payload: {
            evidenceRunId: 'run_5',
            source: 'agent_cli_decomposition',
            subtaskCount: 2,
          },
        },
      },
    });

    expect(createSubtasks).toHaveBeenCalledWith(expect.objectContaining({
      parentTaskId: 'task_project',
    }));
    expect(recordTimelineEvent).toHaveBeenCalledWith('task_project', 'panel.project_decomposed', {
      childTaskIds: ['child_1', 'child_2'],
      evidenceRunId: 'run_5',
      source: 'agent_cli_decomposition',
      subtaskCount: 2,
    });
    expect(result).toMatchObject({
      action: 'subtask.create_many',
      createdTasks: [
        { id: 'child_1' },
        { id: 'child_2' },
      ],
      status: 'completed',
      updatedTask: {
        id: 'task_project',
      },
    });
  });
});

function nextStepPlan(): TaskplaneStructuredWritebackApplyPlan {
  return {
    action: 'task.update_next_step',
    input: {
      id: 'task_1',
      nextStep: '整理页面信息架构。',
    },
    nextStep: '整理页面信息架构。',
    requiredApi: 'updateTask',
    successMessage: '已确认并更新下一步：整理页面信息架构。',
    timeline: {
      type: 'panel.task_goal_updated',
      payload: {
        evidenceRunId: 'run_1',
        nextStep: '整理页面信息架构。',
        source: 'taskplane_write_intent',
      },
    },
  };
}
