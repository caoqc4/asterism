import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  buildBrowserControlledInteractionLocalQaFixture,
  type BrowserControlledInteractionRequest,
  type BrowserControlledInteractionResult,
} from '../../../shared/types/browser-controlled-interaction.js';
import type { OperatorStartedRunRequest } from '../../../shared/types/operator-started-run.js';
import type { RunRecord } from '../../../shared/types/run.js';
import {
  createPlaywrightBrowserControlledInteractionRunner,
  runBrowserControlledInteractionLocalQa,
} from './browser-controlled-interaction-runner.js';

export type OperatorStartedBrowserControlledLocalQaExecution = {
  requests: BrowserControlledInteractionRequest[];
  result: BrowserControlledInteractionResult;
};

export async function runBrowserControlledLocalQaForOperatorStartedRun(params: {
  request: OperatorStartedRunRequest;
  run: RunRecord;
}): Promise<OperatorStartedBrowserControlledLocalQaExecution> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `taskplane-browser-controlled-${params.run.id}-`));
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

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Browser controlled local QA could not bind a local server port.');
    }

    fixture = buildBrowserControlledInteractionLocalQaFixture({
      origin: `http://127.0.0.1:${address.port}`,
    });
    await fs.writeFile(path.join(root, 'browser-controlled-local-qa.html'), fixture.html, 'utf8');
    await fs.writeFile(
      path.join(root, 'operator-started-request.json'),
      JSON.stringify(params.request, null, 2),
      'utf8',
    );
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

    return {
      requests: fixture.requests,
      result,
    };
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}
