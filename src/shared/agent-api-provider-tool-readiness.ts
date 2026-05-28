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

export type AgentApiProviderToolReadinessServiceEvidence = {
  explicitToolDeclarations?: {
    declaredTools: string[];
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

export function agentApiProviderToolReadinessRequirements(): AgentApiProviderToolReadinessRequirement[] {
  return [
    'selected_api_runtime',
    'provider_configured',
    'no_startup_probe',
    'provider_owned_metadata',
    'explicit_tool_declaration',
  ];
}

export function evaluateAgentApiProviderToolReadinessFromEvidence(
  evidence: AgentApiProviderToolReadinessServiceEvidence,
): AgentApiProviderToolReadiness {
  const requiredRequirements = agentApiProviderToolReadinessRequirements();
  const satisfiedRequirements: AgentApiProviderToolReadinessRequirement[] = [];
  const metadata = evidence.providerOwnedMetadata;
  const declarations = evidence.explicitToolDeclarations;

  if (evidence.selectedRuntime?.runtimeKind === 'agent_api' && evidence.selectedRuntime.mode === 'api') {
    satisfiedRequirements.push('selected_api_runtime');
  }

  if (evidence.providerConfigured === true) {
    satisfiedRequirements.push('provider_configured');
  }

  if (evidence.startupProbe === 'never' || evidence.startupProbe === 'not_attempted') {
    satisfiedRequirements.push('no_startup_probe');
  }

  if (metadata?.present === true && metadata.owner !== 'unknown') {
    satisfiedRequirements.push('provider_owned_metadata');
  }

  if (
    declarations?.source === 'provider_owned_metadata'
    && declarations.declaredTools.some((tool) => tool.trim().length > 0)
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
      `startupProbe=${evidence.startupProbe ?? 'missing'}`,
      `providerOwnedMetadata=${satisfiedRequirementSet.has('provider_owned_metadata') ? 'ready' : 'missing'}`,
      `providerMetadataOwner=${metadata?.owner ?? 'missing'}`,
      `providerMetadataPackage=${metadata?.packageName?.trim() || 'missing'}`,
      `explicitToolDeclaration=${satisfiedRequirementSet.has('explicit_tool_declaration') ? 'ready' : 'missing'}`,
      `explicitToolDeclarationSource=${declarations?.source ?? 'missing'}`,
      `declaredToolCount=${declarations?.declaredTools.filter((tool) => tool.trim().length > 0).length ?? 0}`,
      `missingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `providerToolMissingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
    ].join(' / '),
    toolReadiness,
  };
}
