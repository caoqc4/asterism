import type { RuntimeAiConfig } from '../../keychain/ai-config-service.js';
import { generateRuntimeText } from '../../executors/text-generation.js';
import {
  createCodeAgentModelProducerLoop,
  type CodeAgentPlanTextGenerator,
} from './code-agent-model-producer-loop.js';
import type { CodeAgentSourceContextSnapshot } from './code-agent-source-context.js';
import type { CodeAgentWorkspaceContextSnapshot } from './code-agent-workspace-context.js';
import type {
  LocalContainerSandboxedCodingProducerLoop,
} from './local-container-sandboxed-coding-producer-runner.js';

type CreateCodeAgentModelProducerLoopOptions = {
  retainedContextManifest?: string | null;
  sourceContext?: CodeAgentSourceContextSnapshot | null;
  workspaceContext?: CodeAgentWorkspaceContextSnapshot | null;
};

export type CodeAgentModelProducerRuntime =
  | {
      reason: string;
      status: 'blocked';
      summary: string;
    }
  | {
      createLoop: (options?: CreateCodeAgentModelProducerLoopOptions) => LocalContainerSandboxedCodingProducerLoop;
      model: string;
      provider: RuntimeAiConfig['provider'];
      status: 'ready';
      summary: string;
    };

export async function prepareCodeAgentModelProducerRuntime(params: {
  aiConfigService: {
    resolveRuntimeConfig: () => Promise<RuntimeAiConfig>;
  };
  allowProviderCalls?: boolean;
  generateText?: (config: RuntimeAiConfig, prompt: string) => Promise<string>;
  retainedContextManifest?: string | null;
  sourceContext?: CodeAgentSourceContextSnapshot | null;
  workspaceContext?: CodeAgentWorkspaceContextSnapshot | null;
}): Promise<CodeAgentModelProducerRuntime> {
  if (!params.allowProviderCalls) {
    return blockedRuntime(
      'Code Agent model producer runtime requires an explicit provider-call opt-in.',
    );
  }

  let runtimeConfig: RuntimeAiConfig;
  try {
    runtimeConfig = await params.aiConfigService.resolveRuntimeConfig();
  } catch (error) {
    return blockedRuntime(error instanceof Error
      ? error.message
      : 'Code Agent model producer runtime could not resolve AI config.');
  }

  if (!runtimeConfig.featureFlags.enableSandboxCodingAgent) {
    return blockedRuntime(
      'Code Agent model producer runtime requires enableSandboxCodingAgent=true.',
    );
  }

  const generateText = params.generateText ?? generateRuntimeText;
  const generatePlanText: CodeAgentPlanTextGenerator = async ({ prompt }) =>
    generateText(runtimeConfig, prompt);

  return {
    createLoop: (options = {}) => createCodeAgentModelProducerLoop({
      generatePlanText,
      retainedContextManifest: options.retainedContextManifest ?? params.retainedContextManifest,
      sourceContext: options.sourceContext ?? params.sourceContext,
      workspaceContext: options.workspaceContext ?? params.workspaceContext,
    }),
    model: runtimeConfig.model,
    provider: runtimeConfig.provider,
    status: 'ready',
    summary: [
      'Code Agent model producer runtime ready',
      `provider=${runtimeConfig.provider}`,
      `model=${runtimeConfig.model}`,
      'providerCalls=explicit',
    ].join(' / '),
  };
}

function blockedRuntime(reason: string): CodeAgentModelProducerRuntime {
  return {
    reason,
    status: 'blocked',
    summary: `Code Agent model producer runtime blocked: ${reason}`,
  };
}
