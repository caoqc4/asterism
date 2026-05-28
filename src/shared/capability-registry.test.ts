import { describe, expect, it } from 'vitest';

import {
  agentCliStatusForCapability,
  buildCapabilityRegistry,
  capabilityRegistryAllowsModelExecution,
  capabilityRegistryAllowsWorkspaceVerification,
} from './capability-registry.js';
import {
  buildAgentCliRuntimeStatus,
  buildDefaultAgentCliRuntimeCapabilities,
} from './agent-cli-runtime-status.js';
import { RUNTIME_ENTRYPOINT_COVERAGE } from './runtime-entrypoint-coverage.js';
import { buildRuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';
import type { AgentToolScaffoldFamilySummary } from './agent-tool-scaffold.js';
import type { AiConfigStatus } from './types/settings.js';

describe('capability registry', () => {
  it('projects runtime capability snapshot into stable registry entries', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() }),
    });

    expect(registry.map((entry) => entry.id)).toEqual([
      'model.provider',
      'model.code_agent_producer',
      'workspace.root',
      'workspace.checks',
      'runtime.scheduler',
      'sandbox.coding_agent',
      'runtime.self_check',
      'agent_tools.model_visible',
      'agent_tools.checkpointed',
      'external_access.connectors',
      'skills.catalogue',
      'mcp.servers',
      'agent_cli.runtimes',
      'agent_api.runtime',
      'browser.operator',
    ]);

    expect(registry.find((entry) => entry.id === 'model.provider')).toMatchObject({
      status: 'available',
      configured: true,
      visibility: 'policy_gated',
      requiredGate: 'runtime_context_assembly',
    });
    expect(registry.find((entry) => entry.id === 'agent_tools.model_visible')).toMatchObject({
      status: 'available',
      visibility: 'model_visible',
      requiresApproval: true,
      summary: 'modelVisibleTools=1',
    });
    expect(registry.find((entry) => entry.id === 'sandbox.coding_agent')).toMatchObject({
      status: 'unknown',
      configured: false,
      visibility: 'hidden',
      missingReason: 'Sandbox backend has not been probed.',
    });
    expect(capabilityRegistryAllowsModelExecution(registry)).toBe(true);
    expect(capabilityRegistryAllowsWorkspaceVerification(registry)).toBe(true);
  });

  it('keeps disabled or unconfigured capabilities hidden from model-visible exposure', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({
        aiStatus: aiStatus({
          configured: false,
          provider: null,
          model: null,
          workspaceRoot: null,
          codeAgentModelProducerEnabled: false,
          codeAgentWorkspaceChecks: undefined,
          toolScaffoldSummaries: [],
          featureFlags: {
            enableScheduler: false,
            enableSandboxCodingAgent: false,
            enableSelfCheck: false,
          },
        }),
      }),
    });

    for (const entry of registry) {
      if (entry.status === 'available') continue;
      expect(entry.visibility).not.toBe('model_visible');
    }
    expect(registry.find((entry) => entry.id === 'model.provider')).toMatchObject({
      status: 'unconfigured',
      missingReason: 'No configured model provider.',
    });
    expect(capabilityRegistryAllowsModelExecution(registry)).toBe(false);
    expect(capabilityRegistryAllowsWorkspaceVerification(registry)).toBe(false);
  });

  it('requires a runtime gate and approval declaration for every capability', () => {
    for (const entry of buildCapabilityRegistry({ snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() }) })) {
      expect(entry.requiredGate).not.toBeUndefined();
      expect(typeof entry.requiresApproval).toBe('boolean');
      expect(entry.summary.length).toBeGreaterThan(0);
    }
  });

  it('requires sandbox backend readiness before exposing sandbox coding as available', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({
        aiStatus: aiStatus({
          sandboxBackendStatus: {
            probe: {
              backendId: 'local-container',
              environmentPolicy: 'empty',
              isolation: 'container',
              kind: 'local_container',
              networkMode: 'disabled',
              status: 'available',
              supportsOutputLimits: true,
              supportsPatchArtifacts: true,
              supportsStagedWrites: true,
              supportsStructuredCommands: true,
              supportsTargetedCommands: true,
              supportsWorkspaceMount: true,
            },
            profile: null,
            readiness: {
              ready: true,
              summary: 'Sandbox backend ready.',
              blockedReasons: [],
            },
            producerBackendReadiness: {
              ready: true,
              summary: 'Sandbox producer backend ready.',
              blockedReasons: [],
            },
            summary: 'Sandbox backend ready.',
          },
        }),
      }),
    });

    expect(registry.find((entry) => entry.id === 'sandbox.coding_agent')).toMatchObject({
      status: 'available',
      configured: true,
      visibility: 'policy_gated',
      requiredGate: 'capability_probe',
      summary: 'Sandbox producer backend ready.',
    });
  });

  it('can promote product surface statuses out of deferred capability rows', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() }),
      productSurfaces: {
        externalAccess: { connectedCount: 2, pendingCount: 1, errorCount: 0, catalogueCount: 1 },
        skills: { enabledCount: 3, readyCount: 2, modelVisibleCount: 1, needsConfigCount: 1 },
        mcp: { connectedServerCount: 1, toolCount: 4, modelVisibleToolCount: 2, errorCount: 0, catalogueCount: 1 },
        agentCli: { detectedCount: 1, readyCount: 1, manualRunCount: 1, readyManualRunCount: 1, runningCount: 0, errorCount: 0, catalogueCount: 2 },
        browser: { available: true, reason: 'Browser automation configured.' },
      },
    });

    expect(registry.find((entry) => entry.id === 'external_access.connectors')).toMatchObject({
      status: 'available',
      configured: true,
      visibility: 'hidden',
      access: 'read_only',
      summary: 'connected=2 / pending=1 / errors=0 / catalogue=1',
    });
    expect(registry.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'available',
      visibility: 'model_visible',
      summary: 'enabled=3 / ready=2 / modelVisible=1 / needsConfig=1',
    });
    expect(registry.find((entry) => entry.id === 'mcp.servers')).toMatchObject({
      status: 'available',
      visibility: 'model_visible',
      summary: 'connectedServers=1 / tools=4 / modelVisibleTools=2 / errors=0 / catalogue=1',
    });
    expect(registry.find((entry) => entry.id === 'agent_cli.runtimes')).toMatchObject({
      status: 'available',
      configured: true,
      visibility: 'hidden',
      access: 'mutating',
      requiredGate: 'runtime_pre_step',
      summary: 'detected=1 / ready=1 / manualRun=1 / readyManualRun=1 / running=0 / errors=0 / catalogue=2',
    });
    expect(registry.find((entry) => entry.id === 'agent_api.runtime')).toMatchObject({
      status: 'available',
      configured: true,
      family: 'agent_api',
      visibility: 'hidden',
      access: 'mutating',
      requiredGate: 'runtime_pre_step',
      summary: expect.stringContaining('providerToolReadiness=not_declared / providerToolStatus=not_declared / providerToolRequirements=4/5 / providerToolMissingRequirements=explicit_tool_declaration / selectedApiRuntime=ready / providerConfigured=ready / configuredProvider=anthropic / providerOwnedMetadata=ready / providerMetadataMatchesSelected=yes / providerMetadataOwner=provider / providerMetadataPackage=@ai-sdk/anthropic / explicitToolDeclaration=missing / explicitToolDeclarationSource=provider_owned_metadata / explicitToolDeclarationPackage=@ai-sdk/anthropic / explicitToolDeclarationPackageMatchesMetadata=yes / declaredToolCount=0 / declaredWebSearchToolCount=0 / declaredWebSearchTools=none / startupProbe=never / selected=true / provider=configured'),
    });
    expect(registry.find((entry) => entry.id === 'browser.operator')).toMatchObject({
      status: 'available',
      visibility: 'policy_gated',
      requiredGate: 'runtime_pre_step',
      summary: 'Browser automation configured.',
    });
  });

  it('marks the selected Agent CLI runtime in diagnostics when one is configured', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus({ runtimeMode: 'codex' }) }),
      productSurfaces: {
        agentCli: { detectedCount: 1, readyCount: 1, manualRunCount: 1, readyManualRunCount: 1, runningCount: 0, errorCount: 0, catalogueCount: 2 },
      },
    });

    expect(registry.find((entry) => entry.id === 'agent_cli.runtimes')).toMatchObject({
      status: 'available',
      summary: 'detected=1 / ready=1 / manualRun=1 / readyManualRun=1 / running=0 / errors=0 / selected=Codex CLI / catalogue=2',
    });
  });

  it('summarizes native web search readiness for detected Agent CLI runtimes', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus({ runtimeMode: 'codex' }) }),
      productSurfaces: {
        agentCli: agentCliStatusForCapability(buildAgentCliRuntimeStatus([
          {
            authState: 'ready',
            capabilities: buildDefaultAgentCliRuntimeCapabilities('codex', 'Codex CLI', 'codex-cli 0.133.0', {
              webSearch: true,
            }),
            command: 'codex',
            executionSupport: 'manual_run',
            id: 'codex',
            installed: true,
            label: 'Codex CLI',
            missingReason: null,
            version: 'codex-cli 0.133.0',
            workload: 'idle',
          },
          {
            authState: 'ready',
            capabilities: buildDefaultAgentCliRuntimeCapabilities('claude', 'Claude Code', '2.1.144'),
            command: 'claude',
            executionSupport: 'manual_run',
            id: 'claude',
            installed: true,
            label: 'Claude Code',
            missingReason: null,
            version: '2.1.144',
            workload: 'idle',
          },
        ]), 'codex'),
      },
    });

    expect(registry.find((entry) => entry.id === 'agent_cli.runtimes')).toMatchObject({
      summary: 'detected=2 / ready=2 / manualRun=2 / readyManualRun=2 / running=0 / errors=0 / nativeWebSearch=runtime_dependent:1 / nativeWebSearchUnverified=1 / selected=Codex CLI / selectedNativeWebSearch=runtime_dependent / catalogue=2',
    });
  });

  it('does not summarize native web search as runtime-dependent for runtimes that still need login', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus({ runtimeMode: 'claude' }) }),
      productSurfaces: {
        agentCli: agentCliStatusForCapability(buildAgentCliRuntimeStatus([
          {
            authState: 'needs_login',
            capabilities: buildDefaultAgentCliRuntimeCapabilities('claude', 'Claude Code', '2.1.144', {
              webSearch: true,
            }),
            command: 'claude',
            executionSupport: 'manual_run',
            id: 'claude',
            installed: true,
            label: 'Claude Code',
            missingReason: 'Claude Code login required.',
            version: '2.1.144',
            workload: 'idle',
          },
        ]), 'claude'),
      },
    });

    expect(registry.find((entry) => entry.id === 'agent_cli.runtimes')).toMatchObject({
      summary: 'detected=1 / ready=0 / manualRun=1 / readyManualRun=0 / running=0 / errors=0 / nativeWebSearchUnverified=1 / selected=Claude Code / selectedNativeWebSearch=unverified / catalogue=2',
    });
  });

  it('marks selected Agent API Runtime as available for supported provider-backed phases', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus({ runtimeMode: 'api' }) }),
    });

    expect(registry.find((entry) => entry.id === 'agent_cli.runtimes')?.summary).not.toContain('selected=');
    expect(registry.find((entry) => entry.id === 'agent_api.runtime')).toMatchObject({
      status: 'available',
      configured: true,
      missingReason: null,
      summary: expect.stringContaining('providerToolReadiness=not_declared / providerToolStatus=not_declared / providerToolRequirements=4/5 / providerToolMissingRequirements=explicit_tool_declaration / selectedApiRuntime=ready / providerConfigured=ready / configuredProvider=anthropic / providerOwnedMetadata=ready / providerMetadataMatchesSelected=yes / providerMetadataOwner=provider / providerMetadataPackage=@ai-sdk/anthropic / explicitToolDeclaration=missing / explicitToolDeclarationSource=provider_owned_metadata / explicitToolDeclarationPackage=@ai-sdk/anthropic / explicitToolDeclarationPackageMatchesMetadata=yes / declaredToolCount=0 / declaredWebSearchToolCount=0 / declaredWebSearchTools=none / startupProbe=never / selected=true / provider=configured'),
    });
    expect(RUNTIME_ENTRYPOINT_COVERAGE.find((entry) => entry.id === 'run.triggerAgentApi.future')?.requiredGates)
      .toEqual(expect.arrayContaining(['runtime_context_assembly', 'context_readiness', 'task_memory_coverage', 'task_memory_guidance', 'pre_step', 'subtask_start', 'post_step']));
  });

  it('does not mark selected Agent API Runtime available without configured provider identity', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({
        aiStatus: aiStatus({
          configured: true,
          provider: null,
          runtimeMode: 'api',
        }),
      }),
    });

    expect(registry.find((entry) => entry.id === 'agent_api.runtime')).toMatchObject({
      status: 'disabled',
      configured: false,
      summary: expect.stringContaining('providerToolReadiness=not_declared / providerToolStatus=blocked / providerToolRequirements=2/5 / providerToolMissingRequirements=provider_configured,provider_owned_metadata,explicit_tool_declaration / selectedApiRuntime=ready / providerConfigured=missing / configuredProvider=missing'),
    });
  });

  it('keeps product surfaces hidden when they are not connected or ready', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() }),
      productSurfaces: {
        externalAccess: { connectedCount: 0, errorCount: 1 },
        skills: { enabledCount: 1, readyCount: 0, needsConfigCount: 1 },
        mcp: { connectedServerCount: 1, toolCount: 0, errorCount: 1 },
        agentCli: { detectedCount: 1, readyCount: 0, manualRunCount: 1, readyManualRunCount: 0, runningCount: 0, errorCount: 0, catalogueCount: 2 },
        browser: { available: false, reason: 'Browser plugin unavailable.' },
      },
    });

    expect(registry.find((entry) => entry.id === 'external_access.connectors')).toMatchObject({
      status: 'unconfigured',
      visibility: 'hidden',
      missingReason: 'External access connector authorization is pending or has errors.',
    });
    expect(registry.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'unconfigured',
      visibility: 'hidden',
    });
    expect(registry.find((entry) => entry.id === 'mcp.servers')).toMatchObject({
      status: 'unconfigured',
      visibility: 'hidden',
    });
    expect(registry.find((entry) => entry.id === 'agent_cli.runtimes')).toMatchObject({
      status: 'unconfigured',
      visibility: 'hidden',
      missingReason: 'Agent CLI authentication is not confirmed; use the official CLI login flow before execution.',
    });
    expect(registry.find((entry) => entry.id === 'browser.operator')).toMatchObject({
      status: 'disabled',
      visibility: 'hidden',
      missingReason: 'Browser plugin unavailable.',
    });
  });

  it('does not mark Agent CLI available when only a status-only runtime is authenticated', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() }),
      productSurfaces: {
        agentCli: {
          catalogueCount: 2,
          detectedCount: 2,
          errorCount: 0,
          manualRunCount: 1,
          readyCount: 1,
          readyManualRunCount: 0,
          runningCount: 0,
        },
      },
    });

    expect(registry.find((entry) => entry.id === 'agent_cli.runtimes')).toMatchObject({
      configured: false,
      status: 'unconfigured',
      summary: 'detected=2 / ready=1 / manualRun=1 / readyManualRun=0 / running=0 / errors=0 / catalogue=2',
    });
  });

  it('keeps ready Skills and connected MCP servers hidden until runtime gates expose model-visible tools', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() }),
      productSurfaces: {
        skills: { enabledCount: 1, readyCount: 1, modelVisibleCount: 0, needsConfigCount: 0, catalogueCount: 1 },
        mcp: { connectedServerCount: 1, toolCount: 3, modelVisibleToolCount: 0, errorCount: 0, catalogueCount: 1 },
      },
    });

    expect(registry.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'unconfigured',
      configured: false,
      visibility: 'hidden',
      missingReason: 'Ready skills are not exposed through the runtime tool gate.',
      summary: 'enabled=1 / ready=1 / modelVisible=0 / needsConfig=0 / catalogue=1',
    });
    expect(registry.find((entry) => entry.id === 'mcp.servers')).toMatchObject({
      status: 'unconfigured',
      configured: false,
      visibility: 'hidden',
      missingReason: 'Connected MCP tools are not exposed through the runtime tool gate.',
      summary: 'connectedServers=1 / tools=3 / modelVisibleTools=0 / errors=0 / catalogue=1',
    });
  });

  it('uses scaffold summaries for reserved skill, mcp, and browser capability rows', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({
        aiStatus: aiStatus({
          toolScaffoldSummaries: [
            toolSummary(),
            toolSummary({
              family: 'skill',
              descriptorIds: ['skill.prompt_shape'],
              implementedCount: 0,
              reservedCount: 1,
              checkpointRequiredIds: [],
              modelVisibleIds: [],
              summary: 'skill scaffold reserved',
            }),
            toolSummary({
              family: 'mcp',
              descriptorIds: ['mcp.safe_read'],
              implementedCount: 0,
              reservedCount: 1,
              checkpointRequiredIds: [],
              credentialGatedIds: ['mcp.safe_read'],
              modelVisibleIds: [],
              summary: 'mcp scaffold reserved',
            }),
            toolSummary({
              family: 'browser_playwright',
              descriptorIds: ['browser.readonly_evidence', 'browser.controlled_interaction'],
              implementedCount: 0,
              reservedCount: 2,
              checkpointRequiredIds: [],
              credentialGatedIds: ['browser.readonly_evidence'],
              localVerificationRequiredIds: ['browser.readonly_evidence'],
              modelVisibleIds: [],
              summary: 'browser scaffold reserved',
            }),
          ],
        }),
      }),
    });

    expect(registry.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'unconfigured',
      configured: false,
      visibility: 'hidden',
      summary: 'skill scaffold reserved',
    });
    expect(registry.find((entry) => entry.id === 'mcp.servers')).toMatchObject({
      status: 'unconfigured',
      configured: false,
      visibility: 'hidden',
      requiresApproval: true,
      summary: 'mcp scaffold reserved',
    });
    expect(registry.find((entry) => entry.id === 'browser.operator')).toMatchObject({
      status: 'unconfigured',
      configured: false,
      visibility: 'hidden',
      requiresApproval: true,
      requiredGate: 'runtime_pre_step',
      summary: 'browser scaffold reserved',
    });
  });

  it('does not mark implemented scaffold families available unless they are model-visible', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({
        aiStatus: aiStatus({
          toolScaffoldSummaries: [
            toolSummary(),
            toolSummary({
              family: 'skill',
              descriptorIds: ['skill.local_only'],
              implementedCount: 1,
              reservedCount: 0,
              modelVisibleIds: [],
              summary: 'skill implemented but hidden',
            }),
          ],
        }),
      }),
    });

    expect(registry.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'disabled',
      configured: false,
      visibility: 'hidden',
      summary: 'skill implemented but hidden',
    });
  });
});

function aiStatus(partial: Partial<AiConfigStatus> = {}): AiConfigStatus {
  return {
    configured: true,
    apiKeyStored: true,
    apiKeySource: 'env',
    runtimeMode: 'api',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    baseUrl: null,
    workspaceRoot: '/repo',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/config.json',
    codeAgentModelProducerEnabled: true,
    codeAgentWorkspaceChecks: {
      lint: { available: true, reason: 'ok' },
      test: { available: false, reason: 'missing' },
    },
    featureFlags: {
      enableScheduler: false,
      enableSandboxCodingAgent: true,
      enableSelfCheck: true,
    },
    toolScaffoldSummaries: [toolSummary()],
    ...partial,
  };
}

function toolSummary(
  partial: Partial<AgentToolScaffoldFamilySummary> = {},
): AgentToolScaffoldFamilySummary {
  return {
    family: 'task_domain',
    descriptorIds: ['task.inspect_context', 'task.update'],
    implementedCount: 2,
    reservedCount: 0,
    connectorPolicyRecords: [],
    localVerificationEvidence: [],
    textPromptExposedIds: [],
    providerNativeExposedIds: [],
    checkpointRequiredIds: ['task.update'],
    credentialGatedIds: [],
    localVerificationRequiredIds: [],
    modelVisibleIds: ['task.inspect_context'],
    summary: 'task tools',
    ...partial,
  };
}
