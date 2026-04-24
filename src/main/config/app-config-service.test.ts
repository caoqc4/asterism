import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../test-utils.js';

const tempRoot = makeTempDir('taskplane-config-test-');

describe('AppConfigService', () => {
  beforeEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(tempRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates the default config when no config file exists', async () => {
    const { AppConfigService, getConfigPath } = await import('./app-config-service.js');
    const service = new AppConfigService(() => tempRoot);

    const config = service.read();

    expect(config.aiProvider).toBe('anthropic');
    expect(config.aiModel).toBe('claude-3-5-sonnet-latest');
    expect(config.featureFlags.enableScheduler).toBe(false);
    expect(fs.existsSync(getConfigPath(() => tempRoot))).toBe(true);
  });

  it('writes and merges non-sensitive config values', async () => {
    const { AppConfigService } = await import('./app-config-service.js');
    const service = new AppConfigService(() => tempRoot);

    service.write({
      aiProvider: 'openai',
      aiModel: 'gpt-4.1',
      featureFlags: {
        enableScheduler: true,
      },
    });

    const config = service.read();

    expect(config.aiProvider).toBe('openai');
    expect(config.aiModel).toBe('gpt-4.1');
    expect(config.featureFlags.enableScheduler).toBe(true);
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
