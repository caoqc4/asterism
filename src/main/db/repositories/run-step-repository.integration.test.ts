import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { RunRepository } from './run-repository.js';
import { RunStepRepository } from './run-step-repository.js';
import { TaskRepository } from './task-repository.js';

describe('RunStepRepository integration', () => {
  let tempRoot = '';
  let runRepository: RunRepository;
  let runStepRepository: RunStepRepository;
  let taskRepository: TaskRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-run-step-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    runRepository = new RunRepository();
    runStepRepository = new RunStepRepository();
    taskRepository = new TaskRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates ordered run steps and updates step result', async () => {
    const task = await taskRepository.create({ title: 'Trace the run' });
    const run = await runRepository.create({ taskId: task.id, type: 'draft' });

    const plan = await runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      title: 'Prepare context',
      output: 'Context assembled',
    });
    const model = await runStepRepository.create({
      runId: run.id,
      kind: 'model',
      status: 'running',
      title: 'Generate draft',
      input: 'Use selected process templates',
    });
    const updatedModel = await runStepRepository.update(model.id, {
      status: 'completed',
      output: 'Generated output',
    });

    expect(plan.index).toBe(1);
    expect(model.index).toBe(2);
    expect(updatedModel.status).toBe('completed');
    expect(updatedModel.output).toBe('Generated output');

    const steps = await runStepRepository.listForRun(run.id);
    expect(steps.map((step) => step.title)).toEqual(['Prepare context', 'Generate draft']);
  });
});
