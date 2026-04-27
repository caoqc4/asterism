#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildBrowserEvidencePreflight,
  buildBrowserEvidenceRunnerSmokeFixture,
  validateBrowserEvidenceRequest,
} from '../dist-electron/shared/types/browser-evidence.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-browser-evidence-'));
const fixture = buildBrowserEvidenceRunnerSmokeFixture();
const validation = validateBrowserEvidenceRequest(fixture.request);

if (!validation.valid) {
  throw new Error(`Browser evidence fixture request is invalid: ${validation.summary}`);
}

const htmlPath = path.join(root, 'browser-evidence-smoke.html');
const requestPath = path.join(root, 'browser-evidence-request.json');
const preflightPath = path.join(root, 'browser-evidence-preflight.json');

await fs.writeFile(htmlPath, fixture.html, 'utf8');
await fs.writeFile(requestPath, JSON.stringify(fixture.request, null, 2), 'utf8');
await fs.writeFile(
  preflightPath,
  JSON.stringify(buildBrowserEvidencePreflight({
    allowedOrigins: [fixture.allowedOrigin],
    enabled: true,
  }), null, 2),
  'utf8',
);

console.log('Browser Evidence manual fixture');
console.log(`root=${root}`);
console.log(`html=${htmlPath}`);
console.log(`request=${requestPath}`);
console.log(`preflight=${preflightPath}`);
console.log(`allowedOrigin=${fixture.allowedOrigin}`);
console.log(`summary=${fixture.summary}`);
console.log('browser=not-started');
console.log('network=not-called');
console.log('modelExposure=hidden');

