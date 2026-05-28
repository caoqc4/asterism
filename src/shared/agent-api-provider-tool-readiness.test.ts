import { describe, expect, it } from 'vitest';

import {
  deriveAgentApiProviderToolMetadata,
  evaluateAgentApiProviderToolReadinessFromEvidence,
} from './agent-api-provider-tool-readiness.js';

describe('Agent API provider tool readiness', () => {
  it('does not infer provider tools from API runtime selection and provider config alone', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
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
    expect(readiness.summary).toContain('configuredProvider=openai');
    expect(readiness.summary).toContain('providerMetadataMatchesSelected=no');
    expect(readiness.summary).toContain('startupProbe=never');
    expect(readiness.summary).toContain('providerMetadataOwner=missing');
    expect(readiness.summary).toContain('providerMetadataPackage=missing');
    expect(readiness.summary).toContain('explicitToolDeclarationSource=missing');
    expect(readiness.summary).toContain('declaredToolCount=0');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=0');
    expect(readiness.summary).toContain('declaredWebSearchTools=none');
  });

  it('requires configured provider identity before satisfying provider configuration', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: null,
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@openai/agents',
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
      status: 'blocked',
      toolReadiness: 'not_declared',
      satisfiedRequirements: [
        'selected_api_runtime',
        'no_startup_probe',
      ],
      missingRequirements: [
        'provider_configured',
        'provider_owned_metadata',
        'explicit_tool_declaration',
      ],
    });
    expect(readiness.summary).toContain('providerConfigured=missing');
    expect(readiness.summary).toContain('configuredProvider=missing');
    expect(readiness.summary).toContain('providerMetadataMatchesSelected=no');
    expect(readiness.summary).toContain('explicitToolDeclarationPackage=@openai/agents');
    expect(readiness.summary).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
  });

  it('derives packaged provider metadata without declaring web/search tools', () => {
    const metadata = deriveAgentApiProviderToolMetadata('openai');
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      ...metadata,
      configuredProvider: 'openai',
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
        'provider_owned_metadata',
      ],
      missingRequirements: ['explicit_tool_declaration'],
    });
    expect(readiness.summary).toContain('providerOwnedMetadata=ready');
    expect(readiness.summary).toContain('configuredProvider=openai');
    expect(readiness.summary).toContain('providerMetadataMatchesSelected=yes');
    expect(readiness.summary).toContain('providerMetadataOwner=provider');
    expect(readiness.summary).toContain('providerMetadataPackage=@ai-sdk/openai');
    expect(readiness.summary).toContain('explicitToolDeclaration=missing');
    expect(readiness.summary).toContain('explicitToolDeclarationSource=provider_owned_metadata');
    expect(readiness.summary).toContain('explicitToolDeclarationPackage=@ai-sdk/openai');
    expect(readiness.summary).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
    expect(readiness.summary).toContain('declaredToolCount=0');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=0');
  });

  it('requires provider-owned metadata and explicit declarations before reporting tools declared', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@openai/agents',
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
    expect(readiness.summary).toContain('explicitToolDeclarationPackage=@openai/agents');
    expect(readiness.summary).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
    expect(readiness.summary).toContain('declaredToolCount=1');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
    expect(readiness.summary).toContain('declaredWebSearchTools=web_search');
  });

  it('does not treat unrelated provider-owned function tools as web/search declarations', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['taskplane.create_task', 'file_search', 'database_search'],
        packageName: '@openai/agents',
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
      status: 'not_declared',
      toolReadiness: 'not_declared',
      satisfiedRequirements: [
        'selected_api_runtime',
        'provider_configured',
        'no_startup_probe',
        'provider_owned_metadata',
      ],
      missingRequirements: ['explicit_tool_declaration'],
    });
    expect(readiness.summary).toContain('declaredToolCount=3');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=0');
    expect(readiness.summary).toContain('declaredWebSearchTools=none');
    expect(readiness.summary).toContain('explicitToolDeclaration=missing');
    expect(readiness.summary).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
  });

  it('accepts only explicit web/browse/browser/fetch tool declarations as provider web search readiness evidence', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: [
          'web_search',
          'web.fetch',
          'browser',
          'browse',
          'openai:web_search',
          'file_search',
        ],
        packageName: '@openai/agents',
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
    });
    expect(readiness.summary).toContain('declaredToolCount=6');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=5');
    expect(readiness.summary).toContain('declaredWebSearchTools=web_search,web.fetch,browser,browse,openai:web_search');
  });

  it('requires explicit provider-owned tool declarations to match provider metadata package identity', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@some/other-package',
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
      status: 'not_declared',
      toolReadiness: 'not_declared',
      missingRequirements: ['explicit_tool_declaration'],
    });
    expect(readiness.summary).toContain('providerOwnedMetadata=ready');
    expect(readiness.summary).toContain('providerMetadataPackage=@openai/agents');
    expect(readiness.summary).toContain('explicitToolDeclarationPackage=@some/other-package');
    expect(readiness.summary).toContain('explicitToolDeclarationPackageMatchesMetadata=no');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
    expect(readiness.summary).toContain('explicitToolDeclaration=missing');
  });

  it('requires provider metadata to match the configured provider when provider identity is available', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@ai-sdk/anthropic',
        source: 'provider_owned_metadata',
      },
      providerConfigured: true,
      providerOwnedMetadata: {
        owner: 'anthropic',
        packageName: '@ai-sdk/anthropic',
        present: true,
      },
      selectedRuntime: {
        mode: 'api',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'not_declared',
      toolReadiness: 'not_declared',
      missingRequirements: [
        'provider_owned_metadata',
        'explicit_tool_declaration',
      ],
    });
    expect(readiness.summary).toContain('configuredProvider=openai');
    expect(readiness.summary).toContain('providerMetadataMatchesSelected=no');
    expect(readiness.summary).toContain('providerOwnedMetadata=missing');
    expect(readiness.summary).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
  });

  it('blocks readiness when a startup probe would be needed to discover tools', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@openai/agents',
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
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
  });
});
