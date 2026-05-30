import type { ConnectorSourceIngestionPlan } from '../../../shared/connector-source-ingestion.js';
import type {
  ExternalAccessBusinessLineRecordCandidate,
  ExternalAccessSourceIngestionCommitInput,
  ExternalAccessSourceIngestionCommitResult,
  ExternalAccessSourceIngestionPreview,
  ExternalAccessSourceIngestionPreviewInput,
} from '../../../shared/types/external-access-source-ingestion.js';
import type { BusinessLineRecord } from '../../../shared/types/business-line.js';
import type {
  CreateSourceContextInput,
  SourceContextRecord,
} from '../../../shared/types/source-context.js';

export type ExternalAccessSourcePlanner = {
  planSourceIngestion(input: { taskId: string }): Promise<ConnectorSourceIngestionPlan[]>;
};

export type ExternalAccessSourceContextWriter = {
  createSourceContext(input: CreateSourceContextInput): Promise<SourceContextRecord>;
};

export type ExternalAccessTaskMemoryReader = {
  getDetail(taskId: string): Promise<{ sourceContexts: SourceContextRecord[] } | null>;
};

export type ExternalAccessBusinessLineResolver = {
  resolveBusinessLineForTask(taskId: string): Promise<string | null>;
};

export type ExternalAccessBusinessLineRecordWriter = {
  createRecord(input: {
    businessLineId: string;
    type: 'signal';
    source: string;
    summary: string;
    confidence: number;
    linkedActionId: string | null;
    shouldAffectFutureContext: false;
  }): Promise<BusinessLineRecord>;
};

export class ExternalAccessSourceIngestionService {
  constructor(
    private readonly planner: ExternalAccessSourcePlanner,
    private readonly writer: ExternalAccessSourceContextWriter,
    private readonly taskMemoryReader: ExternalAccessTaskMemoryReader | null = null,
    private readonly businessLineResolver: ExternalAccessBusinessLineResolver | null = null,
    private readonly businessLineRecordWriter: ExternalAccessBusinessLineRecordWriter | null = null,
  ) {}

  async preview(input: ExternalAccessSourceIngestionPreviewInput): Promise<ExternalAccessSourceIngestionPreview> {
    const taskId = normalizeTaskId(input.taskId);
    const plans = await this.planner.planSourceIngestion({ taskId });
    assertPlansBelongToTask(taskId, plans);
    const businessLineId = await this.resolveBusinessLineId(taskId, input.businessLineId);

    return {
      taskId,
      businessLineId,
      plans,
      businessLineRecordCandidates: businessLineId
        ? plans
          .filter((plan) => plan.decision !== 'skip')
          .map((plan) => businessLineRecordCandidateFromPlan(businessLineId, plan))
        : [],
      createCount: plans.filter((plan) => plan.decision === 'create').length,
      reviewCount: plans.filter((plan) => plan.decision === 'review').length,
      skipCount: plans.filter((plan) => plan.decision === 'skip').length,
    };
  }

  async commit(input: ExternalAccessSourceIngestionCommitInput): Promise<ExternalAccessSourceIngestionCommitResult> {
    const taskId = normalizeTaskId(input.taskId);
    if (!input.confirmed) {
      throw new Error('External Access source ingestion requires explicit confirmation.');
    }

    const selectedPlanIds = new Set(input.planIds.map((planId) => planId.trim()).filter(Boolean));
    if (selectedPlanIds.size === 0) {
      throw new Error('External Access source ingestion requires at least one selected plan.');
    }

    const plans = await this.planner.planSourceIngestion({ taskId });
    assertPlansBelongToTask(taskId, plans);
    const businessLineId = await this.resolveBusinessLineId(taskId, input.businessLineId);
    const plansById = new Map(plans.map((plan) => [plan.planId, plan]));
    const existingBatchIds = await this.readExistingBatchIds(taskId);
    const missingPlanIds = [...selectedPlanIds].filter((planId) => !plansById.has(planId));
    if (missingPlanIds.length > 0) {
      throw new Error(`External Access source ingestion plan not found: ${missingPlanIds.join(', ')}`);
    }

    const created: SourceContextRecord[] = [];
    const createdBusinessRecords: BusinessLineRecord[] = [];
    const skippedPlanIds: string[] = [];
    for (const planId of selectedPlanIds) {
      const plan = plansById.get(planId);
      if (!plan || plan.decision === 'skip') {
        skippedPlanIds.push(planId);
        continue;
      }
      if (plan.sourceContext.batchId && existingBatchIds.has(plan.sourceContext.batchId)) {
        skippedPlanIds.push(planId);
        continue;
      }

      created.push(await this.writer.createSourceContext(businessLineId
        ? { ...plan.sourceContext, businessLineId }
        : plan.sourceContext));
      if (businessLineId && this.businessLineRecordWriter) {
        const candidate = businessLineRecordCandidateFromPlan(businessLineId, plan);
        createdBusinessRecords.push(await this.businessLineRecordWriter.createRecord({
          businessLineId,
          type: 'signal',
          source: `external_access:${plan.trace.connectorId}:reviewed_preview`,
          summary: candidate.summary,
          confidence: candidate.confidence,
          linkedActionId: taskId,
          shouldAffectFutureContext: false,
        }));
      }
      if (plan.sourceContext.batchId) {
        existingBatchIds.add(plan.sourceContext.batchId);
      }
    }

    return {
      taskId,
      businessLineId,
      created,
      createdBusinessRecords,
      skippedPlanIds,
    };
  }

  private async readExistingBatchIds(taskId: string): Promise<Set<string>> {
    if (!this.taskMemoryReader) return new Set();
    const detail = await this.taskMemoryReader.getDetail(taskId);
    return new Set(
      (detail?.sourceContexts ?? [])
        .map((source) => source.batchId)
        .filter((batchId): batchId is string => Boolean(batchId?.trim())),
    );
  }

  private async resolveBusinessLineId(taskId: string, requestedBusinessLineId?: string | null): Promise<string | null> {
    const normalized = requestedBusinessLineId?.trim();
    const resolved = await this.businessLineResolver?.resolveBusinessLineForTask(taskId) ?? null;
    if (!normalized) return resolved;
    if (resolved !== normalized) {
      throw new Error('External Access business-line target does not match the selected task ownership.');
    }
    return normalized;
  }
}

function normalizeTaskId(taskId: string): string {
  const normalized = taskId.trim();
  if (!normalized) {
    throw new Error('External Access source ingestion requires taskId.');
  }
  return normalized;
}

function businessLineRecordCandidateFromPlan(
  businessLineId: string,
  plan: ConnectorSourceIngestionPlan,
): ExternalAccessBusinessLineRecordCandidate {
  return {
    businessLineId,
    planId: plan.planId,
    sourceLabel: plan.trace.originLabel,
    summary: `External signal reviewed from ${plan.trace.originLabel}: ${plan.sourceContext.title}. ${plan.quality.summary}`,
    confidence: plan.sourceContext.credibility === 'verified' ? 80 : plan.decision === 'review' ? 55 : 65,
    shouldAffectFutureContext: false,
    reviewRequired: true,
  };
}

function assertPlansBelongToTask(taskId: string, plans: ConnectorSourceIngestionPlan[]): void {
  const mismatched = plans.filter((plan) => plan.sourceContext.taskId !== taskId);
  if (mismatched.length === 0) return;
  throw new Error(`External Access source ingestion plan task mismatch: ${mismatched.map((plan) => plan.planId).join(', ')}`);
}
