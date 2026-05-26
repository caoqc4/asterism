import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log('Agent CLI web research bridge smoke');
console.log('mode=mocked network=not-called provider=stubbed');

const result = spawnSync(
  npmCommand,
  [
    'exec',
    'vitest',
    'run',
    'src/main/domain/agent-cli/agent-cli-run-service.test.ts',
    'src/renderer/lib/agentCliProgress.test.ts',
    '-t',
    'web research|联网调研',
  ],
  {
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
