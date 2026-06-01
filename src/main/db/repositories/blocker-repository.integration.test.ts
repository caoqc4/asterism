import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { BlockerRepository } from './blocker-repository.js';
import { TaskRepository } from './task-repository.js';

describe('BlockerRepository integration', () => {
  let tempRoot = '';
  let taskRepository: TaskRepository;
  let blockerRepository: BlockerRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-blocker-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    taskRepository = new TaskRepository();
    blockerRepository = new BlockerRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates, updates, and resolves a single active blocker for a task', async () => {
    const task = await taskRepository.create({ title: 'Wait on legal approval' });

    const created = await blockerRepository.create({
      taskId: task.id,
      title: 'Legal approval pending',
      kind: 'approval',
      detail: 'Need sign-off before launch',
      owner: 'Legal',
    });

    const updated = await blockerRepository.update({
      id: created.id,
      detail: 'Need final sign-off before launch',
      sourceContextId: 'source_context_1',
    });

    const activeBeforeResolve = await blockerRepository.getActiveForTask(task.id);
    const resolved = await blockerRepository.resolve(created.id);
    const activeAfterResolve = await blockerRepository.getActiveForTask(task.id);

    expect(created.status).toBe('active');
    expect(updated.detail).toBe('Need final sign-off before launch');
    expect(updated.sourceContextId).toBe('source_context_1');
    expect(activeBeforeResolve?.id).toBe(created.id);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).toBeTruthy();
    expect(activeAfterResolve).toBeNull();
  });

  it('returns an empty list for empty bulk task lookups', async () => {
    await expect(blockerRepository.listActiveForTasks([])).resolves.toEqual([]);
  });
});
