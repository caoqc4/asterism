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
    delete process.env.TASKPLANE_CAPABILITY_PRODUCT_SURFACE_FIXTURE_JSON;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_FIXTURE_JSON;
    delete process.env.TASKPLANE_AGENT_CLI_RUNTIME_FIXTURE_JSON;
    delete process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER;
    process.env.TASKPLANE_AGENT_CLI_RUNTIME_FIXTURE_JSON = JSON.stringify({
      updatedAt: '2026-05-19T00:00:00.000Z',
      runtimes: [
        {
          id: 'codex',
          label: 'Codex CLI',
          command: 'codex',
          installed: false,
          version: null,
          authState: 'unknown',
          executionSupport: 'manual_run',
          workload: 'blocked',
          missingReason: 'codex was not found on PATH.',
        },
        {
          id: 'claude',
          label: 'Claude Code',
          command: 'claude',
          installed: false,
          version: null,
          authState: 'unknown',
          executionSupport: 'manual_run',
          workload: 'blocked',
          missingReason: 'claude was not found on PATH.',
        },
      ],
    });
    getPasswordMock.mockReset();
    setPasswordMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.TASKPLANE_AI_API_KEY;
    delete process.env.TASKPLANE_CAPABILITY_PRODUCT_SURFACE_FIXTURE_JSON;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_FIXTURE_JSON;
    delete process.env.TASKPLANE_AGENT_CLI_RUNTIME_FIXTURE_JSON;
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
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'model.provider')).toMatchObject({
      status: 'unconfigured',
      visibility: 'policy_gated',
      requiredGate: 'runtime_context_assembly',
    });
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'external_access.connectors')).toMatchObject({
      status: 'disabled',
      visibility: 'hidden',
      summary: 'connected=0 / pending=0 / errors=0 / catalogue=1',
      missingReason: 'No external access connector is connected.',
    });
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'disabled',
      visibility: 'hidden',
      summary: 'enabled=0 / ready=0 / modelVisible=0 / needsConfig=0 / catalogue=1',
      missingReason: 'No ready skill is enabled.',
    });
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'mcp.servers')).toMatchObject({
      status: 'disabled',
      visibility: 'hidden',
      summary: 'connectedServers=0 / tools=0 / modelVisibleTools=0 / errors=0 / catalogue=1',
      missingReason: 'No connected MCP server exposes tools.',
    });
    expect(status.agentCliRuntimeStatus).toMatchObject({
      catalogueCount: 2,
      detectedCount: 0,
      manualRunCount: 0,
      readyCount: 0,
      readyManualRunCount: 0,
    });
    expect(status.suggestedWorkspaceRoot).toBe(path.join(tempRoot, 'workspace'));
    expect(fs.existsSync(path.join(tempRoot, 'workspace'))).toBe(true);
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'agent_cli.runtimes')).toMatchObject({
      status: 'disabled',
      visibility: 'hidden',
      summary: 'detected=0 / ready=0 / manualRun=0 / readyManualRun=0 / running=0 / errors=0 / selected=Codex CLI / catalogue=2',
      missingReason: 'No supported Agent CLI runtime is detected.',
    });
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'agent_api.runtime')).toMatchObject({
      status: 'disabled',
      visibility: 'hidden',
      summary: 'executionKind=api / status=development / executable=false',
      missingReason: 'Agent API Runtime is a peer execution runtime planned for a later version; it is not executable yet.',
    });
    expect(status.externalAccessStatus).toEqual({
      sources: [],
      connectedCount: 0,
      pendingCount: 0,
      errorCount: 0,
      updatedAt: null,
    });
    expect(status.configurationSafetyReport).toMatchObject({
      secretExposureSafe: true,
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'model.api_key')).toMatchObject({
      state: 'missing',
      exposesSecretValue: false,
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'external_access.connectors')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No external access connector is connected.',
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No ready skill is enabled.',
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No connected MCP server exposes tools.',
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'agent_cli.runtimes')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No supported Agent CLI runtime is detected.',
      diagnosticSummary: 'detected=0 / ready=0 / manualRun=0 / readyManualRun=0 / running=0 / errors=0 / selected=Codex CLI / catalogue=2',
      startupProbePolicy: 'safe_read_only',
      exposesSecretValue: false,
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'agent_api.runtime')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'Agent API Runtime is a peer execution runtime planned for a later version; it is not executable yet.',
      startupProbePolicy: 'never',
      exposesSecretValue: false,
    });
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

  it('feeds External Access connector status into capability and safety projections', async () => {
    getPasswordMock.mockResolvedValue(null);
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { ExternalAccessStatusService } = await import('../domain/external-access/external-access-status-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const service = new AiConfigService(
      new AppConfigService(() => tempRoot),
      new ExternalAccessStatusService(() => ({
        sources: [{
          id: 'gmail',
          label: 'Gmail',
          kind: 'email',
          accountLabel: 'user@example.com',
          status: 'connected',
          lastSyncAt: '2026-05-17T09:00:00.000Z',
        }],
        connectedCount: 1,
        pendingCount: 0,
        errorCount: 0,
        updatedAt: '2026-05-17T09:00:00.000Z',
      })),
    );

    const status = await service.getStatus();

    expect(status.externalAccessStatus).toMatchObject({
      connectedCount: 1,
      sources: [{ id: 'gmail', status: 'connected' }],
    });
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'external_access.connectors')).toMatchObject({
      status: 'available',
      configured: true,
      summary: 'connected=1 / pending=0 / errors=0 / catalogue=1',
      visibility: 'hidden',
      access: 'read_only',
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'external_access.connectors')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
  });

  it('feeds live Skills and MCP service status into capability and safety projections', async () => {
    getPasswordMock.mockResolvedValue(null);
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const service = new AiConfigService(
      new AppConfigService(() => tempRoot),
      undefined,
      {
        getSkillsStatus: () => ({
          enabledCount: 2,
          readyCount: 1,
          modelVisibleCount: 1,
          needsConfigCount: 1,
          catalogueCount: 1,
        }),
        getMcpStatus: () => ({
          connectedServerCount: 1,
          toolCount: 3,
          modelVisibleToolCount: 2,
          errorCount: 0,
          catalogueCount: 1,
        }),
      },
    );

    const status = await service.getStatus();

    expect(status.capabilityRegistry?.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'available',
      configured: true,
      visibility: 'model_visible',
      summary: 'enabled=2 / ready=1 / modelVisible=1 / needsConfig=1 / catalogue=1',
    });
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'mcp.servers')).toMatchObject({
      status: 'available',
      configured: true,
      visibility: 'model_visible',
      summary: 'connectedServers=1 / tools=3 / modelVisibleTools=2 / errors=0 / catalogue=1',
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
    });
  });

  it('does not promote live Skills and MCP service state without model-visible runtime exposure', async () => {
    getPasswordMock.mockResolvedValue(null);
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const service = new AiConfigService(
      new AppConfigService(() => tempRoot),
      undefined,
      {
        getSkillsStatus: () => ({
          enabledCount: 1,
          readyCount: 1,
          modelVisibleCount: 0,
          needsConfigCount: 0,
          catalogueCount: 1,
        }),
        getMcpStatus: () => ({
          connectedServerCount: 1,
          toolCount: 3,
          modelVisibleToolCount: 0,
          errorCount: 0,
          catalogueCount: 1,
        }),
      },
    );

    const status = await service.getStatus();

    expect(status.capabilityRegistry?.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'unconfigured',
      configured: false,
      visibility: 'hidden',
      missingReason: 'Ready skills are not exposed through the runtime tool gate.',
    });
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'mcp.servers')).toMatchObject({
      status: 'unconfigured',
      configured: false,
      visibility: 'hidden',
      missingReason: 'Connected MCP tools are not exposed through the runtime tool gate.',
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      state: 'missing',
      reason: 'Ready skills are not exposed through the runtime tool gate.',
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      state: 'missing',
      reason: 'Connected MCP tools are not exposed through the runtime tool gate.',
    });
  });

  it('can project a local External Access fixture through the default service', async () => {
    getPasswordMock.mockResolvedValue(null);
    process.env.TASKPLANE_EXTERNAL_ACCESS_FIXTURE_JSON = JSON.stringify({
      sources: [{
        id: 'gmail_fixture',
        label: 'Gmail',
        kind: 'email',
        accountLabel: 'user@example.com',
        status: 'connected',
      }],
    });
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const service = new AiConfigService(new AppConfigService(() => tempRoot));

    const status = await service.getStatus();

    expect(status.externalAccessStatus).toMatchObject({
      connectedCount: 1,
      sources: [{ id: 'gmail_fixture', status: 'connected' }],
    });
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'external_access.connectors')).toMatchObject({
      status: 'available',
      summary: 'connected=1 / pending=0 / errors=0 / catalogue=1',
    });
  });

  it('can project local Skills and MCP service fixtures through the default service', async () => {
    getPasswordMock.mockResolvedValue(null);
    process.env.TASKPLANE_CAPABILITY_PRODUCT_SURFACE_FIXTURE_JSON = JSON.stringify({
      mcpServers: [{
        id: 'playwright_fixture',
        status: 'connected',
        toolCount: 3,
        modelVisibleToolCount: 1,
      }],
      skills: [{
        id: 'brainstorming_fixture',
        status: 'ready',
        modelVisible: true,
      }],
    });
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const service = new AiConfigService(new AppConfigService(() => tempRoot));

    const status = await service.getStatus();

    expect(status.capabilityRegistry?.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'available',
      summary: 'enabled=1 / ready=1 / modelVisible=1 / needsConfig=0 / catalogue=1',
      visibility: 'model_visible',
    });
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'mcp.servers')).toMatchObject({
      status: 'available',
      summary: 'connectedServers=1 / tools=3 / modelVisibleTools=1 / errors=0 / catalogue=1',
      visibility: 'model_visible',
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
    expect(status.toolScaffoldSummaries?.find((summary) => summary.family === 'skill')?.modelVisibleIds).toEqual([]);
    expect(status.toolScaffoldSummaries?.find((summary) => summary.family === 'mcp')?.modelVisibleIds).toEqual([]);
    expect(status.toolScaffoldSummaries?.find((summary) => summary.family === 'browser_playwright')?.modelVisibleIds).toEqual([]);
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'workspace.checks')).toMatchObject({
      status: 'available',
      requiredGate: 'runtime_pre_step',
    });
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'agent_tools.model_visible')).toMatchObject({
      status: 'available',
      visibility: 'model_visible',
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'model.api_key')).toMatchObject({
      state: 'configured',
      exposesSecretValue: false,
    });
    expect(status.configurationSafetyReport?.surfaces.find((surface) => surface.id === 'sandbox.patch_promotion')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
  });

  it('reports all model page providers that have stored keychain keys', async () => {
    getPasswordMock.mockImplementation(async (_serviceName: string, accountName: string) => (
      accountName === 'ai_key_google' || accountName === 'ai_key_deepseek' || accountName === 'ai_key_groq'
        ? `${accountName}-secret`
        : null
    ));
    const { AppConfigService } = await import('../config/app-config-service.js');
    const { AiConfigService } = await import('./ai-config-service.js');
    const appConfigService = new AppConfigService(() => tempRoot);
    appConfigService.write({
      aiProvider: 'google',
      aiModel: 'gemini-2.5-flash',
    });
    const service = new AiConfigService(appConfigService);

    const status = await service.getStatus();
    const runtimeConfig = await service.resolveRuntimeConfig();

    expect(status.configured).toBe(true);
    expect(status.apiKeyStored).toBe(true);
    expect(status.apiKeySource).toBe('keychain');
    expect(status.configuredProviders).toEqual(expect.arrayContaining(['google', 'deepseek', 'groq']));
    expect(runtimeConfig.apiKey).toBe('ai_key_google-secret');
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
    expect(status.capabilityRegistry?.find((entry) => entry.id === 'model.code_agent_producer')).toMatchObject({
      status: 'available',
      visibility: 'policy_gated',
      requiresApproval: true,
    });
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
