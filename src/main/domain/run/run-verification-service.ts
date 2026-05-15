import { evaluateRuntimeVerification } from '../../../shared/runtime-verification.js';
import { evaluateRuntimeStepEffect } from '../../../shared/runtime-step-effect-evaluator.js';
import type { RunDetailRecord, RunRecord } from '../../../shared/types/run.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { RunVerificationRepository } from '../../db/repositories/run-verification-repository.js';

export type RunVerificationWriter = Pick<RunVerificationRepository, 'upsert'>;
export type RunStepReader = Pick<RunStepRepository, 'listForRun'>;

type PersistRunVerificationOptions = {
  applicableWorkHabitSummaries?: string[];
  includeRunLevel?: boolean;
};

export async function persistLightweightRunVerifications(
  detail: RunDetailRecord,
  runVerificationRepository: RunVerificationWriter | null,
  options: PersistRunVerificationOptions = {},
): Promise<void> {
  if (!runVerificationRepository) return;

  const steps = detail.steps ?? [];
  for (const step of steps) {
    if (!['completed', 'failed', 'skipped'].includes(step.status)) continue;
    const stepEffect = evaluateRuntimeStepEffect(step);
    const check = evaluateRuntimeVerification({
      mode: 'post_step',
      step,
      producedDurableChange: stepEffect.producedDurableChange,
      hasRecoveryNote: stepEffect.hasRecoveryNote,
      applicableWorkHabitCount: options.applicableWorkHabitSummaries?.length,
    });
    await runVerificationRepository.upsert({
      runId: detail.id,
      targetType: 'step',
      targetId: step.id,
      tone: check.tone,
      label: check.label,
      detail: check.detail,
      source: check.source,
    });
  }

  if (options.includeRunLevel === false) return;
  if (detail.status !== 'completed' && detail.status !== 'failed') return;

  const runCheck = evaluateRuntimeVerification({
    mode: 'run',
    run: detail,
    detail,
    applicableWorkHabitCount: options.applicableWorkHabitSummaries?.length,
  });
  await runVerificationRepository.upsert({
    runId: detail.id,
    targetType: 'run',
    targetId: detail.id,
    tone: runCheck.tone,
    label: runCheck.label,
    detail: runCheck.detail,
    source: runCheck.source,
  });
}

export async function persistTerminalRunVerifications(params: {
  run: RunRecord;
  runStepRepository: RunStepReader;
  runVerificationRepository: RunVerificationWriter | null;
  applicableWorkHabitSummaries?: string[];
  includeRunLevel?: boolean;
}): Promise<void> {
  if (!params.runVerificationRepository) return;

  await persistLightweightRunVerifications(
    {
      ...params.run,
      agentSessions: [],
      artifacts: [],
      checkpoints: [],
      steps: await params.runStepRepository.listForRun(params.run.id),
    },
    params.runVerificationRepository,
    {
      applicableWorkHabitSummaries: params.applicableWorkHabitSummaries,
      includeRunLevel: params.includeRunLevel,
    },
  );
}
