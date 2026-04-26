import type { FeatureFlags } from '../../../shared/types/settings.js';
import {
  createLocalContainerSandboxCommandRunner,
  probeLocalContainerSandboxBackend,
  type LocalContainerRuntimeProbeRunner,
  type LocalContainerSandboxCommandRunner,
} from './local-container-sandbox-backend.js';
import type {
  LocalContainerSandboxedCodingProducerLoop,
} from './local-container-sandboxed-coding-producer-runner.js';
import {
  LocalContainerSandboxedCodingProducerPreviewService,
  type RunLocalContainerSandboxedCodingProducerPreviewResult,
} from './local-container-sandboxed-coding-producer-preview-service.js';
import type { SandboxPatchReviewPlanningService } from './sandbox-patch-review-planning-service.js';

export type RunLocalContainerSandboxedCodingProducerExecutionResult =
  | {
      reason: string;
      status: 'blocked';
      summary: string;
    }
  | {
      preview: RunLocalContainerSandboxedCodingProducerPreviewResult;
      status: 'completed';
      summary: string;
    };

export class LocalContainerSandboxedCodingProducerExecutionService {
  constructor(
    private readonly previewService: Pick<LocalContainerSandboxedCodingProducerPreviewService, 'run'> = new LocalContainerSandboxedCodingProducerPreviewService(),
  ) {}

  async run(params: {
    commandRunner?: LocalContainerSandboxCommandRunner;
    decisionTitle?: string | null;
    featureFlags: FeatureFlags;
    operatorConfirmed: boolean;
    patchSummary: string;
    planningService?: Pick<SandboxPatchReviewPlanningService, 'previewFromSource'>;
    probeRunner?: LocalContainerRuntimeProbeRunner;
    producerLoop: LocalContainerSandboxedCodingProducerLoop;
    request: unknown;
  }): Promise<RunLocalContainerSandboxedCodingProducerExecutionResult> {
    if (!params.operatorConfirmed) {
      return {
        reason: 'Local container producer execution requires explicit operator confirmation.',
        status: 'blocked',
        summary: 'Local container producer execution blocked before Docker probe.',
      };
    }

    const probe = await probeLocalContainerSandboxBackend({
      runner: params.probeRunner,
    });
    const commandRunner = params.commandRunner ?? createLocalContainerSandboxCommandRunner();
    const preview = await this.previewService.run({
      commandRunner,
      decisionTitle: params.decisionTitle,
      featureFlags: params.featureFlags,
      patchSummary: params.patchSummary,
      planningService: params.planningService,
      probe,
      producerLoop: params.producerLoop,
      request: params.request,
    });

    return {
      preview,
      status: 'completed',
      summary: preview.summary,
    };
  }
}
