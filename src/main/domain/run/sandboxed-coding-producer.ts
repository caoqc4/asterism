import type { AgentSandboxCheckScript } from '../../../shared/agent-sandbox-provider.js';
import type { FeatureFlags } from '../../../shared/types/settings.js';
import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import type { LocalContainerSandboxPatchDraft } from './local-container-sandbox-backend.js';
import {
  type SandboxPatchDraftSource,
  type SandboxPatchDraftSourceEvidence,
  validateSandboxPatchDraftSource,
} from './sandbox-patch-draft-source.js';
import {
  SandboxPatchReviewPlanningService,
} from './sandbox-patch-review-planning-service.js';
import type { SandboxPatchReviewRunPlan } from './sandbox-patch-review-run-plan.js';

export type SandboxedCodingProducerRequest = {
  commandPolicy: {
    allowedScripts: AgentSandboxCheckScript[];
    outputLimitBytes: number;
    timeoutMs: number;
  };
  executionPolicy: {
    network: 'disabled' | 'allowlisted';
    noCredentialPassthrough: true;
    promotion: 'decision_required';
  };
  intent: {
    completionCriteria: string[];
    instructions: string;
    taskTitle: string;
  };
  modelPolicy: {
    providerKind: string;
    toolExposure: 'sandboxed_coding_producer';
  };
  runId: string;
  sourceId: string;
  taskId: string;
  workspaceRoot: string;
};

export type NormalizedSandboxedCodingProducerRequest = SandboxedCodingProducerRequest & {
  commandPolicy: {
    allowedScripts: AgentSandboxCheckScript[];
    outputLimitBytes: number;
    timeoutMs: number;
  };
  intent: {
    completionCriteria: string[];
    instructions: string;
    taskTitle: string;
  };
};

export type SandboxedCodingProducerResult =
  | {
      sessionSummary: string;
      source: SandboxPatchDraftSource;
      status: 'source_ready';
    }
  | {
      reason: string;
      sessionSummary: string;
      status: 'blocked' | 'failed' | 'paused';
    };

export type SandboxedCodingProducerRunStepDraft = {
  error?: string | null;
  input?: string | null;
  kind: RunStepKind;
  output?: string | null;
  runId: string;
  status?: RunStepStatus;
  title: string;
};

export type SandboxedCodingProducerEvent =
  | {
      runId: string;
      sessionId: string;
      sourceId: string;
      status: 'started';
      summary: string;
      type: 'sandbox_producer.started';
    }
  | {
      runId: string;
      sessionId: string;
      sourceId: string;
      tool: 'workspace.read_file' | 'workspace.search_text' | 'staging.write_file' | 'staging.diff' | 'checks.run';
      inputSummary: string;
      type: 'sandbox_producer.tool_requested';
    }
  | {
      reason: string;
      runId: string;
      sessionId: string;
      sourceId: string;
      tool: string;
      type: 'sandbox_producer.tool_blocked';
    }
  | {
      outputSummary: string;
      runId: string;
      sessionId: string;
      sourceId: string;
      tool: string;
      type: 'sandbox_producer.tool_completed';
    }
  | {
      outputSummary: string;
      runId: string;
      script: AgentSandboxCheckScript;
      sessionId: string;
      sourceId: string;
      status: 'passed' | 'failed' | 'skipped';
      type: 'sandbox_producer.check_completed';
    }
  | {
      files: string[];
      runId: string;
      sessionId: string;
      sourceId: string;
      summary: string;
      type: 'sandbox_producer.source_ready';
    }
  | {
      reason: string;
      runId: string;
      sessionId: string;
      sourceId: string;
      type: 'sandbox_producer.blocked' | 'sandbox_producer.failed' | 'sandbox_producer.paused';
    };

export type SandboxedCodingProducerRequestValidation =
  | {
      request: NormalizedSandboxedCodingProducerRequest;
      summary: string;
      valid: true;
    }
  | {
      blockedReasons: string[];
      summary: string;
      valid: false;
    };

export type BuildSandboxedCodingProducerSourceResult =
  | {
      source: SandboxPatchDraftSource;
      summary: string;
      valid: true;
    }
  | {
      blockedReasons: string[];
      summary: string;
      valid: false;
    };

const ACCEPTED_SCRIPTS = new Set<string>(['test', 'lint']);
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 600_000;
const MIN_OUTPUT_LIMIT_BYTES = 1_000;
const MAX_OUTPUT_LIMIT_BYTES = 1_000_000;

export function validateSandboxedCodingProducerRequest(
  value: unknown,
): SandboxedCodingProducerRequestValidation {
  const blockedReasons: string[] = [];

  if (!isRecord(value)) {
    return invalidRequest(['Sandboxed coding producer request must be an object.']);
  }

  const runId = readString(value, 'runId');
  const taskId = readString(value, 'taskId');
  const sourceId = readString(value, 'sourceId');
  const workspaceRoot = readString(value, 'workspaceRoot');

  if (!runId) {
    blockedReasons.push('Sandboxed coding producer requires a run id.');
  }

  if (!taskId) {
    blockedReasons.push('Sandboxed coding producer requires a task id.');
  }

  if (!sourceId) {
    blockedReasons.push('Sandboxed coding producer requires a source id.');
  }

  if (!workspaceRoot) {
    blockedReasons.push('Sandboxed coding producer requires a workspace root.');
  }

  const intent = normalizeIntent(value.intent);
  blockedReasons.push(...intent.blockedReasons);

  const modelPolicy = normalizeModelPolicy(value.modelPolicy);
  blockedReasons.push(...modelPolicy.blockedReasons);

  const commandPolicy = normalizeCommandPolicy(value.commandPolicy);
  blockedReasons.push(...commandPolicy.blockedReasons);

  const executionPolicy = normalizeExecutionPolicy(value.executionPolicy);
  blockedReasons.push(...executionPolicy.blockedReasons);

  if (blockedReasons.length > 0) {
    return invalidRequest(blockedReasons);
  }

  const request: NormalizedSandboxedCodingProducerRequest = {
    commandPolicy: commandPolicy.commandPolicy,
    executionPolicy: executionPolicy.executionPolicy,
    intent: intent.intent,
    modelPolicy: modelPolicy.modelPolicy,
    runId,
    sourceId,
    taskId,
    workspaceRoot,
  };

  return {
    request,
    summary: [
      'Sandboxed coding producer request accepted',
      `source=sandbox_session:${request.sourceId}`,
      `workspace=${request.workspaceRoot}`,
      `checks=${request.commandPolicy.allowedScripts.join(',')}`,
      `network=${request.executionPolicy.network}`,
      `promotion=${request.executionPolicy.promotion}`,
    ].join(' / '),
    valid: true,
  };
}

export function buildSandboxedCodingProducerSource(params: {
  evidence?: Partial<SandboxPatchDraftSourceEvidence>;
  patchDraft: LocalContainerSandboxPatchDraft;
  request: unknown;
}): BuildSandboxedCodingProducerSourceResult {
  const requestValidation = validateSandboxedCodingProducerRequest(params.request);
  if (!requestValidation.valid) {
    return {
      blockedReasons: requestValidation.blockedReasons,
      summary: requestValidation.summary,
      valid: false,
    };
  }

  const request = requestValidation.request;
  const source: SandboxPatchDraftSource = {
    evidence: {
      commandSummaries: normalizeStringArray(params.evidence?.commandSummaries),
      modelSummary: params.evidence?.modelSummary?.trim() || null,
      observations: normalizeStringArray(params.evidence?.observations),
    },
    patchDraft: params.patchDraft,
    policySnapshot: {
      network: request.executionPolicy.network,
      noCredentialPassthrough: true,
      promotion: 'decision_required',
    },
    requestedScripts: request.commandPolicy.allowedScripts,
    runId: request.runId,
    sourceId: request.sourceId,
    sourceKind: 'sandbox_session',
    taskId: request.taskId,
    workspaceRoot: request.workspaceRoot,
  };
  const sourceValidation = validateSandboxPatchDraftSource(source);

  if (!sourceValidation.valid) {
    return {
      blockedReasons: sourceValidation.blockedReasons,
      summary: sourceValidation.summary,
      valid: false,
    };
  }

  return {
    source: sourceValidation.source,
    summary: [
      'Sandboxed coding producer source ready',
      requestValidation.summary,
      sourceValidation.summary,
    ].join(' / '),
    valid: true,
  };
}

export function previewSandboxedCodingProducerPatchReview(params: {
  decisionTitle?: string | null;
  evidence?: Partial<SandboxPatchDraftSourceEvidence>;
  featureFlags: FeatureFlags;
  patchDraft: LocalContainerSandboxPatchDraft;
  planningService?: Pick<SandboxPatchReviewPlanningService, 'previewFromSource'>;
  request: unknown;
}): SandboxPatchReviewRunPlan {
  const sourceResult = buildSandboxedCodingProducerSource({
    evidence: params.evidence,
    patchDraft: params.patchDraft,
    request: params.request,
  });

  if (!sourceResult.valid) {
    return {
      reason: sourceResult.blockedReasons.join(' '),
      status: 'blocked',
      summary: sourceResult.summary,
    };
  }

  const planningService = params.planningService ?? new SandboxPatchReviewPlanningService();
  return planningService.previewFromSource({
    decisionTitle: params.decisionTitle,
    expectedWorkspaceRoot: sourceResult.source.workspaceRoot,
    featureFlags: params.featureFlags,
    source: sourceResult.source,
  });
}

export function mapSandboxedCodingProducerEventToRunStep(
  event: SandboxedCodingProducerEvent,
): SandboxedCodingProducerRunStepDraft {
  switch (event.type) {
    case 'sandbox_producer.started':
      return {
        input: `session=${event.sessionId}\nsource=${event.sourceId}`,
        kind: 'plan',
        output: event.summary,
        runId: event.runId,
        status: 'running',
        title: 'Sandboxed coding producer started',
      };
    case 'sandbox_producer.tool_requested':
      return {
        input: [
          `session=${event.sessionId}`,
          `source=${event.sourceId}`,
          event.inputSummary,
        ].join('\n'),
        kind: 'tool_call',
        runId: event.runId,
        status: 'running',
        title: `Sandbox producer tool requested: ${event.tool}`,
      };
    case 'sandbox_producer.tool_blocked':
      return {
        error: event.reason,
        input: `session=${event.sessionId}\nsource=${event.sourceId}`,
        kind: 'tool_result',
        output: event.reason,
        runId: event.runId,
        status: 'failed',
        title: `Sandbox producer tool blocked: ${event.tool}`,
      };
    case 'sandbox_producer.tool_completed':
      return {
        input: `session=${event.sessionId}\nsource=${event.sourceId}`,
        kind: 'tool_result',
        output: event.outputSummary,
        runId: event.runId,
        status: 'completed',
        title: `Sandbox producer tool completed: ${event.tool}`,
      };
    case 'sandbox_producer.check_completed':
      return {
        input: `session=${event.sessionId}\nsource=${event.sourceId}\nscript=${event.script}`,
        kind: 'tool_result',
        output: event.outputSummary,
        runId: event.runId,
        status: event.status === 'failed' ? 'failed' : 'completed',
        title: `Sandbox producer check ${event.status}: ${event.script}`,
      };
    case 'sandbox_producer.source_ready':
      return {
        input: [
          `session=${event.sessionId}`,
          `source=${event.sourceId}`,
          `files=${event.files.join(',')}`,
        ].join('\n'),
        kind: 'artifact',
        output: event.summary,
        runId: event.runId,
        status: 'completed',
        title: 'Sandbox producer source ready',
      };
    case 'sandbox_producer.blocked':
      return terminalProducerStep(event, 'completed', 'Sandbox producer blocked');
    case 'sandbox_producer.failed':
      return terminalProducerStep(event, 'failed', 'Sandbox producer failed');
    case 'sandbox_producer.paused':
      return terminalProducerStep(event, 'pending', 'Sandbox producer paused');
  }
}

function invalidRequest(blockedReasons: string[]): SandboxedCodingProducerRequestValidation {
  return {
    blockedReasons,
    summary: `Sandboxed coding producer request blocked: ${blockedReasons.join(' ')}`,
    valid: false,
  };
}

function terminalProducerStep(
  event: Extract<SandboxedCodingProducerEvent, {
    type: 'sandbox_producer.blocked' | 'sandbox_producer.failed' | 'sandbox_producer.paused';
  }>,
  status: RunStepStatus,
  title: string,
): SandboxedCodingProducerRunStepDraft {
  return {
    error: event.type === 'sandbox_producer.failed' ? event.reason : null,
    input: `session=${event.sessionId}\nsource=${event.sourceId}`,
    kind: event.type === 'sandbox_producer.paused' ? 'checkpoint' : 'final',
    output: event.reason,
    runId: event.runId,
    status,
    title,
  };
}

function normalizeIntent(value: unknown): {
  blockedReasons: string[];
  intent: NormalizedSandboxedCodingProducerRequest['intent'];
} {
  const intent = isRecord(value) ? value : {};
  const taskTitle = readString(intent, 'taskTitle');
  const instructions = readString(intent, 'instructions');
  const completionCriteria = normalizeStringArray(intent.completionCriteria);
  const blockedReasons: string[] = [];

  if (!taskTitle) {
    blockedReasons.push('Sandboxed coding producer requires a task title.');
  }

  if (!instructions) {
    blockedReasons.push('Sandboxed coding producer requires instructions.');
  }

  return {
    blockedReasons,
    intent: {
      completionCriteria,
      instructions,
      taskTitle,
    },
  };
}

function normalizeModelPolicy(value: unknown): {
  blockedReasons: string[];
  modelPolicy: NormalizedSandboxedCodingProducerRequest['modelPolicy'];
} {
  const policy = isRecord(value) ? value : {};
  const providerKind = readString(policy, 'providerKind');
  const toolExposure = readString(policy, 'toolExposure');
  const blockedReasons: string[] = [];

  if (!providerKind) {
    blockedReasons.push('Sandboxed coding producer requires a provider kind.');
  }

  if (toolExposure !== 'sandboxed_coding_producer') {
    blockedReasons.push('Sandboxed coding producer requires sandbox-only tool exposure.');
  }

  return {
    blockedReasons,
    modelPolicy: {
      providerKind,
      toolExposure: 'sandboxed_coding_producer',
    },
  };
}

function normalizeCommandPolicy(value: unknown): {
  blockedReasons: string[];
  commandPolicy: NormalizedSandboxedCodingProducerRequest['commandPolicy'];
} {
  const policy = isRecord(value) ? value : {};
  const allowedScripts = normalizeAllowedScripts(policy.allowedScripts);
  const timeoutMs = readNumber(policy, 'timeoutMs');
  const outputLimitBytes = readNumber(policy, 'outputLimitBytes');
  const blockedReasons: string[] = [...allowedScripts.blockedReasons];

  if (!Number.isFinite(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    blockedReasons.push('Sandboxed coding producer requires a bounded timeout.');
  }

  if (!Number.isFinite(outputLimitBytes)
    || outputLimitBytes < MIN_OUTPUT_LIMIT_BYTES
    || outputLimitBytes > MAX_OUTPUT_LIMIT_BYTES) {
    blockedReasons.push('Sandboxed coding producer requires a bounded output limit.');
  }

  return {
    blockedReasons,
    commandPolicy: {
      allowedScripts: allowedScripts.scripts,
      outputLimitBytes,
      timeoutMs,
    },
  };
}

function normalizeAllowedScripts(value: unknown): {
  blockedReasons: string[];
  scripts: AgentSandboxCheckScript[];
} {
  if (!Array.isArray(value)) {
    return {
      blockedReasons: ['Sandboxed coding producer requires allowed check scripts.'],
      scripts: [],
    };
  }

  const rawScripts = value
    .filter((script): script is string => typeof script === 'string')
    .map((script) => script.trim())
    .filter(Boolean);
  const rejectedScripts = rawScripts.filter((script) => !ACCEPTED_SCRIPTS.has(script));
  const scripts = Array.from(new Set(
    rawScripts.filter((script): script is AgentSandboxCheckScript => ACCEPTED_SCRIPTS.has(script)),
  )).sort();
  const blockedReasons: string[] = [];

  if (rawScripts.length !== value.length) {
    blockedReasons.push('Sandboxed coding producer check scripts must be strings.');
  }

  if (rejectedScripts.length > 0) {
    blockedReasons.push('Sandboxed coding producer check scripts must be allowlisted.');
  }

  if (!scripts.length) {
    blockedReasons.push('Sandboxed coding producer requires at least one allowlisted check.');
  }

  return {
    blockedReasons,
    scripts,
  };
}

function normalizeExecutionPolicy(value: unknown): {
  blockedReasons: string[];
  executionPolicy: NormalizedSandboxedCodingProducerRequest['executionPolicy'];
} {
  const policy = isRecord(value) ? value : {};
  const network = readString(policy, 'network');
  const promotion = readString(policy, 'promotion');
  const blockedReasons: string[] = [];

  if (network !== 'disabled' && network !== 'allowlisted') {
    blockedReasons.push('Sandboxed coding producer requires bounded network mode.');
  }

  if (policy.noCredentialPassthrough !== true) {
    blockedReasons.push('Sandboxed coding producer forbids credential passthrough.');
  }

  if (promotion !== 'decision_required') {
    blockedReasons.push('Sandboxed coding producer requires Decision promotion.');
  }

  return {
    blockedReasons,
    executionPolicy: {
      network: network === 'allowlisted' ? 'allowlisted' : 'disabled',
      noCredentialPassthrough: true,
      promotion: 'decision_required',
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

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' ? value : Number.NaN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
