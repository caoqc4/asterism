import type { AgentSandboxBackendProbe } from '../../../shared/agent-sandbox-provider.js';
import type { FeatureFlags } from '../../../shared/types/settings.js';
import {
  LocalContainerSandboxProvider,
  type LocalContainerSandboxCommandRunner,
} from './local-container-sandbox-backend.js';
import {
  type LocalContainerSandboxedCodingProducerLoop,
  prepareLocalContainerSandboxedCodingProducerRunnerSession,
} from './local-container-sandboxed-coding-producer-runner.js';
import type { SandboxPatchReviewPlanningService } from './sandbox-patch-review-planning-service.js';
import {
  SandboxedCodingInjectedProducerPreviewService,
  type RunSandboxedCodingInjectedProducerPreviewResult,
} from './sandboxed-coding-injected-producer-preview-service.js';
import {
  SandboxedCodingProducerBackendPreflightService,
  type RunSandboxedCodingProducerBackendPreflightResult,
} from './sandboxed-coding-producer-backend-preflight-service.js';

export type RunLocalContainerSandboxedCodingProducerPreviewResult =
  | {
      preflight: Extract<RunSandboxedCodingProducerBackendPreflightResult, { status: 'blocked' }>;
      status: 'blocked';
      summary: string;
    }
  | {
      preflight: Extract<RunSandboxedCodingProducerBackendPreflightResult, { status: 'ready' }>;
      preview: RunSandboxedCodingInjectedProducerPreviewResult;
      runnerSummary: string;
      status: 'previewed';
      summary: string;
    };

export class LocalContainerSandboxedCodingProducerPreviewService {
  constructor(
    private readonly preflightService: Pick<SandboxedCodingProducerBackendPreflightService, 'run'> = new SandboxedCodingProducerBackendPreflightService(),
    private readonly previewService: Pick<SandboxedCodingInjectedProducerPreviewService, 'run'> = new SandboxedCodingInjectedProducerPreviewService(),
    private readonly provider: Pick<LocalContainerSandboxProvider, 'disposeSession' | 'prepareSession' | 'runChecks'> = new LocalContainerSandboxProvider(),
  ) {}

  async run(params: {
    commandRunner: LocalContainerSandboxCommandRunner;
    decisionTitle?: string | null;
    featureFlags: FeatureFlags;
    patchSummary: string;
    planningService?: Pick<SandboxPatchReviewPlanningService, 'previewFromSource'>;
    probe: AgentSandboxBackendProbe;
    producerLoop: LocalContainerSandboxedCodingProducerLoop;
    producerSource?: 'local_diagnostic' | 'model_backed' | null;
    request: unknown;
  }): Promise<RunLocalContainerSandboxedCodingProducerPreviewResult> {
    const preflight = await this.preflightService.run({
      featureFlags: params.featureFlags,
      probe: params.probe,
      producerSource: params.producerSource,
      request: params.request,
    });

    if (preflight.status === 'blocked') {
      return {
        preflight,
        status: 'blocked',
        summary: preflight.summary,
      };
    }

    const runnerSession = await prepareLocalContainerSandboxedCodingProducerRunnerSession({
      commandRunner: params.commandRunner,
      envelope: preflight.envelope,
      producerLoop: params.producerLoop,
      provider: this.provider,
    });

    try {
      const preview = await this.previewService.run({
        decisionTitle: params.decisionTitle,
        featureFlags: params.featureFlags,
        patchSummary: params.patchSummary,
        planningService: params.planningService,
        request: params.request,
        runner: runnerSession.runner,
        stagingRoot: runnerSession.stagingRoot,
      });

      return {
        preflight,
        preview,
        runnerSummary: runnerSession.summary,
        status: 'previewed',
        summary: [
          runnerSession.summary,
          preview.persistenceSummary,
        ].join(' / '),
      };
    } finally {
      await runnerSession.dispose();
    }
  }
}
