export function getBlockerAgeDays(createdAt: string, nowIso: string = new Date().toISOString()): number | null {
  const created = new Date(createdAt);
  const now = new Date(nowIso);

  if (Number.isNaN(created.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  const createdUtc = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate());
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((nowUtc - createdUtc) / 86_400_000));
}

export function formatBlockerAgeLabel(createdAt: string, nowIso?: string): string {
  const days = getBlockerAgeDays(createdAt, nowIso);
  const dateLabel = createdAt.slice(0, 10);

  if (days === null) {
    return `blocked since ${dateLabel}`;
  }

  if (days === 0) {
    return `blocked since ${dateLabel} · 今天新增`;
  }

  return `blocked since ${dateLabel} · 已阻塞 ${days} 天`;
}

export function getBlockerAgeReason(createdAt: string, audience: 'task' | 'home', nowIso?: string): string | null {
  const days = getBlockerAgeDays(createdAt, nowIso);

  if (days === null) {
    return null;
  }

  if (days >= 7) {
    return audience === 'task' ? `已阻塞 ${days} 天，建议优先解除。` : `已阻塞 ${days} 天。`;
  }

  if (days >= 1) {
    return `已阻塞 ${days} 天。`;
  }

  return audience === 'task' ? '这是今天新增的阻塞项。' : '这是今天新增的阻塞项。';
}
