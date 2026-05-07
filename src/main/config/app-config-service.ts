import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { AiProvider, AppConfigFile, FeatureFlags } from '../../shared/types/settings.js';
import {
  AI_COMMUNICATION_STYLES,
  AI_CONFIRMATION_THRESHOLDS,
  CONTEXT_COMPRESSION_THRESHOLD,
  DEFAULT_FEATURE_FLAGS,
  SELF_CHECK_RETRY_LIMIT,
} from '../../shared/settings-defaults.js';
import { readEnvBoolean, readEnvValue } from './env.js';

const DEFAULT_CONFIG: AppConfigFile = {
  aiProvider: 'anthropic',
  aiModel: 'claude-3-5-sonnet-latest',
  aiBaseUrl: null,
  workspaceRoot: null,
  featureFlags: DEFAULT_FEATURE_FLAGS,
  updatedAt: new Date(0).toISOString(),
};

const require = createRequire(import.meta.url);
const AI_PROVIDERS = new Set<AiProvider>([
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'groq',
  'fal-openrouter',
  'openai-compatible',
  'replicate',
]);

function defaultUserDataPathResolver(): string {
  if (process.env.TASKPLANE_USER_DATA_DIR) {
    return process.env.TASKPLANE_USER_DATA_DIR;
  }

  const electron = require('electron') as typeof import('electron');
  return electron.app.getPath('userData');
}

function ensureUserDataPath(userDataPath: string): string {
  fs.mkdirSync(userDataPath, { recursive: true });
  return userDataPath;
}

function getUserDataPath(userDataPathResolver: () => string): string {
  const userDataPath = userDataPathResolver();
  return ensureUserDataPath(userDataPath);
}

export function getConfigPath(userDataPathResolver: () => string = defaultUserDataPathResolver): string {
  return path.join(getUserDataPath(userDataPathResolver), 'config.json');
}

function getLegacySettingsPath(userDataPathResolver: () => string = defaultUserDataPathResolver): string {
  return path.join(getUserDataPath(userDataPathResolver), 'settings.json');
}

function sanitizeConfig(input: Partial<AppConfigFile>): AppConfigFile {
  const nextFeatureFlags: Partial<FeatureFlags> = input.featureFlags ?? {};

  return {
    aiProvider: AI_PROVIDERS.has(input.aiProvider as AiProvider)
      ? (input.aiProvider as AiProvider)
      : DEFAULT_CONFIG.aiProvider,
    aiModel: input.aiModel?.trim() || DEFAULT_CONFIG.aiModel,
    aiBaseUrl: input.aiBaseUrl?.trim() || null,
    workspaceRoot: input.workspaceRoot?.trim() || null,
    featureFlags: {
      enableScheduler:
        typeof nextFeatureFlags.enableScheduler === 'boolean'
          ? nextFeatureFlags.enableScheduler
          : DEFAULT_FEATURE_FLAGS.enableScheduler,
      enableProviderNativeToolCalls:
        typeof nextFeatureFlags.enableProviderNativeToolCalls === 'boolean'
          ? nextFeatureFlags.enableProviderNativeToolCalls
          : DEFAULT_FEATURE_FLAGS.enableProviderNativeToolCalls,
      enableSandboxCodingAgent:
        typeof nextFeatureFlags.enableSandboxCodingAgent === 'boolean'
          ? nextFeatureFlags.enableSandboxCodingAgent
          : DEFAULT_FEATURE_FLAGS.enableSandboxCodingAgent,
      enableSandboxPatchPromotionApply:
        typeof nextFeatureFlags.enableSandboxPatchPromotionApply === 'boolean'
          ? nextFeatureFlags.enableSandboxPatchPromotionApply
          : DEFAULT_FEATURE_FLAGS.enableSandboxPatchPromotionApply,
      enableSelfCheck:
        typeof nextFeatureFlags.enableSelfCheck === 'boolean'
          ? nextFeatureFlags.enableSelfCheck
          : DEFAULT_FEATURE_FLAGS.enableSelfCheck,
      enableSelfLearn:
        typeof nextFeatureFlags.enableSelfLearn === 'boolean'
          ? nextFeatureFlags.enableSelfLearn
          : DEFAULT_FEATURE_FLAGS.enableSelfLearn,
      contextCompressionThreshold:
        typeof nextFeatureFlags.contextCompressionThreshold === 'number'
          && Number.isFinite(nextFeatureFlags.contextCompressionThreshold)
          && nextFeatureFlags.contextCompressionThreshold >= CONTEXT_COMPRESSION_THRESHOLD.min
          && nextFeatureFlags.contextCompressionThreshold <= CONTEXT_COMPRESSION_THRESHOLD.max
          ? nextFeatureFlags.contextCompressionThreshold
          : DEFAULT_FEATURE_FLAGS.contextCompressionThreshold,
      selfCheckRetryLimit:
        typeof nextFeatureFlags.selfCheckRetryLimit === 'number'
          && Number.isFinite(nextFeatureFlags.selfCheckRetryLimit)
          && nextFeatureFlags.selfCheckRetryLimit >= SELF_CHECK_RETRY_LIMIT.min
          && nextFeatureFlags.selfCheckRetryLimit <= SELF_CHECK_RETRY_LIMIT.max
          ? nextFeatureFlags.selfCheckRetryLimit
          : DEFAULT_FEATURE_FLAGS.selfCheckRetryLimit,
      communicationStyle:
        AI_COMMUNICATION_STYLES.includes(nextFeatureFlags.communicationStyle as never)
          ? nextFeatureFlags.communicationStyle
          : DEFAULT_FEATURE_FLAGS.communicationStyle,
      confirmationThreshold:
        AI_CONFIRMATION_THRESHOLDS.includes(nextFeatureFlags.confirmationThreshold as never)
          ? nextFeatureFlags.confirmationThreshold
          : DEFAULT_FEATURE_FLAGS.confirmationThreshold,
    },
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

function applyEnvironmentOverrides(config: AppConfigFile): AppConfigFile {
  const aiProvider = readEnvValue('TASKPLANE_AI_PROVIDER');
  const aiModel = readEnvValue('TASKPLANE_AI_MODEL');
  const aiBaseUrl = readEnvValue('TASKPLANE_AI_BASE_URL');
  const workspaceRoot = readEnvValue('TASKPLANE_WORKSPACE_ROOT');
  const enableScheduler = readEnvBoolean('TASKPLANE_ENABLE_SCHEDULER');
  const enableProviderNativeToolCalls = readEnvBoolean('TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS');
  const enableSandboxCodingAgent = readEnvBoolean('TASKPLANE_ENABLE_SANDBOX_CODING_AGENT');
  const enableSandboxPatchPromotionApply = readEnvBoolean('TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY');
  const enableSelfCheck = readEnvBoolean('TASKPLANE_ENABLE_SELF_CHECK');
  const enableSelfLearn = readEnvBoolean('TASKPLANE_ENABLE_SELF_LEARN');
  const contextCompressionThresholdRaw = readEnvValue('TASKPLANE_CONTEXT_COMPRESSION_THRESHOLD');
  const selfCheckRetryLimitRaw = readEnvValue('TASKPLANE_SELF_CHECK_RETRY_LIMIT');
  const contextCompressionThreshold = contextCompressionThresholdRaw
    ? Number(contextCompressionThresholdRaw)
    : undefined;
  const selfCheckRetryLimit = selfCheckRetryLimitRaw
    ? Number(selfCheckRetryLimitRaw)
    : undefined;
  const safeContextCompressionThreshold = Number.isFinite(contextCompressionThreshold)
    ? contextCompressionThreshold
    : undefined;
  const safeSelfCheckRetryLimit = Number.isFinite(selfCheckRetryLimit)
    ? selfCheckRetryLimit
    : undefined;

  return sanitizeConfig({
    ...config,
    aiProvider: (aiProvider as AiProvider | null) ?? config.aiProvider,
    aiModel: aiModel ?? config.aiModel,
    aiBaseUrl: aiBaseUrl ?? config.aiBaseUrl,
    workspaceRoot: workspaceRoot ?? config.workspaceRoot,
    featureFlags: {
      ...config.featureFlags,
      enableScheduler: enableScheduler ?? config.featureFlags.enableScheduler,
      enableProviderNativeToolCalls:
        enableProviderNativeToolCalls
        ?? config.featureFlags.enableProviderNativeToolCalls
        ?? DEFAULT_FEATURE_FLAGS.enableProviderNativeToolCalls,
      enableSandboxCodingAgent:
        enableSandboxCodingAgent
        ?? config.featureFlags.enableSandboxCodingAgent
        ?? DEFAULT_FEATURE_FLAGS.enableSandboxCodingAgent,
      enableSandboxPatchPromotionApply:
        enableSandboxPatchPromotionApply
        ?? config.featureFlags.enableSandboxPatchPromotionApply
        ?? DEFAULT_FEATURE_FLAGS.enableSandboxPatchPromotionApply,
      enableSelfCheck:
        enableSelfCheck
        ?? config.featureFlags.enableSelfCheck
        ?? DEFAULT_FEATURE_FLAGS.enableSelfCheck,
      enableSelfLearn:
        enableSelfLearn
        ?? config.featureFlags.enableSelfLearn
        ?? DEFAULT_FEATURE_FLAGS.enableSelfLearn,
      contextCompressionThreshold:
        safeContextCompressionThreshold !== undefined
          ? safeContextCompressionThreshold
          : config.featureFlags.contextCompressionThreshold
            ?? DEFAULT_FEATURE_FLAGS.contextCompressionThreshold,
      selfCheckRetryLimit:
        safeSelfCheckRetryLimit !== undefined
          ? safeSelfCheckRetryLimit
          : config.featureFlags.selfCheckRetryLimit
            ?? DEFAULT_FEATURE_FLAGS.selfCheckRetryLimit,
    },
  });
}

export class AppConfigService {
  constructor(private readonly userDataPathResolver: () => string = defaultUserDataPathResolver) {}

  getConfigPath(): string {
    return getConfigPath(this.userDataPathResolver);
  }

  read(): AppConfigFile {
    const configPath = this.getConfigPath();

    const current = this.readExistingConfig();

    if (current) {
      return applyEnvironmentOverrides(current);
    }

    const legacyPath = getLegacySettingsPath(this.userDataPathResolver);

    if (fs.existsSync(legacyPath)) {
      try {
        const raw = fs.readFileSync(legacyPath, 'utf8');
        const legacy = JSON.parse(raw) as {
          provider?: AiProvider;
          model?: string;
          baseUrl?: string;
          updatedAt?: string;
        };
        const migrated = sanitizeConfig({
          aiProvider: legacy.provider,
          aiModel: legacy.model,
          aiBaseUrl: legacy.baseUrl,
          updatedAt: legacy.updatedAt,
        });
        this.write(migrated);
        return applyEnvironmentOverrides(migrated);
      } catch {
        // Ignore corrupt legacy config and recreate the supported config file below.
      }
    }

    const initial = sanitizeConfig(DEFAULT_CONFIG);
    fs.writeFileSync(configPath, JSON.stringify(initial, null, 2), 'utf8');
    return applyEnvironmentOverrides(initial);
  }

  write(next: Partial<AppConfigFile>): AppConfigFile {
    const current = this.readExistingConfig() ?? sanitizeConfig(DEFAULT_CONFIG);
    const merged = sanitizeConfig({
      ...current,
      ...next,
      featureFlags: {
        ...current.featureFlags,
        ...(next.featureFlags ?? {}),
      },
      updatedAt: new Date().toISOString(),
    });

    fs.writeFileSync(this.getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  }

  private readExistingConfig(): AppConfigFile | null {
    const configPath = this.getConfigPath();

    try {
      if (!fs.existsSync(configPath)) {
        return null;
      }

      const raw = fs.readFileSync(configPath, 'utf8');
      return sanitizeConfig(JSON.parse(raw) as Partial<AppConfigFile>);
    } catch {
      return null;
    }
  }
}
