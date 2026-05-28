import { describe, expect, it } from 'vitest';

import { evaluateAgentApiProviderToolReadinessFromEvidence } from './agent-api-provider-tool-readiness.js';

describe('Agent API provider tool readiness', () => {
  it('does not infer provider tools from API runtime selection and provider config alone', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      providerConfigured: true,
      selectedRuntime: {
        mode: 'api',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'not_declared',
      toolReadiness: 'not_declared',
      satisfiedRequirements: [
        'selected_api_runtime',
        'provider_configured',
        'no_startup_probe',
      ],
      missingRequirements: [
        'provider_owned_metadata',
        'explicit_tool_declaration',
      ],
    });
    expect(readiness.summary).toContain('providerToolReadiness=not_declared');
    expect(readiness.summary).toContain('requirements=3/5');
    expect(readiness.summary).toContain('startupProbe=never');
    expect(readiness.summary).toContain('providerMetadataOwner=missing');
    expect(readiness.summary).toContain('explicitToolDeclarationSource=missing');
    expect(readiness.summary).toContain('declaredToolCount=0');
  });

  it('requires provider-owned metadata and explicit declarations before reporting tools declared', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        source: 'provider_owned_metadata',
      },
      providerConfigured: true,
      providerOwnedMetadata: {
        owner: 'openai',
        packageName: '@openai/agents',
        present: true,
      },
      selectedRuntime: {
        mode: 'api',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'declared',
      toolReadiness: 'declared',
      missingRequirements: [],
      satisfiedRequirements: [
        'selected_api_runtime',
        'provider_configured',
        'no_startup_probe',
        'provider_owned_metadata',
        'explicit_tool_declaration',
      ],
    });
    expect(readiness.summary).toContain('providerToolReadiness=declared');
    expect(readiness.summary).toContain('requirements=5/5');
    expect(readiness.summary).toContain('providerMetadataOwner=openai');
    expect(readiness.summary).toContain('providerMetadataPackage=@openai/agents');
    expect(readiness.summary).toContain('explicitToolDeclarationSource=provider_owned_metadata');
    expect(readiness.summary).toContain('declaredToolCount=1');
  });

  it('blocks readiness when a startup probe would be needed to discover tools', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        source: 'runtime_probe',
      },
      providerConfigured: true,
      providerOwnedMetadata: {
        owner: 'openai',
        packageName: '@openai/agents',
        present: true,
      },
      selectedRuntime: {
        mode: 'api',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'called',
    });

    expect(readiness).toMatchObject({
      status: 'blocked',
      toolReadiness: 'not_declared',
      missingRequirements: [
        'no_startup_probe',
        'explicit_tool_declaration',
      ],
    });
    expect(readiness.summary).toContain('startupProbe=called');
    expect(readiness.summary).toContain('explicitToolDeclarationSource=runtime_probe');
    expect(readiness.summary).toContain('declaredToolCount=1');
  });
});
