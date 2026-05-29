import { describe, expect, it } from 'vitest';

import {
  buildArtifactWritebackApplyPlan,
  buildSubtaskCreateManyWritebackApplyPlan,
  buildTaskFileWritebackApplyPlan,
  buildSourceContextWritebackApplyPlan,
  buildStructuredWritebackApplyPlan,
  formatSubtaskDraftSummary,
} from './taskplane-writeback-apply-plan.js';
import type { TaskplaneStructuredWritebackProposal } from './taskplane-writeback-proposal.js';

describe('Taskplane writeback apply plans', () => {
  it('maps source context proposals to service input and timeline evidence', () => {
    const plan = buildSourceContextWritebackApplyPlan({
      capturedAt: '2026-05-24T00:00:00.000Z',
      proposal: {
        evidenceRunId: 'run_1',
        note: '官方文档入口。',
        title: 'Codex docs',
        uri: 'https://example.com/codex',
      },
      taskId: 'task_1',
    });

    expect(plan.input).toMatchObject({
      capturedAt: '2026-05-24T00:00:00.000Z',
      content: 'Source: https://example.com/codex\n\n官方文档入口。',
      kind: 'link',
      runId: 'run_1',
      sourceRole: 'raw',
      taskId: 'task_1',
      title: 'Codex docs',
      uri: 'https://example.com/codex',
    });
    expect(plan.timeline).toMatchObject({
      type: 'panel.source_updated',
      payload: {
        evidenceRunId: 'run_1',
        source: 'taskplane_write_intent',
      },
    });
  });

  it('maps structured decision and next-step proposals to deterministic apply plans', () => {
    const decisionPlan = buildStructuredWritebackApplyPlan({
      proposal: {
        detail: '范围影响页面结构。',
        evidenceRunId: 'run_2',
        title: '决策提案：确认首版范围',
        intent: {
          evidenceRunId: 'run_2',
          options: ['基础教程', '教程加案例'],
          proposedOutcome: '教程加案例',
          rationale: '范围影响页面结构。',
          taskId: 'task_1',
          title: '确认首版范围',
          type: 'decision.create',
        },
      },
      taskId: 'task_1',
    });
    const nextStepPlan = buildStructuredWritebackApplyPlan({
      proposal: nextStepProposal(),
      taskId: 'task_1',
    });

    expect(decisionPlan).toMatchObject({
      action: 'decision.create',
      input: {
        kind: 'direction_choice',
        sourceId: 'run_2',
        sourceType: 'run',
        taskId: 'task_1',
        title: '确认首版范围',
      },
      requiredApi: 'createDecision',
    });
    expect(nextStepPlan).toMatchObject({
      action: 'task.update_next_step',
      input: {
        id: 'task_1',
        nextStep: '整理页面信息架构。',
      },
      timeline: {
        type: 'panel.task_goal_updated',
      },
    });
  });

  it('maps task file writes to timeline-backed apply plans', () => {
    const plan = buildTaskFileWritebackApplyPlan({
      evidenceRunId: 'run_4',
      input: {
        content: '# 本轮结论',
        kind: 'file',
        name: 'record.md',
        path: 'Task Records/record.md',
        taskId: 'task_1',
      },
      source: 'taskplane_write_intent',
      surface: 'task_record',
      surfaceLabel: '任务记录',
      taskId: 'task_1',
    });

    expect(plan).toMatchObject({
      action: 'task_file.create',
      input: {
        path: 'Task Records/record.md',
        taskId: 'task_1',
      },
      requiredApi: 'createTaskFile',
      taskId: 'task_1',
      timeline: {
        type: 'panel.task_file_written',
        payload: {
          evidenceRunId: 'run_4',
          path: 'Task Records/record.md',
          source: 'taskplane_write_intent',
          surface: 'task_record',
          surfaceLabel: '任务记录',
        },
      },
    });
  });

  it('keeps Agent API decomposition runtime contract in create-many timeline evidence', () => {
    const plan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      runtimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        phase: 'decomposition_draft',
        runtimeLabel: 'Agent API Runtime · openai / gpt-test',
        runtimeMode: 'api',
      },
      source: 'agent_api_decomposition',
      subtasks: [{
        acceptanceCriteria: '范围文档可验收。',
        dependency: null,
        summary: '确认范围。',
        title: '确认范围',
      }],
    });

    expect(plan).toMatchObject({
      action: 'subtask.create_many',
      input: {
        parentTaskId: 'task_project',
        source: 'agent_api_decomposition',
      },
      timeline: {
        payload: {
          confirmationBoundary: 'operator_confirmed_subtask_create_many',
          draftOnlyBeforeConfirmation: true,
          runtimeContract: {
            evidenceRunId: 'run_api_decomposition',
            invocationLayer: 'api_runtime',
            parentTaskId: 'task_project',
            phase: 'decomposition_draft',
            runtimeLabel: 'Agent API Runtime · openai / gpt-test',
            runtimeMode: 'api',
          },
          source: 'agent_api_decomposition',
        },
      },
    });
  });

  it('does not infer Agent API decomposition runtime identity from apply-plan inputs', () => {
    const plan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      runtimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
      source: 'agent_api_decomposition',
      subtasks: [{
        acceptanceCriteria: '范围文档可验收。',
        dependency: null,
        summary: '确认范围。',
        title: '确认范围',
      }],
    });

    expect(plan.timeline.payload.runtimeContract).toMatchObject({
      evidenceRunId: null,
      parentTaskId: null,
    });
  });

  it('maps artifact proposals to run-backed note artifacts', () => {
    const plan = buildArtifactWritebackApplyPlan({
      proposal: {
        content: '# 首版教程结构\n\n- 入门\n- 案例',
        evidenceRunId: 'run_6',
        kind: 'note',
        summary: '保存教程结构产物。',
        title: 'codex-tutorial-structure.md',
      },
      taskId: 'task_1',
    });

    expect(plan).toMatchObject({
      action: 'artifact.create_note_from_run',
      input: {
        content: '# 首版教程结构\n\n- 入门\n- 案例',
        runId: 'run_6',
        taskId: 'task_1',
        title: 'codex-tutorial-structure.md',
      },
      timeline: {
        type: 'panel.artifact_written',
        payload: {
          evidenceRunId: 'run_6',
          kind: 'note',
          source: 'taskplane_write_intent',
          title: 'codex-tutorial-structure.md',
        },
      },
    });
  });

  it('maps patch artifact proposals to run-backed patch artifacts', () => {
    const plan = buildArtifactWritebackApplyPlan({
      proposal: {
        content: [
          '--- a/src/app.ts',
          '+++ b/src/app.ts',
          '@@ -1 +1 @@',
          '-old',
          '+new',
        ].join('\n'),
        evidenceRunId: 'run_patch',
        kind: 'patch',
        summary: 'Reviewable patch evidence.',
        title: 'changes.patch',
      },
      taskId: 'task_1',
    });

    expect(plan).toMatchObject({
      action: 'artifact.create_patch_from_run',
      input: {
        runId: 'run_patch',
        taskId: 'task_1',
        title: 'changes.patch',
      },
      timeline: {
        type: 'panel.artifact_written',
        payload: {
          evidenceRunId: 'run_patch',
          kind: 'patch',
          source: 'taskplane_write_intent',
          title: 'changes.patch',
        },
      },
    });
  });

  it('maps subtask drafts to a main-side project decomposition apply plan', () => {
    const subtask = {
      acceptanceCriteria: '页面范围已确认。',
      dependency: '父任务目标',
      summary: '确认首版网站页面范围。',
      title: '确认网站范围',
    };
    const plan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_5',
      nextStep: '进入第一个子任务。',
      parentTaskId: 'task_project',
      review: '拆解保持大块粒度。',
      subtasks: [subtask, {
        acceptanceCriteria: '首版信息架构已形成。',
        dependency: '确认网站范围',
        summary: '整理首页、教程和案例页面结构。',
        title: '整理信息架构',
      }],
    });

    expect(plan).toMatchObject({
      action: 'subtask.create_many',
      input: {
        evidenceRunId: 'run_5',
        nextStep: '进入第一个子任务。',
        parentTaskId: 'task_project',
        source: 'agent_cli_decomposition',
      },
      timeline: {
        type: 'panel.project_decomposed',
        payload: {
          confirmationBoundary: 'operator_confirmed_subtask_create_many',
          draftOnlyBeforeConfirmation: true,
          evidenceRunId: 'run_5',
          subtaskCount: 2,
        },
      },
    });
    expect(formatSubtaskDraftSummary(subtask)).toBe([
      '确认首版网站页面范围。',
      '验收：页面范围已确认。',
      '依赖：父任务目标',
    ].join('\n'));
  });
});

function nextStepProposal(): TaskplaneStructuredWritebackProposal {
  return {
    detail: '目标已经足够推进。',
    evidenceRunId: 'run_3',
    intent: {
      evidenceRunId: 'run_3',
      nextStep: '整理页面信息架构。',
      reason: '目标已经足够推进。',
      taskId: 'task_1',
      type: 'task.update_next_step',
    },
    title: '下一步提案：整理页面信息架构。',
  };
}
