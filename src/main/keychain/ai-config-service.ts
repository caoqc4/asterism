import fs from 'node:fs';
import path from 'node:path';

import keytar from 'keytar';

import type { AiConfigInput, AiConfigStatus, AiProvider, FeatureFlags } from '../../shared/types/settings.js';
import { buildAgentSandboxBackendStatus } from '../../shared/agent-sandbox-provider.js';
import { summarizeAgentToolScaffoldFamilies } from '../../shared/agent-tool-scaffold.js';
import { AppConfigService } from '../config/app-config-service.js';
import { readEnvBoolean, readEnvValue } from '../config/env.js';

const SERVICE_NAME = 'taskplane';
const LEGACY_SERVICE_NAME = 'supersecretary';
const ACCOUNT_NAME = 'ai_api_key';
const DEFAULT_TOOL_SCAFFOLD_POLICY = {
  allowLocalWorkspaceRead: false,
  allowTaskMutationTools: false,
};
const ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV = 'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER';
const CODE_AGENT_CHECK_SCRIPTS = ['test', 'lint'] as const;

export type RuntimeAiConfig = {
  provider: AiProvider;
  model: string;
  baseUrl?: string | null;
  workspaceRoot?: string | null;
  apiKey: string;
  featureFlags: FeatureFlags;
};

function detectCodeAgentWorkspaceChecks(
  workspaceRoot: string | null,
): NonNullable<AiConfigStatus['codeAgentWorkspaceChecks']> {
  const unavailable = (reason: string) => ({
    lint: {
      available: false,
      reason,
    },
    test: {
      available: false,
      reason,
    },
  });

  if (!workspaceRoot?.trim()) {
    return unavailable('workspace root is not configured.');
  }

  const packageJsonPath = path.join(workspaceRoot, 'package.json');

  try {
    if (!fs.existsSync(packageJsonPath)) {
      return unavailable('package.json was not found in the configured workspace root.');
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, unknown>;
    };
    const scripts = packageJson.scripts && typeof packageJson.scripts === 'object'
      ? packageJson.scripts
      : {};

    return Object.fromEntries(CODE_AGENT_CHECK_SCRIPTS.map((script) => {
      const value = scripts[script];
      const available = typeof value === 'string' && Boolean(value.trim());

      return [
        script,
        {
          available,
          reason: available
            ? `package.json exposes npm run ${script}.`
            : `package.json does not expose npm run ${script}.`,
        },
      ];
    })) as NonNullable<AiConfigStatus['codeAgentWorkspaceChecks']>;
  } catch {
    return unavailable('package.json could not be read or parsed.');
  }
}

export class AiConfigService {
  constructor(private readonly appConfigService: AppConfigService) {}

  private async getStoredApiKey(): Promise<string | null> {
    const current = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);

    if (current) {
      return current;
    }

    const legacy = await keytar.getPassword(LEGACY_SERVICE_NAME, ACCOUNT_NAME);

    if (legacy) {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, legacy);
      return legacy;
    }

    return null;
  }

  async getStatus(): Promise<AiConfigStatus> {
    const config = this.appConfigService.read();
    const envApiKey = readEnvValue('TASKPLANE_AI_API_KEY');
    const storedApiKey = await this.getStoredApiKey();
    const apiKey = envApiKey ?? storedApiKey;

    return {
      configured: Boolean(apiKey),
      apiKeyStored: Boolean(storedApiKey),
      apiKeySource: envApiKey ? 'env' : storedApiKey ? 'keychain' : null,
      codeAgentWorkspaceChecks: detectCodeAgentWorkspaceChecks(config.workspaceRoot),
      codeAgentModelProducerEnabled: readEnvBoolean(ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV) === true,
      provider: config.aiProvider,
      model: config.aiModel,
      baseUrl: config.aiBaseUrl,
      workspaceRoot: config.workspaceRoot,
      updatedAt: config.updatedAt,
      configPath: this.appConfigService.getConfigPath(),
      featureFlags: config.featureFlags,
      sandboxBackendStatus: buildAgentSandboxBackendStatus(null),
      toolScaffoldSummaries: summarizeAgentToolScaffoldFamilies({
        policy: DEFAULT_TOOL_SCAFFOLD_POLICY,
      }),
    };
  }

  async setConfig(input: AiConfigInput): Promise<AiConfigStatus> {
    const config = this.appConfigService.write({
      aiProvider: input.provider,
      aiModel: input.model.trim(),
      aiBaseUrl: input.baseUrl?.trim() || null,
      workspaceRoot: input.workspaceRoot?.trim() || null,
      featureFlags: input.featureFlags,
    });

    if (input.apiKey.trim()) {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, input.apiKey.trim());
    }

    const envApiKey = readEnvValue('TASKPLANE_AI_API_KEY');
    const storedApiKey = await this.getStoredApiKey();
    const apiKey = envApiKey ?? storedApiKey;

    return {
      configured: Boolean(apiKey),
      apiKeyStored: Boolean(storedApiKey),
      apiKeySource: envApiKey ? 'env' : storedApiKey ? 'keychain' : null,
      codeAgentWorkspaceChecks: detectCodeAgentWorkspaceChecks(config.workspaceRoot),
      codeAgentModelProducerEnabled: readEnvBoolean(ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV) === true,
      provider: config.aiProvider,
      model: config.aiModel,
      baseUrl: config.aiBaseUrl,
      workspaceRoot: config.workspaceRoot,
      updatedAt: config.updatedAt,
      configPath: this.appConfigService.getConfigPath(),
      featureFlags: config.featureFlags,
      sandboxBackendStatus: buildAgentSandboxBackendStatus(null),
      toolScaffoldSummaries: summarizeAgentToolScaffoldFamilies({
        policy: DEFAULT_TOOL_SCAFFOLD_POLICY,
      }),
    };
  }

  async resolveRuntimeConfig(): Promise<RuntimeAiConfig> {
    const config = this.appConfigService.read();
    const apiKey = readEnvValue('TASKPLANE_AI_API_KEY') ?? (await this.getStoredApiKey());

    if (!apiKey) {
      throw new Error('AI API Key is not configured in system Keychain.');
    }

    return {
      provider: config.aiProvider,
      model: config.aiModel,
      baseUrl: config.aiBaseUrl,
      workspaceRoot: config.workspaceRoot,
      apiKey,
      featureFlags: config.featureFlags,
    };
  }
}
