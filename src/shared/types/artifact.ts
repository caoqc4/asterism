export type ArtifactKind = 'run_output' | 'note' | 'patch' | 'browser_evidence';

export type ArtifactSourceType = 'run' | 'manual';

export type ArtifactRecord = {
  id: string;
  taskId: string;
  businessLineId?: string | null;
  sourceType: ArtifactSourceType;
  sourceId: string;
  kind: ArtifactKind;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateManualArtifactInput = {
  taskId: string;
  businessLineId?: string | null;
  title: string;
  content?: string;
  kind?: Extract<ArtifactKind, 'note'>;
};

export type UpdateArtifactInput = {
  id: string;
  title?: string;
  content?: string;
};
