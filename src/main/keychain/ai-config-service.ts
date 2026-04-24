import keytar from 'keytar';

import type { AiConfigInput, AiConfigStatus, AiProvider, FeatureFlags } from '../../shared/types/settings.js';
import { AppConfigService } from '../config/app-config-service.js';
import { readEnvValue } from '../config/env.js';

const SERVICE_NAME = 'taskplane';
const LEGACY_SERVICE_NAME = 'supersecretary';
const ACCOUNT_NAME = 'ai_api_key';

export type RuntimeAiConfig = {
  provider: AiProvider;
  model: string;
  baseUrl?: string | null;
  apiKey: string;
  featureFlags: FeatureFlags;
};

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
      provider: config.aiProvider,
      model: config.aiModel,
      baseUrl: config.aiBaseUrl,
      updatedAt: config.updatedAt,
      configPath: this.appConfigService.getConfigPath(),
      featureFlags: config.featureFlags,
    };
  }

  async setConfig(input: AiConfigInput): Promise<AiConfigStatus> {
    const config = this.appConfigService.write({
      aiProvider: input.provider,
      aiModel: input.model.trim(),
      aiBaseUrl: input.baseUrl?.trim() || null,
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
      provider: config.aiProvider,
      model: config.aiModel,
      baseUrl: config.aiBaseUrl,
      updatedAt: config.updatedAt,
      configPath: this.appConfigService.getConfigPath(),
      featureFlags: config.featureFlags,
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
      apiKey,
      featureFlags: config.featureFlags,
    };
  }
}
