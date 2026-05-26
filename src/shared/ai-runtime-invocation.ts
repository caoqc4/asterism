import type { AiRuntimeMode } from './types/settings.js';
import type { AgentRuntimeVerifierResult } from './agent-runtime-verifier.js';
import type { DecisionDraftRecord } from './types/decision.js';
import type { PilotDecisionSnapshot } from './pilot-decision-contract.js';
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
  missingRequirements: Array<
    | 'selected_runtime_contract'
    | 'reversible_proposal_card'
    | 'subtask_create_many_apply_plan'
    | 'agent_api_decomposition_source'
    | 'operator_confirmation_boundary'
    | 'draft_only_timeline_evidence'
  >;
  summary: string;
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
  reversibleProposalCardReady?: boolean;
  selectedRuntimeContractReady?: boolean;
}): AgentApiDecompositionPromotionReadiness {
  const missingRequirements: AgentApiDecompositionPromotionReadiness['missingRequirements'] = [];
  const applyPlan = params.applyPlan ?? null;

  if (!params.selectedRuntimeContractReady) {
    missingRequirements.push('selected_runtime_contract');
  }

  if (!params.reversibleProposalCardReady) {
    missingRequirements.push('reversible_proposal_card');
  }

  if (applyPlan?.action !== 'subtask.create_many') {
    missingRequirements.push('subtask_create_many_apply_plan');
  }

  if (applyPlan?.input.source !== 'agent_api_decomposition') {
    missingRequirements.push('agent_api_decomposition_source');
  }

  if (applyPlan?.timeline.payload.confirmationBoundary !== 'operator_confirmed_subtask_create_many') {
    missingRequirements.push('operator_confirmation_boundary');
  }

  if (applyPlan?.timeline.payload.draftOnlyBeforeConfirmation !== true) {
    missingRequirements.push('draft_only_timeline_evidence');
  }

  const ready = missingRequirements.length === 0;

  return {
    ready,
    missingRequirements,
    summary: [
      'Agent API decomposition promotion readiness',
      `ready=${ready ? 'yes' : 'no'}`,
      `selectedRuntimeContract=${params.selectedRuntimeContractReady ? 'ready' : 'missing'}`,
      `proposalCard=${params.reversibleProposalCardReady ? 'ready' : 'missing'}`,
      `applyPlan=${applyPlan?.action ?? 'missing'}`,
      `source=${applyPlan?.input.source ?? 'missing'}`,
      `missing=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
    ].join(' / '),
  };
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
  return {
    phase: 'execution_run',
    layer: 'api_runtime',
    runtime: {
      mode: 'api',
      label: params.runtimeLabel ?? 'Agent API Runtime 执行',
    },
    status: 'skipped',
    summary: params.summary ?? deferredReason,
    deferredReason,
    promotionRequirements: [...agentApiExecutionPromotionRequirements()],
    requiredGates: [...agentApiExecutionRequiredGates()],
  };
}

export function agentApiExecutionPromotionRequirements(): AgentApiExecutionPromotionRequirement[] {
  return [
    'selected_runtime_contract',
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
