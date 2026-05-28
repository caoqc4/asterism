import { describe, expect, it } from 'vitest';

import { buildTaskplaneWritebackApprovalItems } from './taskplane-writeback-approval.js';
import type { RunDetailRecord } from './types/run.js';

describe('Taskplane writeback approval items', () => {
  it('builds run-detail operator approval items from structured Write Intent output', () => {
    const run = buildRunDetail({
      output: [
        'Runtime finished with product write proposals.',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [
            {
              type: 'decision.create',
              title: '确认首版范围',
              rationale: '首版范围已经收敛。',
              proposedOutcome: '确认基础教程和案例展示。',
            },
            {
              type: 'task_file.propose',
              path: 'Drafts/codex-tutorial.md',
              content: '# Codex 教程',
              summary: '保存教程初稿。',
            },
          ],
        }),
        '```',
      ].join('\n'),
    });

    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [run],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
    });

    expect(items.map((item) => item.kind)).toEqual(['task_file', 'structured']);
    expect(items[0]).toMatchObject({
      plan: {
        action: 'task_file.create',
        input: {
          path: 'Drafts/codex-tutorial.md',
          taskId: 'task_1',
        },
      },
      source: 'runtime_write_intent',
      title: '任务文件写回提案',
    });
    expect(items[1]).toMatchObject({
      plan: {
        action: 'decision.create',
        input: {
          sourceId: 'run_1',
          taskId: 'task_1',
          title: '确认首版范围',
        },
      },
      summary: '确认后创建 Decision。',
    });
  });

  it('filters proposals that already have durable task surfaces', () => {
    const run = buildRunDetail({
      output: [
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [
            {
              type: 'decision.create',
              title: '确认首版范围',
              rationale: '已确认。',
            },
            {
              type: 'source_context.create',
              title: 'Codex docs',
              uri: 'https://example.com/codex',
              note: '官方文档。',
            },
          ],
        }),
        '```',
      ].join('\n'),
    });

    expect(buildTaskplaneWritebackApprovalItems({
      existing: {
        decisions: [{ sourceId: 'run_1', title: '确认首版范围' }],
        sourceContexts: [{ runId: null, title: 'Codex docs', uri: 'https://example.com/codex' }],
      },
      runDetails: [run],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
    })).toEqual([]);
  });

  it('turns pending task memory guidance into the same writeback approval queue', () => {
    const run = buildRunDetail({
      taskMemoryWriteProposals: [{
        contentTemplate: '# Task\n\n## Recent Records\n- 已保全关键上下文。',
        existingFileId: 'task_file_1',
        operation: 'update',
        path: 'Task.md',
        reason: '最新任务记忆建议仍缺少对应写入：Task.md。',
        target: 'task_md',
        title: '更新 Task.md',
      }],
    });

    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [run],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
    });

    expect(items).toMatchObject([{
      kind: 'task_memory',
      plan: {
        action: 'task_file.update',
        input: {
          id: 'task_file_1',
          content: expect.stringContaining('已保全关键上下文'),
        },
      },
      source: 'task_memory_guidance',
      title: '更新 Task.md',
    }]);
  });

  it('turns authorized scheduler Decision proposal timeline events into the same approval queue', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_decision',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          evidenceRunId: 'run_scheduler_1',
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '暂停自动巡检'],
          proposedOutcome: '继续自动巡检',
          rationale: '最近一次自动巡检已经生成可审核证据，需要确认后续策略。',
          targetTaskId: 'task_1',
          title: '确认自动巡检策略',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toMatchObject([{
      kind: 'scheduler_decision',
      plan: {
        action: 'decision.create',
        input: {
          sourceId: 'run_scheduler_1',
          sourceLabel: 'Scheduler/background Decision proposal',
          taskId: 'task_1',
          title: '确认自动巡检策略',
        },
      },
      summary: expect.stringContaining('目标任务身份和授权检查'),
      source: 'scheduler_decision_proposal',
      title: '调度决策提案：确认自动巡检策略',
    }]);
    expect(items[0]?.detail).toContain('proposalReady=yes');
    expect(items[0]?.detail).toContain('approvalQueueSurface=task_dynamics');
  });

  it('turns local-recovery scheduler Decision proposal events into the same approval queue', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_recovery_decision',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          authorization: 'local_recovery',
          evidenceRunId: 'run_recovered_1',
          localRecoveryCompleted: true,
          localRecoveryRunId: 'run_recovered_1',
          options: ['复核失败证据后手动重跑', '保持 failed 并补充 Task 记忆'],
          proposedOutcome: '复核失败证据后手动重跑',
          rationale: 'Scheduler recovered a stale run and needs an operator-confirmed next step.',
          targetTaskId: 'task_1',
          title: '确认 stale run 自动恢复后的下一步',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toMatchObject([{
      kind: 'scheduler_decision',
      plan: {
        action: 'decision.create',
        input: {
          sourceId: 'run_recovered_1',
          sourceLabel: 'Scheduler/background Decision proposal',
          taskId: 'task_1',
          title: '确认 stale run 自动恢复后的下一步',
        },
      },
      source: 'scheduler_decision_proposal',
    }]);
    expect(items[0]?.detail).toContain('authorization=local_recovery');
    expect(items[0]?.detail).toContain('localRecoveryCompleted=yes');
  });

  it('blocks scheduler Decision proposal timeline events without target-scoped authorization', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_decision',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          rationale: '需要确认后续策略。',
          standingApprovalActive: true,
          standingApprovalPolicyId: 'policy_1',
          standingApprovalScopeTaskId: 'task_other',
          targetTaskId: 'task_1',
          title: '确认自动巡检策略',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });
});

function buildRunDetail(partial: Partial<RunDetailRecord> = {}): RunDetailRecord {
  return {
    id: partial.id ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    type: 'agent',
    status: 'completed',
    instructions: null,
    output: partial.output ?? null,
    outputSource: partial.outputSource ?? 'ai',
    failureReason: null,
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
    artifacts: [],
    checkpoints: [],
    steps: [],
    taskMemoryWriteProposals: partial.taskMemoryWriteProposals ?? [],
    verifications: [],
  };
}
