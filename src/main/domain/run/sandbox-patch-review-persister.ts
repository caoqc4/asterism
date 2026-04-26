import { createHash } from 'node:crypto';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import type {
  AgentSandboxPatchArtifact,
  AgentSandboxSessionAudit,
} from '../../../shared/agent-sandbox-provider.js';
import type { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type {
  AgentPatchPromotionCheckpointResult,
  AgentCheckpointRecorder,
} from './agent-checkpoint-recorder.js';
import type { LocalContainerSandboxPatchReviewPreparation } from './local-container-sandbox-backend.js';

export type PersistSandboxPatchReviewResult = {
  artifact: ArtifactRecord;
  checkpoint: AgentPatchPromotionCheckpointResult | null;
  steps: {
    session: RunStepRecord;
    checks: RunStepRecord;
    artifact: RunStepRecord;
  };
};

export type SandboxPatchReviewArtifactContent = {
  artifact: AgentSandboxPatchArtifact;
  review: {
    audit: AgentSandboxSessionAudit | null;
    sandboxSessionId: string;
    sessionSummary: string;
  };
};

export class SandboxPatchReviewPersister {
  constructor(
    private readonly artifactRepository: Pick<ArtifactRepository, 'createPatchFromRun'>,
    private readonly runStepRepository: Pick<RunStepRepository, 'create'>,
    private readonly checkpointRecorder: Pick<AgentCheckpointRecorder, 'createPatchPromotionCheckpoint'>,
  ) {}

  async persist(params: {
    preparation: LocalContainerSandboxPatchReviewPreparation;
    runId: string;
    taskId: string;
    decisionTitle?: string | null;
  }): Promise<PersistSandboxPatchReviewResult> {
    const { preparation } = params;
    const sessionStep = await this.runStepRepository.create({
      runId: params.runId,
      kind: 'plan',
      status: 'completed',
      title: '准备 sandbox patch review',
      input: preparation.sessionSummary,
      output: `sandbox=${preparation.handle.id}`,
    });
    const checkStep = await this.runStepRepository.create({
      runId: params.runId,
      kind: 'tool_result',
      status: preparation.checkRun.results.some((result) => result.status === 'failed')
        ? 'failed'
        : 'completed',
      title: 'sandbox targeted checks',
      input: preparation.checkRun.results.map((result) => result.script).join(', '),
      output: preparation.checkRun.summary,
    });
    const artifact = await this.artifactRepository.createPatchFromRun({
      taskId: params.taskId,
      runId: params.runId,
      title: preparation.artifact.summary,
      content: JSON.stringify(buildSandboxPatchReviewArtifactContent(preparation), null, 2),
    });
    const artifactStep = await this.runStepRepository.create({
      runId: params.runId,
      kind: 'artifact',
      status: 'completed',
      title: '记录 sandbox patch artifact',
      input: preparation.artifact.files.join(', '),
      output: artifact.id,
    });
    const checksPassed = preparation.checkRun.results.every((result) => result.status !== 'failed');
    const checkpoint = checksPassed
      ? await this.checkpointRecorder.createPatchPromotionCheckpoint({
          runId: params.runId,
          taskId: params.taskId,
          artifactId: artifact.id,
          artifactSummary: preparation.artifact.summary,
          expectedFiles: preparation.artifact.files,
          patchDigest: buildSandboxPatchDigest(preparation.artifact.diff),
          sessionId: preparation.handle.id,
          policySnapshot: preparation.checkpoint.policySnapshot,
          decisionTitle: params.decisionTitle?.trim() || '确认提升 sandbox patch',
          preview: preparation.artifact.diff,
        })
      : null;

    return {
      artifact,
      checkpoint,
      steps: {
        artifact: artifactStep,
        checks: checkStep,
        session: sessionStep,
      },
    };
  }
}

export function buildSandboxPatchDigest(diff: string): string {
  return `sha256:${createHash('sha256').update(diff, 'utf8').digest('hex')}`;
}

export function buildSandboxPatchReviewArtifactContent(
  preparation: LocalContainerSandboxPatchReviewPreparation,
): SandboxPatchReviewArtifactContent {
  return {
    artifact: preparation.artifact,
    review: {
      audit: preparation.audit,
      sandboxSessionId: preparation.handle.id,
      sessionSummary: preparation.sessionSummary,
    },
  };
}
