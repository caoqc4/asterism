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
  console.log(`providerMetadataOwner=${scalarValue(agentApiRuntime.summary, 'providerMetadataOwner') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataOwner') ?? 'missing'}`);
  console.log(`explicitToolDeclarationSource=${scalarValue(agentApiRuntime.summary, 'explicitToolDeclarationSource') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationSource') ?? 'missing'}`);
  console.log(`declaredToolCount=${scalarValue(agentApiRuntime.summary, 'declaredToolCount') ?? serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredToolCount') ?? 'missing'}`);
  console.log(`startupProbe=${scalarValue(agentApiRuntime.summary, 'startupProbe') ?? 'missing'}`);
  console.log(`executionRun=${scalarValue(agentApiRuntime.summary, 'executionRun') ?? 'missing'}`);
  console.log(`executionRunPromotionRequirements=${scalarValue(agentApiRuntime.summary, 'executionRunPromotionRequirements') ?? 'missing'}`);
  console.log(`decompositionPromotionRequirements=${scalarValue(agentApiRuntime.summary, 'decompositionPromotionRequirements') ?? 'missing'}`);

  console.log(`serviceEvidenceProviderToolStatus=${serviceEvidenceReadiness.status}`);
  console.log(`serviceEvidenceProviderToolReadiness=${serviceEvidenceReadiness.toolReadiness}`);
  console.log(`serviceEvidenceProviderToolRequirements=${serviceEvidenceReadiness.satisfiedRequirements.length}/5`);
  console.log(`serviceEvidenceProviderToolMissingRequirements=${serviceEvidenceReadiness.missingRequirements.join(',') || 'none'}`);
  console.log(`serviceEvidenceProviderMetadataOwner=${serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataOwner') ?? 'missing'}`);
  console.log(`serviceEvidenceExplicitToolDeclarationSource=${serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationSource') ?? 'missing'}`);
  console.log(`serviceEvidenceDeclaredToolCount=${serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredToolCount') ?? 'missing'}`);

  if (
    snapshot.executionRuntime.kind !== 'agent_api'
    || snapshot.executionRuntime.executable
    || agentApiRuntime.status !== 'available'
    || agentApiRuntime.visibility !== 'hidden'
    || agentApiRuntime.access !== 'mutating'
    || agentApiRuntime.requiresApproval !== true
    || !agentApiRuntime.summary.includes('providerToolReadiness=not_declared')
    || providerToolStatus !== 'not_declared'
    || !agentApiRuntime.summary.includes('providerToolRequirements=3/5')
    || !agentApiRuntime.summary.includes('providerToolMissingRequirements=provider_owned_metadata,explicit_tool_declaration')
    || serviceScalarValue(serviceEvidenceReadiness.summary, 'providerMetadataOwner') !== 'missing'
    || serviceScalarValue(serviceEvidenceReadiness.summary, 'explicitToolDeclarationSource') !== 'missing'
    || serviceScalarValue(serviceEvidenceReadiness.summary, 'declaredToolCount') !== '0'
    || !agentApiRuntime.summary.includes('startupProbe=never')
    || !agentApiRuntime.summary.includes('executionRun=deferred')
    || serviceEvidenceReadiness.status !== 'not_declared'
    || serviceEvidenceReadiness.satisfiedRequirements.length !== 3
    || !serviceEvidenceReadiness.missingRequirements.includes('provider_owned_metadata')
    || !serviceEvidenceReadiness.missingRequirements.includes('explicit_tool_declaration')
  ) {
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
