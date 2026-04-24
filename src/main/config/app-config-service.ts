import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { AiProvider, AppConfigFile, FeatureFlags } from '../../shared/types/settings.js';
import { readEnvBoolean, readEnvValue } from './env.js';

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableScheduler: false,
};

const DEFAULT_CONFIG: AppConfigFile = {
  aiProvider: 'anthropic',
  aiModel: 'claude-3-5-sonnet-latest',
  aiBaseUrl: null,
  featureFlags: DEFAULT_FEATURE_FLAGS,
  updatedAt: new Date(0).toISOString(),
};

const require = createRequire(import.meta.url);
const AI_PROVIDERS = new Set<AiProvider>([
  'anthropic',
  'openai',
  'openai-compatible',
  'fal-openrouter',
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
    featureFlags: {
      enableScheduler:
        typeof nextFeatureFlags.enableScheduler === 'boolean'
          ? nextFeatureFlags.enableScheduler
          : DEFAULT_FEATURE_FLAGS.enableScheduler,
    },
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

function applyEnvironmentOverrides(config: AppConfigFile): AppConfigFile {
  const aiProvider = readEnvValue('TASKPLANE_AI_PROVIDER');
  const aiModel = readEnvValue('TASKPLANE_AI_MODEL');
  const aiBaseUrl = readEnvValue('TASKPLANE_AI_BASE_URL');
  const enableScheduler = readEnvBoolean('TASKPLANE_ENABLE_SCHEDULER');

  return sanitizeConfig({
    ...config,
    aiProvider: (aiProvider as AiProvider | null) ?? config.aiProvider,
    aiModel: aiModel ?? config.aiModel,
    aiBaseUrl: aiBaseUrl ?? config.aiBaseUrl,
    featureFlags: {
      ...config.featureFlags,
      enableScheduler: enableScheduler ?? config.featureFlags.enableScheduler,
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
