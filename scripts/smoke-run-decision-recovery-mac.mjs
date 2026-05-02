import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-run-decision-recovery-smoke-'));
const smokePath = path.join(userDataPath, 'run-decision-recovery-smoke.log');
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
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

function seedRunDecisionRecoveryFixture() {
  const database = new Database(dbPath, {
    fileMustExist: true,
  });

  try {
    const taskId = 'task_packaged_run_decision_recovery';
    const terminalRunId = 'run_packaged_terminal_agent';
    const cancelledRunId = 'run_packaged_cancelled_agent';
    const staleRunId = 'run_packaged_stale_agent';
    const checkpointRunId = 'run_packaged_checkpoint_agent';
    const appliedPatchRunId = 'run_packaged_staged_patch_applied';
    const checkpointId = 'checkpoint_packaged_workspace_patch';
    const checkpointStepId = 'run_step_packaged_checkpoint';
    const appliedPatchCheckpointId = 'checkpoint_packaged_staged_patch_applied';

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
          'Packaged Run Decision recovery fixture',
          'Seeded task for packaged Run and Decision recovery smoke.',
          'running',
          'Review terminal run and checkpoint Decision recovery.',
          null,
          'none',
          null,
          '2026-05-02T09:00:00.000Z',
          '2026-05-02T09:40:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO completion_criteria (
            id, task_id, text, verification_responsibility,
            verification_responsibility_label, status, created_at, updated_at,
            satisfied_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'criteria_packaged_staged_patch_applied',
          taskId,
          'Applied staged patch evidence has been checked against the task outcome',
          'self',
          'Operator verifies promoted workspace changes',
          'open',
          '2026-05-02T09:01:00.000Z',
          '2026-05-02T09:01:00.000Z',
          null,
        );

      const insertRun = database.prepare(`
        INSERT INTO runs (
          id, task_id, type, status, instructions, output, output_source,
          failure_reason, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertRun.run(
        terminalRunId,
        taskId,
        'agent',
        'completed',
        'Packaged terminal recovery smoke.',
        'Packaged terminal agent final output.',
        'ai',
        null,
        '2026-05-02T09:25:00.000Z',
        '2026-05-02T09:35:00.000Z',
      );

      insertRun.run(
        checkpointRunId,
        taskId,
        'agent',
        'needs_confirmation',
        'Packaged checkpoint recovery smoke.',
        'Workspace patch checkpoint pending.',
        'system',
        null,
        '2026-05-02T09:05:00.000Z',
        '2026-05-02T09:10:00.000Z',
      );

      insertRun.run(
        appliedPatchRunId,
        taskId,
        'agent',
        'completed',
        'Code Agent manual sandbox producer preview.',
        `Sandbox patch promotion applied / checkpoint=${appliedPatchCheckpointId} / files=src/recovery.md`,
        'system',
        null,
        '2026-05-02T09:26:00.000Z',
        '2026-05-02T09:30:00.000Z',
      );

      insertRun.run(
        cancelledRunId,
        taskId,
        'agent',
        'failed',
        'Packaged cancelled-session recovery smoke.',
        'Agent session cancelled by operator.',
        'system',
        'cancelled by operator',
        '2026-05-02T09:15:00.000Z',
        '2026-05-02T09:20:00.000Z',
      );

      insertRun.run(
        staleRunId,
        taskId,
        'agent',
        'running',
        'Packaged interrupted-or-stale recovery smoke.',
        'Agent plan accepted before interruption.',
        'system',
        null,
        '2026-05-02T09:21:00.000Z',
        '2026-05-02T09:22:00.000Z',
      );

      database
        .prepare(`
          INSERT INTO agent_sessions (
            id, run_id, mode, status, capabilities, metadata, created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'agent_session_packaged_terminal',
          terminalRunId,
          'agent',
          'completed',
          JSON.stringify({
            fileContext: true,
            longRunningSessions: true,
            streaming: false,
            structuredToolCalls: false,
            taskMutationTools: false,
            textOnlyPlanning: true,
          }),
          'executor=packaged_smoke\nloop=terminal_evidence',
          '2026-05-02T09:25:00.000Z',
          '2026-05-02T09:35:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO agent_sessions (
            id, run_id, mode, status, capabilities, metadata, created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'agent_session_packaged_cancelled',
          cancelledRunId,
          'agent',
          'cancelled',
          JSON.stringify({
            fileContext: true,
            longRunningSessions: true,
            streaming: false,
            structuredToolCalls: false,
            taskMutationTools: false,
            textOnlyPlanning: true,
          }),
          'executor=packaged_smoke\nloop=cancelled_evidence',
          '2026-05-02T09:15:00.000Z',
          '2026-05-02T09:20:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO agent_sessions (
            id, run_id, mode, status, capabilities, metadata, created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'agent_session_packaged_stale',
          staleRunId,
          'agent',
          'running',
          JSON.stringify({
            fileContext: true,
            longRunningSessions: true,
            streaming: false,
            structuredToolCalls: false,
            taskMutationTools: false,
            textOnlyPlanning: true,
          }),
          'executor=packaged_smoke\nloop=stale_plan',
          '2026-05-02T09:21:00.000Z',
          '2026-05-02T09:22:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO run_steps (
            id, run_id, step_index, kind, status, title, input, output, error,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'run_step_packaged_terminal',
          terminalRunId,
          7,
          'final',
          'completed',
          '最终输出已生成',
          null,
          'Packaged terminal agent final output.',
          null,
          '2026-05-02T09:35:00.000Z',
          '2026-05-02T09:35:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO run_steps (
            id, run_id, step_index, kind, status, title, input, output, error,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'run_step_packaged_cancelled',
          cancelledRunId,
          7,
          'final',
          'failed',
          'Agent session 已取消',
          null,
          'Cancelled by operator.',
          null,
          '2026-05-02T09:20:00.000Z',
          '2026-05-02T09:20:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO run_steps (
            id, run_id, step_index, kind, status, title, input, output, error,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'run_step_packaged_stale_plan',
          staleRunId,
          4,
          'plan',
          'completed',
          '采用模型提出的 agent 步骤计划',
          null,
          '1. task.inspect_context\n2. task.inspect_timeline\n3. artifact.create_note',
          null,
          '2026-05-02T09:22:00.000Z',
          '2026-05-02T09:22:00.000Z',
        );

      const insertStep = database.prepare(`
        INSERT INTO run_steps (
          id, run_id, step_index, kind, status, title, input, output, error,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      database
        .prepare(`
          INSERT INTO run_steps (
            id, run_id, step_index, kind, status, title, input, output, error,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          checkpointStepId,
          checkpointRunId,
          1,
          'checkpoint',
          'pending',
          'Workspace patch requires confirmation',
          null,
          `checkpoint=${checkpointId}`,
          null,
          '2026-05-02T09:10:00.000Z',
          '2026-05-02T09:10:00.000Z',
        );

      insertStep.run(
        'run_step_packaged_staged_patch_source',
        appliedPatchRunId,
        1,
        'artifact',
        'completed',
        'Sandbox producer source ready',
        'session=sandboxed_producer:packaged_source_applied\nsource=packaged_source_applied\nfiles=src/recovery.md',
        'Sandbox patch review run plan ready: src/recovery.md',
        null,
        '2026-05-02T09:27:00.000Z',
        '2026-05-02T09:27:00.000Z',
      );

      insertStep.run(
        'run_step_packaged_staged_patch_check',
        appliedPatchRunId,
        2,
        'tool_result',
        'completed',
        'Sandbox producer check passed: lint',
        null,
        'lint passed',
        null,
        '2026-05-02T09:28:00.000Z',
        '2026-05-02T09:28:00.000Z',
      );

      insertStep.run(
        'run_step_packaged_staged_patch_apply',
        appliedPatchRunId,
        3,
        'checkpoint',
        'completed',
        '提升已应用：Apply packaged Code Agent preview',
        null,
        `Sandbox patch promotion applied / checkpoint=${appliedPatchCheckpointId} / files=src/recovery.md`,
        null,
        '2026-05-02T09:30:00.000Z',
        '2026-05-02T09:30:00.000Z',
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
          checkpointRunId,
          checkpointStepId,
          'confirmation',
          'open',
          JSON.stringify({
            version: 1,
            kind: 'tool_permission',
            tool: 'workspace.write_patch',
            risk: 'local_write',
            input: {
              diffPreview: [
                'Summary: Update packaged recovery notes',
                'Files: src/recovery.md',
                '*** Begin Patch',
                '*** Update File: src/recovery.md',
                '+Packaged checkpoint recovery smoke',
                '*** End Patch',
              ].join('\n'),
              expectedFiles: ['src/recovery.md'],
            },
            decisionId: 'decision_packaged_workspace_patch',
            decisionTitle: '确认本地写入：workspace.write_patch',
          }),
          '2026-05-02T09:10:00.000Z',
          null,
        );

      database
        .prepare(`
          INSERT INTO run_checkpoints (
            id, run_id, step_id, kind, status, payload, created_at, resolved_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          appliedPatchCheckpointId,
          appliedPatchRunId,
          'run_step_packaged_staged_patch_source',
          'patch_promotion',
          'resolved',
          JSON.stringify({
            version: 1,
            kind: 'patch_promotion',
            artifactId: 'artifact_packaged_staged_patch_applied',
            artifactSummary: '1 file(s): src/recovery.md | Checks: lint: passed.',
            sessionId: 'sandboxed_producer:packaged_source_applied',
            descriptorId: 'workspace.staged_patch',
            decisionId: 'decision_packaged_staged_patch_applied',
            decisionTitle: 'Apply packaged Code Agent preview',
            expectedFiles: ['src/recovery.md'],
            patchDigest: 'sha256:packaged-smoke',
            policySnapshot: {
              descriptorId: 'workspace.staged_patch',
            },
            preview: [
              'Summary: Update packaged recovery notes',
              'Files: src/recovery.md',
              '*** Begin Patch',
              '*** Update File: src/recovery.md',
              '+Packaged staged patch recovery smoke',
              '*** End Patch',
            ].join('\n'),
          }),
          '2026-05-02T09:27:00.000Z',
          '2026-05-02T09:30:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO decision_requests (
            id, task_id, title, status, source_type, source_id,
            source_label, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'decision_packaged_workspace_patch',
          taskId,
          '确认本地写入：workspace.write_patch',
          'pending',
          'agent_checkpoint',
          checkpointId,
          'workspace.write_patch',
          '2026-05-02T09:31:00.000Z',
          '2026-05-02T09:31:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO decision_requests (
            id, task_id, title, status, source_type, source_id,
            source_label, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'decision_packaged_staged_patch_applied',
          taskId,
          'Apply packaged Code Agent preview',
          'approved',
          'agent_checkpoint',
          appliedPatchCheckpointId,
          'workspace.staged_patch',
          '2026-05-02T09:29:00.000Z',
          '2026-05-02T09:30:00.000Z',
        );
    })();
  } finally {
    database.close();
  }
}

async function openTaskFromTaskList(page, title) {
  await page.getByRole('button', { name: 'Tasks 任务列表、详情与状态流转' }).click();
  await page
    .locator('.task-list-item', { hasText: title })
    .getByRole('button')
    .click();
}

async function openRunCardByStatusAndDetailText(page, status, detailText) {
  const runCards = page
    .locator('.panel', { hasText: 'Run Queue' })
    .locator('.task-card', { hasText: status });
  await runCards.first().waitFor({ timeout: timeoutMs });
  const count = await runCards.count();

  for (let index = 0; index < count; index += 1) {
    await runCards.nth(index).click();
    await page.getByRole('heading', { name: `agent / ${status}` }).waitFor();

    try {
      await page.getByText(detailText).first().waitFor({ timeout: 4_000 });
      return;
    } catch {
      // Keep scanning same-status run cards until the detail evidence matches.
    }
  }

  throw new Error(`Could not find ${status} run with detail evidence: ${detailText}`);
}

async function assertTerminalRunRecovery(page) {
  await page.getByRole('button', { name: 'Runs 执行记录与结果查看' }).click();
  await openRunCardByStatusAndDetailText(page, 'completed', 'Packaged terminal agent final output.');

  const recoverySafety = page.getByLabel('Run recovery safety');
  await recoverySafety.getByText('Replay review：inspect completed evidence').waitFor();
  await recoverySafety.getByText('Recovery intent：inspect evidence').waitFor();
  await recoverySafety
    .getByText('Recovery anchors：run=run_packaged_terminal_agent / session=agent_session_packaged_terminal / checkpoints=none / action=inspect_evidence')
    .waitFor();
  await page.getByText('Packaged terminal agent final output.').first().waitFor();

  await page.getByRole('button', { name: '回到任务推进' }).click();
  await page.getByRole('heading', { name: 'Packaged Run Decision recovery fixture' }).waitFor();

  const nextStep = await page.getByLabel('Next Step').inputValue();
  if (nextStep !== '审阅最近一次 agent run 的完成证据和输出；旧 session 已终止，不需要恢复或重放。') {
    throw new Error(`Terminal run recovery filled the wrong next step: ${nextStep}`);
  }
}

async function assertAppliedStagedPatchRecovery(page) {
  await page.getByRole('button', { name: 'Runs 执行记录与结果查看' }).click();
  await openRunCardByStatusAndDetailText(
    page,
    'completed',
    'Sandbox patch promotion applied / checkpoint=checkpoint_packaged_staged_patch_applied / files=src/recovery.md',
  );

  await page
    .getByText(
      'Staged patch review：source=packaged_source_applied / files=src/recovery.md / checks=lint passed / promotion=resolved / readiness=already_resolved / Decision=Apply packaged Code Agent preview / workspace promotion applied after Decision approval',
    )
    .waitFor();
  await page
    .getByText('Next review move：next=return to task and verify completion criteria against promoted workspace changes')
    .waitFor();
  await page.getByRole('button', { name: '回到任务验证完成标准' }).click();
  await page.getByRole('heading', { name: 'Packaged Run Decision recovery fixture' }).waitFor();
  await page.getByText('完成判断与收尾标准').waitFor();

  const nextStep = await page.getByLabel('Next Step').inputValue();
  if (nextStep !== '验证已提升的 sandbox patch 是否满足完成标准：src/recovery.md') {
    throw new Error(`Applied staged patch recovery filled the wrong next step: ${nextStep}`);
  }
}

async function assertStaleRunRecovery(page) {
  await page.getByRole('button', { name: 'Runs 执行记录与结果查看' }).click();
  await page
    .locator('.panel', { hasText: 'Run Queue' })
    .locator('.task-card', { hasText: 'running' })
    .click();
  await page.getByRole('heading', { name: 'agent / running' }).waitFor();

  const recoverySafety = page.getByLabel('Run recovery safety');
  await recoverySafety.getByText('Replay review：inspect latest step before any recovery').waitFor();
  await recoverySafety
    .getByText(
      'Recovery intent：prepare new manual run / session=agent_session_packaged_stale / status=running / restartSafety=interrupted_or_stale / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no',
    )
    .waitFor();
  await recoverySafety
    .getByText('Recovery anchors：run=run_packaged_stale_agent / session=agent_session_packaged_stale / checkpoints=none / action=prepare_new_manual_run')
    .waitFor();
  await recoverySafety
    .getByText('Next safe move：确认最近一次 agent run 是否已中断；若没有活动执行器，先基于证据整理输入，再启动新的 run，不自动重放。')
    .waitFor();

  await page.getByRole('button', { name: '回到任务推进' }).click();
  await page.getByRole('heading', { name: 'Packaged Run Decision recovery fixture' }).waitFor();

  const nextStep = await page.getByLabel('Next Step').inputValue();
  if (nextStep !== '确认最近一次 agent run 是否已中断；若没有活动执行器，先基于证据整理输入，再启动新的 run，不自动重放。') {
    throw new Error(`Interrupted/stale run recovery filled the wrong next step: ${nextStep}`);
  }

  const additionalRequirements = await page.getByLabel('附加要求').inputValue();
  if (!additionalRequirements.includes('来源：run=run_packaged_stale_agent / session=agent_session_packaged_stale。')) {
    throw new Error(`Interrupted/stale run recovery filled the wrong source evidence: ${additionalRequirements}`);
  }

  if (!additionalRequirements.includes('restartSafety=interrupted_or_stale')) {
    throw new Error(`Interrupted/stale run recovery missed restart safety: ${additionalRequirements}`);
  }
}

async function assertCancelledRunRecovery(page) {
  await page.getByRole('button', { name: 'Runs 执行记录与结果查看' }).click();
  await page
    .locator('.panel', { hasText: 'Run Queue' })
    .locator('.task-card', { hasText: 'failed' })
    .click();
  await page.getByRole('heading', { name: 'agent / failed' }).waitFor();

  const recoverySafety = page.getByLabel('Run recovery safety');
  await recoverySafety.getByText('Replay review：inspect cancellation evidence before starting a new run').waitFor();
  await recoverySafety
    .getByText(
      'Recovery intent：prepare new manual run / session=agent_session_packaged_cancelled / status=cancelled / restartSafety=new_run_required / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no',
    )
    .waitFor();
  await recoverySafety
    .getByText('Recovery anchors：run=run_packaged_cancelled_agent / session=agent_session_packaged_cancelled / checkpoints=none / action=prepare_new_manual_run')
    .waitFor();

  await page.getByRole('button', { name: '回到任务推进' }).click();
  await page.getByRole('heading', { name: 'Packaged Run Decision recovery fixture' }).waitFor();

  const nextStep = await page.getByLabel('Next Step').inputValue();
  if (nextStep !== '检查最近一次 agent run 的失败或取消证据，整理重试输入后再启动新的 run。') {
    throw new Error(`Cancelled run recovery filled the wrong next step: ${nextStep}`);
  }

  const additionalRequirements = await page.getByLabel('附加要求').inputValue();
  if (!additionalRequirements.includes('来源：run=run_packaged_cancelled_agent / session=agent_session_packaged_cancelled。')) {
    throw new Error(`Cancelled run recovery filled the wrong source evidence: ${additionalRequirements}`);
  }

  if (!additionalRequirements.includes('不要自动重放旧 session；先复核失败/取消/中断证据、补齐输入，再由用户手动启动。')) {
    throw new Error(`Cancelled run recovery missed the no-replay instruction: ${additionalRequirements}`);
  }
}

async function assertCheckpointDecisionRecovery(page) {
  await page.getByRole('button', { name: 'Decisions 待拍板事项与快速动作' }).click();
  await page.getByRole('button', { name: /确认本地写入：workspace\.write_patch/ }).click();
  await page.getByRole('heading', { name: '确认本地写入：workspace.write_patch' }).waitFor();
  await page
    .getByText('来源：Agent checkpoint（workspace.write_patch）。批准后会恢复等待中的工作区 patch 应用并写入受影响文件；延后或取消会终止本次 run，不会继续应用该 patch。')
    .waitFor();

  await page.getByRole('button', { name: '查看 Run 证据' }).click();
  await page.getByRole('heading', { name: 'agent / needs_confirmation' }).waitFor();
  await page.getByText('当前 run 正在等待 checkpoint / Decision 确认；先审阅下方 Checkpoints 和关联 Decision，批准后才会恢复执行。').waitFor();
  await page.getByText('工具：workspace.write_patch').waitFor();
  await page.getByText('文件：src/recovery.md').waitFor();

  await page.getByRole('button', { name: 'Decisions 待拍板事项与快速动作' }).click();
  await page.getByRole('heading', { name: '确认本地写入：workspace.write_patch' }).waitFor();
  await page.getByRole('button', { name: '回到任务推进' }).click();
  await page.getByRole('heading', { name: 'Packaged Run Decision recovery fixture' }).waitFor();

  const nextStep = await page.getByLabel('Next Step').inputValue();
  if (nextStep !== '先审查 workspace.write_patch checkpoint 的 diff 和受影响文件；批准后再回到任务确认 patch 是否已应用。') {
    throw new Error(`Checkpoint Decision recovery filled the wrong next step: ${nextStep}`);
  }
}

async function assertResolvedCodeAgentDecisionRecovery(page) {
  await openTaskFromTaskList(page, 'Packaged Run Decision recovery fixture');
  await page.getByRole('heading', { name: 'Packaged Run Decision recovery fixture' }).waitFor();
  await page.getByText('Code Agent Review').waitFor();
  await page
    .getByText(
      '最近一次 Code Agent sandbox preview 已完成，promotion Decision 已批准；先打开 Run 证据确认 workspace 写入/no-write 状态，再核对完成标准或准备重跑。',
    )
    .waitFor();

  await page.getByRole('button', { name: '打开 promotion Decision' }).click();
  await page.getByRole('heading', { name: 'Apply packaged Code Agent preview' }).waitFor();
  await page
    .getByText('来源：Agent checkpoint（workspace.staged_patch）。该 promotion 已批准；若 apply service 通过预检，Run 证据会记录已写入或已应用状态。')
    .waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged Run/Decision recovery smoke requires macOS.');
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
    },
    timeout: timeoutMs,
  });

  await waitFor(() => fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0, 'packaged app database');
  seedRunDecisionRecoveryFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openTaskFromTaskList(page, 'Packaged Run Decision recovery fixture');
  await assertTerminalRunRecovery(page);
  await assertAppliedStagedPatchRecovery(page);
  await assertStaleRunRecovery(page);
  await assertCancelledRunRecovery(page);
  await assertCheckpointDecisionRecovery(page);
  await assertResolvedCodeAgentDecisionRecovery(page);

  await app.close();
  cleanup();
  console.log('macOS packaged Run/Decision recovery smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged Run/Decision recovery smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
