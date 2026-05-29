#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'taskplane-writeback-apply-plan.js');
const dispatchModulePath = path.join(root, 'dist-electron', 'shared', 'taskplane-writeback-dispatch.js');
const sourceModulePath = path.join(root, 'src', 'shared', 'taskplane-writeback-apply-plan.ts');
const dispatchSourceModulePath = path.join(root, 'src', 'shared', 'taskplane-writeback-dispatch.ts');

export async function runSubtaskCreateManyApplyPlanReadinessSmoke() {
  console.log('Subtask create-many apply plan readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('subtasks=not-created');
  console.log('dispatch=mocked-port-only');
  console.log('workspace=unchanged');

  if (!fs.existsSync(modulePath) || !fs.existsSync(dispatchModulePath) || sourceIsNewerThanBuild()) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    return 0;
  }

  const [
    {
      buildSubtaskCreateManyWritebackApplyPlan,
    },
    {
      dispatchTaskplaneWritebackApplyPlan,
    },
  ] = await Promise.all([
    import(pathToFileURL(modulePath).href),
    import(pathToFileURL(dispatchModulePath).href),
  ]);
  const cliPlan = buildSubtaskCreateManyWritebackApplyPlan({
    confirmationSurface: 'readiness_smoke_operator_confirmation',
    evidenceRunId: 'run_cli_decomposition',
    nextStep: 'Enter the first confirmed child task.',
    parentTaskId: 'task_project',
    review: 'Keep child tasks reviewable before persistence.',
    source: 'agent_cli_decomposition',
    subtasks: [buildSubtaskDraft()],
  });
  const apiPlan = buildSubtaskCreateManyWritebackApplyPlan({
    confirmationSurface: 'readiness_smoke_operator_confirmation',
    evidenceRunId: 'run_api_decomposition',
    nextStep: 'Enter the first confirmed child task.',
    parentTaskId: 'task_project',
    review: 'Keep Agent API decomposition reviewable before persistence.',
    source: 'agent_api_decomposition',
    subtasks: [buildSubtaskDraft()],
  });

  printPlan('cli', cliPlan);
  printPlan('api', apiPlan);
  const dispatchEvents = [];
  const apiDispatchResult = await dispatchTaskplaneWritebackApplyPlan({
    plan: apiPlan,
    ports: {
      createSubtasks: async (input) => ({
        createdTasks: input.subtasks.map((subtask, index) => ({
          id: `mock_child_${index + 1}`,
          parentId: input.parentTaskId,
          status: 'todo',
          title: subtask.title,
        })),
        taskRecordPath: 'Task Records/mock-project-decomposition.md',
        updatedTask: {
          id: input.parentTaskId,
          nextStep: input.nextStep,
        },
      }),
      recordTimelineEvent: async (taskId, type, payload) => {
        dispatchEvents.push({ taskId, type, payload });
      },
    },
    taskId: 'task_project',
  });
  const dispatchEvent = dispatchEvents[0] ?? null;
  const blockedCreateSubtasksCalls = [];
  const missingConfirmationPlan = {
    ...apiPlan,
    timeline: {
      ...apiPlan.timeline,
      payload: {
        evidenceRunId: apiPlan.timeline.payload.evidenceRunId,
        source: apiPlan.timeline.payload.source,
        subtaskCount: apiPlan.timeline.payload.subtaskCount,
      },
    },
  };
  const blockedDispatchResult = await dispatchTaskplaneWritebackApplyPlan({
    plan: missingConfirmationPlan,
    ports: {
      createSubtasks: async (input) => {
        blockedCreateSubtasksCalls.push(input);
        return {
          createdTasks: [],
          taskRecordPath: null,
          updatedTask: null,
        };
      },
    },
    taskId: 'task_project',
  });

  console.log(`apiDispatchStatus=${apiDispatchResult.status}`);
  console.log(`apiDispatchAction=${apiDispatchResult.action}`);
  console.log(`apiDispatchCreatedTaskCount=${apiDispatchResult.createdTasks?.length ?? 0}`);
  console.log(`apiDispatchCreatedTaskIds=${apiDispatchResult.createdTasks?.map((task) => task.id).join(',') || 'none'}`);
  console.log(`apiDispatchUpdatedTask=${apiDispatchResult.updatedTask?.id ?? 'missing'}`);
  console.log(`apiDispatchTaskRecordPath=${apiDispatchResult.taskRecordPath ?? 'missing'}`);
  console.log(`apiDispatchTimelineEventCount=${dispatchEvents.length}`);
  console.log(`apiDispatchTimelineTask=${dispatchEvent?.taskId ?? 'missing'}`);
  console.log(`apiDispatchTimelineType=${dispatchEvent?.type ?? 'missing'}`);
  console.log(`apiDispatchTimelineChildTaskIds=${dispatchEvent?.payload?.childTaskIds?.join(',') || 'none'}`);
  console.log(`apiDispatchTimelineRecordPath=${dispatchEvent?.payload?.recordPath ?? 'missing'}`);
  console.log(`apiDispatchTimelineSource=${dispatchEvent?.payload?.source ?? 'missing'}`);
  console.log(`apiDispatchTimelineConfirmationBoundary=${dispatchEvent?.payload?.confirmationBoundary ?? 'missing'}`);
  console.log(`apiDispatchTimelineConfirmationSurface=${dispatchEvent?.payload?.confirmationSurface ?? 'missing'}`);
  console.log(`apiDispatchTimelineDraftOnlyBeforeConfirmation=${String(dispatchEvent?.payload?.draftOnlyBeforeConfirmation)}`);
  console.log(`missingConfirmationDispatchStatus=${blockedDispatchResult.status}`);
  console.log(`missingConfirmationDispatchAction=${blockedDispatchResult.action}`);
  console.log(`missingConfirmationDispatchMessage=${blockedDispatchResult.message ?? 'missing'}`);
  console.log(`missingConfirmationCreateSubtasksCalled=${blockedCreateSubtasksCalls.length > 0 ? 'yes' : 'no'}`);

  if (
    !isReadyCreateManyPlan(cliPlan, 'agent_cli_decomposition')
    || !isReadyCreateManyPlan(apiPlan, 'agent_api_decomposition')
    || apiDispatchResult.status !== 'completed'
    || apiDispatchResult.action !== 'subtask.create_many'
    || apiDispatchResult.createdTasks?.length !== 1
    || apiDispatchResult.createdTasks[0]?.id !== 'mock_child_1'
    || apiDispatchResult.updatedTask?.id !== 'task_project'
    || apiDispatchResult.taskRecordPath !== 'Task Records/mock-project-decomposition.md'
    || dispatchEvents.length !== 1
    || dispatchEvent?.taskId !== 'task_project'
    || dispatchEvent?.type !== 'panel.project_decomposed'
    || dispatchEvent?.payload?.source !== 'agent_api_decomposition'
    || dispatchEvent?.payload?.confirmationBoundary !== 'operator_confirmed_subtask_create_many'
    || dispatchEvent?.payload?.confirmationSurface !== 'readiness_smoke_operator_confirmation'
    || dispatchEvent?.payload?.draftOnlyBeforeConfirmation !== true
    || dispatchEvent?.payload?.childTaskIds?.join(',') !== 'mock_child_1'
    || dispatchEvent?.payload?.recordPath !== 'Task Records/mock-project-decomposition.md'
    || blockedDispatchResult.status !== 'blocked'
    || blockedDispatchResult.action !== 'subtask.create_many'
    || blockedDispatchResult.message !== '子任务草案已暂停：缺少已确认的项目拆解写入边界。'
    || blockedCreateSubtasksCalls.length !== 0
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
  console.log(`${prefix}ConfirmationSurface=${plan.timeline.payload.confirmationSurface ?? 'missing'}`);
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
    && plan.timeline.payload.confirmationSurface === 'readiness_smoke_operator_confirmation'
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
  const pairs = [
    [sourceModulePath, modulePath],
    [dispatchSourceModulePath, dispatchModulePath],
  ];
  return pairs.some(([source, build]) => (
    fs.existsSync(source)
    && fs.existsSync(build)
    && fs.statSync(source).mtimeMs > fs.statSync(build).mtimeMs
  ));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runSubtaskCreateManyApplyPlanReadinessSmoke();
}
