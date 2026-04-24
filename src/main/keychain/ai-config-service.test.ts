import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTempDir } from '../test-utils.js';

const getPasswordMock = vi.fn();
const setPasswordMock = vi.fn();

vi.mock('keytar', () => ({
  default: {
    getPassword: getPasswordMock,
    setPassword: setPasswordMock,
  },
}));

describe('AiConfigService', () => {
  const tempRoot = makeTempDir('taskplane-ai-config-test-');

  beforeEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(tempRoot, { recursive: true });
    delete process.env.TASKPLANE_AI_API_KEY;
    getPasswordMock.mockReset();
    setPasswordMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.TASKPLANE_AI_API_KEY;
  });

  it('returns the injected config path in status responses', async () => {
    getPasswordMock.mockResolvedValue(null);
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const appConfigService = new AppConfigService(() => tempRoot);
    const service = new AiConfigService(appConfigService);

    const status = await service.getStatus();

    expect(status.configPath).toBe(path.join(tempRoot, 'config.json'));
    expect(status.provider).toBe('anthropic');
    expect(status.apiKeyStored).toBe(false);
  });

  it('migrates legacy keychain passwords into the current service name', async () => {
    getPasswordMock.mockImplementation(async (serviceName: string) =>
      serviceName === 'supersecretary' ? 'legacy-secret' : null,
    );
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const service = new AiConfigService(new AppConfigService(() => tempRoot));

    const status = await service.getStatus();

    expect(status.apiKeyStored).toBe(true);
    expect(setPasswordMock).toHaveBeenCalledWith('taskplane', 'ai_api_key', 'legacy-secret');
  });

  it('trims and stores new API keys when settings are saved', async () => {
    getPasswordMock.mockResolvedValue('new-secret');
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const service = new AiConfigService(new AppConfigService(() => tempRoot));

    const status = await service.setConfig({
      provider: 'openai',
      model: ' gpt-4.1 ',
      baseUrl: ' https://relay.example.com/v1 ',
      apiKey: '  new-secret  ',
      featureFlags: {
        enableScheduler: true,
      },
    });

    expect(setPasswordMock).toHaveBeenCalledWith('taskplane', 'ai_api_key', 'new-secret');
    expect(status.provider).toBe('openai');
    expect(status.model).toBe('gpt-4.1');
    expect(status.baseUrl).toBe('https://relay.example.com/v1');
    expect(status.apiKeySource).toBe('keychain');
    expect(status.configured).toBe(true);
  });

  it('uses environment API keys without storing them in Keychain', async () => {
    process.env.TASKPLANE_AI_API_KEY = 'env-secret';
    getPasswordMock.mockResolvedValue(null);
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const appConfigService = new AppConfigService(() => tempRoot);
    appConfigService.write({
      aiProvider: 'fal-openrouter',
      aiModel: 'google/gemini-2.5-flash',
    });
    const service = new AiConfigService(appConfigService);

    const status = await service.getStatus();
    const runtimeConfig = await service.resolveRuntimeConfig();

    expect(status.configured).toBe(true);
    expect(status.apiKeyStored).toBe(false);
    expect(status.apiKeySource).toBe('env');
    expect(runtimeConfig.apiKey).toBe('env-secret');
    expect(runtimeConfig.provider).toBe('fal-openrouter');
    expect(setPasswordMock).not.toHaveBeenCalled();
  });

  it('rejects runtime config resolution when no API key is stored', async () => {
    getPasswordMock.mockResolvedValue(null);
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const service = new AiConfigService(new AppConfigService(() => tempRoot));

    await expect(service.resolveRuntimeConfig()).rejects.toThrow(
      'AI API Key is not configured in system Keychain.',
    );
  });
});
