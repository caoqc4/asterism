import type { BusinessLineOwnershipResolution, BusinessLineOwnershipSource } from './types/business-line.js';
import type { RunRequestSurface, RunScope, RunScopeKind } from './types/run.js';
import type { TaskExecutionType } from './types/task.js';

export type ClassifyRunScopeInput = {
  businessLineId?: string | null;
  ownership?: BusinessLineOwnershipResolution | null;
  requestedScopeKind?: RunScopeKind | null;
  requestSurface?: RunRequestSurface | null;
  taskBusinessLineId?: string | null;
  taskFacets?: TaskExecutionType[] | null;
  taskId?: string | null;
  taskType?: TaskExecutionType | null;
};

export function classifyRunScope(input: ClassifyRunScopeInput): RunScope {
  const businessLineId = normalizeId(input.businessLineId);
  const taskId = normalizeId(input.taskId);
  const taskBusinessLineId = normalizeId(input.taskBusinessLineId);
  const ownership = input.ownership?.status === 'resolved' ? input.ownership : null;
  const legacyBusinessLineOwner = Boolean(ownership?.legacy);
  const kind = input.requestedScopeKind ?? inferRunScopeKind({
    businessLineId,
    legacyBusinessLineOwner,
    ownershipSource: ownership?.source ?? null,
    requestSurface: input.requestSurface,
    taskBusinessLineId,
    taskFacets: input.taskFacets,
    taskId,
    taskType: input.taskType,
  });

  return {
    kind,
    businessLineId,
    taskId,
    ownershipSource: ownership?.source ?? 'none',
    legacyBusinessLineOwner,
    businessLineContextPack: businessLineId ? 'included' : 'not_applicable',
    taskExecutionMemory: taskId ? 'included' : 'not_applicable',
    durableBusinessReview: isDurableBusinessReviewEligible(kind, businessLineId)
      ? 'eligible'
      : 'not_applicable',
  };
}

export function runScopeRequiresBusinessLine(kind: RunScopeKind): boolean {
  return kind === 'business_line_chat'
    || kind === 'next_action_execution'
    || kind === 'scheduler_loop_carrier'
    || kind === 'legacy_task_recovery';
}

function inferRunScopeKind(input: {
  businessLineId: string | null;
  legacyBusinessLineOwner: boolean;
  ownershipSource: BusinessLineOwnershipSource | null;
  requestSurface?: RunRequestSurface | null;
  taskBusinessLineId: string | null;
  taskFacets?: TaskExecutionType[] | null;
  taskId: string | null;
  taskType?: TaskExecutionType | null;
}): RunScopeKind {
  if (input.businessLineId && input.taskId && isSchedulerCarrier(input)) return 'scheduler_loop_carrier';
  if (input.businessLineId && input.taskId && isLegacyTaskRecoveryCarrier(input)) return 'legacy_task_recovery';
  if (input.businessLineId && input.taskId) return 'next_action_execution';
  if (input.businessLineId) return 'business_line_chat';
  if (!input.taskId) return 'global_chat';
  return 'one_off_non_durable_action';
}

function isLegacyTaskRecoveryCarrier(input: {
  legacyBusinessLineOwner: boolean;
  ownershipSource: BusinessLineOwnershipSource | null;
  taskBusinessLineId: string | null;
}): boolean {
  if (!input.legacyBusinessLineOwner || input.taskBusinessLineId) return false;
  return input.ownershipSource === 'legacy_task'
    || input.ownershipSource === 'task_parent'
    || input.ownershipSource === 'run_task'
    || input.ownershipSource === 'source_context_task'
    || input.ownershipSource === 'artifact_task'
    || input.ownershipSource === 'task_file_task'
    || input.ownershipSource === 'explicit'
    || input.ownershipSource === 'run';
}

function isSchedulerCarrier(input: {
  requestSurface?: RunRequestSurface | null;
  taskFacets?: TaskExecutionType[] | null;
  taskType?: TaskExecutionType | null;
}): boolean {
  const automationTypes = new Set<TaskExecutionType>(['scheduled', 'event', 'routine']);
  return automationTypes.has(input.taskType ?? 'simple')
    || (input.taskFacets ?? []).some((facet) => automationTypes.has(facet))
    || input.requestSurface === 'scheduled_event_agent_trigger';
}

function isDurableBusinessReviewEligible(kind: RunScopeKind, businessLineId: string | null): boolean {
  return Boolean(businessLineId)
    && kind !== 'global_chat'
    && kind !== 'one_off_non_durable_action';
}

function normalizeId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
