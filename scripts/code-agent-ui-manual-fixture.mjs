#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-code-agent-ui-'));
const userDataDir = path.join(root, 'user-data');
const workspaceRoot = path.join(root, 'workspace');
const contextFile = 'docs/code-agent-context.md';

await fs.mkdir(path.join(workspaceRoot, 'docs'), { recursive: true });
await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
await fs.mkdir(userDataDir, { recursive: true });

await fs.writeFile(
  path.join(workspaceRoot, 'package.json'),
  JSON.stringify({
    private: true,
    scripts: {
      lint: 'node -e "console.log(\'lint manual fixture ok\')"',
      test: 'node -e "console.log(\'test manual fixture ok\')"',
    },
  }, null, 2),
  'utf8',
);

await fs.writeFile(
  path.join(workspaceRoot, contextFile),
  [
    '# Code Agent UI manual fixture',
    '',
    'This disposable workspace is for validating the Taskplane Code Agent UI.',
    'Use this file as read-only model context during a manual alpha pass.',
    '',
    'Expected boundary:',
    '- selected context is read-only evidence',
    '- checks are limited to package.json test/lint scripts',
    '- staged patch review remains Decision-gated',
    '- workspace files should not change before explicit promotion approval',
    '',
  ].join('\n'),
  'utf8',
);

await fs.writeFile(
  path.join(workspaceRoot, 'src', 'manual-target.md'),
  [
    '# Manual target',
    '',
    'Initial content for optional patch-promotion UI validation.',
    '',
  ].join('\n'),
  'utf8',
);

const env = {
  TASKPLANE_USER_DATA_DIR: userDataDir,
  TASKPLANE_WORKSPACE_ROOT: workspaceRoot,
  TASKPLANE_ENABLE_SCHEDULER: 'false',
  TASKPLANE_ENABLE_SANDBOX_CODING_AGENT: 'true',
  TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER: 'true',
  TASKPLANE_CODE_AGENT_CONTEXT_FILES: contextFile,
  TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY: 'false',
};

console.log('Code Agent UI manual fixture');
console.log(`root=${root}`);
console.log(`userDataDir=${userDataDir}`);
console.log(`workspaceRoot=${workspaceRoot}`);
console.log(`contextFiles=${contextFile}`);
console.log('provider=from .env or shell');
console.log('docker=not-started');
console.log('provider=not-called');
console.log('');
console.log('Launch command:');
console.log(`${formatEnv(env)} npm run dev`);

function formatEnv(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(' ');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
