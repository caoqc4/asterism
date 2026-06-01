export type LocalTaskFileKind = 'local_file' | 'local_folder';

export type LocalTaskFileRecord = {
  id: string;
  taskId: string;
  name: string;
  path: string;
  kind: LocalTaskFileKind;
  content: string;
  editable: boolean;
  updatedAt: string;
};

type TaskFileWorkspaceState = {
  files: Record<string, LocalTaskFileRecord[]>;
  contentOverrides: Record<string, string>;
};

const STORAGE_KEY = 'taskplane.taskFileWorkspace.v1';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParse(value: string | null): TaskFileWorkspaceState {
  if (!value) return { files: {}, contentOverrides: {} };
  try {
    const parsed = JSON.parse(value) as TaskFileWorkspaceState;
    return {
      files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
      contentOverrides: parsed.contentOverrides && typeof parsed.contentOverrides === 'object'
        ? parsed.contentOverrides
        : {},
    };
  } catch {
    return { files: {}, contentOverrides: {} };
  }
}

function loadState(): TaskFileWorkspaceState {
  if (!canUseLocalStorage()) return { files: {}, contentOverrides: {} };
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function saveState(state: TaskFileWorkspaceState): void {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadLocalTaskFiles(): Record<string, LocalTaskFileRecord[]> {
  return loadState().files;
}

export function loadTaskFileContentOverrides(): Record<string, string> {
  return loadState().contentOverrides;
}

export function createLocalTaskFile(params: {
  taskId: string;
  name: string;
  kind: LocalTaskFileKind;
  content?: string;
}): LocalTaskFileRecord {
  const state = loadState();
  const now = new Date().toISOString();
  const file: LocalTaskFileRecord = {
    id: `${params.taskId}:local:${Date.now()}`,
    taskId: params.taskId,
    name: params.name,
    path: params.name,
    kind: params.kind,
    content: params.content ?? '',
    editable: params.kind === 'local_file',
    updatedAt: now,
  };
  state.files[params.taskId] = [file, ...(state.files[params.taskId] ?? [])];
  saveState(state);
  return file;
}

export function updateLocalTaskFile(
  taskId: string,
  fileId: string,
  patch: Partial<Pick<LocalTaskFileRecord, 'name' | 'path' | 'content'>>,
): LocalTaskFileRecord | null {
  const state = loadState();
  const files = state.files[taskId] ?? [];
  let updatedFile: LocalTaskFileRecord | null = null;
  state.files[taskId] = files.map((file) => {
    if (file.id !== fileId) return file;
    updatedFile = {
      ...file,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return updatedFile;
  });
  saveState(state);
  return updatedFile;
}

export function deleteLocalTaskFile(taskId: string, fileId: string): void {
  const state = loadState();
  state.files[taskId] = (state.files[taskId] ?? []).filter((file) => file.id !== fileId);
  saveState(state);
}

export function updateTaskFileContentOverride(fileId: string, content: string): void {
  const state = loadState();
  state.contentOverrides[fileId] = content;
  saveState(state);
}
