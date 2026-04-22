import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { TaskRepository } from './task-repository.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-task-repo-'));
}

describe('TaskRepository integration', () => {
  let tempRoot = '';
  let repository: TaskRepository;

  beforeEach(() => {
    tempRoot = makeTempDir();
    setDatabaseUserDataPathForTests(tempRoot);
    repository = new TaskRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates a task with default structured fields and timeline', async () => {
    const created = await repository.create({
      title: 'Ship desktop workbench',
      summary: 'Initial scope',
    });

    expect(created.state).toBe('captured');
    expect(created.nextStep).toBeNull();
    expect(created.waitingReason).toBeNull();
    expect(created.riskLevel).toBe('none');
    expect(created.riskNote).toBeNull();

    const detail = await repository.getDetail(created.id);

    expect(detail).not.toBeNull();
    expect(detail?.timeline).toHaveLength(1);
    expect(detail?.timeline[0]?.type).toBe('task.created');
  });

  it('updates structured task signals and writes an update timeline event', async () => {
    const created = await repository.create({
      title: 'Follow up with reviewer',
    });

    const updated = await repository.update({
      id: created.id,
      nextStep: 'Send the revised doc tomorrow',
      waitingReason: 'Waiting for comments from design',
      riskLevel: 'medium',
      riskNote: 'Timeline may slip by one day',
    });

    expect(updated.nextStep).toBe('Send the revised doc tomorrow');
    expect(updated.waitingReason).toBe('Waiting for comments from design');
    expect(updated.riskLevel).toBe('medium');
    expect(updated.riskNote).toBe('Timeline may slip by one day');

    const detail = await repository.getDetail(created.id);

    expect(detail?.timeline.map((event) => event.type)).toContain('task.updated');
    expect(detail?.timeline.map((event) => event.type)).toContain('task.created');
    expect(detail?.timeline).toHaveLength(2);
  });

  it('transitions task state and preserves structured fields', async () => {
    const created = await repository.create({
      title: 'Prepare launch brief',
    });

    await repository.update({
      id: created.id,
      nextStep: 'Draft the opening summary',
      riskLevel: 'low',
    });

    const transitioned = await repository.transition({
      id: created.id,
      nextState: 'planned',
    });

    expect(transitioned.state).toBe('planned');
    expect(transitioned.nextStep).toBe('Draft the opening summary');
    expect(transitioned.riskLevel).toBe('low');

    const detail = await repository.getDetail(created.id);

    expect(detail?.timeline.map((event) => event.type)).toContain('task.transitioned');
    expect(detail?.timeline.map((event) => event.type)).toContain('task.updated');
    expect(detail?.timeline.map((event) => event.type)).toContain('task.created');
    expect(detail?.timeline).toHaveLength(3);
  });
});
