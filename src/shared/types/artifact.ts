export type ArtifactKind = 'run_output' | 'note' | 'patch';

export type ArtifactSourceType = 'run';

export type ArtifactRecord = {
  id: string;
  taskId: string;
  sourceType: ArtifactSourceType;
  sourceId: string;
  kind: ArtifactKind;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};
