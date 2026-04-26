import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { RunCheckpointRecord } from '../../../shared/types/run.js';
import type { SandboxPatchPromotionRecord } from '../../../shared/types/sandbox-patch-promotion.js';
import { evaluateSandboxPatchPromotionReadiness } from '../../../shared/sandbox-patch-promotion-readiness.js';
import type { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import type { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import type { SandboxPatchPromotionRepository } from '../../db/repositories/sandbox-patch-promotion-repository.js';
import {
  buildSandboxPatchDigest,
  type SandboxPatchReviewArtifactContent,
} from './sandbox-patch-review-persister.js';

export type SandboxPatchPromotionPreflightResult =
  | {
      artifact: ArtifactRecord;
      checkpoint: RunCheckpointRecord;
      promotion: SandboxPatchPromotionRecord;
      status: 'ready';
      summary: string;
    }
  | {
      blockedReasons: string[];
      status: 'blocked';
      summary: string;
    }
  | {
      promotion: SandboxPatchPromotionRecord;
      status: 'already_applied';
      summary: string;
    };

export class SandboxPatchPromotionPreflightService {
  constructor(
    private readonly promotionRepository: Pick<SandboxPatchPromotionRepository, 'findByCheckpointId'>,
    private readonly checkpointRepository: Pick<RunCheckpointRepository, 'findById'>,
    private readonly artifactRepository: Pick<ArtifactRepository, 'findById'>,
  ) {}

  async preflight(checkpointId: string): Promise<SandboxPatchPromotionPreflightResult> {
    const promotion = await this.promotionRepository.findByCheckpointId(checkpointId);

    if (!promotion) {
      return blocked(['No pending sandbox patch promotion record exists for this checkpoint.']);
    }

    if (promotion.status === 'applied') {
      return {
        promotion,
        status: 'already_applied',
        summary: `Sandbox patch promotion preflight: already_applied / checkpoint=${promotion.checkpointId}`,
      };
    }

    if (promotion.status === 'blocked') {
      return blocked(
        promotion.blockedReasons.length
          ? promotion.blockedReasons
          : ['Sandbox patch promotion record is already blocked.'],
      );
    }

    const checkpoint = await this.checkpointRepository.findById(promotion.checkpointId);
    if (!checkpoint) {
      return blocked(['Patch promotion checkpoint was not found.']);
    }

    const artifact = await this.artifactRepository.findById(promotion.artifactId);
    if (!artifact) {
      return blocked(['Patch promotion artifact was not found.']);
    }

    const blockedReasons = [
      ...validateCheckpointReadiness(checkpoint, promotion),
      ...validateArtifact(artifact, promotion),
    ];

    if (blockedReasons.length) {
      return blocked(blockedReasons);
    }

    return {
      artifact,
      checkpoint,
      promotion,
      status: 'ready',
      summary: [
        'Sandbox patch promotion preflight: ready',
        `checkpoint=${promotion.checkpointId}`,
        `source=${promotion.sourceId}`,
        `files=${promotion.expectedFiles.join(', ')}`,
        'no workspace files written',
      ].join(' / '),
    };
  }
}

function validateCheckpointReadiness(
  checkpoint: RunCheckpointRecord,
  promotion: SandboxPatchPromotionRecord,
): string[] {
  const readiness = evaluateSandboxPatchPromotionReadiness(checkpoint);
  const blockedReasons: string[] = [];

  if (readiness.status !== 'ready') {
    blockedReasons.push(
      readiness.blockedReasons.length
        ? readiness.blockedReasons.join(' ')
        : readiness.summary,
    );
  }

  if (readiness.artifactId !== promotion.artifactId) {
    blockedReasons.push('Patch promotion artifact id does not match checkpoint payload.');
  }

  if (readiness.decisionId !== promotion.decisionId) {
    blockedReasons.push('Patch promotion Decision id does not match checkpoint payload.');
  }

  if (readiness.sourceId !== promotion.sourceId) {
    blockedReasons.push('Patch promotion source id does not match checkpoint payload.');
  }

  if (readiness.patchDigest !== promotion.patchDigest) {
    blockedReasons.push('Patch promotion digest does not match checkpoint payload.');
  }

  if (!sameStringList(readiness.expectedFiles, promotion.expectedFiles)) {
    blockedReasons.push('Patch promotion expected files do not match checkpoint payload.');
  }

  return blockedReasons;
}

function validateArtifact(
  artifact: ArtifactRecord,
  promotion: SandboxPatchPromotionRecord,
): string[] {
  const blockedReasons: string[] = [];

  if (artifact.kind !== 'patch') {
    blockedReasons.push('Patch promotion artifact is not a patch artifact.');
  }

  if (artifact.taskId !== promotion.taskId) {
    blockedReasons.push('Patch promotion artifact task does not match promotion record.');
  }

  if (artifact.sourceId !== promotion.runId) {
    blockedReasons.push('Patch promotion artifact run does not match promotion record.');
  }

  const content = parseArtifactContent(artifact.content);
  if (!content) {
    blockedReasons.push('Patch promotion artifact content is not valid sandbox patch review JSON.');
    return blockedReasons;
  }

  if (!sameStringList(content.artifact.files, promotion.expectedFiles)) {
    blockedReasons.push('Patch promotion artifact files do not match promotion record.');
  }

  const artifactDigest = buildSandboxPatchDigest(content.artifact.diff);
  if (artifactDigest !== promotion.patchDigest) {
    blockedReasons.push('Patch promotion artifact digest does not match promotion record.');
  }

  if (content.review.sandboxSessionId !== promotion.sourceId) {
    blockedReasons.push('Patch promotion artifact source does not match promotion record.');
  }

  return blockedReasons;
}

function parseArtifactContent(value: string): SandboxPatchReviewArtifactContent | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.artifact) || !isRecord(parsed.review)) {
      return null;
    }

    if (
      typeof parsed.artifact.diff !== 'string'
      || !Array.isArray(parsed.artifact.files)
      || typeof parsed.review.sandboxSessionId !== 'string'
    ) {
      return null;
    }

    const files = parsed.artifact.files;
    if (!files.every((file) => typeof file === 'string' && file.trim())) {
      return null;
    }

    return parsed as SandboxPatchReviewArtifactContent;
  } catch {
    return null;
  }
}

function blocked(blockedReasons: string[]): SandboxPatchPromotionPreflightResult {
  return {
    blockedReasons,
    status: 'blocked',
    summary: `Sandbox patch promotion preflight blocked: ${blockedReasons.join(' ')}`,
  };
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
