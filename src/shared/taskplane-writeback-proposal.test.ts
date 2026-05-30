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
      businessLineId: 'business_line_product',
      taskId: 'task_scope',
      taskTitle: '明确网站目标与范围',
    });

    expect(proposals.taskRecord).toMatchObject({
      businessLineId: 'business_line_product',
      content: '# Scope\n已确认首版范围。',
      evidenceRunId: 'run_1',
      intentSource: 'write_intent',
      path: 'Task Records/2026-05-24-明确网站目标与范围-agent-record.md',
      surface: 'task_record',
      surfaceLabel: '任务记录',
    });
    expect(proposals.sourceContext).toMatchObject({
      businessLineId: 'business_line_product',
      evidenceRunId: 'run_1',
      note: '官方文档入口。',
      title: 'Codex docs',
      uri: 'https://example.com/codex',
    });
    expect(proposals.taskFile).toMatchObject({
      businessLineId: 'business_line_product',
      content: '# Codex 教程大纲\n\n- 入门路径',
      evidenceRunId: 'run_1',
      intentSource: 'write_intent',
      path: 'Drafts/codex-tutorial-outline.md',
      summary: '保存首版教程大纲。',
      surface: 'task_file',
      surfaceLabel: '文件',
    });
    expect(proposals.artifact).toMatchObject({
      businessLineId: 'business_line_product',
      content: '# 首版教程结构\n\n- 入门\n- 案例',
      evidenceRunId: 'run_1',
      kind: 'note',
      summary: '保存教程结构产物。',
      title: 'codex-tutorial-structure.md',
    });
    expect(proposals.structured).toMatchObject({
      businessLineId: 'business_line_product',
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

  it('builds business-line-native proposals from runtime Write Intent output', () => {
    const proposals = buildTaskplaneWritebackProposalsFromText({
      output: JSON.stringify({
        type: 'TASKPLANE_WRITE_INTENTS',
        intents: [
          {
            type: 'business_record.create',
            summary: 'Customer onboarding signal should guide the business line.',
            recordType: 'signal',
          },
          {
            type: 'business_review.record',
            resultSummary: 'The run validated the onboarding sequence.',
            nextActionSuggestions: ['Draft onboarding checklist.'],
          },
          {
            type: 'business_sop_revision.propose',
            nextContent: 'Always verify onboarding evidence before creating launch copy.',
            changeReason: 'The run found stale assumptions.',
          },
          {
            type: 'business_handoff.record',
            currentState: 'Research finished.',
            nextSafeAction: 'Turn findings into checklist.',
            reason: 'Keep the next agent oriented.',
          },
        ],
      }),
      runId: 'run_business',
      businessLineId: 'business_line_product',
      taskId: 'task_scope',
      taskTitle: 'Advance onboarding',
    });

    expect(proposals.businessLine).toHaveLength(4);
    expect(proposals.businessLine.map((proposal) => proposal.intent.type)).toEqual([
      'business_record.create',
      'business_review.record',
      'business_sop_revision.propose',
      'business_handoff.record',
    ]);
    expect(proposals.businessLine[0]).toMatchObject({
      businessLineId: 'business_line_product',
      detail: 'Customer onboarding signal should guide the business line.',
      evidenceRunId: 'run_business',
      title: '业务记录写回提案',
    });
  });
});
