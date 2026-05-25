import {
  buildArtifactWritebackApplyPlan,
  buildSourceContextWritebackApplyPlan,
  buildStructuredWritebackApplyPlan,
  buildTaskFileUpdateWritebackApplyPlan,
  buildTaskFileWritebackApplyPlan,
  type TaskplaneWritebackApplyPlan,
} from './taskplane-writeback-apply-plan.js';
import {
  buildTaskplaneWritebackProposalsFromText,
  type TaskplaneTaskFileWritebackProposal,
} from './taskplane-writeback-proposal.js';
import { buildTaskMemoryWriteApplyPlan } from './task-memory-write-proposal.js';
import type { ArtifactRecord } from './types/artifact.js';
import type { BlockerRecord } from './types/blocker.js';
import type { DecisionRecord } from './types/decision.js';
import type { RunDetailRecord } from './types/run.js';
import type { SourceContextRecord } from './types/source-context.js';
import type { TaskFileRecord } from './types/task-file.js';

export type TaskplaneWritebackApprovalKind =
  | 'artifact'
  | 'source_context'
  | 'structured'
  | 'task_file'
  | 'task_memory'
  | 'task_record';

export type TaskplaneWritebackApprovalItem = {
  detail: string;
  id: string;
  kind: TaskplaneWritebackApprovalKind;
  plan: TaskplaneWritebackApplyPlan;
  runId: string;
  source: 'runtime_write_intent' | 'task_memory_guidance';
  summary: string;
  taskId: string;
  title: string;
};

export type TaskplaneWritebackApprovalExistingState = {
  activeBlocker?: Pick<BlockerRecord, 'title'> | null;
  artifacts?: Array<Pick<ArtifactRecord, 'sourceId' | 'title'>> | null;
  decisions?: Array<Pick<DecisionRecord, 'sourceId' | 'title'>> | null;
  nextStep?: string | null;
  sourceContexts?: Array<Pick<SourceContextRecord, 'runId' | 'title' | 'uri'>> | null;
  taskFiles?: Array<Pick<TaskFileRecord, 'content' | 'path'>> | null;
};

export function buildTaskplaneWritebackApprovalItems(params: {
  date?: Date;
  existing?: TaskplaneWritebackApprovalExistingState;
  runDetails: RunDetailRecord[];
  taskId: string;
  taskTitle: string;
}): TaskplaneWritebackApprovalItem[] {
  const items: TaskplaneWritebackApprovalItem[] = [];

  for (const detail of params.runDetails) {
    if (detail.taskId !== params.taskId) continue;

    if (detail.output?.trim()) {
      const proposalSet = buildTaskplaneWritebackProposalsFromText({
        date: params.date,
        output: detail.output,
        runId: detail.id,
        taskId: params.taskId,
        taskTitle: params.taskTitle,
      });

      if (proposalSet.taskRecord && !hasTaskFilePath(params.existing, proposalSet.taskRecord.path)) {
        items.push(buildTaskFileApprovalItem({
          kind: 'task_record',
          proposal: proposalSet.taskRecord,
          runId: detail.id,
          taskId: params.taskId,
          title: '任务记录写回提案',
        }));
      }

      if (proposalSet.taskFile && !hasTaskFilePath(params.existing, proposalSet.taskFile.path)) {
        items.push(buildTaskFileApprovalItem({
          kind: 'task_file',
          proposal: proposalSet.taskFile,
          runId: detail.id,
          taskId: params.taskId,
          title: '任务文件写回提案',
        }));
      }

      if (
        proposalSet.sourceContext
        && !hasSourceContext(params.existing, detail.id, proposalSet.sourceContext.title, proposalSet.sourceContext.uri)
      ) {
        const plan = buildSourceContextWritebackApplyPlan({
          proposal: proposalSet.sourceContext,
          taskId: params.taskId,
        });
        items.push({
          detail: proposalSet.sourceContext.note,
          id: approvalId(detail.id, 'source_context', proposalSet.sourceContext.title, proposalSet.sourceContext.uri ?? ''),
          kind: 'source_context',
          plan,
          runId: detail.id,
          source: 'runtime_write_intent',
          summary: proposalSet.sourceContext.uri ?? '保存为任务来源上下文',
          taskId: params.taskId,
          title: '来源上下文写回提案',
        });
      }

      if (
        proposalSet.artifact
        && !hasArtifact(params.existing, detail.id, proposalSet.artifact.title)
      ) {
        const plan = buildArtifactWritebackApplyPlan({
          proposal: proposalSet.artifact,
          taskId: params.taskId,
        });
        items.push({
          detail: proposalSet.artifact.content,
          id: approvalId(detail.id, 'artifact', proposalSet.artifact.title),
          kind: 'artifact',
          plan,
          runId: detail.id,
          source: 'runtime_write_intent',
          summary: proposalSet.artifact.summary,
          taskId: params.taskId,
          title: '任务产物写回提案',
        });
      }

      if (proposalSet.structured && !hasStructuredWriteback(params.existing, detail.id, proposalSet.structured)) {
        const plan = buildStructuredWritebackApplyPlan({
          proposal: proposalSet.structured,
          taskId: params.taskId,
        });
        items.push({
          detail: proposalSet.structured.detail,
          id: approvalId(detail.id, 'structured', proposalSet.structured.intent.type, proposalSet.structured.title),
          kind: 'structured',
          plan,
          runId: detail.id,
          source: 'runtime_write_intent',
          summary: structuredSummary(proposalSet.structured.intent.type),
          taskId: params.taskId,
          title: proposalSet.structured.title,
        });
      }
    }

    for (const proposal of detail.taskMemoryWriteProposals ?? []) {
      const memoryPlan = buildTaskMemoryWriteApplyPlan({
        proposal,
        taskId: params.taskId,
      });
      if (memoryPlan.status !== 'ready') continue;
      if (memoryPlan.action === 'create' && hasTaskFilePath(params.existing, memoryPlan.input.path ?? memoryPlan.input.name)) {
        continue;
      }
      const plan = memoryPlan.action === 'update'
        ? buildTaskFileUpdateWritebackApplyPlan({
            evidenceRunId: detail.id,
            input: memoryPlan.input,
            path: proposal.path,
            source: 'task_memory_write_proposal',
            surface: proposal.target === 'task_md' ? 'task_md' : 'task_record',
            surfaceLabel: proposal.target === 'task_md' ? 'Task.md' : '任务记录',
            taskId: params.taskId,
          })
        : buildTaskFileWritebackApplyPlan({
            evidenceRunId: detail.id,
            input: memoryPlan.input,
            source: 'task_memory_write_proposal',
            surface: proposal.target === 'task_md' ? 'task_md' : 'task_record',
            surfaceLabel: proposal.target === 'task_md' ? 'Task.md' : '任务记录',
            taskId: params.taskId,
          });
      items.push({
        detail: proposal.contentTemplate,
        id: approvalId(detail.id, 'task_memory', proposal.operation, proposal.path),
        kind: 'task_memory',
        plan,
        runId: detail.id,
        source: 'task_memory_guidance',
        summary: proposal.reason,
        taskId: params.taskId,
        title: proposal.title,
      });
    }
  }

  return dedupeApprovalItems(items);
}

function buildTaskFileApprovalItem(params: {
  kind: 'task_file' | 'task_record';
  proposal: TaskplaneTaskFileWritebackProposal;
  runId: string;
  taskId: string;
  title: string;
}): TaskplaneWritebackApprovalItem {
  const path = normalizeApprovalPath(params.proposal.path);
  const plan = buildTaskFileWritebackApplyPlan({
    evidenceRunId: params.proposal.evidenceRunId,
    input: {
      content: params.proposal.content,
      kind: 'file',
      name: fileNameFromPath(path),
      path,
      taskId: params.taskId,
    },
    source: 'taskplane_write_intent',
    surface: params.proposal.surface,
    surfaceLabel: params.proposal.surfaceLabel,
    taskId: params.taskId,
  });
  return {
    detail: params.proposal.content,
    id: approvalId(params.runId, params.kind, path),
    kind: params.kind,
    plan,
    runId: params.runId,
    source: 'runtime_write_intent',
    summary: params.proposal.summary,
    taskId: params.taskId,
    title: params.title,
  };
}

function hasTaskFilePath(
  existing: TaskplaneWritebackApprovalExistingState | null | undefined,
  path: string,
): boolean {
  const normalized = normalizeApprovalPath(path);
  return Boolean(existing?.taskFiles?.some((file) => normalizeApprovalPath(file.path) === normalized));
}

function hasSourceContext(
  existing: TaskplaneWritebackApprovalExistingState | null | undefined,
  runId: string,
  title: string,
  uri?: string | null,
): boolean {
  return Boolean(existing?.sourceContexts?.some((source) => (
    source.runId === runId
    || (uri && source.uri === uri)
    || source.title.trim() === title.trim()
  )));
}

function hasArtifact(
  existing: TaskplaneWritebackApprovalExistingState | null | undefined,
  runId: string,
  title: string,
): boolean {
  return Boolean(existing?.artifacts?.some((artifact) => (
    artifact.sourceId === runId && artifact.title.trim() === title.trim()
  )));
}

function hasStructuredWriteback(
  existing: TaskplaneWritebackApprovalExistingState | null | undefined,
  runId: string,
  proposal: NonNullable<ReturnType<typeof buildTaskplaneWritebackProposalsFromText>['structured']>,
): boolean {
  const { intent } = proposal;
  if (intent.type === 'decision.create' || intent.type === 'task.complete.propose') {
    const title = intent.type === 'decision.create' ? intent.title : '确认任务是否完成';
    return Boolean(existing?.decisions?.some((decision) => (
      decision.sourceId === runId && decision.title.trim() === title.trim()
    )));
  }
  if (intent.type === 'task.update_next_step') {
    return existing?.nextStep?.trim() === intent.nextStep.trim();
  }
  return existing?.activeBlocker?.title?.trim() === intent.reason.trim();
}

function structuredSummary(intentType: string): string {
  if (intentType === 'decision.create') return '确认后创建 Decision。';
  if (intentType === 'task.update_next_step') return '确认后更新任务下一步。';
  if (intentType === 'task.mark_blocked') return '确认后记录当前阻塞项。';
  return '确认后创建完成验收 Decision。';
}

function dedupeApprovalItems(items: TaskplaneWritebackApprovalItem[]): TaskplaneWritebackApprovalItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function approvalId(runId: string, ...parts: string[]): string {
  return ['writeback', runId, ...parts].map((part) => normalizeApprovalIdPart(part)).join(':');
}

function normalizeApprovalIdPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function normalizeApprovalPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function fileNameFromPath(path: string): string {
  return normalizeApprovalPath(path).split('/').filter(Boolean).at(-1) ?? 'taskplane-writeback.md';
}
