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
    runtimeContract: buildAgentApiDecompositionRuntimeContract('run_cli_decomposition_smoke', 'task_project'),
    source: 'agent_cli_decomposition',
    subtasks: [buildSubtaskDraft()],
  });
  const partial = evaluateAgentApiDecompositionPromotionReadiness({
    applyPlan: partialApplyPlan,
    parentTaskId: 'task_project',
    reversibleProposalCardReady: true,
    selectedRuntimeContractReady: true,
  });
  const readyApplyPlan = buildSubtaskCreateManyWritebackApplyPlan({
    evidenceRunId: 'run_api_decomposition_smoke',
    parentTaskId: 'task_project',
    runtimeContract: buildAgentApiDecompositionRuntimeContract('run_api_decomposition_smoke', 'task_project'),
    source: 'agent_api_decomposition',
    subtasks: [buildSubtaskDraft()],
  });
  const syntheticReady = evaluateAgentApiDecompositionPromotionReadiness({
    applyPlan: readyApplyPlan,
    parentTaskId: 'task_project',
    reversibleProposalCardReady: true,
    selectedRuntimeContractReady: true,
  });
  const serviceEvidencePartial = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
    applyPlan: partialApplyPlan,
    parentTaskId: 'task_project',
    reversibleProposalCard: buildReversibleProposalCard(),
    providerConfiguration: {
      configuredProvider: 'openai',
      providerConfigured: true,
    },
    selectedRuntimeContract: {
      evidenceRunId: 'run_cli_decomposition_smoke',
      invocationLayer: 'api_runtime',
      parentTaskId: 'task_project',
      provider: 'openai',
      phase: 'decomposition_draft',
      runtimeMode: 'api',
    },
  });
  const serviceEvidenceReady = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
    applyPlan: readyApplyPlan,
    parentTaskId: 'task_project',
    reversibleProposalCard: buildReversibleProposalCard(),
    providerConfiguration: {
      configuredProvider: 'openai',
      providerConfigured: true,
    },
    selectedRuntimeContract: {
      evidenceRunId: 'run_api_decomposition_smoke',
      invocationLayer: 'api_runtime',
      parentTaskId: 'task_project',
      provider: 'openai',
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
  console.log(`serviceEvidenceReadyPromotionReady=${serviceEvidenceReady.ready ? 'yes' : 'no'}`);
  console.log(`serviceEvidenceReadyRequirements=${serviceEvidenceReady.satisfiedRequirements.length}/7`);
  console.log(`serviceEvidenceReadyMissingRequirements=${serviceEvidenceReady.missingRequirements.join(',') || 'none'}`);
  console.log(`serviceEvidenceReadySource=${scalarValue(serviceEvidenceReady.summary, 'source') ?? 'missing'}`);
  console.log(`serviceEvidenceReadySourceEvidenceChain=${scalarValue(serviceEvidenceReady.summary, 'sourceEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceReadyEvidenceRunId=${scalarValue(serviceEvidenceReady.summary, 'evidenceRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceReadyTimelineEvidenceRunId=${scalarValue(serviceEvidenceReady.summary, 'timelineEvidenceRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceReadySelectedRuntimeEvidenceChain=${scalarValue(serviceEvidenceReady.summary, 'selectedRuntimeEvidenceChain') ?? 'missing'}`);
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
  console.log(`serviceEvidenceProposalSubtaskTitleEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskTitleEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanSubtaskTitleEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'applyPlanSubtaskTitleEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalSubtaskSummaries=${scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskSummaries') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanSubtaskSummaries=${scalarValue(serviceEvidencePartial.summary, 'applyPlanSubtaskSummaries') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalSubtaskSummaryEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskSummaryEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanSubtaskSummaryEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'applyPlanSubtaskSummaryEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalAcceptanceCriteria=${scalarValue(serviceEvidencePartial.summary, 'proposalAcceptanceCriteria') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanAcceptanceCriteria=${scalarValue(serviceEvidencePartial.summary, 'applyPlanAcceptanceCriteria') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalAcceptanceCriteriaEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'proposalAcceptanceCriteriaEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanAcceptanceCriteriaEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'applyPlanAcceptanceCriteriaEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalRationales=${scalarValue(serviceEvidencePartial.summary, 'proposalRationales') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanRationales=${scalarValue(serviceEvidencePartial.summary, 'applyPlanRationales') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalRationaleEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'proposalRationaleEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanRationaleEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'applyPlanRationaleEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalDependencies=${scalarValue(serviceEvidencePartial.summary, 'proposalDependencies') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanDependencies=${scalarValue(serviceEvidencePartial.summary, 'applyPlanDependencies') ?? 'missing'}`);
  console.log(`serviceEvidenceProposalDependencyEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'proposalDependencyEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceApplyPlanDependencyEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'applyPlanDependencyEvidenceChain') ?? 'missing'}`);
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
  console.log(`serviceEvidenceSelectedRuntimeProvider=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProvider') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeProviderEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProviderEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderConfigured=${scalarValue(serviceEvidencePartial.summary, 'providerConfigured') ?? 'missing'}`);
  console.log(`serviceEvidenceConfiguredProvider=${scalarValue(serviceEvidencePartial.summary, 'configuredProvider') ?? 'missing'}`);
  console.log(`serviceEvidenceConfiguredProviderEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'configuredProviderEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTimelineRuntimeMode=${scalarValue(serviceEvidencePartial.summary, 'timelineRuntimeMode') ?? 'missing'}`);
  console.log(`serviceEvidenceTimelineInvocationLayer=${scalarValue(serviceEvidencePartial.summary, 'timelineInvocationLayer') ?? 'missing'}`);
  console.log(`serviceEvidenceTimelineInvocationPhase=${scalarValue(serviceEvidencePartial.summary, 'timelineInvocationPhase') ?? 'missing'}`);
  console.log(`serviceEvidenceTimelineRuntimeEvidenceRunId=${scalarValue(serviceEvidencePartial.summary, 'timelineRuntimeEvidenceRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceTimelineRuntimeParentTask=${scalarValue(serviceEvidencePartial.summary, 'timelineRuntimeParentTask') ?? 'missing'}`);
  console.log(`serviceEvidenceTimelineRuntimeProvider=${scalarValue(serviceEvidencePartial.summary, 'timelineRuntimeProvider') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeEvidenceChain') ?? 'missing'}`);

  if (
    blocked.ready
    || partial.ready
    || !syntheticReady.ready
    || !partial.missingRequirements.includes('agent_api_decomposition_source')
    || serviceEvidencePartial.ready
    || serviceEvidencePartial.satisfiedRequirements.length !== 6
    || !serviceEvidencePartial.missingRequirements.includes('agent_api_decomposition_source')
    || !serviceEvidenceReady.ready
    || serviceEvidenceReady.satisfiedRequirements.length !== 7
    || serviceEvidenceReady.missingRequirements.length !== 0
    || scalarValue(serviceEvidenceReady.summary, 'source') !== 'agent_api_decomposition'
    || scalarValue(serviceEvidenceReady.summary, 'sourceEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceReady.summary, 'evidenceRunId') !== 'run_api_decomposition_smoke'
    || scalarValue(serviceEvidenceReady.summary, 'timelineEvidenceRunId') !== 'run_api_decomposition_smoke'
    || scalarValue(serviceEvidenceReady.summary, 'selectedRuntimeEvidenceChain') !== 'ready'
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
    || scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskTitleEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanSubtaskTitleEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskSummaries') !== 'Prepare one reversible child task draft for promotion-readiness evidence.'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanSubtaskSummaries') !== 'Prepare one reversible child task draft for promotion-readiness evidence.'
    || scalarValue(serviceEvidencePartial.summary, 'proposalSubtaskSummaryEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanSubtaskSummaryEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'proposalAcceptanceCriteria') !== 'The reversible child-task draft can be reviewed before persistence.'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanAcceptanceCriteria') !== 'The reversible child-task draft can be reviewed before persistence.'
    || scalarValue(serviceEvidencePartial.summary, 'proposalAcceptanceCriteriaEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanAcceptanceCriteriaEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'proposalRationales') !== 'This is an independent and reviewable promotion-readiness slice.'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanRationales') !== 'This is an independent and reviewable promotion-readiness slice.'
    || scalarValue(serviceEvidencePartial.summary, 'proposalRationaleEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanRationaleEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'proposalDependencies') !== 'none'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanDependencies') !== 'none'
    || scalarValue(serviceEvidencePartial.summary, 'proposalDependencyEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'applyPlanDependencyEvidenceChain') !== 'ready'
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
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProvider') !== 'openai'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProviderEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'providerConfigured') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'configuredProvider') !== 'openai'
    || scalarValue(serviceEvidencePartial.summary, 'configuredProviderEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'timelineRuntimeMode') !== 'api'
    || scalarValue(serviceEvidencePartial.summary, 'timelineInvocationLayer') !== 'api_runtime'
    || scalarValue(serviceEvidencePartial.summary, 'timelineInvocationPhase') !== 'decomposition_draft'
    || scalarValue(serviceEvidencePartial.summary, 'timelineRuntimeEvidenceRunId') !== 'run_cli_decomposition_smoke'
    || scalarValue(serviceEvidencePartial.summary, 'timelineRuntimeParentTask') !== 'task_project'
    || scalarValue(serviceEvidencePartial.summary, 'timelineRuntimeProvider') !== 'openai'
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
    rationale: 'This is an independent and reviewable promotion-readiness slice.',
    summary: 'Prepare one reversible child task draft for promotion-readiness evidence.',
    title: 'Review Agent API decomposition promotion boundary',
  };
}

function buildReversibleProposalCard() {
  return {
    parentTaskId: 'task_project',
    proposalId: 'project_decomposition:task_project',
    status: 'ready',
    subtaskCount: 1,
    subtaskSummaries: ['Prepare one reversible child task draft for promotion-readiness evidence.'],
    subtaskTitles: ['Review Agent API decomposition promotion boundary'],
    acceptanceCriteria: ['The reversible child-task draft can be reviewed before persistence.'],
    rationales: ['This is an independent and reviewable promotion-readiness slice.'],
    dependencies: [null],
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

function buildAgentApiDecompositionRuntimeContract(evidenceRunId, parentTaskId) {
  return {
    evidenceRunId,
    invocationLayer: 'api_runtime',
    parentTaskId,
    provider: 'openai',
    phase: 'decomposition_draft',
    runtimeMode: 'api',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runAgentApiDecompositionPromotionReadinessSmoke();
}
