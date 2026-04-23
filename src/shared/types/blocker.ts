import type { ResponsibilityKind } from './responsibility.js';

export type BlockerKind =
  | 'external_person'
  | 'external_team'
  | 'approval'
  | 'document_or_material'
  | 'system_or_tool'
  | 'other';

export type BlockerStatus = 'active' | 'resolved';

export type BlockerRecord = {
  id: string;
  taskId: string;
  title: string;
  kind: BlockerKind;
  detail: string | null;
  owner: string | null;
  responsibility: ResponsibilityKind | null;
  responsibilityLabel: string | null;
  sourceContextId: string | null;
  status: BlockerStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type CreateBlockerInput = {
  taskId: string;
  title: string;
  kind: BlockerKind;
  detail?: string | null;
  owner?: string | null;
  responsibility?: ResponsibilityKind | null;
  responsibilityLabel?: string | null;
  sourceContextId?: string | null;
};

export type UpdateBlockerInput = {
  id: string;
  title?: string;
  kind?: BlockerKind;
  detail?: string | null;
  owner?: string | null;
  responsibility?: ResponsibilityKind | null;
  responsibilityLabel?: string | null;
  sourceContextId?: string | null;
};
