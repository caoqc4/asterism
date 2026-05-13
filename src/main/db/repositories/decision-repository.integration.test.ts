import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
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

  it('persists optional source metadata for checkpoint-created decisions', async () => {
    const task = await taskRepository.create({
      title: 'Need checkpoint approval',
    });

    const created = await decisionRepository.create({
      taskId: task.id,
      title: '确认本地写入：artifact.create_note',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_1',
      sourceLabel: 'artifact.create_note',
    });
    const [listed] = await decisionRepository.list();
    const detail = await taskRepository.getDetail(task.id);
    const decisionCreatedEvent = detail?.timeline.find((event) => event.type === 'decision.created');

    expect(created.sourceType).toBe('agent_checkpoint');
    expect(created.sourceId).toBe('run_checkpoint_1');
    expect(created.sourceLabel).toBe('artifact.create_note');
    expect(listed?.sourceType).toBe('agent_checkpoint');
    expect(decisionCreatedEvent?.payload).toContain('"sourceType":"agent_checkpoint"');
  });

  it('creates and handles a global decision without a task timeline event', async () => {
    const created = await decisionRepository.create({
      title: 'Approve external connector write access',
      scope: 'external_access',
      kind: 'external_write',
      sourceType: 'external_access',
      sourceLabel: 'Gmail connector',
      context: {
        whyNow: 'The agent needs permission before writing outside the workspace.',
        ifDeferred: 'The external action remains paused.',
      },
      options: [
        { id: 'approve', label: 'Approve once', description: 'Allow this write once.' },
        { id: 'defer', label: 'Ask later', description: 'Keep the request pending.' },
      ],
      recommendation: {
        optionId: 'approve',
        label: 'Approve once',
        reason: 'The action is scoped and reversible.',
      },
    });

    expect(created.taskId).toBeNull();
    expect(created.scope).toBe('external_access');
    expect(created.kind).toBe('external_write');
    expect(created.context?.whyNow).toContain('permission');
    expect(created.options?.map((option) => option.label)).toEqual(['Approve once', 'Ask later']);
    expect(created.recommendation?.label).toBe('Approve once');

    const approved = await decisionRepository.act({ id: created.id, action: 'approve' });
    expect(approved.status).toBe('approved');
    expect(approved.taskId).toBeNull();
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
