import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { TaskRepository } from './task-repository.js';
import { WaitingItemRepository } from './waiting-item-repository.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-waiting-item-repo-'));
}

describe('WaitingItemRepository integration', () => {
  let tempRoot = '';
  let taskRepository: TaskRepository;
  let waitingItemRepository: WaitingItemRepository;

  beforeEach(() => {
    tempRoot = makeTempDir();
    setDatabaseUserDataPathForTests(tempRoot);
    taskRepository = new TaskRepository();
    waitingItemRepository = new WaitingItemRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('upserts a single active waiting item per task', async () => {
    const task = await taskRepository.create({ title: 'Wait for legal approval' });

    const first = await waitingItemRepository.upsertActive(task.id, 'Waiting for legal approval');
    const second = await waitingItemRepository.upsertActive(task.id, 'Waiting for revised contract');
    const active = await waitingItemRepository.getActiveForTask(task.id);

    expect(second.id).toBe(first.id);
    expect(active?.reason).toBe('Waiting for revised contract');
    expect(active?.status).toBe('active');
  });

  it('resolves the active waiting item for a task', async () => {
    const task = await taskRepository.create({ title: 'Wait for finance sign-off' });

    await waitingItemRepository.upsertActive(task.id, 'Waiting for finance sign-off');
    await waitingItemRepository.resolveActive(task.id);

    const active = await waitingItemRepository.getActiveForTask(task.id);

    expect(active).toBeNull();
  });
});
