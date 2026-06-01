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
        confirmationSurface: 'readiness_smoke_operator_confirmation',
        input: {
          kind: 'link',
          runId: 'run_1',
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
      durableWritebackBoundary: {
        action: 'source_context.create',
        confirmationSurface: 'readiness_smoke_operator_confirmation',
        runId: 'run_1',
        status: 'applied',
        taskId: 'task_1',
      },
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

  it('dispatches patch artifact proposals through the patch artifact port', async () => {
    const createPatchArtifact = vi.fn().mockResolvedValue({});
    const recordTimelineEvent = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        createPatchArtifact,
        recordTimelineEvent,
      },
      plan: {
        action: 'artifact.create_patch_from_run',
        input: {
          content: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new',
          runId: 'run_patch',
          taskId: 'task_1',
          title: 'changes.patch',
        },
        successMessage: '已确认并保存任务产物：changes.patch。',
        timeline: {
          payload: {
            evidenceRunId: 'run_patch',
            kind: 'patch',
            source: 'taskplane_write_intent',
            title: 'changes.patch',
          },
          type: 'panel.artifact_written',
        },
      },
    });

    expect(createPatchArtifact).toHaveBeenCalledWith({
      content: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new',
      runId: 'run_patch',
      taskId: 'task_1',
      title: 'changes.patch',
    });
    expect(recordTimelineEvent).toHaveBeenCalledWith('task_1', 'panel.artifact_written', {
      evidenceRunId: 'run_patch',
      kind: 'patch',
      source: 'taskplane_write_intent',
      title: 'changes.patch',
    });
    expect(result).toMatchObject({
      action: 'artifact.create_patch_from_run',
      status: 'completed',
    });
  });

  it('dispatches subtask creation through the unified writeback port', async () => {
    const createSubtasks = vi.fn().mockResolvedValue({
      createdTasks: [
        { id: 'child_1', title: '确认网站范围' },
        { id: 'child_2', title: '整理信息架构' },
      ],
      taskRecordPath: 'Task Records/AI 项目拆解自检.md',
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
            confirmationBoundary: 'operator_confirmed_subtask_create_many',
            confirmationSurface: 'readiness_smoke_operator_confirmation',
            draftOnlyBeforeConfirmation: true,
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
      confirmationBoundary: 'operator_confirmed_subtask_create_many',
      confirmationSurface: 'readiness_smoke_operator_confirmation',
      draftOnlyBeforeConfirmation: true,
      evidenceRunId: 'run_5',
      recordPath: 'Task Records/AI 项目拆解自检.md',
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
      taskRecordPath: 'Task Records/AI 项目拆解自检.md',
      updatedTask: {
        id: 'task_project',
      },
    });
  });

  it('blocks subtask creation when the operator confirmation boundary is missing', async () => {
    const createSubtasks = vi.fn();

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_project',
      ports: {
        createSubtasks,
      },
      plan: {
        action: 'subtask.create_many',
        input: {
          evidenceRunId: 'run_5',
          parentTaskId: 'task_project',
          source: 'agent_api_decomposition',
          subtasks: [{
            acceptanceCriteria: '页面范围已确认。',
            dependency: null,
            summary: '确认首版网站页面范围。',
            title: '确认网站范围',
          }],
        },
        successMessage: '已根据拆解草案创建 1 个子任务。',
        timeline: {
          type: 'panel.project_decomposed',
          payload: {
            evidenceRunId: 'run_5',
            source: 'agent_api_decomposition',
            subtaskCount: 1,
          },
        },
      },
    });

    expect(createSubtasks).not.toHaveBeenCalled();
    expect(result).toEqual({
      action: 'subtask.create_many',
      message: '子任务草案已暂停：缺少已确认的项目拆解写入边界。',
      status: 'blocked',
    });
  });

  it('dispatches business-line-native writes through product service ports', async () => {
    const createBusinessLineRecord = vi.fn().mockResolvedValue({});
    const createBusinessLineNextAction = vi.fn().mockResolvedValue({
      id: 'task_next_action',
      title: 'Draft onboarding checklist',
    });
    const proposeBusinessLineSopRevision = vi.fn().mockResolvedValue({});
    const recordTimelineEvent = vi.fn().mockResolvedValue(undefined);

    const recordResult = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        createBusinessLineRecord,
        recordTimelineEvent,
      },
      plan: {
        action: 'business_record.create',
        input: {
          businessLineId: 'business_line_product',
          source: 'run:run_business',
          summary: 'Business signal.',
          type: 'signal',
        },
        successMessage: '已确认并保存业务记录。',
        timeline: {
          type: 'panel.business_record_written',
          payload: {
            businessLineId: 'business_line_product',
            evidenceRunId: 'run_business',
          },
        },
      },
    });
    const nextActionResult = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        createBusinessLineNextAction,
        recordTimelineEvent,
      },
      plan: {
        action: 'business_next_action.create',
        confirmationBoundary: 'taskplane_writeback_approval_queue',
        confirmationSurface: 'taskplane_writeback_approval_queue',
        draftOnlyBeforeConfirmation: true,
        input: {
          businessLineId: 'business_line_product',
          currentRunStatus: 'running',
          evidenceRunId: 'run_business',
          interruptCurrentRun: false,
          nextStep: 'Draft onboarding checklist.',
          operatorConfirmed: true,
          queuePolicy: {
            currentRunStatus: 'running',
            evidenceItems: ['run:run_business'],
            interruptCurrentRun: false,
            queuePosition: 'behind_current_run',
            requiredGate: 'taskplane_writeback_approval_queue',
            riskLevel: null,
            riskNote: null,
          },
          title: 'Draft onboarding checklist',
        },
        successMessage: '已确认并创建业务线 Next Action：Draft onboarding checklist。',
        timeline: {
          type: 'panel.business_next_action_written',
          payload: {
            businessLineId: 'business_line_product',
            confirmationBoundary: 'taskplane_writeback_approval_queue',
            confirmationSurface: 'taskplane_writeback_approval_queue',
            evidenceRunId: 'run_business',
            queuePolicy: {
              queuePosition: 'behind_current_run',
            },
          },
        },
      },
    });
    const sopResult = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        proposeBusinessLineSopRevision,
        recordTimelineEvent,
      },
      plan: {
        action: 'business_sop_revision.propose',
        input: {
          businessLineId: 'business_line_product',
          changeReason: 'Stale assumptions found.',
          evidenceRunId: 'run_business',
          nextContent: 'Verify evidence before launch copy.',
          requiresDecision: true,
        },
        successMessage: '已确认并提出业务线 SOP revision。',
        timeline: {
          type: 'panel.business_sop_revision_proposed',
          payload: {
            businessLineId: 'business_line_product',
            evidenceRunId: 'run_business',
            requiresDecision: true,
          },
        },
      },
    });

    expect(createBusinessLineRecord).toHaveBeenCalledWith(expect.objectContaining({
      businessLineId: 'business_line_product',
      summary: 'Business signal.',
    }));
    expect(createBusinessLineNextAction).toHaveBeenCalledWith(expect.objectContaining({
      businessLineId: 'business_line_product',
      title: 'Draft onboarding checklist',
    }));
    expect(proposeBusinessLineSopRevision).toHaveBeenCalledWith(expect.objectContaining({
      nextContent: 'Verify evidence before launch copy.',
      requiresDecision: true,
    }));
    expect(recordResult).toMatchObject({ action: 'business_record.create', status: 'completed' });
    expect(nextActionResult).toMatchObject({
      action: 'business_next_action.create',
      createdTasks: [{ id: 'task_next_action' }],
      status: 'completed',
    });
    expect(sopResult).toMatchObject({ action: 'business_sop_revision.propose', status: 'completed' });
    expect(recordTimelineEvent).toHaveBeenCalledWith('task_1', 'panel.business_sop_revision_proposed', expect.objectContaining({
      requiresDecision: true,
    }));
  });

  it('blocks subtask creation when the operator confirmation surface is missing', async () => {
    const createSubtasks = vi.fn();

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_project',
      ports: {
        createSubtasks,
      },
      plan: {
        action: 'subtask.create_many',
        input: {
          evidenceRunId: 'run_5',
          parentTaskId: 'task_project',
          source: 'agent_api_decomposition',
          subtasks: [{
            acceptanceCriteria: '页面范围已确认。',
            dependency: null,
            summary: '确认首版网站页面范围。',
            title: '确认网站范围',
          }],
        },
        successMessage: '已根据拆解草案创建 1 个子任务。',
        timeline: {
          type: 'panel.project_decomposed',
          payload: {
            confirmationBoundary: 'operator_confirmed_subtask_create_many',
            draftOnlyBeforeConfirmation: true,
            evidenceRunId: 'run_5',
            source: 'agent_api_decomposition',
            subtaskCount: 1,
          },
        },
      },
    });

    expect(createSubtasks).not.toHaveBeenCalled();
    expect(result).toEqual({
      action: 'subtask.create_many',
      message: '子任务草案已暂停：缺少已确认的项目拆解写入边界。',
      status: 'blocked',
    });
  });

  it('blocks scheduler Decision writes when the Task Dynamics confirmation boundary is missing', async () => {
    const createDecision = vi.fn();

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        createDecision,
      },
      plan: schedulerDecisionPlan(),
    });

    expect(createDecision).not.toHaveBeenCalled();
    expect(result).toEqual({
      action: 'decision.create',
      message: '调度决策提案已暂停：缺少 Task Dynamics 已确认写入边界。',
      status: 'blocked',
    });
  });

  it('blocks scheduler Decision writes when the Task Dynamics confirmation surface is missing', async () => {
    const createDecision = vi.fn();

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        createDecision,
      },
      plan: {
        ...schedulerDecisionPlan(),
        confirmationBoundary: 'task_dynamics_scheduler_decision_confirmed',
        draftOnlyBeforeConfirmation: true,
      },
    });

    expect(createDecision).not.toHaveBeenCalled();
    expect(result).toEqual({
      action: 'decision.create',
      message: '调度决策提案已暂停：缺少 Task Dynamics 已确认写入边界。',
      status: 'blocked',
    });
  });

  it('dispatches scheduler Decision writes only after Task Dynamics confirmation', async () => {
    const createDecision = vi.fn().mockResolvedValue({});

    const result = await dispatchTaskplaneWritebackApplyPlan({
      taskId: 'task_1',
      ports: {
        createDecision,
      },
      plan: {
        ...schedulerDecisionPlan(),
        confirmationBoundary: 'task_dynamics_scheduler_decision_confirmed',
        confirmationSurface: 'task_dynamics_scheduler_decision_approval_queue',
        draftOnlyBeforeConfirmation: true,
      },
    });

    expect(createDecision).toHaveBeenCalledWith(expect.objectContaining({
      sourceLabel: 'Scheduler/background Decision proposal',
      taskId: 'task_1',
      title: '确认自动巡检策略',
    }));
    expect(result).toMatchObject({
      action: 'decision.create',
      status: 'completed',
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

function schedulerDecisionPlan(): Extract<TaskplaneStructuredWritebackApplyPlan, { action: 'decision.create' }> {
  return {
    action: 'decision.create',
    input: {
      context: {
        whyNow: '自动巡检提出了下一步策略，需要确认。',
      },
      kind: 'direction_choice',
      options: [
        { id: 'option_1', label: '继续自动巡检' },
        { id: 'option_2', label: '暂停自动巡检' },
      ],
      recommendation: {
        label: '继续自动巡检',
        reason: '保持当前自动巡检节奏。',
      },
      scope: 'task',
      sourceId: 'run_scheduler_1',
      sourceLabel: 'Scheduler/background Decision proposal',
      sourceType: 'run',
      taskId: 'task_1',
      title: '确认自动巡检策略',
    },
    requiredApi: 'createDecision',
    successMessage: '已确认并创建 Decision：确认自动巡检策略。',
  };
}
