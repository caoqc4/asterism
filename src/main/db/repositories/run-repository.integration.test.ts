import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, initDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { runs } from '../schema.js';
import { RunRepository } from './run-repository.js';
import { TaskRepository } from './task-repository.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-run-repo-'));
}

describe('RunRepository integration', () => {
  let tempRoot = '';
  let runRepository: RunRepository;
  let taskRepository: TaskRepository;

  beforeEach(() => {
    tempRoot = makeTempDir();
    setDatabaseUserDataPathForTests(tempRoot);
    runRepository = new RunRepository();
    taskRepository = new TaskRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates a running run and writes a run.created timeline event', async () => {
    const task = await taskRepository.create({
      title: 'Draft the weekly brief',
    });

    const created = await runRepository.create({
      taskId: task.id,
      type: 'draft',
      instructions: 'Keep it concise',
    });

    expect(created.taskId).toBe(task.id);
    expect(created.status).toBe('running');
    expect(created.instructions).toBe('Keep it concise');
    expect(created.output).toBeNull();

    const detail = await taskRepository.getDetail(task.id);

    expect(detail?.timeline.map((event) => event.type)).toContain('run.created');
  });

  it('updates a run result and writes a run.failed timeline event', async () => {
    const task = await taskRepository.create({
      title: 'Retry the outreach draft',
    });
    const created = await runRepository.create({
      taskId: task.id,
      type: 'draft',
    });

    const updated = await runRepository.updateResult(
      created.id,
      'failed',
      'Executor exploded',
      'system',
      'Executor exploded',
    );

    expect(updated.status).toBe('failed');
    expect(updated.output).toBe('Executor exploded');
    expect(updated.outputSource).toBe('system');
    expect(updated.failureReason).toBe('Executor exploded');

    const detail = await taskRepository.getDetail(task.id);

    expect(detail?.timeline.map((event) => event.type)).toContain('run.failed');
  });

  it('returns only incomplete runs older than the provided timestamp', async () => {
    const task = await taskRepository.create({
      title: 'Check stale run recovery',
    });

    const oldRun = await runRepository.create({
      taskId: task.id,
      type: 'draft',
    });
    const freshRun = await runRepository.create({
      taskId: task.id,
      type: 'summarize',
    });

    const db = initDatabase();
    await db
      .update(runs)
      .set({
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      .where(eq(runs.id, oldRun.id));

    const staleRuns = await runRepository.listIncompleteOlderThan('2026-01-02T00:00:00.000Z');

    expect(staleRuns.map((run) => run.id)).toContain(oldRun.id);
    expect(staleRuns.map((run) => run.id)).not.toContain(freshRun.id);
  });
});
