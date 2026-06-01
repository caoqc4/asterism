import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { WorkHabitRecord } from '../../../shared/types/work-habit.js';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { WorkHabitRepository } from './work-habit-repository.js';

describe('WorkHabitRepository integration', () => {
  let tempRoot = '';
  let repository: WorkHabitRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-work-habit-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    repository = new WorkHabitRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('replaces work habits through canonical fields only', async () => {
    const habits = await repository.replaceAll([habit()]);

    expect(habits).toHaveLength(1);
    expect(habits[0]).toMatchObject({
      id: 'habit_1',
      rule: '先做事实核对',
      status: 'confirmed',
    });
  });

  it('rejects non-canonical work habit write fields', async () => {
    await expect(repository.replaceAll([{
      ...habit(),
      legacyPreferenceBucket: 'localStorage',
    } as WorkHabitRecord])).rejects.toThrow(/legacyPreferenceBucket/);
  });
});

function habit(partial: Partial<WorkHabitRecord> = {}): WorkHabitRecord {
  return {
    id: 'habit_1',
    rule: '先做事实核对',
    source: 'manual',
    scope: 'global',
    scopeLabel: '全局',
    status: 'confirmed',
    examples: '发布前核对来源',
    createdAt: '2026-05-17T00:00:00.000Z',
    lastAppliedAt: null,
    applicationCount: 0,
    ...partial,
  };
}
