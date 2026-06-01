import type { AgentRuntimeAdapterCapabilities } from './agent-runtime-goal.js';
import {
  evaluateContextPreservation,
  type ContextPreservationEvaluation,
  type ContextPreservationInput,
  type HandoffRecoveryArtifact,
  type HandoffV2Type,
} from './context-preservation.js';

export type ContextTransitionIntent =
  | 'context_refresh'
  | 'leave_task_context'
  | 'phase_closeout'
  | 'resume_run'
  | 'start_global_conversation'
  | 'switch_task';

export type ContextTransitionAction =
  | 'ask_before_transition'
  | 'block_transition'
  | 'compact'
  | 'continue'
  | 'create_handoff'
  | 'preserve_and_reset';

export type ContextResetStrategy =
  | 'none'
  | 'product_transcript_reset'
  | 'runtime_compact'
  | 'runtime_native_clear'
  | 'runtime_restart';

export type ContextTransitionEvaluation = {
  action: ContextTransitionAction;
  canProceedAfterWrites: boolean;
  handoffType: HandoffV2Type;
  intent: ContextTransitionIntent;
  preservation: ContextPreservationEvaluation;
  reason: string;
  recoveryArtifact: HandoffRecoveryArtifact | null;
  resetStrategy: ContextResetStrategy;
  requiresUserConfirmation: boolean;
};

export type ContextTransitionInput = ContextPreservationInput & {
  intent: ContextTransitionIntent;
  preferCompact?: boolean;
  runtimeCapabilities?: AgentRuntimeAdapterCapabilities | null;
};

export function evaluateContextTransition(input: ContextTransitionInput): ContextTransitionEvaluation {
  const defaultHandoffType = input.handoffType ?? defaultTransitionHandoffType(input);
  const preservation = evaluateContextPreservation(
    defaultHandoffType ? { ...input, handoffType: defaultHandoffType } : input,
  );
  const handoffType = preservation.handoffType ?? defaultHandoffType ?? 'ephemeral_session_handoff';
  const resetStrategy = chooseContextResetStrategy({
    preferCompact: input.preferCompact,
    runtimeCapabilities: input.runtimeCapabilities ?? null,
  });

  if (preservation.status === 'not_applicable') {
    return transition(input, preservation, handoffType, 'continue', 'none', false, '当前没有业务线或任务上下文，不需要过渡处理。');
  }

  if (preservation.status === 'needs_user_decision') {
    return transition(input, preservation, handoffType, 'ask_before_transition', 'none', true, preservation.reason);
  }

  if (preservation.status === 'keep_context') {
    return transition(
      input,
      preservation,
      handoffType,
      'block_transition',
      'none',
      false,
      preservation.reason,
    );
  }

  if (preservation.status === 'needs_write') {
    const handoffIntent = input.intent === 'switch_task' || input.intent === 'phase_closeout';
    return transition(
      input,
      preservation,
      handoffType,
      handoffIntent ? 'create_handoff' : 'preserve_and_reset',
      resetStrategy,
      true,
      preservation.reason,
    );
  }

  if (input.intent === 'switch_task' || input.intent === 'phase_closeout') {
    return transition(input, preservation, handoffType, 'create_handoff', resetStrategy, false, '上下文已保全，可以交接并重新装配目标上下文。');
  }

  if (input.intent === 'resume_run') {
    return transition(input, preservation, handoffType, 'preserve_and_reset', resetStrategy, false, '恢复运行前应从持久上下文重新装配任务。');
  }

  return transition(input, preservation, handoffType, 'preserve_and_reset', resetStrategy, false, '上下文已保全，可以刷新当前会话。');
}

export function chooseContextResetStrategy(params: {
  preferCompact?: boolean;
  runtimeCapabilities?: AgentRuntimeAdapterCapabilities | null;
}): ContextResetStrategy {
  if (params.preferCompact) return chooseCompactStrategy(params.runtimeCapabilities ?? null);
  const capabilities = params.runtimeCapabilities;
  if (capabilities?.supportsPersistentSession && capabilities.supportsNativeClear) return 'runtime_native_clear';
  if (capabilities?.supportsPersistentSession) return 'runtime_restart';
  return 'product_transcript_reset';
}

function chooseCompactStrategy(capabilities: AgentRuntimeAdapterCapabilities | null): ContextResetStrategy {
  if (capabilities?.supportsPersistentSession && capabilities.supportsNativeCompact) return 'runtime_compact';
  return 'product_transcript_reset';
}

function transition(
  input: ContextTransitionInput,
  preservation: ContextPreservationEvaluation,
  handoffType: HandoffV2Type,
  action: ContextTransitionAction,
  resetStrategy: ContextResetStrategy,
  requiresUserConfirmation: boolean,
  reason: string,
): ContextTransitionEvaluation {
  return {
    action,
    canProceedAfterWrites: action === 'preserve_and_reset' || action === 'create_handoff' || action === 'continue',
    handoffType,
    intent: input.intent,
    preservation,
    reason,
    recoveryArtifact: preservation.handoffArtifact,
    resetStrategy,
    requiresUserConfirmation,
  };
}

function defaultTransitionHandoffType(input: ContextTransitionInput): HandoffV2Type | null {
  switch (input.intent) {
    case 'context_refresh':
      return null;
    case 'leave_task_context':
    case 'start_global_conversation':
      return input.owner?.kind === 'business_line'
        || input.owner?.kind === 'next_action'
        || input.owner?.kind === 'legacy_task'
        || input.hasBusinessLineContext
        || input.hasTaskContext
        ? null
        : 'ephemeral_session_handoff';
    case 'resume_run':
      return 'runtime_or_subagent_handoff';
    case 'phase_closeout':
    case 'switch_task':
      return 'next_action_handoff';
  }
}
