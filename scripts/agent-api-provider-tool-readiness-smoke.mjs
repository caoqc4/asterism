#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const providerToolReadinessModulePath = path.join(root, 'dist-electron', 'shared', 'agent-api-provider-tool-readiness.js');
const capabilityRegistryModulePath = path.join(root, 'dist-electron', 'shared', 'capability-registry.js');
const runtimeSnapshotModulePath = path.join(root, 'dist-electron', 'shared', 'runtime-capability-snapshot.js');
const sourceModulePaths = [
  path.join(root, 'src', 'shared', 'agent-api-provider-tool-readiness.ts'),
  path.join(root, 'src', 'shared', 'capability-registry.ts'),
  path.join(root, 'src', 'shared', 'runtime-capability-snapshot.ts'),
];

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
    || sourceIsNewerThanBuild()
  ) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    return 0;
  }

  const {
    deriveAgentApiProviderToolMetadata,
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

  const providerToolMetadata = deriveAgentApiProviderToolMetadata(snapshot.model.provider);
  const serviceEvidenceReadiness = evaluateAgentApiProviderToolReadinessFromEvidence({
    configuredProvider: snapshot.model.provider,
    explicitToolDeclarations: providerToolMetadata.explicitToolDeclarations,
    providerConfigured: snapshot.model.configured,
    providerOwnedMetadata: providerToolMetadata.providerOwnedMetadata,
    selectedRuntime: {
      mode: snapshot.executionRuntime.mode,
      runtimeKind: snapshot.executionRuntime.kind,
    },
    startupProbe: 'never',
  });
  const genericHelperReadiness = evaluateAgentApiProviderToolReadinessFromEvidence({
    configuredProvider: snapshot.model.provider,
    explicitToolDeclarations: {
      declaredTools: [
        'browser.search',
        'search.web_fetch',
        'task_browser',
        'vendor:browse',
        'web_search_cache',
      ],
      packageName: '@ai-sdk/openai',
      source: 'provider_owned_metadata',
    },
    providerConfigured: snapshot.model.configured,
    providerOwnedMetadata: providerToolMetadata.providerOwnedMetadata,
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
  console.log(`configuredProvider=${scalarValue(agentApiRuntime.summary, 'configuredProvider') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'configuredProvider') ?? 'missing'}`);
  console.log(`providerOwnedMetadata=${scalarValue(agentApiRuntime.summary, 'providerOwnedMetadata') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'providerOwnedMetadata') ?? 'missing'}`);
  console.log(`providerMetadataMatchesSelected=${scalarValue(agentApiRuntime.summary, 'providerMetadataMatchesSelected') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataMatchesSelected') ?? 'missing'}`);
  console.log(`providerMetadataOwner=${scalarValue(agentApiRuntime.summary, 'providerMetadataOwner') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataOwner') ?? 'missing'}`);
  console.log(`providerMetadataPackage=${scalarValue(agentApiRuntime.summary, 'providerMetadataPackage') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataPackage') ?? 'missing'}`);
  console.log(`explicitToolDeclaration=${scalarValue(agentApiRuntime.summary, 'explicitToolDeclaration') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclaration') ?? 'missing'}`);
  console.log(`explicitToolDeclarationSource=${scalarValue(agentApiRuntime.summary, 'explicitToolDeclarationSource') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationSource') ?? 'missing'}`);
  console.log(`explicitToolDeclarationPackage=${scalarValue(agentApiRuntime.summary, 'explicitToolDeclarationPackage') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationPackage') ?? 'missing'}`);
  console.log(`explicitToolDeclarationPackageMatchesMetadata=${scalarValue(agentApiRuntime.summary, 'explicitToolDeclarationPackageMatchesMetadata') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationPackageMatchesMetadata') ?? 'missing'}`);
  console.log(`declaredToolCount=${scalarValue(agentApiRuntime.summary, 'declaredToolCount') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredToolCount') ?? 'missing'}`);
  console.log(`declaredWebSearchToolCount=${scalarValue(agentApiRuntime.summary, 'declaredWebSearchToolCount') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchToolCount') ?? '0'}`);
  console.log(`declaredWebSearchTools=${scalarValue(agentApiRuntime.summary, 'declaredWebSearchTools') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchTools') ?? 'none'}`);
  console.log(`trustedWebSearchToolCount=${scalarValue(agentApiRuntime.summary, 'trustedWebSearchToolCount') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'trustedWebSearchToolCount') ?? '0'}`);
  console.log(`trustedWebSearchTools=${scalarValue(agentApiRuntime.summary, 'trustedWebSearchTools') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'trustedWebSearchTools') ?? 'none'}`);
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
  console.log(`serviceEvidenceConfiguredProvider=${serviceScalarValue(serviceEvidenceReadiness.summary, 'configuredProvider') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderOwnedMetadata=${serviceScalarValue(serviceEvidenceReadiness.summary, 'providerOwnedMetadata') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderMetadataMatchesSelected=${serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataMatchesSelected') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderMetadataOwner=${serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataOwner') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderMetadataPackage=${serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataPackage') ?? 'missing'}`);
  console.log(`serviceEvidenceExplicitToolDeclaration=${serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclaration') ?? 'missing'}`);
  console.log(`serviceEvidenceExplicitToolDeclarationSource=${serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationSource') ?? 'missing'}`);
  console.log(`serviceEvidenceExplicitToolDeclarationPackage=${serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationPackage') ?? 'missing'}`);
  console.log(`serviceEvidenceExplicitToolDeclarationPackageMatchesMetadata=${serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationPackageMatchesMetadata') ?? 'missing'}`);
  console.log(`serviceEvidenceDeclaredToolCount=${serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredToolCount') ?? 'missing'}`);
  console.log(`serviceEvidenceDeclaredWebSearchToolCount=${serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchToolCount') ?? '0'}`);
  console.log(`serviceEvidenceDeclaredWebSearchTools=${serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchTools') ?? 'none'}`);
  console.log(`serviceEvidenceTrustedWebSearchToolCount=${serviceScalarValue(serviceEvidenceReadiness.summary, 'trustedWebSearchToolCount') ?? '0'}`);
  console.log(`serviceEvidenceTrustedWebSearchTools=${serviceScalarValue(serviceEvidenceReadiness.summary, 'trustedWebSearchTools') ?? 'none'}`);
  console.log(`genericHelperProviderToolStatus=${genericHelperReadiness.status}`);
  console.log(`genericHelperProviderToolReadiness=${genericHelperReadiness.toolReadiness}`);
  console.log(`genericHelperProviderToolRequirements=${genericHelperReadiness.satisfiedRequirements.length}/5`);
  console.log(`genericHelperProviderToolMissingRequirements=${genericHelperReadiness.missingRequirements.join(',') || 'none'}`);
  console.log(`genericHelperDeclaredToolCount=${serviceScalarValue(genericHelperReadiness.summary, 'declaredToolCount') ?? 'missing'}`);
  console.log(`genericHelperDeclaredWebSearchToolCount=${serviceScalarValue(genericHelperReadiness.summary, 'declaredWebSearchToolCount') ?? '0'}`);
  console.log(`genericHelperDeclaredWebSearchTools=${serviceScalarValue(genericHelperReadiness.summary, 'declaredWebSearchTools') ?? 'none'}`);
  console.log(`genericHelperTrustedWebSearchToolCount=${serviceScalarValue(genericHelperReadiness.summary, 'trustedWebSearchToolCount') ?? '0'}`);
  console.log(`genericHelperTrustedWebSearchTools=${serviceScalarValue(genericHelperReadiness.summary, 'trustedWebSearchTools') ?? 'none'}`);

  const failureReasons = [
    snapshot.executionRuntime.kind !== 'agent_api' ? 'runtime_kind' : null,
    snapshot.executionRuntime.executable ? 'runtime_executable' : null,
    agentApiRuntime.status !== 'available' ? 'capability_status' : null,
    agentApiRuntime.visibility !== 'hidden' ? 'capability_visibility' : null,
    agentApiRuntime.access !== 'mutating' ? 'capability_access' : null,
    agentApiRuntime.requiresApproval !== true ? 'requires_approval' : null,
    !agentApiRuntime.summary.includes('providerToolReadiness=not_declared') ? 'provider_tool_readiness' : null,
    providerToolStatus !== 'not_declared' ? 'provider_tool_status' : null,
    !agentApiRuntime.summary.includes('providerToolRequirements=4/5') ? 'provider_tool_requirements' : null,
    !agentApiRuntime.summary.includes('providerToolMissingRequirements=explicit_tool_declaration') ? 'provider_tool_missing_requirements' : null,
    !agentApiRuntime.summary.includes('selectedApiRuntime=ready') ? 'selected_api_runtime' : null,
    !agentApiRuntime.summary.includes('providerConfigured=ready') ? 'provider_configured' : null,
    !agentApiRuntime.summary.includes('configuredProvider=openai') ? 'configured_provider' : null,
    !agentApiRuntime.summary.includes('providerOwnedMetadata=ready') ? 'provider_owned_metadata' : null,
    !agentApiRuntime.summary.includes('providerMetadataMatchesSelected=yes') ? 'provider_metadata_matches_selected' : null,
    !agentApiRuntime.summary.includes('providerMetadataPackage=@ai-sdk/openai') ? 'provider_metadata_package' : null,
    !agentApiRuntime.summary.includes('explicitToolDeclaration=missing') ? 'explicit_tool_declaration' : null,
    !agentApiRuntime.summary.includes('explicitToolDeclarationPackage=@ai-sdk/openai') ? 'explicit_tool_declaration_package' : null,
    !agentApiRuntime.summary.includes('explicitToolDeclarationPackageMatchesMetadata=yes') ? 'explicit_tool_declaration_package_matches_metadata' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataOwner') !== 'provider' ? 'service_metadata_owner' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'configuredProvider') !== 'openai' ? 'service_configured_provider' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataMatchesSelected') !== 'yes' ? 'service_metadata_matches_selected' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataPackage') !== '@ai-sdk/openai' ? 'service_metadata_package' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationSource') !== 'provider_owned_metadata' ? 'service_tool_declaration_source' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationPackage') !== '@ai-sdk/openai' ? 'service_tool_declaration_package' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationPackageMatchesMetadata') !== 'yes' ? 'service_tool_declaration_package_matches_metadata' : null,
    serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredToolCount') !== '0' ? 'service_declared_tool_count' : null,
    (serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchToolCount') ?? '0') !== '0' ? 'service_declared_web_search_tool_count' : null,
    (serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredWebSearchTools') ?? 'none') !== 'none' ? 'service_declared_web_search_tools' : null,
    (serviceScalarValue(serviceEvidenceReadiness.summary, 'trustedWebSearchToolCount') ?? '0') !== '0' ? 'service_trusted_web_search_tool_count' : null,
    (serviceScalarValue(serviceEvidenceReadiness.summary, 'trustedWebSearchTools') ?? 'none') !== 'none' ? 'service_trusted_web_search_tools' : null,
    !agentApiRuntime.summary.includes('startupProbe=never') ? 'startup_probe' : null,
    !agentApiRuntime.summary.includes('executionRun=deferred') ? 'execution_run' : null,
    serviceEvidenceReadiness.status !== 'not_declared' ? 'service_status' : null,
    serviceEvidenceReadiness.satisfiedRequirements.length !== 4 ? 'service_requirement_count' : null,
    serviceEvidenceReadiness.missingRequirements.includes('provider_owned_metadata') ? 'service_provider_owned_metadata_missing' : null,
    !serviceEvidenceReadiness.missingRequirements.includes('explicit_tool_declaration') ? 'service_explicit_tool_declaration_missing' : null,
    genericHelperReadiness.status !== 'not_declared' ? 'generic_helper_status' : null,
    genericHelperReadiness.toolReadiness !== 'not_declared' ? 'generic_helper_tool_readiness' : null,
    genericHelperReadiness.satisfiedRequirements.length !== 4 ? 'generic_helper_requirement_count' : null,
    !genericHelperReadiness.missingRequirements.includes('explicit_tool_declaration') ? 'generic_helper_explicit_tool_declaration_missing' : null,
    serviceScalarValue(genericHelperReadiness.summary, 'declaredToolCount') !== '5' ? 'generic_helper_declared_tool_count' : null,
    (serviceScalarValue(genericHelperReadiness.summary, 'declaredWebSearchToolCount') ?? '0') !== '0' ? 'generic_helper_declared_web_search_tool_count' : null,
    (serviceScalarValue(genericHelperReadiness.summary, 'declaredWebSearchTools') ?? 'none') !== 'none' ? 'generic_helper_declared_web_search_tools' : null,
    (serviceScalarValue(genericHelperReadiness.summary, 'trustedWebSearchToolCount') ?? '0') !== '0' ? 'generic_helper_trusted_web_search_tool_count' : null,
    (serviceScalarValue(genericHelperReadiness.summary, 'trustedWebSearchTools') ?? 'none') !== 'none' ? 'generic_helper_trusted_web_search_tools' : null,
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

function sourceIsNewerThanBuild() {
  const buildModulePaths = [
    providerToolReadinessModulePath,
    capabilityRegistryModulePath,
    runtimeSnapshotModulePath,
  ];
  if (buildModulePaths.some((modulePath) => !fs.existsSync(modulePath))) {
    return false;
  }
  const oldestBuildTime = Math.min(...buildModulePaths.map((modulePath) => fs.statSync(modulePath).mtimeMs));
  return sourceModulePaths.some((modulePath) =>
    fs.existsSync(modulePath) && fs.statSync(modulePath).mtimeMs > oldestBuildTime);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runAgentApiProviderToolReadinessSmoke();
}
