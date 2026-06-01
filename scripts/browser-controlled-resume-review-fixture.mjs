#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-browser-controlled-resume-review-'));
const userDataDir = path.join(root, 'user-data');
await fs.mkdir(userDataDir, { recursive: true });
process.env.TASKPLANE_USER_DATA_DIR = userDataDir;
process.env.TASKPLANE_ENABLE_SCHEDULER = 'false';

const {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  buildDefaultBrowserControlledInteractionPolicy,
} = await import('../dist-electron/shared/types/browser-controlled-interaction.js');
const { closeDatabase } = await import('../dist-electron/main/db/client.js');
const { DecisionRepository } = await import('../dist-electron/main/db/repositories/decision-repository.js');
const { RunCheckpointRepository } = await import('../dist-electron/main/db/repositories/run-checkpoint-repository.js');
const { RunRepository } = await import('../dist-electron/main/db/repositories/run-repository.js');
const { RunStepRepository } = await import('../dist-electron/main/db/repositories/run-step-repository.js');
const { TaskRepository } = await import('../dist-electron/main/db/repositories/task-repository.js');

const taskRepository = new TaskRepository();
const runRepository = new RunRepository();
const runStepRepository = new RunStepRepository();
const runCheckpointRepository = new RunCheckpointRepository();
const decisionRepository = new DecisionRepository();

const policy = buildDefaultBrowserControlledInteractionPolicy({
  allowedActions: ['click'],
  allowedOrigins: ['http://localhost:5173'],
});
const task = await taskRepository.create({
  title: 'Browser Controlled Resume review fixture',
  summary: 'Disposable fixture for BCR manual review surface checks.',
});

async function seedCase(input) {
  const run = await runRepository.create({
    taskId: task.id,
    type: 'agent',
    instructions: input.instructions,
  });
  const decision = await decisionRepository.create({
    taskId: task.id,
    title: input.decisionTitle,
    sourceType: 'agent_checkpoint',
    sourceLabel: 'Browser controlled resume fixture',
  });
  if (input.decisionAction) {
    await decisionRepository.act({
      id: decision.id,
      action: input.decisionAction,
    });
  }

  const actionStep = await runStepRepository.create({
    runId: run.id,
    kind: 'tool_call',
    status: 'pending',
    title: 'Browser action planned: click',
    input: 'action=click\nurl=http://localhost:5173/draft\ntargetLabel=Publish post',
    output: 'Pending Decision before browser action execution.',
  });
  const checkpointPayload = input.payload ?? buildBrowserPayload({
    decisionId: decision.id,
    decisionTitle: input.decisionTitle,
  });
  const checkpoint = await runCheckpointRepository.create({
    runId: run.id,
    stepId: actionStep.id,
    kind: 'external_wait',
    payload: typeof checkpointPayload === 'string'
      ? checkpointPayload
      : JSON.stringify(checkpointPayload),
  });

  if (input.checkpointStatus && input.checkpointStatus !== 'open') {
    await runCheckpointRepository.updateStatus(checkpoint.id, input.checkpointStatus);
  }

  for (const step of input.extraSteps ?? []) {
    await runStepRepository.create({
      runId: run.id,
      ...step,
    });
  }

  if (input.runResult) {
    await runRepository.updateResult(
      run.id,
      input.runResult.status,
      input.runResult.output,
      'system',
      input.runResult.failureReason ?? null,
    );
  }

  return {
    checkpointId: checkpoint.id,
    decisionId: decision.id,
    runId: run.id,
  };
}

const cases = [];
cases.push(await seedCase({
  decisionAction: 'approve',
  decisionTitle: 'Approve browser resume ready fixture',
  instructions: 'Manual review fixture: approved-ready browser resume checkpoint.',
  runResult: {
    status: 'needs_confirmation',
    output: 'Browser controlled checkpoint requires approved one-action resume.',
  },
}));
cases.push(await seedCase({
  checkpointStatus: 'resolved',
  decisionAction: 'approve',
  decisionTitle: 'Approve browser resumed fixture',
  extraSteps: [
    {
      kind: 'tool_result',
      status: 'skipped',
      title: 'Browser resume evidence pending: click',
      output: 'Browser controlled resume plan ready / action=click / origin=http://localhost:5173 / oneAction=yes / modelExposure=hidden',
    },
    {
      kind: 'checkpoint',
      status: 'completed',
      title: 'Browser resume completed：Approve browser resumed fixture',
      output: 'Browser controlled resume local QA completed / oneAction=yes / modelExposure=hidden\nArtifacts: page_summary,visible_text,screenshot',
    },
  ],
  instructions: 'Manual review fixture: resumed browser checkpoint.',
  runResult: {
    status: 'completed',
    output: 'Browser controlled resume local QA completed / url=http://localhost:5173/draft / resumedAction=click / origin=http://localhost:5173 / artifacts=page_summary,visible_text,screenshot / oneAction=yes / credentials=no / externalOrigin=no / modelExposure=hidden',
  },
}));
cases.push(await seedCase({
  checkpointStatus: 'cancelled',
  decisionAction: 'approve',
  decisionTitle: 'Approve browser non-local blocked fixture',
  extraSteps: [
    {
      kind: 'checkpoint',
      status: 'failed',
      title: 'Browser resume blocked：Approve browser non-local blocked fixture',
      error: 'Browser controlled resume blocked: origin https://publisher.example.com is not a local QA origin.',
      output: 'Browser controlled resume blocked: origin https://publisher.example.com is not a local QA origin.\nNo browser action was executed.',
    },
  ],
  instructions: 'Manual review fixture: non-local browser resume blocked.',
  payload: {
    ...buildBrowserPayload({
      decisionId: null,
      decisionTitle: 'Approve browser non-local blocked fixture',
    }),
    currentUrl: 'https://publisher.example.com/draft',
    origin: 'https://publisher.example.com',
    policySnapshot: buildDefaultBrowserControlledInteractionPolicy({
      allowedActions: ['click'],
      allowedOrigins: ['https://publisher.example.com'],
    }),
  },
  runResult: {
    status: 'failed',
    output: 'Browser controlled resume blocked: origin https://publisher.example.com is not a local QA origin.',
    failureReason: 'Browser controlled resume blocked: origin https://publisher.example.com is not a local QA origin.',
  },
}));
cases.push(await seedCase({
  decisionTitle: 'Review stale browser payload fixture',
  instructions: 'Manual review fixture: stale browser checkpoint payload.',
  payload: '{',
  runResult: {
    status: 'needs_confirmation',
    output: 'Malformed browser checkpoint payload should render as stale.',
  },
}));
cases.push(await seedCase({
  decisionTitle: 'Review non-browser checkpoint fixture',
  instructions: 'Manual review fixture: non-browser checkpoint should not render as browser resume.',
  payload: JSON.stringify({
    version: 1,
    kind: 'tool_permission',
    tool: 'artifact.create_note',
    risk: 'write',
    input: { title: 'Not browser', content: 'Ignore in browser resume review' },
    decisionId: null,
    decisionTitle: 'Review non-browser checkpoint fixture',
  }),
  runResult: {
    status: 'needs_confirmation',
    output: 'Non-browser checkpoint should remain in generic checkpoint review only.',
  },
}));

closeDatabase();

const env = {
  TASKPLANE_USER_DATA_DIR: userDataDir,
  TASKPLANE_ENABLE_SCHEDULER: 'false',
};

console.log('Browser Controlled Resume review fixture');
console.log(`root=${root}`);
console.log(`userDataDir=${userDataDir}`);
console.log(`taskId=${task.id}`);
for (const item of cases) {
  console.log(`case=${item.runId} decision=${item.decisionId} checkpoint=${item.checkpointId}`);
}
console.log('provider=not-called');
console.log('browser=not-started');
console.log('scheduler=disabled');
console.log('');
console.log('Launch command:');
console.log(`${formatEnv(env)} npm run dev`);

function buildBrowserPayload(input) {
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
    decisionId: input.decisionId,
    decisionTitle: input.decisionTitle,
    origin: 'http://localhost:5173',
    policySnapshot: policy,
    screenshotArtifactId: 'artifact_screenshot_1',
    sideEffectClassification: 'possible_external_side_effect',
    visibleTextSummary: 'Draft publish page is visible.',
  };
}

function formatEnv(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(' ');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
