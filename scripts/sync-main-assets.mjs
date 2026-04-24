import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const mainOutDir = path.join('dist-electron', 'main');
const bootstrapSource = path.join('src', 'main', 'bootstrap.cjs');
const bootstrapTarget = path.join(mainOutDir, 'bootstrap.cjs');
const esbuildBin = path.join(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild',
);

fs.mkdirSync(mainOutDir, { recursive: true });
fs.copyFileSync(bootstrapSource, bootstrapTarget);

execFileSync(
  esbuildBin,
  [
    path.join('src', 'main', 'preload.ts'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--external:electron',
    `--outfile=${path.join(mainOutDir, 'preload.cjs')}`,
  ],
  { stdio: 'inherit' },
);
