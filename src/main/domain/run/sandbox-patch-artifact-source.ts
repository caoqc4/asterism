import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { AgentSandboxCheckScript } from '../../../shared/agent-sandbox-provider.js';
import {
  type SandboxPatchDraftSource,
  type SandboxPatchDraftSourceValidation,
  validateSandboxPatchDraftSource,
} from './sandbox-patch-draft-source.js';

export function buildSandboxPatchDraftSourceFromPatchArtifact(params: {
  artifact: ArtifactRecord;
  requestedScripts?: AgentSandboxCheckScript[];
  reviewRunId?: string | null;
  workspaceRoot: string | null | undefined;
}): SandboxPatchDraftSourceValidation {
  const blockedReasons: string[] = [];
  const workspaceRoot = params.workspaceRoot?.trim() ?? '';
  const requestedScripts: AgentSandboxCheckScript[] = params.requestedScripts?.length
    ? params.requestedScripts
    : ['test', 'lint'];
  const patch = extractPatchArtifactDraft(params.artifact);

  if (params.artifact.kind !== 'patch') {
    blockedReasons.push('Imported patch artifact source requires a patch artifact.');
  }

  if (params.artifact.sourceType !== 'run') {
    blockedReasons.push('Imported patch artifact source requires a run-backed artifact.');
  }

  if (!workspaceRoot) {
    blockedReasons.push('Imported patch artifact source requires a selected workspace root.');
  }

  if (!patch.diff.trim()) {
    blockedReasons.push('Imported patch artifact source requires reviewable diff content.');
  }

  if (!patch.files.length) {
    blockedReasons.push('Imported patch artifact source requires changed files.');
  }

  if (blockedReasons.length > 0) {
    return {
      blockedReasons,
      summary: `Imported patch artifact source blocked: ${blockedReasons.join(' ')}`,
      valid: false,
    };
  }

  const source: SandboxPatchDraftSource = {
    evidence: {
      commandSummaries: [],
      modelSummary: `Patch artifact ${params.artifact.id} was confirmed from run ${params.artifact.sourceId}.`,
      observations: [
        'Imported confirmed patch artifact as sandbox patch review input.',
        'Workspace application still requires sandbox review and a promotion Decision.',
      ],
    },
    patchDraft: {
      diff: patch.diff,
      files: patch.files,
      riskSummary: patch.riskSummary,
      summary: patch.summary || params.artifact.title,
    },
    policySnapshot: {
      network: 'disabled',
      noCredentialPassthrough: true,
      promotion: 'decision_required',
    },
    requestedScripts,
    runId: params.reviewRunId?.trim() || params.artifact.sourceId,
    sourceId: params.artifact.id,
    sourceKind: 'imported_patch_artifact',
    taskId: params.artifact.taskId,
    workspaceRoot,
  };

  const validation = validateSandboxPatchDraftSource(source);
  if (!validation.valid) return validation;

  return {
    ...validation,
    summary: `${validation.summary} / importedArtifact=${params.artifact.id}`,
  };
}

function extractPatchArtifactDraft(artifact: ArtifactRecord): {
  diff: string;
  files: string[];
  riskSummary: string | null;
  summary: string;
} {
  const parsed = parsePatchArtifactJson(artifact.content);
  if (parsed) {
    return {
      diff: parsed.diff,
      files: parsed.files.length ? parsed.files : extractChangedFilesFromDiff(parsed.diff),
      riskSummary: parsed.riskSummary,
      summary: parsed.summary || artifact.title,
    };
  }

  return {
    diff: artifact.content.trim(),
    files: extractChangedFilesFromDiff(artifact.content),
    riskSummary: null,
    summary: artifact.title.trim(),
  };
}

function parsePatchArtifactJson(value: string): {
  diff: string;
  files: string[];
  riskSummary: string | null;
  summary: string;
} | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return null;
    const artifact = isRecord(parsed.artifact) ? parsed.artifact : parsed;
    const diff = readString(artifact, 'diff');
    if (!diff) return null;

    return {
      diff,
      files: normalizeFiles(artifact.files),
      riskSummary: readOptionalString(artifact, 'riskSummary'),
      summary: readString(artifact, 'summary'),
    };
  } catch {
    return null;
  }
}

function extractChangedFilesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  const lines = diff.replace(/\r\n/g, '\n').split('\n');

  for (const line of lines) {
    const gitMatch = line.match(/^diff --git\s+a\/(.+?)\s+b\/(.+)$/);
    if (gitMatch?.[2]) {
      addFile(files, gitMatch[2]);
      continue;
    }

    const newHeader = line.match(/^\+\+\+\s+(.+)$/);
    if (newHeader?.[1] && newHeader[1] !== '/dev/null') {
      addFile(files, newHeader[1]);
    }
  }

  return [...files].sort();
}

function normalizeFiles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const files = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string') addFile(files, item);
  }
  return [...files].sort();
}

function addFile(files: Set<string>, value: string): void {
  const normalized = value
    .trim()
    .replace(/^a\//, '')
    .replace(/^b\//, '');
  if (normalized) files.add(normalized);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value.trim() || null : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
