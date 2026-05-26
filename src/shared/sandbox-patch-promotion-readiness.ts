import type { RunCheckpointRecord } from './types/run.js';
import { parseRunCheckpointPayload } from './types/run-checkpoint-payload.js';

export type SandboxPatchPromotionReadinessStatus =
  | 'already_resolved'
  | 'blocked'
  | 'missing_apply_metadata'
  | 'ready';

export type SandboxPatchPromotionReadiness = {
  artifactId: string | null;
  blockedReasons: string[];
  checkpointId: string;
  decisionId: string | null;
  expectedFiles: string[];
  missingRequirements: SandboxPatchPromotionReadinessRequirement[];
  patchDigest: string | null;
  satisfiedRequirements: SandboxPatchPromotionReadinessRequirement[];
  sourceId: string | null;
  status: SandboxPatchPromotionReadinessStatus;
  summary: string;
};

export type SandboxPatchPromotionReadinessRequirement =
  | 'checkpoint_open'
  | 'patch_promotion_checkpoint'
  | 'payload_valid'
  | 'payload_kind'
  | 'descriptor'
  | 'policy_snapshot'
  | 'artifact_id'
  | 'source_id'
  | 'decision_id'
  | 'expected_files'
  | 'patch_digest'
  | 'safe_expected_files';

const SANDBOX_PATCH_PROMOTION_READINESS_REQUIREMENTS: SandboxPatchPromotionReadinessRequirement[] = [
  'checkpoint_open',
  'patch_promotion_checkpoint',
  'payload_valid',
  'payload_kind',
  'descriptor',
  'policy_snapshot',
  'artifact_id',
  'source_id',
  'decision_id',
  'expected_files',
  'patch_digest',
  'safe_expected_files',
];

export function evaluateSandboxPatchPromotionReadiness(
  checkpoint: RunCheckpointRecord,
): SandboxPatchPromotionReadiness {
  if (checkpoint.status !== 'open') {
    return buildReadiness({
      checkpoint,
      status: 'already_resolved',
      blockedReasons: ['Patch promotion checkpoint is not open.'],
      missingRequirements: ['checkpoint_open'],
    });
  }

  if (checkpoint.kind !== 'patch_promotion') {
    return buildReadiness({
      checkpoint,
      status: 'blocked',
      blockedReasons: ['Checkpoint is not a patch-promotion checkpoint.'],
      missingRequirements: ['patch_promotion_checkpoint'],
    });
  }

  const payload = parseRunCheckpointPayload(checkpoint.payload);

  if (!payload) {
    return buildReadiness({
      checkpoint,
      status: 'blocked',
      blockedReasons: ['Patch promotion checkpoint payload is missing or invalid.'],
      missingRequirements: ['payload_valid'],
    });
  }

  const artifactId = readString(payload.artifactId);
  const decisionId = readString(payload.decisionId);
  const descriptorId = readString(payload.descriptorId);
  const sourceId = readString(payload.sourceId) ?? readString(payload.sessionId);
  const policySnapshot = isRecord(payload.policySnapshot) ? payload.policySnapshot : null;
  const policyDescriptorId = policySnapshot ? readString(policySnapshot.descriptorId) : null;
  const expectedFiles = readStringArray(payload.expectedFiles);
  const patchDigest = readString(payload.patchDigest);
  const blockedReasons: string[] = [];
  const missingApplyMetadata: string[] = [];
  const missingRequirements: SandboxPatchPromotionReadinessRequirement[] = [];

  if (payload.kind !== 'patch_promotion') {
    missingRequirements.push('payload_kind');
    blockedReasons.push('Patch promotion payload kind is not patch_promotion.');
  }

  if (descriptorId !== 'workspace.staged_patch') {
    missingRequirements.push('descriptor');
    blockedReasons.push('Patch promotion descriptor must be workspace.staged_patch.');
  }

  if (policyDescriptorId !== 'workspace.staged_patch') {
    missingRequirements.push('policy_snapshot');
    blockedReasons.push('Patch promotion policy snapshot must target workspace.staged_patch.');
  }

  if (!artifactId) {
    missingRequirements.push('artifact_id');
    missingApplyMetadata.push('artifactId');
  }

  if (!sourceId) {
    missingRequirements.push('source_id');
    missingApplyMetadata.push('sourceId/sessionId');
  }

  if (!decisionId) {
    missingRequirements.push('decision_id');
    missingApplyMetadata.push('decisionId');
  }

  if (!expectedFiles.length) {
    missingRequirements.push('expected_files');
    missingApplyMetadata.push('expectedFiles');
  }

  if (!patchDigest) {
    missingRequirements.push('patch_digest');
    missingApplyMetadata.push('patchDigest');
  }

  const unsafeExpectedFiles = expectedFiles.filter((file) => !isSafeWorkspaceRelativePath(file));
  if (unsafeExpectedFiles.length) {
    missingRequirements.push('safe_expected_files');
    blockedReasons.push(`Patch promotion expected files are unsafe: ${unsafeExpectedFiles.join(', ')}`);
  }

  if (blockedReasons.length) {
    return buildReadiness({
      artifactId,
      blockedReasons,
      checkpoint,
      decisionId,
      expectedFiles,
      missingRequirements,
      patchDigest,
      sourceId,
      status: 'blocked',
    });
  }

  if (missingApplyMetadata.length) {
    return buildReadiness({
      artifactId,
      blockedReasons: missingApplyMetadata.map((field) => `Patch promotion apply metadata is missing: ${field}.`),
      checkpoint,
      decisionId,
      expectedFiles,
      missingRequirements,
      patchDigest,
      sourceId,
      status: 'missing_apply_metadata',
    });
  }

  return buildReadiness({
    artifactId,
    blockedReasons: [],
    checkpoint,
    decisionId,
    expectedFiles,
    missingRequirements: [],
    patchDigest,
    sourceId,
    status: 'ready',
  });
}

function buildReadiness(params: {
  artifactId?: string | null;
  blockedReasons: string[];
  checkpoint: RunCheckpointRecord;
  decisionId?: string | null;
  expectedFiles?: string[];
  missingRequirements: SandboxPatchPromotionReadinessRequirement[];
  patchDigest?: string | null;
  sourceId?: string | null;
  status: SandboxPatchPromotionReadinessStatus;
}): SandboxPatchPromotionReadiness {
  const expectedFiles = params.expectedFiles ?? [];
  const missingRequirementSet = new Set(params.missingRequirements);
  const satisfiedRequirements = SANDBOX_PATCH_PROMOTION_READINESS_REQUIREMENTS.filter((requirement) =>
    !missingRequirementSet.has(requirement));
  return {
    artifactId: params.artifactId ?? null,
    blockedReasons: params.blockedReasons,
    checkpointId: params.checkpoint.id,
    decisionId: params.decisionId ?? null,
    expectedFiles,
    missingRequirements: params.missingRequirements,
    patchDigest: params.patchDigest ?? null,
    satisfiedRequirements,
    sourceId: params.sourceId ?? null,
    status: params.status,
    summary: formatSandboxPatchPromotionReadinessSummary({
      blockedReasons: params.blockedReasons,
      expectedFiles,
      satisfiedRequirementCount: satisfiedRequirements.length,
      status: params.status,
    }),
  };
}

function formatSandboxPatchPromotionReadinessSummary(params: {
  blockedReasons: string[];
  expectedFiles: string[];
  satisfiedRequirementCount: number;
  status: SandboxPatchPromotionReadinessStatus;
}): string {
  const requirements = `requirements=${params.satisfiedRequirementCount}/${SANDBOX_PATCH_PROMOTION_READINESS_REQUIREMENTS.length}`;
  if (params.status === 'ready') {
    return [
      'Sandbox patch promotion readiness: ready',
      requirements,
      `files=${params.expectedFiles.join(', ')}`,
      'workspace apply still requires the promotion service',
    ].join(' / ');
  }

  if (params.status === 'already_resolved') {
    return `Sandbox patch promotion readiness: already_resolved / ${requirements} / checkpoint is no longer open`;
  }

  return [
    `Sandbox patch promotion readiness: ${params.status}`,
    requirements,
    params.blockedReasons.join(' '),
  ].filter(Boolean).join(' / ');
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    && segment !== 'node_modules'
    && !segment.startsWith('.env'),
  );
}
