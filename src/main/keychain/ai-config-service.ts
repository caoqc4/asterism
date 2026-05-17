import fs from 'node:fs';
import path from 'node:path';

import keytar from 'keytar';

import type { AiConfigInput, AiConfigStatus, AiProvider, AiProviderKeysInput, FeatureFlags } from '../../shared/types/settings.js';
import { buildAgentSandboxBackendStatus } from '../../shared/agent-sandbox-provider.js';
import { summarizeAgentToolScaffoldFamilies } from '../../shared/agent-tool-scaffold.js';
import { buildCapabilityRegistry, type CapabilityProductSurfaceStatus } from '../../shared/capability-registry.js';
import { buildConfigurationSafetyReport } from '../../shared/configuration-safety-report.js';
import { emptyExternalAccessStatus, externalAccessStatusForCapability, type ExternalAccessStatus } from '../../shared/external-access-status.js';
import { buildRuntimeCapabilitySnapshot } from '../../shared/runtime-capability-snapshot.js';
import { AppConfigService } from '../config/app-config-service.js';
import { readEnvBoolean, readEnvValue } from '../config/env.js';
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

const DEFAULT_TOOL_SCAFFOLD_POLICY = {
  allowLocalWorkspaceRead: false,
  allowTaskMutationTools: false,
};
const ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV = 'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER';
const CODE_AGENT_CHECK_SCRIPTS = ['test', 'lint'] as const;

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

function buildCapabilityProductSurfaceStatus(externalAccessStatus: ExternalAccessStatus | undefined): CapabilityProductSurfaceStatus {
  return {
    externalAccess: externalAccessStatusForCapability(externalAccessStatus ?? emptyExternalAccessStatus()),
  };
}

export class AiConfigService {
  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly externalAccessStatusService = createExternalAccessStatusService(),
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
    const all: AiProvider[] = ['anthropic', 'openai', 'fal-openrouter', 'openai-compatible'];
    const results = await Promise.all(all.map(async (p) => ({ p, key: await this.getProviderKey(p) })));
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
    const envApiKey = readEnvValue('TASKPLANE_AI_API_KEY');
    const configuredProviders = await this.getConfiguredProviders();
    const activeKey = await this.resolveKeyForProvider(config.aiProvider);
    const externalAccessStatus = await this.externalAccessStatusService.getStatus();

    const status: AiConfigStatus = {
      configured: Boolean(activeKey),
      apiKeyStored: Boolean(await this.getProviderKey(config.aiProvider) ?? await this.getLegacyKey()),
      apiKeySource: envApiKey ? 'env' : (await this.getLegacyKey()) ? 'keychain' : null,
      configuredProviders,
      codeAgentWorkspaceChecks: detectCodeAgentWorkspaceChecks(config.workspaceRoot),
      codeAgentModelProducerEnabled: readEnvBoolean(ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV) === true,
      provider: config.aiProvider,
      model: config.aiModel,
      baseUrl: config.aiBaseUrl,
      workspaceRoot: config.workspaceRoot,
      updatedAt: config.updatedAt,
      configPath: this.appConfigService.getConfigPath(),
      featureFlags: config.featureFlags,
      sandboxBackendStatus: buildAgentSandboxBackendStatus(null),
      executorLifecycleAvailability: evaluateAgentExecutorLifecycleServiceAvailability(),
      toolScaffoldSummaries: summarizeAgentToolScaffoldFamilies({ policy: DEFAULT_TOOL_SCAFFOLD_POLICY }),
      externalAccessStatus,
    };
    return withCapabilityRegistry(status);
  }

  async setConfig(input: AiConfigInput): Promise<AiConfigStatus> {
    const provider = input.provider;

    // Save per-provider keys
    if (input.providerKeys) {
      await this.saveProviderKeys(input.providerKeys);
    }

    const customBaseUrl = input.providerKeys?.customBaseUrl?.trim() || null;

    const config = this.appConfigService.write({
      aiProvider: provider,
      aiModel: input.model.trim(),
      aiBaseUrl: customBaseUrl || null,
      featureFlags: input.featureFlags,
    });

    const configuredProviders = await this.getConfiguredProviders();
    const envApiKey = readEnvValue('TASKPLANE_AI_API_KEY');
    const activeKey = await this.resolveKeyForProvider(provider);
    const externalAccessStatus = await this.externalAccessStatusService.getStatus();

    const status: AiConfigStatus = {
      configured: Boolean(activeKey),
      apiKeyStored: Boolean(await this.getProviderKey(provider)),
      apiKeySource: envApiKey ? 'env' : (await this.getLegacyKey()) ? 'keychain' : null,
      configuredProviders,
      codeAgentWorkspaceChecks: detectCodeAgentWorkspaceChecks(config.workspaceRoot),
      codeAgentModelProducerEnabled: readEnvBoolean(ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV) === true,
      provider: config.aiProvider,
      model: config.aiModel,
      baseUrl: config.aiBaseUrl,
      workspaceRoot: config.workspaceRoot,
      updatedAt: config.updatedAt,
      configPath: this.appConfigService.getConfigPath(),
      featureFlags: config.featureFlags,
      sandboxBackendStatus: buildAgentSandboxBackendStatus(null),
      executorLifecycleAvailability: evaluateAgentExecutorLifecycleServiceAvailability(),
      toolScaffoldSummaries: summarizeAgentToolScaffoldFamilies({ policy: DEFAULT_TOOL_SCAFFOLD_POLICY }),
      externalAccessStatus,
    };
    return withCapabilityRegistry(status);
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
}

function withCapabilityRegistry(status: AiConfigStatus): AiConfigStatus {
  const statusWithRegistry = {
    ...status,
    capabilityRegistry: buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: status }),
      productSurfaces: buildCapabilityProductSurfaceStatus(status.externalAccessStatus),
    }),
  };
  return {
    ...statusWithRegistry,
    configurationSafetyReport: buildConfigurationSafetyReport(statusWithRegistry),
  };
}
