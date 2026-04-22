import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { SourceContextRepository } from './source-context-repository.js';
import { TaskRepository } from './task-repository.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-source-context-repo-'));
}

describe('SourceContextRepository integration', () => {
  let tempRoot = '';
  let taskRepository: TaskRepository;
  let sourceContextRepository: SourceContextRepository;

  beforeEach(() => {
    tempRoot = makeTempDir();
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
      note: 'Updated note',
      content: 'Key product assumptions',
    });

    const activeBeforeArchive = await sourceContextRepository.listActiveForTask(task.id);
    const archived = await sourceContextRepository.archive(created.id);
    const activeAfterArchive = await sourceContextRepository.listActiveForTask(task.id);

    expect(created.status).toBe('active');
    expect(updated.note).toBe('Updated note');
    expect(updated.content).toBe('Key product assumptions');
    expect(activeBeforeArchive).toHaveLength(1);
    expect(activeBeforeArchive[0]?.id).toBe(created.id);
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).toBeTruthy();
    expect(activeAfterArchive).toHaveLength(0);
  });
});
