import { describe, expect, it, vi } from 'vitest';

import { TaskplaneWritebackDispatchService } from './taskplane-writeback-dispatch-service.js';
import type {
  TaskplaneSourceContextWritebackApplyPlan,
  TaskplaneStructuredWritebackApplyPlan,
} from '../../../shared/taskplane-writeback-apply-plan.js';

describe('TaskplaneWritebackDispatchService', () => {
  it('adapts shared writeback dispatch to main task and decision services', async () => {
    const taskService = {
      create: vi.fn(),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn(),
      createTaskDependency: vi.fn(),
      getDetail: vi.fn(),
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn(),
      update: vi.fn().mockResolvedValue({
        id: 'task_1',
        nextStep: '整理页面信息架构。',
      }),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const taskFiles = taskFileRepository();
    const service = new TaskplaneWritebackDispatchService(taskService, decisionService, taskFiles, artifactRepository());

    const result = await service.dispatch({
      taskId: 'task_1',
      plan: nextStepPlan(),
    });

    expect(taskService.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '整理页面信息架构。',
    });
    expect(taskService.recordTimelineEvent).toHaveBeenCalledWith({
      payload: {
        evidenceRunId: 'run_1',
        nextStep: '整理页面信息架构。',
        source: 'taskplane_write_intent',
      },
      taskId: 'task_1',
      type: 'panel.task_goal_updated',
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

  it('routes source contexts and decisions through their main domain services', async () => {
    const taskService = {
      create: vi.fn(),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn().mockResolvedValue({
        id: 'source_1',
      }),
      createTaskDependency: vi.fn(),
      getDetail: vi.fn(),
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn(),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn().mockResolvedValue({
        id: 'decision_1',
      }),
    };
    const taskFiles = taskFileRepository();
    const service = new TaskplaneWritebackDispatchService(taskService, decisionService, taskFiles, artifactRepository());

    const sourceResult = await service.dispatch({
      taskId: 'task_1',
      plan: sourceContextPlan(),
    });
    await service.dispatch({
      taskId: 'task_1',
      plan: decisionPlan(),
    });

    expect(taskService.createSourceContext).toHaveBeenCalledWith({
      capturedAt: '2026-05-24T00:00:00.000Z',
      content: 'Source: https://example.com/codex\n\n官方文档入口。',
      credibility: 'verified',
      isKey: true,
      kind: 'link',
      note: '官方文档入口。',
      runId: 'run_1',
      sourceRole: 'raw',
      taskId: 'task_1',
      title: 'Codex docs',
      uri: 'https://example.com/codex',
    });
    expect(taskService.recordTimelineEvent).toHaveBeenCalledWith({
      payload: {
        confirmationSurface: 'right_panel_writeback_confirmation',
        evidenceRunId: 'run_1',
        source: 'taskplane_write_intent',
        title: 'Codex docs',
        uri: 'https://example.com/codex',
      },
      taskId: 'task_1',
      type: 'panel.source_updated',
    });
    expect(sourceResult).toMatchObject({
      action: 'source_context.create',
      durableWritebackBoundary: {
        action: 'source_context.create',
        confirmationSurface: 'right_panel_writeback_confirmation',
        runId: 'run_1',
        status: 'applied',
        taskId: 'task_1',
      },
      status: 'completed',
    });
    expect(decisionService.create).toHaveBeenCalledWith({
      context: {
        impact: '建议结果：教程加案例',
        whyNow: '范围影响页面结构。',
      },
      kind: 'direction_choice',
      options: [
        {
          id: 'option_1',
          label: '基础教程',
        },
        {
          id: 'option_2',
          label: '教程加案例',
        },
      ],
      recommendation: {
        label: '教程加案例',
        reason: '范围影响页面结构。',
      },
      scope: 'task',
      sourceId: 'run_2',
      sourceLabel: 'Agent CLI Write Intent',
      sourceType: 'run',
      taskId: 'task_1',
      title: '确认首版范围',
    });
  });

  it('blocks writeback plans that target a different task', async () => {
    const taskService = {
      create: vi.fn(),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn(),
      createTaskDependency: vi.fn(),
      getDetail: vi.fn(),
      recordTimelineEvent: vi.fn(),
      transition: vi.fn(),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const taskFiles = taskFileRepository();
    const service = new TaskplaneWritebackDispatchService(taskService, decisionService, taskFiles, artifactRepository());

    const result = await service.dispatch({
      taskId: 'task_2',
      plan: nextStepPlan(),
    });

    expect(result).toEqual({
      action: 'task.update_next_step',
      message: 'Write Intent 已暂停：计划目标任务与当前任务不一致。',
      status: 'blocked',
    });
    expect(taskService.update).not.toHaveBeenCalled();
  });

  it('routes task file writes through the task file repository and timeline service', async () => {
    const taskService = {
      create: vi.fn(),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn(),
      createTaskDependency: vi.fn(),
      getDetail: vi.fn(),
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn(),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const files = taskFileRepository();
    files.create.mockResolvedValue({
      content: '# 本轮结论',
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'task_file_1',
      kind: 'file',
      name: 'record.md',
      path: 'Task Records/record.md',
      taskId: 'task_1',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const service = new TaskplaneWritebackDispatchService(taskService, decisionService, files, artifactRepository());

    const result = await service.dispatch({
      taskId: 'task_1',
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

    expect(files.create).toHaveBeenCalledWith({
      content: '# 本轮结论',
      kind: 'file',
      name: 'record.md',
      path: 'Task Records/record.md',
      taskId: 'task_1',
    });
    expect(taskService.recordTimelineEvent).toHaveBeenCalledWith({
      payload: {
        path: 'Task Records/record.md',
        source: 'taskplane_write_intent',
      },
      taskId: 'task_1',
      type: 'panel.task_file_written',
    });
    expect(result).toMatchObject({
      action: 'task_file.create',
      status: 'completed',
    });
  });

  it('routes artifact proposals through the artifact repository and timeline service', async () => {
    const taskService = {
      create: vi.fn(),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn(),
      createTaskDependency: vi.fn(),
      getDetail: vi.fn(),
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn(),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const artifacts = artifactRepository();
    artifacts.createNoteFromRun.mockResolvedValue({
      content: '# 首版教程结构',
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'artifact_1',
      kind: 'note',
      sourceId: 'run_6',
      sourceType: 'run',
      taskId: 'task_1',
      title: 'codex-tutorial-structure.md',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const service = new TaskplaneWritebackDispatchService(taskService, decisionService, taskFileRepository(), artifacts);

    const result = await service.dispatch({
      taskId: 'task_1',
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

    expect(artifacts.createNoteFromRun).toHaveBeenCalledWith({
      content: '# 首版教程结构',
      runId: 'run_6',
      taskId: 'task_1',
      title: 'codex-tutorial-structure.md',
    });
    expect(taskService.recordTimelineEvent).toHaveBeenCalledWith({
      payload: {
        evidenceRunId: 'run_6',
        source: 'taskplane_write_intent',
        title: 'codex-tutorial-structure.md',
      },
      taskId: 'task_1',
      type: 'panel.artifact_written',
    });
    expect(result).toMatchObject({
      action: 'artifact.create_note_from_run',
      status: 'completed',
    });
  });

  it('routes patch artifact proposals through the patch artifact repository method', async () => {
    const taskService = {
      create: vi.fn(),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn(),
      createTaskDependency: vi.fn(),
      getDetail: vi.fn(),
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn(),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const artifacts = artifactRepository();
    artifacts.createPatchFromRun.mockResolvedValue({
      content: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new',
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'artifact_patch_1',
      kind: 'patch',
      sourceId: 'run_patch',
      sourceType: 'run',
      taskId: 'task_1',
      title: 'changes.patch',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const service = new TaskplaneWritebackDispatchService(taskService, decisionService, taskFileRepository(), artifacts);

    const result = await service.dispatch({
      taskId: 'task_1',
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

    expect(artifacts.createPatchFromRun).toHaveBeenCalledWith({
      content: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new',
      runId: 'run_patch',
      taskId: 'task_1',
      title: 'changes.patch',
    });
    expect(taskService.recordTimelineEvent).toHaveBeenCalledWith({
      payload: {
        evidenceRunId: 'run_patch',
        kind: 'patch',
        source: 'taskplane_write_intent',
        title: 'changes.patch',
      },
      taskId: 'task_1',
      type: 'panel.artifact_written',
    });
    expect(result).toMatchObject({
      action: 'artifact.create_patch_from_run',
      status: 'completed',
    });
  });

  it('applies subtask proposals through task service project updates, child creation, criteria, and dependencies', async () => {
    const taskService = {
      create: vi.fn()
        .mockResolvedValueOnce({
          id: 'child_1',
          title: '确认网站范围',
          state: 'captured',
        })
        .mockResolvedValueOnce({
          id: 'child_2',
          title: '整理信息架构',
          state: 'captured',
        }),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn().mockResolvedValue({ id: 'criteria_1' }),
      createSourceContext: vi.fn(),
      createTaskDependency: vi.fn().mockResolvedValue({ id: 'dependency_1' }),
      getDetail: vi.fn().mockResolvedValue({
        id: 'task_project',
        nextStep: null,
        taskFacets: ['simple'],
        taskType: 'simple',
      }),
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn()
        .mockImplementation(async (input) => ({
          id: input.id,
          title: input.id === 'child_1' ? '确认网站范围' : '整理信息架构',
          state: input.nextState,
        })),
      update: vi.fn().mockResolvedValue({
        id: 'task_project',
        nextStep: '进入第一个子任务。',
        taskFacets: ['project', 'simple'],
        taskType: 'project',
      }),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const taskFiles = taskFileRepository();
    const service = new TaskplaneWritebackDispatchService(taskService, decisionService, taskFiles, artifactRepository());

    const result = await service.dispatch({
      taskId: 'task_project',
      plan: {
        action: 'subtask.create_many',
        input: {
          evidenceRunId: 'run_5',
          nextStep: '进入第一个子任务。',
          parentSummary: '完成首版网站目标与范围确认。',
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
          payload: {
            confirmationBoundary: 'operator_confirmed_subtask_create_many',
            confirmationSurface: 'readiness_smoke_operator_confirmation',
            draftOnlyBeforeConfirmation: true,
            evidenceRunId: 'run_5',
            source: 'agent_cli_decomposition',
            subtaskCount: 2,
          },
          type: 'panel.project_decomposed',
        },
      },
    });

    expect(taskService.update).toHaveBeenCalledWith({
      id: 'task_project',
      nextStep: '进入第一个子任务。',
      summary: '完成首版网站目标与范围确认。',
      taskFacets: ['project', 'simple'],
      taskType: 'project',
    });
    expect(taskService.create).toHaveBeenCalledWith(expect.objectContaining({
      parentTaskId: 'task_project',
      summary: [
        '确认首版网站页面范围。',
        '验收：页面范围已确认。',
      ].join('\n'),
      taskFacets: ['simple'],
      taskType: 'simple',
      title: '确认网站范围',
    }));
    expect(taskService.createCompletionCriteria).toHaveBeenCalledWith({
      taskId: 'child_1',
      text: '页面范围已确认。',
      verificationResponsibility: 'unknown',
    });
    expect(taskService.createCompletionCriteria).toHaveBeenCalledWith({
      taskId: 'task_project',
      text: '完成并验收 2 个项目子任务。',
      verificationResponsibility: 'unknown',
    });
    expect(taskService.createTaskDependency).toHaveBeenCalledWith({
      taskId: 'child_2',
      blockedByTaskId: 'child_1',
      reason: '确认网站范围',
    });
    expect(taskFiles.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('拆解保持大块粒度。'),
      name: 'AI 项目拆解自检.md',
      path: 'Task Records/AI 项目拆解自检.md',
      taskId: 'task_project',
    }));
    expect(taskService.recordTimelineEvent).toHaveBeenCalledWith({
      payload: {
        childTaskIds: ['child_1', 'child_2'],
        confirmationBoundary: 'operator_confirmed_subtask_create_many',
        confirmationSurface: 'readiness_smoke_operator_confirmation',
        draftOnlyBeforeConfirmation: true,
        evidenceRunId: 'run_5',
        recordPath: 'Task Records/AI 项目拆解自检.md',
        source: 'agent_cli_decomposition',
        subtaskCount: 2,
      },
      taskId: 'task_project',
      type: 'panel.project_decomposed',
    });
    expect(result).toMatchObject({
      action: 'subtask.create_many',
      createdTasks: [
        { id: 'child_1', state: 'planned' },
        { id: 'child_2', state: 'planned' },
      ],
      taskRecordPath: 'Task Records/AI 项目拆解自检.md',
      status: 'completed',
      updatedTask: {
        id: 'task_project',
        taskType: 'project',
      },
    });
  });

  it('blocks writeback when explicit business line ownership mismatches the task carrier', async () => {
    const taskService = {
      create: vi.fn(),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn(),
      createTaskDependency: vi.fn(),
      getDetail: vi.fn(),
      recordTimelineEvent: vi.fn(),
      transition: vi.fn(),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const taskFiles = taskFileRepository();
    const ownershipResolver = {
      resolveOwnership: vi.fn().mockResolvedValue({
        status: 'mismatch',
        explicitBusinessLineId: 'business_line_other',
        resolvedBusinessLineId: 'business_line_product',
        resolvedSource: 'task',
        taskId: 'task_1',
        runId: null,
      }),
    };
    const service = new TaskplaneWritebackDispatchService(
      taskService,
      decisionService,
      taskFiles,
      artifactRepository(),
      ownershipResolver,
    );
    const plan = sourceContextPlan();
    plan.input.businessLineId = 'business_line_other';

    const result = await service.dispatch({
      taskId: 'task_1',
      plan,
    });

    expect(result).toMatchObject({
      action: 'source_context.create',
      message: 'Write Intent 已暂停：业务线目标与当前任务归属不一致。',
      status: 'blocked',
    });
    expect(ownershipResolver.resolveOwnership).toHaveBeenCalledWith({
      explicitBusinessLineId: 'business_line_other',
      taskId: 'task_1',
      allowOneOff: false,
    });
    expect(taskService.createSourceContext).not.toHaveBeenCalled();
    expect(taskService.recordTimelineEvent).not.toHaveBeenCalled();
  });

  it('blocks task file updates when explicit business line ownership mismatches the file owner', async () => {
    const taskService = {
      create: vi.fn(),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn(),
      createTaskDependency: vi.fn(),
      getDetail: vi.fn(),
      recordTimelineEvent: vi.fn(),
      transition: vi.fn(),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const taskFiles = taskFileRepository();
    taskFiles.findById.mockResolvedValue({
      id: 'task_file_1',
      taskId: 'task_1',
      businessLineId: 'business_line_product',
      name: 'Record.md',
      path: 'Task Records/Record.md',
      kind: 'file',
      content: 'Existing file',
      createdAt: '2026-05-25T00:00:00.000Z',
      updatedAt: '2026-05-25T00:00:00.000Z',
    });
    const ownershipResolver = {
      resolveOwnership: vi.fn().mockResolvedValue({
        status: 'mismatch',
        explicitBusinessLineId: 'business_line_other',
        resolvedBusinessLineId: 'business_line_product',
        resolvedSource: 'task_file',
        taskId: 'task_1',
        runId: null,
        taskFileId: 'task_file_1',
      }),
    };
    const service = new TaskplaneWritebackDispatchService(
      taskService,
      decisionService,
      taskFiles,
      artifactRepository(),
      ownershipResolver,
    );

    const result = await service.dispatch({
      taskId: 'task_1',
      plan: {
        action: 'task_file.update',
        input: {
          id: 'task_file_1',
          content: 'Updated file',
        },
        requiredApi: 'updateTaskFile',
        successMessage: '已确认并更新任务文件：Task Records/Record.md。',
        taskId: 'task_1',
        timeline: {
          payload: {
            businessLineId: 'business_line_other',
            path: 'Task Records/Record.md',
            source: 'taskplane_write_intent',
          },
          type: 'panel.task_file_written',
        },
      },
    });

    expect(result).toMatchObject({
      action: 'task_file.update',
      message: 'Write Intent 已暂停：业务线目标与当前任务归属不一致。',
      status: 'blocked',
    });
    expect(ownershipResolver.resolveOwnership).toHaveBeenCalledWith({
      explicitBusinessLineId: 'business_line_other',
      taskId: 'task_1',
      taskFileId: 'task_file_1',
      allowOneOff: false,
    });
    expect(taskFiles.update).not.toHaveBeenCalled();
    expect(taskService.recordTimelineEvent).not.toHaveBeenCalled();
  });

  it('routes business-line-native writeback through business line services after ownership resolution', async () => {
    const taskService = {
      create: vi.fn(),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn(),
      createTaskDependency: vi.fn(),
      getDetail: vi.fn(),
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn(),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const ownershipResolver = {
      resolveOwnership: vi.fn().mockResolvedValue({
        status: 'resolved',
        businessLineId: 'business_line_product',
        source: 'explicit',
        legacy: false,
        explicitBusinessLineId: 'business_line_product',
        taskId: 'task_1',
        runId: null,
        decisionId: null,
        sourceContextId: null,
        artifactId: null,
        taskFileId: null,
      }),
    };
    const businessLineService = {
      createBusinessLineNextAction: vi.fn(),
      createBusinessLineRecord: vi.fn().mockResolvedValue({ id: 'business_line_record_1' }),
      proposeBusinessLineSopRevision: vi.fn(),
      recordReview: vi.fn(),
      resolveOwnership: ownershipResolver.resolveOwnership,
    };
    const service = new TaskplaneWritebackDispatchService(
      taskService,
      decisionService,
      taskFileRepository(),
      artifactRepository(),
      ownershipResolver,
      businessLineService,
    );

    const result = await service.dispatch({
      taskId: 'task_1',
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
          payload: {
            businessLineId: 'business_line_product',
            evidenceRunId: 'run_business',
          },
          type: 'panel.business_record_written',
        },
      },
    });

    expect(ownershipResolver.resolveOwnership).toHaveBeenCalledWith({
      explicitBusinessLineId: 'business_line_product',
      taskId: 'task_1',
      allowOneOff: false,
    });
    expect(businessLineService.createBusinessLineRecord).toHaveBeenCalledWith({
      businessLineId: 'business_line_product',
      source: 'run:run_business',
      summary: 'Business signal.',
      type: 'signal',
    });
    expect(taskService.recordTimelineEvent).toHaveBeenCalledWith({
      payload: {
        businessLineId: 'business_line_product',
        evidenceRunId: 'run_business',
      },
      taskId: 'task_1',
      type: 'panel.business_record_written',
    });
    expect(result).toMatchObject({
      action: 'business_record.create',
      status: 'completed',
    });
  });

  it('blocks business-line-native writeback when no business line owner can be resolved', async () => {
    const taskService = {
      create: vi.fn(),
      createBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn(),
      createTaskDependency: vi.fn(),
      getDetail: vi.fn(),
      recordTimelineEvent: vi.fn(),
      transition: vi.fn(),
      update: vi.fn(),
    };
    const decisionService = {
      create: vi.fn(),
    };
    const ownershipResolver = {
      resolveOwnership: vi.fn().mockResolvedValue({
        status: 'missing',
        reason: 'no_business_line_owner',
        taskId: 'task_1',
      }),
    };
    const businessLineService = {
      createBusinessLineNextAction: vi.fn(),
      createBusinessLineRecord: vi.fn(),
      proposeBusinessLineSopRevision: vi.fn(),
      recordReview: vi.fn(),
      resolveOwnership: ownershipResolver.resolveOwnership,
    };
    const service = new TaskplaneWritebackDispatchService(
      taskService,
      decisionService,
      taskFileRepository(),
      artifactRepository(),
      ownershipResolver,
      businessLineService,
    );

    const result = await service.dispatch({
      taskId: 'task_1',
      plan: {
        action: 'business_record.create',
        input: {
          businessLineId: null,
          source: 'run:run_business',
          summary: 'Business signal.',
          type: 'signal',
        },
        successMessage: '已确认并保存业务记录。',
        timeline: {
          payload: {
            evidenceRunId: 'run_business',
          },
          type: 'panel.business_record_written',
        },
      },
    });

    expect(result).toMatchObject({
      action: 'business_record.create',
      message: 'Write Intent 已暂停：业务线写入缺少可解析的业务线归属。',
      status: 'blocked',
    });
    expect(ownershipResolver.resolveOwnership).toHaveBeenCalledWith({
      explicitBusinessLineId: null,
      taskId: 'task_1',
      allowOneOff: false,
    });
    expect(businessLineService.createBusinessLineRecord).not.toHaveBeenCalled();
  });
});

function taskFileRepository() {
  return {
    create: vi.fn().mockImplementation(async (input) => ({
      id: 'task_file_1',
      createdAt: '2026-05-25T00:00:00.000Z',
      updatedAt: '2026-05-25T00:00:00.000Z',
      ...input,
      path: input.path ?? input.name,
      content: input.content ?? '',
    })),
    findById: vi.fn(),
    update: vi.fn(),
  };
}

function artifactRepository() {
  return {
    createNoteFromRun: vi.fn(),
    createPatchFromRun: vi.fn(),
  };
}

function sourceContextPlan(): TaskplaneSourceContextWritebackApplyPlan {
  return {
    action: 'source_context.create',
    confirmationSurface: 'right_panel_writeback_confirmation',
    input: {
      capturedAt: '2026-05-24T00:00:00.000Z',
      content: 'Source: https://example.com/codex\n\n官方文档入口。',
      credibility: 'verified',
      isKey: true,
      kind: 'link',
      note: '官方文档入口。',
      runId: 'run_1',
      sourceRole: 'raw',
      taskId: 'task_1',
      title: 'Codex docs',
      uri: 'https://example.com/codex',
    },
    successMessage: '已确认并保存来源上下文：Codex docs。',
    timeline: {
      payload: {
        confirmationSurface: 'right_panel_writeback_confirmation',
        evidenceRunId: 'run_1',
        source: 'taskplane_write_intent',
        title: 'Codex docs',
        uri: 'https://example.com/codex',
      },
      type: 'panel.source_updated',
    },
  };
}

function decisionPlan(): TaskplaneStructuredWritebackApplyPlan {
  return {
    action: 'decision.create',
    input: {
      context: {
        impact: '建议结果：教程加案例',
        whyNow: '范围影响页面结构。',
      },
      kind: 'direction_choice',
      options: [
        {
          id: 'option_1',
          label: '基础教程',
        },
        {
          id: 'option_2',
          label: '教程加案例',
        },
      ],
      recommendation: {
        label: '教程加案例',
        reason: '范围影响页面结构。',
      },
      scope: 'task',
      sourceId: 'run_2',
      sourceLabel: 'Agent CLI Write Intent',
      sourceType: 'run',
      taskId: 'task_1',
      title: '确认首版范围',
    },
    requiredApi: 'createDecision',
    successMessage: '已确认并创建 Decision：确认首版范围。',
  };
}

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
