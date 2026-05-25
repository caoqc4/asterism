import {
  classifyRuntimeFileSurface,
  type RuntimeSurfaceKind,
} from './runtime-surface-routing.js';
import {
  extractTaskplaneWriteIntentsFromText,
  type TaskplaneArtifactProposeIntent,
  type TaskplaneDecisionCreateIntent,
  type TaskplaneTaskBlockedIntent,
  type TaskplaneTaskCompleteIntent,
  type TaskplaneTaskFileProposeIntent,
  type TaskplaneTaskNextStepIntent,
  validateTaskplaneWriteIntent,
} from './taskplane-write-intent.js';

export type TaskplaneTaskFileWritebackProposal = {
  content: string;
  evidenceRunId: string;
  intentSource: 'write_intent';
  path: string;
  summary: string;
  surface: RuntimeSurfaceKind;
  surfaceLabel: string;
};

export type TaskplaneArtifactWritebackProposal = {
  content: string;
  evidenceRunId: string;
  kind: 'note' | 'patch';
  summary: string;
  title: string;
};

export type TaskplaneSourceContextWritebackProposal = {
  credibility?: 'verified' | 'unknown' | 'low';
  evidenceRunId: string;
  note: string;
  title: string;
  uri?: string | null;
};

export type TaskplaneStructuredWritebackIntent =
  | TaskplaneDecisionCreateIntent
  | TaskplaneTaskNextStepIntent
  | TaskplaneTaskBlockedIntent
  | TaskplaneTaskCompleteIntent;

export type TaskplaneStructuredWritebackProposal = {
  detail: string;
  evidenceRunId: string;
  intent: TaskplaneStructuredWritebackIntent;
  title: string;
};

export type TaskplaneWritebackProposalSet = {
  artifact: TaskplaneArtifactWritebackProposal | null;
  sourceContext: TaskplaneSourceContextWritebackProposal | null;
  structured: TaskplaneStructuredWritebackProposal | null;
  taskFile: TaskplaneTaskFileWritebackProposal | null;
  taskRecord: TaskplaneTaskFileWritebackProposal | null;
};

export function buildTaskplaneWritebackProposalsFromText(params: {
  date?: Date;
  output: string;
  runId: string;
  taskId: string;
  taskTitle: string;
}): TaskplaneWritebackProposalSet {
  const intents = extractTaskplaneWriteIntentsFromText({
    evidenceRunId: params.runId,
    taskId: params.taskId,
    text: params.output,
  }).filter((intent) => validateTaskplaneWriteIntent(intent).status === 'ready');

  const taskRecordIntent = intents.find((intent) => intent.type === 'task_record.create');
  const taskFileIntent = intents.find((intent): intent is TaskplaneTaskFileProposeIntent => (
    intent.type === 'task_file.propose'
  ));
  const artifactIntent = intents.find((intent): intent is TaskplaneArtifactProposeIntent => (
    intent.type === 'artifact.propose'
  ));
  const sourceContextIntent = intents.find((intent) => intent.type === 'source_context.create');
  const structuredIntent = intents.find((intent): intent is TaskplaneStructuredWritebackIntent => (
    intent.type === 'decision.create'
    || intent.type === 'task.update_next_step'
    || intent.type === 'task.mark_blocked'
    || intent.type === 'task.complete.propose'
  ));

  return {
    artifact: artifactIntent ? buildArtifactProposal(artifactIntent) : null,
    sourceContext: sourceContextIntent?.type === 'source_context.create'
      ? {
          credibility: sourceContextIntent.credibility,
          evidenceRunId: sourceContextIntent.evidenceRunId,
          note: sourceContextIntent.note,
          title: sourceContextIntent.title,
          uri: sourceContextIntent.uri ?? null,
        }
      : null,
    structured: structuredIntent ? buildStructuredWritebackProposal(structuredIntent) : null,
    taskFile: taskFileIntent ? buildTaskFileProposal(taskFileIntent) : null,
    taskRecord: taskRecordIntent?.type === 'task_record.create'
      ? {
          content: taskRecordIntent.content,
          evidenceRunId: taskRecordIntent.evidenceRunId,
          intentSource: 'write_intent',
          path: `Task Records/${formatDatePart(params.date ?? new Date())}-${slugFilePart(params.taskTitle)}-agent-record.md`,
          summary: `Agent 建议保存为任务记录。confidence=${taskRecordIntent.confidence}`,
          surface: 'task_record',
          surfaceLabel: '任务记录',
        }
      : null,
  };
}

function buildArtifactProposal(intent: TaskplaneArtifactProposeIntent): TaskplaneArtifactWritebackProposal {
  return {
    content: intent.content,
    evidenceRunId: intent.evidenceRunId,
    kind: intent.kind,
    summary: intent.summary ?? 'Agent 建议保存为任务产物。',
    title: intent.title,
  };
}

function buildTaskFileProposal(intent: TaskplaneTaskFileProposeIntent): TaskplaneTaskFileWritebackProposal {
  const path = normalizeProposalPath(intent.path);
  const name = path.split('/').filter(Boolean).at(-1) ?? path;
  const surface = classifyRuntimeFileSurface({
    kind: 'local_file',
    name,
    path,
    taskFileKind: 'file',
  });
  return {
    content: intent.content,
    evidenceRunId: intent.evidenceRunId,
    intentSource: 'write_intent',
    path,
    summary: intent.summary ?? 'Agent 建议保存为任务文件。',
    surface: surface.surface,
    surfaceLabel: surface.label,
  };
}

function buildStructuredWritebackProposal(
  intent: TaskplaneStructuredWritebackIntent,
): TaskplaneStructuredWritebackProposal {
  switch (intent.type) {
    case 'decision.create':
      return {
        detail: intent.rationale,
        evidenceRunId: intent.evidenceRunId,
        intent,
        title: `决策提案：${intent.title}`,
      };
    case 'task.update_next_step':
      return {
        detail: intent.reason,
        evidenceRunId: intent.evidenceRunId,
        intent,
        title: `下一步提案：${intent.nextStep}`,
      };
    case 'task.mark_blocked':
      return {
        detail: intent.unblockCondition
          ? `${intent.reason}\n解除条件：${intent.unblockCondition}`
          : intent.reason,
        evidenceRunId: intent.evidenceRunId,
        intent,
        title: '阻塞提案',
      };
    case 'task.complete.propose':
      return {
        detail: intent.evidence,
        evidenceRunId: intent.evidenceRunId,
        intent,
        title: '完成确认提案',
      };
  }
}

function formatDatePart(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function slugFilePart(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii.slice(0, 36) || 'task';
}

function normalizeProposalPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}
