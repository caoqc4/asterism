import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as asar from '@electron/asar';

const root = process.cwd();
const appPath = path.join(root, 'release/mac-arm64/Taskplane.app');
const contentsPath = path.join(appPath, 'Contents');
const resourcesPath = path.join(contentsPath, 'Resources');
const infoPlistPath = path.join(contentsPath, 'Info.plist');
const executablePath = path.join(contentsPath, 'MacOS/Taskplane');
const appAsarPath = path.join(resourcesPath, 'app.asar');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertExists(relativePath) {
  const absolutePath = path.join(root, relativePath);

  if (!fs.existsSync(absolutePath)) {
    fail(`Missing packaged app file: ${relativePath}`);
  }

  return absolutePath;
}

function readInfoPlist() {
  if (process.platform !== 'darwin') {
    fail('macOS package smoke check requires macOS.');
  }

  const output = execFileSync('plutil', ['-convert', 'json', '-o', '-', infoPlistPath], {
    encoding: 'utf8',
  });

  return JSON.parse(output);
}

assertExists('release/mac-arm64/Taskplane.app');
assertExists('release/mac-arm64/Taskplane.app/Contents/Info.plist');
assertExists('release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
assertExists('release/mac-arm64/Taskplane.app/Contents/Resources/app.asar');
assertExists('release/mac-arm64/Taskplane.app/Contents/Resources/icon.icns');
assertExists('release/mac-arm64/Taskplane.app/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3');
assertExists('release/mac-arm64/Taskplane.app/Contents/Resources/app.asar.unpacked/node_modules/keytar');
assertExists('release/mac-arm64/Taskplane.app/Contents/_CodeSignature/CodeResources');

const executableStat = fs.statSync(executablePath);

if ((executableStat.mode & 0o111) === 0) {
  fail('Packaged app executable is not executable.');
}

const info = readInfoPlist();

const expectedInfo = {
  CFBundleDisplayName: packageJson.productName,
  CFBundleExecutable: packageJson.productName,
  CFBundleIdentifier: packageJson.build?.appId,
  CFBundleShortVersionString: packageJson.version,
  CFBundleVersion: packageJson.version,
};

for (const [key, expected] of Object.entries(expectedInfo)) {
  if (info[key] !== expected) {
    fail(`Info.plist ${key} expected ${expected}, received ${info[key] ?? 'missing'}.`);
  }
}

if (!info.ElectronAsarIntegrity?.['Resources/app.asar']?.hash) {
  fail('Info.plist is missing Electron ASAR integrity metadata.');
}

const asarFiles = asar.listPackage(appAsarPath);
const requiredAsarFiles = [
  '/dist/index.html',
  '/dist-electron/main/index.js',
  '/dist-electron/main/bootstrap/runtime-paths.js',
  '/dist-electron/main/domain/task/task-service.js',
  '/dist-electron/main/preload.cjs',
  '/dist-electron/shared/working-context/timeline.js',
  '/package.json',
];
const missingAsarFiles = requiredAsarFiles.filter((filePath) => !asarFiles.includes(filePath));

if (missingAsarFiles.length > 0) {
  fail(`app.asar is missing required files: ${missingAsarFiles.join(', ')}`);
}

const rendererBundles = asarFiles.filter((filePath) => /^\/dist\/assets\/index-.*\.js$/.test(filePath));

if (rendererBundles.length === 0) {
  fail('app.asar is missing the renderer JavaScript bundle.');
}

const rendererBundleText = rendererBundles
  .map((filePath) => asar.extractFile(appAsarPath, filePath.slice(1)).toString('utf8'))
  .join('\n');
const requiredRendererMarkers = ['AI Runtime', 'Agent CLI runtimes', '模型服务配置', '使用此方式', '重新检测'];

for (const marker of requiredRendererMarkers) {
  if (!rendererBundleText.includes(marker)) {
    fail(`packaged renderer bundle is missing AI Runtime marker: ${marker}`);
  }
}

const staleRendererMarkers = ['配置 AI Provider 密钥'];

for (const marker of staleRendererMarkers) {
  if (rendererBundleText.includes(marker)) {
    fail(`packaged renderer bundle still contains stale Model page marker: ${marker}`);
  }
}

const packagedTestFiles = asarFiles.filter((filePath) =>
  filePath.startsWith('/dist-electron/') &&
  (filePath.endsWith('.test.js') || filePath.endsWith('.integration.test.js'))
);

if (packagedTestFiles.length > 0) {
  fail(`app.asar must not include compiled test files: ${packagedTestFiles.slice(0, 5).join(', ')}`);
}

execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
  stdio: 'inherit',
});

console.log('macOS package smoke check passed.');
