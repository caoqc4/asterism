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

  it('normalizes scheduler Decision proposal payloads before approval queue creation', () => {
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
          options: ['  继续   自动巡检  ', '暂停自动巡检'],
          proposedOutcome: '继续 自动巡检',
          rationale: '  最近一次自动巡检   已经生成可审核证据，需要确认后续策略。 ',
          targetTaskId: 'task_1',
          title: '  确认   自动巡检策略 ',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      plan: {
        action: 'decision.create',
        input: {
          context: {
            whyNow: '最近一次自动巡检 已经生成可审核证据，需要确认后续策略。',
          },
          options: [
            { id: 'option_1', label: '继续 自动巡检' },
            { id: 'option_2', label: '暂停自动巡检' },
          ],
          recommendation: {
            label: '继续 自动巡检',
            reason: '最近一次自动巡检 已经生成可审核证据，需要确认后续策略。',
          },
          title: '确认 自动巡检策略',
        },
      },
      title: '调度决策提案：确认 自动巡检策略',
    });
  });

  it('deduplicates repeated scheduler Decision proposal timeline events by evidence run and title', () => {
    const payload = {
      evidenceRunId: 'run_scheduler_1',
      operatorConfirmed: true,
      operatorId: 'operator_1',
      options: ['继续自动巡检', '暂停自动巡检'],
      proposedOutcome: '继续自动巡检',
      rationale: '最近一次自动巡检已经生成可审核证据，需要确认后续策略。',
      targetTaskId: 'task_1',
      title: '确认自动巡检策略',
    };

    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [
        {
          id: 'timeline_scheduler_decision_1',
          taskId: 'task_1',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify(payload),
          createdAt: '2026-05-25T00:01:00.000Z',
        },
        {
          id: 'timeline_scheduler_decision_2',
          taskId: 'task_1',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify(payload),
          createdAt: '2026-05-25T00:02:00.000Z',
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'writeback:run_scheduler_1:scheduler_decision:确认自动巡检策略',
      runId: 'run_scheduler_1',
      title: '调度决策提案：确认自动巡检策略',
    });
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
          localRecoveryTaskId: 'task_1',
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
    expect(items[0]?.detail).toContain('localRecoveryTaskMatched=yes');
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

  it('blocks local-recovery scheduler Decision proposal timeline events without recovered-run task identity', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_recovery_missing_task',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          authorization: 'local_recovery',
          evidenceRunId: 'run_recovered_1',
          localRecoveryCompleted: true,
          localRecoveryRunId: 'run_recovered_1',
          options: ['复核失败证据后手动重跑'],
          proposedOutcome: '复核失败证据后手动重跑',
          rationale: 'Scheduler recovered a stale run but omitted recovered run task identity.',
          targetTaskId: 'task_1',
          title: '确认 stale run 自动恢复后的下一步',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });

  it('blocks local-recovery scheduler Decision proposal timeline events without explicit recovered-run identity', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_recovery_missing_run',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          authorization: 'local_recovery',
          evidenceRunId: 'run_recovered_1',
          localRecoveryCompleted: true,
          localRecoveryTaskId: 'task_1',
          options: ['复核失败证据后手动重跑'],
          proposedOutcome: '复核失败证据后手动重跑',
          rationale: 'Scheduler recovered a stale run but omitted explicit recovered run identity.',
          targetTaskId: 'task_1',
          title: '确认 stale run 自动恢复后的下一步',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });

  it('blocks scheduler Decision proposal timeline events with duplicate normalized options', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_duplicate_options',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          evidenceRunId: 'run_scheduler_1',
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '  继续自动巡检  '],
          proposedOutcome: '继续自动巡检',
          rationale: '重复选项不应进入审批队列。',
          targetTaskId: 'task_1',
          title: '确认自动巡检策略',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });

  it('blocks scheduler Decision proposal timeline events when proposed outcome is outside options', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_outcome_mismatch',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          evidenceRunId: 'run_scheduler_1',
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '暂停自动巡检'],
          proposedOutcome: '转人工处理',
          rationale: '推荐结果必须来自候选项。',
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
