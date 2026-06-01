import type { TaskplaneBusinessLineWritebackProposal } from './taskplane-writeback-proposal.js';
import type { RunStatus } from './types/run.js';
import type { TaskRiskLevel } from './types/task.js';

export type BusinessLineRunControlKind = 'steering' | 'queue_next_action';

export type BusinessLineRunControlWriteKind =
  | 'business_record.create'
  | 'business_review.record'
  | 'business_next_action.create'
  | 'business_sop_revision.propose'
  | 'decision.create'
  | 'task.update_next_step'
  | 'task.complete.propose';

export type BusinessLineRunControlGate =
  | 'decision_required'
  | 'operator_confirmation'
  | 'run_correction_event'
  | 'taskplane_writeback_approval_queue';

export type BusinessLineRunCorrectionEvent = {
  businessLineId: string;
  correction: string;
  evidenceItems: string[];
  kind: 'business_line_run_correction';
  riskLevel: TaskRiskLevel | null;
  riskNote: string | null;
  runId: string;
  sourceActionId: string | null;
  writebackGate: 'run_correction_event';
};

export type BusinessLineRunQueuePolicy = {
  currentRunStatus: RunStatus | null;
  evidenceItems: string[];
  interruptCurrentRun: boolean;
  queuePosition: 'behind_current_run';
  requiredGate: 'taskplane_writeback_approval_queue';
  riskLevel: TaskRiskLevel | null;
  riskNote: string | null;
};

export type BusinessLineRunControlPlan =
  | {
      blockedReason: string;
      businessLineId: string | null;
      gate: BusinessLineRunControlGate;
      kind: BusinessLineRunControlKind;
      runId: string | null;
      status: 'blocked';
    }
  | {
      businessLineId: string;
      gate: BusinessLineRunControlGate;
      kind: 'steering';
      runCorrectionEvent: BusinessLineRunCorrectionEvent;
      runId: string;
      status: 'ready';
    }
  | {
      businessLineId: string;
      gate: BusinessLineRunControlGate;
      kind: 'queue_next_action';
      proposal: TaskplaneBusinessLineWritebackProposal;
      queuePolicy: BusinessLineRunQueuePolicy;
      runId: string;
      status: 'ready';
    };

export type BusinessLineRunControlInput = {
  businessLineId?: string | null;
  correction?: string | null;
  evidenceItems?: string[];
  evidenceRunId?: string | null;
  interruptCurrentRun?: boolean;
  kind: BusinessLineRunControlKind;
  nextActionNextStep?: string | null;
  nextActionSummary?: string | null;
  nextActionTitle?: string | null;
  operatorConfirmed?: boolean;
  requestedWriteKinds?: BusinessLineRunControlWriteKind[];
  requiresDecision?: boolean;
  riskLevel?: TaskRiskLevel | null;
  riskNote?: string | null;
  runId?: string | null;
  runStatus?: RunStatus | null;
  sourceActionId?: string | null;
};

const STEERING_DISALLOWED_SILENT_WRITES = new Set<BusinessLineRunControlWriteKind>([
  'business_sop_revision.propose',
  'decision.create',
]);

export function planBusinessLineRunControl(
  input: BusinessLineRunControlInput,
): BusinessLineRunControlPlan {
  const businessLineId = input.businessLineId?.trim() || null;
  const runId = input.runId?.trim() || input.evidenceRunId?.trim() || null;
  if (!businessLineId) {
    return blocked(input, 'Business-line run control requires a resolved business-line owner.', 'operator_confirmation');
  }
  if (!runId) {
    return blocked(input, 'Business-line run control requires run evidence.', 'operator_confirmation');
  }

  if (input.kind === 'steering') {
    return planSteering({ ...input, businessLineId, runId });
  }

  return planQueueing({ ...input, businessLineId, runId });
}

function planSteering(
  input: BusinessLineRunControlInput & { businessLineId: string; runId: string },
): BusinessLineRunControlPlan {
  const correction = input.correction?.trim() || '';
  if (!correction) {
    return blocked(input, 'Steering requires a bounded correction for the current run.', 'operator_confirmation');
  }
  const disallowedWrite = input.requestedWriteKinds?.find((kind) =>
    STEERING_DISALLOWED_SILENT_WRITES.has(kind));
  if (disallowedWrite) {
    return blocked(
      input,
      `Steering cannot silently apply ${disallowedWrite}; route it through a proposal or Decision gate.`,
      disallowedWrite === 'decision.create' ? 'decision_required' : 'taskplane_writeback_approval_queue',
    );
  }

  return {
    businessLineId: input.businessLineId,
    gate: 'run_correction_event',
    kind: 'steering',
    runCorrectionEvent: {
      businessLineId: input.businessLineId,
      correction,
      evidenceItems: normalizeEvidenceItems(input.evidenceItems, input.runId),
      kind: 'business_line_run_correction',
      riskLevel: input.riskLevel ?? null,
      riskNote: input.riskNote?.trim() || null,
      runId: input.runId,
      sourceActionId: input.sourceActionId?.trim() || null,
      writebackGate: 'run_correction_event',
    },
    runId: input.runId,
    status: 'ready',
  };
}

function planQueueing(
  input: BusinessLineRunControlInput & { businessLineId: string; runId: string },
): BusinessLineRunControlPlan {
  const title = input.nextActionTitle?.trim() || '';
  if (!title) {
    return blocked(input, 'Queued Next Action requires a title.', 'operator_confirmation');
  }
  if (input.requiresDecision) {
    return blocked(input, 'Queued Next Action is decision-bound and must go through a Decision gate.', 'decision_required');
  }
  const interruptCurrentRun = input.interruptCurrentRun === true;
  if (interruptCurrentRun) {
    return blocked(input, 'Queueing keeps follow-up work behind the current run; interruption requires a separate run transition.', 'operator_confirmation');
  }

  const evidenceItems = normalizeEvidenceItems(input.evidenceItems, input.runId);
  const queuePolicy: BusinessLineRunQueuePolicy = {
    currentRunStatus: input.runStatus ?? null,
    evidenceItems,
    interruptCurrentRun,
    queuePosition: 'behind_current_run',
    requiredGate: 'taskplane_writeback_approval_queue',
    riskLevel: input.riskLevel ?? null,
    riskNote: input.riskNote?.trim() || null,
  };
  const detail = [
    input.nextActionSummary?.trim() || input.nextActionNextStep?.trim() || title,
    'Queue position: behind current run.',
    input.riskLevel ? `Risk: ${input.riskLevel}${input.riskNote ? ` - ${input.riskNote.trim()}` : ''}` : null,
    evidenceItems.length > 0 ? `Evidence: ${evidenceItems.join(', ')}` : null,
  ].filter(Boolean).join('\n');
  return {
    businessLineId: input.businessLineId,
    gate: 'taskplane_writeback_approval_queue',
    kind: 'queue_next_action',
    proposal: {
      businessLineId: input.businessLineId,
      detail,
      evidenceRunId: input.evidenceRunId?.trim() || input.runId,
      intent: {
        businessLineId: input.businessLineId,
        evidenceRunId: input.evidenceRunId?.trim() || input.runId,
        nextStep: input.nextActionNextStep?.trim() || title,
        sourceActionId: input.sourceActionId?.trim() || null,
        summary: input.nextActionSummary?.trim() || 'Queued behind the current business-line run.',
        title,
        type: 'business_next_action.create',
      },
      title: `排队业务线 Next Action：${title}`,
    },
    queuePolicy,
    runId: input.runId,
    status: 'ready',
  };
}

function blocked(
  input: BusinessLineRunControlInput,
  blockedReason: string,
  gate: BusinessLineRunControlGate,
): BusinessLineRunControlPlan {
  return {
    blockedReason,
    businessLineId: input.businessLineId?.trim() || null,
    gate,
    kind: input.kind,
    runId: input.runId?.trim() || input.evidenceRunId?.trim() || null,
    status: 'blocked',
  };
}

function normalizeEvidenceItems(evidenceItems: string[] | undefined, runId: string): string[] {
  const normalized = (evidenceItems ?? []).map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : [`run:${runId}`];
}
