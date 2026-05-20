import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-external-access-smoke-'));
const smokePath = path.join(userDataPath, 'external-access-smoke.log');
const dbPath = path.join(userDataPath, 'taskplane.db');
const timeoutMs = 20_000;
const pollMs = 250;

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

async function assertExternalAccessSurface(page) {
  await page.getByRole('button', { name: 'External Access' }).click();
  await page.getByRole('heading', { name: 'External Access' }).waitFor();
  await page.getByText('尚未连接任何来源。').waitFor();
  await page.getByText('授权后只处理相关新信号').waitFor();
  await page.getByText('连接器状态', { exact: true }).waitFor();
  await page.getByText('探测策略').waitFor();
  await page.getByText('入库边界').waitFor();
  await page.getByText('先质检，再确认').waitFor();
  await page.getByText('来源入库复核').waitFor();
  await page.waitForFunction(() => {
    const select = document.querySelector('#external-source-task');
    return select instanceof HTMLSelectElement
      && Array.from(select.options).some((option) => option.textContent === '没有可选任务');
  });
  await page.getByText('尚未预览外部来源。').waitFor();
  const previewButton = page.getByRole('button', { name: '预览来源' });
  await previewButton.waitFor();
  if (!(await previewButton.isDisabled())) {
    throw new Error('External Access source preview should stay disabled without a target task.');
  }
  await page.getByText(/未接入|未连接|已关闭|未知/).first().waitFor();
  await page.getByText('系统默认可选功能').waitFor();
  await page.getByText('默认展示，不会自动授权、探测或同步').waitFor();
  await page.getByText('Gmail').first().waitFor();
  await page.getByRole('button', { name: '授权' }).first().waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged External Access smoke requires macOS.');
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
      TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
    },
    timeout: timeoutMs,
  });

  await waitFor(() => fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0, 'packaged app database');
  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertExternalAccessSurface(page);

  await app.close();
  cleanup();
  console.log('macOS packaged External Access smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged External Access smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
