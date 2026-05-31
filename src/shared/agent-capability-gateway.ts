import type { AiRuntimeMode } from './types/settings.js';

export type UserSelectedAgentScheme =
  | 'agent_api'
  | 'claude'
  | 'codex';

export type UserDefaultRuntimeMode = AiRuntimeMode;

export type AgentRuntimeNeed =
  | 'none'
  | 'decision'
  | 'read_only_execution'
  | 'task_execution'
  | 'decomposition'
  | 'writeback_interpretation'
  | 'review'
  | 'scheduler_loop';

export type AgentExecutionRuntime =
  | 'agent_api'
  | 'claude_cli'
  | 'codex_cli'
  | 'human'
  | 'local_rule'
  | 'wanman_matrix';

export type AgentDecisionBackend =
  | 'agent_api'
  | 'claude_cli'
  | 'codex_cli'
  | 'human_review'
  | 'rules'
  | 'wanman_matrix';

export type AgentProviderCapabilityProbe = {
  agentApiConfigured: boolean;
  agentApiExecutionReady: boolean;
  agentCliReady: boolean;
  selectedSchemeReady: boolean;
  selectedSchemeSupportsNeed: boolean;
};

export type AgentFallbackPolicy = {
  allowed: boolean;
  visibility: 'explicit' | 'not_applicable';
};

export type AgentPermissionGate =
  | 'capability_probe'
  | 'decision_backend'
  | 'human_review'
  | 'not_applicable'
  | 'runtime_context_assembly'
  | 'runtime_entrypoint'
  | 'write_permission';

export type RuntimeNeed = AgentRuntimeNeed;
export type ExecutionRuntime = AgentExecutionRuntime;
export type DecisionBackend = AgentDecisionBackend;
export type ProviderCapabilityProbe = AgentProviderCapabilityProbe;

export type AgentCapabilityGatewayFallback = {
  from: UserSelectedAgentScheme | 'none';
  policy: AgentFallbackPolicy;
  reason: string;
  to: AgentDecisionBackend | AgentExecutionRuntime;
};

export type AgentCapabilityGatewaySelection = {
  decisionBackend: AgentDecisionBackend;
  executionRuntime: AgentExecutionRuntime;
  fallback: AgentCapabilityGatewayFallback | null;
  fallbackPolicy: AgentFallbackPolicy;
  permissionGate: AgentPermissionGate;
  providerCapabilityProbe: AgentProviderCapabilityProbe;
  runtimeNeed: AgentRuntimeNeed;
  selectedAgentScheme: UserSelectedAgentScheme | null;
  status: 'fallback' | 'non_model' | 'selected_scheme' | 'unavailable';
};

export function agentSchemeForCliRuntime(
  runtimeId: 'claude' | 'codex' | null | undefined,
): UserSelectedAgentScheme | null {
  if (runtimeId === 'claude') return 'claude';
  if (runtimeId === 'codex') return 'codex';
  return null;
}

export function selectedAgentSchemeForRuntimeMode(
  runtimeMode: UserDefaultRuntimeMode | null | undefined,
): UserSelectedAgentScheme | null {
  if (runtimeMode === 'api') return 'agent_api';
  if (runtimeMode === 'claude') return 'claude';
  if (runtimeMode === 'codex') return 'codex';
  return null;
}

export function decisionBackendForAgentScheme(
  scheme: UserSelectedAgentScheme,
): AgentDecisionBackend {
  if (scheme === 'agent_api') return 'agent_api';
  if (scheme === 'claude') return 'claude_cli';
  return 'codex_cli';
}

export function executionRuntimeForAgentScheme(
  scheme: UserSelectedAgentScheme,
): AgentExecutionRuntime {
  if (scheme === 'agent_api') return 'agent_api';
  if (scheme === 'claude') return 'claude_cli';
  return 'codex_cli';
}

export function inferSelectedAgentScheme(params: {
  agentCliReady?: boolean;
  apiRuntimeReady?: boolean;
  selectedCliRuntime?: 'claude' | 'codex' | null;
}): UserSelectedAgentScheme | null {
  const cliScheme = agentSchemeForCliRuntime(params.selectedCliRuntime);
  if (cliScheme) return cliScheme;
  if (params.apiRuntimeReady && !params.agentCliReady) return 'agent_api';
  return null;
}

export function resolveAgentCapabilityGateway(params: {
  availableDecisionBackends?: AgentDecisionBackend[];
  fallbackPolicy?: AgentFallbackPolicy;
  runtime?: {
    agentCliReady?: boolean;
    apiRuntimeReady?: boolean;
  };
  runtimeNeed: AgentRuntimeNeed;
  selectedAgentScheme?: UserSelectedAgentScheme | null;
  selectedCliRuntime?: 'claude' | 'codex' | null;
}): AgentCapabilityGatewaySelection {
  const runtime = params.runtime ?? {};
  const selectedAgentScheme = params.selectedAgentScheme ?? inferSelectedAgentScheme({
    agentCliReady: runtime.agentCliReady,
    apiRuntimeReady: runtime.apiRuntimeReady,
    selectedCliRuntime: params.selectedCliRuntime,
  });
  const fallbackPolicy = params.fallbackPolicy ?? {
    allowed: true,
    visibility: 'explicit' as const,
  };
  const availableDecisionBackends = new Set<AgentDecisionBackend>(
    params.availableDecisionBackends ?? inferDecisionBackends({
      runtime,
      selectedAgentScheme,
      selectedCliRuntime: params.selectedCliRuntime,
    }),
  );
  const providerCapabilityProbe = {
    agentApiConfigured: Boolean(runtime.apiRuntimeReady),
    agentApiExecutionReady: false,
    agentCliReady: Boolean(runtime.agentCliReady),
    selectedSchemeReady: selectedAgentScheme
      ? selectedSchemeIsReady(selectedAgentScheme, runtime)
      : false,
    selectedSchemeSupportsNeed: selectedAgentScheme
      ? selectedSchemeSupportsNeed(selectedAgentScheme, params.runtimeNeed, runtime)
      : false,
  };
  const selectedBackend = selectedAgentScheme
    ? decisionBackendForAgentScheme(selectedAgentScheme)
    : null;

  if (params.runtimeNeed === 'none') {
    return {
      decisionBackend: 'rules',
      executionRuntime: 'local_rule',
      fallback: null,
      fallbackPolicy: { allowed: false, visibility: 'not_applicable' },
      permissionGate: 'not_applicable',
      providerCapabilityProbe,
      runtimeNeed: params.runtimeNeed,
      selectedAgentScheme,
      status: 'non_model',
    };
  }

  if (
    selectedBackend
    && availableDecisionBackends.has(selectedBackend)
    && providerCapabilityProbe.selectedSchemeSupportsNeed
  ) {
    return {
      decisionBackend: selectedBackend,
      executionRuntime: selectedAgentScheme
        ? executionRuntimeForAgentScheme(selectedAgentScheme)
        : 'local_rule',
      fallback: null,
      fallbackPolicy,
      permissionGate: permissionGateForNeed(params.runtimeNeed),
      providerCapabilityProbe,
      runtimeNeed: params.runtimeNeed,
      selectedAgentScheme,
      status: 'selected_scheme',
    };
  }

  const fallbackBackend = fallbackBackendForNeed({
    availableDecisionBackends,
    runtimeNeed: params.runtimeNeed,
    selectedBackend,
  });
  if (fallbackBackend && fallbackPolicy.allowed) {
    return {
      decisionBackend: fallbackBackend,
      executionRuntime: executionRuntimeForDecisionBackend(fallbackBackend),
      fallback: selectedAgentScheme || fallbackBackend !== 'rules'
        ? {
            from: selectedAgentScheme ?? 'none',
            policy: fallbackPolicy,
            reason: fallbackReason({
              runtimeNeed: params.runtimeNeed,
              selectedAgentScheme,
              selectedBackend,
            }),
            to: fallbackBackend,
          }
        : null,
      fallbackPolicy,
      permissionGate: fallbackBackend === 'human_review' ? 'human_review' : permissionGateForNeed(params.runtimeNeed),
      providerCapabilityProbe,
      runtimeNeed: params.runtimeNeed,
      selectedAgentScheme,
      status: fallbackBackend === 'rules' ? 'non_model' : 'fallback',
    };
  }

  return {
    decisionBackend: availableDecisionBackends.has('rules') ? 'rules' : 'human_review',
    executionRuntime: availableDecisionBackends.has('rules') ? 'local_rule' : 'human',
    fallback: selectedAgentScheme
      ? {
          from: selectedAgentScheme,
          policy: fallbackPolicy,
          reason: 'Selected Agent scheme cannot satisfy this runtime need and fallback is not allowed.',
          to: availableDecisionBackends.has('rules') ? 'rules' : 'human_review',
        }
      : null,
    fallbackPolicy,
    permissionGate: availableDecisionBackends.has('rules') ? 'decision_backend' : 'human_review',
    providerCapabilityProbe,
    runtimeNeed: params.runtimeNeed,
    selectedAgentScheme,
    status: 'unavailable',
  };
}

function inferDecisionBackends(params: {
  runtime: {
    agentCliReady?: boolean;
    apiRuntimeReady?: boolean;
  };
  selectedAgentScheme: UserSelectedAgentScheme | null;
  selectedCliRuntime?: 'claude' | 'codex' | null;
}): AgentDecisionBackend[] {
  const backends: AgentDecisionBackend[] = ['rules'];
  const cliBackend = params.selectedAgentScheme === 'claude' || params.selectedCliRuntime === 'claude'
    ? 'claude_cli'
    : 'codex_cli';
  if (params.runtime.agentCliReady) backends.push(cliBackend);
  if (params.runtime.apiRuntimeReady) backends.push('agent_api');
  backends.push('human_review');
  return [...new Set(backends)];
}

function selectedSchemeIsReady(
  scheme: UserSelectedAgentScheme,
  runtime: {
    agentCliReady?: boolean;
    apiRuntimeReady?: boolean;
  },
): boolean {
  if (scheme === 'agent_api') return Boolean(runtime.apiRuntimeReady);
  return Boolean(runtime.agentCliReady);
}

function selectedSchemeSupportsNeed(
  scheme: UserSelectedAgentScheme,
  need: AgentRuntimeNeed,
  runtime: {
    agentCliReady?: boolean;
    apiRuntimeReady?: boolean;
  },
): boolean {
  if (!selectedSchemeIsReady(scheme, runtime)) return false;
  if (scheme !== 'agent_api') return true;
  return need !== 'task_execution' && need !== 'scheduler_loop';
}

function fallbackBackendForNeed(params: {
  availableDecisionBackends: Set<AgentDecisionBackend>;
  runtimeNeed: AgentRuntimeNeed;
  selectedBackend: AgentDecisionBackend | null;
}): AgentDecisionBackend | null {
  const candidateOrder: AgentDecisionBackend[] = [
    'agent_api',
    'codex_cli',
    'claude_cli',
    'wanman_matrix',
    'human_review',
    'rules',
  ];
  const candidates = candidateOrder.filter((candidate) => candidate !== params.selectedBackend);

  if (params.runtimeNeed === 'task_execution' || params.runtimeNeed === 'scheduler_loop') {
    candidates.sort((a, b) => executionBackendRank(a) - executionBackendRank(b));
  }

  return candidates.find((candidate) => params.availableDecisionBackends.has(candidate)) ?? null;
}

function executionBackendRank(backend: AgentDecisionBackend): number {
  switch (backend) {
    case 'codex_cli':
    case 'claude_cli':
      return 0;
    case 'human_review':
      return 1;
    case 'rules':
      return 2;
    case 'agent_api':
      return 3;
    case 'wanman_matrix':
      return 4;
  }
}

function executionRuntimeForDecisionBackend(backend: AgentDecisionBackend): AgentExecutionRuntime {
  if (backend === 'codex_cli' || backend === 'claude_cli' || backend === 'agent_api' || backend === 'wanman_matrix') {
    return backend;
  }
  if (backend === 'human_review') return 'human';
  return 'local_rule';
}

function permissionGateForNeed(need: AgentRuntimeNeed): AgentPermissionGate {
  switch (need) {
    case 'decision':
      return 'decision_backend';
    case 'decomposition':
    case 'read_only_execution':
    case 'review':
    case 'writeback_interpretation':
      return 'runtime_context_assembly';
    case 'scheduler_loop':
    case 'task_execution':
      return 'runtime_entrypoint';
    case 'none':
      return 'not_applicable';
  }
}

function fallbackReason(params: {
  runtimeNeed: AgentRuntimeNeed;
  selectedAgentScheme: UserSelectedAgentScheme | null;
  selectedBackend: AgentDecisionBackend | null;
}): string {
  if (!params.selectedAgentScheme) {
    return 'No selected Agent scheme is available for this runtime need; using the first explicit fallback.';
  }
  if (!params.selectedBackend) {
    return 'Selected Agent scheme has no matching backend for this runtime need; using explicit fallback.';
  }
  return `Selected Agent scheme ${params.selectedAgentScheme} cannot satisfy ${params.runtimeNeed}; using explicit fallback.`;
}
