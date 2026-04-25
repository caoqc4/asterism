import type { AgentToolName, AgentToolRisk } from './types/agent-execution.js';

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
    id: 'task.mutate',
    family: 'task_domain',
    lifecycle: 'implemented',
    risk: 'local_write',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'tool_permission',
    credentialPolicy: 'none',
    summary: 'Task update, criterion, source-context, and draft Decision tools.',
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
    id: 'workspace.read_context',
    family: 'workspace_coding',
    lifecycle: 'implemented',
    risk: 'safe_read',
    defaultExposure: 'policy_gated',
    sessionKind: 'none',
    artifactKinds: ['none'],
    checkpointKind: 'none',
    credentialPolicy: 'none',
    summary: 'Search and read local workspace context when explicitly enabled.',
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
