import type { ResponsibilityKind } from '../types/responsibility.js';

export function getResponsibilityKindLabel(kind: ResponsibilityKind | null | undefined): string {
  switch (kind) {
    case 'self':
      return '自己推进';
    case 'external_person':
      return '外部个人推进';
    case 'external_team':
      return '外部团队推进';
    case 'upstream_task':
      return '上游任务推进';
    case 'shared':
      return '共同推进';
    default:
      return '责任待明确';
  }
}

export function getResponsibilitySummary(params: {
  kind: ResponsibilityKind | null | undefined;
  label?: string | null;
  audience: 'task' | 'home';
  subject: 'blocker' | 'completion' | 'dependency';
}): string | null {
  const { kind, label, audience, subject } = params;
  const trimmedLabel = label?.trim() || null;

  if (subject === 'dependency') {
    if (trimmedLabel) {
      return audience === 'task'
        ? `推进责任：上游任务“${trimmedLabel}”`
        : `当前主要由上游任务“${trimmedLabel}”推进`;
    }

    return audience === 'task'
      ? `推进责任：上游任务链路`
      : '当前主要由上游任务链路推进';
  }

  if (!kind && !trimmedLabel) {
    return null;
  }

  if (subject === 'blocker') {
    if (trimmedLabel) {
      return audience === 'task'
        ? `解除责任：${trimmedLabel}`
        : `当前由 ${trimmedLabel} 推动解除`;
    }

    return audience === 'task'
      ? `解除责任：${getResponsibilityKindLabel(kind)}`
      : `当前由${getResponsibilityKindLabel(kind)}推动解除`;
  }

  if (trimmedLabel) {
    return audience === 'task'
      ? `确认责任：${trimmedLabel}`
      : `当前由 ${trimmedLabel} 负责确认`;
  }

  return audience === 'task'
    ? `确认责任：${getResponsibilityKindLabel(kind)}`
    : `当前由${getResponsibilityKindLabel(kind)}负责确认`;
}
