import { describe, expect, it } from 'vitest';
import {
  extractTaskplaneWriteIntentsFromText,
  validateTaskplaneWriteIntent,
} from './taskplane-write-intent';

describe('Taskplane write intent', () => {
  it('extracts legacy decomposition JSON as subtask write intent', () => {
    const intents = extractTaskplaneWriteIntentsFromText({
      evidenceRunId: 'run_1',
      taskId: 'task_parent',
      text: [
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_DECOMPOSITION',
          review: '按阶段拆解。',
          nextStep: '确认后创建。',
          subtasks: [
            { title: '确认范围', summary: '确认目标和边界。', acceptanceCriteria: '范围明确。' },
            { title: '实现页面', summary: '完成首版页面。', acceptanceCriteria: '页面可运行。' },
          ],
        }),
        '```',
      ].join('\n'),
    });

    expect(intents).toMatchObject([{
      evidenceRunId: 'run_1',
      parentTaskId: 'task_parent',
      review: '按阶段拆解。',
      nextStep: '确认后创建。',
      type: 'subtask.propose',
      subtasks: [
        { title: '确认范围', summary: '确认目标和边界。' },
        { title: '实现页面', summary: '完成首版页面。' },
      ],
    }]);
    expect(validateTaskplaneWriteIntent(intents[0]!)).toMatchObject({ status: 'ready' });
  });

  it('extracts TASKPLANE_WRITE_INTENTS wrapper', () => {
    const intents = extractTaskplaneWriteIntentsFromText({
      evidenceRunId: 'run_2',
      taskId: 'task_parent',
      text: JSON.stringify({
        type: 'TASKPLANE_WRITE_INTENTS',
        intents: [{
          type: 'subtask.propose',
          subtasks: [
            { title: '前端实现', summary: '完成交互界面。' },
            { title: '接口接入', summary: '完成 API 数据接入。' },
          ],
        }],
      }),
    });

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      evidenceRunId: 'run_2',
      parentTaskId: 'task_parent',
      type: 'subtask.propose',
    });
  });

  it('blocks invalid subtask proposals before persistence', () => {
    const intents = extractTaskplaneWriteIntentsFromText({
      evidenceRunId: 'run_3',
      taskId: 'task_parent',
      text: JSON.stringify({
        type: 'subtask.propose',
        subtasks: [{ title: '只有一个子任务', summary: '粒度不足。' }],
      }),
    });

    expect(validateTaskplaneWriteIntent(intents[0]!)).toMatchObject({
      status: 'blocked',
      issues: ['Subtask proposal requires at least two subtasks.'],
    });
  });

  it('extracts task record and source context intents from a wrapper', () => {
    const intents = extractTaskplaneWriteIntentsFromText({
      evidenceRunId: 'run_4',
      taskId: 'task_scope',
      text: JSON.stringify({
        type: 'TASKPLANE_WRITE_INTENTS',
        intents: [
          {
            type: 'task_record.create',
            confidence: 'high',
            content: '# Scope\n已确认首版范围。',
          },
          {
            type: 'source_context.create',
            title: 'Codex docs',
            uri: 'https://example.com/codex',
            note: '官方文档入口。',
          },
        ],
      }),
    });

    expect(intents).toMatchObject([
      {
        confidence: 'high',
        content: '# Scope\n已确认首版范围。',
        evidenceRunId: 'run_4',
        taskId: 'task_scope',
        type: 'task_record.create',
      },
      {
        credibility: 'unknown',
        evidenceRunId: 'run_4',
        note: '官方文档入口。',
        taskId: 'task_scope',
        title: 'Codex docs',
        type: 'source_context.create',
        uri: 'https://example.com/codex',
      },
    ]);
    expect(intents.map((intent) => validateTaskplaneWriteIntent(intent).status)).toEqual(['ready', 'ready']);
  });

  it('extracts generic task file proposals without crossing task-memory surfaces', () => {
    const intents = extractTaskplaneWriteIntentsFromText({
      evidenceRunId: 'run_4_file',
      taskId: 'task_scope',
      text: JSON.stringify({
        type: 'TASKPLANE_WRITE_INTENTS',
        intents: [
          {
            type: 'task_file.propose',
            path: ' Drafts\\codex-tutorial-outline.md ',
            content: '# Codex 教程大纲\n\n- 入门路径',
            summary: '保存首版教程大纲。',
          },
          {
            type: 'task_file.propose',
            path: 'Task Records/handoff.md',
            content: '# Handoff',
          },
        ],
      }),
    });

    expect(intents).toMatchObject([
      {
        content: '# Codex 教程大纲\n\n- 入门路径',
        evidenceRunId: 'run_4_file',
        path: 'Drafts/codex-tutorial-outline.md',
        summary: '保存首版教程大纲。',
        taskId: 'task_scope',
        type: 'task_file.propose',
      },
      {
        path: 'Task Records/handoff.md',
        type: 'task_file.propose',
      },
    ]);
    expect(validateTaskplaneWriteIntent(intents[0]!)).toMatchObject({ status: 'ready' });
    expect(validateTaskplaneWriteIntent(intents[1]!)).toMatchObject({
      status: 'blocked',
      issues: ['Task file proposal cannot target Task.md or Task Records/. Use the dedicated task-memory or task-record intent.'],
    });
  });

  it('extracts artifact proposals as run-backed note artifact intents', () => {
    const intents = extractTaskplaneWriteIntentsFromText({
      evidenceRunId: 'run_artifact',
      taskId: 'task_scope',
      text: JSON.stringify({
        type: 'TASKPLANE_WRITE_INTENTS',
        intents: [{
          type: 'artifact.propose',
          title: 'codex-tutorial-structure.md',
          content: '# 首版教程结构\n\n- 入门\n- 案例',
          summary: '保存为任务产物，便于后续页面实现引用。',
        }],
      }),
    });

    expect(intents).toMatchObject([{
      content: '# 首版教程结构\n\n- 入门\n- 案例',
      evidenceRunId: 'run_artifact',
      kind: 'note',
      summary: '保存为任务产物，便于后续页面实现引用。',
      taskId: 'task_scope',
      title: 'codex-tutorial-structure.md',
      type: 'artifact.propose',
    }]);
    expect(validateTaskplaneWriteIntent(intents[0]!)).toMatchObject({ status: 'ready' });
  });

  it('extracts patch artifact proposals only when they contain reviewable diff evidence', () => {
    const intents = extractTaskplaneWriteIntentsFromText({
      evidenceRunId: 'run_patch',
      taskId: 'task_scope',
      text: JSON.stringify({
        type: 'TASKPLANE_WRITE_INTENTS',
        intents: [{
          type: 'artifact.propose',
          title: 'changes.patch',
          kind: 'patch',
          content: [
            'diff --git a/src/app.ts b/src/app.ts',
            '--- a/src/app.ts',
            '+++ b/src/app.ts',
            '@@ -1 +1 @@',
            '-old',
            '+new',
          ].join('\n'),
          summary: 'Reviewable patch evidence.',
        }],
      }),
    });

    expect(intents).toMatchObject([{
      evidenceRunId: 'run_patch',
      kind: 'patch',
      taskId: 'task_scope',
      title: 'changes.patch',
      type: 'artifact.propose',
    }]);
    expect(validateTaskplaneWriteIntent(intents[0]!)).toMatchObject({ status: 'ready' });

    const patchIntent = intents[0];
    if (!patchIntent || patchIntent.type !== 'artifact.propose') {
      throw new Error('Expected artifact proposal.');
    }

    expect(validateTaskplaneWriteIntent({
      ...patchIntent,
      content: 'Changed src/app.ts.',
    })).toMatchObject({
      status: 'blocked',
      issues: ['Patch artifact proposal requires reviewable diff content.'],
    });
  });

  it('extracts decision, next-step, blocker, and completion proposal intents', () => {
    const intents = extractTaskplaneWriteIntentsFromText({
      evidenceRunId: 'run_5',
      taskId: 'task_scope',
      text: JSON.stringify({
        type: 'TASKPLANE_WRITE_INTENTS',
        intents: [
          {
            type: 'decision.create',
            title: '确认首版发布范围',
            rationale: 'Agent 发现范围会影响页面结构和验收。',
            options: ['仅基础教程', '教程加案例展示'],
            proposedOutcome: '教程加案例展示',
          },
          {
            type: 'task.update_next_step',
            nextStep: '整理页面信息架构草案。',
            reason: '目标和受众已经足够推进首版结构。',
          },
          {
            type: 'task.mark_blocked',
            reason: '等待用户确认是否接入外部资料来源。',
            unblockCondition: '用户确认资料来源范围。',
          },
          {
            type: 'task.complete.propose',
            evidence: '目标、范围、非目标和下一步已经写入任务记录。',
          },
        ],
      }),
    });

    expect(intents).toMatchObject([
      {
        evidenceRunId: 'run_5',
        options: ['仅基础教程', '教程加案例展示'],
        proposedOutcome: '教程加案例展示',
        rationale: 'Agent 发现范围会影响页面结构和验收。',
        taskId: 'task_scope',
        title: '确认首版发布范围',
        type: 'decision.create',
      },
      {
        evidenceRunId: 'run_5',
        nextStep: '整理页面信息架构草案。',
        reason: '目标和受众已经足够推进首版结构。',
        taskId: 'task_scope',
        type: 'task.update_next_step',
      },
      {
        evidenceRunId: 'run_5',
        reason: '等待用户确认是否接入外部资料来源。',
        taskId: 'task_scope',
        type: 'task.mark_blocked',
        unblockCondition: '用户确认资料来源范围。',
      },
      {
        evidence: '目标、范围、非目标和下一步已经写入任务记录。',
        evidenceRunId: 'run_5',
        taskId: 'task_scope',
        type: 'task.complete.propose',
      },
    ]);
    expect(intents.map((intent) => validateTaskplaneWriteIntent(intent).status)).toEqual([
      'ready',
      'ready',
      'ready',
      'ready',
    ]);
  });
});
