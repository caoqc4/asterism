import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type {
  BrowserEvidenceArtifact,
  BrowserEvidenceRequest,
  BrowserEvidenceResult,
} from '../../../shared/types/browser-evidence.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import type { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { assertRunArtifactWriteAllowed } from './run-artifact-write-guard.js';
import { persistRunArtifactMemoryGuidanceStep } from './run-memory-guidance-step.js';

export type BrowserEvidenceArtifactContent = {
  artifacts: BrowserEvidenceArtifact[];
  policy: {
    allowCredentials: false;
    allowedOrigins: string[];
    isolatedProfile: true;
    networkPolicy: 'allowlisted';
  };
  request: {
    action: BrowserEvidenceRequest['action'];
    allowedEvidenceKinds: BrowserEvidenceRequest['allowedEvidenceKinds'];
    purpose: string;
    url: string;
  };
  result: {
    status: BrowserEvidenceResult['status'];
    summary: string;
  };
};

export type PersistBrowserEvidenceResult = {
  artifact: ArtifactRecord;
  steps: {
    artifact: RunStepRecord;
    capture: RunStepRecord;
    memoryGuidance: RunStepRecord | null;
  };
};

export class BrowserEvidencePersister {
  constructor(
    private readonly artifactRepository: Pick<ArtifactRepository, 'createBrowserEvidenceFromRun'>,
    private readonly runStepRepository: Pick<RunStepRepository, 'create'>,
  ) {}

  async persistCaptured(params: {
    request: BrowserEvidenceRequest;
    result: Extract<BrowserEvidenceResult, { status: 'captured' }>;
    runId: string;
    taskId: string;
  }): Promise<PersistBrowserEvidenceResult> {
    const content = JSON.stringify(buildBrowserEvidenceArtifactContent({
      request: params.request,
      result: params.result,
    }), null, 2);
    const captureStep = await this.runStepRepository.create({
      runId: params.runId,
      kind: 'tool_result',
      status: 'completed',
      title: 'browser evidence captured',
      input: params.request.url,
      output: params.result.summary,
    });
    assertRunArtifactWriteAllowed({
      runId: params.runId,
      title: 'record browser evidence artifact',
      input: params.result.artifacts.map((artifactItem) => artifactItem.kind).join(', '),
      output: content,
    });
    const artifact = await this.artifactRepository.createBrowserEvidenceFromRun({
      taskId: params.taskId,
      runId: params.runId,
      title: 'Browser evidence',
      content,
    });
    const artifactStep = await this.runStepRepository.create({
      runId: params.runId,
      kind: 'artifact',
      status: 'completed',
      title: 'record browser evidence artifact',
      input: params.result.artifacts.map((artifactItem) => artifactItem.kind).join(', '),
      output: artifact.id,
    });
    const memoryGuidanceStep = await persistRunArtifactMemoryGuidanceStep(this.runStepRepository, {
      artifactId: artifact.id,
      output: params.result.summary,
      runId: params.runId,
      taskId: params.taskId,
    });

    return {
      artifact,
      steps: {
        artifact: artifactStep,
        capture: captureStep,
        memoryGuidance: memoryGuidanceStep,
      },
    };
  }
}

export function buildBrowserEvidenceArtifactContent(params: {
  request: BrowserEvidenceRequest;
  result: Extract<BrowserEvidenceResult, { status: 'captured' }>;
}): BrowserEvidenceArtifactContent {
  return {
    artifacts: params.result.artifacts,
    policy: {
      allowCredentials: false,
      allowedOrigins: params.request.policy.allowedOrigins,
      isolatedProfile: true,
      networkPolicy: 'allowlisted',
    },
    request: {
      action: params.request.action,
      allowedEvidenceKinds: params.request.allowedEvidenceKinds,
      purpose: params.request.purpose,
      url: params.request.url,
    },
    result: {
      status: params.result.status,
      summary: params.result.summary,
    },
  };
}
