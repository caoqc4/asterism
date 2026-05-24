import type { AgentRuntimeAdapterCapabilities } from './agent-runtime-goal.js';
import {
  evaluateContextPreservation,
  type ContextPreservationEvaluation,
  type ContextPreservationInput,
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
  intent: ContextTransitionIntent;
  preservation: ContextPreservationEvaluation;
  reason: string;
  resetStrategy: ContextResetStrategy;
  requiresUserConfirmation: boolean;
};

export type ContextTransitionInput = ContextPreservationInput & {
  intent: ContextTransitionIntent;
  preferCompact?: boolean;
  runtimeCapabilities?: AgentRuntimeAdapterCapabilities | null;
};

export function evaluateContextTransition(input: ContextTransitionInput): ContextTransitionEvaluation {
  const preservation = evaluateContextPreservation(input);
  const resetStrategy = chooseContextResetStrategy({
    preferCompact: input.preferCompact,
    runtimeCapabilities: input.runtimeCapabilities ?? null,
  });

  if (preservation.status === 'not_applicable') {
    return transition(input, preservation, 'continue', 'none', false, '当前没有任务上下文，不需要过渡处理。');
  }

  if (preservation.status === 'needs_user_decision') {
    return transition(input, preservation, 'ask_before_transition', 'none', true, preservation.reason);
  }

  if (preservation.status === 'keep_context') {
    return transition(
      input,
      preservation,
      input.preferCompact ? 'compact' : 'block_transition',
      input.preferCompact ? chooseCompactStrategy(input.runtimeCapabilities ?? null) : 'none',
      false,
      preservation.reason,
    );
  }

  if (preservation.status === 'needs_write') {
    const handoffIntent = input.intent === 'switch_task' || input.intent === 'phase_closeout';
    return transition(
      input,
      preservation,
      handoffIntent ? 'create_handoff' : 'preserve_and_reset',
      resetStrategy,
      true,
      preservation.reason,
    );
  }

  if (input.intent === 'switch_task' || input.intent === 'phase_closeout') {
    return transition(input, preservation, 'create_handoff', resetStrategy, false, '上下文已保全，可以交接并重新装配目标任务上下文。');
  }

  if (input.intent === 'resume_run') {
    return transition(input, preservation, 'preserve_and_reset', resetStrategy, false, '恢复运行前应从持久上下文重新装配任务。');
  }

  return transition(input, preservation, 'preserve_and_reset', resetStrategy, false, '上下文已保全，可以刷新当前任务会话。');
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
  action: ContextTransitionAction,
  resetStrategy: ContextResetStrategy,
  requiresUserConfirmation: boolean,
  reason: string,
): ContextTransitionEvaluation {
  return {
    action,
    canProceedAfterWrites: action === 'preserve_and_reset' || action === 'create_handoff' || action === 'continue',
    intent: input.intent,
    preservation,
    reason,
    resetStrategy,
    requiresUserConfirmation,
  };
}
