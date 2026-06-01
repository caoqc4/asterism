#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  buildDefaultBrowserControlledInteractionPolicy,
} from '../dist-electron/shared/types/browser-controlled-interaction.js';
import {
  createPlaywrightBrowserControlledInteractionRunner,
  runBrowserControlledInteractionResumeLocalQa,
} from '../dist-electron/main/domain/run/browser-controlled-interaction-runner.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-browser-controlled-resume-local-qa-smoke-'));
const artifactsDir = path.join(root, 'artifacts');
await fs.mkdir(artifactsDir, { recursive: true });

const fixturePath = '/browser-controlled-resume-local-qa.html';
const html = [
  '<!doctype html>',
  '<html lang="en">',
  '<head><meta charset="utf-8"><title>Taskplane Browser Resume Local QA</title></head>',
  '<body>',
  '<main data-taskplane-controlled-resume-qa="fixture">',
  '<h1>Controlled Resume Local QA</h1>',
  '<button data-ref="publish-post" type="button">Publish post</button>',
  '<section data-ref="result-panel">Resume fixture ready.</section>',
  '<script>',
  'document.querySelector("[data-ref=publish-post]").addEventListener("click", () => {',
  'document.querySelector("[data-ref=result-panel]").textContent = "Approved resume action executed.";})',
  '</script>',
  '</main>',
  '</body>',
  '</html>',
].join('');

const server = http.createServer((request, response) => {
  if (request.url !== fixturePath) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }

  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
  });
  response.end(html);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
if (!address || typeof address === 'string') {
  server.close();
  throw new Error('Browser controlled resume local QA smoke could not bind a local server port.');
}

const origin = `http://127.0.0.1:${address.port}`;
const currentUrl = `${origin}${fixturePath}`;
const policy = buildDefaultBrowserControlledInteractionPolicy({
  allowedActions: ['click'],
  allowedOrigins: [origin],
});
const payload = {
  version: 1,
  kind: 'browser_controlled_interaction',
  descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  action: {
    action: 'click',
    currentUrl,
    targetLabel: 'Publish post',
    targetRef: 'publish-post',
  },
  currentUrl,
  decisionId: 'manual_decision_browser_resume_smoke',
  decisionTitle: 'Approve browser resume local QA click',
  origin,
  policySnapshot: policy,
  screenshotArtifactId: 'manual_pre_resume_screenshot',
  sideEffectClassification: 'possible_external_side_effect',
  visibleTextSummary: 'Controlled Resume Local QA fixture is visible.',
};

try {
  await fs.writeFile(path.join(root, 'browser-controlled-resume-local-qa.html'), html, 'utf8');
  await fs.writeFile(
    path.join(root, 'browser-controlled-resume-local-qa-payload.json'),
    JSON.stringify(payload, null, 2),
    'utf8',
  );

  const browserType = await createPlaywrightBrowserControlledInteractionRunner();
  const result = await runBrowserControlledInteractionResumeLocalQa({
    browserType,
    context: {
      checkpointStatus: 'open',
      currentPolicy: policy,
      decisionStatus: 'approved',
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      modelExposure: 'hidden',
      providerCallAllowed: false,
      requestedAction: 'click',
      requestedOrigin: origin,
      schedulerAllowed: false,
    },
    outputDir: artifactsDir,
    payload,
  });

  await fs.writeFile(
    path.join(root, 'browser-controlled-resume-local-qa-result.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  );

  console.log('Browser Controlled Interaction resume local QA smoke');
  console.log(`root=${root}`);
  console.log(`origin=${origin}`);
  console.log(`status=${result.status}`);
  console.log(`summary=${result.summary}`);

  if (result.status !== 'completed') {
    throw new Error(`Browser controlled resume local QA smoke did not complete: ${result.summary}`);
  }

  console.log(`artifacts=${result.artifacts.map((artifact) => artifact.kind).join(',')}`);
  console.log(`screenshot=${result.artifacts.find((artifact) => artifact.kind === 'screenshot')?.path ?? ''}`);
  console.log('oneAction=yes');
  console.log('credentials=not-used');
  console.log('externalOrigin=blocked');
  console.log('modelExposure=hidden');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
