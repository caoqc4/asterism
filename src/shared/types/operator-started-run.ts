import {
  buildDefaultAgentToolExecutionPolicy,
  validateAgentToolExecutionPolicy,
  type AgentToolExecutionPolicy,
} from '../agent-tool-scaffold.js';

export const OPERATOR_STARTED_RUN_KINDS = [
  'browser_evidence_smoke',
  'code_agent_preview',
  'sandbox_patch_review',
] as const;

export type OperatorStartedRunKind = typeof OPERATOR_STARTED_RUN_KINDS[number];

export type OperatorStartedRunRequest = {
  descriptorId: string;
  kind: OperatorStartedRunKind;
  modelExposure: 'hidden';
  operatorConfirmed: true;
  policy: AgentToolExecutionPolicy;
  providerCallAllowed: false;
  reason: string;
  schedulerAllowed: false;
  taskId: string;
};

export type OperatorStartedRunValidation =
  | {
      blockedReasons: [];
      request: OperatorStartedRunRequest;
      summary: string;
      valid: true;
    }
  | {
      blockedReasons: string[];
      summary: string;
      valid: false;
    };

const KIND_DESCRIPTOR: Record<OperatorStartedRunKind, string> = {
  browser_evidence_smoke: 'browser.readonly_evidence',
  code_agent_preview: 'workspace.staged_patch',
  sandbox_patch_review: 'workspace.staged_patch',
};

const OPERATOR_STARTED_RUN_KIND_SET = new Set<string>(OPERATOR_STARTED_RUN_KINDS);

export function isOperatorStartedRunKind(value: unknown): value is OperatorStartedRunKind {
  return typeof value === 'string' && OPERATOR_STARTED_RUN_KIND_SET.has(value);
}

export function buildDefaultOperatorStartedRunRequest(params: {
  kind: OperatorStartedRunKind;
  reason?: string;
  taskId: string;
  timeoutMs?: number;
}): OperatorStartedRunRequest {
  const descriptorId = KIND_DESCRIPTOR[params.kind];

  return {
    descriptorId,
    kind: params.kind,
    modelExposure: 'hidden',
    operatorConfirmed: true,
    policy: buildDefaultAgentToolExecutionPolicy({
      descriptorId,
      timeoutMs: params.timeoutMs,
    }),
    providerCallAllowed: false,
    reason: params.reason?.trim() || `Operator-started ${params.kind} run.`,
    schedulerAllowed: false,
    taskId: params.taskId,
  };
}

export function validateOperatorStartedRunRequest(input: unknown): OperatorStartedRunValidation {
  if (!input || typeof input !== 'object') {
    return invalidOperatorStartedRunRequest(['Operator-started run request must be an object.']);
  }

  const candidate = input as Partial<OperatorStartedRunRequest>;
  const blockedReasons: string[] = [];

  if (!isOperatorStartedRunKind(candidate.kind)) {
    blockedReasons.push('Operator-started run request requires a supported kind.');
  }

  const expectedDescriptor = isOperatorStartedRunKind(candidate.kind)
    ? KIND_DESCRIPTOR[candidate.kind]
    : null;

  if (typeof candidate.taskId !== 'string' || !candidate.taskId.trim()) {
    blockedReasons.push('Operator-started run request requires a task id.');
  }

  if (typeof candidate.reason !== 'string' || !candidate.reason.trim()) {
    blockedReasons.push('Operator-started run request requires a reason.');
  }

  if (candidate.operatorConfirmed !== true) {
    blockedReasons.push('Operator-started run request requires explicit operator confirmation.');
  }

  if (candidate.modelExposure !== 'hidden') {
    blockedReasons.push('Operator-started run request must keep model exposure hidden.');
  }

  if (candidate.schedulerAllowed !== false) {
    blockedReasons.push('Operator-started run request must not allow scheduler starts.');
  }

  if (candidate.providerCallAllowed !== false) {
    blockedReasons.push('Operator-started run request must not allow provider calls by default.');
  }

  if (expectedDescriptor && candidate.descriptorId !== expectedDescriptor) {
    blockedReasons.push('Operator-started run request descriptor must match its kind.');
  }

  const policyValidation = validateAgentToolExecutionPolicy(candidate.policy);
  if (!policyValidation.valid) {
    blockedReasons.push(...policyValidation.blockedReasons);
  } else if (expectedDescriptor && policyValidation.policy.descriptorId !== expectedDescriptor) {
    blockedReasons.push('Operator-started run policy descriptor must match its kind.');
  }

  if (blockedReasons.length > 0 || !expectedDescriptor || !policyValidation.valid) {
    return invalidOperatorStartedRunRequest(blockedReasons);
  }

  return {
    blockedReasons: [],
    request: {
      descriptorId: expectedDescriptor,
      kind: candidate.kind as OperatorStartedRunKind,
      modelExposure: 'hidden',
      operatorConfirmed: true,
      policy: policyValidation.policy,
      providerCallAllowed: false,
      reason: candidate.reason!.trim(),
      schedulerAllowed: false,
      taskId: candidate.taskId!.trim(),
    },
    summary: [
      'Operator-started run request valid',
      `kind=${candidate.kind}`,
      `descriptor=${expectedDescriptor}`,
      'modelExposure=hidden',
      'scheduler=no',
      'providerCall=no',
    ].join(' / '),
    valid: true,
  };
}

function invalidOperatorStartedRunRequest(blockedReasons: string[]): OperatorStartedRunValidation {
  const reasons = blockedReasons.length
    ? blockedReasons
    : ['Operator-started run request is invalid.'];

  return {
    blockedReasons: reasons,
    summary: `Operator-started run request blocked: ${reasons.join('; ')}`,
    valid: false,
  };
}
