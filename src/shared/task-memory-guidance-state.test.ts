import { describe, expect, it } from 'vitest';

import {
  buildTaskMemoryGuidanceStateForTaskFiles,
  detectTaskMemoryGuidanceTargets,
  evaluateTaskMemoryGuidanceState,
  selectBlockingTaskMemoryGuidance,
} from './task-memory-guidance-state.js';

describe('task memory guidance state', () => {
  it('detects Task.md and Task Record guidance targets', () => {
    expect(detectTaskMemoryGuidanceTargets([
      '- Task.md update recommended: next_step',
      '- Task Record may be useful: context_archive',
    ].join('\n'))).toEqual(['task_md', 'task_record']);
  });

  it('returns none when no guidance signal exists', () => {
    expect(evaluateTaskMemoryGuidanceState({
      guidanceSignals: [],
    })).toMatchObject({
      outcome: 'none',
      pendingTargets: [],
    });
  });

  it('marks latest guidance as pending until corresponding memory is written', () => {
    expect(evaluateTaskMemoryGuidanceState({
      guidanceSignals: [{
        status: 'completed',
        title: '任务记忆建议',
        output: '- Task.md update recommended: next_step',
        createdAt: '2026-05-15T01:00:00.000Z',
      }],
    })).toMatchObject({
      outcome: 'pending',
      pendingTargets: ['task_md'],
    });
  });

  it('treats guidance as satisfied when matching write happens after the guidance', () => {
    expect(evaluateTaskMemoryGuidanceState({
      guidanceSignals: [{
        status: 'completed',
        title: '任务记忆建议',
        output: '- Task Record may be useful: context_archive',
        createdAt: '2026-05-15T01:00:00.000Z',
      }],
      memoryWrites: [{
        status: 'completed',
        target: 'task_record',
        path: 'Task Records/context-refresh.md',
        createdAt: '2026-05-15T01:02:00.000Z',
      }],
    })).toMatchObject({
      outcome: 'satisfied',
      pendingTargets: [],
    });
  });

  it('does not satisfy newer guidance with an older memory write', () => {
    expect(evaluateTaskMemoryGuidanceState({
      guidanceSignals: [{
        status: 'completed',
        title: '任务记忆建议',
        output: '- Task.md update recommended: blocker',
        createdAt: '2026-05-15T01:05:00.000Z',
      }],
      memoryWrites: [{
        status: 'completed',
        target: 'task_md',
        path: 'Task.md',
        createdAt: '2026-05-15T01:00:00.000Z',
      }],
    })).toMatchObject({
      outcome: 'pending',
      pendingTargets: ['task_md'],
    });
  });

  it('ignores failed or skipped guidance signals', () => {
    expect(evaluateTaskMemoryGuidanceState({
      guidanceSignals: [{
        status: 'failed',
        title: '任务记忆建议',
        output: '- Task.md update recommended: next_step',
      }],
    })).toMatchObject({
      outcome: 'none',
    });
  });

  it('selects the newest pending guidance across run states', () => {
    expect(selectBlockingTaskMemoryGuidance([
      {
        latestGuidanceAt: '2026-05-15T01:00:00.000Z',
        outcome: 'pending',
        pendingTargets: ['task_md'],
        reason: '旧建议待处理',
        targets: ['task_md'],
      },
      {
        latestGuidanceAt: '2026-05-15T01:03:00.000Z',
        outcome: 'satisfied',
        pendingTargets: [],
        reason: '最新任务记忆建议已有对应的 Task.md 或 Task Record 写入。',
        targets: ['task_record'],
      },
      {
        latestGuidanceAt: '2026-05-15T01:02:00.000Z',
        outcome: 'pending',
        pendingTargets: ['task_record'],
        reason: '新建议待处理',
        targets: ['task_record'],
      },
    ])).toMatchObject({
      latestGuidanceAt: '2026-05-15T01:02:00.000Z',
      reason: '新建议待处理',
    });
  });

  it('builds memory guidance state from task files', () => {
    expect(buildTaskMemoryGuidanceStateForTaskFiles({
      guidanceSignals: [{
        status: 'completed',
        title: '任务记忆建议',
        output: '- Task.md update recommended: next_step\n- Task Record may be useful: context_archive',
        createdAt: '2026-05-15T01:00:00.000Z',
      }],
      taskFiles: [
        {
          name: 'Task.md',
          path: 'Task.md',
          updatedAt: '2026-05-15T01:01:00.000Z',
        },
        {
          name: '阶段收尾记录.md',
          path: 'Task Records/阶段收尾记录.md',
          updatedAt: '2026-05-15T01:02:00.000Z',
        },
        {
          name: 'AI 产出.md',
          path: 'AI Outputs/AI 产出.md',
          updatedAt: '2026-05-15T01:02:00.000Z',
        },
      ],
    })).toMatchObject({
      outcome: 'satisfied',
      pendingTargets: [],
      targets: ['task_md', 'task_record'],
    });
  });
});
