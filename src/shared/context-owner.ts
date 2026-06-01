export type ContextOwner =
  | { kind: 'global' }
  | { kind: 'business_line'; businessLineId: string }
  | { kind: 'next_action'; businessLineId: string; actionId: string; taskId?: string | null }
  | { kind: 'legacy_task'; taskId: string; businessLineId?: string | null };

export type ContextOwnerKind = ContextOwner['kind'];

export function contextOwnerFromTaskContext(params: {
  businessLineId?: string | null;
  taskId?: string | null;
}): ContextOwner {
  const businessLineId = cleanId(params.businessLineId);
  const taskId = cleanId(params.taskId);
  if (businessLineId && taskId) {
    return {
      actionId: taskId,
      businessLineId,
      kind: 'next_action',
      taskId,
    };
  }
  if (businessLineId) {
    return { businessLineId, kind: 'business_line' };
  }
  if (taskId) {
    return { kind: 'legacy_task', taskId };
  }
  return { kind: 'global' };
}

export function contextOwnerHasBusinessLine(owner: ContextOwner): boolean {
  return owner.kind === 'business_line'
    || owner.kind === 'next_action'
    || Boolean(owner.kind === 'legacy_task' && owner.businessLineId);
}

export function contextOwnerHasTaskCarrier(owner: ContextOwner): boolean {
  return owner.kind === 'next_action' || owner.kind === 'legacy_task';
}

export function contextOwnerTaskId(owner: ContextOwner): string | null {
  if (owner.kind === 'next_action') return owner.taskId ?? null;
  if (owner.kind === 'legacy_task') return owner.taskId;
  return null;
}

export function contextOwnerBusinessLineId(owner: ContextOwner): string | null {
  if (owner.kind === 'business_line' || owner.kind === 'next_action') return owner.businessLineId;
  if (owner.kind === 'legacy_task') return owner.businessLineId ?? null;
  return null;
}

export function formatContextOwnerForSummary(owner: ContextOwner): string {
  switch (owner.kind) {
    case 'global':
      return 'global';
    case 'business_line':
      return `business_line:${owner.businessLineId}`;
    case 'next_action':
      return [
        `next_action:${owner.businessLineId}`,
        `action=${owner.actionId}`,
        owner.taskId ? `task=${owner.taskId}` : null,
      ].filter(Boolean).join(':');
    case 'legacy_task':
      return [
        `legacy_task:${owner.taskId}`,
        owner.businessLineId ? `business=${owner.businessLineId}` : null,
      ].filter(Boolean).join(':');
  }
}

function cleanId(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
