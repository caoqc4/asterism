import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { RunCheckpointRecord } from '../../../shared/types/run.js';
import type { SandboxPatchPromotionRecord } from '../../../shared/types/sandbox-patch-promotion.js';
import { evaluateSandboxPatchPromotionReadiness } from '../../../shared/sandbox-patch-promotion-readiness.js';
import { parseRunCheckpointPayload } from '../../../shared/types/run-checkpoint-payload.js';
import type { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import type { DecisionRepository } from '../../db/repositories/decision-repository.js';
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
      promotion?: SandboxPatchPromotionRecord;
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
    private readonly decisionRepository: Pick<DecisionRepository, 'get'> | null = null,
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
        promotion,
      );
    }

    const checkpoint = await this.checkpointRepository.findById(promotion.checkpointId);
    if (!checkpoint) {
      return blocked(['Patch promotion checkpoint was not found.'], promotion);
    }

    const artifact = await this.artifactRepository.findById(promotion.artifactId);
    if (!artifact) {
      return blocked(['Patch promotion artifact was not found.'], promotion);
    }

    const allowSettledApprovedApply = await this.canApplySettledApprovedPromotion(checkpoint, promotion);
    const blockedReasons = [
      ...validateCheckpointReadiness(checkpoint, promotion, { allowSettledApprovedApply }),
      ...validateArtifact(artifact, promotion),
    ];

    if (blockedReasons.length) {
      return blocked(blockedReasons, promotion);
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

  private async canApplySettledApprovedPromotion(
    checkpoint: RunCheckpointRecord,
    promotion: SandboxPatchPromotionRecord,
  ): Promise<boolean> {
    if (checkpoint.status !== 'resolved' || promotion.status !== 'pending' || !this.decisionRepository) {
      return false;
    }

    const decision = await this.decisionRepository.get(promotion.decisionId).catch(() => null);
    return decision?.status === 'approved';
  }
}

function validateCheckpointReadiness(
  checkpoint: RunCheckpointRecord,
  promotion: SandboxPatchPromotionRecord,
  options: { allowSettledApprovedApply?: boolean } = {},
): string[] {
  const readiness = evaluateSandboxPatchPromotionReadiness(checkpoint);
  const blockedReasons: string[] = [];

  if (readiness.status !== 'ready') {
    if (readiness.status === 'already_resolved' && options.allowSettledApprovedApply) {
      return validateSettledCheckpointPayload(checkpoint, promotion);
    }
    return [
      readiness.blockedReasons.length
        ? readiness.blockedReasons.join(' ')
        : readiness.summary,
    ];
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

function validateSettledCheckpointPayload(
  checkpoint: RunCheckpointRecord,
  promotion: SandboxPatchPromotionRecord,
): string[] {
  const payload = parseRunCheckpointPayload(checkpoint.payload);
  const blockedReasons: string[] = [];

  if (checkpoint.kind !== 'patch_promotion') {
    blockedReasons.push('Checkpoint is not a patch-promotion checkpoint.');
  }

  if (!payload) {
    blockedReasons.push('Patch promotion checkpoint payload is missing or invalid.');
    return blockedReasons;
  }

  if (payload.kind !== 'patch_promotion') {
    blockedReasons.push('Patch promotion payload kind is not patch_promotion.');
  }

  const descriptorId = readString(payload.descriptorId);
  if (descriptorId !== 'workspace.staged_patch') {
    blockedReasons.push('Patch promotion descriptor must be workspace.staged_patch.');
  }

  const policySnapshot = isRecord(payload.policySnapshot) ? payload.policySnapshot : null;
  const policyDescriptorId = policySnapshot ? readString(policySnapshot.descriptorId) : null;
  if (policyDescriptorId !== 'workspace.staged_patch') {
    blockedReasons.push('Patch promotion policy snapshot must target workspace.staged_patch.');
  }

  if (readString(payload.artifactId) !== promotion.artifactId) {
    blockedReasons.push('Patch promotion artifact id does not match checkpoint payload.');
  }
  if (readString(payload.decisionId) !== promotion.decisionId) {
    blockedReasons.push('Patch promotion Decision id does not match checkpoint payload.');
  }
  const sourceId = readString(payload.sourceId) ?? readString(payload.sessionId);
  if (sourceId !== promotion.sourceId) {
    blockedReasons.push('Patch promotion source id does not match checkpoint payload.');
  }
  if (readString(payload.patchDigest) !== promotion.patchDigest) {
    blockedReasons.push('Patch promotion digest does not match checkpoint payload.');
  }
  const expectedFiles = readStringArray(payload.expectedFiles);
  if (!sameStringList(expectedFiles, promotion.expectedFiles)) {
    blockedReasons.push('Patch promotion expected files do not match checkpoint payload.');
  }
  const unsafeExpectedFiles = expectedFiles.filter((file) => !isSafeWorkspaceRelativePath(file));
  if (unsafeExpectedFiles.length) {
    blockedReasons.push(`Patch promotion expected files are unsafe: ${unsafeExpectedFiles.join(', ')}`);
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

function blocked(
  blockedReasons: string[],
  promotion?: SandboxPatchPromotionRecord,
): SandboxPatchPromotionPreflightResult {
  return {
    blockedReasons,
    promotion,
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item))));
}

function isSafeWorkspaceRelativePath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/').trim();
  if (!normalized
    || normalized.startsWith('/')
    || normalized.startsWith('../')
    || normalized.includes('/../')
    || normalized === '.'
    || normalized === '..') {
    return false;
  }

  const segments = normalized.split('/');
  return segments.every((segment) =>
    Boolean(segment)
    && segment !== '.git'
    && segment !== '.taskplane'
    && segment !== '.'
    && segment !== '..'
  );
}
