import { describe, expect, it } from 'vitest';

import { buildTaskMemoryWriteProposals, hasTaskMemoryWriteForTarget } from './task-memory-write-proposal.js';
import type { TaskMemoryGuidanceState } from './task-memory-guidance-state.js';

function pendingGuidance(partial: Partial<TaskMemoryGuidanceState> = {}): TaskMemoryGuidanceState {
  return {
    latestGuidanceAt: partial.latestGuidanceAt ?? '2026-05-16T10:00:00.000Z',
    outcome: partial.outcome ?? 'pending',
    pendingTargets: partial.pendingTargets ?? ['task_md'],
    reason: partial.reason ?? '最新任务记忆建议仍缺少对应写入：Task.md。',
    targets: partial.targets ?? partial.pendingTargets ?? ['task_md'],
  };
}

describe('task memory write proposal', () => {
  it('builds the smallest Task.md update proposal for pending Task.md guidance', () => {
    expect(buildTaskMemoryWriteProposals({
      guidance: pendingGuidance(),
      taskFiles: [{ path: 'Task.md', updatedAt: '2026-05-16T09:00:00.000Z' }],
      taskTitle: '开发小程序',
    })).toMatchObject([{
      operation: 'update',
      path: 'Task.md',
      target: 'task_md',
      title: '更新 Task.md',
    }]);
  });

  it('builds a Task Record creation proposal for pending record guidance', () => {
    const proposals = buildTaskMemoryWriteProposals({
      guidance: pendingGuidance({
        pendingTargets: ['task_record'],
        reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
        targets: ['task_record'],
      }),
      nowIso: '2026-05-16T11:00:00.000Z',
      taskTitle: '开发小程序',
    });

    expect(proposals).toMatchObject([{
      operation: 'create',
      path: 'Task Records/2026-05-16-memory-guidance.md',
      target: 'task_record',
      title: '创建任务记录',
    }]);
    expect(proposals[0]!.contentTemplate).toContain('## Trigger');
    expect(proposals[0]!.contentTemplate).toContain('最新任务记忆建议仍缺少对应写入');
  });

  it('returns no proposals when guidance is absent or already satisfied', () => {
    expect(buildTaskMemoryWriteProposals({ guidance: null })).toEqual([]);
    expect(buildTaskMemoryWriteProposals({
      guidance: pendingGuidance({ outcome: 'satisfied', pendingTargets: [] }),
    })).toEqual([]);
  });

  it('detects existing task memory write surfaces by normalized path', () => {
    expect(hasTaskMemoryWriteForTarget('task_md', [{ path: 'Task.md' }])).toBe(true);
    expect(hasTaskMemoryWriteForTarget('task_record', [{ path: ' Task Records\\handoff.md ' }])).toBe(true);
    expect(hasTaskMemoryWriteForTarget('task_record', [{ path: 'AI Outputs/handoff.md' }])).toBe(false);
  });
});
