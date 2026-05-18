import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-external-access-local-inbox-smoke-'));
const inboxPath = path.join(userDataPath, 'external-inbox');
const smokePath = path.join(userDataPath, 'external-access-local-inbox-smoke.log');
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

function prepareInbox() {
  fs.mkdirSync(inboxPath, { recursive: true });
  fs.writeFileSync(
    path.join(inboxPath, 'customer-confirmation.md'),
    '# Packaged local inbox evidence\nCustomer confirmed the launch window.',
    'utf8',
  );
}

async function assertExternalAccessLocalInboxSurface(page) {
  await page.evaluate(async () => {
    await window.api.createTask({
      title: 'Packaged local inbox task',
      summary: 'Validate External Access source review smoke.',
      taskType: 'simple',
    });
  });
  await page.getByRole('button', { name: 'External Access' }).click();
  await page.getByRole('heading', { name: 'External Access' }).waitFor();
  await page.getByText('授权后只处理相关新信号').waitFor();
  const connectedRow = page.locator('.ctx-source-row').filter({ hasText: 'Local Inbox' });
  await connectedRow.getByText('Local Inbox', { exact: true }).waitFor();
  await connectedRow.getByText(path.basename(inboxPath)).waitFor();
  await connectedRow.getByText('已连接').waitFor();
  await page.getByText('连接器状态').waitFor();
  await page.getByText('探测策略').waitFor();
  await page.getByText('入库边界').waitFor();
  await page.getByText('先质检，再确认').waitFor();
  await page.getByText('来源入库复核').waitFor();
  await page.waitForFunction(() => {
    const select = document.querySelector('#external-source-task');
    return select instanceof HTMLSelectElement
      && Array.from(select.options).some((option) => option.textContent === 'Packaged local inbox task');
  });
  await page.getByText('尚未预览外部来源。').waitFor();
  await page.getByRole('button', { name: '预览来源' }).click();
  await page.getByText('Packaged local inbox evidence', { exact: true }).waitFor();
  await page.getByText('可写入', { exact: true }).waitFor();
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: '确认写入' }).click();
  await page.getByText(/已写入 1 条来源/).waitFor();
  await page.getByText('可用').waitFor();
  await page.getByText('connected=1 / pending=0 / errors=0').waitFor();
  await page.getByRole('button', { name: '+ 连接来源' }).waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged External Access local inbox smoke requires macOS.');
}

if (!fs.existsSync(executablePath)) {
  fail(`Missing packaged app executable: ${executablePath}`);
}

let app;

try {
  prepareInbox();
  app = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      TASKPLANE_USER_DATA_DIR: userDataPath,
      TASKPLANE_ENABLE_SCHEDULER: 'false',
      TASKPLANE_EXTERNAL_ACCESS_LOCAL_INBOX_DIR: inboxPath,
      TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
    },
    timeout: timeoutMs,
  });

  await waitFor(() => fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0, 'packaged app database');
  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertExternalAccessLocalInboxSurface(page);

  await app.close();
  cleanup();
  console.log('macOS packaged External Access local inbox smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged External Access local inbox smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
