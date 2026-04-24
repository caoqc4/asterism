export function normalizeValue(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}
