import {
  classifyRuntimeFileSurface,
  type RuntimeSurfaceKind,
} from './runtime-surface-routing.js';
import {
  extractTaskplaneWriteIntentsFromText,
  type TaskplaneArtifactProposeIntent,
  type TaskplaneBusinessHandoffRecordIntent,
  type TaskplaneBusinessNextActionCreateIntent,
  type TaskplaneBusinessRecordCreateIntent,
  type TaskplaneBusinessReviewRecordIntent,
  type TaskplaneBusinessSopRevisionProposeIntent,
  type TaskplaneDecisionCreateIntent,
  type TaskplaneTaskBlockedIntent,
  type TaskplaneTaskCompleteIntent,
  type TaskplaneTaskFileProposeIntent,
  type TaskplaneTaskNextStepIntent,
  validateTaskplaneWriteIntent,
} from './taskplane-write-intent.js';

export type TaskplaneTaskFileWritebackProposal = {
  businessLineId?: string | null;
  content: string;
  evidenceRunId: string;
  intentSource: 'write_intent';
  path: string;
  summary: string;
  surface: RuntimeSurfaceKind;
  surfaceLabel: string;
};

export type TaskplaneArtifactWritebackProposal = {
  businessLineId?: string | null;
  content: string;
  evidenceRunId: string;
  kind: 'note' | 'patch';
  summary: string;
  title: string;
};

export type TaskplaneSourceContextWritebackProposal = {
  businessLineId?: string | null;
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
  businessLineId?: string | null;
  detail: string;
  evidenceRunId: string;
  intent: TaskplaneStructuredWritebackIntent;
  title: string;
};

export type TaskplaneBusinessLineWritebackIntent =
  | TaskplaneBusinessRecordCreateIntent
  | TaskplaneBusinessReviewRecordIntent
  | TaskplaneBusinessNextActionCreateIntent
  | TaskplaneBusinessSopRevisionProposeIntent
  | TaskplaneBusinessHandoffRecordIntent;

export type TaskplaneBusinessLineWritebackProposal = {
  businessLineId: string | null;
  detail: string;
  evidenceRunId: string;
  intent: TaskplaneBusinessLineWritebackIntent;
  title: string;
};

export type TaskplaneWritebackProposalSet = {
  artifact: TaskplaneArtifactWritebackProposal | null;
  businessLine: TaskplaneBusinessLineWritebackProposal[];
  sourceContext: TaskplaneSourceContextWritebackProposal | null;
  structured: TaskplaneStructuredWritebackProposal | null;
  taskFile: TaskplaneTaskFileWritebackProposal | null;
  taskRecord: TaskplaneTaskFileWritebackProposal | null;
};

export function buildTaskplaneWritebackProposalsFromText(params: {
  date?: Date;
  output: string;
  runId: string;
  businessLineId?: string | null;
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
  const businessLineIntents = intents.filter((intent): intent is TaskplaneBusinessLineWritebackIntent => (
    intent.type === 'business_record.create'
    || intent.type === 'business_review.record'
    || intent.type === 'business_next_action.create'
    || intent.type === 'business_sop_revision.propose'
    || intent.type === 'business_handoff.record'
  ));

  return {
    artifact: artifactIntent ? buildArtifactProposal(artifactIntent, params.businessLineId ?? null) : null,
    businessLine: businessLineIntents.map((intent) =>
      buildBusinessLineWritebackProposal(intent, params.businessLineId ?? null)),
    sourceContext: sourceContextIntent?.type === 'source_context.create'
      ? {
          credibility: sourceContextIntent.credibility,
          businessLineId: params.businessLineId ?? null,
          evidenceRunId: sourceContextIntent.evidenceRunId,
          note: sourceContextIntent.note,
          title: sourceContextIntent.title,
          uri: sourceContextIntent.uri ?? null,
        }
      : null,
    structured: structuredIntent ? buildStructuredWritebackProposal(structuredIntent, params.businessLineId ?? null) : null,
    taskFile: taskFileIntent ? buildTaskFileProposal(taskFileIntent, params.businessLineId ?? null) : null,
    taskRecord: taskRecordIntent?.type === 'task_record.create'
      ? {
          businessLineId: params.businessLineId ?? null,
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

function buildBusinessLineWritebackProposal(
  intent: TaskplaneBusinessLineWritebackIntent,
  fallbackBusinessLineId?: string | null,
): TaskplaneBusinessLineWritebackProposal {
  const businessLineId = intent.businessLineId ?? fallbackBusinessLineId ?? null;
  switch (intent.type) {
    case 'business_record.create':
      return {
        businessLineId,
        detail: intent.summary,
        evidenceRunId: intent.evidenceRunId,
        intent: { ...intent, businessLineId },
        title: '业务记录写回提案',
      };
    case 'business_review.record':
      return {
        businessLineId,
        detail: intent.resultSummary,
        evidenceRunId: intent.evidenceRunId,
        intent: { ...intent, businessLineId },
        title: '业务复盘写回提案',
      };
    case 'business_next_action.create':
      return {
        businessLineId,
        detail: intent.summary ?? intent.nextStep ?? intent.title,
        evidenceRunId: intent.evidenceRunId,
        intent: { ...intent, businessLineId },
        title: `业务下一步提案：${intent.title}`,
      };
    case 'business_sop_revision.propose':
      return {
        businessLineId,
        detail: intent.changeReason,
        evidenceRunId: intent.evidenceRunId,
        intent: { ...intent, businessLineId },
        title: '业务 SOP revision 提案',
      };
    case 'business_handoff.record':
      return {
        businessLineId,
        detail: `${intent.currentState}\nNext: ${intent.nextSafeAction}\nReason: ${intent.reason}`,
        evidenceRunId: intent.evidenceRunId,
        intent: { ...intent, businessLineId },
        title: '业务交接记录提案',
      };
  }
}

function buildArtifactProposal(intent: TaskplaneArtifactProposeIntent, businessLineId?: string | null): TaskplaneArtifactWritebackProposal {
  return {
    businessLineId: businessLineId ?? null,
    content: intent.content,
    evidenceRunId: intent.evidenceRunId,
    kind: intent.kind,
    summary: intent.summary ?? 'Agent 建议保存为任务产物。',
    title: intent.title,
  };
}

function buildTaskFileProposal(
  intent: TaskplaneTaskFileProposeIntent,
  businessLineId?: string | null,
): TaskplaneTaskFileWritebackProposal {
  const path = normalizeProposalPath(intent.path);
  const name = path.split('/').filter(Boolean).at(-1) ?? path;
  const surface = classifyRuntimeFileSurface({
    kind: 'local_file',
    name,
    path,
    taskFileKind: 'file',
  });
  return {
    businessLineId: businessLineId ?? null,
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
  businessLineId?: string | null,
): TaskplaneStructuredWritebackProposal {
  switch (intent.type) {
    case 'decision.create':
      return {
        businessLineId: businessLineId ?? null,
        detail: intent.rationale,
        evidenceRunId: intent.evidenceRunId,
        intent,
        title: `决策提案：${intent.title}`,
      };
    case 'task.update_next_step':
      return {
        businessLineId: businessLineId ?? null,
        detail: intent.reason,
        evidenceRunId: intent.evidenceRunId,
        intent,
        title: `下一步提案：${intent.nextStep}`,
      };
    case 'task.mark_blocked':
      return {
        businessLineId: businessLineId ?? null,
        detail: intent.unblockCondition
          ? `${intent.reason}\n解除条件：${intent.unblockCondition}`
          : intent.reason,
        evidenceRunId: intent.evidenceRunId,
        intent,
        title: '阻塞提案',
      };
    case 'task.complete.propose':
      return {
        businessLineId: businessLineId ?? null,
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
