import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const requiredFiles = [
  'dist/index.html',
  packageJson.main,
  'dist-electron/main/index.js',
  'dist-electron/main/preload.cjs',
  'build-resources/icon.png',
];

const missingFiles = requiredFiles.filter((relativePath) => {
  return !relativePath || !fs.existsSync(path.join(root, relativePath));
});

if (missingFiles.length > 0) {
  console.error(`Missing build output files: ${missingFiles.join(', ')}`);
  process.exit(1);
}

const builderFiles = packageJson.build?.files ?? [];
const expectedBuilderGlobs = ['dist/**/*', 'dist-electron/**/*', 'package.json'];
const missingBuilderGlobs = expectedBuilderGlobs.filter((glob) => !builderFiles.includes(glob));

if (missingBuilderGlobs.length > 0) {
  console.error(`electron-builder files is missing: ${missingBuilderGlobs.join(', ')}`);
  process.exit(1);
}

const bootstrapOutput = fs.readFileSync(path.join(root, packageJson.main), 'utf8');
const mainOutput = fs.readFileSync(path.join(root, 'dist-electron/main/index.js'), 'utf8');
const preloadOutput = fs.readFileSync(path.join(root, 'dist-electron/main/preload.cjs'), 'utf8');

if (!bootstrapOutput.includes('__TASKPLANE_ELECTRON__') || !bootstrapOutput.includes("import('./index.js')")) {
  console.error('Electron bootstrap output does not load the ESM main entrypoint.');
  process.exit(1);
}

if (!mainOutput.includes('dist') || !mainOutput.includes('index.html')) {
  console.error('Electron main output does not reference the packaged renderer index.html.');
  process.exit(1);
}

if (
  !preloadOutput.includes('contextBridge.exposeInMainWorld') ||
  !preloadOutput.includes('"api"') ||
  !preloadOutput.includes('run:trigger') ||
  !preloadOutput.includes('task:transition')
) {
  console.error('Preload output does not expose the expected window.api bridge.');
  process.exit(1);
}

console.log('Build smoke check passed.');
