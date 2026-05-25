import { describe, expect, it } from 'vitest';

import { buildTaskplaneWritebackProposalsFromText } from './taskplane-writeback-proposal.js';

describe('Taskplane writeback proposal builder', () => {
  it('builds reusable proposal surfaces from native runtime Write Intent output', () => {
    const proposals = buildTaskplaneWritebackProposalsFromText({
      date: new Date('2026-05-24T00:00:00.000Z'),
      output: JSON.stringify({
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
          {
            type: 'task_file.propose',
            path: 'Drafts/codex-tutorial-outline.md',
            content: '# Codex 教程大纲\n\n- 入门路径',
            summary: '保存首版教程大纲。',
          },
          {
            type: 'artifact.propose',
            title: 'codex-tutorial-structure.md',
            content: '# 首版教程结构\n\n- 入门\n- 案例',
            summary: '保存教程结构产物。',
          },
          {
            type: 'decision.create',
            title: '确认首版范围',
            rationale: '范围会影响页面结构。',
            options: ['基础教程', '教程加案例'],
            proposedOutcome: '教程加案例',
          },
        ],
      }),
      runId: 'run_1',
      taskId: 'task_scope',
      taskTitle: '明确网站目标与范围',
    });

    expect(proposals.taskRecord).toMatchObject({
      content: '# Scope\n已确认首版范围。',
      evidenceRunId: 'run_1',
      intentSource: 'write_intent',
      path: 'Task Records/2026-05-24-明确网站目标与范围-agent-record.md',
      surface: 'task_record',
      surfaceLabel: '任务记录',
    });
    expect(proposals.sourceContext).toMatchObject({
      evidenceRunId: 'run_1',
      note: '官方文档入口。',
      title: 'Codex docs',
      uri: 'https://example.com/codex',
    });
    expect(proposals.taskFile).toMatchObject({
      content: '# Codex 教程大纲\n\n- 入门路径',
      evidenceRunId: 'run_1',
      intentSource: 'write_intent',
      path: 'Drafts/codex-tutorial-outline.md',
      summary: '保存首版教程大纲。',
      surface: 'task_file',
      surfaceLabel: '文件',
    });
    expect(proposals.artifact).toMatchObject({
      content: '# 首版教程结构\n\n- 入门\n- 案例',
      evidenceRunId: 'run_1',
      kind: 'note',
      summary: '保存教程结构产物。',
      title: 'codex-tutorial-structure.md',
    });
    expect(proposals.structured).toMatchObject({
      detail: '范围会影响页面结构。',
      evidenceRunId: 'run_1',
      title: '决策提案：确认首版范围',
      intent: {
        taskId: 'task_scope',
        type: 'decision.create',
      },
    });
  });

  it('preserves patch artifact proposals as reviewable patch evidence', () => {
    const proposals = buildTaskplaneWritebackProposalsFromText({
      output: JSON.stringify({
        type: 'TASKPLANE_WRITE_INTENTS',
        intents: [{
          type: 'artifact.propose',
          title: 'changes.patch',
          kind: 'patch',
          content: [
            '--- a/src/app.ts',
            '+++ b/src/app.ts',
            '@@ -1 +1 @@',
            '-old',
            '+new',
          ].join('\n'),
          summary: 'Reviewable patch evidence.',
        }],
      }),
      runId: 'run_patch',
      taskId: 'task_scope',
      taskTitle: 'Review workspace change',
    });

    expect(proposals.artifact).toMatchObject({
      evidenceRunId: 'run_patch',
      kind: 'patch',
      summary: 'Reviewable patch evidence.',
      title: 'changes.patch',
    });
  });
});
