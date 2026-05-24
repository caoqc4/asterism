import type { RuntimeSurfaceKind } from './runtime-surface-routing.js';
import {
  extractTaskplaneWriteIntentsFromText,
  type TaskplaneDecisionCreateIntent,
  type TaskplaneTaskBlockedIntent,
  type TaskplaneTaskCompleteIntent,
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
  sourceContext: TaskplaneSourceContextWritebackProposal | null;
  structured: TaskplaneStructuredWritebackProposal | null;
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
  const sourceContextIntent = intents.find((intent) => intent.type === 'source_context.create');
  const structuredIntent = intents.find((intent): intent is TaskplaneStructuredWritebackIntent => (
    intent.type === 'decision.create'
    || intent.type === 'task.update_next_step'
    || intent.type === 'task.mark_blocked'
    || intent.type === 'task.complete.propose'
  ));

  return {
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
