import {
  buildWorkHabitStorageSnapshot,
  createManualWorkHabitInList,
  deleteWorkHabitFromList,
  recordCompletionOverrideLearningSignalInList,
  recordSopTemplateHabitInList,
  resolveWorkHabitConflictInList,
  SEED_WORK_HABITS,
  updateWorkHabitInList,
} from '../../../shared/work-habit-rules.js';
import type {
  CompletionOverrideLearningSignalInput,
  CreateManualWorkHabitInput,
  ResolveWorkHabitConflictInput,
  SopTemplateHabitInput,
  UpdateWorkHabitInput,
  WorkHabitRecord,
  WorkHabitStorageSnapshot,
} from '../../../shared/types/work-habit.js';
import type { WorkHabitRepository } from '../../db/repositories/work-habit-repository.js';

export class WorkHabitService {
  constructor(private readonly repository: WorkHabitRepository) {}

  async getSnapshot(): Promise<WorkHabitStorageSnapshot> {
    const habits = await this.ensureSeeded();
    return buildWorkHabitStorageSnapshot(habits);
  }

  async update(input: UpdateWorkHabitInput): Promise<WorkHabitRecord[]> {
    return this.replace(updateWorkHabitInList(await this.ensureSeeded(), input));
  }

  async delete(id: string): Promise<WorkHabitRecord[]> {
    return this.replace(deleteWorkHabitFromList(await this.ensureSeeded(), id));
  }

  async createManual(input: CreateManualWorkHabitInput): Promise<WorkHabitRecord[]> {
    return this.replace(createManualWorkHabitInList(await this.ensureSeeded(), input));
  }

  async resolveConflict(input: ResolveWorkHabitConflictInput): Promise<WorkHabitRecord[]> {
    return this.replace(resolveWorkHabitConflictInList(await this.ensureSeeded(), input));
  }

  async recordCompletionOverride(input: CompletionOverrideLearningSignalInput): Promise<WorkHabitRecord[]> {
    return this.replace(recordCompletionOverrideLearningSignalInList(await this.ensureSeeded(), input));
  }

  async recordSopTemplate(input: SopTemplateHabitInput): Promise<WorkHabitRecord[]> {
    return this.replace(recordSopTemplateHabitInList(await this.ensureSeeded(), input));
  }

  private async ensureSeeded(): Promise<WorkHabitRecord[]> {
    const existing = await this.repository.list();
    if (existing.length) return existing;
    return this.repository.replaceAll(SEED_WORK_HABITS);
  }

  private async replace(habits: WorkHabitRecord[]): Promise<WorkHabitRecord[]> {
    return this.repository.replaceAll(habits);
  }
}
