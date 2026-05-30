import { buildTaskplaneWritebackProposalsFromText } from './taskplane-writeback-proposal.js';
import type {
  BusinessLinePostRunReviewOption,
  BusinessLinePostRunReviewOptions,
} from './types/business-line.js';
import type { RunRecord } from './types/run.js';

export function buildBusinessLinePostRunReviewOptions(params: {
  output?: string | null;
  run: RunRecord;
  taskTitle?: string | null;
}): BusinessLinePostRunReviewOptions | null {
  const businessLineId = params.run.businessLineId?.trim();
  const output = (params.output ?? params.run.output ?? '').trim();
  if (!businessLineId || params.run.status !== 'completed' || !output) return null;

  const proposals = buildTaskplaneWritebackProposalsFromText({
    businessLineId,
    output,
    runId: params.run.id,
    taskId: params.run.taskId,
    taskTitle: params.taskTitle ?? params.run.taskId,
  });
  const structuredIntent = proposals.structured?.intent ?? null;
  const nextAction = structuredIntent?.type === 'task.update_next_step'
    ? structuredIntent.nextStep
    : null;
  const decisionReady = structuredIntent?.type === 'decision.create';
  const resultSummary = summarizeRunOutput(output);
  const writebackOptions: BusinessLinePostRunReviewOption[] = [
    {
      type: 'business_record',
      label: 'Business record',
      ready: true,
      evidence: [`run:${params.run.id}`, 'completed output'],
    },
    {
      type: 'next_action',
      label: 'Next action',
      ready: Boolean(nextAction),
      evidence: nextAction ? [nextAction] : ['Editable in post-run review before saving.'],
    },
    {
      type: 'source_context',
      label: 'Source context',
      ready: Boolean(proposals.sourceContext),
      evidence: proposals.sourceContext ? [proposals.sourceContext.title] : [],
    },
    {
      type: 'artifact',
      label: 'Artifact',
      ready: Boolean(proposals.artifact),
      evidence: proposals.artifact ? [proposals.artifact.title] : [],
    },
    {
      type: 'decision',
      label: 'Decision',
      ready: Boolean(decisionReady),
      evidence: decisionReady && proposals.structured ? [proposals.structured.title] : [],
    },
    {
      type: 'proposed_sop_revision',
      label: 'Proposed SOP revision',
      ready: false,
      evidence: ['Editable in post-run review before saving.'],
    },
  ];

  return {
    businessLineId,
    sourceActionId: params.run.taskId,
    sourceRunId: params.run.id,
    resultSummary,
    evidenceItems: [
      `Run ${params.run.id} completed for task ${params.run.taskId}.`,
      `Output chars: ${output.length}.`,
      ...writebackOptions
        .filter((option) => option.ready)
        .map((option) => `${option.label}: ${option.evidence.join(' / ')}`),
    ],
    recordSuggestions: [{
      type: 'result',
      source: `run:${params.run.id}`,
      summary: resultSummary,
      confidence: 75,
      shouldAffectFutureContext: true,
    }],
    nextActionSuggestions: nextAction ? [nextAction] : [],
    skillUpdateSuggestions: [],
    confidence: 75,
    requiresDecision: false,
    writebackOptions,
  };
}

function summarizeRunOutput(output: string): string {
  const normalized = output.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 360) return normalized;
  return `${normalized.slice(0, 357)}...`;
}
