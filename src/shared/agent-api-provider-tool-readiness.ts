export type AgentApiProviderToolReadinessRequirement =
  | 'selected_api_runtime'
  | 'provider_configured'
  | 'no_startup_probe'
  | 'provider_owned_metadata'
  | 'explicit_tool_declaration';

export type AgentApiProviderToolReadinessStatus =
  | 'blocked'
  | 'declared'
  | 'not_declared';

export type AgentApiProviderToolReadiness = {
  missingRequirements: AgentApiProviderToolReadinessRequirement[];
  satisfiedRequirements: AgentApiProviderToolReadinessRequirement[];
  status: AgentApiProviderToolReadinessStatus;
  summary: string;
  toolReadiness: 'declared' | 'not_declared';
};

const EXPLICIT_WEB_SEARCH_TOOL_NAMES = new Set([
  'browse',
  'browser',
  'search',
  'web_browse',
  'web_browser',
  'web_fetch',
  'web_search',
  'websearch',
]);

export type AgentApiProviderToolReadinessServiceEvidence = {
  configuredProvider?: string | null;
  explicitToolDeclarations?: {
    declaredTools: string[];
    packageName?: string | null;
    source: 'provider_owned_metadata' | 'runtime_probe' | 'unknown';
  } | null;
  providerConfigured?: boolean;
  providerOwnedMetadata?: {
    owner: 'anthropic' | 'openai' | 'provider' | 'unknown';
    packageName?: string | null;
    present: boolean;
  } | null;
  selectedRuntime?: {
    mode: 'api' | 'codex' | 'claude' | 'none';
    runtimeKind: 'agent_api' | 'agent_cli' | 'none';
  } | null;
  startupProbe?: 'called' | 'never' | 'not_attempted';
};

export function deriveAgentApiProviderToolMetadata(
  provider: string | null | undefined,
): Pick<AgentApiProviderToolReadinessServiceEvidence, 'explicitToolDeclarations' | 'providerOwnedMetadata'> {
  const normalizedProvider = provider?.trim().toLowerCase() ?? '';
  if (normalizedProvider === 'openai') {
    return {
      explicitToolDeclarations: {
        declaredTools: [],
        packageName: '@ai-sdk/openai',
        source: 'provider_owned_metadata',
      },
      providerOwnedMetadata: {
        owner: 'provider',
        packageName: '@ai-sdk/openai',
        present: true,
      },
    };
  }

  if (normalizedProvider === 'anthropic') {
    return {
      explicitToolDeclarations: {
        declaredTools: [],
        packageName: '@ai-sdk/anthropic',
        source: 'provider_owned_metadata',
      },
      providerOwnedMetadata: {
        owner: 'provider',
        packageName: '@ai-sdk/anthropic',
        present: true,
      },
    };
  }

  return {
    explicitToolDeclarations: null,
    providerOwnedMetadata: null,
  };
}

export function agentApiProviderToolReadinessRequirements(): AgentApiProviderToolReadinessRequirement[] {
  return [
    'selected_api_runtime',
    'provider_configured',
    'no_startup_probe',
    'provider_owned_metadata',
    'explicit_tool_declaration',
  ];
}

function normalizeDeclaredTools(tools: string[] | undefined): string[] {
  return (tools ?? []).map((tool) => tool.trim()).filter(Boolean);
}

function declaredWebSearchTools(tools: string[] | undefined): string[] {
  return normalizeDeclaredTools(tools).filter((tool) => {
    const normalizedTool = tool.toLowerCase().replace(/[.:-]+/g, '_').replace(/_+/g, '_');
    if (EXPLICIT_WEB_SEARCH_TOOL_NAMES.has(normalizedTool)) return true;

    const segments = normalizedTool.split('_').filter(Boolean);
    return segments.includes('web') && segments.some((segment) =>
      segment === 'search'
      || segment === 'fetch'
      || segment === 'browse'
      || segment === 'browser'
    );
  });
}

function normalizeProvider(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function providerMetadataMatchesConfiguredProvider(params: {
  configuredProvider?: string | null;
  metadata?: AgentApiProviderToolReadinessServiceEvidence['providerOwnedMetadata'];
}): boolean {
  const configuredProvider = normalizeProvider(params.configuredProvider);
  const metadata = params.metadata;
  if (!configuredProvider) return false;
  if (!metadata?.present || metadata.owner === 'unknown') return false;

  const packageName = metadata.packageName?.trim().toLowerCase() ?? '';
  if (configuredProvider === 'openai') {
    return metadata.owner === 'openai'
      || packageName.includes('openai');
  }
  if (configuredProvider === 'anthropic') {
    return metadata.owner === 'anthropic'
      || packageName.includes('anthropic');
  }
  return metadata.owner === 'provider' || metadata.owner === configuredProvider;
}

export function evaluateAgentApiProviderToolReadinessFromEvidence(
  evidence: AgentApiProviderToolReadinessServiceEvidence,
): AgentApiProviderToolReadiness {
  const requiredRequirements = agentApiProviderToolReadinessRequirements();
  const satisfiedRequirements: AgentApiProviderToolReadinessRequirement[] = [];
  const metadata = evidence.providerOwnedMetadata;
  const declarations = evidence.explicitToolDeclarations;
  const declarationPackageName = declarations?.packageName?.trim().toLowerCase() ?? '';
  const normalizedDeclaredTools = normalizeDeclaredTools(declarations?.declaredTools);
  const webSearchDeclaredTools = declaredWebSearchTools(declarations?.declaredTools);
  const metadataMatchesConfiguredProvider = providerMetadataMatchesConfiguredProvider({
    configuredProvider: evidence.configuredProvider,
    metadata,
  });
  const providerOwnedMetadataReady = metadata?.present === true
    && metadata.owner !== 'unknown'
    && metadataMatchesConfiguredProvider;
  const declarationPackageMatchesMetadata = Boolean(declarationPackageName)
    && declarationPackageName === (metadata?.packageName?.trim().toLowerCase() ?? '');

  if (evidence.selectedRuntime?.runtimeKind === 'agent_api' && evidence.selectedRuntime.mode === 'api') {
    satisfiedRequirements.push('selected_api_runtime');
  }

  if (evidence.providerConfigured === true && normalizeProvider(evidence.configuredProvider)) {
    satisfiedRequirements.push('provider_configured');
  }

  if (evidence.startupProbe === 'never' || evidence.startupProbe === 'not_attempted') {
    satisfiedRequirements.push('no_startup_probe');
  }

  if (providerOwnedMetadataReady) {
    satisfiedRequirements.push('provider_owned_metadata');
  }

  if (
    providerOwnedMetadataReady
    && declarations?.source === 'provider_owned_metadata'
    && declarationPackageMatchesMetadata
    && webSearchDeclaredTools.length > 0
  ) {
    satisfiedRequirements.push('explicit_tool_declaration');
  }

  const satisfiedRequirementSet = new Set(satisfiedRequirements);
  const missingRequirements = requiredRequirements.filter((requirement) => !satisfiedRequirementSet.has(requirement));
  const toolReadiness = (
    satisfiedRequirementSet.has('provider_owned_metadata')
    && satisfiedRequirementSet.has('explicit_tool_declaration')
  ) ? 'declared' : 'not_declared';
  const status: AgentApiProviderToolReadinessStatus = (
    !satisfiedRequirementSet.has('selected_api_runtime')
    || !satisfiedRequirementSet.has('provider_configured')
    || !satisfiedRequirementSet.has('no_startup_probe')
  ) ? 'blocked' : toolReadiness;

  return {
    missingRequirements,
    satisfiedRequirements,
    status,
    summary: [
      'Agent API provider tool readiness',
      `status=${status}`,
      `providerToolReadiness=${toolReadiness}`,
      `requirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `providerToolRequirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `selectedApiRuntime=${satisfiedRequirementSet.has('selected_api_runtime') ? 'ready' : 'missing'}`,
      `providerConfigured=${satisfiedRequirementSet.has('provider_configured') ? 'ready' : 'missing'}`,
      `configuredProvider=${normalizeProvider(evidence.configuredProvider) || 'missing'}`,
      `startupProbe=${evidence.startupProbe ?? 'missing'}`,
      `providerOwnedMetadata=${satisfiedRequirementSet.has('provider_owned_metadata') ? 'ready' : 'missing'}`,
      `providerMetadataMatchesSelected=${metadataMatchesConfiguredProvider ? 'yes' : 'no'}`,
      `providerMetadataOwner=${metadata?.owner ?? 'missing'}`,
      `providerMetadataPackage=${metadata?.packageName?.trim() || 'missing'}`,
      `explicitToolDeclaration=${satisfiedRequirementSet.has('explicit_tool_declaration') ? 'ready' : 'missing'}`,
      `explicitToolDeclarationSource=${declarations?.source ?? 'missing'}`,
      `explicitToolDeclarationPackage=${declarations?.packageName?.trim() || 'missing'}`,
      `explicitToolDeclarationPackageMatchesMetadata=${declarationPackageMatchesMetadata ? 'yes' : 'no'}`,
      `declaredToolCount=${normalizedDeclaredTools.length}`,
      `declaredWebSearchToolCount=${webSearchDeclaredTools.length}`,
      `declaredWebSearchTools=${webSearchDeclaredTools.length ? webSearchDeclaredTools.join(',') : 'none'}`,
      `missingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `providerToolMissingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
    ].join(' / '),
    toolReadiness,
  };
}
