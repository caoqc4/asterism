import { evaluateRuntimeVerification } from '../../../shared/runtime-verification.js';
import type { RunStepRecord } from '../../../shared/types/run.js';

export function assertRunArtifactWriteAllowed(params: {
  input?: string | null;
  output: string;
  runId: string;
  title: string;
}): void {
  const timestamp = new Date().toISOString();
  const verification = evaluateRuntimeVerification({
    mode: 'post_step',
    step: {
      id: `run_artifact_write_${params.runId}`,
      runId: params.runId,
      index: 1,
      kind: 'artifact',
      status: 'completed',
      title: params.title,
      input: params.input ?? null,
      output: params.output,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies RunStepRecord,
    producedDurableChange: true,
    hasRecoveryNote: Boolean(params.output.trim()),
  });

  if (!verification.canProceed) {
    throw new Error(verification.detail);
  }
}
