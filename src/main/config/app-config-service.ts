import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

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

function getUserDataPath(): string {
  const userDataPath = app.getPath('userData');
  fs.mkdirSync(userDataPath, { recursive: true });
  return userDataPath;
}

export function getConfigPath(): string {
  return path.join(getUserDataPath(), 'config.json');
}

function getLegacySettingsPath(): string {
  return path.join(getUserDataPath(), 'settings.json');
}

function sanitizeConfig(input: Partial<AppConfigFile>): AppConfigFile {
  return {
    aiProvider: (input.aiProvider ?? DEFAULT_CONFIG.aiProvider) as AiProvider,
    aiModel: input.aiModel?.trim() || DEFAULT_CONFIG.aiModel,
    featureFlags: {
      ...DEFAULT_FEATURE_FLAGS,
      ...(input.featureFlags ?? {}),
    },
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export class AppConfigService {
  read(): AppConfigFile {
    const configPath = getConfigPath();

    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return sanitizeConfig(JSON.parse(raw) as Partial<AppConfigFile>);
    }

    const legacyPath = getLegacySettingsPath();

    if (fs.existsSync(legacyPath)) {
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
    }

    this.write(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  write(next: Partial<AppConfigFile>): AppConfigFile {
    const merged = sanitizeConfig({
      ...this.safeRead(),
      ...next,
      featureFlags: {
        ...this.safeRead().featureFlags,
        ...(next.featureFlags ?? {}),
      },
      updatedAt: new Date().toISOString(),
    });

    fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  }

  private safeRead(): AppConfigFile {
    try {
      return this.read();
    } catch {
      return DEFAULT_CONFIG;
    }
  }
}
