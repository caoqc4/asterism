import {
  buildWorkHabitStorageSnapshot,
  createManualWorkHabitInList,
  deleteWorkHabitFromList,
  describeWorkHabitStorageBoundary,
  findWorkHabitConflict as findWorkHabitConflictInList,
  recordCompletionOverrideLearningSignalInList,
  recordWorkHabitApplicationsInList,
  recordSopTemplateHabitInList,
  resolveWorkHabitConflictInList,
  selectApplicableWorkHabitMatches as selectApplicableWorkHabitMatchesFromList,
  selectApplicableWorkHabits as selectApplicableWorkHabitsFromList,
  SEED_WORK_HABITS,
  summarizeWorkHabitMatchesForPrompt,
  summarizeWorkHabitsForPrompt,
  updateWorkHabitInList,
} from '@shared/work-habit-rules';
import type {
  CreateManualWorkHabitInput,
  SopTemplateHabitInput,
  WorkHabitRecord,
  WorkHabitScope,
  WorkHabitSource,
  WorkHabitStatus,
  WorkHabitStorageSnapshot,
} from '@shared/types/work-habit';

export type {
  WorkHabitRecord,
  WorkHabitScope,
  WorkHabitSource,
  WorkHabitStatus,
  WorkHabitStorageSnapshot,
} from '@shared/types/work-habit';

const STORAGE_KEY = 'taskplane.workHabits.v1';
const MIGRATION_KEY = 'taskplane.workHabits.mainDbMigration.v1';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParseSnapshot(value: string | null): WorkHabitStorageSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { habits?: WorkHabitRecord[] } | WorkHabitRecord[];
    if (Array.isArray(parsed)) return buildWorkHabitStorageSnapshot(parsed);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.habits)) {
      return buildWorkHabitStorageSnapshot(parsed.habits);
    }
    return null;
  } catch {
    return null;
  }
}

export function readLegacyWorkHabitStorageSnapshot(): WorkHabitStorageSnapshot | null {
  if (!canUseLocalStorage()) return null;
  return safeParseSnapshot(window.localStorage.getItem(STORAGE_KEY));
}

export async function getPersistedWorkHabitStorageSnapshot(): Promise<WorkHabitStorageSnapshot> {
  if (!window.api?.getWorkHabitSnapshot) return getWorkHabitStorageSnapshot();

  const snapshot = await window.api.getWorkHabitSnapshot();
  const legacy = readLegacyWorkHabitStorageSnapshot();
  const alreadyMigrated = canUseLocalStorage() && window.localStorage.getItem(MIGRATION_KEY) === 'done';

  if (!legacy || alreadyMigrated || !window.api.importLegacyWorkHabits) {
    return snapshot;
  }

  const imported = await window.api.importLegacyWorkHabits({ habits: legacy.habits });
  window.localStorage.setItem(MIGRATION_KEY, 'done');
  return imported;
}

export function getWorkHabitStorageSnapshot(): WorkHabitStorageSnapshot {
  if (!canUseLocalStorage()) return buildWorkHabitStorageSnapshot(SEED_WORK_HABITS);
  const stored = safeParseSnapshot(window.localStorage.getItem(STORAGE_KEY));
  if (stored) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return stored;
  }
  const seeded = buildWorkHabitStorageSnapshot(SEED_WORK_HABITS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

export function loadWorkHabits(): WorkHabitRecord[] {
  return getWorkHabitStorageSnapshot().habits;
}

export function saveWorkHabits(habits: WorkHabitRecord[]): void {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buildWorkHabitStorageSnapshot(habits)));
}

export { describeWorkHabitStorageBoundary, summarizeWorkHabitMatchesForPrompt, summarizeWorkHabitsForPrompt };

export function updateWorkHabit(
  id: string,
  patch: Partial<Pick<WorkHabitRecord, 'rule' | 'scopeLabel' | 'status'>>,
): WorkHabitRecord[] {
  const next = updateWorkHabitInList(loadWorkHabits(), { id, ...patch });
  saveWorkHabits(next);
  return next;
}

export function deleteWorkHabit(id: string): WorkHabitRecord[] {
  const next = deleteWorkHabitFromList(loadWorkHabits(), id);
  saveWorkHabits(next);
  return next;
}

export function createManualWorkHabit(params: CreateManualWorkHabitInput): WorkHabitRecord[] {
  const next = createManualWorkHabitInList(loadWorkHabits(), params);
  saveWorkHabits(next);
  return next;
}

export function resolveWorkHabitConflict(
  candidateId: string,
  decision: 'accept_candidate' | 'keep_confirmed',
): WorkHabitRecord[] {
  const next = resolveWorkHabitConflictInList(loadWorkHabits(), { candidateId, decision });
  saveWorkHabits(next);
  return next;
}

export function findWorkHabitConflict(
  candidate: WorkHabitRecord,
  habits: WorkHabitRecord[] = loadWorkHabits(),
) {
  return findWorkHabitConflictInList(candidate, habits);
}

export function recordCompletionOverrideLearningSignal(params: {
  taskId: string;
  taskTitle: string;
  reason: string;
  runVerificationTone?: 'pass' | 'warn' | 'fail' | 'pending' | null;
  runVerificationLabel?: string | null;
  runVerificationDetail?: string | null;
}): void {
  const next = recordCompletionOverrideLearningSignalInList(loadWorkHabits(), params);
  saveWorkHabits(next);
}

export function recordSopTemplateHabit(params: SopTemplateHabitInput): WorkHabitRecord[] {
  const next = recordSopTemplateHabitInList(loadWorkHabits(), params);
  saveWorkHabits(next);
  return next;
}

export function recordWorkHabitApplications(habitIds: string[]): WorkHabitRecord[] {
  const next = recordWorkHabitApplicationsInList(loadWorkHabits(), habitIds);
  saveWorkHabits(next);
  return next;
}

export function selectApplicableWorkHabits(params: {
  taskTitle?: string | null;
  taskTypeLabel?: string | null;
  projectLabel?: string | null;
  limit?: number;
} = {}): WorkHabitRecord[] {
  return selectApplicableWorkHabitsFromList(loadWorkHabits(), params);
}

export function selectApplicableWorkHabitMatches(params: {
  taskTitle?: string | null;
  taskTypeLabel?: string | null;
  projectLabel?: string | null;
  limit?: number;
} = {}) {
  return selectApplicableWorkHabitMatchesFromList(loadWorkHabits(), params);
}
