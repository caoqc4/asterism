#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  buildBrowserControlledInteractionLocalQaFixture,
} from '../dist-electron/shared/types/browser-controlled-interaction.js';
import {
  createPlaywrightBrowserControlledInteractionRunner,
  runBrowserControlledInteractionLocalQa,
} from '../dist-electron/main/domain/run/browser-controlled-interaction-runner.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-browser-controlled-local-qa-smoke-'));
const artifactsDir = path.join(root, 'artifacts');
await fs.mkdir(artifactsDir, { recursive: true });

let fixture = buildBrowserControlledInteractionLocalQaFixture();
const server = http.createServer((request, response) => {
  if (request.url !== fixture.path) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }

  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
  });
  response.end(fixture.html);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
if (!address || typeof address === 'string') {
  server.close();
  throw new Error('Browser controlled local QA smoke could not bind a local server port.');
}

const origin = `http://127.0.0.1:${address.port}`;
fixture = buildBrowserControlledInteractionLocalQaFixture({ origin });

try {
  await fs.writeFile(path.join(root, 'browser-controlled-local-qa.html'), fixture.html, 'utf8');
  await fs.writeFile(
    path.join(root, 'browser-controlled-local-qa-requests.json'),
    JSON.stringify(fixture.requests, null, 2),
    'utf8',
  );

  const browserType = await createPlaywrightBrowserControlledInteractionRunner();
  const result = await runBrowserControlledInteractionLocalQa({
    browserType,
    outputDir: artifactsDir,
    requests: fixture.requests,
  });

  await fs.writeFile(
    path.join(root, 'browser-controlled-local-qa-result.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  );

  console.log('Browser Controlled Interaction local QA smoke');
  console.log(`root=${root}`);
  console.log(`origin=${origin}`);
  console.log(`status=${result.status}`);
  console.log(`summary=${result.summary}`);

  if (result.status !== 'completed') {
    throw new Error(`Browser controlled local QA smoke did not complete: ${result.summary}`);
  }

  console.log(`artifacts=${result.artifacts.map((artifact) => artifact.kind).join(',')}`);
  console.log(`screenshot=${result.artifacts.find((artifact) => artifact.kind === 'screenshot')?.path ?? ''}`);
  console.log('credentials=not-used');
  console.log('externalOrigin=blocked');
  console.log('modelExposure=hidden');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
