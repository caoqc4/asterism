#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const providerToolReadinessModulePath = path.join(root, 'dist-electron', 'shared', 'agent-api-provider-tool-readiness.js');
const capabilityRegistryModulePath = path.join(root, 'dist-electron', 'shared', 'capability-registry.js');
const runtimeSnapshotModulePath = path.join(root, 'dist-electron', 'shared', 'runtime-capability-snapshot.js');

export async function runAgentApiProviderToolReadinessSmoke() {
  console.log('Agent API provider tool readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('network=not-called');
  console.log('startupProbe=not-attempted');
  console.log('workspace=unchanged');

  if (
    !fs.existsSync(providerToolReadinessModulePath)
    || !fs.existsSync(capabilityRegistryModulePath)
    || !fs.existsSync(runtimeSnapshotModulePath)
  ) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    return 0;
  }

  const {
    evaluateAgentApiProviderToolReadinessFromEvidence,
  } = await import(pathToFileURL(providerToolReadinessModulePath).href);
  const { buildCapabilityRegistry } = await import(pathToFileURL(capabilityRegistryModulePath).href);
  const { buildRuntimeCapabilitySnapshot } = await import(pathToFileURL(runtimeSnapshotModulePath).href);
  const snapshot = buildRuntimeCapabilitySnapshot({
    aiStatus: {
      apiKeySource: 'env',
      apiKeyStored: true,
      baseUrl: null,
      codeAgentModelProducerEnabled: false,
      codeAgentWorkspaceChecks: {
        lint: { available: false, reason: 'not checked by read-only smoke' },
        test: { available: false, reason: 'not checked by read-only smoke' },
      },
      configured: true,
      configPath: null,
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
        enableSelfCheck: false,
      },
      model: 'read-only-smoke-model',
      provider: 'openai',
      runtimeMode: 'api',
      toolScaffoldSummaries: [],
      updatedAt: null,
      workspaceRoot: null,
    },
  });
  const registry = buildCapabilityRegistry({ snapshot });
  const agentApiRuntime = registry.find((entry) => entry.id === 'agent_api.runtime');

  if (!agentApiRuntime) {
    console.log('status=failed');
    console.log('error=agent_api.runtime capability row missing');
    return 1;
  }

  const serviceEvidenceReadiness = evaluateAgentApiProviderToolReadinessFromEvidence({
    providerConfigured: snapshot.model.configured,
    selectedRuntime: {
      mode: snapshot.executionRuntime.mode,
      runtimeKind: snapshot.executionRuntime.kind,
    },
    startupProbe: 'never',
  });
  const providerToolStatus = scalarValue(agentApiRuntime.summary, 'providerToolStatus') ?? serviceEvidenceReadiness.status;

  console.log(`runtimeKind=${snapshot.executionRuntime.kind}`);
  console.log(`runtimeSelected=${snapshot.executionRuntime.mode}`);
  console.log(`runtimeExecutable=${snapshot.executionRuntime.executable ? 'yes' : 'no'}`);
  console.log(`providerConfigured=${snapshot.model.configured ? 'yes' : 'no'}`);
  console.log(`capabilityStatus=${agentApiRuntime.status}`);
  console.log(`capabilityVisibility=${agentApiRuntime.visibility}`);
  console.log(`capabilityAccess=${agentApiRuntime.access}`);
  console.log(`requiresApproval=${String(agentApiRuntime.requiresApproval)}`);
  console.log(`providerToolReadiness=${scalarValue(agentApiRuntime.summary, 'providerToolReadiness') ?? 'missing'}`);
  console.log(`providerToolStatus=${providerToolStatus}`);
  console.log(`providerToolRequirements=${scalarValue(agentApiRuntime.summary, 'providerToolRequirements') ?? 'missing'}`);
  console.log(`providerToolMissingRequirements=${scalarValue(agentApiRuntime.summary, 'providerToolMissingRequirements') ?? 'missing'}`);
  console.log(`selectedApiRuntime=${scalarValue(agentApiRuntime.summary, 'selectedApiRuntime') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'selectedApiRuntime') ?? 'missing'}`);
  console.log(`providerConfiguredStatus=${scalarValue(agentApiRuntime.summary, 'providerConfigured') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'providerConfigured') ?? 'missing'}`);
  console.log(`providerOwnedMetadata=${scalarValue(agentApiRuntime.summary, 'providerOwnedMetadata') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'providerOwnedMetadata') ?? 'missing'}`);
  console.log(`providerMetadataOwner=${scalarValue(agentApiRuntime.summary, 'providerMetadataOwner') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataOwner') ?? 'missing'}`);
  console.log(`providerMetadataPackage=${scalarValue(agentApiRuntime.summary, 'providerMetadataPackage') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataPackage') ?? 'missing'}`);
  console.log(`explicitToolDeclaration=${scalarValue(agentApiRuntime.summary, 'explicitToolDeclaration') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclaration') ?? 'missing'}`);
  console.log(`explicitToolDeclarationSource=${scalarValue(agentApiRuntime.summary, 'explicitToolDeclarationSource') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationSource') ?? 'missing'}`);
  console.log(`declaredToolCount=${scalarValue(agentApiRuntime.summary, 'declaredToolCount') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredToolCount') ?? 'missing'}`);
  console.log(`declaredWebSearchToolCount=${scalarValue(agentApiRuntime.summary, 'declaredWebSearchToolCount') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchToolCount') ?? '0'}`);
  console.log(`declaredWebSearchTools=${scalarValue(agentApiRuntime.summary, 'declaredWebSearchTools') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchTools') ?? 'none'}`);
  console.log(`startupProbe=${scalarValue(agentApiRuntime.summary, 'startupProbe') ?? 'missing'}`);
  console.log(`executionRun=${scalarValue(agentApiRuntime.summary, 'executionRun') ?? 'missing'}`);
  console.log(`executionRunPromotionRequirements=${scalarValue(agentApiRuntime.summary, 'executionRunPromotionRequirements') ?? 'missing'}`);
  console.log(`decompositionPromotionRequirements=${scalarValue(agentApiRuntime.summary, 'decompositionPromotionRequirements') ?? 'missing'}`);

  console.log(`serviceEvidenceProviderToolStatus=${serviceEvidenceReadiness.status}`);
  console.log(`serviceEvidenceProviderToolReadiness=${serviceEvidenceReadiness.toolReadiness}`);
  console.log(`serviceEvidenceProviderToolRequirements=${serviceEvidenceReadiness.satisfiedRequirements.length}/5`);
  console.log(`serviceEvidenceProviderToolMissingRequirements=${serviceEvidenceReadiness.missingRequirements.join(',') || 'none'}`);
  console.log(`serviceEvidenceSelectedApiRuntime=${serviceScalarValue(serviceEvidenceReadiness.summary, 'selectedApiRuntime') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderConfigured=${serviceScalarValue(serviceEvidenceReadiness.summary, 'providerConfigured') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderOwnedMetadata=${serviceScalarValue(serviceEvidenceReadiness.summary, 'providerOwnedMetadata') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderMetadataOwner=${serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataOwner') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderMetadataPackage=${serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataPackage') ?? 'missing'}`);
  console.log(`serviceEvidenceExplicitToolDeclaration=${serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclaration') ?? 'missing'}`);
  console.log(`serviceEvidenceExplicitToolDeclarationSource=${serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationSource') ?? 'missing'}`);
  console.log(`serviceEvidenceDeclaredToolCount=${serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredToolCount') ?? 'missing'}`);
  console.log(`serviceEvidenceDeclaredWebSearchToolCount=${serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchToolCount') ?? '0'}`);
  console.log(`serviceEvidenceDeclaredWebSearchTools=${serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchTools') ?? 'none'}`);

  const failureReasons = [
    snapshot.executionRuntime.kind !== 'agent_api' ? 'runtime_kind' : null,
    snapshot.executionRuntime.executable ? 'runtime_executable' : null,
    agentApiRuntime.status !== 'available' ? 'capability_status' : null,
    agentApiRuntime.visibility !== 'hidden' ? 'capability_visibility' : null,
    agentApiRuntime.access !== 'mutating' ? 'capability_access' : null,
    agentApiRuntime.requiresApproval !== true ? 'requires_approval' : null,
    !agentApiRuntime.summary.includes('providerToolReadiness=not_declared') ? 'provider_tool_readiness' : null,
    providerToolStatus !== 'not_declared' ? 'provider_tool_status' : null,
    !agentApiRuntime.summary.includes('providerToolRequirements=3/5') ? 'provider_tool_requirements' : null,
    !agentApiRuntime.summary.includes('providerToolMissingRequirements=provider_owned_metadata,explicit_tool_declaration') ? 'provider_tool_missing_requirements' : null,
    !agentApiRuntime.summary.includes('selectedApiRuntime=ready') ? 'selected_api_runtime' : null,
    !agentApiRuntime.summary.includes('providerConfigured=ready') ? 'provider_configured' : null,
    !agentApiRuntime.summary.includes('providerOwnedMetadata=missing') ? 'provider_owned_metadata' : null,
    !agentApiRuntime.summary.includes('explicitToolDeclaration=missing') ? 'explicit_tool_declaration' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataOwner') !== 'missing' ? 'service_metadata_owner' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataPackage') !== 'missing' ? 'service_metadata_package' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationSource') !== 'missing' ? 'service_tool_declaration_source' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredToolCount') !== '0' ? 'service_declared_tool_count' : null,
    (serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchToolCount') ?? '0') !== '0' ? 'service_declared_web_search_tool_count' : null,
    (serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchTools') ?? 'none') !== 'none' ? 'service_declared_web_search_tools' : null,
    !agentApiRuntime.summary.includes('startupProbe=never') ? 'startup_probe' : null,
    !agentApiRuntime.summary.includes('executionRun=deferred') ? 'execution_run' : null,
    serviceEvidenceReadiness.status !== 'not_declared' ? 'service_status' : null,
    serviceEvidenceReadiness.satisfiedRequirements.length !== 3 ? 'service_requirement_count' : null,
    !serviceEvidenceReadiness.missingRequirements.includes('provider_owned_metadata') ? 'service_provider_owned_metadata_missing' : null,
    !serviceEvidenceReadiness.missingRequirements.includes('explicit_tool_declaration') ? 'service_explicit_tool_declaration_missing' : null,
  ].filter(Boolean);

  if (failureReasons.length > 0) {
    console.log(`failureReasons=${failureReasons.join(',')}`);
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

function scalarValue(summary, key) {
  const prefix = `${key}=`;
  const part = summary.split(' / ').find((item) => item.startsWith(prefix));
  return part?.slice(prefix.length).trim() ?? null;
}

function serviceScalarValue(summary, key) {
  return scalarValue(summary, key);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runAgentApiProviderToolReadinessSmoke();
}
