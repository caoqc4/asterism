#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const invocationModulePath = path.join(root, 'dist-electron', 'shared', 'ai-runtime-invocation.js');
const applyPlanModulePath = path.join(root, 'dist-electron', 'shared', 'taskplane-writeback-apply-plan.js');
const sourceModulePaths = [
  path.join(root, 'src', 'shared', 'ai-runtime-invocation.ts'),
  path.join(root, 'src', 'shared', 'taskplane-writeback-apply-plan.ts'),
];

export async function runAgentApiDecompositionPromotionReadinessSmoke() {
  console.log('Agent API decomposition promotion readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('subtasks=not-created');
  console.log('workspace=unchanged');
  console.log('promotionInProduct=deferred');

  const missingModules = [invocationModulePath, applyPlanModulePath].filter((modulePath) => !fs.existsSync(modulePath));
  if (missingModules.length > 0 || sourceIsNewerThanBuild()) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    console.log(`missingModules=${missingModules.map((modulePath) => path.relative(root, modulePath)).join(',')}`);
    return 0;
  }

  const [
    {
      evaluateAgentApiDecompositionPromotionReadiness,
      evaluateAgentApiDecompositionPromotionReadinessFromEvidence,
    },
    {
      buildSubtaskCreateManyWritebackApplyPlan,
    },
  ] = await Promise.all([
    import(pathToFileURL(invocationModulePath).href),
    import(pathToFileURL(applyPlanModulePath).href),
  ]);

  const blocked = evaluateAgentApiDecompositionPromotionReadiness({
    applyPlan: null,
    reversibleProposalCardReady: false,
    selectedRuntimeContractReady: false,
  });
  const partialApplyPlan = buildSubtaskCreateManyWritebackApplyPlan({
    evidenceRunId: 'run_cli_decomposition_smoke',
    parentTaskId: 'task_project',
    runtimeContract: buildAgentApiDecompositionRuntimeContract(),
    source: 'agent_cli_decomposition',
    subtasks: [buildSubtaskDraft()],
  });
  const partial = evaluateAgentApiDecompositionPromotionReadiness({
    applyPlan: partialApplyPlan,
    reversibleProposalCardReady: true,
    selectedRuntimeContractReady: true,
  });
  const readyApplyPlan = buildSubtaskCreateManyWritebackApplyPlan({
    evidenceRunId: 'run_api_decomposition_smoke',
    parentTaskId: 'task_project',
    runtimeContract: buildAgentApiDecompositionRuntimeContract(),
    source: 'agent_api_decomposition',
    subtasks: [buildSubtaskDraft()],
  });
  const syntheticReady = evaluateAgentApiDecompositionPromotionReadiness({
    applyPlan: readyApplyPlan,
    reversibleProposalCardReady: true,
    selectedRuntimeContractReady: true,
  });
  const serviceEvidencePartial = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
    applyPlan: partialApplyPlan,
    parentTaskId: 'task_project',
    reversibleProposalCard: {
      parentTaskId: 'task_project',
      proposalId: 'project_decomposition:task_project',
      status: 'ready',
      subtaskCount: 1,
      subtaskTitles: ['Review Agent API decomposition promotion boundary'],
    },
    selectedRuntimeContract: {
      evidenceRunId: 'run_cli_decomposition_smoke',
      invocationLayer: 'api_runtime',
      parentTaskId: 'task_project',
      phase: 'decomposition_draft',
      runtimeMode: 'api',
    },
  });

  console.log(`blockedPromotionReady=${blocked.ready ? 'yes' : 'no'}`);
  console.log(`blockedRequirements=${blocked.satisfiedRequirements.length}/7`);
  console.log(`blockedMissingRequirements=${blocked.missingRequirements.join(',') || 'none'}`);
  console.log(`partialPromotionReady=${partial.ready ? 'yes' : 'no'}`);
  console.log(`partialRequirements=${partial.satisfiedRequirements.length}/7`);
  console.log(`partialMissingRequirements=${partial.missingRequirements.join(',') || 'none'}`);
  console.log(`syntheticPromotionReady=${syntheticReady.ready ? 'yes' : 'no'}`);
  console.log(`syntheticRequirements=${syntheticReady.satisfiedRequirements.length}/7`);
  console.log(`syntheticMissingRequirements=${syntheticReady.missingRequirements.join(',') || 'none'}`);
  console.log(`serviceEvidencePromotionReady=${serviceEvidencePartial.ready ? 'yes' : 'no'}`);
  console.log(`serviceEvidenceRequirements=${serviceEvidencePartial.satisfiedRequirements.length}/7`);
  console.log(`serviceEvidenceMissingRequirements=${serviceEvidencePartial.missingRequirements.join(',') || 'none'}`);
  console.log(`serviceEvidenceProposalId=${scalarValue(serviceEvidencePartial.summary, 'proposalId') ?? 'missing'}`);
  console.log(`serviceEvidenceExpectedProposalId=${scalarValue(serviceEvidencePartial.summary, 'expectedProposalId') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalIdEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'proposalIdEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalParentTask=${scalarValue(serviceEvidencePartial.summary, 'proposalParentTask') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'proposalTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalSubtaskCount=${scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskCount') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanSubtaskCount=${scalarValue(serviceEvidencePartial.summary, 'applyPlanSubtaskCount') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalSubtaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalSubtaskTitles=${scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskTitles') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanSubtaskTitles=${scalarValue(serviceEvidencePartial.summary, 'applyPlanSubtaskTitles') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalSubtaskUniqueChain=${scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskUniqueChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalSubtaskIdentityChain=${scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskIdentityChain') ?? 'missing'}`);
  console.log(`serviceEvidenceParentTask=${scalarValue(serviceEvidencePartial.summary, 'parentTask') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanParentTask=${scalarValue(serviceEvidencePartial.summary, 'applyPlanParentTask') ?? 'missing'}`);
  console.log(`serviceEvidenceParentTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'parentTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceSubtaskCount=${scalarValue(serviceEvidencePartial.summary, 'subtaskCount') ?? 'missing'}`);
  console.log(`serviceEvidenceEvidenceRunId=${scalarValue(serviceEvidencePartial.summary, 'evidenceRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceTimelineEvidenceRunId=${scalarValue(serviceEvidencePartial.summary, 'timelineEvidenceRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceSourceEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'sourceEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceEvidenceRunIdChain=${scalarValue(serviceEvidencePartial.summary, 'evidenceRunIdChain') ?? 'missing'}`);
  console.log(`serviceEvidenceConfirmationBoundary=${scalarValue(serviceEvidencePartial.summary, 'confirmationBoundary') ?? 'missing'}`);
  console.log(`serviceEvidenceDraftOnlyBeforeConfirmation=${scalarValue(serviceEvidencePartial.summary, 'draftOnlyBeforeConfirmation') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeMode=${scalarValue(serviceEvidencePartial.summary, 'runtimeMode') ?? 'missing'}`);
  console.log(`serviceEvidenceInvocationLayer=${scalarValue(serviceEvidencePartial.summary, 'invocationLayer') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeEvidenceRunId=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeEvidenceRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeEvidenceRunChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeEvidenceRunChain') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeParentTask=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeParentTask') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeParentTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeParentTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTimelineRuntimeMode=${scalarValue(serviceEvidencePartial.summary, 'timelineRuntimeMode') ?? 'missing'}`);
  console.log(`serviceEvidenceTimelineInvocationLayer=${scalarValue(serviceEvidencePartial.summary, 'timelineInvocationLayer') ?? 'missing'}`);
  console.log(`serviceEvidenceTimelineInvocationPhase=${scalarValue(serviceEvidencePartial.summary, 'timelineInvocationPhase') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeEvidenceChain') ?? 'missing'}`);

  if (
    blocked.ready
    || partial.ready
    || !syntheticReady.ready
    || !partial.missingRequirements.includes('agent_api_decomposition_source')
    || serviceEvidencePartial.ready
    || serviceEvidencePartial.satisfiedRequirements.length !== 6
    || !serviceEvidencePartial.missingRequirements.includes('agent_api_decomposition_source')
    || scalarValue(serviceEvidencePartial.summary, 'proposalId') !== 'project_decomposition:task_project'
    || scalarValue(serviceEvidencePartial.summary, 'expectedProposalId') !== 'project_decomposition:task_project'
    || scalarValue(serviceEvidencePartial.summary, 'proposalIdEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'proposalParentTask') !== 'task_project'
    || scalarValue(serviceEvidencePartial.summary, 'proposalTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskCount') !== '1'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanSubtaskCount') !== '1'
    || scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskTitles') !== 'Review Agent API decomposition promotion boundary'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanSubtaskTitles') !== 'Review Agent API decomposition promotion boundary'
    || scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskUniqueChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskIdentityChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'parentTask') !== 'task_project'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanParentTask') !== 'task_project'
    || scalarValue(serviceEvidencePartial.summary, 'parentTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'subtaskCount') !== '1'
    || scalarValue(serviceEvidencePartial.summary, 'evidenceRunId') !== 'run_cli_decomposition_smoke'
    || scalarValue(serviceEvidencePartial.summary, 'timelineEvidenceRunId') !== 'run_cli_decomposition_smoke'
    || scalarValue(serviceEvidencePartial.summary, 'sourceEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'evidenceRunIdChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'confirmationBoundary') !== 'operator_confirmed_subtask_create_many'
    || scalarValue(serviceEvidencePartial.summary, 'draftOnlyBeforeConfirmation') !== 'true'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeMode') !== 'api'
    || scalarValue(serviceEvidencePartial.summary, 'invocationLayer') !== 'api_runtime'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeEvidenceRunId') !== 'run_cli_decomposition_smoke'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeEvidenceRunChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeParentTask') !== 'task_project'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeParentTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'timelineRuntimeMode') !== 'api'
    || scalarValue(serviceEvidencePartial.summary, 'timelineInvocationLayer') !== 'api_runtime'
    || scalarValue(serviceEvidencePartial.summary, 'timelineInvocationPhase') !== 'decomposition_draft'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeEvidenceChain') !== 'ready'
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

function scalarValue(summary, key) {
  const prefix = `${key}=`;
  const part = summary.split(' / ').find((item) => item.trim().startsWith(prefix));
  return part?.trim().slice(prefix.length).trim() ?? null;
}

function buildSubtaskDraft() {
  return {
    acceptanceCriteria: 'The reversible child-task draft can be reviewed before persistence.',
    dependency: null,
    summary: 'Prepare one reversible child task draft for promotion-readiness evidence.',
    title: 'Review Agent API decomposition promotion boundary',
  };
}

function sourceIsNewerThanBuild() {
  const buildModulePaths = [invocationModulePath, applyPlanModulePath];
  if (buildModulePaths.some((modulePath) => !fs.existsSync(modulePath))) {
    return false;
  }
  const oldestBuildTime = Math.min(...buildModulePaths.map((modulePath) => fs.statSync(modulePath).mtimeMs));
  return sourceModulePaths
    .filter((modulePath) => fs.existsSync(modulePath))
    .some((modulePath) => fs.statSync(modulePath).mtimeMs > oldestBuildTime);
}

function buildAgentApiDecompositionRuntimeContract() {
  return {
    invocationLayer: 'api_runtime',
    phase: 'decomposition_draft',
    runtimeMode: 'api',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runAgentApiDecompositionPromotionReadinessSmoke();
}
