import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { SourceContextRepository } from './source-context-repository.js';
import { TaskRepository } from './task-repository.js';

describe('SourceContextRepository integration', () => {
  let tempRoot = '';
  let taskRepository: TaskRepository;
  let sourceContextRepository: SourceContextRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-source-context-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    taskRepository = new TaskRepository();
    sourceContextRepository = new SourceContextRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates, updates, and archives source context items for a task', async () => {
    const task = await taskRepository.create({ title: 'Build source context model' });

    const created = await sourceContextRepository.create({
      taskId: task.id,
      title: 'PRD',
      kind: 'doc',
      uri: 'https://example.com/prd',
      note: 'Primary design input',
    });

    const updated = await sourceContextRepository.update({
      id: created.id,
      isKey: true,
      note: 'Updated note',
      content: 'Key product assumptions',
    });

    const activeBeforeArchive = await sourceContextRepository.listActiveForTask(task.id);
    const archived = await sourceContextRepository.archive(created.id);
    const activeAfterArchive = await sourceContextRepository.listActiveForTask(task.id);

    expect(created.status).toBe('active');
    expect(created.isKey).toBe(false);
    expect(updated.isKey).toBe(true);
    expect(updated.note).toBe('Updated note');
    expect(updated.content).toBe('Key product assumptions');
    expect(activeBeforeArchive).toHaveLength(1);
    expect(activeBeforeArchive[0]?.id).toBe(created.id);
    expect(activeBeforeArchive[0]?.isKey).toBe(true);
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).toBeTruthy();
    expect(activeAfterArchive).toHaveLength(0);
  });

  it('lists key source context items before newer non-key items', async () => {
    const task = await taskRepository.create({ title: 'Prioritize key materials' });

    const nonKey = await sourceContextRepository.create({
      taskId: task.id,
      title: 'Fresh memo',
      kind: 'doc',
      note: 'Recently updated but not pinned',
    });

    const key = await sourceContextRepository.create({
      taskId: task.id,
      title: 'Pinned source',
      kind: 'doc',
      isKey: true,
      note: 'Most important source',
    });

    await sourceContextRepository.update({
      id: nonKey.id,
      note: 'Most recently touched non-key source',
    });

    const listed = await sourceContextRepository.listActiveForTask(task.id);

    expect(listed.map((item) => item.id)).toEqual([key.id, nonKey.id]);
    expect(listed[0]?.isKey).toBe(true);
    expect(listed[1]?.isKey).toBe(false);
  });
});
