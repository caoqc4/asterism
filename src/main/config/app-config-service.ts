import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { AiProvider, AppConfigFile, FeatureFlags } from '../../shared/types/settings.js';

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableScheduler: false,
};

const DEFAULT_CONFIG: AppConfigFile = {
  aiProvider: 'anthropic',
  aiModel: 'claude-3-5-sonnet-latest',
  featureFlags: DEFAULT_FEATURE_FLAGS,
  updatedAt: new Date(0).toISOString(),
};

const require = createRequire(import.meta.url);
const AI_PROVIDERS = new Set<AiProvider>(['anthropic', 'openai']);

function defaultUserDataPathResolver(): string {
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
  return {
    aiProvider: AI_PROVIDERS.has(input.aiProvider as AiProvider)
      ? (input.aiProvider as AiProvider)
      : DEFAULT_CONFIG.aiProvider,
    aiModel: input.aiModel?.trim() || DEFAULT_CONFIG.aiModel,
    featureFlags: {
      ...DEFAULT_FEATURE_FLAGS,
      ...(input.featureFlags ?? {}),
    },
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export class AppConfigService {
  constructor(private readonly userDataPathResolver: () => string = defaultUserDataPathResolver) {}

  read(): AppConfigFile {
    const configPath = getConfigPath(this.userDataPathResolver);

    const current = this.readExistingConfig();

    if (current) {
      return current;
    }

    const legacyPath = getLegacySettingsPath(this.userDataPathResolver);

    if (fs.existsSync(legacyPath)) {
      try {
        const raw = fs.readFileSync(legacyPath, 'utf8');
        const legacy = JSON.parse(raw) as {
          provider?: AiProvider;
          model?: string;
          updatedAt?: string;
        };
        const migrated = sanitizeConfig({
          aiProvider: legacy.provider,
          aiModel: legacy.model,
          updatedAt: legacy.updatedAt,
        });
        this.write(migrated);
        return migrated;
      } catch {
        // Ignore corrupt legacy config and recreate the supported config file below.
      }
    }

    const initial = sanitizeConfig(DEFAULT_CONFIG);
    fs.writeFileSync(configPath, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
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

    fs.writeFileSync(getConfigPath(this.userDataPathResolver), JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  }

  private readExistingConfig(): AppConfigFile | null {
    const configPath = getConfigPath(this.userDataPathResolver);

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
