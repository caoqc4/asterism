export const PANEL_CAPTURE_SUMMARY_PREFIX = '从右侧面板捕获：';

export function isUnconfirmedPanelCaptureRecord(record: {
  state: string;
  summary?: string | null;
}): boolean {
  return record.state === 'captured' && (record.summary ?? '').startsWith(PANEL_CAPTURE_SUMMARY_PREFIX);
}
