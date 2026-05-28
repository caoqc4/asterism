#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const invocationModulePath = path.join(root, 'dist-electron', 'shared', 'ai-runtime-invocation.js');
const applyPlanModulePath = path.join(root, 'dist-electron', 'shared', 'taskplane-writeback-apply-plan.js');

export async function runAgentApiDecompositionPromotionReadinessSmoke() {
  console.log('Agent API decomposition promotion readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('subtasks=not-created');
  console.log('workspace=unchanged');
  console.log('promotionInProduct=deferred');

  const missingModules = [invocationModulePath, applyPlanModulePath].filter((modulePath) => !fs.existsSync(modulePath));
  if (missingModules.length > 0) {
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
    reversibleProposalCard: {
      proposalId: 'proposal_agent_api_decomposition',
      status: 'ready',
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
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
  console.log(`serviceEvidenceParentTask=${scalarValue(serviceEvidencePartial.summary, 'parentTask') ?? 'missing'}`);
  console.log(`serviceEvidenceSubtaskCount=${scalarValue(serviceEvidencePartial.summary, 'subtaskCount') ?? 'missing'}`);
  console.log(`serviceEvidenceEvidenceRunId=${scalarValue(serviceEvidencePartial.summary, 'evidenceRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceConfirmationBoundary=${scalarValue(serviceEvidencePartial.summary, 'confirmationBoundary') ?? 'missing'}`);
  console.log(`serviceEvidenceDraftOnlyBeforeConfirmation=${scalarValue(serviceEvidencePartial.summary, 'draftOnlyBeforeConfirmation') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeMode=${scalarValue(serviceEvidencePartial.summary, 'runtimeMode') ?? 'missing'}`);
  console.log(`serviceEvidenceInvocationLayer=${scalarValue(serviceEvidencePartial.summary, 'invocationLayer') ?? 'missing'}`);

  if (
    blocked.ready
    || partial.ready
    || !syntheticReady.ready
    || !partial.missingRequirements.includes('agent_api_decomposition_source')
    || serviceEvidencePartial.ready
    || serviceEvidencePartial.satisfiedRequirements.length !== 6
    || !serviceEvidencePartial.missingRequirements.includes('agent_api_decomposition_source')
    || scalarValue(serviceEvidencePartial.summary, 'proposalId') !== 'proposal_agent_api_decomposition'
    || scalarValue(serviceEvidencePartial.summary, 'parentTask') !== 'task_project'
    || scalarValue(serviceEvidencePartial.summary, 'subtaskCount') !== '1'
    || scalarValue(serviceEvidencePartial.summary, 'evidenceRunId') !== 'run_cli_decomposition_smoke'
    || scalarValue(serviceEvidencePartial.summary, 'confirmationBoundary') !== 'operator_confirmed_subtask_create_many'
    || scalarValue(serviceEvidencePartial.summary, 'draftOnlyBeforeConfirmation') !== 'true'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeMode') !== 'api'
    || scalarValue(serviceEvidencePartial.summary, 'invocationLayer') !== 'api_runtime'
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

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runAgentApiDecompositionPromotionReadinessSmoke();
}
