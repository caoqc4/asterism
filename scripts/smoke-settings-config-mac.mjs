import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-settings-config-smoke-'));
const userDataPath = path.join(tempRoot, 'user-data');
const workspaceRoot = path.join(tempRoot, 'workspace');
const smokePath = path.join(userDataPath, 'settings-config-smoke.log');
const configPath = path.join(userDataPath, 'config.json');
const dbPath = path.join(userDataPath, 'taskplane.db');
const timeoutMs = 20_000;
const pollMs = 250;

function cleanup() {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function fail(message, error) {
  console.error(message);

  if (error) {
    console.error(error);
  }

  cleanup();
  process.exit(1);
}

async function waitFor(condition, description) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

function prepareWorkspace() {
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, 'package.json'),
    JSON.stringify({
      private: true,
      scripts: {
        lint: 'node -e "console.log(\'settings packaged smoke lint ok\')"',
        test: 'node -e "console.log(\'settings packaged smoke test ok\')"',
      },
    }, null, 2),
    'utf8',
  );
}

function buildEnv() {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    TASKPLANE_AI_PROVIDER: '',
    TASKPLANE_AI_MODEL: '',
    TASKPLANE_AI_BASE_URL: '',
    TASKPLANE_AI_API_KEY: '',
    TASKPLANE_ENABLE_SCHEDULER: '',
    TASKPLANE_ENABLE_SANDBOX_CODING_AGENT: '',
    TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY: '',
    TASKPLANE_WORKSPACE_ROOT: '',
    TASKPLANE_USER_DATA_DIR: userDataPath,
    TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
  };
}

async function launchPackagedApp() {
  const app = await electron.launch({
    executablePath,
    env: buildEnv(),
    timeout: timeoutMs,
  });

  await waitFor(() => fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0, 'packaged app database');
  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });

  return { app, page };
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function openSettings(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.getByText('AI 行为').waitFor();
}

async function saveSettings(page) {
  await openSettings(page);
  await page.getByText('Run / Task 自检查').waitFor();
  await page.getByText('自学习（Self-Learn）').waitFor();
  await page.getByText('当前 AI 配置').waitFor();
  await page.getByText(/Step 级检查是执行质量基线/).waitFor();
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.getByRole('button', { name: '已保存 ✓' }).waitFor();

  await waitFor(() => {
    if (!fs.existsSync(configPath)) {
      return false;
    }

    const config = readConfig();
    return config.aiProvider
      && config.aiModel
      && config.featureFlags?.enableSelfCheck === true
      && config.featureFlags?.enableSelfLearn === true
      && config.featureFlags?.enableScheduler === false;
  }, 'packaged Settings config.json write');
}

async function assertPersistedSettings(page) {
  await openSettings(page);
  await page.getByText('Run / Task 自检查').waitFor();
  await page.getByText('自学习（Self-Learn）').waitFor();
  await page.getByText(/真正压缩前会先保留关键决策/).waitFor();
  await page.getByText(/修改 Provider 密钥或切换模型请前往/).waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged Settings config smoke requires macOS.');
}

if (!fs.existsSync(executablePath)) {
  fail(`Missing packaged app executable: ${executablePath}`);
}

prepareWorkspace();

let app;

try {
  ({ app } = await launchPackagedApp());
  await saveSettings(await app.firstWindow({ timeout: timeoutMs }));
  await app.close();

  ({ app } = await launchPackagedApp());
  await assertPersistedSettings(await app.firstWindow({ timeout: timeoutMs }));
  await app.close();

  cleanup();
  console.log('macOS packaged Settings config smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged Settings config smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
