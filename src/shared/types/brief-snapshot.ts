export type BriefSnapshotRecord = {
  id: string;
  kind: string;
  payload: string;
  source: 'ai' | 'fallback';
  fallbackReason: string | null;
  createdAt: string;
};
