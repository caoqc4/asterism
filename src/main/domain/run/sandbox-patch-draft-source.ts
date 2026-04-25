import path from 'node:path';

import type { AgentSandboxCheckScript } from '../../../shared/agent-sandbox-provider.js';
import type { LocalContainerSandboxPatchDraft } from './local-container-sandbox-backend.js';

export type SandboxPatchDraftSourceKind =
  | 'sandbox_session'
  | 'imported_patch_artifact'
  | 'side_quest_session'
  | 'connector_normalized_patch';

export type SandboxPatchDraftSourcePolicySnapshot = {
  network: 'disabled' | 'allowlisted';
  noCredentialPassthrough: true;
  promotion: 'decision_required';
};

export type SandboxPatchDraftSourceEvidence = {
  commandSummaries: string[];
  modelSummary?: string | null;
  observations: string[];
};

export type SandboxPatchDraftSource = {
  evidence: SandboxPatchDraftSourceEvidence;
  patchDraft: LocalContainerSandboxPatchDraft;
  policySnapshot: SandboxPatchDraftSourcePolicySnapshot;
  requestedScripts: AgentSandboxCheckScript[];
  runId: string;
  sourceId: string;
  sourceKind: SandboxPatchDraftSourceKind;
  taskId: string;
  workspaceRoot: string;
};

export type NormalizedSandboxPatchDraftSource = SandboxPatchDraftSource & {
  evidence: {
    commandSummaries: string[];
    modelSummary: string | null;
    observations: string[];
  };
  patchDraft: LocalContainerSandboxPatchDraft & {
    files: string[];
    riskSummary: string | null;
  };
};

export type SandboxPatchDraftSourceValidation =
  | {
      source: NormalizedSandboxPatchDraftSource;
      summary: string;
      valid: true;
    }
  | {
      blockedReasons: string[];
      summary: string;
      valid: false;
    };

const ACCEPTED_SOURCE_KINDS = new Set<string>([
  'sandbox_session',
  'imported_patch_artifact',
  'side_quest_session',
  'connector_normalized_patch',
]);

const ACCEPTED_SCRIPTS = new Set<string>(['test', 'lint']);

export function validateSandboxPatchDraftSource(
  value: unknown,
): SandboxPatchDraftSourceValidation {
  const blockedReasons: string[] = [];

  if (!isRecord(value)) {
    return invalidSource(['Sandbox patch draft source must be an object.']);
  }

  const sourceKind = readString(value, 'sourceKind');
  const sourceId = readString(value, 'sourceId');
  const runId = readString(value, 'runId');
  const taskId = readString(value, 'taskId');
  const workspaceRoot = readString(value, 'workspaceRoot');

  if (!sourceKind || !ACCEPTED_SOURCE_KINDS.has(sourceKind)) {
    blockedReasons.push('Sandbox patch draft source kind is not accepted.');
  }

  if (!sourceId) {
    blockedReasons.push('Sandbox patch draft source requires a source id.');
  }

  if (!runId) {
    blockedReasons.push('Sandbox patch draft source requires a run id.');
  }

  if (!taskId) {
    blockedReasons.push('Sandbox patch draft source requires a task id.');
  }

  if (!workspaceRoot) {
    blockedReasons.push('Sandbox patch draft source requires a workspace root.');
  }

  const patchDraft = isRecord(value.patchDraft) ? value.patchDraft : null;
  if (!patchDraft) {
    blockedReasons.push('Sandbox patch draft source requires patch draft metadata.');
  }

  const summary = patchDraft ? readString(patchDraft, 'summary') : '';
  const diff = patchDraft ? readString(patchDraft, 'diff') : '';
  const files = patchDraft ? normalizePatchDraftFiles(patchDraft.files) : {
    blockedReasons: ['Sandbox patch draft source requires at least one changed file.'],
    files: [],
  };
  const riskSummary = patchDraft ? readOptionalString(patchDraft, 'riskSummary') : null;

  if (!summary) {
    blockedReasons.push('Sandbox patch draft source requires a patch summary.');
  }

  if (!diff) {
    blockedReasons.push('Sandbox patch draft source requires a diff preview.');
  }

  blockedReasons.push(...files.blockedReasons);

  const requestedScripts = normalizeRequestedScripts(value.requestedScripts);
  blockedReasons.push(...requestedScripts.blockedReasons);

  const policySnapshot = validatePolicySnapshot(value.policySnapshot);
  blockedReasons.push(...policySnapshot.blockedReasons);

  const evidence = normalizeEvidence(value.evidence);
  blockedReasons.push(...evidence.blockedReasons);

  if (blockedReasons.length > 0) {
    return invalidSource(blockedReasons);
  }

  const source: NormalizedSandboxPatchDraftSource = {
    evidence: evidence.evidence,
    patchDraft: {
      diff,
      files: files.files,
      riskSummary,
      summary,
    },
    policySnapshot: policySnapshot.policySnapshot,
    requestedScripts: requestedScripts.scripts,
    runId,
    sourceId,
    sourceKind: sourceKind as SandboxPatchDraftSourceKind,
    taskId,
    workspaceRoot,
  };

  return {
    source,
    summary: [
      'Sandbox patch draft source accepted',
      `source=${source.sourceKind}:${source.sourceId}`,
      `workspace=${source.workspaceRoot}`,
      `files=${source.patchDraft.files.length}`,
      `checks=${source.requestedScripts.join(',')}`,
      `promotion=${source.policySnapshot.promotion}`,
    ].join(' / '),
    valid: true,
  };
}

function invalidSource(blockedReasons: string[]): SandboxPatchDraftSourceValidation {
  return {
    blockedReasons,
    summary: `Sandbox patch draft source blocked: ${blockedReasons.join(' ')}`,
    valid: false,
  };
}

function normalizePatchDraftFiles(value: unknown): {
  blockedReasons: string[];
  files: string[];
} {
  const blockedReasons: string[] = [];

  if (!Array.isArray(value)) {
    return {
      blockedReasons: ['Sandbox patch draft source requires changed files.'],
      files: [],
    };
  }

  const files = value
    .filter((file): file is string => typeof file === 'string')
    .map((file) => file.trim())
    .filter(Boolean);
  const normalized = files.map(normalizePatchFile);
  const invalidFiles = files.filter((file, index) => {
    const normalizedFile = normalized[index] ?? '';
    return !isWorkspaceRelativeFile(file, normalizedFile);
  });
  const uniqueFiles = Array.from(new Set(normalized)).sort();

  if (!uniqueFiles.length) {
    blockedReasons.push('Sandbox patch draft source requires at least one changed file.');
  }

  if (files.length !== value.length) {
    blockedReasons.push('Sandbox patch draft source changed files must be strings.');
  }

  if (invalidFiles.length > 0) {
    blockedReasons.push('Sandbox patch draft source changed files must stay inside the workspace.');
  }

  return {
    blockedReasons,
    files: uniqueFiles,
  };
}

function normalizeRequestedScripts(value: unknown): {
  blockedReasons: string[];
  scripts: AgentSandboxCheckScript[];
} {
  if (!Array.isArray(value)) {
    return {
      blockedReasons: ['Sandbox patch draft source requires requested checks.'],
      scripts: [],
    };
  }

  const scripts = value
    .filter((script): script is string => typeof script === 'string')
    .map((script) => script.trim())
    .filter(Boolean);
  const rejectedScripts = scripts.filter((script) => !ACCEPTED_SCRIPTS.has(script));
  const acceptedScripts = Array.from(new Set(
    scripts.filter((script): script is AgentSandboxCheckScript => ACCEPTED_SCRIPTS.has(script)),
  )).sort();
  const blockedReasons: string[] = [];

  if (scripts.length !== value.length) {
    blockedReasons.push('Sandbox patch draft source requested checks must be strings.');
  }

  if (rejectedScripts.length > 0) {
    blockedReasons.push('Sandbox patch draft source requested checks must be allowlisted.');
  }

  if (!acceptedScripts.length) {
    blockedReasons.push('Sandbox patch draft source requires at least one allowlisted check.');
  }

  return {
    blockedReasons,
    scripts: acceptedScripts,
  };
}

function validatePolicySnapshot(value: unknown): {
  blockedReasons: string[];
  policySnapshot: SandboxPatchDraftSourcePolicySnapshot;
} {
  const blockedReasons: string[] = [];
  const policySnapshot = isRecord(value) ? value : {};
  const network = readString(policySnapshot, 'network');
  const promotion = readString(policySnapshot, 'promotion');

  if (network !== 'disabled' && network !== 'allowlisted') {
    blockedReasons.push('Sandbox patch draft source policy requires bounded network mode.');
  }

  if (policySnapshot.noCredentialPassthrough !== true) {
    blockedReasons.push('Sandbox patch draft source policy forbids credential passthrough.');
  }

  if (promotion !== 'decision_required') {
    blockedReasons.push('Sandbox patch draft source policy requires Decision promotion.');
  }

  return {
    blockedReasons,
    policySnapshot: {
      network: network === 'allowlisted' ? 'allowlisted' : 'disabled',
      noCredentialPassthrough: true,
      promotion: 'decision_required',
    },
  };
}

function normalizeEvidence(value: unknown): {
  blockedReasons: string[];
  evidence: NormalizedSandboxPatchDraftSource['evidence'];
} {
  const evidence = isRecord(value) ? value : {};
  const observations = normalizeStringArray(evidence.observations);
  const commandSummaries = normalizeStringArray(evidence.commandSummaries);
  const modelSummary = readOptionalString(evidence, 'modelSummary');

  return {
    blockedReasons: [],
    evidence: {
      commandSummaries,
      modelSummary,
      observations,
    },
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePatchFile(file: string): string {
  return path.posix.normalize(file.replaceAll('\\', '/'));
}

function isWorkspaceRelativeFile(rawFile: string, normalizedFile: string): boolean {
  return Boolean(normalizedFile)
    && !rawFile.includes('\0')
    && !path.isAbsolute(rawFile)
    && !path.win32.isAbsolute(rawFile)
    && !path.posix.isAbsolute(normalizedFile)
    && normalizedFile !== '.'
    && normalizedFile !== '..'
    && !normalizedFile.startsWith('../')
    && !normalizedFile.includes('/../')
    && !normalizedFile.endsWith('/..');
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
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
