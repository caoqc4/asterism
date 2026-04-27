import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  buildBrowserEvidenceRunnerSmokeFixture,
} from '../../../shared/types/browser-evidence.js';
import type { OperatorStartedRunRequest } from '../../../shared/types/operator-started-run.js';
import type { RunRecord } from '../../../shared/types/run.js';
import {
  createPlaywrightBrowserEvidenceRunner,
  runBrowserEvidenceRequest,
} from './browser-evidence-runner.js';
import type { OperatorStartedBrowserEvidenceSmokeExecution } from './operator-started-run-service.js';

export async function runBrowserEvidenceSmokeForOperatorStartedRun(params: {
  request: OperatorStartedRunRequest;
  run: RunRecord;
}): Promise<OperatorStartedBrowserEvidenceSmokeExecution> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `taskplane-browser-evidence-${params.run.id}-`));
  const artifactsDir = path.join(root, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });

  let fixture = buildBrowserEvidenceRunnerSmokeFixture();
  const server = http.createServer((request, response) => {
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

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Browser evidence smoke could not bind a local server port.');
    }

    fixture = buildBrowserEvidenceRunnerSmokeFixture({
      origin: `http://127.0.0.1:${address.port}`,
    });
    await fs.writeFile(path.join(root, 'browser-evidence-smoke.html'), fixture.html, 'utf8');
    await fs.writeFile(
      path.join(root, 'operator-started-request.json'),
      JSON.stringify(params.request, null, 2),
      'utf8',
    );
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

    return {
      browserRequest: fixture.request,
      result,
    };
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}
