import type {
  TaskMemoryGuidanceState,
  TaskMemoryGuidanceTarget,
  TaskMemoryFileSignal,
} from './task-memory-guidance-state.js';
import { isTaskMdPath, isTaskRecordPath, normalizeTaskMemoryPath } from './task-memory-path.js';

export type TaskMemoryWriteProposalOperation = 'create' | 'update';

export type TaskMemoryWriteProposal = {
  contentTemplate: string;
  operation: TaskMemoryWriteProposalOperation;
  path: string;
  reason: string;
  target: TaskMemoryGuidanceTarget;
  title: string;
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
        operation: existingTaskMd ? 'update' : 'create',
        path: 'Task.md',
        reason: guidance.reason,
        target,
        title: existingTaskMd ? '更新 Task.md' : '创建 Task.md',
      };
    }

    return {
      contentTemplate: buildTaskRecordProposalContent(taskTitle, guidance.reason),
      operation: 'create',
      path: `Task Records/${formatTaskRecordDate(params.nowIso)}-memory-guidance.md`,
      reason: guidance.reason,
      target,
      title: '创建任务记录',
    };
  });
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

export function hasTaskMemoryWriteForTarget(
  target: TaskMemoryGuidanceTarget,
  files: TaskMemoryFileSignal[] | null | undefined,
): boolean {
  return (files ?? []).some((file) => {
    const path = normalizeTaskMemoryPath(file.path);
    return target === 'task_md' ? isTaskMdPath(path) : isTaskRecordPath(path);
  });
}
