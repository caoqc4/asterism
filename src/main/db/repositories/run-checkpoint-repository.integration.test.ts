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

    expect(checkpoint.status).toBe('open');
    expect(checkpoint.kind).toBe('tool_permission');
    expect(checkpoint.stepId).toBe(step.id);
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]?.payload).toContain('artifact.create_note');
  });
});
