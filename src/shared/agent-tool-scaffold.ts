import {
  shouldExposeAgentTool,
  type AgentToolExposureChannel,
} from './agent-tool-exposure.js';
import type { AgentPolicy, AgentToolName, AgentToolRisk } from './types/agent-execution.js';

export type AgentToolScaffoldFamily =
  | 'task_domain'
  | 'workspace_coding'
  | 'browser_playwright'
  | 'mcp'
  | 'skill'
  | 'computer_use'
  | 'creator_connector';

export type AgentToolScaffoldLifecycle = 'implemented' | 'reserved';

export type AgentToolScaffoldExposure = 'hidden' | 'policy_gated';

export type AgentToolScaffoldCredentialPolicy =
  | 'none'
  | 'explicit_config'
  | 'connector_decision';

export type AgentToolSessionKind =
  | 'none'
  | 'sandbox'
  | 'browser'
  | 'mcp_client'
  | 'skill'
  | 'computer'
  | 'connector';

export type AgentToolArtifactKind =
  | 'none'
  | 'note'
  | 'patch'
  | 'command_log'
  | 'screenshot'
  | 'browser_trace'
  | 'browser_extract'
  | 'generated_draft'
  | 'connector_preview';

export type AgentToolCheckpointKind =
  | 'none'
  | 'tool_permission'
  | 'patch_promotion'
  | 'external_action'
  | 'credential_use';

export type AgentToolNetworkPolicy = 'disabled' | 'allowlisted' | 'unrestricted';

export type AgentToolExecutionPolicy = {
  descriptorId: string;
  sessionKind: AgentToolSessionKind;
  workspaceRoot?: string | null;
  sandboxId?: string | null;
  connectorId?: string | null;
  networkPolicy: AgentToolNetworkPolicy;
  credentialPolicy: AgentToolScaffoldCredentialPolicy;
  timeoutMs: number;
  outputLimitBytes: number;
  idempotencyKey?: string | null;
};

export type AgentToolExecutionPolicyValidation =
  | {
      blockedReasons: [];
      policy: AgentToolExecutionPolicy;
      summary: string;
      valid: true;
    }
  | {
      blockedReasons: string[];
      summary: string;
      valid: false;
    };

export type AgentToolSessionRecord = {
  id: string;
  kind: AgentToolSessionKind;
  descriptorId: string;
  status: 'reserved' | 'running' | 'completed' | 'failed' | 'disposed';
  capabilitySummary: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentToolArtifactDescriptor = {
  kind: AgentToolArtifactKind;
  title: string;
  summary: string;
  preview?: string | null;
  path?: string | null;
};

export type AgentToolCheckpointDescriptor = {
  kind: AgentToolCheckpointKind;
  reason: string;
  consequence: string;
  preview?: string | null;
  resumeTarget?: string | null;
  policySnapshot: AgentToolExecutionPolicy;
};

export type AgentToolScaffoldDescriptor = {
  id: string;
  family: AgentToolScaffoldFamily;
  lifecycle: AgentToolScaffoldLifecycle;
  runtimeToolName?: AgentToolName;
  risk: AgentToolRisk;
  defaultExposure: AgentToolScaffoldExposure;
  sessionKind: AgentToolSessionKind;
  artifactKinds: AgentToolArtifactKind[];
  checkpointKind: AgentToolCheckpointKind;
  credentialPolicy: AgentToolScaffoldCredentialPolicy;
  summary: string;
};

export const AGENT_TOOL_SCAFFOLD_DESCRIPTORS = [
  {
    id: 'task.inspect_context',
    family: 'task_domain',
    lifecycle: 'implemented',
    runtimeToolName: 'task.inspect_context',
    risk: 'safe_read',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'none',
    credentialPolicy: 'none',
    summary: 'Inspect the current Taskplane task context.',
  },
  {
    id: 'task.inspect_timeline',
    family: 'task_domain',
    lifecycle: 'implemented',
    runtimeToolName: 'task.inspect_timeline',
    risk: 'safe_read',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'none',
    credentialPolicy: 'none',
    summary: 'Inspect recent Taskplane timeline evidence.',
  },
  {
    id: 'task.update_next_step',
    family: 'task_domain',
    lifecycle: 'implemented',
    runtimeToolName: 'task.update_next_step',
    risk: 'local_write',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'tool_permission',
    credentialPolicy: 'none',
    summary: 'Update the task next step through Taskplane services.',
  },
  {
    id: 'task.create_completion_criterion',
    family: 'task_domain',
    lifecycle: 'implemented',
    runtimeToolName: 'task.create_completion_criterion',
    risk: 'local_write',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'tool_permission',
    credentialPolicy: 'none',
    summary: 'Create a task completion criterion through Taskplane services.',
  },
  {
    id: 'task.review_completion_evidence',
    family: 'task_domain',
    lifecycle: 'implemented',
    runtimeToolName: 'task.review_completion_evidence',
    risk: 'safe_read',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'none',
    credentialPolicy: 'none',
    summary: 'Review completion evidence without satisfying criteria or completing the task.',
  },
  {
    id: 'source_context.create',
    family: 'task_domain',
    lifecycle: 'implemented',
    runtimeToolName: 'source_context.create',
    risk: 'local_write',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'tool_permission',
    credentialPolicy: 'none',
    summary: 'Create task source context through Taskplane services.',
  },
  {
    id: 'decision.draft',
    family: 'task_domain',
    lifecycle: 'implemented',
    runtimeToolName: 'decision.draft',
    risk: 'local_write',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'tool_permission',
    credentialPolicy: 'none',
    summary: 'Draft a Decision proposal without creating a formal Decision.',
  },
  {
    id: 'artifact.create_note',
    family: 'task_domain',
    lifecycle: 'implemented',
    runtimeToolName: 'artifact.create_note',
    risk: 'local_write',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['note'],
    checkpointKind: 'tool_permission',
    credentialPolicy: 'none',
    summary: 'Create a local Taskplane note artifact after policy checks.',
  },
  {
    id: 'workspace.search',
    family: 'workspace_coding',
    lifecycle: 'implemented',
    runtimeToolName: 'workspace.search',
    risk: 'safe_read',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'none',
    credentialPolicy: 'none',
    summary: 'Search local workspace context when explicitly enabled.',
  },
  {
    id: 'workspace.read_file',
    family: 'workspace_coding',
    lifecycle: 'implemented',
    runtimeToolName: 'workspace.read_file',
    risk: 'safe_read',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'none',
    credentialPolicy: 'none',
    summary: 'Read local workspace files when explicitly enabled.',
  },
  {
    id: 'workspace.run_command',
    family: 'workspace_coding',
    lifecycle: 'implemented',
    runtimeToolName: 'workspace.run_command',
    risk: 'local_command',
    defaultExposure: 'hidden',
    sessionKind: 'none',
    artifactKinds: ['command_log'],
    checkpointKind: 'tool_permission',
    credentialPolicy: 'none',
    summary: 'Run allowlisted package scripts through registry-only Decision checkpoints.',
  },
  {
    id: 'workspace.write_patch',
    family: 'workspace_coding',
    lifecycle: 'implemented',
    runtimeToolName: 'workspace.write_patch',
    risk: 'local_write',
    defaultExposure: 'hidden',
    sessionKind: 'none',
    artifactKinds: ['patch'],
    checkpointKind: 'tool_permission',
    credentialPolicy: 'none',
    summary: 'Apply an expected-files workspace patch through registry-only Decision checkpoints.',
  },
  {
    id: 'workspace.staged_patch',
    family: 'workspace_coding',
    lifecycle: 'reserved',
    risk: 'local_write',
    defaultExposure: 'hidden',
    sessionKind: 'sandbox',
    artifactKinds: ['patch', 'command_log'],
    checkpointKind: 'patch_promotion',
    credentialPolicy: 'none',
    summary: 'Produce staged coding patches and check logs before Decision promotion.',
  },
  {
    id: 'browser.readonly_evidence',
    family: 'browser_playwright',
    lifecycle: 'reserved',
    risk: 'external_read',
    defaultExposure: 'hidden',
    sessionKind: 'browser',
    artifactKinds: ['screenshot', 'browser_trace', 'browser_extract'],
    checkpointKind: 'none',
    credentialPolicy: 'explicit_config',
    summary: 'Capture read-only browser or Playwright evidence in an isolated session.',
  },
  {
    id: 'mcp.safe_read',
    family: 'mcp',
    lifecycle: 'reserved',
    risk: 'external_read',
    defaultExposure: 'hidden',
    sessionKind: 'mcp_client',
    artifactKinds: ['none'],
    checkpointKind: 'none',
    credentialPolicy: 'explicit_config',
    summary: 'Expose selected MCP resources or safe-read tools through Taskplane policy.',
  },
  {
    id: 'skill.prompt_shape',
    family: 'skill',
    lifecycle: 'reserved',
    risk: 'safe_read',
    defaultExposure: 'hidden',
    sessionKind: 'skill',
    artifactKinds: ['generated_draft'],
    checkpointKind: 'none',
    credentialPolicy: 'none',
    summary: 'Apply a trusted skill or process template without granting tool authority.',
  },
  {
    id: 'computer.inspect_only',
    family: 'computer_use',
    lifecycle: 'reserved',
    risk: 'sensitive',
    defaultExposure: 'hidden',
    sessionKind: 'computer',
    artifactKinds: ['screenshot'],
    checkpointKind: 'tool_permission',
    credentialPolicy: 'connector_decision',
    summary: 'Reserve future computer-use inspection behind a separate decision.',
  },
  {
    id: 'creator.publish_preview',
    family: 'creator_connector',
    lifecycle: 'reserved',
    risk: 'external_write',
    defaultExposure: 'hidden',
    sessionKind: 'connector',
    artifactKinds: ['generated_draft', 'connector_preview'],
    checkpointKind: 'external_action',
    credentialPolicy: 'connector_decision',
    summary: 'Prepare creator publishing previews without posting externally.',
  },
] as const satisfies readonly AgentToolScaffoldDescriptor[];

const SCAFFOLD_BY_ID = new Map<string, AgentToolScaffoldDescriptor>(
  AGENT_TOOL_SCAFFOLD_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]),
);

export const AGENT_TOOL_SCAFFOLD_IDS = AGENT_TOOL_SCAFFOLD_DESCRIPTORS
  .map((descriptor) => descriptor.id);

const AGENT_TOOL_SCAFFOLD_ID_SET = new Set<string>(AGENT_TOOL_SCAFFOLD_IDS);
const MAX_AGENT_TOOL_TIMEOUT_MS = 10 * 60_000;
const MAX_AGENT_TOOL_OUTPUT_LIMIT_BYTES = 1_000_000;

export function isAgentToolScaffoldId(value: unknown): value is string {
  return typeof value === 'string' && AGENT_TOOL_SCAFFOLD_ID_SET.has(value);
}

export function getAgentToolScaffoldDescriptor(id: string): AgentToolScaffoldDescriptor {
  const descriptor = SCAFFOLD_BY_ID.get(id);

  if (!descriptor) {
    throw new Error(`Missing agent tool scaffold descriptor: ${id}`);
  }

  return descriptor;
}

export function getAgentToolScaffoldDescriptorsByFamily(
  family: AgentToolScaffoldFamily,
): AgentToolScaffoldDescriptor[] {
  return AGENT_TOOL_SCAFFOLD_DESCRIPTORS.filter((descriptor) => descriptor.family === family);
}

export function getReservedAgentToolScaffoldDescriptors(): AgentToolScaffoldDescriptor[] {
  return AGENT_TOOL_SCAFFOLD_DESCRIPTORS.filter((descriptor) => descriptor.lifecycle === 'reserved');
}

export function buildDefaultAgentToolExecutionPolicy(params: {
  descriptorId: string;
  timeoutMs?: number;
  outputLimitBytes?: number;
}): AgentToolExecutionPolicy {
  const descriptor = getAgentToolScaffoldDescriptor(params.descriptorId);
  const needsExternalBoundary = descriptor.risk === 'external_read'
    || descriptor.risk === 'external_write'
    || descriptor.sessionKind === 'browser'
    || descriptor.sessionKind === 'mcp_client'
    || descriptor.sessionKind === 'connector'
    || descriptor.sessionKind === 'computer';

  return {
    descriptorId: descriptor.id,
    sessionKind: descriptor.sessionKind,
    networkPolicy: needsExternalBoundary ? 'allowlisted' : 'disabled',
    credentialPolicy: descriptor.credentialPolicy,
    timeoutMs: params.timeoutMs ?? 120_000,
    outputLimitBytes: params.outputLimitBytes ?? 64_000,
  };
}

export function validateAgentToolExecutionPolicy(policy: unknown): AgentToolExecutionPolicyValidation {
  if (!policy || typeof policy !== 'object') {
    return invalidAgentToolExecutionPolicy(['Agent tool execution policy must be an object.']);
  }

  const candidate = policy as Partial<AgentToolExecutionPolicy>;
  const blockedReasons: string[] = [];
  let normalizedTimeoutMs: number | null = null;
  let normalizedOutputLimitBytes: number | null = null;

  if (!isAgentToolScaffoldId(candidate.descriptorId)) {
    blockedReasons.push('Agent tool execution policy must target a known scaffold descriptor.');
  }

  const descriptor = isAgentToolScaffoldId(candidate.descriptorId)
    ? getAgentToolScaffoldDescriptor(candidate.descriptorId)
    : null;

  if (descriptor && candidate.sessionKind !== descriptor.sessionKind) {
    blockedReasons.push('Agent tool execution policy session kind must match the scaffold descriptor.');
  }

  if (!isAgentToolNetworkPolicy(candidate.networkPolicy)) {
    blockedReasons.push('Agent tool execution policy requires a supported network policy.');
  } else if (candidate.networkPolicy === 'unrestricted') {
    blockedReasons.push('Agent tool execution policy must not use unrestricted network access.');
  } else if (descriptor && isLocalOnlyAgentToolDescriptor(descriptor) && candidate.networkPolicy !== 'disabled') {
    blockedReasons.push('Local-only agent tool execution policies must keep network disabled.');
  }

  if (!isAgentToolCredentialPolicy(candidate.credentialPolicy)) {
    blockedReasons.push('Agent tool execution policy requires a supported credential policy.');
  } else if (descriptor && candidate.credentialPolicy !== descriptor.credentialPolicy) {
    blockedReasons.push('Agent tool execution policy credential policy must match the scaffold descriptor.');
  }

  const timeoutMs = candidate.timeoutMs;
  if (!Number.isInteger(timeoutMs) || typeof timeoutMs !== 'number' || timeoutMs <= 0) {
    blockedReasons.push('Agent tool execution policy requires a positive integer timeout.');
  } else if (timeoutMs > MAX_AGENT_TOOL_TIMEOUT_MS) {
    blockedReasons.push('Agent tool execution policy timeout exceeds the maximum allowed duration.');
  } else {
    normalizedTimeoutMs = timeoutMs;
  }

  const outputLimitBytes = candidate.outputLimitBytes;
  if (!Number.isInteger(outputLimitBytes) || typeof outputLimitBytes !== 'number' || outputLimitBytes <= 0) {
    blockedReasons.push('Agent tool execution policy requires a positive integer output limit.');
  } else if (outputLimitBytes > MAX_AGENT_TOOL_OUTPUT_LIMIT_BYTES) {
    blockedReasons.push('Agent tool execution policy output limit exceeds the maximum allowed size.');
  } else {
    normalizedOutputLimitBytes = outputLimitBytes;
  }

  if (candidate.workspaceRoot !== undefined
    && candidate.workspaceRoot !== null
    && (typeof candidate.workspaceRoot !== 'string' || !candidate.workspaceRoot.trim())) {
    blockedReasons.push('Agent tool execution policy workspace root must be a non-empty string when provided.');
  }

  if (candidate.sandboxId !== undefined
    && candidate.sandboxId !== null
    && (typeof candidate.sandboxId !== 'string' || !candidate.sandboxId.trim())) {
    blockedReasons.push('Agent tool execution policy sandbox id must be a non-empty string when provided.');
  }

  if (candidate.connectorId !== undefined
    && candidate.connectorId !== null
    && (typeof candidate.connectorId !== 'string' || !candidate.connectorId.trim())) {
    blockedReasons.push('Agent tool execution policy connector id must be a non-empty string when provided.');
  }

  if (candidate.idempotencyKey !== undefined
    && candidate.idempotencyKey !== null
    && (typeof candidate.idempotencyKey !== 'string' || !candidate.idempotencyKey.trim())) {
    blockedReasons.push('Agent tool execution policy idempotency key must be a non-empty string when provided.');
  }

  if (blockedReasons.length > 0 || !descriptor || normalizedTimeoutMs === null || normalizedOutputLimitBytes === null) {
    return invalidAgentToolExecutionPolicy(blockedReasons);
  }

  return {
    blockedReasons: [],
    policy: {
      connectorId: candidate.connectorId,
      credentialPolicy: candidate.credentialPolicy as AgentToolScaffoldCredentialPolicy,
      descriptorId: descriptor.id,
      idempotencyKey: candidate.idempotencyKey,
      networkPolicy: candidate.networkPolicy as AgentToolNetworkPolicy,
      outputLimitBytes: normalizedOutputLimitBytes,
      sandboxId: candidate.sandboxId,
      sessionKind: descriptor.sessionKind,
      timeoutMs: normalizedTimeoutMs,
      workspaceRoot: candidate.workspaceRoot,
    },
    summary: `Agent tool execution policy valid for ${descriptor.id}.`,
    valid: true,
  };
}

export function requiresAgentToolCheckpoint(descriptorId: string): boolean {
  return getAgentToolScaffoldDescriptor(descriptorId).checkpointKind !== 'none';
}

export function shouldExposeAgentToolScaffold(params: {
  id: string;
  channel: AgentToolExposureChannel;
  policy: Pick<AgentPolicy, 'allowLocalWorkspaceRead' | 'allowTaskMutationTools'>;
}): boolean {
  const descriptor = getAgentToolScaffoldDescriptor(params.id);

  if (descriptor.defaultExposure === 'hidden' || descriptor.lifecycle === 'reserved' || !descriptor.runtimeToolName) {
    return false;
  }

  return shouldExposeAgentTool({
    name: descriptor.runtimeToolName,
    channel: params.channel,
    policy: params.policy,
  });
}

function isAgentToolNetworkPolicy(value: unknown): value is AgentToolNetworkPolicy {
  return value === 'disabled' || value === 'allowlisted' || value === 'unrestricted';
}

function isAgentToolCredentialPolicy(value: unknown): value is AgentToolScaffoldCredentialPolicy {
  return value === 'none' || value === 'explicit_config' || value === 'connector_decision';
}

function isLocalOnlyAgentToolDescriptor(descriptor: AgentToolScaffoldDescriptor): boolean {
  return descriptor.risk !== 'external_read'
    && descriptor.risk !== 'external_write'
    && descriptor.sessionKind !== 'browser'
    && descriptor.sessionKind !== 'mcp_client'
    && descriptor.sessionKind !== 'connector'
    && descriptor.sessionKind !== 'computer';
}

function invalidAgentToolExecutionPolicy(blockedReasons: string[]): AgentToolExecutionPolicyValidation {
  const reasons = blockedReasons.length
    ? blockedReasons
    : ['Agent tool execution policy is invalid.'];

  return {
    blockedReasons: reasons,
    summary: `Agent tool execution policy blocked: ${reasons.join(' ')}`,
    valid: false,
  };
}
