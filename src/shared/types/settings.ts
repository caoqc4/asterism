export type AiProvider = 'anthropic' | 'openai';

export type FeatureFlags = {
  enableScheduler: boolean;
};

export type AppConfigFile = {
  aiProvider: AiProvider;
  aiModel: string;
  featureFlags: FeatureFlags;
  updatedAt: string;
};

export type AiConfigInput = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  featureFlags: FeatureFlags;
};

export type AiConfigStatus = {
  configured: boolean;
  apiKeyStored: boolean;
  provider: AiProvider | null;
  model: string | null;
  updatedAt: string | null;
  configPath: string | null;
  featureFlags: FeatureFlags;
};
