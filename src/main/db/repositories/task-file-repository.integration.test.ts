import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { TaskFileRepository } from './task-file-repository.js';
import { TaskRepository } from './task-repository.js';

describe('TaskFileRepository integration', () => {
  let tempRoot = '';
  let taskRepository: TaskRepository;
  let taskFileRepository: TaskFileRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-task-file-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    taskRepository = new TaskRepository();
    taskFileRepository = new TaskFileRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates, updates, lists, and deletes task files', async () => {
    const task = await taskRepository.create({ title: 'Persist task files' });

    const file = await taskFileRepository.create({
      taskId: task.id,
      name: 'notes.md',
      kind: 'file',
      content: '# Notes',
    });
    const folder = await taskFileRepository.create({
      taskId: task.id,
      name: 'drafts',
      kind: 'folder',
      content: '# ignored',
    });
    const taskRecord = await taskFileRepository.create({
      taskId: task.id,
      name: 'task-notes.md',
      path: 'Task.md',
      kind: 'file',
      content: '# Task',
    });

    expect(folder.path).toBe('drafts/');
    expect(folder.content).toBe('');
    expect(taskRecord.name).toBe('Task.md');
    expect(taskRecord.path).toBe('Task.md');

    const updated = await taskFileRepository.update({
      id: file.id,
      name: 'notes-final.md',
      path: 'notes-final.md',
      content: '# Final',
    });

    expect(updated.name).toBe('notes-final.md');
    expect(updated.content).toBe('# Final');
    expect(await taskFileRepository.listForTask(task.id)).toHaveLength(3);

    const deleted = await taskFileRepository.delete(file.id);
    expect(deleted.id).toBe(file.id);
    expect((await taskFileRepository.listForTask(task.id)).map((item) => item.id).sort()).toEqual([folder.id, taskRecord.id].sort());
  });
});
