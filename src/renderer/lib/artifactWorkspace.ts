import type { ArtifactRecord, ArtifactKind } from '@shared/types/artifact';

type ArtifactOverride = {
  title?: string;
  content?: string;
  deleted?: boolean;
  updatedAt: string;
};

type ArtifactWorkspaceState = {
  additions: Record<string, ArtifactRecord[]>;
  overrides: Record<string, ArtifactOverride>;
};

const STORAGE_KEY = 'taskplane.artifactWorkspace.v1';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParse(value: string | null): ArtifactWorkspaceState {
  if (!value) return { additions: {}, overrides: {} };
  try {
    const parsed = JSON.parse(value) as ArtifactWorkspaceState;
    return {
      additions: parsed.additions && typeof parsed.additions === 'object' ? parsed.additions : {},
      overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
    };
  } catch {
    return { additions: {}, overrides: {} };
  }
}

function loadState(): ArtifactWorkspaceState {
  if (!canUseLocalStorage()) return { additions: {}, overrides: {} };
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function saveState(state: ArtifactWorkspaceState): void {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function mergeTaskArtifacts(taskId: string, artifacts: ArtifactRecord[]): ArtifactRecord[] {
  const state = loadState();
  const additions = state.additions[taskId] ?? [];
  return [...additions, ...artifacts]
    .map((artifact) => {
      const override = state.overrides[artifact.id];
      if (!override) return artifact;
      return {
        ...artifact,
        title: override.title ?? artifact.title,
        content: override.content ?? artifact.content,
        updatedAt: override.updatedAt,
      };
    })
    .filter((artifact) => !state.overrides[artifact.id]?.deleted)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createManualArtifact(params: {
  taskId: string;
  title: string;
  content: string;
  kind?: ArtifactKind;
}): ArtifactRecord {
  const state = loadState();
  const now = new Date().toISOString();
  const artifact: ArtifactRecord = {
    id: `local_artifact_${Date.now()}`,
    taskId: params.taskId,
    sourceType: 'run',
    sourceId: 'manual',
    kind: params.kind ?? 'note',
    title: params.title.trim(),
    content: params.content,
    createdAt: now,
    updatedAt: now,
  };
  state.additions[params.taskId] = [artifact, ...(state.additions[params.taskId] ?? [])];
  saveState(state);
  return artifact;
}

export function updateArtifactWorkspace(
  artifactId: string,
  patch: Pick<ArtifactOverride, 'title' | 'content'>,
): void {
  const state = loadState();
  state.overrides[artifactId] = {
    ...state.overrides[artifactId],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  saveState(state);
}

export function deleteArtifactWorkspace(artifactId: string): void {
  const state = loadState();
  state.overrides[artifactId] = {
    ...state.overrides[artifactId],
    deleted: true,
    updatedAt: new Date().toISOString(),
  };
  saveState(state);
}

export function isInlineEditableArtifact(artifact: ArtifactRecord): boolean {
  const title = artifact.title.toLowerCase();
  return artifact.kind === 'note' || title.endsWith('.md') || title.endsWith('.txt');
}
