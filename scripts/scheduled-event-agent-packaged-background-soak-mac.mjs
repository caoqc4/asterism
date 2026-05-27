#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

import {
  getScheduledEventAgentBackgroundLivePreflight,
  printScheduledEventAgentBackgroundLivePreflight,
} from './scheduled-event-agent-background-live-preflight.mjs';

const ENABLED = process.env.TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_PACKAGED_BACKGROUND_SOAK === 'true';
const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const taskId = 'task_scheduled_event_packaged_background_soak';
const contextFile = 'docs/scheduled-event-packaged-soak-context.md';
const workspaceFile = 'README.md';
const timeoutMs = Number(process.env.TASKPLANE_SCHEDULED_EVENT_PACKAGED_BACKGROUND_SOAK_TIMEOUT_MS ?? 120_000);
const pollMs = 500;

export async function runScheduledEventAgentPackagedBackgroundSoak() {
  const preflight = getScheduledEventAgentBackgroundLivePreflight();
  printScheduledEventAgentBackgroundLivePreflight(preflight);
  console.log('Scheduled/event Agent packaged background soak');
  console.log('mode=opt-in packaged soak');
  console.log(`packagedApp=${fs.existsSync(executablePath) ? executablePath : '<missing>'}`);

  if (!ENABLED) {
    console.log('status=skip');
    console.log('skipReason=opt_in_required');
    console.log('set TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_PACKAGED_BACKGROUND_SOAK=true to launch the packaged app and run one provider-backed scheduler soak');
    console.log('packagedApp=not-launched');
    console.log('backgroundLiveRun=not-started');
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 0;
  }

  const issues = [...preflight.issues];

  if (process.platform !== 'darwin') {
    issues.push('macOS is required for the packaged scheduled/event background soak.');
  }

  if (!fs.existsSync(executablePath)) {
    issues.push(`Missing packaged app executable: ${executablePath}. Run npm run dist:mac:dir first.`);
  }

  if ((process.env.TASKPLANE_AI_RUNTIME_MODE ?? '').trim() !== 'api') {
    issues.push('TASKPLANE_AI_RUNTIME_MODE must be api for the packaged Code Agent model-producer soak.');
  }

  if (issues.length > 0) {
    console.log('status=skip');
    console.log('skipReason=config_missing');
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
    console.log('packagedApp=not-launched');
    console.log('backgroundLiveRun=not-started');
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 0;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-scheduled-event-packaged-soak-'));
  const userDataPath = path.join(tempRoot, 'user-data');
  const workspaceRoot = path.join(tempRoot, 'workspace');
  const dbPath = path.join(userDataPath, 'taskplane.db');
  const smokePath = path.join(userDataPath, 'scheduled-event-packaged-background-soak.log');
  let app;

  try {
    prepareWorkspace(workspaceRoot, userDataPath);
    const beforeWorkspace = workspaceSnapshot(workspaceRoot);

    app = await electron.launch({
      executablePath,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '',
        TASKPLANE_AI_API_KEY: preflight.apiKey,
        TASKPLANE_AI_BASE_URL: preflight.baseUrl ?? '',
        TASKPLANE_AI_MODEL: preflight.model,
        TASKPLANE_AI_PROVIDER: preflight.provider,
        TASKPLANE_AI_RUNTIME_MODE: 'api',
        TASKPLANE_CODE_AGENT_CONTEXT_FILES: contextFile,
        TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER: 'true',
        TASKPLANE_ENABLE_SANDBOX_CODING_AGENT: 'true',
        TASKPLANE_ENABLE_SCHEDULER: 'true',
        TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY: 'false',
        TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
        TASKPLANE_USER_DATA_DIR: userDataPath,
        TASKPLANE_WORKSPACE_ROOT: workspaceRoot,
      },
      timeout: timeoutMs,
    });

    await waitFor(() => fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0, 'packaged app database');
    seedScheduledEventFixture(dbPath);

    const page = await app.firstWindow({ timeout: timeoutMs });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.api?.triggerScheduledEventAgentRun), null, { timeout: timeoutMs });

    const result = await page.evaluate((id) => window.api.triggerScheduledEventAgentRun({ taskId: id }), taskId);
    if (result.status !== 'started') {
      throw new Error(`Packaged scheduled/event trigger did not start: ${result.summary}`);
    }

    await waitFor(() => {
      const [run] = queryRunRows(dbPath);
      return run?.status === 'completed' || run?.status === 'failed';
    }, 'terminal packaged scheduled/event run evidence');

    const [run] = queryRunRows(dbPath);
    const steps = queryRunStepRows(dbPath, run.id);
    const timelineEvents = queryTimelineRows(dbPath);
    const decisions = queryDecisionRows(dbPath);
    const artifacts = queryArtifactRows(dbPath);
    const workspaceUnchanged = workspaceSnapshot(workspaceRoot) === beforeWorkspace;

    assertPackagedEvidence({ artifacts, decisions, result, run, steps, timelineEvents, workspaceUnchanged });

    await app.close();
    app = null;
    fs.rmSync(tempRoot, { recursive: true, force: true });

    console.log('status=passed');
    console.log('packagedApp=launched');
    console.log('backgroundLiveRun=attempted');
    console.log(`triggerStatus=${result.status}`);
    console.log(`triggerRunEvidenceStatus=${result.triggerRunEvidenceStatus}`);
    console.log(`terminalRunEvidenceStatus=${result.terminalRunEvidenceStatus}`);
    console.log(`runId=${run.id}`);
    console.log(`runStatus=${run.status}`);
    console.log(`runSteps=${steps.length}`);
    console.log(`timelineEvents=${timelineEvents.length}`);
    console.log(`decisions=${decisions.length}`);
    console.log(`artifacts=${artifacts.length}`);
    console.log('provider=called');
    console.log(`model=${preflight.model}`);
    console.log('docker=attempted_by_packaged_code_agent');
    console.log('workspace=unchanged');
    return 0;
  } catch (error) {
    if (app) {
      await app.close().catch(() => {});
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });

    console.log('status=failed');
    console.log('packagedApp=launched');
    console.log('backgroundLiveRun=attempted');
    console.log(`provider=${String(error instanceof Error ? error.message : error).includes('AI API Key') ? 'not-called' : 'called_or_blocked_after_start'}`);
    console.log('workspace=unknown');
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    return 1;
  }
}

function prepareWorkspace(workspaceRoot, userDataPath) {
  fs.mkdirSync(path.join(workspaceRoot, 'docs'), { recursive: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, 'package.json'),
    JSON.stringify({
      private: true,
      scripts: {
        test: 'node -e "console.log(\'scheduled packaged soak test ok\')"',
      },
    }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspaceRoot, workspaceFile),
    'Taskplane scheduled/event packaged background soak fixture.\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspaceRoot, contextFile),
    [
      '# Scheduled/event packaged background soak',
      '',
      'This context file is safe for provider-visible packaged soak evidence.',
      'Return only a tiny staged documentation proposal.',
      '',
    ].join('\n'),
    'utf8',
  );
}

function workspaceSnapshot(workspaceRoot) {
  return [
    fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'),
    fs.readFileSync(path.join(workspaceRoot, workspaceFile), 'utf8'),
    fs.readFileSync(path.join(workspaceRoot, contextFile), 'utf8'),
  ].join('\n---\n');
}

function seedScheduledEventFixture(dbPath) {
  const database = new Database(dbPath, { fileMustExist: true });
  const now = '2026-05-27T00:00:00.000Z';

  try {
    database.transaction(() => {
      database.prepare(`
        INSERT INTO tasks (
          id, title, summary, task_type, task_facets, state, next_step,
          waiting_reason, risk_level, risk_note, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        'Packaged scheduled/event Agent soak',
        'Run one packaged-app scheduled/event Agent trigger with durable evidence.',
        'routine',
        JSON.stringify(['scheduled', 'routine']),
        'planned',
        'Prepare one staged note proving packaged scheduled/event Agent execution.',
        null,
        'low',
        null,
        now,
        now,
      );

      database.prepare(`
        INSERT INTO completion_criteria (
          id, task_id, text, verification_responsibility,
          verification_responsibility_label, status, created_at, updated_at, satisfied_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'criteria_scheduled_event_packaged_soak',
        taskId,
        'Packaged scheduled/event Agent run leaves terminal Run evidence.',
        'self',
        'Operator reviews packaged soak evidence',
        'open',
        now,
        now,
        null,
      );

      database.prepare(`
        INSERT INTO task_files (
          id, task_id, name, path, kind, content, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'task_file_scheduled_event_packaged_soak_md',
        taskId,
        'Task.md',
        'Task.md',
        'file',
        [
          '# Task',
          '',
          '## Goal',
          'Packaged scheduled/event Agent soak',
          '',
          '## Next Step',
          'Prepare one staged note proving packaged scheduled/event Agent execution.',
          '',
        ].join('\n'),
        now,
        now,
      );

      database.prepare(`
        INSERT INTO source_contexts (
          id, task_id, title, kind, is_key, uri, content, note, status,
          captured_at, run_id, batch_id, source_role, credibility,
          is_duplicate, contains_sensitive_data, created_at, updated_at, archived_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'source_scheduled_event_packaged_soak',
        taskId,
        'Packaged scheduled/event soak source',
        'doc',
        'true',
        null,
        'Use the packaged app IPC trigger and prove terminal run evidence without workspace mutation.',
        null,
        'active',
        now,
        null,
        null,
        'stable_reference',
        'verified',
        'false',
        'false',
        now,
        now,
        null,
      );

      database.prepare(`
        INSERT INTO process_templates (
          id, title, summary, content, kind, tags, status, created_at, updated_at, archived_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'process_scheduled_event_packaged_soak',
        'Packaged scheduled/event soak SOP',
        null,
        'Prepare one bounded scheduled/event packaged soak result and leave reviewable evidence.',
        'sop',
        JSON.stringify(['scheduled-event', 'packaged-soak']),
        'active',
        now,
        now,
        null,
      );

      database.prepare(`
        INSERT INTO task_process_bindings (
          id, task_id, template_id, note, status, created_at, updated_at, removed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'binding_scheduled_event_packaged_soak',
        taskId,
        'process_scheduled_event_packaged_soak',
        null,
        'active',
        now,
        now,
        null,
      );

      database.prepare(`
        INSERT INTO timeline_events (
          id, task_id, type, payload, created_at
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'timeline_scheduled_event_packaged_soak_standing_approval',
        taskId,
        'panel.standing_approval_confirmed',
        JSON.stringify({
          confirmedAt: now,
          policy: {
            allowedAutonomyLevel: 'L2_limited_authorized_action',
            allowedLanes: ['coding'],
            allowedRuntimeIds: ['local_sandbox'],
            createdAt: now,
            expiresAt: '2026-05-28T00:00:00.000Z',
            id: `standing_approval:${taskId}:coding:local_sandbox`,
            maxRunsPerDay: 1,
            reason: 'Allow one packaged scheduled/event Agent soak.',
            riskCeiling: 'low',
            status: 'active',
            taskFacets: ['scheduled'],
            taskId,
            taskTypes: ['routine'],
          },
          schedulerTriggerAllowed: false,
          workspaceWriteAllowed: false,
        }),
        now,
      );
    })();
  } finally {
    database.close();
  }
}

function queryRunRows(dbPath) {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  } finally {
    database.close();
  }
}

function queryRunStepRows(dbPath, runId) {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY step_index ASC').all(runId);
  } finally {
    database.close();
  }
}

function queryTimelineRows(dbPath) {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM timeline_events WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  } finally {
    database.close();
  }
}

function queryDecisionRows(dbPath) {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM decision_requests WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  } finally {
    database.close();
  }
}

function queryArtifactRows(dbPath) {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  } finally {
    database.close();
  }
}

function assertPackagedEvidence({ artifacts, decisions, result, run, steps, timelineEvents, workspaceUnchanged }) {
  if (!workspaceUnchanged) {
    throw new Error('Packaged scheduled/event soak changed the workspace fixture.');
  }
  if (run.status !== 'completed') {
    throw new Error(`Packaged scheduled/event run did not complete: ${run.status} ${run.failure_reason ?? ''}`);
  }
  if (result.terminalRunEvidenceStatus !== 'present' || result.triggerRunEvidenceStatus !== 'ready_for_terminal_review') {
    throw new Error(`Unexpected trigger evidence status: terminal=${result.terminalRunEvidenceStatus} trigger=${result.triggerRunEvidenceStatus}`);
  }
  if (!steps.some((step) => step.title === 'Code Agent 上下文就绪判断' && /ready/.test(step.output ?? ''))) {
    throw new Error('Missing packaged context readiness evidence.');
  }
  if (!steps.some((step) => step.title === 'manual code-agent run accepted' && /checks=test/.test(step.output ?? ''))) {
    throw new Error('Missing packaged Code Agent accepted run evidence with durable test check.');
  }
  if (!steps.some((step) => step.title === 'Code Agent provider-visible context manifest' && /workspace_files=/.test(step.output ?? ''))) {
    throw new Error('Missing packaged provider-visible context evidence.');
  }
  if (!timelineEvents.some((event) => event.type === 'panel.scheduled_event_agent_triggered')) {
    throw new Error('Missing packaged scheduled/event trigger timeline evidence.');
  }
  if (decisions.length < 1) {
    throw new Error('Missing packaged post-step Decision evidence.');
  }
  if (artifacts.length < 1) {
    throw new Error('Missing packaged patch artifact evidence.');
  }
}

async function waitFor(condition, description) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runScheduledEventAgentPackagedBackgroundSoak();
}
