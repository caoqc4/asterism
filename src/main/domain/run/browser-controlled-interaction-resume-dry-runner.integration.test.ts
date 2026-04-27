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
import { runBrowserControlledInteractionResumeDryRun } from './browser-controlled-interaction-resume-dry-runner.js';

describe('browser controlled interaction resume dry-runner integration', () => {
  let tempRoot = '';
  let runRepository: RunRepository;
  let runStepRepository: RunStepRepository;
  let taskRepository: TaskRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-browser-controlled-resume-dry-run-');
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

  it('persists resume dry-run audit evidence as ordered RunSteps', async () => {
    const task = await taskRepository.create({ title: 'Review browser checkpoint resume' });
    const run = await runRepository.create({
      instructions: 'Dry-run approved browser checkpoint resume.',
      taskId: task.id,
      type: 'agent',
    });

    const result = await runBrowserControlledInteractionResumeDryRun({
      context: {
        checkpointStatus: 'open',
        decisionStatus: 'approved',
        descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
        modelExposure: 'hidden',
        providerCallAllowed: false,
        requestedAction: 'click',
        requestedOrigin: 'http://localhost:5173',
        schedulerAllowed: false,
      },
      payload: buildResumePayload(),
      runId: run.id,
      runStepRepository,
    });

    expect(result.status).toBe('planned');
    const steps = await runStepRepository.listForRun(run.id);
    expect(steps.map((step) => step.title)).toEqual([
      'browser controlled resume dry-run accepted',
      'Browser resume checkpoint reviewed',
      'Browser resume planned: click',
      'Browser resume evidence pending: click',
    ]);
    expect(steps[0].output).toBe(
      'browserStart=no / pageMutation=no / modelExposure=hidden / scheduler=no / providerCall=no',
    );
    expect(steps[3]).toMatchObject({
      kind: 'tool_result',
      status: 'skipped',
      output: [
        'Browser controlled resume plan ready / action=click / origin=http://localhost:5173 / oneAction=yes / modelExposure=hidden',
        'expectedEvidence=screenshot,visible_text,page_summary',
        'postActionScreenshot=required',
        'postActionVisibleText=required',
        'pageMutation=no',
      ].join('\n'),
    });
  });
});

function buildResumePayload() {
  return {
    version: 1,
    kind: 'browser_controlled_interaction',
    descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
    action: {
      action: 'click',
      currentUrl: 'http://localhost:5173/draft',
      targetLabel: 'Publish post',
    },
    currentUrl: 'http://localhost:5173/draft',
    decisionId: 'decision_browser_1',
    decisionTitle: 'Approve browser publish click',
    origin: 'http://localhost:5173',
    policySnapshot: buildDefaultBrowserControlledInteractionPolicy({
      allowedActions: ['click'],
      allowedOrigins: ['http://localhost:5173'],
    }),
    screenshotArtifactId: 'artifact_screenshot_1',
    sideEffectClassification: 'possible_external_side_effect',
    visibleTextSummary: 'Draft publish page is visible.',
  };
}
