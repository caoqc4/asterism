import type {
  AgentPolicy,
  AgentToolName,
  AgentToolRisk,
} from '../../../shared/types/agent-execution.js';
import { toProviderNativeToolName } from '../../../shared/provider-native-tool-names.js';
import { shouldExposeAgentTool } from '../../../shared/agent-tool-exposure.js';
import type { AgentToolDefinition } from './agent-tool-registry.js';

type JsonSchemaObject = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
};

export type ProviderNativeToolSchema = {
  name: string;
  taskplaneToolName: AgentToolName;
  description: string;
  risk: AgentToolRisk;
  inputSchema: JsonSchemaObject;
};

const EMPTY_INPUT_SCHEMA: JsonSchemaObject = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

export const PROVIDER_NATIVE_INPUT_SCHEMAS: Partial<Record<AgentToolName, JsonSchemaObject>> = {
  'task.inspect_context': EMPTY_INPUT_SCHEMA,
  'task.inspect_timeline': EMPTY_INPUT_SCHEMA,
  'task.review_completion_evidence': EMPTY_INPUT_SCHEMA,
  'decision.draft': {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: 'Optional note to steer the decision draft.',
      },
    },
    additionalProperties: false,
  },
  'workspace.search': {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Literal text to search for inside the configured workspace.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of matches to return. The runtime clamps this value.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  'workspace.read_file': {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative text file path to read.',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
};

function canExposeTool(definition: AgentToolDefinition, policy: AgentPolicy): boolean {
  return shouldExposeAgentTool({
    name: definition.name,
    channel: 'provider_native',
    policy,
  }) && Boolean(PROVIDER_NATIVE_INPUT_SCHEMAS[definition.name]);
}

export function buildProviderNativeToolSchemas(params: {
  definitions: AgentToolDefinition[];
  policy: AgentPolicy;
}): ProviderNativeToolSchema[] {
  return params.definitions
    .filter((definition) => canExposeTool(definition, params.policy))
    .map((definition) => ({
      name: toProviderNativeToolName(definition.name),
      taskplaneToolName: definition.name,
      description: definition.description,
      risk: definition.risk,
      inputSchema: PROVIDER_NATIVE_INPUT_SCHEMAS[definition.name] ?? EMPTY_INPUT_SCHEMA,
    }));
}
