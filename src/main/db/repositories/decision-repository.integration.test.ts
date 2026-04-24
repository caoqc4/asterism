import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from './repository-test-utils.js';
import { DecisionRepository } from './decision-repository.js';
import { TaskRepository } from './task-repository.js';

describe('DecisionRepository integration', () => {
  let tempRoot = '';
  let decisionRepository: DecisionRepository;
  let taskRepository: TaskRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-decision-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    decisionRepository = new DecisionRepository();
    taskRepository = new TaskRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates a pending decision and writes a decision.created timeline event', async () => {
    const task = await taskRepository.create({
      title: 'Need sign-off for the launch note',
    });

    const created = await decisionRepository.create({
      taskId: task.id,
      title: 'Approve the final launch note',
    });

    expect(created.taskId).toBe(task.id);
    expect(created.title).toBe('Approve the final launch note');
    expect(created.status).toBe('pending');

    const detail = await taskRepository.getDetail(task.id);

    expect(detail?.timeline.map((event) => event.type)).toContain('decision.created');
  });

  it('maps approve/defer/cancel actions to the expected statuses', async () => {
    const task = await taskRepository.create({
      title: 'Resolve approval path',
    });

    const approveDecision = await decisionRepository.create({
      taskId: task.id,
      title: 'Approve path A',
    });
    const deferDecision = await decisionRepository.create({
      taskId: task.id,
      title: 'Defer path B',
    });
    const cancelDecision = await decisionRepository.create({
      taskId: task.id,
      title: 'Cancel path C',
    });

    const approved = await decisionRepository.act({
      id: approveDecision.id,
      action: 'approve',
    });
    const deferred = await decisionRepository.act({
      id: deferDecision.id,
      action: 'defer',
    });
    const cancelled = await decisionRepository.act({
      id: cancelDecision.id,
      action: 'cancel',
    });

    expect(approved.status).toBe('approved');
    expect(deferred.status).toBe('deferred');
    expect(cancelled.status).toBe('cancelled');
  });

  it('writes a decision.acted timeline event when a decision is handled', async () => {
    const task = await taskRepository.create({
      title: 'Handle the exec review',
    });
    const created = await decisionRepository.create({
      taskId: task.id,
      title: 'Approve the revised copy',
    });

    await decisionRepository.act({
      id: created.id,
      action: 'approve',
    });

    const detail = await taskRepository.getDetail(task.id);

    expect(detail?.timeline.map((event) => event.type)).toContain('decision.acted');
  });
});
