import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { RunCheckpointRepository } from './run-checkpoint-repository.js';
import { RunRepository } from './run-repository.js';
import { RunStepRepository } from './run-step-repository.js';
import { TaskRepository } from './task-repository.js';

describe('RunCheckpointRepository integration', () => {
  let tempRoot = '';
  let checkpointRepository: RunCheckpointRepository;
  let runRepository: RunRepository;
  let runStepRepository: RunStepRepository;
  let taskRepository: TaskRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-run-checkpoint-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    checkpointRepository = new RunCheckpointRepository();
    runRepository = new RunRepository();
    runStepRepository = new RunStepRepository();
    taskRepository = new TaskRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates an open checkpoint linked to a run step', async () => {
    const task = await taskRepository.create({ title: 'Pause for confirmation' });
    const run = await runRepository.create({ taskId: task.id, type: 'agent' });
    const step = await runStepRepository.create({
      runId: run.id,
      kind: 'checkpoint',
      title: '需要确认',
    });

    const checkpoint = await checkpointRepository.create({
      runId: run.id,
      stepId: step.id,
      kind: 'tool_permission',
      payload: JSON.stringify({ tool: 'artifact.create_note' }),
    });

    const checkpoints = await checkpointRepository.listForRun(run.id);
    const foundCheckpoint = await checkpointRepository.findById(checkpoint.id);
    const missingCheckpoint = await checkpointRepository.findById('run_checkpoint_missing');

    expect(checkpoint.status).toBe('open');
    expect(checkpoint.kind).toBe('tool_permission');
    expect(checkpoint.stepId).toBe(step.id);
    expect(foundCheckpoint?.id).toBe(checkpoint.id);
    expect(foundCheckpoint?.payload).toContain('artifact.create_note');
    expect(missingCheckpoint).toBeNull();
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]?.payload).toContain('artifact.create_note');
  });

  it('finds and resolves an open checkpoint by decision id', async () => {
    const task = await taskRepository.create({ title: 'Approve checkpoint' });
    const run = await runRepository.create({ taskId: task.id, type: 'agent' });
    const step = await runStepRepository.create({
      runId: run.id,
      kind: 'checkpoint',
      title: '需要确认',
    });
    const checkpoint = await checkpointRepository.create({
      runId: run.id,
      stepId: step.id,
      kind: 'tool_permission',
      payload: JSON.stringify({
        tool: 'artifact.create_note',
        decisionId: 'decision_1',
      }),
    });

    const found = await checkpointRepository.findOpenByDecisionId('decision_1');
    const resolved = await checkpointRepository.updateStatus(checkpoint.id, 'resolved');
    const foundAfterResolve = await checkpointRepository.findOpenByDecisionId('decision_1');

    expect(found?.id).toBe(checkpoint.id);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).not.toBeNull();
    expect(foundAfterResolve).toBeNull();
  });

  it('creates a resume checkpoint for paused agent runs', async () => {
    const task = await taskRepository.create({ title: 'Resume paused agent run' });
    const run = await runRepository.create({ taskId: task.id, type: 'agent' });
    const step = await runStepRepository.create({
      runId: run.id,
      kind: 'checkpoint',
      status: 'pending',
      title: '等待恢复 agent run',
    });

    const checkpoint = await checkpointRepository.create({
      runId: run.id,
      stepId: step.id,
      kind: 'resume',
      payload: JSON.stringify({
        reason: '等待先解除阻塞。',
        nextTool: 'artifact.create_note',
      }),
    });

    const checkpoints = await checkpointRepository.listForRun(run.id);

    expect(checkpoint.kind).toBe('resume');
    expect(checkpoint.status).toBe('open');
    expect(checkpoints[0]).toEqual(expect.objectContaining({
      id: checkpoint.id,
      stepId: step.id,
      payload: expect.stringContaining('artifact.create_note'),
    }));
  });
});
