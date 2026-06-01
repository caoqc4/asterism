import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  buildDefaultBrowserControlledInteractionPolicy,
} from '../../../shared/types/browser-controlled-interaction.js';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../../db/client.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { makeTempDir } from '../../test-utils.js';
import { runBrowserControlledInteractionDryRun } from './browser-controlled-interaction-dry-runner.js';

describe('browser controlled interaction dry-runner integration', () => {
  let tempRoot = '';
  let runRepository: RunRepository;
  let runStepRepository: RunStepRepository;
  let taskRepository: TaskRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-browser-controlled-dry-run-');
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

  it('persists dry-run browser action evidence as ordered RunSteps', async () => {
    const task = await taskRepository.create({ title: 'Review controlled browser QA' });
    const run = await runRepository.create({
      instructions: 'Dry-run controlled browser action plan.',
      taskId: task.id,
      type: 'agent',
    });

    const result = await runBrowserControlledInteractionDryRun({
      runId: run.id,
      runStepRepository,
      requests: [
        {
          descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
          action: {
            action: 'select_option',
            currentUrl: 'http://localhost:5173/tasks',
            targetLabel: 'Mode',
            targetRef: 'mode-select',
            value: 'Review',
          },
          policy: buildDefaultBrowserControlledInteractionPolicy({
            allowedActions: ['select_option'],
            allowedOrigins: ['http://localhost:5173'],
          }),
          purpose: 'Exercise a local select control.',
        },
      ],
    });

    expect(result.status).toBe('planned');
    const steps = await runStepRepository.listForRun(run.id);
    expect(steps.map((step) => step.title)).toEqual([
      'browser controlled dry-run accepted',
      'Browser action planned: select_option',
      'Browser action evidence pending: select_option',
    ]);
    expect(steps[0].output).toBe(
      'browserStart=no / networkCall=no / pageMutation=no / modelExposure=hidden / scheduler=no / providerCall=no',
    );
    expect(steps[2]).toMatchObject({
      kind: 'tool_result',
      status: 'skipped',
      output: [
        'action=select_option / checkpoint=no / origin=http://localhost:5173',
        'evidence=screenshot,visible_text,page_summary',
        'sideEffect=none',
      ].join('\n'),
    });
  });
});
