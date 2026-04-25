import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../test-utils.js';

const tempRoot = makeTempDir('taskplane-config-test-');
const envKeys = [
  'TASKPLANE_AI_PROVIDER',
  'TASKPLANE_AI_MODEL',
  'TASKPLANE_AI_BASE_URL',
  'TASKPLANE_WORKSPACE_ROOT',
  'TASKPLANE_ENABLE_SCHEDULER',
  'TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS',
];

describe('AppConfigService', () => {
  beforeEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(tempRoot, { recursive: true });
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  it('creates the default config when no config file exists', async () => {
    const { AppConfigService, getConfigPath } = await import('./app-config-service.js');
    const service = new AppConfigService(() => tempRoot);

    const config = service.read();

    expect(config.aiProvider).toBe('anthropic');
    expect(config.aiModel).toBe('claude-3-5-sonnet-latest');
    expect(config.aiBaseUrl).toBeNull();
    expect(config.workspaceRoot).toBeNull();
    expect(config.featureFlags.enableScheduler).toBe(false);
    expect(config.featureFlags.enableProviderNativeToolCalls).toBe(false);
    expect(fs.existsSync(getConfigPath(() => tempRoot))).toBe(true);
  });

  it('uses TASKPLANE_USER_DATA_DIR for the default config path resolver', async () => {
    const { getConfigPath } = await import('./app-config-service.js');
    process.env.TASKPLANE_USER_DATA_DIR = tempRoot;

    try {
      expect(getConfigPath()).toBe(path.join(tempRoot, 'config.json'));
    } finally {
      delete process.env.TASKPLANE_USER_DATA_DIR;
    }
  });

  it('writes and merges non-sensitive config values', async () => {
    const { AppConfigService } = await import('./app-config-service.js');
    const service = new AppConfigService(() => tempRoot);

    service.write({
      aiProvider: 'openai',
      aiModel: 'gpt-4.1',
      aiBaseUrl: ' https://relay.example.com/v1 ',
      workspaceRoot: ' /Users/example/project ',
      featureFlags: {
        enableScheduler: true,
        enableProviderNativeToolCalls: true,
      },
    });

    const config = service.read();

    expect(config.aiProvider).toBe('openai');
    expect(config.aiModel).toBe('gpt-4.1');
    expect(config.aiBaseUrl).toBe('https://relay.example.com/v1');
    expect(config.workspaceRoot).toBe('/Users/example/project');
    expect(config.featureFlags.enableScheduler).toBe(true);
    expect(config.featureFlags.enableProviderNativeToolCalls).toBe(true);
  });

  it('falls back to the default provider when config contains an unknown provider', async () => {
    const { AppConfigService, getConfigPath } = await import('./app-config-service.js');
    fs.writeFileSync(
      getConfigPath(() => tempRoot),
      JSON.stringify({
        aiProvider: 'unknown-provider',
        aiModel: 'custom-model',
        featureFlags: {
          enableScheduler: true,
        },
      }),
      'utf8',
    );

    const service = new AppConfigService(() => tempRoot);
    const config = service.read();

    expect(config.aiProvider).toBe('anthropic');
    expect(config.aiModel).toBe('custom-model');
    expect(config.featureFlags.enableScheduler).toBe(true);
  });

  it('overrides non-sensitive config values from environment variables', async () => {
    process.env.TASKPLANE_AI_PROVIDER = 'openai-compatible';
    process.env.TASKPLANE_AI_MODEL = 'relay-model';
    process.env.TASKPLANE_AI_BASE_URL = 'https://relay.example.com/v1';
    process.env.TASKPLANE_WORKSPACE_ROOT = '/tmp/taskplane-workspace';
    process.env.TASKPLANE_ENABLE_SCHEDULER = 'true';
    process.env.TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS = 'true';
    const { AppConfigService } = await import('./app-config-service.js');
    const service = new AppConfigService(() => tempRoot);

    service.write({
      aiProvider: 'anthropic',
      aiModel: 'claude-3-5-sonnet-latest',
      aiBaseUrl: null,
      featureFlags: {
        enableScheduler: false,
        enableProviderNativeToolCalls: false,
      },
    });

    const config = service.read();

    expect(config.aiProvider).toBe('openai-compatible');
    expect(config.aiModel).toBe('relay-model');
    expect(config.aiBaseUrl).toBe('https://relay.example.com/v1');
    expect(config.workspaceRoot).toBe('/tmp/taskplane-workspace');
    expect(config.featureFlags.enableScheduler).toBe(true);
    expect(config.featureFlags.enableProviderNativeToolCalls).toBe(true);
  });

  it('falls back to default feature flags when stored flags have invalid values', async () => {
    const { AppConfigService, getConfigPath } = await import('./app-config-service.js');
    fs.writeFileSync(
      getConfigPath(() => tempRoot),
      JSON.stringify({
        aiProvider: 'openai',
        aiModel: 'gpt-4.1',
        featureFlags: {
          enableScheduler: 'yes',
          enableProviderNativeToolCalls: 'yes',
        },
      }),
      'utf8',
    );

    const service = new AppConfigService(() => tempRoot);
    const config = service.read();

    expect(config.aiProvider).toBe('openai');
    expect(config.featureFlags.enableScheduler).toBe(false);
    expect(config.featureFlags.enableProviderNativeToolCalls).toBe(false);
  });

  it('migrates legacy settings.json into config.json', async () => {
    const { AppConfigService, getConfigPath } = await import('./app-config-service.js');
    const legacyPath = path.join(tempRoot, 'settings.json');

    fs.writeFileSync(
      legacyPath,
      JSON.stringify(
        {
          provider: 'openai',
          model: 'gpt-4.1-mini',
          baseUrl: 'https://legacy-relay.example.com/v1',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        null,
        2,
      ),
      'utf8',
    );

    const service = new AppConfigService(() => tempRoot);
    const migrated = service.read();
    const saved = JSON.parse(fs.readFileSync(getConfigPath(() => tempRoot), 'utf8')) as {
      aiProvider: string;
      aiModel: string;
    };

    expect(migrated.aiProvider).toBe('openai');
    expect(migrated.aiModel).toBe('gpt-4.1-mini');
    expect(migrated.aiBaseUrl).toBe('https://legacy-relay.example.com/v1');
    expect(saved.aiProvider).toBe('openai');
    expect(saved.aiModel).toBe('gpt-4.1-mini');
  });

  it('falls back to default config when legacy settings are corrupt', async () => {
    const { AppConfigService, getConfigPath } = await import('./app-config-service.js');
    const legacyPath = path.join(tempRoot, 'settings.json');
    fs.writeFileSync(legacyPath, '{bad json', 'utf8');

    const service = new AppConfigService(() => tempRoot);
    const config = service.read();

    expect(config.aiProvider).toBe('anthropic');
    expect(config.aiModel).toBe('claude-3-5-sonnet-latest');
    expect(fs.existsSync(getConfigPath(() => tempRoot))).toBe(true);
  });
});
