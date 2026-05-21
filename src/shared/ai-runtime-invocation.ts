import type { AiRuntimeMode } from './types/settings.js';
import type { DecisionDraftRecord } from './types/decision.js';
import type { TaskExecutionType } from './types/task.js';
import type { ProjectDecompositionResult } from './types/ipc.js';
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

export type DecisionDraftInvocationResult = RuntimeInvocationBase & {
  phase: 'decision_draft';
  layer: 'api_runtime' | 'product_harness';
  draft: DecisionDraftRecord;
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
