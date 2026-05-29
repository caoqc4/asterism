import type { CreateRunInput } from '../../../shared/types/run.js';
import type { AiProvider, FeatureFlags } from '../../../shared/types/settings.js';
import type { ProviderToolCallNormalizationResult } from '../../../shared/types/agent-execution.js';
import type { RuntimeTextResult } from '../../executors/text-generation.js';

export type ProviderNativeSessionGateInput = {
  input: CreateRunInput;
  provider: AiProvider;
  featureFlags: FeatureFlags;
  textResult: RuntimeTextResult;
  normalization: ProviderToolCallNormalizationResult | null;
};

export type ProviderNativeSessionGateResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: string;
    };

export function evaluateProviderNativeSessionGate(
  params: ProviderNativeSessionGateInput,
): ProviderNativeSessionGateResult {
  if (params.input.type !== 'agent') {
    return {
      allowed: false,
      reason: 'Provider-native sessions are only available for agent runs.',
    };
  }

  if (!params.featureFlags.enableProviderNativeToolCalls) {
    return {
      allowed: false,
      reason: 'Provider-native session flag is disabled.',
    };
  }

  if (params.provider === 'replicate') {
    return {
      allowed: false,
      reason: 'Replicate native text prediction does not support provider-native sessions.',
    };
  }

  if (!params.textResult.providerPayload) {
    return {
      allowed: false,
      reason: 'No provider-native payload is available for this run.',
    };
  }

  if (params.textResult.providerPayload.provider !== params.provider) {
    return {
      allowed: false,
      reason: 'Provider-native payload provider does not match the selected runtime provider.',
    };
  }

  if (!params.normalization) {
    return {
      allowed: false,
      reason: 'Provider-native payload has not been normalized.',
    };
  }

  if (params.normalization.status !== 'normalized') {
    return {
      allowed: false,
      reason: 'Provider-native payload normalization failed.',
    };
  }

  if (params.normalization.plan.provider !== params.provider) {
    return {
      allowed: false,
      reason: 'Provider-native normalized plan provider does not match the selected runtime provider.',
    };
  }

  return {
    allowed: true,
  };
}
