import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-timeline-ui-smoke-'));
const smokePath = path.join(userDataPath, 'timeline-ui-smoke.log');
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

function seedTimelineFixture() {
  const database = new Database(dbPath, {
    fileMustExist: true,
  });

  try {
    const taskId = 'task_packaged_timeline_ui_smoke';

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
          'Timeline packaged UI fixture',
          'Seeded by packaged Timeline UI smoke.',
          'running',
          'Review packaged Timeline grouping.',
          null,
          'none',
          null,
          '2026-04-30T08:00:00.000Z',
          '2026-05-01T12:00:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO tasks (
            id, title, summary, state, next_step, waiting_reason,
            risk_level, risk_note, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'task_packaged_timeline_upstream',
          'Packaged Timeline upstream fixture',
          'Upstream task for packaged Timeline dependency smoke.',
          'running',
          'Finish upstream Timeline input.',
          null,
          'none',
          null,
          '2026-04-30T07:00:00.000Z',
          '2026-05-01T10:20:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO tasks (
            id, title, summary, state, next_step, waiting_reason,
            risk_level, risk_note, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'task_packaged_home_closeout_evidence',
          'Packaged Home closeout evidence fixture',
          'Near-closeout task for packaged Home closeout evidence return smoke.',
          'running',
          'Review completed run evidence before final closeout.',
          null,
          'none',
          null,
          '2026-04-30T06:00:00.000Z',
          '2026-05-01T09:20:00.000Z',
        );

      const insertTimeline = database.prepare(`
        INSERT INTO timeline_events (id, task_id, type, payload, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      database
        .prepare(`
          INSERT INTO runs (
            id, task_id, type, status, instructions, output, output_source,
            failure_reason, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'run_packaged_ui_1',
          taskId,
          'summarize',
          'completed',
          'Packaged Timeline UI smoke run.',
          'Packaged Timeline UI smoke completed.',
          'system',
          null,
          '2026-05-01T11:50:00.000Z',
          '2026-05-01T12:00:00.000Z',
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
          'run_packaged_home_closeout_evidence',
          'task_packaged_home_closeout_evidence',
          'summarize',
          'completed',
          'Packaged Home closeout evidence smoke run.',
          'Packaged Home closeout evidence completed.',
          'system',
          null,
          '2026-05-01T09:05:00.000Z',
          '2026-05-01T09:15:00.000Z',
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
          'decision_packaged_ui_1',
          taskId,
          'Approve packaged Timeline UI smoke',
          'approved',
          'run',
          'run_packaged_ui_1',
          'Packaged Timeline UI smoke',
          '2026-05-01T11:20:00.000Z',
          '2026-05-01T11:30:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO source_contexts (
            id, task_id, title, kind, is_key, uri, content, note,
            status, created_at, updated_at, archived_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'source_packaged_ui_1',
          taskId,
          'Packaged Timeline notes',
          'note',
          'true',
          null,
          'Source context seeded by packaged Timeline UI smoke.',
          'Verify Timeline object action focuses this material.',
          'active',
          '2026-05-01T10:55:00.000Z',
          '2026-05-01T11:00:00.000Z',
          null,
        );

      database
        .prepare(`
          INSERT INTO blockers (
            id, task_id, title, kind, detail, owner, responsibility,
            responsibility_label, source_context_id, status, created_at,
            updated_at, resolved_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'blocker_packaged_ui_1',
          taskId,
          'Packaged Timeline launch blocker',
          'approval',
          'Need release owner approval before continuing.',
          'Release owner',
          'external',
          'Release owner signs off',
          'source_packaged_ui_1',
          'active',
          '2026-05-01T10:25:00.000Z',
          '2026-05-01T10:35:00.000Z',
          null,
        );

      database
        .prepare(`
          INSERT INTO task_dependencies (
            id, task_id, blocked_by_task_id, reason, status,
            created_at, updated_at, resolved_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'dependency_packaged_ui_1',
          taskId,
          'task_packaged_timeline_upstream',
          'Need upstream Timeline fixture to finish first.',
          'active',
          '2026-05-01T10:10:00.000Z',
          '2026-05-01T10:20:00.000Z',
          null,
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
          'criteria_packaged_ui_1',
          taskId,
          'Packaged Timeline closeout accepted',
          'self',
          'Owner confirmed packaged Timeline closeout',
          'satisfied',
          '2026-05-01T09:30:00.000Z',
          '2026-05-01T09:45:00.000Z',
          '2026-05-01T09:45:00.000Z',
        );

      const insertCriteria = database.prepare(`
        INSERT INTO completion_criteria (
          id, task_id, text, verification_responsibility,
          verification_responsibility_label, status, created_at, updated_at,
          satisfied_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertCriteria.run(
        'criteria_packaged_home_closeout_done',
        'task_packaged_home_closeout_evidence',
        'Packaged Home evidence reviewed',
        'self',
        'Owner reviewed packaged Home evidence',
        'satisfied',
        '2026-05-01T08:45:00.000Z',
        '2026-05-01T09:10:00.000Z',
        '2026-05-01T09:10:00.000Z',
      );

      insertCriteria.run(
        'criteria_packaged_home_closeout_open',
        'task_packaged_home_closeout_evidence',
        'Packaged Home closeout approved',
        'external',
        'Release owner approval',
        'open',
        '2026-05-01T08:50:00.000Z',
        '2026-05-01T08:50:00.000Z',
        null,
      );

      insertTimeline.run(
        'timeline_packaged_ui_run',
        taskId,
        'task.run_completed',
        JSON.stringify({ runId: 'run_packaged_ui_1', nextState: 'planned' }),
        '2026-05-01T12:00:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_decision',
        taskId,
        'task.decision_approved',
        JSON.stringify({
          decisionId: 'decision_packaged_ui_1',
          decisionTitle: 'Approve packaged Timeline UI smoke',
        }),
        '2026-05-01T11:30:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_source',
        taskId,
        'source_context.updated',
        JSON.stringify({
          sourceContextId: 'source_packaged_ui_1',
          title: 'Packaged Timeline notes',
        }),
        '2026-05-01T11:00:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_next_step',
        taskId,
        'task.next_step_changed',
        JSON.stringify({
          from: null,
          to: '审阅 packaged Timeline UI smoke 结果。',
        }),
        '2026-05-01T10:45:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_waiting',
        taskId,
        'task.waiting_changed',
        JSON.stringify({
          from: null,
          to: '等待 packaged Timeline UI smoke 复核。',
        }),
        '2026-05-01T10:40:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_risk',
        taskId,
        'task.risk_changed',
        JSON.stringify({
          from: { level: 'medium', note: 'Timeline smoke risk under review' },
          to: { level: 'high', note: 'Packaged Timeline smoke risk' },
        }),
        '2026-05-01T10:38:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_blocker',
        taskId,
        'blocker.updated',
        JSON.stringify({
          blockerId: 'blocker_packaged_ui_1',
          title: 'Packaged Timeline launch blocker',
          owner: 'Release owner',
          sourceContextId: 'source_packaged_ui_1',
        }),
        '2026-05-01T10:35:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_task_update',
        taskId,
        'task.updated',
        JSON.stringify({ summary: 'Lower priority packaged field update' }),
        '2026-05-01T10:30:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_dependency',
        taskId,
        'task_dependency.updated',
        JSON.stringify({
          dependencyId: 'dependency_packaged_ui_1',
          blockedByTaskId: 'task_packaged_timeline_upstream',
          blockedByTaskTitle: 'Packaged Timeline upstream fixture',
          reason: 'Need upstream Timeline fixture to finish first.',
        }),
        '2026-05-01T10:20:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_completion_ready',
        taskId,
        'completion_criteria.satisfied',
        JSON.stringify({ text: 'Packaged Timeline closeout accepted' }),
        '2026-05-01T09:45:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_artifact',
        taskId,
        'artifact.created',
        JSON.stringify({
          sourceType: 'run',
          sourceId: 'run_packaged_ui_1',
          title: 'Packaged Timeline smoke report',
        }),
        '2026-04-30T09:00:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_completion',
        taskId,
        'completion_criteria.satisfied',
        JSON.stringify({ text: 'Packaged Timeline fixture accepted' }),
        '2026-04-30T08:30:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_created',
        taskId,
        'task.created',
        JSON.stringify({ title: 'Timeline packaged UI fixture' }),
        '2026-04-30T08:00:00.000Z',
      );
    })();
  } finally {
    database.close();
  }
}

async function assertTimelineUi(page) {
  await openTaskFromTaskList(page, 'Timeline packaged UI fixture');
  await page.getByRole('heading', { name: 'Timeline packaged UI fixture' }).waitFor();

  await page.getByRole('button', { name: '展开全部 (13)' }).waitFor();
  await page.locator('.timeline-date-heading', { hasText: '2026-05-01' }).waitFor();
  await page.locator('.timeline-date-heading', { hasText: '2026-04-30' }).waitFor();
  await page.getByText('执行记录').first().waitFor();
  await page.getByText('决策').first().waitFor();
  await page.getByText('来源材料').first().waitFor();
  await page.getByText('产物').first().waitFor();
  await page.getByText('完成标准').first().waitFor();
  await page.getByText('关键事件').first().waitFor();
  await page.getByText('解释事件').first().waitFor();
  await page.getByText('已满足 1/1 条完成标准').first().waitFor();

  if (await page.getByText('任务字段已更新').count() > 0) {
    throw new Error('Packaged Timeline preview included trace task updates before expansion.');
  }

  await page.getByRole('button', { name: '展开全部 (13)' }).click();

  await page.getByText('任务字段已更新').waitFor();
  await page.getByText('创建任务：Timeline packaged UI fixture').waitFor();
  await page.getByText('执行完成，任务恢复到 planned。').waitFor();
  await page.getByText('决策已获批准：Approve packaged Timeline UI smoke。').waitFor();
  await page.getByText('来源材料更新：Packaged Timeline notes。').waitFor();
  await page.getByText('风险从 medium（Timeline smoke risk under review）调整为 high（Packaged Timeline smoke risk）').waitFor();
  await page.getByText('阻塞项更新：Packaged Timeline launch blocker。').waitFor();
  await page.getByText('任务依赖更新：Packaged Timeline upstream fixture。').waitFor();
  await page.getByText('完成标准已满足：Packaged Timeline closeout accepted。').waitFor();
  await page.getByText('生成产物：Packaged Timeline smoke report。').waitFor();
  await page.getByText('完成标准已满足：Packaged Timeline fixture accepted。').waitFor();
  await page.getByText('留痕事件').first().waitFor();
}

async function openTaskFromTaskList(page, title) {
  await page.getByRole('button', { name: 'Tasks 任务列表、详情与状态流转' }).click();
  await page
    .locator('.task-list-item', { hasText: title })
    .getByRole('button')
    .click();
}

async function assertTaskTimelineFollowUpActions(page) {
  await page
    .locator('.timeline-item', { hasText: '决策已获批准：Approve packaged Timeline UI smoke。' })
    .getByRole('button', { name: '继续推进' })
    .click();
  await page.getByLabel('Next Step').waitFor();

  let nextStep = await page.getByLabel('Next Step').inputValue();
  if (nextStep !== '已获批准，继续推进：Approve packaged Timeline UI smoke') {
    throw new Error(`Packaged Timeline decision follow-up filled the wrong next step: ${nextStep}`);
  }

  await page
    .locator('.timeline-item', { hasText: '等待原因从“未填写”调整为“等待 packaged Timeline UI smoke 复核。”' })
    .getByRole('button', { name: '补清等待条件' })
    .click();

  nextStep = await page.getByLabel('Next Step').inputValue();
  if (nextStep !== '跟进并确认是否解除等待：等待 packaged Timeline UI smoke 复核。') {
    throw new Error(`Packaged Timeline waiting follow-up filled the wrong next step: ${nextStep}`);
  }

  await page
    .locator('.timeline-item', { hasText: '生成产物：Packaged Timeline smoke report。' })
    .getByRole('button', { name: '基于产物继续推进' })
    .click();

  nextStep = await page.getByLabel('Next Step').inputValue();
  if (nextStep !== '基于产物继续推进：Packaged Timeline smoke report') {
    throw new Error(`Packaged Timeline artifact follow-up filled the wrong next step: ${nextStep}`);
  }
}

async function assertTaskTimelineContextFollowUpActions(page) {
  await page
    .locator('.timeline-item', { hasText: '风险从 medium（Timeline smoke risk under review）调整为 high（Packaged Timeline smoke risk）' })
    .getByRole('button', { name: '优先处理风险' })
    .click();

  await page.getByLabel('Risk Note').waitFor();
  let riskNote = await page.getByLabel('Risk Note').inputValue();
  if (riskNote !== 'Packaged Timeline smoke risk') {
    throw new Error(`Packaged Timeline risk follow-up filled the wrong risk note: ${riskNote}`);
  }

  await page
    .locator('.timeline-item', { hasText: '阻塞项更新：Packaged Timeline launch blocker。' })
    .getByRole('button', { name: '先解阻塞' })
    .click();

  await page.getByText('Edit Blocker').waitFor();
  await page.locator('label', { hasText: '阻塞项标题' }).locator('input').waitFor();
  const blockerTitle = await page.locator('label', { hasText: '阻塞项标题' }).locator('input').inputValue();
  if (blockerTitle !== 'Packaged Timeline launch blocker') {
    throw new Error(`Packaged Timeline blocker follow-up focused the wrong blocker: ${blockerTitle}`);
  }

  await page
    .locator('.timeline-item', { hasText: '任务依赖更新：Packaged Timeline upstream fixture。' })
    .getByRole('button', { name: '先解阻塞' })
    .click();

  await page.getByText('Edit Dependency').waitFor();
  const dependencyReason = await page.locator('label', { hasText: '依赖说明' }).locator('textarea').inputValue();
  if (dependencyReason !== 'Need upstream Timeline fixture to finish first.') {
    throw new Error(`Packaged Timeline dependency follow-up focused the wrong dependency: ${dependencyReason}`);
  }

  const nextStep = await page.getByLabel('Next Step').inputValue();
  if (nextStep !== '优先推动上游任务“Packaged Timeline upstream fixture”，并确认是否解除依赖。') {
    throw new Error(`Packaged Timeline dependency follow-up filled the wrong next step: ${nextStep}`);
  }
}

async function assertTaskTimelineObjectActions(page) {
  await page.getByRole('button', { name: '查看 Run' }).first().click();
  await page.getByRole('heading', { name: 'summarize / completed' }).waitFor();
  await page.getByText('Packaged Timeline UI smoke completed.').waitFor();

  await openTaskFromTaskList(page, 'Timeline packaged UI fixture');
  await page.getByRole('button', { name: '展开全部 (13)' }).click();

  await page.getByRole('button', { name: '查看 Decision' }).first().click();
  await page.getByRole('heading', { name: '待拍板事项' }).waitFor();
  await page.getByRole('heading', { name: 'Approve packaged Timeline UI smoke' }).waitFor();

  await openTaskFromTaskList(page, 'Timeline packaged UI fixture');
  await page.getByRole('button', { name: '展开全部 (13)' }).click();

  await page.getByRole('button', { name: '查看来源' }).first().click();
  await page.getByRole('heading', { name: 'Timeline packaged UI fixture' }).waitFor();
  await page.getByRole('heading', { name: 'Source Context' }).waitFor();
  await page.getByText('Edit Material').waitFor();
  await page.locator('label', { hasText: '来源标题' }).locator('input').waitFor();
  const sourceTitle = await page.locator('label', { hasText: '来源标题' }).locator('input').inputValue();

  if (sourceTitle !== 'Packaged Timeline notes') {
    throw new Error(`Packaged Timeline source action focused the wrong material: ${sourceTitle}`);
  }
}

async function assertRelatedRunTimelineUi(page) {
  await page.getByRole('button', { name: /runs/i }).click();
  await page.getByRole('heading', { name: '执行记录' }).waitFor();
  await page.getByText('Related Task Timeline').waitFor();
  await page.locator('.timeline-date-heading', { hasText: '2026-05-01' }).first().waitFor();
  await page.getByText('执行记录').first().waitFor();
  await page.getByText('产物').first().waitFor();
  await page.getByText('任务字段').first().waitFor();
  await page.getByText('关键事件').first().waitFor();
  await page.getByText('解释事件').first().waitFor();
  await page.getByText('执行完成，任务恢复到 planned。').waitFor();
  await page.getByText('生成产物：Packaged Timeline smoke report。').waitFor();
  await page.getByText('下一步从“未填写”调整为“审阅 packaged Timeline UI smoke 结果。”').waitFor();
}

async function assertRelatedDecisionTimelineUi(page) {
  await page.getByRole('button', { name: /decisions/i }).click();
  await page.getByRole('heading', { name: '待拍板事项' }).waitFor();
  await page.getByText('Related Task Timeline').waitFor();
  await page.locator('.timeline-date-heading', { hasText: '2026-05-01' }).first().waitFor();
  await page.getByText('决策').first().waitFor();
  await page.getByText('等待项').first().waitFor();
  await page.getByText('任务字段').first().waitFor();
  await page.getByText('关键事件').first().waitFor();
  await page.getByText('解释事件').first().waitFor();
  await page.getByText('决策已获批准：Approve packaged Timeline UI smoke。').waitFor();
  await page.getByText('等待原因从“未填写”调整为“等待 packaged Timeline UI smoke 复核。”').waitFor();
  await page.getByText('下一步从“未填写”调整为“审阅 packaged Timeline UI smoke 结果。”').waitFor();
}

async function assertDependencyReturnAndResolution(page) {
  await openTaskFromTaskList(page, 'Timeline packaged UI fixture');
  await page.getByRole('heading', { name: 'Timeline packaged UI fixture' }).waitFor();

  await page
    .locator('.timeline-item', { hasText: 'Packaged Timeline upstream fixture' })
    .getByRole('button', { name: '打开上游任务' })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Packaged Timeline upstream fixture' }).waitFor();

  await openTaskFromTaskList(page, 'Timeline packaged UI fixture');
  await page.getByRole('heading', { name: 'Timeline packaged UI fixture' }).waitFor();

  await page
    .locator('.timeline-item', { hasText: 'Packaged Timeline upstream fixture' })
    .getByRole('button', { name: '解除依赖' })
    .first()
    .click();
  await page.getByText('当前任务还没有 active dependency。').waitFor();
  await page.getByText('暂无任务依赖').waitFor();
  await page.getByText('任务依赖解除：Packaged Timeline upstream fixture。').waitFor();

  await page
    .locator('.timeline-item', { hasText: 'Packaged Timeline launch blocker' })
    .getByRole('button', { name: '解除阻塞' })
    .first()
    .click();
  await page.getByText('暂无当前阻塞项').waitFor();
  await page.getByRole('button', { name: '最终收尾判断' }).waitFor();
}

async function assertCloseoutTransition(page) {
  await page.getByRole('button', { name: '转到 completed（完成标准已满足）' }).click();
  await page.getByText('状态：completed').waitFor();
  await page.getByText('最近状态从 running 变更为 completed。', { exact: true }).waitFor();
}

async function assertHomeCloseoutEvidenceReturn(page) {
  await page.getByRole('button', { name: 'Home 局势概览与系统状态' }).click();

  const closeoutSection = page.locator('section.timeline-list').filter({ hasText: 'Closeout Tasks' });
  await closeoutSection
    .locator('.task-card', { hasText: 'Timeline packaged UI fixture' })
    .waitFor();
  await closeoutSection
    .locator('.task-card', { hasText: 'Packaged Home closeout evidence fixture' })
    .waitFor();
  await closeoutSection
    .getByText('当前收尾证据：执行完成 · summarize')
    .waitFor();

  await closeoutSection
    .locator('.task-card', { hasText: 'Packaged Home closeout evidence fixture' })
    .getByRole('button', { name: '查看收尾证据' })
    .click();
  await page.getByRole('heading', { name: 'summarize / completed' }).waitFor();
  await page.getByText('Packaged Home closeout evidence completed.').waitFor();

  await page.getByRole('button', { name: 'Home 局势概览与系统状态' }).click();
  await closeoutSection
    .locator('.task-card', { hasText: 'Packaged Home closeout evidence fixture' })
    .waitFor();

  await closeoutSection
    .locator('.task-card', { hasText: 'Timeline packaged UI fixture' })
    .getByRole('button', { name: /Timeline packaged UI fixture/i })
    .click();
  await page.getByRole('heading', { name: 'Timeline packaged UI fixture' }).waitFor();
  await page.getByRole('button', { name: '转到 completed（完成标准已满足）' }).waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged Timeline UI smoke requires macOS.');
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
  seedTimelineFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertTimelineUi(page);
  await assertTaskTimelineFollowUpActions(page);
  await assertTaskTimelineContextFollowUpActions(page);
  await assertTaskTimelineObjectActions(page);
  await assertRelatedRunTimelineUi(page);
  await assertRelatedDecisionTimelineUi(page);
  await assertDependencyReturnAndResolution(page);
  await assertHomeCloseoutEvidenceReturn(page);
  await assertCloseoutTransition(page);

  await app.close();
  cleanup();
  console.log('macOS packaged Timeline UI smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged Timeline UI smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
