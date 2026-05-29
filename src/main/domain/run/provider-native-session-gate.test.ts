import { describe, expect, it } from 'vitest';

import type { CreateRunInput } from '../../../shared/types/run.js';
import type { RuntimeTextResult } from '../../executors/text-generation.js';
import { evaluateProviderNativeSessionGate } from './provider-native-session-gate.js';

const agentInput: CreateRunInput = {
  taskId: 'task_1',
  type: 'agent',
};

const textResultWithPayload: RuntimeTextResult = {
  text: 'Agent output',
  providerPayload: {
    source: 'provider_response_body',
    provider: 'openai-compatible',
    model: 'relay-model',
    rawSummary: 'tool_calls=1',
    payload: {
      choices: [],
    },
  },
};

const normalized = {
  status: 'normalized',
  plan: {
    source: 'provider_tool_call',
    provider: 'openai-compatible',
    model: 'relay-model',
    rawSummary: 'tool_calls=1',
    providerCallIds: ['call_1'],
    proposal: {
      steps: [
        {
          tool: 'task.inspect_context',
          input: {},
        },
      ],
    },
  },
} as const;

function buildGateInput(overrides: Partial<Parameters<typeof evaluateProviderNativeSessionGate>[0]> = {}) {
  return {
    input: agentInput,
    provider: 'openai-compatible',
    featureFlags: {
      enableScheduler: false,
      enableProviderNativeToolCalls: true,
    },
    textResult: textResultWithPayload,
    normalization: normalized,
    ...overrides,
  } satisfies Parameters<typeof evaluateProviderNativeSessionGate>[0];
}

describe('evaluateProviderNativeSessionGate', () => {
  it('allows provider-native sessions only when all gates pass', () => {
    expect(evaluateProviderNativeSessionGate(buildGateInput())).toEqual({
      allowed: true,
    });
  });

  it.each([
    {
      label: 'non-agent run',
      overrides: {
        input: {
          taskId: 'task_1',
          type: 'draft',
        },
      },
      reason: 'Provider-native sessions are only available for agent runs.',
    },
    {
      label: 'disabled flag',
      overrides: {
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: false,
        },
      },
      reason: 'Provider-native session flag is disabled.',
    },
    {
      label: 'replicate provider',
      overrides: {
        provider: 'replicate',
      },
      reason: 'Replicate native text prediction does not support provider-native sessions.',
    },
    {
      label: 'missing provider payload',
      overrides: {
        textResult: {
          text: 'Agent output',
          providerPayload: null,
        },
      },
      reason: 'No provider-native payload is available for this run.',
    },
    {
      label: 'provider payload identity mismatch',
      overrides: {
        textResult: {
          text: 'Agent output',
          providerPayload: {
            ...textResultWithPayload.providerPayload,
            provider: 'anthropic',
          },
        },
      },
      reason: 'Provider-native payload provider does not match the selected runtime provider.',
    },
    {
      label: 'missing normalization',
      overrides: {
        normalization: null,
      },
      reason: 'Provider-native payload has not been normalized.',
    },
    {
      label: 'failed normalization',
      overrides: {
        normalization: {
          status: 'failed',
          provider: 'openai-compatible',
          model: 'relay-model',
          error: 'Bad payload',
          rawSummary: 'tool_calls',
        },
      },
      reason: 'Provider-native payload normalization failed.',
    },
  ])('blocks $label', ({ overrides, reason }) => {
    expect(evaluateProviderNativeSessionGate(buildGateInput(overrides as never))).toEqual({
      allowed: false,
      reason,
    });
  });
});
