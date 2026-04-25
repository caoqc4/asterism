import { AgentSessionRepository } from '../../db/repositories/agent-session-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import {
  previewSandboxedCodingInjectedProducerRun,
  type PreviewSandboxedCodingInjectedProducerRunResult,
  type SandboxedCodingInjectedProducerRunner,
} from './sandboxed-coding-producer.js';
import {
  SandboxedCodingProducerPreviewPersister,
  summarizeSandboxedCodingProducerPreviewPersistence,
  type PersistSandboxedCodingProducerPreviewResult,
} from './sandboxed-coding-producer-persister.js';
import type { SandboxPatchReviewPlanningService } from './sandbox-patch-review-planning-service.js';
import type { FeatureFlags } from '../../../shared/types/settings.js';

export type RunSandboxedCodingInjectedProducerPreviewResult = {
  persistence: PersistSandboxedCodingProducerPreviewResult;
  persistenceSummary: string;
  preview: PreviewSandboxedCodingInjectedProducerRunResult;
};

export class SandboxedCodingInjectedProducerPreviewService {
  constructor(
    private readonly persister: SandboxedCodingProducerPreviewPersister = new SandboxedCodingProducerPreviewPersister(
      new AgentSessionRepository(),
      new RunStepRepository(),
    ),
  ) {}

  async run(params: {
    decisionTitle?: string | null;
    featureFlags: FeatureFlags;
    patchSummary: string;
    planningService?: Pick<SandboxPatchReviewPlanningService, 'previewFromSource'>;
    request: unknown;
    runner: SandboxedCodingInjectedProducerRunner;
    stagingRoot: string;
  }): Promise<RunSandboxedCodingInjectedProducerPreviewResult> {
    const preview = await previewSandboxedCodingInjectedProducerRun(params);
    const runId = getPreviewRunId(preview);
    const persistence = await this.persister.persist({
      result: preview,
      runId,
    });

    return {
      persistence,
      persistenceSummary: summarizeSandboxedCodingProducerPreviewPersistence({
        result: preview,
        stepCount: persistence.steps.length,
      }),
      preview,
    };
  }
}

function getPreviewRunId(preview: PreviewSandboxedCodingInjectedProducerRunResult): string {
  const runId = preview.steps[0]?.runId ?? preview.events[0]?.runId;

  if (!runId?.trim()) {
    throw new Error('Sandboxed coding producer preview did not produce a run id.');
  }

  return runId;
}
