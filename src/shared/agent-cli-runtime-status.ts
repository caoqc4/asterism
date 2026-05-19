import type { AgentRuntimeAdapterCapabilities } from './agent-runtime-goal.js';

export type AgentCliRuntimeId = 'codex' | 'claude';

export type AgentCliAuthState =
  | 'unknown'
  | 'ready'
  | 'needs_login'
  | 'error';

export type AgentCliExecutionSupport =
  | 'manual_run'
  | 'status_only';

export type AgentCliWorkload = 'idle' | 'running' | 'blocked';

export type AgentCliRuntimeRecord = {
  id: AgentCliRuntimeId;
  label: string;
  command: string;
  capabilities?: AgentRuntimeAdapterCapabilities;
  executablePath?: string | null;
  installed: boolean;
  version: string | null;
  authState: AgentCliAuthState;
  executionSupport: AgentCliExecutionSupport;
  workload: AgentCliWorkload;
  missingReason: string | null;
};

export type AgentCliRuntimeStatus = {
  runtimes: AgentCliRuntimeRecord[];
  catalogueCount: number;
  detectedCount: number;
  readyCount: number;
  runningCount: number;
  errorCount: number;
  manualRunCount: number;
  readyManualRunCount: number;
  updatedAt: string | null;
};

export const DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE: Array<Pick<AgentCliRuntimeRecord, 'capabilities' | 'command' | 'executionSupport' | 'id' | 'label'>> = [
  {
    id: 'codex',
    label: 'Codex CLI',
    command: 'codex',
    executionSupport: 'manual_run',
    capabilities: buildDefaultAgentCliRuntimeCapabilities('codex', 'Codex CLI'),
  },
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    executionSupport: 'manual_run',
    capabilities: buildDefaultAgentCliRuntimeCapabilities('claude', 'Claude Code'),
  },
];

export function buildDefaultAgentCliRuntimeCapabilities(
  runtimeId: AgentCliRuntimeId,
  label: string,
): AgentRuntimeAdapterCapabilities {
  return {
    id: runtimeId,
    label,
    executionKind: 'cli',
    supportsSingleRun: true,
    supportsNativeGoalMode: false,
    supportsPauseGoal: false,
    supportsResumeGoal: false,
    supportsClearGoal: false,
    supportsStructuredProgressEvents: false,
    supportsWorkspaceWrite: false,
    defaultPermissionMode: runtimeId === 'claude' ? 'plan' : 'read_only',
    commandRouting: {
      productOwned: ['/goal', '/goal status', '/goal pause', '/goal resume', '/goal clear', '/cancel', '/status'],
      runtimeNative: runtimeId === 'codex'
        ? ['/codex goal', '/runtime goal']
        : ['/claude goal', '/runtime goal'],
      passthroughRequiresExplicitNamespace: true,
    },
  };
}

export function agentCliRuntimeCapabilities(
  runtime: Pick<AgentCliRuntimeRecord, 'capabilities' | 'id' | 'label'>,
): AgentRuntimeAdapterCapabilities {
  return runtime.capabilities ?? buildDefaultAgentCliRuntimeCapabilities(runtime.id, runtime.label);
}

export function emptyAgentCliRuntimeStatus(): AgentCliRuntimeStatus {
  return buildAgentCliRuntimeStatus(
    DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE.map((runtime) => ({
      ...runtime,
      authState: 'unknown',
      installed: false,
      missingReason: `${runtime.label} is not installed or not available on PATH.`,
      version: null,
      workload: 'blocked',
    })),
    null,
  );
}

export function buildAgentCliRuntimeStatus(
  runtimes: AgentCliRuntimeRecord[],
  updatedAt: string | null = null,
): AgentCliRuntimeStatus {
  return {
    catalogueCount: DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE.length,
    detectedCount: runtimes.filter((runtime) => runtime.installed).length,
    errorCount: runtimes.filter((runtime) => runtime.authState === 'error').length,
    manualRunCount: runtimes.filter((runtime) => runtime.installed && runtime.executionSupport === 'manual_run').length,
    readyCount: runtimes.filter((runtime) => runtime.installed && runtime.authState === 'ready').length,
    readyManualRunCount: runtimes.filter((runtime) => (
      runtime.installed
      && runtime.authState === 'ready'
      && runtime.executionSupport === 'manual_run'
    )).length,
    runningCount: runtimes.filter((runtime) => runtime.workload === 'running').length,
    runtimes: runtimes.map((runtime) => ({
      ...runtime,
      capabilities: agentCliRuntimeCapabilities(runtime),
    })),
    updatedAt,
  };
}
