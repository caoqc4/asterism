import type { AiConfigStatus, AiProvider } from './types/settings.js';

export type ProviderTextPlanningPath =
  | 'unconfigured'
  | 'local_text_executor'
  | 'replicate_native_text';

export type ProviderStructuredToolCallState =
  | 'unconfigured'
  | 'disabled_until_flag_enabled'
  | 'safe_read_tools_available'
  | 'unavailable_on_replicate_text_path';

export type ProviderExecutionCapabilities = {
  provider: AiProvider | null;
  model: string | null;
  textPlanningPath: ProviderTextPlanningPath;
  structuredToolCallState: ProviderStructuredToolCallState;
  providerNativeToolCallFlagEnabled: boolean;
  taskplaneStructuredToolCallsEnabled: boolean;
};

export function getProviderExecutionCapabilities(
  aiStatus: AiConfigStatus | null,
): ProviderExecutionCapabilities {
  if (!aiStatus?.configured || !aiStatus.provider || !aiStatus.model) {
    return {
      provider: aiStatus?.provider ?? null,
      model: aiStatus?.model ?? null,
      textPlanningPath: 'unconfigured',
      structuredToolCallState: 'unconfigured',
      providerNativeToolCallFlagEnabled: Boolean(
        aiStatus?.featureFlags.enableProviderNativeToolCalls,
      ),
      taskplaneStructuredToolCallsEnabled: false,
    };
  }

  if (aiStatus.provider === 'replicate') {
    return {
      provider: aiStatus.provider,
      model: aiStatus.model,
      textPlanningPath: 'replicate_native_text',
      structuredToolCallState: 'unavailable_on_replicate_text_path',
      providerNativeToolCallFlagEnabled: Boolean(
        aiStatus.featureFlags.enableProviderNativeToolCalls,
      ),
      taskplaneStructuredToolCallsEnabled: false,
    };
  }

  return {
    provider: aiStatus.provider,
    model: aiStatus.model,
    textPlanningPath: 'local_text_executor',
    providerNativeToolCallFlagEnabled: Boolean(
      aiStatus.featureFlags.enableProviderNativeToolCalls,
    ),
    structuredToolCallState: aiStatus.featureFlags.enableProviderNativeToolCalls
      ? 'safe_read_tools_available'
      : 'disabled_until_flag_enabled',
    taskplaneStructuredToolCallsEnabled: Boolean(
      aiStatus.featureFlags.enableProviderNativeToolCalls,
    ),
  };
}
