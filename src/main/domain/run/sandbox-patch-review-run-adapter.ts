import type { RunStepRecord } from '../../../shared/types/run.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type {
  AgentSandboxCheckPlan,
  AgentSandboxSessionRequest,
} from '../../../shared/agent-sandbox-provider.js';
import type { FeatureFlags } from '../../../shared/types/settings.js';
import {
  type LocalContainerSandboxCommandRunner,
  type LocalContainerSandboxPatchDraft,
  type LocalContainerSandboxProvider,
  prepareLocalContainerSandboxPatchReview,
} from './local-container-sandbox-backend.js';
import type {
  PersistSandboxPatchReviewResult,
  SandboxPatchReviewPersister,
} from './sandbox-patch-review-persister.js';

export type SandboxPatchReviewRunAdapterResult =
  | {
      status: 'blocked';
      reason: string;
      step: RunStepRecord | null;
    }
  | {
      status: 'persisted';
      result: PersistSandboxPatchReviewResult;
    }
  | {
      status: 'failed';
      reason: string;
      step: RunStepRecord;
    };

export class SandboxPatchReviewRunAdapter {
  constructor(
    private readonly provider: LocalContainerSandboxProvider,
    private readonly persister: Pick<SandboxPatchReviewPersister, 'persist'>,
    private readonly runStepRepository: Pick<RunStepRepository, 'create'>,
  ) {}

  async run(params: {
    checkPlan: AgentSandboxCheckPlan;
    decisionTitle?: string | null;
    featureFlags: FeatureFlags;
    patchDraft: LocalContainerSandboxPatchDraft;
    request: AgentSandboxSessionRequest;
    runner: LocalContainerSandboxCommandRunner;
  }): Promise<SandboxPatchReviewRunAdapterResult> {
    try {
      const preparation = await prepareLocalContainerSandboxPatchReview({
        checkPlan: params.checkPlan,
        featureFlags: params.featureFlags,
        patchDraft: params.patchDraft,
        provider: this.provider,
        request: params.request,
        runner: params.runner,
      });
      const result = await this.persister.persist({
        decisionTitle: params.decisionTitle,
        preparation,
        runId: params.request.runId,
        taskId: params.request.taskId,
      });

      return {
        result,
        status: 'persisted',
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Sandbox patch review failed.';

      if (reason.startsWith('Sandbox coding lane unavailable:')) {
        return {
          reason,
          status: 'blocked',
          step: null,
        };
      }

      const step = await this.runStepRepository.create({
        runId: params.request.runId,
        kind: 'final',
        status: 'failed',
        title: 'sandbox patch review failed',
        output: reason,
      });

      return {
        reason,
        status: 'failed',
        step,
      };
    }
  }
}
