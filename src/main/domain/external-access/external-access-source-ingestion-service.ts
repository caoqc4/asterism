import type { ConnectorSourceIngestionPlan } from '../../../shared/connector-source-ingestion.js';
import type {
  ExternalAccessSourceIngestionCommitInput,
  ExternalAccessSourceIngestionCommitResult,
  ExternalAccessSourceIngestionPreview,
  ExternalAccessSourceIngestionPreviewInput,
} from '../../../shared/types/external-access-source-ingestion.js';
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

export class ExternalAccessSourceIngestionService {
  constructor(
    private readonly planner: ExternalAccessSourcePlanner,
    private readonly writer: ExternalAccessSourceContextWriter,
  ) {}

  async preview(input: ExternalAccessSourceIngestionPreviewInput): Promise<ExternalAccessSourceIngestionPreview> {
    const taskId = normalizeTaskId(input.taskId);
    const plans = await this.planner.planSourceIngestion({ taskId });

    return {
      taskId,
      plans,
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
    const plansById = new Map(plans.map((plan) => [plan.planId, plan]));
    const missingPlanIds = [...selectedPlanIds].filter((planId) => !plansById.has(planId));
    if (missingPlanIds.length > 0) {
      throw new Error(`External Access source ingestion plan not found: ${missingPlanIds.join(', ')}`);
    }

    const created: SourceContextRecord[] = [];
    const skippedPlanIds: string[] = [];
    for (const planId of selectedPlanIds) {
      const plan = plansById.get(planId);
      if (!plan || plan.decision === 'skip') {
        skippedPlanIds.push(planId);
        continue;
      }

      created.push(await this.writer.createSourceContext(plan.sourceContext));
    }

    return {
      taskId,
      created,
      skippedPlanIds,
    };
  }
}

function normalizeTaskId(taskId: string): string {
  const normalized = taskId.trim();
  if (!normalized) {
    throw new Error('External Access source ingestion requires taskId.');
  }
  return normalized;
}
