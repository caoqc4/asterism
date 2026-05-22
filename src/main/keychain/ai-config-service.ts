import fs from 'node:fs';
import path from 'node:path';

import keytar from 'keytar';

import type { AiConfigInput, AiConfigStatus, AiProvider, AiProviderKeysInput, FeatureFlags } from '../../shared/types/settings.js';
import { buildAgentSandboxBackendStatus } from '../../shared/agent-sandbox-provider.js';
import { summarizeAgentToolScaffoldFamilies } from '../../shared/agent-tool-scaffold.js';
import type { AgentCliRuntimeStatus } from '../../shared/agent-cli-runtime-status.js';
import { buildCapabilityRegistry, type CapabilityProductSurfaceStatus } from '../../shared/capability-registry.js';
import { buildConfigurationSafetyReport } from '../../shared/configuration-safety-report.js';
import { emptyExternalAccessStatus, externalAccessStatusForCapability, type ExternalAccessStatus } from '../../shared/external-access-status.js';
import { buildRuntimeCapabilitySnapshot } from '../../shared/runtime-capability-snapshot.js';
import { AppConfigService } from '../config/app-config-service.js';
import { readEnvBoolean, readEnvValue } from '../config/env.js';
import { createCapabilityProductSurfaceStatusService, type CapabilityProductSurfaceStatusProvider } from '../domain/capability/capability-product-surface-status-service.js';
import { createAgentCliRuntimeStatusService, type AgentCliRuntimeStatusService } from '../domain/agent-cli/agent-cli-runtime-status-service.js';
import { createExternalAccessStatusService, ExternalAccessStatusService } from '../domain/external-access/external-access-status-service.js';
import { evaluateAgentExecutorLifecycleServiceAvailability } from '../domain/run/agent-executor-lifecycle-service-factory.js';

const SERVICE_NAME = 'taskplane';
const LEGACY_SERVICE_NAME = 'supersecretary';
const LEGACY_ACCOUNT_NAME = 'ai_api_key';

const PROVIDER_ACCOUNT: Record<string, string> = {
  anthropic:           'ai_key_anthropic',
  openai:              'ai_key_openai',
  google:              'ai_key_google',
  deepseek:            'ai_key_deepseek',
  groq:                'ai_key_groq',
  'fal-openrouter':    'ai_key_fal_openrouter',
  'openai-compatible': 'ai_key_custom',
};
const KEYCHAIN_PROVIDERS = Object.keys(PROVIDER_ACCOUNT) as AiProvider[];

const DEFAULT_TOOL_SCAFFOLD_POLICY = {
  allowLocalWorkspaceRead: false,
  allowTaskMutationTools: false,
};
const ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV = 'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER';
const CODE_AGENT_CHECK_SCRIPTS = ['test', 'lint'] as const;

function ensureDirectory(pathname: string): string | null {
  try {
    fs.mkdirSync(pathname, { recursive: true });
    return pathname;
  } catch {
    return null;
  }
}

function inferSuggestedWorkspaceRoot(configuredWorkspaceRoot: string | null, configPath: string): string | null {
  if (configuredWorkspaceRoot?.trim()) return configuredWorkspaceRoot.trim();

  const envWorkspaceRoot = readEnvValue('TASKPLANE_WORKSPACE_ROOT');
  if (envWorkspaceRoot?.trim()) return envWorkspaceRoot.trim();

  const productWorkspaceRoot = ensureDirectory(path.join(path.dirname(configPath), 'workspace'));
  if (productWorkspaceRoot) return productWorkspaceRoot;

  const cwd = process.cwd();
  if (!cwd || cwd === path.parse(cwd).root) return null;
  if (fs.existsSync(path.join(cwd, 'package.json')) || fs.existsSync(path.join(cwd, '.git'))) {
    return cwd;
  }

  return null;
}

export type RuntimeAiConfig = {
  provider: AiProvider;
  model: string;
  baseUrl?: string | null;
  workspaceRoot?: string | null;
  apiKey: string;
  featureFlags: FeatureFlags;
};

function detectCodeAgentWorkspaceChecks(
  workspaceRoot: string | null,
): NonNullable<AiConfigStatus['codeAgentWorkspaceChecks']> {
  const unavailable = (reason: string) => ({
    lint: { available: false, reason },
    test: { available: false, reason },
  });

  if (!workspaceRoot?.trim()) return unavailable('workspace root is not configured.');

  const packageJsonPath = path.join(workspaceRoot, 'package.json');
  try {
    if (!fs.existsSync(packageJsonPath)) return unavailable('package.json was not found in the configured workspace root.');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { scripts?: Record<string, unknown> };
    const scripts = packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};
    return Object.fromEntries(CODE_AGENT_CHECK_SCRIPTS.map((script) => {
      const value = scripts[script];
      const available = typeof value === 'string' && Boolean(value.trim());
      return [script, { available, reason: available ? `package.json exposes npm run ${script}.` : `package.json does not expose npm run ${script}.` }];
    })) as NonNullable<AiConfigStatus['codeAgentWorkspaceChecks']>;
  } catch {
    return unavailable('package.json could not be read or parsed.');
  }
}

async function buildCapabilityProductSurfaceStatus(
  externalAccessStatus: ExternalAccessStatus | undefined,
  agentCliRuntimeStatus: AgentCliRuntimeStatus | undefined,
  productSurfaceStatusProvider: CapabilityProductSurfaceStatusProvider,
): Promise<CapabilityProductSurfaceStatus> {
  const [skills, mcp] = await Promise.all([
    productSurfaceStatusProvider.getSkillsStatus(),
    productSurfaceStatusProvider.getMcpStatus(),
  ]);

  return {
    externalAccess: externalAccessStatusForCapability(externalAccessStatus ?? emptyExternalAccessStatus()),
    agentCli: agentCliRuntimeStatus
      ? {
        catalogueCount: agentCliRuntimeStatus.catalogueCount,
        detectedCount: agentCliRuntimeStatus.detectedCount,
        errorCount: agentCliRuntimeStatus.errorCount,
        manualRunCount: agentCliRuntimeStatus.manualRunCount,
        readyCount: agentCliRuntimeStatus.readyCount,
        readyManualRunCount: agentCliRuntimeStatus.readyManualRunCount,
        runningCount: agentCliRuntimeStatus.runningCount,
      }
      : null,
    skills,
    mcp,
  };
}

export class AiConfigService {
  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly externalAccessStatusService = createExternalAccessStatusService(),
    private readonly productSurfaceStatusProvider: CapabilityProductSurfaceStatusProvider = createCapabilityProductSurfaceStatusService(),
    private readonly agentCliRuntimeStatusService: AgentCliRuntimeStatusService = createAgentCliRuntimeStatusService(),
  ) {}

  /* ─── Per-provider key storage ─── */

  private async getProviderKey(provider: AiProvider): Promise<string | null> {
    const account = PROVIDER_ACCOUNT[provider];
    if (!account) return null;
    return keytar.getPassword(SERVICE_NAME, account);
  }

  private async setProviderKey(provider: AiProvider, key: string): Promise<void> {
    const account = PROVIDER_ACCOUNT[provider];
    if (!account) return;
    if (key.trim()) {
      await keytar.setPassword(SERVICE_NAME, account, key.trim());
    }
  }

  private async getLegacyKey(): Promise<string | null> {
    const current = await keytar.getPassword(SERVICE_NAME, LEGACY_ACCOUNT_NAME);
    if (current) return current;
    const legacy = await keytar.getPassword(LEGACY_SERVICE_NAME, LEGACY_ACCOUNT_NAME);
    if (legacy) {
      await keytar.setPassword(SERVICE_NAME, LEGACY_ACCOUNT_NAME, legacy);
      return legacy;
    }
    return null;
  }

  /* Returns which providers have keys in keychain */
  private async getConfiguredProviders(): Promise<AiProvider[]> {
    const results = await Promise.all(KEYCHAIN_PROVIDERS.map(async (p) => ({ p, key: await this.getProviderKey(p) })));
    return results.filter((r) => Boolean(r.key)).map((r) => r.p);
  }

  /* Resolve the best key for the active provider */
  private async resolveKeyForProvider(provider: AiProvider): Promise<string | null> {
    const perProviderKey = await this.getProviderKey(provider);
    const envKey = readEnvValue('TASKPLANE_AI_API_KEY');
    const legacyKey = await this.getLegacyKey();
    return perProviderKey ?? envKey ?? legacyKey;
  }

  /* ─── Public API ─── */

  async getStatus(): Promise<AiConfigStatus> {
    const config = this.appConfigService.read();
    const configPath = this.appConfigService.getConfigPath();
    const suggestedWorkspaceRoot = inferSuggestedWorkspaceRoot(config.workspaceRoot, configPath);
    const envApiKey = readEnvValue('TASKPLANE_AI_API_KEY');
    const configuredProviders = await this.getConfiguredProviders();
    const providerKey = await this.getProviderKey(config.aiProvider);
    const legacyKey = await this.getLegacyKey();
    const activeKey = providerKey ?? envApiKey ?? legacyKey;
    const [externalAccessStatus, agentCliRuntimeStatus] = await Promise.all([
      this.externalAccessStatusService.getStatus(),
      this.agentCliRuntimeStatusService.getStatus(),
    ]);

    const status: AiConfigStatus = {
      configured: Boolean(activeKey),
      apiKeyStored: Boolean(providerKey ?? legacyKey),
      apiKeySource: envApiKey ? 'env' : (providerKey ?? legacyKey) ? 'keychain' : null,
      configuredProviders,
      codeAgentWorkspaceChecks: detectCodeAgentWorkspaceChecks(config.workspaceRoot),
      codeAgentModelProducerEnabled: readEnvBoolean(ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV) === true,
      runtimeMode: config.aiRuntimeMode,
      provider: config.aiProvider,
      model: config.aiModel,
      baseUrl: config.aiBaseUrl,
      workspaceRoot: config.workspaceRoot,
      suggestedWorkspaceRoot,
      updatedAt: config.updatedAt,
      configPath,
      featureFlags: config.featureFlags,
      sandboxBackendStatus: buildAgentSandboxBackendStatus(null),
      executorLifecycleAvailability: evaluateAgentExecutorLifecycleServiceAvailability(),
      toolScaffoldSummaries: summarizeAgentToolScaffoldFamilies({ policy: DEFAULT_TOOL_SCAFFOLD_POLICY }),
      externalAccessStatus,
      agentCliRuntimeStatus,
    };
    return withCapabilityRegistry(status, this.productSurfaceStatusProvider);
  }

  async setConfig(input: AiConfigInput): Promise<AiConfigStatus> {
    const provider = input.provider;

    // Save per-provider keys
    if (input.providerKeys) {
      await this.saveProviderKeys(input.providerKeys);
    }

    const customBaseUrl = input.providerKeys?.customBaseUrl?.trim() || null;

    const configInput = {
      aiProvider: provider,
      aiModel: input.model.trim(),
      aiBaseUrl: customBaseUrl || null,
      featureFlags: input.featureFlags,
      ...(input.runtimeMode ? { aiRuntimeMode: input.runtimeMode } : {}),
    };
    const config = this.appConfigService.write(input.workspaceRoot !== undefined
      ? { ...configInput, workspaceRoot: input.workspaceRoot }
      : configInput);
    const configPath = this.appConfigService.getConfigPath();
    const suggestedWorkspaceRoot = inferSuggestedWorkspaceRoot(config.workspaceRoot, configPath);

    const configuredProviders = await this.getConfiguredProviders();
    const envApiKey = readEnvValue('TASKPLANE_AI_API_KEY');
    const providerKey = await this.getProviderKey(provider);
    const legacyKey = await this.getLegacyKey();
    const activeKey = providerKey ?? envApiKey ?? legacyKey;
    const [externalAccessStatus, agentCliRuntimeStatus] = await Promise.all([
      this.externalAccessStatusService.getStatus(),
      this.agentCliRuntimeStatusService.getStatus(),
    ]);

    const status: AiConfigStatus = {
      configured: Boolean(activeKey),
      apiKeyStored: Boolean(providerKey),
      apiKeySource: envApiKey ? 'env' : (providerKey ?? legacyKey) ? 'keychain' : null,
      configuredProviders,
      codeAgentWorkspaceChecks: detectCodeAgentWorkspaceChecks(config.workspaceRoot),
      codeAgentModelProducerEnabled: readEnvBoolean(ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV) === true,
      runtimeMode: config.aiRuntimeMode,
      provider: config.aiProvider,
      model: config.aiModel,
      baseUrl: config.aiBaseUrl,
      workspaceRoot: config.workspaceRoot,
      suggestedWorkspaceRoot,
      updatedAt: config.updatedAt,
      configPath,
      featureFlags: config.featureFlags,
      sandboxBackendStatus: buildAgentSandboxBackendStatus(null),
      executorLifecycleAvailability: evaluateAgentExecutorLifecycleServiceAvailability(),
      toolScaffoldSummaries: summarizeAgentToolScaffoldFamilies({ policy: DEFAULT_TOOL_SCAFFOLD_POLICY }),
      externalAccessStatus,
      agentCliRuntimeStatus,
    };
    return withCapabilityRegistry(status, this.productSurfaceStatusProvider);
  }

  private async saveProviderKeys(keys: AiProviderKeysInput): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (keys.anthropic?.trim())    tasks.push(this.setProviderKey('anthropic', keys.anthropic));
    if (keys.openai?.trim())       tasks.push(this.setProviderKey('openai', keys.openai));
    if (keys.google?.trim())       tasks.push(this.setProviderKey('google', keys.google));
    if (keys.deepseek?.trim())     tasks.push(this.setProviderKey('deepseek', keys.deepseek));
    if (keys.groq?.trim())         tasks.push(this.setProviderKey('groq', keys.groq));
    if (keys.falOpenRouter?.trim()) tasks.push(this.setProviderKey('fal-openrouter', keys.falOpenRouter));
    if (keys.customKey?.trim())    tasks.push(this.setProviderKey('openai-compatible', keys.customKey));
    await Promise.all(tasks);
  }

  async resolveRuntimeConfig(): Promise<RuntimeAiConfig> {
    const config = this.appConfigService.read();
    if (config.aiRuntimeMode !== 'api') {
      const selectedRuntimeLabel = config.aiRuntimeMode === 'codex' ? 'Codex CLI' : 'Claude Code';
      throw new Error(`当前选择的是 ${selectedRuntimeLabel}。Agent API Runtime 配置不会在未确认的情况下被解析为当前 AI 调用层。`);
    }
    const apiKey = await this.resolveKeyForProvider(config.aiProvider);

    if (!apiKey) throw new Error('AI API Key is not configured. Please add a key in Settings.');

    return {
      provider: config.aiProvider,
      model: config.aiModel,
      baseUrl: config.aiBaseUrl,
      workspaceRoot: config.workspaceRoot,
      apiKey,
      featureFlags: config.featureFlags,
    };
  }

  async resolveOpenAiWebResearchConfig(): Promise<RuntimeAiConfig> {
    const config = this.appConfigService.read();
    if (config.aiProvider !== 'openai') {
      throw new Error('OpenAI web research requires the OpenAI provider to be selected.');
    }
    const apiKey = await this.resolveKeyForProvider('openai');

    if (!apiKey) throw new Error('OpenAI API Key is not configured. Please add a key in Settings.');

    return {
      provider: 'openai',
      model: config.aiModel,
      baseUrl: null,
      workspaceRoot: config.workspaceRoot,
      apiKey,
      featureFlags: config.featureFlags,
    };
  }
}

async function withCapabilityRegistry(
  status: AiConfigStatus,
  productSurfaceStatusProvider: CapabilityProductSurfaceStatusProvider,
): Promise<AiConfigStatus> {
  const statusWithRegistry = {
    ...status,
    capabilityRegistry: buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: status }),
      productSurfaces: await buildCapabilityProductSurfaceStatus(status.externalAccessStatus, status.agentCliRuntimeStatus, productSurfaceStatusProvider),
    }),
  };
  return {
    ...statusWithRegistry,
    configurationSafetyReport: buildConfigurationSafetyReport(statusWithRegistry),
  };
}
