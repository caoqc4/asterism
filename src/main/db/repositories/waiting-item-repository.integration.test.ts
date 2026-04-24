import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { TaskRepository } from './task-repository.js';
import { WaitingItemRepository } from './waiting-item-repository.js';

describe('WaitingItemRepository integration', () => {
  let tempRoot = '';
  let taskRepository: TaskRepository;
  let waitingItemRepository: WaitingItemRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-waiting-item-repo-');
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

    expect(first.action).toBe('created');
    expect(second.action).toBe('updated');
    expect(second.item.id).toBe(first.item.id);
    expect(active?.reason).toBe('Waiting for revised contract');
    expect(active?.status).toBe('active');
  });

  it('resolves the active waiting item for a task', async () => {
    const task = await taskRepository.create({ title: 'Wait for finance sign-off' });

    await waitingItemRepository.upsertActive(task.id, 'Waiting for finance sign-off');
    const resolved = await waitingItemRepository.resolveActive(task.id);

    const active = await waitingItemRepository.getActiveForTask(task.id);

    expect(resolved?.status).toBe('resolved');
    expect(resolved?.resolvedAt).toBeTruthy();
    expect(active).toBeNull();
  });
});
