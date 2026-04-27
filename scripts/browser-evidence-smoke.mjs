#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  buildBrowserEvidenceRunnerSmokeFixture,
} from '../dist-electron/shared/types/browser-evidence.js';
import {
  createPlaywrightBrowserEvidenceRunner,
  runBrowserEvidenceRequest,
} from '../dist-electron/main/domain/run/browser-evidence-runner.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-browser-evidence-smoke-'));
const artifactsDir = path.join(root, 'artifacts');
await fs.mkdir(artifactsDir, { recursive: true });

const server = http.createServer(async (request, response) => {
  if (request.url !== '/browser-evidence-smoke.html') {
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
  throw new Error('Browser evidence smoke could not bind a local server port.');
}

const origin = `http://127.0.0.1:${address.port}`;
const fixture = buildBrowserEvidenceRunnerSmokeFixture({ origin });

try {
  await fs.writeFile(path.join(root, 'browser-evidence-smoke.html'), fixture.html, 'utf8');
  await fs.writeFile(
    path.join(root, 'browser-evidence-request.json'),
    JSON.stringify(fixture.request, null, 2),
    'utf8',
  );

  const browserType = await createPlaywrightBrowserEvidenceRunner();
  const result = await runBrowserEvidenceRequest({
    browserType,
    outputDir: artifactsDir,
    request: fixture.request,
  });

  await fs.writeFile(
    path.join(root, 'browser-evidence-result.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  );

  console.log('Browser Evidence Playwright smoke');
  console.log(`root=${root}`);
  console.log(`origin=${origin}`);
  console.log(`status=${result.status}`);
  console.log(`summary=${result.summary}`);

  if (result.status !== 'captured') {
    throw new Error(`Browser evidence smoke did not capture artifacts: ${result.summary}`);
  }

  const screenshotArtifact = result.artifacts.find((artifact) => artifact.kind === 'screenshot');
  console.log(`artifacts=${result.artifacts.map((artifact) => artifact.kind).join(',')}`);
  console.log(`screenshot=${screenshotArtifact?.path ?? ''}`);
  console.log('credentials=not-used');
  console.log('mutation=not-representable');
  console.log('modelExposure=hidden');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
