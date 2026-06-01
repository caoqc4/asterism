import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const productName = packageJson.productName;
const executablePath = path.join(root, 'release/mac-arm64', `${productName}.app`, 'Contents/MacOS', productName);
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-task-files-smoke-'));
const workspacePath = path.join(userDataPath, 'workspace');
const smokePath = path.join(userDataPath, 'task-files-smoke.log');
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

function seedTaskFileFixture() {
  const database = new Database(dbPath, { fileMustExist: true });

  try {
    const taskId = 'task_packaged_task_files';
    const fileId = 'task_file_packaged_notes';
    const runId = 'run_packaged_patch_apply';
    const artifactId = 'artifact_packaged_reviewed_patch';
    const checkpointId = 'run_checkpoint_packaged_patch_apply';
    const decisionId = 'decision_packaged_patch_apply';
    const promotionId = 'sandbox_patch_promotion_packaged_apply';
    const sourceId = 'sandbox_source_packaged_apply';
    const patchFile = 'packaged-apply.md';
    const blockedRunId = 'run_packaged_patch_blocked';
    const blockedArtifactId = 'artifact_packaged_reviewed_patch_blocked';
    const blockedCheckpointId = 'run_checkpoint_packaged_patch_blocked';
    const blockedDecisionId = 'decision_packaged_patch_blocked';
    const blockedPromotionId = 'sandbox_patch_promotion_packaged_blocked';
    const blockedSourceId = 'sandbox_source_packaged_blocked';
    const blockedPatchFile = 'packaged-blocked.md';
    const now = '2026-05-05T09:00:00.000Z';
    const patchDiff = [
      `--- a/${patchFile}`,
      `+++ b/${patchFile}`,
      '@@',
      '-alpha packaged apply',
      '+beta packaged apply',
    ].join('\n');
    const patchDigest = `sha256:${createHash('sha256').update(patchDiff, 'utf8').digest('hex')}`;
    const artifactContent = JSON.stringify({
      artifact: {
        commandLogs: [],
        diff: patchDiff,
        files: [patchFile],
        kind: 'patch',
        riskSummary: 'Packaged smoke reviewed patch.',
        summary: 'Reviewable smoke patch',
      },
      review: {
        audit: null,
        sandboxSessionId: sourceId,
        sessionSummary: `sandbox=${sourceId}`,
      },
    });
    const checkpointPayload = JSON.stringify({
      version: 1,
      kind: 'patch_promotion',
      artifactId,
      artifactSummary: 'Reviewable smoke patch',
      sourceId,
      sessionId: sourceId,
      descriptorId: 'workspace.staged_patch',
      decisionId,
      decisionTitle: '确认应用 packaged reviewed patch',
      expectedFiles: [patchFile],
      patchDigest,
      policySnapshot: {
        descriptorId: 'workspace.staged_patch',
      },
      preview: patchDiff,
    });
    const blockedPatchDiff = [
      `--- a/${blockedPatchFile}`,
      `+++ b/${blockedPatchFile}`,
      '@@',
      '-alpha packaged blocked',
      '+beta packaged blocked',
    ].join('\n');
    const blockedPatchDigest = `sha256:${createHash('sha256').update(blockedPatchDiff, 'utf8').digest('hex')}`;
    const blockedArtifactContent = JSON.stringify({
      artifact: {
        commandLogs: [],
        diff: blockedPatchDiff,
        files: [blockedPatchFile],
        kind: 'patch',
        riskSummary: 'Packaged smoke reviewed patch should block after workspace drift.',
        summary: 'Reviewable blocked smoke patch',
      },
      review: {
        audit: null,
        sandboxSessionId: blockedSourceId,
        sessionSummary: `sandbox=${blockedSourceId}`,
      },
    });
    const blockedCheckpointPayload = JSON.stringify({
      version: 1,
      kind: 'patch_promotion',
      artifactId: blockedArtifactId,
      artifactSummary: 'Reviewable blocked smoke patch',
      sourceId: blockedSourceId,
      sessionId: blockedSourceId,
      descriptorId: 'workspace.staged_patch',
      decisionId: blockedDecisionId,
      decisionTitle: '确认应用 packaged blocked reviewed patch',
      expectedFiles: [blockedPatchFile],
      patchDigest: blockedPatchDigest,
      policySnapshot: {
        descriptorId: 'workspace.staged_patch',
      },
      preview: blockedPatchDiff,
    });

    database.transaction(() => {
      database
        .prepare(`
          INSERT INTO tasks (
            id, title, summary, state, next_step, waiting_reason,
            risk_level, risk_note, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          taskId,
          'Packaged Task files fixture',
          'Seeded task for packaged task file smoke.',
          'planned',
          'Open and save the seeded task file.',
          null,
          'none',
          null,
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO task_files (id, task_id, name, path, kind, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          fileId,
          taskId,
          'Smoke note.md',
          'Notes/smoke-note.md',
          'file',
          'Initial packaged task file content.',
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO runs (
            id, task_id, type, status, instructions, output, output_source,
            failure_reason, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          runId,
          taskId,
          'agent',
          'completed',
          'Review a sandbox patch for packaged apply smoke.',
          'Reviewed patch promotion is ready for explicit apply.',
          'ai',
          null,
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO runs (
            id, task_id, type, status, instructions, output, output_source,
            failure_reason, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          blockedRunId,
          taskId,
          'agent',
          'completed',
          'Review a sandbox patch that should block after workspace drift.',
          'Reviewed patch promotion is ready, but workspace drift should block apply.',
          'ai',
          null,
          now,
          now,
        );

      const insertRunStep = database.prepare(`
        INSERT INTO run_steps (
          id, run_id, step_index, kind, status, title, input, output, error,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertRunStep.run(
        'run_step_packaged_patch_apply_runtime',
        runId,
        0,
        'runtime_contract',
        'completed',
        'selected runtime contract',
        null,
        'runtime=codex\nsandbox=read-only',
        null,
        now,
        now,
      );
      insertRunStep.run(
        'run_step_packaged_patch_blocked_runtime',
        blockedRunId,
        0,
        'runtime_contract',
        'completed',
        'selected runtime contract',
        null,
        'runtime=codex\nsandbox=read-only',
        null,
        now,
        now,
      );

      database
        .prepare(`
          INSERT INTO artifacts (
            id, task_id, source_type, source_id, kind, title, content, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          artifactId,
          taskId,
          'run',
          runId,
          'patch',
          'Reviewable smoke patch',
          artifactContent,
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO artifacts (
            id, task_id, source_type, source_id, kind, title, content, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          blockedArtifactId,
          taskId,
          'run',
          blockedRunId,
          'patch',
          'Reviewable blocked smoke patch',
          blockedArtifactContent,
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO run_checkpoints (
            id, run_id, step_id, kind, status, payload, created_at, resolved_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          checkpointId,
          runId,
          null,
          'patch_promotion',
          'resolved',
          checkpointPayload,
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO run_checkpoints (
            id, run_id, step_id, kind, status, payload, created_at, resolved_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          blockedCheckpointId,
          blockedRunId,
          null,
          'patch_promotion',
          'resolved',
          blockedCheckpointPayload,
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO decision_requests (
            id, task_id, title, status, scope, kind, source_type, source_id,
            source_label, context, options, recommendation, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          decisionId,
          taskId,
          '确认应用 packaged reviewed patch',
          'approved',
          'task',
          'direction_choice',
          'agent_checkpoint',
          checkpointId,
          'workspace.staged_patch',
          JSON.stringify({ boundary: 'packaged smoke approved reviewed patch apply' }),
          JSON.stringify([]),
          null,
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO decision_requests (
            id, task_id, title, status, scope, kind, source_type, source_id,
            source_label, context, options, recommendation, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          blockedDecisionId,
          taskId,
          '确认应用 packaged blocked reviewed patch',
          'approved',
          'task',
          'direction_choice',
          'agent_checkpoint',
          blockedCheckpointId,
          'workspace.staged_patch',
          JSON.stringify({ boundary: 'packaged smoke blocked reviewed patch apply' }),
          JSON.stringify([]),
          null,
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO sandbox_patch_promotions (
            id, checkpoint_id, run_id, task_id, artifact_id, source_id, decision_id,
            patch_digest, expected_files, status, audit_summary, blocked_reasons,
            created_at, updated_at, applied_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          promotionId,
          checkpointId,
          runId,
          taskId,
          artifactId,
          sourceId,
          decisionId,
          patchDigest,
          JSON.stringify([patchFile]),
          'pending',
          'Packaged smoke reviewed patch is approved but unapplied.',
          JSON.stringify([]),
          now,
          now,
          null,
        );

      database
        .prepare(`
          INSERT INTO sandbox_patch_promotions (
            id, checkpoint_id, run_id, task_id, artifact_id, source_id, decision_id,
            patch_digest, expected_files, status, audit_summary, blocked_reasons,
            created_at, updated_at, applied_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          blockedPromotionId,
          blockedCheckpointId,
          blockedRunId,
          taskId,
          blockedArtifactId,
          blockedSourceId,
          blockedDecisionId,
          blockedPatchDigest,
          JSON.stringify([blockedPatchFile]),
          'pending',
          'Packaged smoke reviewed patch should block when workspace content drifts.',
          JSON.stringify([]),
          now,
          now,
          null,
        );
    })();
  } finally {
    database.close();
  }
}

function assertSavedContent() {
  const database = new Database(dbPath, { fileMustExist: true });

  try {
    const row = database
      .prepare('SELECT content FROM task_files WHERE id = ?')
      .get('task_file_packaged_notes');

    if (!row?.content?.includes('Edited by packaged task file smoke.')) {
      throw new Error('Task file content did not persist after packaged UI save.');
    }
  } finally {
    database.close();
  }
}

function assertPatchPromotionApplied() {
  const workspaceFile = path.join(workspacePath, 'packaged-apply.md');
  const content = fs.readFileSync(workspaceFile, 'utf8');
  if (content !== 'beta packaged apply\n') {
    throw new Error('Reviewed patch promotion did not update the packaged smoke workspace file.');
  }

  const database = new Database(dbPath, { fileMustExist: true });

  try {
    const promotion = database
      .prepare('SELECT status, audit_summary, applied_at FROM sandbox_patch_promotions WHERE id = ?')
      .get('sandbox_patch_promotion_packaged_apply');
    const evidence = database
      .prepare('SELECT output FROM run_steps WHERE run_id = ? ORDER BY step_index DESC LIMIT 1')
      .get('run_packaged_patch_apply');

    if (promotion?.status !== 'applied' || !promotion.applied_at) {
      throw new Error('Packaged UI apply did not mark the patch promotion as applied.');
    }
    if (!promotion.audit_summary?.includes('Sandbox patch promotion applied')) {
      throw new Error('Packaged UI apply did not record applied audit summary.');
    }
    if (!evidence?.output?.includes('Touched files: packaged-apply.md')) {
      throw new Error('Packaged UI apply did not record touched-file run evidence.');
    }
  } finally {
    database.close();
  }
}

function assertPatchPromotionBlocked() {
  const workspaceFile = path.join(workspacePath, 'packaged-blocked.md');
  const content = fs.readFileSync(workspaceFile, 'utf8');
  if (content !== 'operator drift packaged blocked\n') {
    throw new Error('Blocked reviewed patch promotion unexpectedly changed the drifted workspace file.');
  }

  const database = new Database(dbPath, { fileMustExist: true });

  try {
    const promotion = database
      .prepare('SELECT status, audit_summary, blocked_reasons, applied_at FROM sandbox_patch_promotions WHERE id = ?')
      .get('sandbox_patch_promotion_packaged_blocked');
    const evidence = database
      .prepare('SELECT status, output FROM run_steps WHERE run_id = ? ORDER BY step_index DESC LIMIT 1')
      .get('run_packaged_patch_blocked');

    if (promotion?.status !== 'blocked' || promotion.applied_at) {
      throw new Error('Packaged UI blocked apply did not mark the patch promotion as blocked.');
    }
    if (!promotion.audit_summary?.includes('Sandbox patch promotion apply blocked')) {
      throw new Error('Packaged UI blocked apply did not record blocked audit summary.');
    }
    if (!promotion.blocked_reasons?.includes('Patch promotion workspace content does not match reviewed base: packaged-blocked.md')) {
      throw new Error('Packaged UI blocked apply did not persist the workspace-drift reason.');
    }
    if (evidence?.status !== 'failed' || !evidence.output?.includes('No workspace files were written.')) {
      throw new Error('Packaged UI blocked apply did not record no-write run evidence.');
    }
  } finally {
    database.close();
  }
}

async function assertTaskFileWorkspace(page) {
  await page.getByRole('button', { name: 'Legacy Tasks' }).click();
  await page.getByRole('button', { name: '任务目录' }).click();
  await page.locator('.task-row', { hasText: 'Packaged Task files fixture' }).click();
  await page.getByRole('heading', { name: 'Packaged Task files fixture' }).waitFor();
  await page.getByRole('button', { name: /Smoke note\.md/ }).click();
  await page.getByText('Smoke note.md').first().waitFor();
  await page.getByText('文件').first().waitFor();
  await page.getByText('Task file', { exact: true }).waitFor();

  const editor = page.locator('textarea.file-editor');
  await editor.fill('Initial packaged task file content.\n\nEdited by packaged task file smoke.');
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByText('Saved').waitFor();

  await page.getByRole('button', { name: /Reviewable smoke patch/ }).click();
  await page.getByText(/promotion 已审批，未应用/).waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '应用到工作区' }).click();
  await page.getByText(/promotion apply 完成/).waitFor();

  await page.getByRole('button', { name: /Reviewable blocked smoke patch/ }).click();
  await page.getByText(/promotion 已审批，未应用/).waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '应用到工作区' }).click();
  await page.getByText(/promotion apply 阻塞/).waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged task files smoke requires macOS.');
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
      TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY: 'true',
      TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
      TASKPLANE_WORKSPACE_ROOT: workspacePath,
    },
    timeout: timeoutMs,
  });

  await waitFor(() => fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0, 'packaged app database');
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'packaged-apply.md'), 'alpha packaged apply\n', 'utf8');
  fs.writeFileSync(path.join(workspacePath, 'packaged-blocked.md'), 'operator drift packaged blocked\n', 'utf8');
  seedTaskFileFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertTaskFileWorkspace(page);
  assertSavedContent();
  assertPatchPromotionApplied();
  assertPatchPromotionBlocked();

  await app.close();
  cleanup();
  console.log('macOS packaged task files smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged task files smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
