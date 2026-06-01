export function getDependencyAgeDays(createdAt: string, nowIso: string = new Date().toISOString()): number | null {
  const created = new Date(createdAt);
  const now = new Date(nowIso);

  if (Number.isNaN(created.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  const createdUtc = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate());
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((nowUtc - createdUtc) / 86_400_000));
}

export function isStaleDependency(createdAt: string, nowIso?: string): boolean {
  const days = getDependencyAgeDays(createdAt, nowIso);
  return days !== null && days >= 7;
}

export function formatDependencyAgeLabel(createdAt: string, nowIso?: string): string {
  const days = getDependencyAgeDays(createdAt, nowIso);
  const dateLabel = createdAt.slice(0, 10);

  if (days === null) {
    return `depends since ${dateLabel}`;
  }

  if (days === 0) {
    return `depends since ${dateLabel} · 今天新增`;
  }

  return `depends since ${dateLabel} · 已依赖 ${days} 天`;
}

export function getDependencyAgeReason(createdAt: string, audience: 'task' | 'home', nowIso?: string): string | null {
  const days = getDependencyAgeDays(createdAt, nowIso);

  if (days === null) {
    return null;
  }

  if (days >= 7) {
    return audience === 'task'
      ? `这条依赖链已持续 ${days} 天，建议优先推动上游任务或重新判断是否解除依赖。`
      : `这条依赖链已持续 ${days} 天，值得优先升级处理。`;
  }

  if (days >= 1) {
    return `已依赖 ${days} 天。`;
  }

  return '这是今天新增的任务依赖。';
}
