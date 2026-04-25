import type {
  AgentSandboxCheckPlan,
  AgentSandboxCheckScript,
  AgentSandboxCommandPolicy,
  AgentSandboxProviderKind,
  AgentSandboxSessionAudit,
  AgentSandboxSessionRequest,
} from '../../../shared/agent-sandbox-provider.js';
import {
  buildAgentSandboxCheckPlan,
  buildDefaultAgentSandboxCommandPolicy,
} from '../../../shared/agent-sandbox-provider.js';
import { buildDefaultAgentToolExecutionPolicy } from '../../../shared/agent-tool-scaffold.js';

export type SandboxPatchReviewRunRequestBundle = {
  audit: AgentSandboxSessionAudit;
  checkPlan: AgentSandboxCheckPlan;
  request: AgentSandboxSessionRequest;
  summary: string;
};

export function buildSandboxPatchReviewRunRequest(params: {
  runId: string;
  taskId: string;
  workspaceRoot: string;
  requestedScripts: string[];
  commandPolicy?: AgentSandboxCommandPolicy;
  mountPath?: string;
  patchDraftSource?: {
    sourceId: string;
    sourceKind: string;
  } | null;
  providerKind?: Exclude<AgentSandboxProviderKind, 'disabled'>;
  reason?: string | null;
}): SandboxPatchReviewRunRequestBundle {
  const runId = params.runId.trim();
  const taskId = params.taskId.trim();
  const workspaceRoot = params.workspaceRoot.trim();

  if (!runId) {
    throw new Error('Sandbox patch review request requires a run id.');
  }

  if (!taskId) {
    throw new Error('Sandbox patch review request requires a task id.');
  }

  if (!workspaceRoot) {
    throw new Error('Sandbox patch review request requires a workspace root.');
  }

  const commandPolicy = params.commandPolicy ?? buildDefaultAgentSandboxCommandPolicy();
  const requestedScripts = uniqueTrimmed(params.requestedScripts);
  const allowedScripts = new Set<string>(commandPolicy.allowedScripts);
  const acceptedScripts = requestedScripts
    .filter((script): script is AgentSandboxCheckScript => allowedScripts.has(script));
  const rejectedScripts = requestedScripts.filter((script) => !allowedScripts.has(script));
  const checkPlan = buildAgentSandboxCheckPlan({
    policy: commandPolicy,
    requestedScripts,
  });
  const patchDraftSource = normalizePatchDraftSourceAudit(params.patchDraftSource);
  const idempotencyKey = [
    'sandbox-patch-review',
    ...(patchDraftSource ? [patchDraftSource.sourceKind, patchDraftSource.sourceId] : []),
    runId,
    taskId,
    checkPlan.scripts.join(','),
  ].join(':');
  const audit: AgentSandboxSessionAudit = {
    acceptedScripts,
    idempotencyKey,
    initiatedBy: 'internal_sandbox_patch_review',
    patchDraftSource,
    reason: params.reason?.trim() || 'Prepare sandbox patch review before workspace promotion.',
    rejectedScripts,
    requestedScripts,
    workspaceRoot,
  };
  const executionPolicy = {
    ...buildDefaultAgentToolExecutionPolicy({
      descriptorId: 'workspace.staged_patch',
      outputLimitBytes: commandPolicy.outputLimitBytes,
      timeoutMs: commandPolicy.timeoutMs,
    }),
    idempotencyKey,
    workspaceRoot,
  };
  const request: AgentSandboxSessionRequest = {
    audit,
    commandPolicy,
    descriptorId: 'workspace.staged_patch',
    executionPolicy,
    providerKind: params.providerKind ?? 'local_container',
    runId,
    taskId,
    workspace: {
      mode: 'staged_write',
      mountPath: params.mountPath?.trim() || '/workspace',
      workspaceRoot,
    },
  };

  return {
    audit,
    checkPlan,
    request,
    summary: formatSandboxPatchReviewRunRequestSummary({
      audit,
      checkPlan,
      request,
    }),
  };
}

export function formatSandboxPatchReviewRunRequestSummary(
  bundle: Pick<SandboxPatchReviewRunRequestBundle, 'audit' | 'checkPlan' | 'request'>,
): string {
  return [
    `descriptor=${bundle.request.descriptorId}`,
    `provider=${bundle.request.providerKind}`,
    `workspace=${bundle.request.workspace.mode}`,
    `checks=${bundle.checkPlan.scripts.join(',')}`,
    `network=${bundle.request.executionPolicy.networkPolicy}`,
    `credentials=${bundle.request.executionPolicy.credentialPolicy}`,
    bundle.audit.patchDraftSource
      ? `source=${bundle.audit.patchDraftSource.sourceKind}:${bundle.audit.patchDraftSource.sourceId}`
      : 'source=none',
    `idempotency=${bundle.audit.idempotencyKey}`,
    bundle.audit.rejectedScripts.length
      ? `rejected=${bundle.audit.rejectedScripts.join(',')}`
      : 'rejected=none',
  ].join(' / ');
}

function uniqueTrimmed(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizePatchDraftSourceAudit(source: {
  sourceId: string;
  sourceKind: string;
} | null | undefined): AgentSandboxSessionAudit['patchDraftSource'] {
  const sourceId = source?.sourceId.trim();
  const sourceKind = source?.sourceKind.trim();

  if (!sourceId || !sourceKind) {
    return null;
  }

  return {
    sourceId,
    sourceKind,
  };
}
