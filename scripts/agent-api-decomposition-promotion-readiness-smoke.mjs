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

  if (
    blocked.ready
    || partial.ready
    || !syntheticReady.ready
    || !partial.missingRequirements.includes('agent_api_decomposition_source')
    || serviceEvidencePartial.ready
    || serviceEvidencePartial.satisfiedRequirements.length !== 6
    || !serviceEvidencePartial.missingRequirements.includes('agent_api_decomposition_source')
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
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
