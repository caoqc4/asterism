export type WaitingItemStatus = 'active' | 'resolved';

export type WaitingItemRecord = {
  id: string;
  taskId: string;
  reason: string;
  status: WaitingItemStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};
