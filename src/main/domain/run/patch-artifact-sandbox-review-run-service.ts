import type { CodeAgentAllowedCheck, RunRecord } from '../../../shared/types/run.js';
import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { AiConfigService } from '../../keychain/ai-config-service.js';
import type { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import type { DecisionRepository } from '../../db/repositories/decision-repository.js';
import type { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import type { RunRepository } from '../../db/repositories/run-repository.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { SandboxPatchPromotionRepository } from '../../db/repositories/sandbox-patch-promotion-repository.js';
import { AgentCheckpointRecorder } from './agent-checkpoint-recorder.js';
import {
  createLocalContainerSandboxCommandRunner,
  LocalContainerSandboxProvider,
  type LocalContainerSandboxCommandRunner,
} from './local-container-sandbox-backend.js';
import { SandboxPatchReviewPersister } from './sandbox-patch-review-persister.js';
import { SandboxPatchReviewPlanningService } from './sandbox-patch-review-planning-service.js';
import { SandboxPatchReviewRunAdapter } from './sandbox-patch-review-run-adapter.js';

export type PatchArtifactSandboxReviewRunResult =
  | {
      artifactId: string;
      noWorkspaceFilesWritten: true;
      reason: string;
      run: RunRecord | null;
      status: 'blocked';
      summary: string;
      taskId: string;
    }
  | {
      artifactId: string;
      noWorkspaceFilesWritten: true;
      reason: string;
      run: RunRecord;
      status: 'failed';
      summary: string;
      taskId: string;
    }
  | {
      artifactId: string;
      checkpointId: string | null;
      decisionId: string | null;
      noWorkspaceFilesWritten: true;
      reviewedArtifactId: string;
      run: RunRecord;
      status: 'completed';
      summary: string;
      taskId: string;
    };

export class PatchArtifactSandboxReviewRunService {
  constructor(
    private readonly artifactRepository: Pick<ArtifactRepository, 'createPatchFromRun' | 'findById'>,
    private readonly aiConfigService: Pick<AiConfigService, 'getStatus'>,
    private readonly runRepository: Pick<RunRepository, 'create' | 'updateResult'>,
    private readonly runStepRepository: RunStepRepository,
    private readonly runCheckpointRepository: RunCheckpointRepository,
    private readonly decisionRepository: Pick<DecisionRepository, 'create'>,
    private readonly sandboxPatchPromotionRepository: Pick<SandboxPatchPromotionRepository, 'createPending'>,
    private readonly planningService: Pick<SandboxPatchReviewPlanningService, 'previewFromPatchArtifact'> =
      new SandboxPatchReviewPlanningService(),
    private readonly createRunner: () => LocalContainerSandboxCommandRunner =
      () => createLocalContainerSandboxCommandRunner(),
    private readonly createProvider: () => LocalContainerSandboxProvider =
      () => new LocalContainerSandboxProvider(),
  ) {}

  async run(input: {
    artifactId: string;
    operatorConfirmed: boolean;
    requestedChecks?: CodeAgentAllowedCheck[];
  }): Promise<PatchArtifactSandboxReviewRunResult> {
    if (input.operatorConfirmed !== true) {
      throw new Error('Patch artifact sandbox review requires explicit operator confirmation.');
    }

    const artifact = await this.artifactRepository.findById(input.artifactId);

    if (!artifact) {
      throw new Error(`Artifact not found: ${input.artifactId}`);
    }

    const run = await this.runRepository.create({
      instructions: `Run sandbox patch review from confirmed patch artifact: ${artifact.title}`,
      taskId: artifact.taskId,
      type: 'agent',
    });
    const aiStatus = await this.aiConfigService.getStatus();
    const plan = this.planningService.previewFromPatchArtifact({
      artifact,
      featureFlags: aiStatus.featureFlags,
      requestedScripts: input.requestedChecks,
      reviewRunId: run.id,
      workspaceRoot: aiStatus.workspaceRoot,
    });

    if (plan.status === 'blocked') {
      const updatedRun = await this.runRepository.updateResult(
        run.id,
        'failed',
        plan.summary,
        'system',
        plan.reason,
      );
      return {
        artifactId: artifact.id,
        noWorkspaceFilesWritten: true,
        reason: plan.reason,
        run: updatedRun,
        status: 'blocked',
        summary: plan.summary,
        taskId: artifact.taskId,
      };
    }

    const adapter = new SandboxPatchReviewRunAdapter(
      this.createProvider(),
      new SandboxPatchReviewPersister(
        this.artifactRepository,
        this.runStepRepository,
        new AgentCheckpointRecorder(
          this.runCheckpointRepository,
          this.runStepRepository,
          this.decisionRepository,
          this.sandboxPatchPromotionRepository,
        ),
      ),
      this.runStepRepository,
    );
    const result = await adapter.run({
      checkPlan: plan.requestBundle.checkPlan,
      decisionTitle: plan.decisionTitle,
      featureFlags: aiStatus.featureFlags,
      patchDraft: plan.patchDraft,
      request: plan.requestBundle.request,
      runner: this.createRunner(),
    });

    if (result.status === 'blocked' || result.status === 'failed') {
      const summary = result.reason;
      const updatedRun = await this.runRepository.updateResult(
        run.id,
        'failed',
        summary,
        'system',
        summary,
      );
      return {
        artifactId: artifact.id,
        noWorkspaceFilesWritten: true,
        reason: summary,
        run: updatedRun,
        status: result.status === 'blocked' ? 'blocked' : 'failed',
        summary,
        taskId: artifact.taskId,
      };
    }

    const summary = formatCompletedSummary({
      artifact,
      checkpointId: result.result.checkpoint?.checkpointId ?? null,
      decisionId: result.result.checkpoint?.decisionId ?? null,
      reviewedArtifactId: result.result.artifact.id,
    });
    const updatedRun = await this.runRepository.updateResult(
      run.id,
      'completed',
      summary,
      'system',
    );

    return {
      artifactId: artifact.id,
      checkpointId: result.result.checkpoint?.checkpointId ?? null,
      decisionId: result.result.checkpoint?.decisionId ?? null,
      noWorkspaceFilesWritten: true,
      reviewedArtifactId: result.result.artifact.id,
      run: updatedRun,
      status: 'completed',
      summary,
      taskId: artifact.taskId,
    };
  }
}

function formatCompletedSummary(params: {
  artifact: ArtifactRecord;
  checkpointId: string | null;
  decisionId: string | null;
  reviewedArtifactId: string;
}): string {
  return [
    `Sandbox patch review completed from artifact ${params.artifact.id}.`,
    `reviewedArtifact=${params.reviewedArtifactId}`,
    params.checkpointId
      ? `promotionCheckpoint=${params.checkpointId}`
      : 'promotionCheckpoint=none',
    params.decisionId
      ? `promotionDecision=${params.decisionId}`
      : 'promotionDecision=none',
    'no workspace files written',
  ].join(' / ');
}
