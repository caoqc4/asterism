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
    delete process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER;
    getPasswordMock.mockReset();
    setPasswordMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.TASKPLANE_AI_API_KEY;
    delete process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER;
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
    expect(status.codeAgentModelProducerEnabled).toBe(false);
    expect(status.executorLifecycleAvailability).toMatchObject({
      automaticStartAllowed: false,
      controlMode: 'dry_run_planned',
      modelExposure: 'hidden',
      queueWorkerAllowed: false,
      runtimeAuthority: 'diagnostic_only',
      runtimeReady: false,
      settleMode: 'dry_run_planned',
      status: 'dry_run_available',
      supportedControlRequests: ['heartbeat', 'interrupt', 'cancel'],
      supportedSettleStatuses: ['completed', 'failed', 'paused'],
    });
    expect(status.toolScaffoldSummaries?.find((summary) => summary.family === 'workspace_coding')).toMatchObject({
      implementedCount: 4,
      providerNativeExposedIds: [],
      reservedCount: 1,
      textPromptExposedIds: [],
    });
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
    const workspaceRoot = path.join(tempRoot, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, 'package.json'),
      JSON.stringify({
        scripts: {
          test: 'vitest run',
        },
      }),
      'utf8',
    );
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const appConfigService = new AppConfigService(() => tempRoot);
    appConfigService.write({
      workspaceRoot,
    });
    const service = new AiConfigService(appConfigService);

    const status = await service.setConfig({
      provider: 'openai',
      model: ' gpt-4.1 ',
      providerKeys: {
        openai: '  new-secret  ',
        customBaseUrl: ' https://relay.example.com/v1 ',
      },
      featureFlags: {
        enableScheduler: true,
      },
    });

    expect(setPasswordMock).toHaveBeenCalledWith('taskplane', 'ai_key_openai', 'new-secret');
    expect(status.provider).toBe('openai');
    expect(status.model).toBe('gpt-4.1');
    expect(status.baseUrl).toBe('https://relay.example.com/v1');
    expect(status.workspaceRoot).toBe(workspaceRoot);
    expect(status.apiKeySource).toBe('keychain');
    expect(status.configured).toBe(true);
    expect(status.codeAgentWorkspaceChecks).toEqual({
      lint: {
        available: false,
        reason: 'package.json does not expose npm run lint.',
      },
      test: {
        available: true,
        reason: 'package.json exposes npm run test.',
      },
    });
    expect(status.executorLifecycleAvailability?.summary).toContain('status=dry_run_available');
    expect(status.executorLifecycleAvailability?.summary).toContain('runtimeAuthority=diagnostic_only');
    expect(status.toolScaffoldSummaries?.map((summary) => summary.family)).toEqual([
      'task_domain',
      'workspace_coding',
      'browser_playwright',
      'mcp',
      'skill',
      'computer_use',
      'creator_connector',
    ]);
  });

  it('uses environment API keys without storing them in Keychain', async () => {
    process.env.TASKPLANE_AI_API_KEY = 'env-secret';
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    getPasswordMock.mockResolvedValue(null);
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const appConfigService = new AppConfigService(() => tempRoot);
    appConfigService.write({
      aiProvider: 'fal-openrouter',
      aiModel: 'google/gemini-2.5-flash',
      workspaceRoot: '/tmp/taskplane-workspace',
    });
    const service = new AiConfigService(appConfigService);

    const status = await service.getStatus();
    const runtimeConfig = await service.resolveRuntimeConfig();

    expect(status.configured).toBe(true);
    expect(status.apiKeyStored).toBe(false);
    expect(status.apiKeySource).toBe('env');
    expect(status.codeAgentModelProducerEnabled).toBe(true);
    expect(runtimeConfig.apiKey).toBe('env-secret');
    expect(runtimeConfig.provider).toBe('fal-openrouter');
    expect(runtimeConfig.workspaceRoot).toBe('/tmp/taskplane-workspace');
    expect(setPasswordMock).not.toHaveBeenCalled();
  });

  it('reports Code Agent checks unavailable when workspace package metadata is missing', async () => {
    getPasswordMock.mockResolvedValue(null);
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const appConfigService = new AppConfigService(() => tempRoot);
    appConfigService.write({
      workspaceRoot: path.join(tempRoot, 'missing-workspace'),
    });
    const service = new AiConfigService(appConfigService);

    const status = await service.getStatus();

    expect(status.codeAgentWorkspaceChecks).toEqual({
      lint: {
        available: false,
        reason: 'package.json was not found in the configured workspace root.',
      },
      test: {
        available: false,
        reason: 'package.json was not found in the configured workspace root.',
      },
    });
  });

  it('rejects runtime config resolution when no API key is stored', async () => {
    getPasswordMock.mockResolvedValue(null);
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const service = new AiConfigService(new AppConfigService(() => tempRoot));

    await expect(service.resolveRuntimeConfig()).rejects.toThrow(
      'AI API Key is not configured. Please add a key in Settings.',
    );
  });
});
