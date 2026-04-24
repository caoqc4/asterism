export type AiProvider = 'anthropic' | 'openai' | 'openai-compatible' | 'fal-openrouter';

export type FeatureFlags = {
  enableScheduler: boolean;
};

export type AppConfigFile = {
  aiProvider: AiProvider;
  aiModel: string;
  aiBaseUrl: string | null;
  featureFlags: FeatureFlags;
  updatedAt: string;
};

export type AiConfigInput = {
  provider: AiProvider;
  model: string;
  baseUrl?: string;
  apiKey: string;
  featureFlags: FeatureFlags;
};

export type AiConfigStatus = {
  configured: boolean;
  apiKeyStored: boolean;
  provider: AiProvider | null;
  model: string | null;
  baseUrl: string | null;
  updatedAt: string | null;
  configPath: string | null;
  featureFlags: FeatureFlags;
};
