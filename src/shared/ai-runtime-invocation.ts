import type { AiRuntimeMode } from './types/settings.js';
import type { AgentRuntimeVerifierResult } from './agent-runtime-verifier.js';
import type { DecisionDraftRecord } from './types/decision.js';
import type { PilotDecisionSnapshot } from './pilot-decision-contract.js';
import type { RunStatus } from './types/run.js';
import type { TaskExecutionType } from './types/task.js';
import type { ProjectDecompositionResult } from './types/ipc.js';
import type { TaskplaneSubtaskWritebackApplyPlan } from './taskplane-writeback-apply-plan.js';
import {
  RUNTIME_ENTRYPOINT_COVERAGE,
  requiredRuntimeEntrypointGatesForKind,
  type RuntimeEntrypointGate,
} from './runtime-entrypoint-coverage.js';
import {
  buildLocalTaskTypeReviewProposal,
  type TaskTypeReviewProposal,
} from './task-type-review-proposal.js';

export type RuntimeInvocationPhase =
  | 'global_assistant'
  | 'task_assistant'
  | 'task_type_review'
  | 'decomposition_draft'
  | 'decision_draft'
  | 'execution_run'
  | 'verification_assist'
  | 'memory_proposal';

export type RuntimeInvocationLayer =
  | 'selected_runtime'
  | 'api_runtime'
  | 'local_rule'
  | 'product_harness';

export type RuntimeInvocationStatus = 'completed' | 'failed' | 'skipped';

export type RuntimeInvocationRuntimeRef = {
  mode: AiRuntimeMode | 'local_rule' | 'product_harness';
  label: string;
};

export type RuntimeInvocationBase = {
  phase: RuntimeInvocationPhase;
  layer: RuntimeInvocationLayer;
  runtime: RuntimeInvocationRuntimeRef;
  status: RuntimeInvocationStatus;
  summary: string;
};

export type TaskTypeReviewInvocationInput = {
  taskId: string;
  taskTitle: string;
  currentType: TaskExecutionType;
};

export type TaskTypeReviewInvocationResult = RuntimeInvocationBase & {
  phase: 'task_type_review';
  layer: 'local_rule' | 'selected_runtime' | 'api_runtime';
  proposal: TaskTypeReviewProposal;
};

export type DecompositionDraftInvocationInput = {
  taskId: string;
  instructions?: string | null;
};

export type DecompositionDraftInvocationResult = RuntimeInvocationBase & {
  phase: 'decomposition_draft';
  layer: 'selected_runtime' | 'api_runtime';
  draft: ProjectDecompositionResult;
};

export type AgentApiDecompositionPromotionReadiness = {
  ready: boolean;
  satisfiedRequirements: AgentApiDecompositionPromotionRequirement[];
  missingRequirements: AgentApiDecompositionPromotionRequirement[];
  summary: string;
};

export type AgentApiDecompositionPromotionRequirement =
  | 'selected_runtime_contract'
  | 'parent_task_identity'
  | 'reversible_proposal_card'
  | 'subtask_create_many_apply_plan'
  | 'agent_api_decomposition_source'
  | 'operator_confirmation_boundary'
  | 'draft_only_timeline_evidence';

export function agentApiDecompositionPromotionRequirements(): AgentApiDecompositionPromotionRequirement[] {
  return [
    'selected_runtime_contract',
    'parent_task_identity',
    'reversible_proposal_card',
    'subtask_create_many_apply_plan',
    'agent_api_decomposition_source',
    'operator_confirmation_boundary',
    'draft_only_timeline_evidence',
  ];
}

export type AgentApiDecompositionPromotionServiceEvidence = {
  applyPlan?: TaskplaneSubtaskWritebackApplyPlan | null;
  parentTaskId?: string | null;
  reversibleProposalCard?: {
    parentTaskId?: string | null;
    proposalId?: string | null;
    status: 'missing' | 'ready';
    subtaskCount?: number | null;
    subtaskTitles?: string[] | null;
  } | null;
  selectedRuntimeContract?: {
    evidenceRunId?: string | null;
    invocationLayer: RuntimeInvocationLayer;
    parentTaskId?: string | null;
    phase: RuntimeInvocationPhase;
    runtimeMode: AiRuntimeMode | 'local_rule' | 'product_harness';
  } | null;
};

export type DecisionDraftInvocationResult = RuntimeInvocationBase & {
  phase: 'decision_draft';
  layer: 'api_runtime' | 'product_harness';
  draft: DecisionDraftRecord;
};

export type ChatAssistantInvocationResult = RuntimeInvocationBase & {
  phase: 'global_assistant' | 'task_assistant';
  layer: 'api_runtime';
  pilotDecision?: PilotDecisionSnapshot | null;
  text: string;
};

export type ExecutionRunInvocationResult = RuntimeInvocationBase & {
  phase: 'execution_run';
  layer: 'selected_runtime' | 'api_runtime';
  deferredReason?: string | null;
  promotionRequirements?: AgentApiExecutionPromotionRequirement[];
  requiredGates?: RuntimeEntrypointGate[];
};

export type AgentApiExecutionPromotionRequirement =
  | 'selected_runtime_contract'
  | 'target_task_identity'
  | 'provider_visible_preflight'
  | 'runtime_context_manifest'
  | 'context_readiness_step'
  | 'task_memory_guidance'
  | 'run_goal_contract'
  | 'write_intent_extraction'
  | 'reviewed_patch_apply_boundary'
  | 'post_step_verification'
  | 'run_evidence_persistence';

export type AgentApiExecutionPromotionReadiness = {
  ready: boolean;
  satisfiedRequirements: AgentApiExecutionPromotionRequirement[];
  missingRequirements: AgentApiExecutionPromotionRequirement[];
  satisfiedGates: RuntimeEntrypointGate[];
  missingGates: RuntimeEntrypointGate[];
  summary: string;
};

const AGENT_API_EXECUTION_ALLOWED_WRITE_INTENT_ACTIONS = new Set([
  'artifact.propose',
  'task_file.propose',
]);

export type AgentApiExecutionPromotionServiceEvidence = {
  contextManifestSummary?: string | null;
  contextManifestTaskId?: string | null;
  contextReadinessStep?: {
    status: 'blocked' | 'ready';
    stepId?: string | null;
    taskId?: string | null;
  } | null;
  gates?: Partial<Record<RuntimeEntrypointGate, boolean>>;
  providerVisiblePreflight?: {
    configuredProvider?: string | null;
    providerConfigured: boolean;
    runId?: string | null;
    startupProbe: 'called' | 'never' | 'not_called';
    status: 'blocked' | 'ready' | 'skipped';
    taskId?: string | null;
  } | null;
  reviewedPatchApplyBoundary?: {
    appliedPromotionStatus?: 'applied' | 'blocked' | 'pending' | null;
    explicitApplyOnly: boolean;
    promotionPreflightReady: boolean;
    runId?: string | null;
    taskId?: string | null;
  } | null;
  runEvidencePersistence?: {
    runId?: string | null;
    taskId?: string | null;
    terminalEvidenceStatus: 'missing' | 'pending' | 'present';
    terminalRunStatus?: RunStatus | null;
  } | null;
  runGoalContract?: {
    completionConditionCount: number;
    objective?: string | null;
    runId?: string | null;
    taskId?: string | null;
  } | null;
  selectedRuntimeContract?: {
    invocationLayer: RuntimeInvocationLayer;
    phase: RuntimeInvocationPhase;
    runId?: string | null;
    runtimeMode: AiRuntimeMode | 'local_rule' | 'product_harness';
    taskId?: string | null;
  } | null;
  targetTaskId?: string | null;
  taskMemoryGuidance?: {
    guidanceCount: number;
    status: 'missing' | 'ready';
    taskId?: string | null;
  } | null;
  writeIntentExtraction?: {
    runId?: string | null;
    status: 'missing' | 'ready';
    supportedActions: string[];
    taskId?: string | null;
  } | null;
  postStepVerification?: {
    runId?: string | null;
    status: 'missing' | 'ready';
    taskId?: string | null;
    verifier?: string | null;
  } | null;
};

export type VerificationAssistInvocationResult = RuntimeInvocationBase & {
  phase: 'verification_assist';
  layer: 'product_harness';
  verification: AgentRuntimeVerifierResult;
};

export type MemoryProposalInvocationResult = RuntimeInvocationBase & {
  phase: 'memory_proposal';
  layer: 'product_harness';
  proposal: {
    sourceRunId: string;
    targets: string[];
    userConfirmationRequired: boolean;
  };
};

export function buildLocalTaskTypeReviewInvocation(
  input: TaskTypeReviewInvocationInput,
): TaskTypeReviewInvocationResult {
  const proposal = buildLocalTaskTypeReviewProposal(input);
  return {
    phase: 'task_type_review',
    layer: 'local_rule',
    runtime: {
      mode: 'local_rule',
      label: proposal.sourceLabel,
    },
    status: 'completed',
    summary: proposal.reason,
    proposal,
  };
}

export function buildApiRuntimeDecompositionDraftInvocation(params: {
  draft: ProjectDecompositionResult;
  runtimeLabel?: string;
  summary?: string;
}): DecompositionDraftInvocationResult {
  return {
    phase: 'decomposition_draft',
    layer: 'api_runtime',
    runtime: {
      mode: 'api',
      label: params.runtimeLabel ?? 'Agent API Runtime 规划',
    },
    status: 'completed',
    summary: params.summary ?? `已生成 ${params.draft.subtasks.length} 个项目子任务草稿。`,
    draft: params.draft,
  };
}

export function evaluateAgentApiDecompositionPromotionReadiness(params: {
  applyPlan?: TaskplaneSubtaskWritebackApplyPlan | null;
  parentTaskId?: string | null;
  reversibleProposalCardReady?: boolean;
  selectedRuntimeContractReady?: boolean;
}): AgentApiDecompositionPromotionReadiness {
  const requiredRequirements = agentApiDecompositionPromotionRequirements();
  const missingRequirements: AgentApiDecompositionPromotionRequirement[] = [];
  const applyPlan = params.applyPlan ?? null;
  const evidenceParentTaskId = params.parentTaskId?.trim() || '';
  const applyPlanParentTaskId = applyPlan?.input.parentTaskId?.trim() || '';
  const applyPlanEvidenceRunId = applyPlan?.input.evidenceRunId?.trim() || '';
  const applyPlanSubtaskCount = applyPlan?.input.subtasks.length ?? 0;
  const applyPlanSubtaskTitles = normalizedSubtaskTitles(applyPlan?.input.subtasks.map((subtask) => subtask.title) ?? []);
  const applyPlanSubtaskTitleEvidenceChainReady = applyPlanSubtaskTitles.length === applyPlanSubtaskCount;
  const applyPlanReady = applyPlan?.action === 'subtask.create_many'
    && applyPlanSubtaskCount > 0
    && applyPlanSubtaskTitleEvidenceChainReady;
  const timelineEvidenceRunId = typeof applyPlan?.timeline.payload.evidenceRunId === 'string'
    ? applyPlan.timeline.payload.evidenceRunId.trim()
    : '';
  const sourceEvidenceChainReady = applyPlan?.input.source === applyPlan?.timeline.payload.source;
  const evidenceRunIdChainReady = Boolean(applyPlanEvidenceRunId)
    && applyPlanEvidenceRunId === timelineEvidenceRunId;
  const parentTaskIdentityReady = Boolean(evidenceParentTaskId)
    && Boolean(applyPlanParentTaskId)
    && evidenceParentTaskId === applyPlanParentTaskId;

  if (!params.selectedRuntimeContractReady) {
    missingRequirements.push('selected_runtime_contract');
  }

  if (!parentTaskIdentityReady) {
    missingRequirements.push('parent_task_identity');
  }

  if (!params.reversibleProposalCardReady) {
    missingRequirements.push('reversible_proposal_card');
  }

  if (!applyPlanReady) {
    missingRequirements.push('subtask_create_many_apply_plan');
  }

  if (applyPlan?.input.source !== 'agent_api_decomposition' || !sourceEvidenceChainReady) {
    missingRequirements.push('agent_api_decomposition_source');
  }

  if (applyPlan?.timeline.payload.confirmationBoundary !== 'operator_confirmed_subtask_create_many') {
    missingRequirements.push('operator_confirmation_boundary');
  }

  if (applyPlan?.timeline.payload.draftOnlyBeforeConfirmation !== true || !evidenceRunIdChainReady) {
    missingRequirements.push('draft_only_timeline_evidence');
  }

  const ready = missingRequirements.length === 0;
  const missingRequirementSet = new Set(missingRequirements);
  const satisfiedRequirements = requiredRequirements.filter((requirement) => !missingRequirementSet.has(requirement));
  const confirmationBoundary = typeof applyPlan?.timeline.payload.confirmationBoundary === 'string'
    ? applyPlan.timeline.payload.confirmationBoundary
    : 'missing';
  const draftOnlyBeforeConfirmation = applyPlan?.timeline.payload.draftOnlyBeforeConfirmation === true;

  return {
    ready,
    satisfiedRequirements,
    missingRequirements,
    summary: [
      'Agent API decomposition promotion readiness',
      `ready=${ready ? 'yes' : 'no'}`,
      `promotionReady=${ready ? 'yes' : 'no'}`,
      `requirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `promotionRequirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `selectedRuntimeContract=${params.selectedRuntimeContractReady ? 'ready' : 'missing'}`,
      `parentTask=${evidenceParentTaskId || applyPlanParentTaskId || 'missing'}`,
      `applyPlanParentTask=${applyPlanParentTaskId || 'missing'}`,
      `parentTaskEvidenceChain=${parentTaskIdentityReady ? 'ready' : 'missing'}`,
      `proposalCard=${params.reversibleProposalCardReady ? 'ready' : 'missing'}`,
      `applyPlan=${applyPlan?.action ?? 'missing'}`,
      `source=${applyPlan?.input.source ?? 'missing'}`,
      `timelineSource=${typeof applyPlan?.timeline.payload.source === 'string' ? applyPlan.timeline.payload.source : 'missing'}`,
      `sourceEvidenceChain=${sourceEvidenceChainReady ? 'ready' : 'missing'}`,
      'proposalId=missing',
      `subtaskCount=${applyPlanSubtaskCount}`,
      `applyPlanSubtaskTitles=${applyPlanSubtaskTitles.length ? applyPlanSubtaskTitles.join('|') : 'missing'}`,
      `applyPlanSubtaskTitleEvidenceChain=${applyPlanSubtaskTitleEvidenceChainReady ? 'ready' : 'missing'}`,
      `evidenceRunId=${applyPlanEvidenceRunId || 'missing'}`,
      `timelineEvidenceRunId=${timelineEvidenceRunId || 'missing'}`,
      `evidenceRunIdChain=${evidenceRunIdChainReady ? 'ready' : 'missing'}`,
      `confirmationBoundary=${confirmationBoundary}`,
      `draftOnlyBeforeConfirmation=${draftOnlyBeforeConfirmation ? 'true' : 'false'}`,
      'runtimeMode=missing',
      'invocationLayer=missing',
      `missingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `promotionMissingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `missing=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
    ].join(' / '),
  };
}

export function evaluateAgentApiDecompositionPromotionReadinessFromEvidence(
  evidence: AgentApiDecompositionPromotionServiceEvidence,
): AgentApiDecompositionPromotionReadiness {
  const requiredRequirements = agentApiDecompositionPromotionRequirements();
  const satisfiedRequirements: AgentApiDecompositionPromotionRequirement[] = [];
  const applyPlan = evidence.applyPlan ?? null;
  const selectedRuntime = evidence.selectedRuntimeContract;
  const selectedRuntimeEvidenceRunId = selectedRuntime?.evidenceRunId?.trim() || '';
  const selectedRuntimeParentTaskId = selectedRuntime?.parentTaskId?.trim() || '';
  const evidenceParentTaskId = evidence.parentTaskId?.trim() || '';
  const applyPlanParentTaskId = applyPlan?.input.parentTaskId?.trim() || '';
  const applyPlanEvidenceRunId = applyPlan?.input.evidenceRunId?.trim() || '';
  const timelineEvidenceRunId = typeof applyPlan?.timeline.payload.evidenceRunId === 'string'
    ? applyPlan.timeline.payload.evidenceRunId.trim()
    : '';
  const timelineRuntimeContract = parseDecompositionTimelineRuntimeContract(applyPlan?.timeline.payload.runtimeContract);
  const timelineRuntimeEvidenceRunId = timelineRuntimeContract?.evidenceRunId?.trim() || '';
  const timelineRuntimeParentTaskId = timelineRuntimeContract?.parentTaskId?.trim() || '';
  const sourceEvidenceChainReady = applyPlan?.input.source === applyPlan?.timeline.payload.source;
  const evidenceRunIdChainReady = Boolean(applyPlanEvidenceRunId)
    && applyPlanEvidenceRunId === timelineEvidenceRunId;
  const selectedRuntimeEvidenceRunChainReady = Boolean(selectedRuntimeEvidenceRunId)
    && Boolean(applyPlanEvidenceRunId)
    && selectedRuntimeEvidenceRunId === applyPlanEvidenceRunId;
  const selectedRuntimeParentTaskEvidenceChainReady = Boolean(selectedRuntimeParentTaskId)
    && Boolean(applyPlanParentTaskId)
    && selectedRuntimeParentTaskId === applyPlanParentTaskId;
  const selectedRuntimeContractReady = selectedRuntime?.runtimeMode === 'api'
    && selectedRuntime.invocationLayer === 'api_runtime'
    && selectedRuntime.phase === 'decomposition_draft'
    && selectedRuntimeEvidenceRunChainReady
    && selectedRuntimeParentTaskEvidenceChainReady
    && timelineRuntimeContract?.runtimeMode === selectedRuntime.runtimeMode
    && timelineRuntimeContract.invocationLayer === selectedRuntime.invocationLayer
    && timelineRuntimeContract.phase === selectedRuntime.phase
    && Boolean(timelineRuntimeEvidenceRunId)
    && timelineRuntimeEvidenceRunId === selectedRuntimeEvidenceRunId
    && timelineRuntimeEvidenceRunId === applyPlanEvidenceRunId
    && Boolean(timelineRuntimeParentTaskId)
    && timelineRuntimeParentTaskId === selectedRuntimeParentTaskId
    && timelineRuntimeParentTaskId === applyPlanParentTaskId;
  const parentTaskId = evidenceParentTaskId || applyPlanParentTaskId;
  const parentTaskIdentityReady = Boolean(evidenceParentTaskId)
    && Boolean(applyPlanParentTaskId)
    && evidenceParentTaskId === applyPlanParentTaskId;
  const proposalId = evidence.reversibleProposalCard?.proposalId?.trim() || '';
  const proposalParentTaskId = evidence.reversibleProposalCard?.parentTaskId?.trim() || '';
  const expectedProposalId = parentTaskId ? `project_decomposition:${parentTaskId}` : '';
  const proposalIdEvidenceChainReady = Boolean(proposalId)
    && Boolean(expectedProposalId)
    && proposalId === expectedProposalId;
  const applyPlanSubtaskCount = applyPlan?.input.subtasks.length ?? 0;
  const applyPlanSubtaskTitles = normalizedSubtaskTitles(applyPlan?.input.subtasks.map((subtask) => subtask.title) ?? []);
  const proposalSubtaskTitles = normalizedSubtaskTitles(evidence.reversibleProposalCard?.subtaskTitles ?? []);
  const proposalSubtaskCount = typeof evidence.reversibleProposalCard?.subtaskCount === 'number'
    && Number.isFinite(evidence.reversibleProposalCard.subtaskCount)
    ? evidence.reversibleProposalCard.subtaskCount
    : null;
  const applyPlanSubtaskTitleEvidenceChainReady = applyPlanSubtaskTitles.length === applyPlanSubtaskCount;
  const proposalSubtaskTitleEvidenceChainReady = proposalSubtaskCount !== null
    && proposalSubtaskTitles.length === proposalSubtaskCount;
  const proposalTaskEvidenceChainReady = Boolean(proposalParentTaskId)
    && Boolean(parentTaskId)
    && proposalParentTaskId === parentTaskId
    && (!applyPlanParentTaskId || proposalParentTaskId === applyPlanParentTaskId);
  const proposalSubtaskEvidenceChainReady = proposalSubtaskCount !== null
    && proposalSubtaskCount > 0
    && proposalSubtaskCount === applyPlanSubtaskCount;
  const proposalSubtaskUniqueChainReady = (
    proposalSubtaskTitleEvidenceChainReady
    && applyPlanSubtaskTitleEvidenceChainReady
    && titlesAreUnique(proposalSubtaskTitles)
    && titlesAreUnique(applyPlanSubtaskTitles)
    && proposalSubtaskTitles.length === applyPlanSubtaskTitles.length
  );
  const proposalSubtaskIdentityChainReady = applyPlanSubtaskTitles.length > 0
    && applyPlanSubtaskTitleEvidenceChainReady
    && proposalSubtaskTitleEvidenceChainReady
    && proposalSubtaskTitles.length === applyPlanSubtaskTitles.length
    && proposalSubtaskTitles.every((title, index) => title === applyPlanSubtaskTitles[index])
    && proposalSubtaskUniqueChainReady;
  const confirmationBoundary = typeof applyPlan?.timeline.payload.confirmationBoundary === 'string'
    ? applyPlan.timeline.payload.confirmationBoundary
    : 'missing';
  const draftOnlyBeforeConfirmation = applyPlan?.timeline.payload.draftOnlyBeforeConfirmation === true;
  const reversibleProposalReady = (
    evidence.reversibleProposalCard?.status === 'ready'
    && proposalIdEvidenceChainReady
    && proposalTaskEvidenceChainReady
    && proposalSubtaskEvidenceChainReady
    && proposalSubtaskIdentityChainReady
  );

  if (selectedRuntimeContractReady) {
    satisfiedRequirements.push('selected_runtime_contract');
  }

  if (parentTaskIdentityReady) {
    satisfiedRequirements.push('parent_task_identity');
  }

  if (reversibleProposalReady) {
    satisfiedRequirements.push('reversible_proposal_card');
  }

  if (applyPlan?.action === 'subtask.create_many' && applyPlanSubtaskCount > 0 && applyPlanSubtaskTitleEvidenceChainReady) {
    satisfiedRequirements.push('subtask_create_many_apply_plan');
  }

  if (applyPlan?.input.source === 'agent_api_decomposition' && sourceEvidenceChainReady) {
    satisfiedRequirements.push('agent_api_decomposition_source');
  }

  if (applyPlan?.timeline.payload.confirmationBoundary === 'operator_confirmed_subtask_create_many') {
    satisfiedRequirements.push('operator_confirmation_boundary');
  }

  if (applyPlan?.timeline.payload.draftOnlyBeforeConfirmation === true && evidenceRunIdChainReady) {
    satisfiedRequirements.push('draft_only_timeline_evidence');
  }

  const satisfiedRequirementSet = new Set(satisfiedRequirements);
  const missingRequirements = requiredRequirements.filter((requirement) => !satisfiedRequirementSet.has(requirement));
  const ready = missingRequirements.length === 0;

  return {
    ready,
    satisfiedRequirements,
    missingRequirements,
    summary: [
      'Agent API decomposition promotion readiness',
      `ready=${ready ? 'yes' : 'no'}`,
      `promotionReady=${ready ? 'yes' : 'no'}`,
      `requirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `promotionRequirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `selectedRuntimeContract=${satisfiedRequirementSet.has('selected_runtime_contract') ? 'ready' : 'missing'}`,
      `parentTask=${parentTaskId || 'missing'}`,
      `applyPlanParentTask=${applyPlanParentTaskId || 'missing'}`,
      `parentTaskEvidenceChain=${parentTaskIdentityReady ? 'ready' : 'missing'}`,
      `proposalCard=${reversibleProposalReady ? 'ready' : 'missing'}`,
      `applyPlan=${applyPlan?.action ?? 'missing'}`,
      `source=${applyPlan?.input.source ?? 'missing'}`,
      `timelineSource=${typeof applyPlan?.timeline.payload.source === 'string' ? applyPlan.timeline.payload.source : 'missing'}`,
      `sourceEvidenceChain=${sourceEvidenceChainReady ? 'ready' : 'missing'}`,
      `proposalId=${proposalId || 'missing'}`,
      `expectedProposalId=${expectedProposalId || 'missing'}`,
      `proposalIdEvidenceChain=${proposalIdEvidenceChainReady ? 'ready' : 'missing'}`,
      `proposalParentTask=${proposalParentTaskId || 'missing'}`,
      `proposalTaskEvidenceChain=${proposalTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `proposalSubtaskCount=${proposalSubtaskCount ?? 'missing'}`,
      `applyPlanSubtaskCount=${applyPlanSubtaskCount}`,
      `proposalSubtaskEvidenceChain=${proposalSubtaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `proposalSubtaskTitles=${proposalSubtaskTitles.length ? proposalSubtaskTitles.join('|') : 'missing'}`,
      `applyPlanSubtaskTitles=${applyPlanSubtaskTitles.length ? applyPlanSubtaskTitles.join('|') : 'missing'}`,
      `proposalSubtaskTitleEvidenceChain=${proposalSubtaskTitleEvidenceChainReady ? 'ready' : 'missing'}`,
      `applyPlanSubtaskTitleEvidenceChain=${applyPlanSubtaskTitleEvidenceChainReady ? 'ready' : 'missing'}`,
      `proposalSubtaskUniqueChain=${proposalSubtaskUniqueChainReady ? 'ready' : 'missing'}`,
      `proposalSubtaskIdentityChain=${proposalSubtaskIdentityChainReady ? 'ready' : 'missing'}`,
      `subtaskCount=${applyPlanSubtaskCount}`,
      `evidenceRunId=${applyPlanEvidenceRunId || 'missing'}`,
      `timelineEvidenceRunId=${timelineEvidenceRunId || 'missing'}`,
      `evidenceRunIdChain=${evidenceRunIdChainReady ? 'ready' : 'missing'}`,
      `confirmationBoundary=${confirmationBoundary}`,
      `draftOnlyBeforeConfirmation=${draftOnlyBeforeConfirmation ? 'true' : 'false'}`,
      `runtimeMode=${selectedRuntime?.runtimeMode ?? 'missing'}`,
      `invocationLayer=${selectedRuntime?.invocationLayer ?? 'missing'}`,
      `selectedRuntimeEvidenceRunId=${selectedRuntimeEvidenceRunId || 'missing'}`,
      `selectedRuntimeEvidenceRunChain=${selectedRuntimeEvidenceRunChainReady ? 'ready' : 'missing'}`,
      `selectedRuntimeParentTask=${selectedRuntimeParentTaskId || 'missing'}`,
      `selectedRuntimeParentTaskEvidenceChain=${selectedRuntimeParentTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `timelineRuntimeMode=${timelineRuntimeContract?.runtimeMode ?? 'missing'}`,
      `timelineInvocationLayer=${timelineRuntimeContract?.invocationLayer ?? 'missing'}`,
      `timelineInvocationPhase=${timelineRuntimeContract?.phase ?? 'missing'}`,
      `timelineRuntimeEvidenceRunId=${timelineRuntimeEvidenceRunId || 'missing'}`,
      `timelineRuntimeParentTask=${timelineRuntimeParentTaskId || 'missing'}`,
      `selectedRuntimeEvidenceChain=${selectedRuntimeContractReady ? 'ready' : 'missing'}`,
      `missingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `promotionMissingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `missing=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
    ].join(' / '),
  };
}

function parseDecompositionTimelineRuntimeContract(value: unknown): TaskplaneSubtaskCreateManyRuntimeContractEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const contract = value as Partial<TaskplaneSubtaskCreateManyRuntimeContractEvidence>;
  if (
    !isDecompositionRuntimeInvocationLayer(contract.invocationLayer)
    || contract.phase !== 'decomposition_draft'
    || !isDecompositionRuntimeMode(contract.runtimeMode)
  ) {
    return null;
  }
  return {
    evidenceRunId: typeof contract.evidenceRunId === 'string' ? contract.evidenceRunId : null,
    invocationLayer: contract.invocationLayer,
    parentTaskId: typeof contract.parentTaskId === 'string' ? contract.parentTaskId : null,
    phase: contract.phase,
    runtimeMode: contract.runtimeMode,
  };
}

type TaskplaneSubtaskCreateManyRuntimeContractEvidence = {
  evidenceRunId?: string | null;
  invocationLayer: 'api_runtime' | 'selected_runtime';
  parentTaskId?: string | null;
  phase: 'decomposition_draft';
  runtimeMode: 'api' | 'codex' | 'claude';
};

function isDecompositionRuntimeInvocationLayer(value: unknown): value is TaskplaneSubtaskCreateManyRuntimeContractEvidence['invocationLayer'] {
  return value === 'api_runtime' || value === 'selected_runtime';
}

function isDecompositionRuntimeMode(value: unknown): value is TaskplaneSubtaskCreateManyRuntimeContractEvidence['runtimeMode'] {
  return value === 'api' || value === 'codex' || value === 'claude';
}

function normalizedSubtaskTitles(titles: readonly (string | null | undefined)[]): string[] {
  return titles
    .map((title) => title?.trim().replace(/\s+/g, ' ') ?? '')
    .filter(Boolean);
}

function titlesAreUnique(titles: readonly string[]): boolean {
  return titles.length > 0 && new Set(titles).size === titles.length;
}

export function buildApiRuntimeDecisionDraftInvocation(params: {
  draft: DecisionDraftRecord;
  runtimeLabel?: string;
  summary?: string;
}): DecisionDraftInvocationResult {
  return {
    phase: 'decision_draft',
    layer: 'api_runtime',
    runtime: {
      mode: 'api',
      label: params.runtimeLabel ?? 'Agent API Runtime 决策草稿',
    },
    status: 'completed',
    summary: params.summary ?? '已生成待确认的 Decision 草稿。',
    draft: params.draft,
  };
}

export function buildProductHarnessDecisionDraftInvocation(params: {
  draft: DecisionDraftRecord;
  runtimeLabel?: string;
  summary?: string;
}): DecisionDraftInvocationResult {
  return {
    phase: 'decision_draft',
    layer: 'product_harness',
    runtime: {
      mode: 'product_harness',
      label: params.runtimeLabel ?? 'Taskplane 本地决策草稿',
    },
    status: 'skipped',
    summary: params.summary ?? 'AI Runtime 不可用，已生成本地待确认 Decision 草稿。',
    draft: params.draft,
  };
}

export function buildApiRuntimeChatAssistantInvocation(params: {
  phase: 'global_assistant' | 'task_assistant';
  pilotDecision?: PilotDecisionSnapshot | null;
  text: string;
  runtimeLabel?: string;
  summary?: string;
}): ChatAssistantInvocationResult {
  return {
    phase: params.phase,
    layer: 'api_runtime',
    runtime: {
      mode: 'api',
      label: params.runtimeLabel ?? 'Agent API Runtime 助手',
    },
    status: 'completed',
    summary: params.summary ?? (
      params.phase === 'task_assistant'
        ? '已生成任务上下文 API Runtime 回答。'
        : '已生成全局 API Runtime 回答。'
    ),
    pilotDecision: params.pilotDecision ?? null,
    text: params.text,
  };
}

export function buildDeferredAgentApiExecutionRunInvocation(params: {
  runtimeLabel?: string;
  summary?: string;
  deferredReason?: string | null;
} = {}): ExecutionRunInvocationResult {
  const deferredReason = params.deferredReason
    ?? 'Agent API Runtime task execution remains deferred: no provider-visible execution_run starts until the runtime satisfies Taskplane context-readiness, run evidence, verification, and writeback harness gates.';
  const promotionRequirements = [...agentApiExecutionPromotionRequirements()];
  const requiredGates = [...agentApiExecutionRequiredGates()];
  return {
    phase: 'execution_run',
    layer: 'api_runtime',
    runtime: {
      mode: 'api',
      label: params.runtimeLabel ?? 'Agent API Runtime 执行',
    },
    status: 'skipped',
    summary: params.summary ?? [
      deferredReason,
      'promotionReady=no',
      `promotionRequirements=0/${promotionRequirements.length}`,
      `requiredGates=0/${requiredGates.length}`,
      `promotionMissingRequirements=${promotionRequirements.join(',')}`,
      `executionRunMissingRequirements=${promotionRequirements.join(',')}`,
      `missingGates=${requiredGates.join(',')}`,
    ].join(' / '),
    deferredReason,
    promotionRequirements,
    requiredGates,
  };
}

export function agentApiExecutionPromotionRequirements(): AgentApiExecutionPromotionRequirement[] {
  return [
    'selected_runtime_contract',
    'target_task_identity',
    'provider_visible_preflight',
    'runtime_context_manifest',
    'context_readiness_step',
    'task_memory_guidance',
    'run_goal_contract',
    'write_intent_extraction',
    'reviewed_patch_apply_boundary',
    'post_step_verification',
    'run_evidence_persistence',
  ];
}

export function evaluateAgentApiExecutionPromotionReadiness(params: {
  satisfiedRequirements?: AgentApiExecutionPromotionRequirement[];
  satisfiedGates?: RuntimeEntrypointGate[];
} = {}): AgentApiExecutionPromotionReadiness {
  const requiredRequirements = agentApiExecutionPromotionRequirements();
  const requiredGates = agentApiExecutionRequiredGates();
  const satisfiedRequirementSet = new Set(params.satisfiedRequirements ?? []);
  const satisfiedGateSet = new Set(params.satisfiedGates ?? []);
  const satisfiedRequirements = requiredRequirements.filter((requirement) => satisfiedRequirementSet.has(requirement));
  const satisfiedGates = requiredGates.filter((gate) => satisfiedGateSet.has(gate));
  const missingRequirements = requiredRequirements.filter((requirement) => !satisfiedRequirementSet.has(requirement));
  const missingGates = requiredGates.filter((gate) => !satisfiedGateSet.has(gate));
  const ready = missingRequirements.length === 0 && missingGates.length === 0;

  return {
    ready,
    satisfiedRequirements,
    missingRequirements,
    satisfiedGates,
    missingGates,
    summary: [
      'Agent API execution promotion readiness',
      `ready=${ready ? 'yes' : 'no'}`,
      `requirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `gates=${satisfiedGates.length}/${requiredGates.length}`,
      `missingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `missingGates=${missingGates.length ? missingGates.join(',') : 'none'}`,
    ].join(' / '),
  };
}

export function evaluateAgentApiExecutionPromotionReadinessFromEvidence(
  evidence: AgentApiExecutionPromotionServiceEvidence,
): AgentApiExecutionPromotionReadiness {
  const satisfiedRequirements: AgentApiExecutionPromotionRequirement[] = [];
  const selectedRuntime = evidence.selectedRuntimeContract;
  const targetTaskId = evidence.targetTaskId?.trim() || '';
  const selectedRuntimeRunId = selectedRuntime?.runId?.trim() || '';
  const selectedRuntimeTaskId = selectedRuntime?.taskId?.trim() || '';
  const contextManifest = evidence.contextManifestSummary?.trim() || '';
  const contextManifestTaskId = evidence.contextManifestTaskId?.trim()
    || scalarSummaryValue(contextManifest, 'task')
    || '';
  const contextStepId = evidence.contextReadinessStep?.stepId?.trim() || '';
  const contextStepTaskId = evidence.contextReadinessStep?.taskId?.trim() || '';
  const runGoalObjective = evidence.runGoalContract?.objective?.trim() || '';
  const runGoalRunId = evidence.runGoalContract?.runId?.trim() || '';
  const runGoalTaskId = evidence.runGoalContract?.taskId?.trim() || '';
  const taskMemoryGuidanceTaskId = evidence.taskMemoryGuidance?.taskId?.trim() || '';
  const supportedWriteActions = evidence.writeIntentExtraction?.supportedActions
    .map((action) => action.trim())
    .filter(Boolean) ?? [];
  const writeIntentActionBoundaryReady = supportedWriteActions.length > 0
    && supportedWriteActions.every((action) => AGENT_API_EXECUTION_ALLOWED_WRITE_INTENT_ACTIONS.has(action));
  const configuredProvider = evidence.providerVisiblePreflight?.configuredProvider?.trim() || '';
  const providerPreflightRunId = evidence.providerVisiblePreflight?.runId?.trim() || '';
  const providerPreflightTaskId = evidence.providerVisiblePreflight?.taskId?.trim() || '';
  const verifier = evidence.postStepVerification?.verifier?.trim() || '';
  const runEvidenceId = evidence.runEvidencePersistence?.runId?.trim() || '';
  const runEvidenceTaskId = evidence.runEvidencePersistence?.taskId?.trim() || '';
  const terminalRunStatus = evidence.runEvidencePersistence?.terminalRunStatus ?? null;
  const patchPromotionRunId = evidence.reviewedPatchApplyBoundary?.runId?.trim() || '';
  const patchPromotionTaskId = evidence.reviewedPatchApplyBoundary?.taskId?.trim() || '';
  const writeIntentRunId = evidence.writeIntentExtraction?.runId?.trim() || '';
  const writeIntentTaskId = evidence.writeIntentExtraction?.taskId?.trim() || '';
  const postStepRunId = evidence.postStepVerification?.runId?.trim() || '';
  const postStepTaskId = evidence.postStepVerification?.taskId?.trim() || '';
  const runEvidenceTaskEvidenceChainReady = Boolean(runEvidenceId)
    && Boolean(runEvidenceTaskId)
    && Boolean(targetTaskId)
    && runEvidenceTaskId === targetTaskId;
  const terminalRunStatusReady = terminalRunStatus === 'completed' || terminalRunStatus === 'failed';
  const targetTaskIdentityReady = Boolean(targetTaskId)
    && runEvidenceTaskEvidenceChainReady;
  const selectedRuntimeRunEvidenceChainReady = Boolean(selectedRuntimeRunId)
    && Boolean(runEvidenceId)
    && selectedRuntimeRunId === runEvidenceId;
  const selectedRuntimeTaskEvidenceChainReady = Boolean(selectedRuntimeTaskId)
    && Boolean(targetTaskId)
    && selectedRuntimeTaskId === targetTaskId;
  const writeIntentRunEvidenceChainReady = Boolean(writeIntentRunId)
    && Boolean(runEvidenceId)
    && writeIntentRunId === runEvidenceId;
  const writeIntentTaskEvidenceChainReady = Boolean(writeIntentTaskId)
    && Boolean(targetTaskId)
    && writeIntentTaskId === targetTaskId;
  const runGoalRunEvidenceChainReady = Boolean(runGoalRunId)
    && Boolean(runEvidenceId)
    && runGoalRunId === runEvidenceId;
  const runGoalTaskEvidenceChainReady = Boolean(runGoalTaskId)
    && Boolean(targetTaskId)
    && runGoalTaskId === targetTaskId;
  const taskMemoryGuidanceTaskEvidenceChainReady = Boolean(taskMemoryGuidanceTaskId)
    && Boolean(targetTaskId)
    && taskMemoryGuidanceTaskId === targetTaskId;
  const providerPreflightRunEvidenceChainReady = Boolean(providerPreflightRunId)
    && Boolean(runEvidenceId)
    && providerPreflightRunId === runEvidenceId;
  const providerPreflightTaskEvidenceChainReady = Boolean(providerPreflightTaskId)
    && Boolean(targetTaskId)
    && providerPreflightTaskId === targetTaskId;
  const patchPromotionRunEvidenceChainReady = Boolean(patchPromotionRunId)
    && Boolean(runEvidenceId)
    && patchPromotionRunId === runEvidenceId;
  const patchPromotionTaskEvidenceChainReady = Boolean(patchPromotionTaskId)
    && Boolean(targetTaskId)
    && patchPromotionTaskId === targetTaskId;
  const postStepRunEvidenceChainReady = Boolean(postStepRunId)
    && Boolean(runEvidenceId)
    && postStepRunId === runEvidenceId;
  const postStepTaskEvidenceChainReady = Boolean(postStepTaskId)
    && Boolean(targetTaskId)
    && postStepTaskId === targetTaskId;
  const contextManifestEvidenceChainReady = Boolean(contextManifest)
    && Boolean(contextManifestTaskId)
    && Boolean(targetTaskId)
    && contextManifestTaskId === targetTaskId;
  const contextStepTaskEvidenceChainReady = Boolean(contextStepTaskId)
    && Boolean(targetTaskId)
    && contextStepTaskId === targetTaskId;
  const reviewedPatchApplyBoundaryReady = (
    evidence.reviewedPatchApplyBoundary?.explicitApplyOnly === true
    && evidence.reviewedPatchApplyBoundary.promotionPreflightReady === true
    && evidence.reviewedPatchApplyBoundary.appliedPromotionStatus === 'applied'
    && patchPromotionRunEvidenceChainReady
    && patchPromotionTaskEvidenceChainReady
  );
  const runGoalContractReady = Boolean(
    runGoalObjective
    && evidence.runGoalContract?.completionConditionCount
    && evidence.runGoalContract.completionConditionCount > 0
    && runGoalRunEvidenceChainReady
    && runGoalTaskEvidenceChainReady,
  );
  const taskMemoryGuidanceReady = (
    evidence.taskMemoryGuidance?.status === 'ready'
    && Number.isFinite(evidence.taskMemoryGuidance.guidanceCount)
    && evidence.taskMemoryGuidance.guidanceCount >= 0
    && taskMemoryGuidanceTaskEvidenceChainReady
  );
  const postStepVerificationReady = (
    evidence.postStepVerification?.status === 'ready'
    && Boolean(verifier)
    && postStepRunEvidenceChainReady
    && postStepTaskEvidenceChainReady
  );

  if (
    selectedRuntime?.runtimeMode === 'api'
    && selectedRuntime.invocationLayer === 'api_runtime'
    && selectedRuntime.phase === 'execution_run'
    && selectedRuntimeRunEvidenceChainReady
    && selectedRuntimeTaskEvidenceChainReady
  ) {
    satisfiedRequirements.push('selected_runtime_contract');
  }

  if (targetTaskIdentityReady) {
    satisfiedRequirements.push('target_task_identity');
  }

  if (
    evidence.providerVisiblePreflight?.status === 'ready'
    && evidence.providerVisiblePreflight.providerConfigured
    && Boolean(configuredProvider)
    && (
      evidence.providerVisiblePreflight.startupProbe === 'never'
      || evidence.providerVisiblePreflight.startupProbe === 'not_called'
    )
    && providerPreflightRunEvidenceChainReady
    && providerPreflightTaskEvidenceChainReady
  ) {
    satisfiedRequirements.push('provider_visible_preflight');
  }

  if (contextManifestEvidenceChainReady) {
    satisfiedRequirements.push('runtime_context_manifest');
  }

  if (
    evidence.contextReadinessStep?.status === 'ready'
    && contextStepId
    && contextStepTaskEvidenceChainReady
  ) {
    satisfiedRequirements.push('context_readiness_step');
  }

  if (taskMemoryGuidanceReady) {
    satisfiedRequirements.push('task_memory_guidance');
  }

  if (runGoalContractReady) {
    satisfiedRequirements.push('run_goal_contract');
  }

  if (
    evidence.writeIntentExtraction?.status === 'ready'
    && supportedWriteActions.includes('artifact.propose')
    && supportedWriteActions.includes('task_file.propose')
    && writeIntentActionBoundaryReady
    && writeIntentRunEvidenceChainReady
    && writeIntentTaskEvidenceChainReady
  ) {
    satisfiedRequirements.push('write_intent_extraction');
  }

  if (reviewedPatchApplyBoundaryReady) {
    satisfiedRequirements.push('reviewed_patch_apply_boundary');
  }

  if (postStepVerificationReady) {
    satisfiedRequirements.push('post_step_verification');
  }

  if (
    runEvidenceId
    && runEvidenceTaskEvidenceChainReady
    && terminalRunStatusReady
    && evidence.runEvidencePersistence?.terminalEvidenceStatus === 'present'
  ) {
    satisfiedRequirements.push('run_evidence_persistence');
  }

  const requiredGates = agentApiExecutionRequiredGates();
  const gateEvidenceReady = (gate: RuntimeEntrypointGate): boolean => {
    if (evidence.gates?.[gate] !== true) return false;
    if (gate === 'runtime_context_assembly') return contextManifestEvidenceChainReady;
    if (gate === 'context_readiness') {
      return evidence.contextReadinessStep?.status === 'ready'
        && Boolean(contextStepId)
        && contextStepTaskEvidenceChainReady;
    }
    if (gate === 'task_memory_guidance') return taskMemoryGuidanceReady;
    if (gate === 'pre_step') return runGoalContractReady;
    if (gate === 'post_step') return postStepVerificationReady;
    return true;
  };
  const satisfiedGates = requiredGates.filter((gate) => gateEvidenceReady(gate));

  const readiness = evaluateAgentApiExecutionPromotionReadiness({
    satisfiedGates,
    satisfiedRequirements,
  });
  return {
    ...readiness,
    summary: [
      readiness.summary,
      `targetTask=${targetTaskId || 'missing'}`,
      `runEvidenceTask=${runEvidenceTaskId || 'missing'}`,
      `targetTaskEvidenceChain=${targetTaskIdentityReady ? 'ready' : 'missing'}`,
      `runEvidenceTaskEvidenceChain=${runEvidenceTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `selectedRuntimeRun=${selectedRuntimeRunId || 'missing'}`,
      `selectedRuntimeRunEvidenceChain=${selectedRuntimeRunEvidenceChainReady ? 'ready' : 'missing'}`,
      `selectedRuntimeTask=${selectedRuntimeTaskId || 'missing'}`,
      `selectedRuntimeTaskEvidenceChain=${selectedRuntimeTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `providerConfigured=${evidence.providerVisiblePreflight?.providerConfigured === true ? 'ready' : 'missing'}`,
      `configuredProvider=${configuredProvider || 'missing'}`,
      `providerStartupProbe=${evidence.providerVisiblePreflight?.startupProbe ?? 'missing'}`,
      `providerPreflightRun=${providerPreflightRunId || 'missing'}`,
      `providerPreflightRunEvidenceChain=${providerPreflightRunEvidenceChainReady ? 'ready' : 'missing'}`,
      `providerPreflightTask=${providerPreflightTaskId || 'missing'}`,
      `providerPreflightTaskEvidenceChain=${providerPreflightTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `runId=${runEvidenceId || 'missing'}`,
      `writeIntentRun=${writeIntentRunId || 'missing'}`,
      `writeIntentRunEvidenceChain=${writeIntentRunEvidenceChainReady ? 'ready' : 'missing'}`,
      `writeIntentTask=${writeIntentTaskId || 'missing'}`,
      `writeIntentTaskEvidenceChain=${writeIntentTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `contextStep=${contextStepId || 'missing'}`,
      `contextStepTask=${contextStepTaskId || 'missing'}`,
      `contextStepTaskEvidenceChain=${contextStepTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `contextReadinessGateEvidenceChain=${gateEvidenceReady('context_readiness') ? 'ready' : 'missing'}`,
      `contextManifest=${contextManifest || 'missing'}`,
      `contextManifestTask=${contextManifestTaskId || 'missing'}`,
      `contextManifestEvidenceChain=${contextManifestEvidenceChainReady ? 'ready' : 'missing'}`,
      `runtimeContextAssemblyGateEvidenceChain=${gateEvidenceReady('runtime_context_assembly') ? 'ready' : 'missing'}`,
      `taskMemoryGuidance=${evidence.taskMemoryGuidance?.status ?? 'missing'}`,
      `taskMemoryGuidanceCount=${evidence.taskMemoryGuidance?.guidanceCount ?? 0}`,
      `taskMemoryGuidanceTask=${taskMemoryGuidanceTaskId || 'missing'}`,
      `taskMemoryGuidanceTaskEvidenceChain=${taskMemoryGuidanceTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `taskMemoryGuidanceGateEvidenceChain=${gateEvidenceReady('task_memory_guidance') ? 'ready' : 'missing'}`,
      `runGoalConditions=${evidence.runGoalContract?.completionConditionCount ?? 0}`,
      `runGoalRun=${runGoalRunId || 'missing'}`,
      `runGoalRunEvidenceChain=${runGoalRunEvidenceChainReady ? 'ready' : 'missing'}`,
      `runGoalTask=${runGoalTaskId || 'missing'}`,
      `runGoalTaskEvidenceChain=${runGoalTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `preStepGateEvidenceChain=${gateEvidenceReady('pre_step') ? 'ready' : 'missing'}`,
      `writeIntentActions=${supportedWriteActions.length ? supportedWriteActions.join(',') : 'none'}`,
      `writeIntentActionBoundary=${writeIntentActionBoundaryReady ? 'ready' : 'missing'}`,
      `reviewedPatchApplyBoundary=${reviewedPatchApplyBoundaryReady ? 'ready' : 'missing'}`,
      `patchPromotionStatus=${evidence.reviewedPatchApplyBoundary?.appliedPromotionStatus ?? 'missing'}`,
      `patchPromotionRun=${patchPromotionRunId || 'missing'}`,
      `patchPromotionRunEvidenceChain=${patchPromotionRunEvidenceChainReady ? 'ready' : 'missing'}`,
      `patchPromotionTask=${patchPromotionTaskId || 'missing'}`,
      `patchPromotionTaskEvidenceChain=${patchPromotionTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `postStepRun=${postStepRunId || 'missing'}`,
      `postStepRunEvidenceChain=${postStepRunEvidenceChainReady ? 'ready' : 'missing'}`,
      `postStepTask=${postStepTaskId || 'missing'}`,
      `postStepTaskEvidenceChain=${postStepTaskEvidenceChainReady ? 'ready' : 'missing'}`,
      `postStepVerifier=${verifier || 'missing'}`,
      `postStepGateEvidenceChain=${gateEvidenceReady('post_step') ? 'ready' : 'missing'}`,
      `terminalRunStatus=${terminalRunStatus ?? 'missing'}`,
      `terminalRunStatusEvidenceChain=${terminalRunStatusReady ? 'ready' : 'missing'}`,
      `terminalEvidence=${evidence.runEvidencePersistence?.terminalEvidenceStatus ?? 'missing'}`,
      `runtimeMode=${selectedRuntime?.runtimeMode ?? 'missing'}`,
      `invocationLayer=${selectedRuntime?.invocationLayer ?? 'missing'}`,
    ].join(' / '),
  };
}

function scalarSummaryValue(summary: string, key: string): string | null {
  const prefix = `${key}=`;
  const part = summary.split(' / ').find((item) => item.trim().startsWith(prefix));
  return part?.trim().slice(prefix.length).trim() ?? null;
}

export function evaluateAgentApiExecutionPromotionReadinessForInvocation(
  invocation: ExecutionRunInvocationResult,
): AgentApiExecutionPromotionReadiness {
  if (invocation.phase !== 'execution_run' || invocation.layer !== 'api_runtime') {
    return evaluateAgentApiExecutionPromotionReadiness();
  }

  return evaluateAgentApiExecutionPromotionReadiness();
}

function agentApiExecutionRequiredGates(): RuntimeEntrypointGate[] {
  return RUNTIME_ENTRYPOINT_COVERAGE.find((entrypoint) => entrypoint.id === 'run.triggerAgentApi.future')?.requiredGates
    ?? requiredRuntimeEntrypointGatesForKind('provider_visible_execution');
}

export function buildProductHarnessVerificationAssistInvocation(params: {
  verification: AgentRuntimeVerifierResult;
  runtimeLabel?: string;
  summary?: string;
}): VerificationAssistInvocationResult {
  return {
    phase: 'verification_assist',
    layer: 'product_harness',
    runtime: {
      mode: 'product_harness',
      label: params.runtimeLabel ?? 'Taskplane lightweight verifier',
    },
    status: 'completed',
    summary: params.summary ?? `Verifier decision: ${params.verification.decision}.`,
    verification: params.verification,
  };
}

export function buildProductHarnessMemoryProposalInvocation(params: {
  sourceRunId: string;
  targets: string[];
  userConfirmationRequired: boolean;
  runtimeLabel?: string;
  summary?: string;
}): MemoryProposalInvocationResult {
  return {
    phase: 'memory_proposal',
    layer: 'product_harness',
    runtime: {
      mode: 'product_harness',
      label: params.runtimeLabel ?? 'Taskplane Task Memory proposal',
    },
    status: 'completed',
    summary: params.summary ?? '已生成待用户确认的任务记忆写入提案。',
    proposal: {
      sourceRunId: params.sourceRunId,
      targets: params.targets,
      userConfirmationRequired: params.userConfirmationRequired,
    },
  };
}
