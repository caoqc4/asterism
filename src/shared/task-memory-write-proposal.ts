import type {
  TaskMemoryGuidanceState,
  TaskMemoryGuidanceTarget,
  TaskMemoryFileSignal,
} from './task-memory-guidance-state.js';
import { isTaskMdPath, isTaskRecordPath, normalizeTaskMemoryPath } from './task-memory-path.js';
import type { CreateTaskFileInput, UpdateTaskFileInput } from './types/task-file.js';

export type TaskMemoryWriteProposalOperation = 'create' | 'update';

export type TaskMemoryWriteProposal = {
  contentTemplate: string;
  existingFileId?: string | null;
  operation: TaskMemoryWriteProposalOperation;
  path: string;
  reason: string;
  target: TaskMemoryGuidanceTarget;
  title: string;
};

export type TaskMemoryWriteApplyPlan =
  | {
      action: 'create';
      input: CreateTaskFileInput;
      proposal: TaskMemoryWriteProposal;
      status: 'ready';
    }
  | {
      action: 'update';
      input: UpdateTaskFileInput;
      proposal: TaskMemoryWriteProposal;
      status: 'ready';
    }
  | {
      proposal: TaskMemoryWriteProposal;
      reason: string;
      status: 'blocked';
    };

export function buildTaskMemoryWriteProposals(params: {
  guidance: TaskMemoryGuidanceState | null;
  nowIso?: string;
  taskFiles?: TaskMemoryFileSignal[] | null;
  taskTitle?: string | null;
}): TaskMemoryWriteProposal[] {
  const guidance = params.guidance;
  if (!guidance || guidance.outcome !== 'pending') return [];

  const normalizedFiles = (params.taskFiles ?? []).map((file) => ({
    ...file,
    path: normalizeTaskMemoryPath(file.path),
  }));
  const taskTitle = params.taskTitle?.trim() || '当前任务';

  return guidance.pendingTargets.map((target) => {
    if (target === 'task_md') {
      const existingTaskMd = normalizedFiles.find((file) => isTaskMdPath(file.path));
      return {
        contentTemplate: buildTaskMdProposalContent(taskTitle, guidance.reason),
        existingFileId: existingTaskMd?.id ?? null,
        operation: existingTaskMd ? 'update' : 'create',
        path: 'Task.md',
        reason: guidance.reason,
        target,
        title: existingTaskMd ? '更新 Task.md' : '创建 Task.md',
      };
    }

    return {
      contentTemplate: buildTaskRecordProposalContent(taskTitle, guidance.reason),
      existingFileId: null,
      operation: 'create',
      path: `Task Records/${formatTaskRecordDate(params.nowIso)}-memory-guidance.md`,
      reason: guidance.reason,
      target,
      title: '创建任务记录',
    };
  });
}

export function buildTaskMemoryWriteApplyPlan(params: {
  proposal: TaskMemoryWriteProposal;
  taskId: string;
}): TaskMemoryWriteApplyPlan {
  const taskId = params.taskId.trim();
  const proposal = params.proposal;
  if (!taskId) {
    return {
      proposal,
      reason: 'Task memory write proposal requires taskId.',
      status: 'blocked',
    };
  }

  if (proposal.operation === 'update') {
    const existingFileId = proposal.existingFileId?.trim();
    if (!existingFileId) {
      return {
        proposal,
        reason: 'Task memory update proposal requires existingFileId.',
        status: 'blocked',
      };
    }

    return {
      action: 'update',
      input: {
        id: existingFileId,
        content: proposal.contentTemplate,
      },
      proposal,
      status: 'ready',
    };
  }

  return {
    action: 'create',
    input: {
      taskId,
      name: fileNameFromPath(proposal.path),
      path: proposal.path,
      kind: 'file',
      content: proposal.contentTemplate,
    },
    proposal,
    status: 'ready',
  };
}

function buildTaskMdProposalContent(taskTitle: string, reason: string): string {
  return [
    '# Task',
    '',
    '## Goal',
    taskTitle,
    '',
    '## Current Progress',
    '',
    '## Key Context',
    `- 待补任务记忆：${reason}`,
    '',
    '## Decisions',
    '',
    '## Constraints',
    '',
    '## Open Questions',
    '',
    '## Next Step',
    '',
    '## Important Files',
    '',
    '## Recent Records',
    '',
  ].join('\n');
}

function buildTaskRecordProposalContent(taskTitle: string, reason: string): string {
  return [
    `# Task Record: ${taskTitle}`,
    '',
    '## Trigger',
    reason,
    '',
    '## Summary',
    '',
    '## Confirmed',
    '',
    '## Open',
    '',
    '## Next',
    '',
    '## Links',
    '',
  ].join('\n');
}

function formatTaskRecordDate(nowIso?: string): string {
  const date = nowIso?.slice(0, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : new Date().toISOString().slice(0, 10);
}

function fileNameFromPath(path: string): string {
  return (path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? path.trim()) || 'Task.md';
}

export function hasTaskMemoryWriteForTarget(
  target: TaskMemoryGuidanceTarget,
  files: TaskMemoryFileSignal[] | null | undefined,
): boolean {
  return (files ?? []).some((file) => {
    const path = normalizeTaskMemoryPath(file.path);
    return target === 'task_md' ? isTaskMdPath(path) : isTaskRecordPath(path);
  });
}
