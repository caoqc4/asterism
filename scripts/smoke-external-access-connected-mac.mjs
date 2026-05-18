import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-external-access-connected-smoke-'));
const smokePath = path.join(userDataPath, 'external-access-connected-smoke.log');
const dbPath = path.join(userDataPath, 'taskplane.db');
const timeoutMs = 20_000;
const pollMs = 250;

const fixtureStatus = JSON.stringify({
  updatedAt: '2026-05-17T10:00:00.000Z',
  sources: [{
    id: 'gmail_fixture',
    label: 'Gmail',
    kind: 'email',
    accountLabel: 'user@example.com',
    status: 'connected',
    lastSyncAt: '2026-05-17T09:30:00.000Z',
  }],
});

function cleanup() {
  fs.rmSync(userDataPath, { recursive: true, force: true });
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
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

async function assertExternalAccessConnectedSurface(page) {
  await page.getByRole('button', { name: 'External Access' }).click();
  await page.getByRole('heading', { name: 'External Access' }).waitFor();
  await page.getByText('授权后只处理相关新信号').waitFor();
  const connectedRow = page.locator('.ctx-source-row').filter({ hasText: 'user@example.com' });
  await connectedRow.getByText('Gmail', { exact: true }).waitFor();
  await connectedRow.getByText('user@example.com').waitFor();
  await connectedRow.getByText('已连接').waitFor();
  await page.getByText('连接器状态').waitFor();
  await page.getByText('探测策略').waitFor();
  await page.getByText('入库边界').waitFor();
  await page.getByText('先质检，再确认').waitFor();
  await page.getByText('来源入库复核').waitFor();
  await page.getByText('没有可选任务').waitFor();
  await page.getByText('尚未预览外部来源。').waitFor();
  await page.getByText('可用').waitFor();
  await page.getByText('connected=1 / pending=0 / errors=0').waitFor();
  await page.getByRole('button', { name: '+ 连接来源' }).waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged External Access connected smoke requires macOS.');
}

if (!fs.existsSync(executablePath)) {
  fail(`Missing packaged app executable: ${executablePath}`);
}

let app;

try {
  app = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      TASKPLANE_USER_DATA_DIR: userDataPath,
      TASKPLANE_ENABLE_SCHEDULER: 'false',
      TASKPLANE_EXTERNAL_ACCESS_FIXTURE_JSON: fixtureStatus,
      TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
    },
    timeout: timeoutMs,
  });

  await waitFor(() => fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0, 'packaged app database');
  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertExternalAccessConnectedSurface(page);

  await app.close();
  cleanup();
  console.log('macOS packaged External Access connected smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged External Access connected smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
