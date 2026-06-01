import { evaluateRuntimeAction } from '@shared/runtime-action-evaluator';
import { evaluateRuntimeTaskCapture } from '@shared/runtime-task-capture-evaluator';
import { evaluateRuntimeVerification, type RuntimeVerificationResult } from '@shared/runtime-verification';
import type { DecisionActionInput } from '@shared/types/decision';
import type { RunStepRecord } from '@shared/types/run';
import type { TaskListItemRecord, TaskState } from '@shared/types/task';

export type RuntimeGuardResult = {
  allowed: boolean;
  reason: string;
  verification: RuntimeVerificationResult;
};

function buildGuardStep(params: {
  title: string;
  output?: string | null;
  error?: string | null;
}): RunStepRecord {
  const timestamp = new Date().toISOString();
  return {
    id: `renderer_step_${timestamp}`,
    runId: 'renderer_action',
    index: 1,
    kind: 'final',
    status: params.error ? 'failed' : 'completed',
    title: params.title,
    input: null,
    output: params.output ?? null,
    error: params.error ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function guardTaskStateTransition(params: {
  taskId: string;
  nextState: TaskState;
  confirmationSatisfied?: boolean;
}): RuntimeGuardResult {
  const action = evaluateRuntimeAction({
    action: 'task_state_transition',
    fromTaskId: params.taskId,
    targetTaskId: params.taskId,
    targetTaskState: params.nextState,
  });
  const verification = evaluateRuntimeVerification({
    mode: 'pre_step',
    action,
    hasRequiredContext: true,
    confirmationSatisfied: params.confirmationSatisfied,
  });
  return {
    allowed: verification.canProceed,
    reason: verification.detail,
    verification,
  };
}

export function guardTaskMutation(params: {
  taskId: string;
}): RuntimeGuardResult {
  const action = evaluateRuntimeAction({
    action: 'task_mutation',
    fromTaskId: params.taskId,
    targetTaskId: params.taskId,
  });
  const verification = evaluateRuntimeVerification({
    mode: 'pre_step',
    action,
    hasRequiredContext: true,
  });
  return {
    allowed: verification.canProceed,
    reason: verification.detail,
    verification,
  };
}

export function guardTaskCapture(params: {
  fromTaskId?: string | null;
  messageCount?: number;
  confirmationSatisfied?: boolean;
  candidateTitle?: string | null;
  candidateSummary?: string | null;
  existingTasks?: Pick<TaskListItemRecord, 'id' | 'title' | 'state' | 'parentTaskId'>[];
  parentTaskId?: string | null;
}): RuntimeGuardResult {
  if (params.candidateTitle !== undefined || params.existingTasks?.length) {
    const captureEvaluation = evaluateRuntimeTaskCapture({
      title: params.candidateTitle ?? '',
      summary: params.candidateSummary,
      existingTasks: params.existingTasks,
      parentTaskId: params.parentTaskId,
    });
    if (!captureEvaluation.allowed) {
      const verification = evaluateRuntimeVerification({
        mode: 'pre_step',
        action: evaluateRuntimeAction({
          action: 'task_capture',
          fromTaskId: params.fromTaskId ?? null,
          messageCount: params.messageCount ?? 0,
        }),
        hasRequiredContext: false,
        confirmationSatisfied: params.confirmationSatisfied,
      });
      return {
        allowed: false,
        reason: captureEvaluation.summary,
        verification: {
          ...verification,
          detail: captureEvaluation.summary,
        },
      };
    }
  }

  const action = evaluateRuntimeAction({
    action: 'task_capture',
    fromTaskId: params.fromTaskId ?? null,
    messageCount: params.messageCount ?? 0,
  });
  const verification = evaluateRuntimeVerification({
    mode: 'pre_step',
    action,
    hasRequiredContext: true,
    confirmationSatisfied: params.confirmationSatisfied,
  });
  return {
    allowed: verification.canProceed,
    reason: verification.detail,
    verification,
  };
}

export function guardDurablePanelAction(params: {
  taskId: string;
  confirmed?: boolean;
  messageCount?: number;
}): RuntimeGuardResult {
  const action = evaluateRuntimeAction({
    action: 'task_file_write_proposal',
    fromTaskId: params.taskId,
    messageCount: params.messageCount ?? 1,
  });
  const verification = evaluateRuntimeVerification({
    mode: 'pre_step',
    action,
    hasRequiredContext: true,
    confirmationSatisfied: params.confirmed,
  });
  return {
    allowed: verification.canProceed,
    reason: verification.detail,
    verification,
  };
}

export function verifyDurablePanelActionCompleted(params: {
  title: string;
  output: string;
}): RuntimeGuardResult {
  const verification = evaluateRuntimeVerification({
    mode: 'post_step',
    step: buildGuardStep({
      title: params.title,
      output: params.output,
    }),
    producedDurableChange: true,
    hasRecoveryNote: true,
  });
  return {
    allowed: verification.canProceed,
    reason: verification.detail,
    verification,
  };
}

export function guardDecisionAction(params: {
  action: DecisionActionInput['action'];
  taskId?: string | null;
}): RuntimeGuardResult {
  const action = evaluateRuntimeAction({
    action: 'decision_action',
    decisionAction: params.action,
    fromTaskId: params.taskId ?? null,
  });
  const verification = evaluateRuntimeVerification({
    mode: 'pre_step',
    action,
    hasRequiredContext: true,
    confirmationSatisfied: true,
  });
  return {
    allowed: verification.canProceed,
    reason: verification.detail,
    verification,
  };
}

export function verifyDecisionActionCompleted(params: {
  title: string;
  action: DecisionActionInput['action'];
}): RuntimeGuardResult {
  const verification = evaluateRuntimeVerification({
    mode: 'post_step',
    step: buildGuardStep({
      title: '拍板动作',
      output: `已${params.action === 'approve' ? '批准' : params.action === 'defer' ? '延后' : '取消'}：${params.title}`,
    }),
    producedDurableChange: true,
    hasRecoveryNote: true,
  });
  return {
    allowed: verification.canProceed,
    reason: verification.detail,
    verification,
  };
}
