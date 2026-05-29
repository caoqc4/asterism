import { describe, expect, it } from 'vitest';

import {
  deriveAgentApiProviderToolMetadata,
  evaluateAgentApiProviderNativeSessionReadinessFromEvidence,
  evaluateAgentApiProviderToolReadinessFromEvidence,
} from './agent-api-provider-tool-readiness.js';

describe('Agent API provider tool readiness', () => {
  it('keeps provider-native session readiness blocked until payload and provider call identity evidence exists', () => {
    const readiness = evaluateAgentApiProviderNativeSessionReadinessFromEvidence({
      featureFlagEnabled: true,
      selectedRuntimeProvider: 'openai',
    });

    expect(readiness).toMatchObject({
      ready: false,
      satisfiedRequirements: [
        'feature_flag',
        'selected_runtime_provider',
      ],
      missingRequirements: [
        'provider_payload_identity',
        'normalized_plan_identity',
        'provider_call_ids',
        'provider_web_search_calls',
        'provider_web_search_declaration',
      ],
    });
    expect(readiness.summary).toContain('providerNativeSessionReady=no');
    expect(readiness.summary).toContain('providerNativeSessionRequirements=2/7');
    expect(readiness.summary).toContain('providerNativeFlag=enabled');
    expect(readiness.summary).toContain('providerNativeSelectedProvider=openai');
    expect(readiness.summary).toContain('providerNativePayloadProvider=missing');
    expect(readiness.summary).toContain('providerNativePlanProvider=missing');
    expect(readiness.summary).toContain('providerNativeProviderCallIds=missing');
    expect(readiness.summary).toContain('providerNativeProviderCallIdCount=0');
    expect(readiness.summary).toContain('providerNativeProviderCallTools=missing');
    expect(readiness.summary).toContain('providerNativeProviderWebSearchCallCount=0');
    expect(readiness.summary).toContain('providerNativeProviderWebSearchCallTools=none');
    expect(readiness.summary).toContain('providerNativeTrustedWebSearchDeclarationCount=0');
    expect(readiness.summary).toContain('providerNativeTrustedWebSearchDeclarations=none');
    expect(readiness.summary).toContain('providerNativeTrustedWebSearchCallCount=0');
    expect(readiness.summary).toContain('providerNativeUntrustedWebSearchCallCount=0');
  });

  it('requires provider-native payload, normalized plan, and call ids to match selected provider', () => {
    const mismatched = evaluateAgentApiProviderNativeSessionReadinessFromEvidence({
      featureFlagEnabled: true,
      normalizedPlanProvider: 'openai',
      payloadProvider: 'anthropic',
      providerCallSource: 'provider_payload',
      providerCallIds: ['call_1'],
      providerCallToolNames: ['web_search_preview'],
      selectedRuntimeProvider: 'openai',
    });

    expect(mismatched).toMatchObject({
      ready: false,
      missingRequirements: ['provider_payload_identity', 'provider_web_search_declaration'],
    });
    expect(mismatched.summary).toContain('providerNativePayloadProvider=anthropic');
    expect(mismatched.summary).toContain('providerNativePayloadProviderMatchesSelected=no');

    const ready = evaluateAgentApiProviderNativeSessionReadinessFromEvidence({
      featureFlagEnabled: true,
      normalizedPlanProvider: 'openai',
      payloadProvider: 'openai',
      providerCallSource: 'provider_payload',
      providerCallIds: ['call_1', '  call_2  '],
      providerCallToolNames: ['web_search_preview', 'openai:web_search'],
      trustedProviderWebSearchToolNames: ['web_search_preview', 'openai:web_search'],
      selectedRuntimeProvider: 'openai',
    });

    expect(ready).toMatchObject({
      ready: true,
      missingRequirements: [],
    });
    expect(ready.summary).toContain('providerNativeSessionReady=yes');
    expect(ready.summary).toContain('providerNativeSessionRequirements=7/7');
    expect(ready.summary).toContain('providerNativePayloadProviderMatchesSelected=yes');
    expect(ready.summary).toContain('providerNativePlanProviderMatchesSelected=yes');
    expect(ready.summary).toContain('providerNativeProviderCallIds=call_1,call_2');
    expect(ready.summary).toContain('providerNativeProviderCallSource=provider_payload');
    expect(ready.summary).toContain('providerNativeProviderCallIdCount=2');
    expect(ready.summary).toContain('providerNativeProviderCallTools=web_search_preview,openai:web_search');
    expect(ready.summary).toContain('providerNativeProviderWebSearchCallCount=2');
    expect(ready.summary).toContain('providerNativeProviderWebSearchCallTools=web_search_preview,openai:web_search');
    expect(ready.summary).toContain('providerNativeTrustedWebSearchDeclarationCount=2');
    expect(ready.summary).toContain('providerNativeTrustedWebSearchDeclarations=web_search_preview,openai:web_search');
    expect(ready.summary).toContain('providerNativeTrustedWebSearchCallCount=2');
    expect(ready.summary).toContain('providerNativeTrustedWebSearchCallTools=web_search_preview,openai:web_search');
    expect(ready.summary).toContain('providerNativeUntrustedWebSearchCallCount=0');
  });

  it('requires provider call ids to come from provider payload evidence before declaring a native session ready', () => {
    const readiness = evaluateAgentApiProviderNativeSessionReadinessFromEvidence({
      featureFlagEnabled: true,
      normalizedPlanProvider: 'openai',
      payloadProvider: 'openai',
      providerCallIds: ['call_1'],
      providerCallToolNames: ['web_search_preview'],
      selectedRuntimeProvider: 'openai',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: ['provider_call_ids', 'provider_web_search_calls', 'provider_web_search_declaration'],
    });
    expect(readiness.summary).toContain('providerNativeProviderCallIds=call_1');
    expect(readiness.summary).toContain('providerNativeProviderCallSource=unknown');
    expect(readiness.summary).toContain('providerNativeProviderCallIdCount=1');
    expect(readiness.summary).toContain('providerNativeProviderCallTools=web_search_preview');
    expect(readiness.summary).toContain('providerNativeProviderWebSearchCallCount=0');
  });

  it('requires provider-native call ids to identify web/search tools from provider payload evidence', () => {
    const readiness = evaluateAgentApiProviderNativeSessionReadinessFromEvidence({
      featureFlagEnabled: true,
      normalizedPlanProvider: 'openai',
      payloadProvider: 'openai',
      providerCallIds: ['call_1'],
      providerCallSource: 'provider_payload',
      providerCallToolNames: ['file_search', 'database_search'],
      selectedRuntimeProvider: 'openai',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: ['provider_web_search_calls', 'provider_web_search_declaration'],
    });
    expect(readiness.summary).toContain('providerNativeSessionRequirements=5/7');
    expect(readiness.summary).toContain('providerNativeProviderCallTools=file_search,database_search');
    expect(readiness.summary).toContain('providerNativeProviderWebSearchCallCount=0');
    expect(readiness.summary).toContain('providerNativeProviderWebSearchCallTools=none');
  });

  it('requires provider-native web/search call tools to match trusted provider declarations', () => {
    const readiness = evaluateAgentApiProviderNativeSessionReadinessFromEvidence({
      featureFlagEnabled: true,
      normalizedPlanProvider: 'openai',
      payloadProvider: 'openai',
      providerCallIds: ['call_1'],
      providerCallSource: 'provider_payload',
      providerCallToolNames: ['web_search_preview', 'openai:web_search'],
      trustedProviderWebSearchToolNames: ['web_search_preview'],
      selectedRuntimeProvider: 'openai',
    });

    expect(readiness).toMatchObject({
      ready: false,
      satisfiedRequirements: [
        'feature_flag',
        'selected_runtime_provider',
        'provider_payload_identity',
        'normalized_plan_identity',
        'provider_call_ids',
        'provider_web_search_calls',
      ],
      missingRequirements: ['provider_web_search_declaration'],
    });
    expect(readiness.summary).toContain('providerNativeSessionRequirements=6/7');
    expect(readiness.summary).toContain('providerNativeProviderWebSearchCallTools=web_search_preview,openai:web_search');
    expect(readiness.summary).toContain('providerNativeTrustedWebSearchDeclarations=web_search_preview');
    expect(readiness.summary).toContain('providerNativeTrustedWebSearchCallTools=web_search_preview');
    expect(readiness.summary).toContain('providerNativeUntrustedWebSearchCallCount=1');
    expect(readiness.summary).toContain('providerNativeUntrustedWebSearchCallTools=openai:web_search');
  });

  it('does not infer provider tools from API runtime selection and provider config alone', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      providerConfigured: true,
      selectedRuntime: {
        mode: 'api',
        provider: 'openai',
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
    expect(readiness.summary).toContain('configuredProviderEvidenceChain=ready');
    expect(readiness.summary).toContain('providerMetadataMatchesSelected=no');
    expect(readiness.summary).toContain('startupProbe=never');
    expect(readiness.summary).toContain('providerMetadataOwner=missing');
    expect(readiness.summary).toContain('providerMetadataPackage=missing');
    expect(readiness.summary).toContain('explicitToolDeclarationSource=missing');
    expect(readiness.summary).toContain('declaredToolCount=0');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=0');
    expect(readiness.summary).toContain('declaredWebSearchTools=none');
    expect(readiness.summary).toContain('trustedWebSearchToolCount=0');
    expect(readiness.summary).toContain('trustedWebSearchTools=none');
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
        provider: 'openai',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'blocked',
      toolReadiness: 'not_declared',
      satisfiedRequirements: [
        'no_startup_probe',
      ],
      missingRequirements: [
        'selected_api_runtime',
        'provider_configured',
        'provider_owned_metadata',
        'explicit_tool_declaration',
      ],
    });
    expect(readiness.summary).toContain('providerConfigured=missing');
    expect(readiness.summary).toContain('configuredProvider=missing');
    expect(readiness.summary).toContain('configuredProviderEvidenceChain=missing');
    expect(readiness.summary).toContain('selectedRuntimeProvider=openai');
    expect(readiness.summary).toContain('selectedRuntimeProviderEvidenceChain=missing');
    expect(readiness.summary).toContain('providerMetadataMatchesSelected=no');
    expect(readiness.summary).toContain('explicitToolDeclarationPackage=@openai/agents');
    expect(readiness.summary).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
  });

  it('blocks selected API runtime readiness when selected provider identity diverges from configured provider', () => {
    const metadata = deriveAgentApiProviderToolMetadata('openai');
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      ...metadata,
      configuredProvider: 'openai',
      providerConfigured: true,
      selectedRuntime: {
        mode: 'api',
        provider: 'anthropic',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'blocked',
      toolReadiness: 'not_declared',
      satisfiedRequirements: [
        'provider_configured',
        'no_startup_probe',
        'provider_owned_metadata',
      ],
      missingRequirements: [
        'selected_api_runtime',
        'explicit_tool_declaration',
      ],
    });
    expect(readiness.summary).toContain('selectedApiRuntime=missing');
    expect(readiness.summary).toContain('configuredProvider=openai');
    expect(readiness.summary).toContain('configuredProviderEvidenceChain=ready');
    expect(readiness.summary).toContain('selectedRuntimeProvider=anthropic');
    expect(readiness.summary).toContain('selectedRuntimeProviderEvidenceChain=missing');
  });

  it('requires selected API runtime provider identity before satisfying runtime selection', () => {
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
      status: 'blocked',
      toolReadiness: 'not_declared',
      satisfiedRequirements: [
        'provider_configured',
        'no_startup_probe',
        'provider_owned_metadata',
      ],
      missingRequirements: [
        'selected_api_runtime',
        'explicit_tool_declaration',
      ],
    });
    expect(readiness.summary).toContain('selectedApiRuntime=missing');
    expect(readiness.summary).toContain('configuredProvider=openai');
    expect(readiness.summary).toContain('configuredProviderEvidenceChain=ready');
    expect(readiness.summary).toContain('selectedRuntimeProvider=missing');
    expect(readiness.summary).toContain('selectedRuntimeProviderEvidenceChain=missing');
  });

  it('derives packaged provider metadata without declaring web/search tools', () => {
    const metadata = deriveAgentApiProviderToolMetadata('openai');
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      ...metadata,
      configuredProvider: 'openai',
      providerConfigured: true,
      selectedRuntime: {
        mode: 'api',
        provider: 'openai',
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
    expect(readiness.summary).toContain('configuredProviderEvidenceChain=ready');
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
        provider: 'openai',
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
    expect(readiness.summary).toContain('trustedWebSearchToolCount=1');
    expect(readiness.summary).toContain('trustedWebSearchTools=web_search');
  });

  it('deduplicates provider tool declarations before reporting web/search evidence counts', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['web_search', ' WEB_SEARCH ', 'openai:web_search', 'OPENAI:WEB_SEARCH', 'openai.web_search'],
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
        provider: 'openai',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'declared',
      toolReadiness: 'declared',
      missingRequirements: [],
    });
    expect(readiness.summary).toContain('declaredToolCount=2');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=2');
    expect(readiness.summary).toContain('declaredWebSearchTools=web_search,openai:web_search');
  });

  it('does not treat unrelated provider-owned function tools as web/search declarations', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['taskplane.create_task', 'file_search', 'database_search', 'search'],
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
        provider: 'openai',
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
    expect(readiness.summary).toContain('declaredToolCount=4');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=0');
    expect(readiness.summary).toContain('declaredWebSearchTools=none');
    expect(readiness.summary).toContain('explicitToolDeclaration=missing');
    expect(readiness.summary).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
  });

  it('accepts the OpenAI legacy web_search_preview tool without accepting cache helpers', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['web_search_preview', 'web_search_cache'],
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
        provider: 'openai',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'declared',
      toolReadiness: 'declared',
      missingRequirements: [],
    });
    expect(readiness.summary).toContain('declaredToolCount=2');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
    expect(readiness.summary).toContain('declaredWebSearchTools=web_search_preview');
    expect(readiness.summary).toContain('trustedWebSearchToolCount=1');
    expect(readiness.summary).toContain('trustedWebSearchTools=web_search_preview');
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
          'task_browser',
          'vendor:browse',
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
        provider: 'openai',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'declared',
      toolReadiness: 'declared',
      missingRequirements: [],
    });
    expect(readiness.summary).toContain('declaredToolCount=8');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=5');
    expect(readiness.summary).toContain('declaredWebSearchTools=web_search,web.fetch,browser,browse,openai:web_search');
  });

  it('requires provider-namespaced web/search declarations to match the configured provider', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['anthropic:web_search', 'anthropic.web_search', 'openai.web_search'],
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
        provider: 'openai',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'declared',
      toolReadiness: 'declared',
      missingRequirements: [],
    });
    expect(readiness.summary).toContain('declaredToolCount=2');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
    expect(readiness.summary).toContain('declaredWebSearchTools=openai.web_search');
    expect(readiness.summary).toContain('explicitToolDeclaration=ready');
  });

  it('normalizes slash-namespaced provider web/search declarations before matching and dedupe', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['openai/web_search', 'openai.web_search', 'anthropic/web_search', 'web/search'],
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
        provider: 'openai',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'declared',
      toolReadiness: 'declared',
      missingRequirements: [],
    });
    expect(readiness.summary).toContain('declaredToolCount=3');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=2');
    expect(readiness.summary).toContain('declaredWebSearchTools=openai/web_search,web/search');
    expect(readiness.summary).toContain('trustedWebSearchToolCount=2');
    expect(readiness.summary).toContain('trustedWebSearchTools=openai/web_search,web/search');
  });

  it('does not accept dot-namespaced web/search declarations from another provider', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['anthropic.web_search'],
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
        provider: 'openai',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'not_declared',
      toolReadiness: 'not_declared',
      missingRequirements: ['explicit_tool_declaration'],
    });
    expect(readiness.summary).toContain('declaredToolCount=1');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=0');
    expect(readiness.summary).toContain('declaredWebSearchTools=none');
    expect(readiness.summary).toContain('explicitToolDeclaration=missing');
  });

  it('does not accept tool names that merely contain web/search words', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: [
          'web_search_cache',
          'not_web_search_cache',
          'search_web',
          'web_fetcher',
          'browser_cache',
          'task_browser',
          'vendor:browse',
          'anthropic:web_search',
          'openai:web_search',
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
        provider: 'openai',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(readiness).toMatchObject({
      status: 'declared',
      toolReadiness: 'declared',
      missingRequirements: [],
    });
    expect(readiness.summary).toContain('declaredToolCount=9');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
    expect(readiness.summary).toContain('declaredWebSearchTools=openai:web_search');
    expect(readiness.summary).toContain('trustedWebSearchToolCount=1');
    expect(readiness.summary).toContain('trustedWebSearchTools=openai:web_search');
    expect(readiness.summary).toContain('untrustedWebSearchToolCount=0');
    expect(readiness.summary).toContain('untrustedWebSearchTools=none');
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
        provider: 'openai',
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
    expect(readiness.summary).toContain('trustedWebSearchToolCount=0');
    expect(readiness.summary).toContain('trustedWebSearchTools=none');
    expect(readiness.summary).toContain('untrustedWebSearchToolCount=1');
    expect(readiness.summary).toContain('untrustedWebSearchTools=web_search');
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
        provider: 'openai',
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
    expect(readiness.summary).toContain('trustedWebSearchToolCount=0');
    expect(readiness.summary).toContain('trustedWebSearchTools=none');
    expect(readiness.summary).toContain('untrustedWebSearchToolCount=1');
    expect(readiness.summary).toContain('untrustedWebSearchTools=web_search');
  });

  it('does not accept known-provider metadata from third-party package name prefixes', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@vendor/openai-tools',
        source: 'provider_owned_metadata',
      },
      providerConfigured: true,
      providerOwnedMetadata: {
        owner: 'provider',
        packageName: '@vendor/openai-tools',
        present: true,
      },
      selectedRuntime: {
        mode: 'api',
        provider: 'openai',
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
    expect(readiness.summary).toContain('providerMetadataPackage=@vendor/openai-tools');
    expect(readiness.summary).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
  });

  it('does not accept known-provider owner metadata when the package identity is third-party', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'openai',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@vendor/openai-tools',
        source: 'provider_owned_metadata',
      },
      providerConfigured: true,
      providerOwnedMetadata: {
        owner: 'openai',
        packageName: '@vendor/openai-tools',
        present: true,
      },
      selectedRuntime: {
        mode: 'api',
        provider: 'openai',
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
    expect(readiness.summary).toContain('providerMetadataOwner=openai');
    expect(readiness.summary).toContain('providerMetadataMatchesSelected=no');
    expect(readiness.summary).toContain('providerMetadataPackage=@vendor/openai-tools');
    expect(readiness.summary).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
  });

  it('does not accept generic provider-owned metadata for an unknown configured provider', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'fal-openrouter',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@some/generic-provider',
        source: 'provider_owned_metadata',
      },
      providerConfigured: true,
      providerOwnedMetadata: {
        owner: 'provider',
        packageName: '@some/generic-provider',
        present: true,
      },
      selectedRuntime: {
        mode: 'api',
        provider: 'fal-openrouter',
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
    expect(readiness.summary).toContain('configuredProvider=fal-openrouter');
    expect(readiness.summary).toContain('providerMetadataMatchesSelected=no');
    expect(readiness.summary).toContain('providerMetadataOwner=provider');
    expect(readiness.summary).toContain('providerMetadataPackage=@some/generic-provider');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
    expect(readiness.summary).toContain('explicitToolDeclaration=missing');
  });

  it('accepts unknown-provider metadata only when the owner or package identifies that configured provider', () => {
    const ownerMatch = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'fal-openrouter',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@fal-openrouter/agents',
        source: 'provider_owned_metadata',
      },
      providerConfigured: true,
      providerOwnedMetadata: {
        owner: 'fal-openrouter',
        packageName: '@fal-openrouter/agents',
        present: true,
      },
      selectedRuntime: {
        mode: 'api',
        provider: 'fal-openrouter',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });
    const packageMatch = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'fal-openrouter',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@vendor/fal-openrouter-tools',
        source: 'provider_owned_metadata',
      },
      providerConfigured: true,
      providerOwnedMetadata: {
        owner: 'provider',
        packageName: '@vendor/fal-openrouter-tools',
        present: true,
      },
      selectedRuntime: {
        mode: 'api',
        provider: 'fal-openrouter',
        runtimeKind: 'agent_api',
      },
      startupProbe: 'never',
    });

    expect(ownerMatch).toMatchObject({
      status: 'declared',
      toolReadiness: 'declared',
      missingRequirements: [],
    });
    expect(ownerMatch.summary).toContain('providerMetadataMatchesSelected=yes');
    expect(packageMatch).toMatchObject({
      status: 'declared',
      toolReadiness: 'declared',
      missingRequirements: [],
    });
    expect(packageMatch.summary).toContain('providerMetadataMatchesSelected=yes');
  });

  it('does not accept loose package substring matches as unknown-provider identity evidence', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'router',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@vendor/fal-openrouter-tools',
        source: 'provider_owned_metadata',
      },
      providerConfigured: true,
      providerOwnedMetadata: {
        owner: 'provider',
        packageName: '@vendor/fal-openrouter-tools',
        present: true,
      },
      selectedRuntime: {
        mode: 'api',
        provider: 'router',
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
    expect(readiness.summary).toContain('configuredProvider=router');
    expect(readiness.summary).toContain('providerMetadataMatchesSelected=no');
    expect(readiness.summary).toContain('providerOwnedMetadata=missing');
    expect(readiness.summary).toContain('declaredWebSearchToolCount=1');
    expect(readiness.summary).toContain('explicitToolDeclaration=missing');
  });

  it('does not accept a generic provider name embedded inside a known package name', () => {
    const readiness = evaluateAgentApiProviderToolReadinessFromEvidence({
      configuredProvider: 'ai',
      explicitToolDeclarations: {
        declaredTools: ['web_search'],
        packageName: '@ai-sdk/openai',
        source: 'provider_owned_metadata',
      },
      providerConfigured: true,
      providerOwnedMetadata: {
        owner: 'provider',
        packageName: '@ai-sdk/openai',
        present: true,
      },
      selectedRuntime: {
        mode: 'api',
        provider: 'ai',
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
    expect(readiness.summary).toContain('configuredProvider=ai');
    expect(readiness.summary).toContain('providerMetadataMatchesSelected=no');
    expect(readiness.summary).toContain('providerMetadataPackage=@ai-sdk/openai');
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
        provider: 'openai',
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
    expect(readiness.summary).toContain('trustedWebSearchToolCount=0');
    expect(readiness.summary).toContain('trustedWebSearchTools=none');
    expect(readiness.summary).toContain('untrustedWebSearchToolCount=1');
    expect(readiness.summary).toContain('untrustedWebSearchTools=web_search');
  });
});
