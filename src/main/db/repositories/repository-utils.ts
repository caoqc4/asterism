export function nowIso(): string {
  return new Date().toISOString();
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function normalizeValue(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}
