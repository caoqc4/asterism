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
  referencePaths?: string[];
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
    const referencePaths = guidance.referencePathsByTarget?.[target] ?? [];
    if (target === 'task_md') {
      const existingTaskMd = normalizedFiles.find((file) => isTaskMdPath(file.path));
      return {
        contentTemplate: existingTaskMd
          ? buildTaskMdUpdateContent(existingTaskMd.content, taskTitle, guidance.reason, referencePaths)
          : buildTaskMdProposalContent(taskTitle, guidance.reason, referencePaths),
        existingFileId: existingTaskMd?.id ?? null,
        operation: existingTaskMd ? 'update' : 'create',
        path: 'Task.md',
        referencePaths,
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
      referencePaths,
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
  const path = normalizeTaskMemoryPath(proposal.path);
  if (!taskId) {
    return {
      proposal,
      reason: 'Task memory write proposal requires taskId.',
      status: 'blocked',
    };
  }

  if (!path) {
    return {
      proposal,
      reason: 'Task memory write proposal requires a path.',
      status: 'blocked',
    };
  }

  if (proposal.target === 'task_md' && !isTaskMdPath(path)) {
    return {
      proposal,
      reason: 'Task.md memory proposal must write to Task.md.',
      status: 'blocked',
    };
  }

  if (proposal.target === 'task_record' && !isTaskRecordPath(path)) {
    return {
      proposal,
      reason: 'Task Record memory proposal must write under Task Records/.',
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
      name: fileNameFromPath(path),
      path,
      kind: 'file',
      content: proposal.contentTemplate,
    },
    proposal,
    status: 'ready',
  };
}

function buildTaskMdProposalContent(taskTitle: string, reason: string, referencePaths: string[] = []): string {
  return [
    '# Task',
    '',
    '## Goal',
    taskTitle,
    '',
    '## Current Progress',
    '',
    '## Key Context',
    referencePaths.length ? '' : `- 待补任务记忆：${reason}`,
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
    ...referencePaths.map((path) => `- ${path}`),
    '',
    '## Recent Records',
    '',
  ].join('\n');
}

function buildTaskMdUpdateContent(
  currentContent: string | null | undefined,
  taskTitle: string,
  reason: string,
  referencePaths: string[] = [],
): string {
  const trimmed = currentContent?.trimEnd();
  if (!trimmed) return buildTaskMdProposalContent(taskTitle, reason, referencePaths);
  if (referencePaths.length) return appendImportantFileReferences(trimmed, referencePaths);
  const note = `- 待补任务记忆：${reason}`;
  if (trimmed.includes(note)) return `${trimmed}\n`;

  const heading = '## Recent Records';
  if (trimmed.includes(heading)) {
    return `${trimmed}\n${note}\n`;
  }

  return [
    trimmed,
    '',
    heading,
    note,
    '',
  ].join('\n');
}

function appendImportantFileReferences(content: string, referencePaths: string[]): string {
  const missingPaths = uniqueStrings(referencePaths.filter((path) => !content.includes(path)));
  if (!missingPaths.length) return `${content.trimEnd()}\n`;

  const marker = '## Important Files';
  const lines = content.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const start = lines.findIndex((line) => line.trim() === marker);
  if (start === -1) {
    return [
      lines.join('\n'),
      '',
      marker,
      ...missingPaths.map((path) => `- ${path}`),
      '',
    ].join('\n');
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]?.trim() ?? '')) {
      end = index;
      break;
    }
  }

  const placeholders = new Set(['No important files linked yet.', '暂无']);
  const section = lines.slice(start + 1, end).map((line) => line.trim()).filter(Boolean);
  const before = placeholders.has(section.join('\n')) ? lines.slice(0, start + 1) : lines.slice(0, end);
  const after = lines.slice(end);
  return [
    ...before,
    ...missingPaths.map((path) => `- ${path}`),
    ...after,
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
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
