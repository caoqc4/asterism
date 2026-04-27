#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildBrowserControlledInteractionLocalQaFixture,
  validateBrowserControlledInteractionRequest,
} from '../dist-electron/shared/types/browser-controlled-interaction.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-browser-controlled-local-qa-'));
const fixture = buildBrowserControlledInteractionLocalQaFixture();
const validations = fixture.requests.map((request) => validateBrowserControlledInteractionRequest(request));
const invalid = validations.find((validation) => !validation.valid);

if (invalid) {
  throw new Error(`Browser controlled local QA fixture is invalid: ${invalid.summary}`);
}

const htmlPath = path.join(root, 'browser-controlled-local-qa.html');
const requestsPath = path.join(root, 'browser-controlled-local-qa-requests.json');
const planPath = path.join(root, 'browser-controlled-local-qa-plan.json');

await fs.writeFile(htmlPath, fixture.html, 'utf8');
await fs.writeFile(requestsPath, JSON.stringify(fixture.requests, null, 2), 'utf8');
await fs.writeFile(
  planPath,
  JSON.stringify({
    allowedOrigin: fixture.allowedOrigin,
    expectedArtifactKinds: fixture.expectedArtifactKinds,
    name: fixture.name,
    path: fixture.path,
    smokeWillCallNetwork: fixture.smokeWillCallNetwork,
    smokeWillMutatePage: fixture.smokeWillMutatePage,
    smokeWillStartBrowser: fixture.smokeWillStartBrowser,
    summary: fixture.summary,
    validationSummaries: validations.map((validation) => validation.summary),
  }, null, 2),
  'utf8',
);

console.log('Browser Controlled Interaction local QA fixture');
console.log(`root=${root}`);
console.log(`html=${htmlPath}`);
console.log(`requests=${requestsPath}`);
console.log(`plan=${planPath}`);
console.log(`allowedOrigin=${fixture.allowedOrigin}`);
console.log(`actions=${fixture.requests.map((request) => request.action.action).join(',')}`);
console.log(`summary=${fixture.summary}`);
console.log('browser=not-started');
console.log('network=not-called');
console.log('pageMutation=not-performed');
console.log('modelExposure=hidden');
