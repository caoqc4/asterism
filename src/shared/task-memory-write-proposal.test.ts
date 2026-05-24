import { describe, expect, it } from 'vitest';

import {
  buildTaskMemoryWriteApplyPlan,
  buildTaskMemoryWriteProposals,
  hasTaskMemoryWriteForTarget,
} from './task-memory-write-proposal.js';
import type { TaskMemoryGuidanceState } from './task-memory-guidance-state.js';

function pendingGuidance(partial: Partial<TaskMemoryGuidanceState> = {}): TaskMemoryGuidanceState {
  return {
    latestGuidanceAt: partial.latestGuidanceAt ?? '2026-05-16T10:00:00.000Z',
    outcome: partial.outcome ?? 'pending',
    pendingTargets: partial.pendingTargets ?? ['task_md'],
    reason: partial.reason ?? '最新任务记忆建议仍缺少对应写入：Task.md。',
    referencePathsByTarget: partial.referencePathsByTarget,
    suggestedContentByTarget: partial.suggestedContentByTarget,
    taskRecordReasonsByTarget: partial.taskRecordReasonsByTarget,
    targets: partial.targets ?? partial.pendingTargets ?? ['task_md'],
  };
}

describe('task memory write proposal', () => {
  it('builds the smallest Task.md update proposal for pending Task.md guidance', () => {
    expect(buildTaskMemoryWriteProposals({
      guidance: pendingGuidance(),
      taskFiles: [{
        content: '# Task\n\n## Goal\n开发小程序',
        id: 'task_file_1',
        path: 'Task.md',
        updatedAt: '2026-05-16T09:00:00.000Z',
      }],
      taskTitle: '开发小程序',
    })).toMatchObject([{
      contentTemplate: expect.stringContaining('## Goal\n开发小程序'),
      existingFileId: 'task_file_1',
      operation: 'update',
      path: 'Task.md',
      target: 'task_md',
      title: '更新 Task.md',
    }]);
  });

  it('appends pending Task.md guidance without replacing existing Task.md content', () => {
    const proposals = buildTaskMemoryWriteProposals({
      guidance: pendingGuidance(),
      taskFiles: [{
        content: '# Task\n\n## Goal\n开发小程序\n\n## Current Progress\n已有进展',
        id: 'task_file_1',
        path: 'Task.md',
        updatedAt: '2026-05-16T09:00:00.000Z',
      }],
      taskTitle: '开发小程序',
    });

    expect(proposals[0]!.contentTemplate).toContain('## Current Progress\n已有进展');
    expect(proposals[0]!.contentTemplate).toContain('## Recent Records');
    expect(proposals[0]!.contentTemplate).toContain('待补任务记忆');
    expect(proposals[0]!.contentTemplate.match(/# Task/g)).toHaveLength(1);
  });

  it('uses structured reference paths as concrete Task.md important files', () => {
    const proposals = buildTaskMemoryWriteProposals({
      guidance: pendingGuidance({
        referencePathsByTarget: {
          task_md: ['Artifacts/release-note.md'],
        },
      }),
      taskFiles: [{
        content: '# Task\n\n## Goal\n开发小程序\n\n## Important Files\nNo important files linked yet.\n\n## Recent Records\n',
        id: 'task_file_1',
        path: 'Task.md',
        updatedAt: '2026-05-16T09:00:00.000Z',
      }],
      taskTitle: '开发小程序',
    });

    expect(proposals[0]!.referencePaths).toEqual(['Artifacts/release-note.md']);
    expect(proposals[0]!.contentTemplate).toContain('## Important Files\n- Artifacts/release-note.md');
    expect(proposals[0]!.contentTemplate).not.toContain('No important files linked yet.');
    expect(proposals[0]!.contentTemplate).not.toContain('待补任务记忆');
  });

  it('builds a Task Record creation proposal for pending record guidance', () => {
    const proposals = buildTaskMemoryWriteProposals({
      guidance: pendingGuidance({
        pendingTargets: ['task_record'],
        reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
        taskRecordReasonsByTarget: {
          task_record: 'context_clear_archive',
        },
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
    expect(proposals[0]!.recordWorthiness).toMatchObject({
      reason: 'context_clear_archive',
      shouldCreateTaskRecord: true,
    });
    expect(proposals[0]!.contentTemplate).toContain('## Trigger');
    expect(proposals[0]!.contentTemplate).toContain('最新任务记忆建议仍缺少对应写入');
  });

  it('does not create Task Record proposals for generic pending guidance', () => {
    expect(buildTaskMemoryWriteProposals({
      guidance: pendingGuidance({
        pendingTargets: ['task_record'],
        reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
        targets: ['task_record'],
      }),
      nowIso: '2026-05-16T11:00:00.000Z',
      taskTitle: '开发小程序',
    })).toEqual([]);
  });

  it('uses structured suggested content in Task Record proposals', () => {
    const proposals = buildTaskMemoryWriteProposals({
      guidance: pendingGuidance({
        pendingTargets: ['task_record'],
        reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
        suggestedContentByTarget: {
          task_record: [
            '## Summary',
            'Codex checked the task.',
            '',
            '## Confirmed',
            '- Runtime mode: Codex CLI / read-only.',
            '- Run objective: Review implementation path.',
            '- Completion conditions checked: 1',
            '  - Output is reviewable.',
            '',
            '## Next',
            'Run focused tests.',
          ].join('\n'),
        },
        targets: ['task_record'],
      }),
      nowIso: '2026-05-16T11:00:00.000Z',
      taskTitle: '开发小程序',
    });

    expect(proposals[0]!.contentTemplate).toContain('## Trigger');
    expect(proposals[0]!.contentTemplate).toContain('## Summary\nCodex checked the task.');
    expect(proposals[0]!.contentTemplate).toContain('- Runtime mode: Codex CLI / read-only.');
    expect(proposals[0]!.contentTemplate).toContain('- Run objective: Review implementation path.');
    expect(proposals[0]!.contentTemplate).toContain('- Completion conditions checked: 1');
    expect(proposals[0]!.contentTemplate).toContain('  - Output is reviewable.');
    expect(proposals[0]!.contentTemplate).toContain('## Next\nRun focused tests.');

    const applyPlan = buildTaskMemoryWriteApplyPlan({
      proposal: proposals[0]!,
      taskId: 'task_1',
    });
    expect(applyPlan).toMatchObject({
      action: 'create',
      input: {
        content: expect.stringContaining('- Runtime mode: Codex CLI / read-only.'),
      },
      status: 'ready',
    });
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

  it('builds confirmed create and update inputs without applying them', () => {
    const updateProposal = buildTaskMemoryWriteProposals({
      guidance: pendingGuidance(),
      taskFiles: [{ id: 'task_file_1', path: 'Task.md', updatedAt: '2026-05-16T09:00:00.000Z' }],
      taskTitle: '开发小程序',
    })[0]!;
    const createProposal = buildTaskMemoryWriteProposals({
      guidance: pendingGuidance({
        pendingTargets: ['task_record'],
        reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
        taskRecordReasonsByTarget: {
          task_record: 'context_clear_archive',
        },
        targets: ['task_record'],
      }),
      nowIso: '2026-05-16T11:00:00.000Z',
      taskTitle: '开发小程序',
    })[0]!;

    expect(buildTaskMemoryWriteApplyPlan({
      proposal: updateProposal,
      taskId: 'task_1',
    })).toMatchObject({
      action: 'update',
      input: {
        id: 'task_file_1',
        content: expect.stringContaining('待补任务记忆'),
      },
      status: 'ready',
    });
    expect(buildTaskMemoryWriteApplyPlan({
      proposal: createProposal,
      taskId: 'task_1',
    })).toMatchObject({
      action: 'create',
      input: {
        taskId: 'task_1',
        name: '2026-05-16-memory-guidance.md',
        path: 'Task Records/2026-05-16-memory-guidance.md',
        kind: 'file',
        content: expect.stringContaining('## Trigger'),
      },
      status: 'ready',
    });
  });

  it('blocks update plans when the existing file id is missing', () => {
    expect(buildTaskMemoryWriteApplyPlan({
      proposal: {
        contentTemplate: '# Task',
        operation: 'update',
        path: 'Task.md',
        reason: '需要更新 Task.md。',
        target: 'task_md',
        title: '更新 Task.md',
      },
      taskId: 'task_1',
    })).toMatchObject({
      reason: 'Task memory update proposal requires existingFileId.',
      status: 'blocked',
    });
  });

  it('blocks confirmed write plans when the proposal target and path disagree', () => {
    expect(buildTaskMemoryWriteApplyPlan({
      proposal: {
        contentTemplate: '# Task',
        operation: 'create',
        path: ' ',
        reason: '需要补 Task.md。',
        target: 'task_md',
        title: '创建 Task.md',
      },
      taskId: 'task_1',
    })).toMatchObject({
      reason: 'Task memory write proposal requires a path.',
      status: 'blocked',
    });

    expect(buildTaskMemoryWriteApplyPlan({
      proposal: {
        contentTemplate: '# Task',
        operation: 'create',
        path: 'notes.md',
        reason: '需要补 Task.md。',
        target: 'task_md',
        title: '创建 Task.md',
      },
      taskId: 'task_1',
    })).toMatchObject({
      reason: 'Task.md memory proposal must write to Task.md.',
      status: 'blocked',
    });

    expect(buildTaskMemoryWriteApplyPlan({
      proposal: {
        contentTemplate: '# Task Record',
        operation: 'create',
        path: 'AI Outputs/memory.md',
        reason: '需要补任务记录。',
        target: 'task_record',
        title: '创建任务记录',
      },
      taskId: 'task_1',
    })).toMatchObject({
      reason: 'Task Record memory proposal must write under Task Records/.',
      status: 'blocked',
    });
  });

  it('normalizes task memory create paths before building write input', () => {
    expect(buildTaskMemoryWriteApplyPlan({
      proposal: {
        contentTemplate: '# Task Record',
        operation: 'create',
        path: ' Task Records\\handoff.md ',
        reason: '需要补任务记录。',
        target: 'task_record',
        title: '创建任务记录',
      },
      taskId: 'task_1',
    })).toMatchObject({
      action: 'create',
      input: {
        name: 'handoff.md',
        path: 'Task Records/handoff.md',
      },
      status: 'ready',
    });
  });
});
