import type { AgentPolicy, AgentToolName } from './types/agent-execution.js';

export type AgentToolExposureChannel = 'text_prompt' | 'provider_native';

export type AgentToolExposureRequirement =
  | 'always'
  | 'workspace_read_opt_in'
  | 'task_mutation_opt_in'
  | 'never';

export type AgentToolExposureDescriptor = {
  name: AgentToolName;
  textPrompt: AgentToolExposureRequirement;
  providerNative: AgentToolExposureRequirement;
};

export const AGENT_TOOL_EXPOSURE_MATRIX = [
  {
    name: 'task.inspect_context',
    textPrompt: 'always',
    providerNative: 'always',
  },
  {
    name: 'task.inspect_timeline',
    textPrompt: 'always',
    providerNative: 'always',
  },
  {
    name: 'workspace.search',
    textPrompt: 'workspace_read_opt_in',
    providerNative: 'workspace_read_opt_in',
  },
  {
    name: 'workspace.read_file',
    textPrompt: 'workspace_read_opt_in',
    providerNative: 'workspace_read_opt_in',
  },
  {
    name: 'task.update_next_step',
    textPrompt: 'task_mutation_opt_in',
    providerNative: 'never',
  },
  {
    name: 'task.create_completion_criterion',
    textPrompt: 'task_mutation_opt_in',
    providerNative: 'never',
  },
  {
    name: 'task.review_completion_evidence',
    textPrompt: 'task_mutation_opt_in',
    providerNative: 'task_mutation_opt_in',
  },
  {
    name: 'source_context.create',
    textPrompt: 'task_mutation_opt_in',
    providerNative: 'never',
  },
  {
    name: 'decision.draft',
    textPrompt: 'task_mutation_opt_in',
    providerNative: 'task_mutation_opt_in',
  },
  {
    name: 'artifact.create_note',
    textPrompt: 'always',
    providerNative: 'never',
  },
  {
    name: 'workspace.run_command',
    textPrompt: 'never',
    providerNative: 'never',
  },
  {
    name: 'workspace.write_patch',
    textPrompt: 'never',
    providerNative: 'never',
  },
] as const satisfies readonly AgentToolExposureDescriptor[];

const EXPOSURE_BY_TOOL = new Map<AgentToolName, AgentToolExposureDescriptor>(
  AGENT_TOOL_EXPOSURE_MATRIX.map((descriptor) => [descriptor.name, descriptor]),
);

function meetsExposureRequirement(
  requirement: AgentToolExposureRequirement,
  policy: Pick<AgentPolicy, 'allowLocalWorkspaceRead' | 'allowTaskMutationTools'>,
): boolean {
  switch (requirement) {
    case 'always':
      return true;
    case 'workspace_read_opt_in':
      return policy.allowLocalWorkspaceRead;
    case 'task_mutation_opt_in':
      return Boolean(policy.allowTaskMutationTools);
    case 'never':
      return false;
  }
}

export function getAgentToolExposureDescriptor(
  name: AgentToolName,
): AgentToolExposureDescriptor {
  const descriptor = EXPOSURE_BY_TOOL.get(name);

  if (!descriptor) {
    throw new Error(`Missing exposure descriptor for agent tool: ${name}`);
  }

  return descriptor;
}

export function shouldExposeAgentTool(params: {
  name: AgentToolName;
  channel: AgentToolExposureChannel;
  policy: Pick<AgentPolicy, 'allowLocalWorkspaceRead' | 'allowTaskMutationTools'>;
}): boolean {
  const descriptor = getAgentToolExposureDescriptor(params.name);
  const requirement = params.channel === 'text_prompt'
    ? descriptor.textPrompt
    : descriptor.providerNative;

  return meetsExposureRequirement(requirement, params.policy);
}

export function getExposedAgentToolNames(params: {
  channel: AgentToolExposureChannel;
  policy: Pick<AgentPolicy, 'allowLocalWorkspaceRead' | 'allowTaskMutationTools'>;
}): AgentToolName[] {
  return AGENT_TOOL_EXPOSURE_MATRIX
    .filter((descriptor) => shouldExposeAgentTool({
      name: descriptor.name,
      channel: params.channel,
      policy: params.policy,
    }))
    .map((descriptor) => descriptor.name);
}
