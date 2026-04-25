import type {
  AgentStepProposal,
  AgentToolName,
  ProviderToolCallNormalizationResult,
} from './types/agent-execution.js';

const AGENT_TOOL_NAMES = new Set<AgentToolName>([
  'artifact.create_note',
  'decision.draft',
  'source_context.create',
  'task.create_completion_criterion',
  'task.inspect_context',
  'task.inspect_timeline',
  'task.review_completion_evidence',
  'task.update_next_step',
  'workspace.read_file',
  'workspace.run_command',
  'workspace.search',
  'workspace.write_patch',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function summarizeUnknownPayload(payload: unknown): string {
  if (!isRecord(payload)) {
    return typeof payload;
  }

  return Object.keys(payload).sort().join(', ') || 'empty object';
}

function parseProviderCallIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseProposal(value: unknown): AgentStepProposal | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!Array.isArray(value.steps)) {
    return null;
  }

  const steps = value.steps.flatMap((step) => {
    if (!isRecord(step) || typeof step.tool !== 'string') {
      return [];
    }

    if (!AGENT_TOOL_NAMES.has(step.tool as AgentToolName)) {
      return [];
    }

    return [{
      tool: step.tool as AgentToolName,
      input: isRecord(step.input) ? step.input : undefined,
    }];
  });

  if (!steps.length) {
    return null;
  }

  return {
    finalOutput: typeof value.finalOutput === 'string' ? value.finalOutput : null,
    steps,
  };
}

export function normalizeProviderToolCallPlan(params: {
  provider: string;
  model: string;
  payload: unknown;
}): ProviderToolCallNormalizationResult {
  const { model, payload, provider } = params;

  if (!isRecord(payload)) {
    return {
      status: 'failed',
      provider,
      model,
      error: 'Provider tool-call payload must be an object.',
      rawSummary: summarizeUnknownPayload(payload),
    };
  }

  if (payload.source !== 'provider_tool_call') {
    return {
      status: 'failed',
      provider,
      model,
      error: 'Provider tool-call payload source is not supported.',
      rawSummary: summarizeUnknownPayload(payload),
    };
  }

  const proposal = parseProposal(payload.proposal);

  if (!proposal) {
    return {
      status: 'failed',
      provider,
      model,
      error: 'Provider tool-call payload did not contain executable Taskplane steps.',
      rawSummary: summarizeUnknownPayload(payload),
    };
  }

  return {
    status: 'normalized',
    plan: {
      source: 'provider_tool_call',
      provider,
      model,
      proposal,
      rawSummary: typeof payload.rawSummary === 'string'
        ? payload.rawSummary
        : summarizeUnknownPayload(payload),
      providerCallIds: parseProviderCallIds(payload.providerCallIds),
      stopReason: typeof payload.stopReason === 'string' ? payload.stopReason : null,
    },
  };
}
