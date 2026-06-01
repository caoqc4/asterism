import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { TaskDependencyRepository } from './task-dependency-repository.js';
import { TaskRepository } from './task-repository.js';

describe('TaskDependencyRepository integration', () => {
  let tempRoot = '';
  let taskRepository: TaskRepository;
  let taskDependencyRepository: TaskDependencyRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-task-dependency-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    taskRepository = new TaskRepository();
    taskDependencyRepository = new TaskDependencyRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates, updates, and resolves a single active dependency for a task', async () => {
    const blockedTask = await taskRepository.create({ title: 'Draft outreach email' });
    const upstreamTask = await taskRepository.create({ title: 'Publish partner list' });

    const created = await taskDependencyRepository.create({
      taskId: blockedTask.id,
      blockedByTaskId: upstreamTask.id,
      reason: 'Need the final partner list before drafting outreach.',
    });

    const updated = await taskDependencyRepository.update({
      id: created.id,
      reason: 'Need the approved partner list before drafting outreach.',
    });

    const fetched = await taskDependencyRepository.get(created.id);
    const activeBeforeResolve = await taskDependencyRepository.getActiveForTask(blockedTask.id);
    const resolved = await taskDependencyRepository.resolve(created.id);
    const activeAfterResolve = await taskDependencyRepository.getActiveForTask(blockedTask.id);

    expect(created.status).toBe('active');
    expect(created.blockedByTaskTitle).toBe('Publish partner list');
    expect(updated.reason).toBe('Need the approved partner list before drafting outreach.');
    expect(fetched?.id).toBe(created.id);
    expect(activeBeforeResolve?.id).toBe(created.id);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).toBeTruthy();
    expect(activeAfterResolve).toBeNull();
  });

  it('returns an empty list for empty bulk task lookups', async () => {
    await expect(taskDependencyRepository.listActiveForTasks([])).resolves.toEqual([]);
  });
});
