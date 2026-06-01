import type { RunStepRecord } from './types/run.js';

export type RuntimeStepEffectEvaluation = {
  producedDurableChange: boolean;
  hasRecoveryNote: boolean;
  requiresPromotionEvidence: boolean;
  reasons: string[];
};

const durableChangePattern = /(artifact|created|updated|saved|wrote|write|mutated|mutation|file|patch|产物|生成|创建|更新|保存|写入|文件|变更|修改)/i;
const workspaceWriteCandidatePattern = /capability=workspace_write|工作区写入候选|workspace write candidate/i;

function textForStep(step: RunStepRecord): string {
  return [
    step.kind,
    step.title,
    step.input,
    step.output,
    step.error,
  ].filter(Boolean).join('\n');
}

export function evaluateRuntimeStepEffect(step: RunStepRecord): RuntimeStepEffectEvaluation {
  const text = textForStep(step);
  const kindIndicatesDurableChange = step.kind === 'artifact' || step.kind === 'decision' || step.kind === 'checkpoint';
  const textIndicatesDurableChange = durableChangePattern.test(text);
  const requiresPromotionEvidence = workspaceWriteCandidatePattern.test(text);
  const producedDurableChange = kindIndicatesDurableChange || textIndicatesDurableChange;
  const hasRecoveryNote = Boolean(step.output?.trim() || step.error?.trim());
  const reasons: string[] = [];

  if (kindIndicatesDurableChange) reasons.push(`step kind ${step.kind} is durable`);
  if (textIndicatesDurableChange) reasons.push('step text references a durable change');
  if (requiresPromotionEvidence) reasons.push('workspace write candidate requires promotion evidence');
  if (hasRecoveryNote) reasons.push('step has output or error recovery note');

  return {
    producedDurableChange,
    hasRecoveryNote,
    requiresPromotionEvidence,
    reasons,
  };
}
