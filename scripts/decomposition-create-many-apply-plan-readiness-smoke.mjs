#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'taskplane-writeback-apply-plan.js');
const sourceModulePath = path.join(root, 'src', 'shared', 'taskplane-writeback-apply-plan.ts');

export async function runSubtaskCreateManyApplyPlanReadinessSmoke() {
  console.log('Subtask create-many apply plan readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('subtasks=not-created');
  console.log('dispatch=not-called');
  console.log('workspace=unchanged');

  if (!fs.existsSync(modulePath) || sourceIsNewerThanBuild()) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    return 0;
  }

  const {
    buildSubtaskCreateManyWritebackApplyPlan,
  } = await import(pathToFileURL(modulePath).href);
  const cliPlan = buildSubtaskCreateManyWritebackApplyPlan({
    evidenceRunId: 'run_cli_decomposition',
    nextStep: 'Enter the first confirmed child task.',
    parentTaskId: 'task_project',
    review: 'Keep child tasks reviewable before persistence.',
    source: 'agent_cli_decomposition',
    subtasks: [buildSubtaskDraft()],
  });
  const apiPlan = buildSubtaskCreateManyWritebackApplyPlan({
    evidenceRunId: 'run_api_decomposition',
    nextStep: 'Enter the first confirmed child task.',
    parentTaskId: 'task_project',
    review: 'Keep Agent API decomposition reviewable before persistence.',
    source: 'agent_api_decomposition',
    subtasks: [buildSubtaskDraft()],
  });

  printPlan('cli', cliPlan);
  printPlan('api', apiPlan);

  if (
    !isReadyCreateManyPlan(cliPlan, 'agent_cli_decomposition')
    || !isReadyCreateManyPlan(apiPlan, 'agent_api_decomposition')
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

function printPlan(prefix, plan) {
  console.log(`${prefix}Action=${plan.action}`);
  console.log(`${prefix}Source=${plan.input.source}`);
  console.log(`${prefix}ParentTaskId=${plan.input.parentTaskId}`);
  console.log(`${prefix}SubtaskCount=${plan.input.subtasks.length}`);
  console.log(`${prefix}TimelineType=${plan.timeline.type}`);
  console.log(`${prefix}ConfirmationBoundary=${plan.timeline.payload.confirmationBoundary ?? 'missing'}`);
  console.log(`${prefix}DraftOnlyBeforeConfirmation=${String(plan.timeline.payload.draftOnlyBeforeConfirmation)}`);
}

function isReadyCreateManyPlan(plan, source) {
  return plan.action === 'subtask.create_many'
    && plan.input.parentTaskId === 'task_project'
    && plan.input.source === source
    && plan.input.subtasks.length === 1
    && plan.timeline.type === 'panel.project_decomposed'
    && plan.timeline.payload.source === source
    && plan.timeline.payload.subtaskCount === 1
    && plan.timeline.payload.confirmationBoundary === 'operator_confirmed_subtask_create_many'
    && plan.timeline.payload.draftOnlyBeforeConfirmation === true
    && plan.successMessage.includes('1');
}

function buildSubtaskDraft() {
  return {
    acceptanceCriteria: 'The child task can be reviewed before persistence.',
    dependency: null,
    summary: 'Prepare one reversible child task draft.',
    title: 'Review reversible child task boundary',
  };
}

function sourceIsNewerThanBuild() {
  if (!fs.existsSync(modulePath) || !fs.existsSync(sourceModulePath)) return false;
  return fs.statSync(sourceModulePath).mtimeMs > fs.statSync(modulePath).mtimeMs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runSubtaskCreateManyApplyPlanReadinessSmoke();
}
