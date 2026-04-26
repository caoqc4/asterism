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
  patchDigest: string | null;
  sourceId: string | null;
  status: SandboxPatchPromotionReadinessStatus;
  summary: string;
};

export function evaluateSandboxPatchPromotionReadiness(
  checkpoint: RunCheckpointRecord,
): SandboxPatchPromotionReadiness {
  if (checkpoint.status !== 'open') {
    return buildReadiness({
      checkpoint,
      status: 'already_resolved',
      blockedReasons: ['Patch promotion checkpoint is not open.'],
    });
  }

  if (checkpoint.kind !== 'patch_promotion') {
    return buildReadiness({
      checkpoint,
      status: 'blocked',
      blockedReasons: ['Checkpoint is not a patch-promotion checkpoint.'],
    });
  }

  const payload = parseRunCheckpointPayload(checkpoint.payload);

  if (!payload) {
    return buildReadiness({
      checkpoint,
      status: 'blocked',
      blockedReasons: ['Patch promotion checkpoint payload is missing or invalid.'],
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

  if (payload.kind !== 'patch_promotion') {
    blockedReasons.push('Patch promotion payload kind is not patch_promotion.');
  }

  if (descriptorId !== 'workspace.staged_patch') {
    blockedReasons.push('Patch promotion descriptor must be workspace.staged_patch.');
  }

  if (policyDescriptorId !== 'workspace.staged_patch') {
    blockedReasons.push('Patch promotion policy snapshot must target workspace.staged_patch.');
  }

  if (!artifactId) {
    missingApplyMetadata.push('artifactId');
  }

  if (!sourceId) {
    missingApplyMetadata.push('sourceId/sessionId');
  }

  if (!decisionId) {
    missingApplyMetadata.push('decisionId');
  }

  if (!expectedFiles.length) {
    missingApplyMetadata.push('expectedFiles');
  }

  if (!patchDigest) {
    missingApplyMetadata.push('patchDigest');
  }

  const unsafeExpectedFiles = expectedFiles.filter((file) => !isSafeWorkspaceRelativePath(file));
  if (unsafeExpectedFiles.length) {
    blockedReasons.push(`Patch promotion expected files are unsafe: ${unsafeExpectedFiles.join(', ')}`);
  }

  if (blockedReasons.length) {
    return buildReadiness({
      artifactId,
      blockedReasons,
      checkpoint,
      decisionId,
      expectedFiles,
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
  patchDigest?: string | null;
  sourceId?: string | null;
  status: SandboxPatchPromotionReadinessStatus;
}): SandboxPatchPromotionReadiness {
  const expectedFiles = params.expectedFiles ?? [];
  return {
    artifactId: params.artifactId ?? null,
    blockedReasons: params.blockedReasons,
    checkpointId: params.checkpoint.id,
    decisionId: params.decisionId ?? null,
    expectedFiles,
    patchDigest: params.patchDigest ?? null,
    sourceId: params.sourceId ?? null,
    status: params.status,
    summary: formatSandboxPatchPromotionReadinessSummary({
      blockedReasons: params.blockedReasons,
      expectedFiles,
      status: params.status,
    }),
  };
}

function formatSandboxPatchPromotionReadinessSummary(params: {
  blockedReasons: string[];
  expectedFiles: string[];
  status: SandboxPatchPromotionReadinessStatus;
}): string {
  if (params.status === 'ready') {
    return [
      'Sandbox patch promotion readiness: ready',
      `files=${params.expectedFiles.join(', ')}`,
      'workspace apply still requires the promotion service',
    ].join(' / ');
  }

  if (params.status === 'already_resolved') {
    return 'Sandbox patch promotion readiness: already_resolved / checkpoint is no longer open';
  }

  return [
    `Sandbox patch promotion readiness: ${params.status}`,
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
