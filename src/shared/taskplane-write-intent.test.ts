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
});
