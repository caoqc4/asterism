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

  it('marks source context approval items with writeback approval queue confirmation evidence', () => {
    const run = buildRunDetail({
      output: [
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [{
            type: 'source_context.create',
            title: 'Codex docs',
            uri: 'https://example.com/codex',
            note: '官方文档。',
          }],
        }),
        '```',
      ].join('\n'),
    });

    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [run],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'source_context',
      plan: {
        action: 'source_context.create',
        confirmationSurface: 'taskplane_writeback_approval_queue',
        timeline: {
          payload: {
            confirmationSurface: 'taskplane_writeback_approval_queue',
            evidenceRunId: 'run_1',
          },
        },
      },
    });
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
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1', 'run_scheduler_1'),
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
        confirmationBoundary: 'task_dynamics_scheduler_decision_confirmed',
        confirmationSurface: 'task_dynamics_scheduler_decision_approval_queue',
        draftOnlyBeforeConfirmation: true,
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
    expect(items[0]?.detail).toContain('evidenceSourceType=run');
    expect(items[0]?.detail).toContain('evidenceRunId=run_scheduler_1');
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
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1', 'run_scheduler_1'),
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
      proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1', 'run_scheduler_1'),
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

  it('marks scheduler Decision proposals without Run evidence as system-sourced decisions', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_run_limit',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['等待下一次运行窗口', '调整 Standing Approval 每日运行上限'],
          proposedOutcome: '等待下一次运行窗口',
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1'),
          rationale: '定时任务达到每日运行上限，需要确认下一步。',
          targetTaskId: 'task_1',
          title: '确认定时/事件 Agent 达到每日运行上限后的下一步',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      plan: {
        action: 'decision.create',
        input: {
          sourceId: 'scheduler:task_1:确认定时/事件 Agent 达到每日运行上限后的下一步',
          sourceLabel: 'Scheduler/background Decision proposal',
          sourceType: 'system',
        },
      },
      runId: 'timeline_scheduler_run_limit',
    });
  });

  it('deduplicates repeated scheduler Decision proposal timeline events without Run evidence by task and title', () => {
    const payload = {
      operatorConfirmed: true,
      operatorId: 'operator_1',
      options: ['等待下一次运行窗口', '调整 Standing Approval 每日运行上限'],
      proposedOutcome: '等待下一次运行窗口',
      proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1'),
      rationale: '定时任务达到每日运行上限，需要确认下一步。',
      targetTaskId: 'task_1',
      title: '确认定时/事件 Agent 达到每日运行上限后的下一步',
    };

    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [
        {
          id: 'timeline_scheduler_run_limit_1',
          taskId: 'task_1',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify(payload),
          createdAt: '2026-05-25T00:01:00.000Z',
        },
        {
          id: 'timeline_scheduler_run_limit_2',
          taskId: 'task_1',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify(payload),
          createdAt: '2026-05-25T00:02:00.000Z',
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'writeback:scheduler-task_1-确认定时-事件-agent-达到每日运行上限后的下一步:scheduler_decision:确认定时-事件-agent-达到每日运行上限后的下一步',
      runId: 'timeline_scheduler_run_limit_1',
    });
  });

  it('filters scheduler Decision proposals already persisted with stable no-Run source identity', () => {
    const title = '确认定时/事件 Agent 达到每日运行上限后的下一步';
    const items = buildTaskplaneWritebackApprovalItems({
      existing: {
        decisions: [{
          sourceId: `scheduler:task_1:${title}`,
          title,
        }],
      },
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_run_limit_again',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['等待下一次运行窗口', '调整 Standing Approval 每日运行上限'],
          proposedOutcome: '等待下一次运行窗口',
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1'),
          rationale: '定时任务达到每日运行上限，需要确认下一步。',
          targetTaskId: 'task_1',
          title,
        }),
        createdAt: '2026-05-25T00:03:00.000Z',
      }],
    });

    expect(items).toEqual([]);
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
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1', 'run_recovered_1'),
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

  it('blocks scheduler Decision proposal timeline events without explicit payload target-task identity', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_missing_payload_task',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '暂停自动巡检'],
          proposedOutcome: '继续自动巡检',
          rationale: '缺少 payload targetTaskId 的历史事件不能进入审批队列。',
          title: '确认自动巡检策略',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });

  it('blocks scheduler Decision proposal timeline events without producer readiness evidence', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_missing_readiness',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '暂停自动巡检'],
          proposedOutcome: '继续自动巡检',
          rationale: '缺少 SchedulerService readiness summary 的历史事件不能进入审批队列。',
          targetTaskId: 'task_1',
          title: '确认自动巡检策略',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });

  it('blocks scheduler Decision proposal timeline events when producer readiness target diverges', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_wrong_readiness_target',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '暂停自动巡检'],
          proposedOutcome: '继续自动巡检',
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_other'),
          rationale: 'readiness summary 里的目标任务也必须匹配。',
          targetTaskId: 'task_1',
          title: '确认自动巡检策略',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });

  it('blocks scheduler Decision proposal timeline events when producer target only prefix-matches', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_prefix_target',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '暂停自动巡检'],
          proposedOutcome: '继续自动巡检',
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_10'),
          rationale: 'producer summary 里的目标任务必须精确匹配，不能只匹配前缀。',
          targetTaskId: 'task_1',
          title: '确认自动巡检策略',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });

  it('blocks scheduler Decision proposal timeline events without no-direct-side-effect readiness evidence', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_missing_side_effect_closure',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '暂停自动巡检'],
          proposedOutcome: '继续自动巡检',
          proposalReadinessSummary: [
            'Scheduler Decision proposal contract',
            'proposalReady=yes',
            'approvalQueueSurface=task_dynamics',
            'targetTask=task_1',
          ].join(' / '),
          rationale: '历史 producer 没有声明直接持久化和触发权限关闭。',
          targetTaskId: 'task_1',
          title: '确认自动巡检策略',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });

  it('blocks scheduler Decision proposal timeline events when producer source identity diverges', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_wrong_source',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          evidenceRunId: 'run_scheduler_1',
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '暂停自动巡检'],
          proposedOutcome: '继续自动巡检',
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1', 'run_other'),
          rationale: 'producer summary 的 Run 来源身份必须和 payload 证据一致。',
          targetTaskId: 'task_1',
          title: '确认自动巡检策略',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });

  it('blocks scheduler Decision proposal timeline events when producer Run evidence only prefix-matches', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_prefix_source',
        taskId: 'task_1',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          evidenceRunId: 'run_scheduler_1',
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '暂停自动巡检'],
          proposedOutcome: '继续自动巡检',
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1', 'run_scheduler_10'),
          rationale: 'producer summary 的 Run 来源身份必须精确匹配，不能只匹配前缀。',
          targetTaskId: 'task_1',
          title: '确认自动巡检策略',
        }),
        createdAt: '2026-05-25T00:01:00.000Z',
      }],
    });

    expect(items).toEqual([]);
  });

  it('blocks scheduler Decision proposal timeline events when event and payload task identity diverge', () => {
    const items = buildTaskplaneWritebackApprovalItems({
      runDetails: [],
      taskId: 'task_1',
      taskTitle: 'Codex 教程站',
      timeline: [{
        id: 'timeline_scheduler_cross_task',
        taskId: 'task_other',
        type: 'panel.scheduler_decision_proposed',
        payload: JSON.stringify({
          operatorConfirmed: true,
          operatorId: 'operator_1',
          options: ['继续自动巡检', '暂停自动巡检'],
          proposedOutcome: '继续自动巡检',
          rationale: '跨任务 timeline event 不能为当前任务创建审批项。',
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
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1', 'run_recovered_1'),
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
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1', 'run_recovered_1'),
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
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1', 'run_scheduler_1'),
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
          proposalReadinessSummary: schedulerDecisionReadinessSummary('task_1', 'run_scheduler_1'),
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

function schedulerDecisionReadinessSummary(targetTaskId: string, evidenceRunId?: string): string {
  return [
    'Scheduler Decision proposal contract',
    'proposalReady=yes',
    'approvalQueueSurface=task_dynamics',
    `targetTask=${targetTaskId}`,
    `evidenceSourceType=${evidenceRunId ? 'run' : 'system'}`,
    `evidenceRunId=${evidenceRunId ?? 'missing'}`,
    'evidenceSourceIdentityChain=ready',
    'decisionPersistenceAllowed=false',
    'writebackDispatchAllowed=false',
    'schedulerTriggerAllowed=false',
  ].join(' / ');
}

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
