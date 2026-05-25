import type {
  AgentRuntimeAdapterCapabilities,
  AgentRuntimeNativeCapabilityDeclaration,
  AgentRuntimeNativeCapabilitySet,
} from './agent-runtime-goal.js';

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

export type AgentCliRuntimeCapabilityProbeSignals = {
  hooks?: boolean;
  nativeClear?: boolean;
  nativeCompact?: boolean;
  nativeMemory?: boolean;
  nativeResume?: boolean;
  planMode?: boolean;
  structuredProgressEvents?: boolean;
  subagents?: boolean;
  webSearch?: boolean;
};

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

const CODEX_NATIVE_GOAL_MINIMUM_VERSION = '0.133.0';

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
  version: string | null = null,
  probeSignals: AgentCliRuntimeCapabilityProbeSignals | null = null,
): AgentRuntimeAdapterCapabilities {
  const nativeGoalMode = buildNativeGoalModeCapability(runtimeId, label, version);
  const supportsNativeGoalMode = nativeGoalMode.availability === 'available';
  const structuredProgressEvents = probeSignals?.structuredProgressEvents ?? true;
  const supportsNativeResume = probeSignals?.nativeResume ?? false;
  return {
    id: runtimeId,
    label,
    executionKind: 'cli',
    supportsSingleRun: true,
    supportsPersistentSession: false,
    supportsNativeGoalMode,
    supportsNativeClear: false,
    supportsNativeCompact: false,
    supportsNativeResume,
    supportsPauseGoal: supportsNativeGoalMode,
    supportsResumeGoal: supportsNativeGoalMode,
    supportsClearGoal: supportsNativeGoalMode,
    supportsStructuredProgressEvents: structuredProgressEvents,
    supportsWorkspaceWrite: false,
    defaultResetStrategy: 'product_transcript_reset',
    defaultPermissionMode: runtimeId === 'claude' ? 'plan' : 'read_only',
    nativeGoalMode,
    nativeCapabilities: buildNativeCapabilityDeclarations(runtimeId, label, probeSignals),
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
  runtime: Pick<AgentCliRuntimeRecord, 'capabilities' | 'id' | 'label' | 'version'>,
): AgentRuntimeAdapterCapabilities {
  const fallback = buildDefaultAgentCliRuntimeCapabilities(runtime.id, runtime.label, runtime.version);
  if (!runtime.capabilities) return fallback;
  return {
    ...fallback,
    ...runtime.capabilities,
    commandRouting: {
      ...fallback.commandRouting,
      ...runtime.capabilities.commandRouting,
    },
    nativeCapabilities: fallback.nativeCapabilities
      ? {
          ...fallback.nativeCapabilities,
          ...(runtime.capabilities.nativeCapabilities ?? {}),
        }
      : runtime.capabilities.nativeCapabilities,
    nativeGoalMode: runtime.capabilities.nativeGoalMode ?? fallback.nativeGoalMode,
  };
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

function buildNativeGoalModeCapability(
  runtimeId: AgentCliRuntimeId,
  label: string,
  version: string | null,
): AgentRuntimeAdapterCapabilities['nativeGoalMode'] {
  if (runtimeId === 'claude') {
    return {
      availability: 'unsupported',
      minimumVersion: null,
      reason: `${label} native goal mode has not been verified by the Taskplane adapter yet.`,
    };
  }

  const parsedVersion = parseCliSemver(version);
  if (!parsedVersion) {
    return {
      availability: 'unknown',
      minimumVersion: CODEX_NATIVE_GOAL_MINIMUM_VERSION,
      reason: `${label} native goal mode requires Codex CLI ${CODEX_NATIVE_GOAL_MINIMUM_VERSION}+; installed version is unknown.`,
    };
  }

  if (compareSemver(parsedVersion, parseRequiredSemver(CODEX_NATIVE_GOAL_MINIMUM_VERSION)) < 0) {
    return {
      availability: 'requires_update',
      minimumVersion: CODEX_NATIVE_GOAL_MINIMUM_VERSION,
      reason: `${label} native goal mode requires Codex CLI ${CODEX_NATIVE_GOAL_MINIMUM_VERSION}+; detected ${formatSemver(parsedVersion)}.`,
    };
  }

  return {
    availability: 'available',
    minimumVersion: CODEX_NATIVE_GOAL_MINIMUM_VERSION,
    reason: `${label} native goal mode is available in the detected CLI version, but Taskplane passthrough still requires the native goal readiness gate.`,
  };
}

function nativeCapability(
  label: string,
  availability: AgentRuntimeNativeCapabilityDeclaration['availability'],
  reason: string,
): AgentRuntimeNativeCapabilityDeclaration {
  return { availability, label, reason };
}

function buildNativeCapabilityDeclarations(
  runtimeId: AgentCliRuntimeId,
  label: string,
  probeSignals: AgentCliRuntimeCapabilityProbeSignals | null,
): AgentRuntimeNativeCapabilitySet {
  const readMode = runtimeId === 'claude' ? 'plan mode' : 'read-only sandbox';
  const webSearchAvailability = probeSignals?.webSearch
    ? nativeCapability(
        'native web/search',
        'runtime_dependent',
        `${label} help output exposes native web/search activation; Taskplane records visible web/search events and can still use its own source-capture bridge when configured.`,
      )
    : nativeCapability(
        'native web/search',
        'unverified',
        `${label} native web/search was not detected by the runtime probe; Taskplane can use its own source-capture bridge when configured.`,
      );
  const hookAvailability = probeSignals?.hooks
    ? nativeCapability(
        'hooks',
        'runtime_dependent',
        `${label} help output exposes hook event streaming; Taskplane records visible hook events while deterministic product gates remain the enforcement source.`,
      )
    : nativeCapability(
        'hooks',
        'unverified',
        `${label} hook support is not configured by Taskplane yet; deterministic product gates remain the source of enforcement.`,
      );
  const subagentAvailability = probeSignals?.subagents
    ? nativeCapability(
        'subagents',
        'runtime_dependent',
        `${label} help output exposes agent/subagent selection; Taskplane treats product subagent delegation as an explicit future routing decision.`,
      )
    : nativeCapability(
        'subagents',
        'unverified',
        `${label} subagent or delegation support is not routed through Taskplane yet.`,
      );
  const memoryAvailability = probeSignals?.nativeMemory
    ? nativeCapability(
        'memory',
        'runtime_dependent',
        `${label} exposes native memory/project-guidance loading signals; Taskplane still persists task memory through structured product surfaces.`,
      )
    : nativeCapability(
        'memory',
        'product_controlled',
        'Task memory is persisted by Taskplane surfaces, not by runtime-native memory files.',
      );
  const compactAvailability = probeSignals?.nativeCompact
    ? nativeCapability(
        'compact',
        'runtime_dependent',
        `${label} exposes native compact signals; Taskplane requires its handoff and memory coverage gates before context reset.`,
      )
    : nativeCapability(
        'compact',
        'product_controlled',
        'Context compaction is handled through Taskplane handoff and memory coverage gates.',
      );
  const clearAvailability = probeSignals?.nativeClear
    ? nativeCapability(
        'clear',
        'runtime_dependent',
        `${label} exposes native clear signals; Taskplane requires preservation proof before clearing task context.`,
      )
    : nativeCapability(
        'clear',
        'product_controlled',
        'Conversation reset is product-controlled so valuable context can be preserved before clearing.',
      );
  return {
    structuredProgressEvents: nativeCapability(
      'structured events',
      probeSignals?.structuredProgressEvents === false ? 'unsupported' : 'available',
      probeSignals?.structuredProgressEvents === false
        ? `${label} structured event output was not detected by the runtime probe.`
        : `${label} adapter requests structured terminal output and projects it into Taskplane Run steps.`,
    ),
    webSearch: webSearchAvailability,
    workspaceRead: nativeCapability(
      'workspace read',
      'available',
      `${label} runs through Taskplane-controlled ${readMode} for local inspection.`,
    ),
    workspaceWrite: nativeCapability(
      'workspace write',
      'unsupported',
      'Taskplane does not grant direct workspace mutation through the native CLI adapter yet; writes must return as proposals or reviewed artifacts.',
    ),
    hooks: hookAvailability,
    subagents: subagentAvailability,
    memory: memoryAvailability,
    compact: compactAvailability,
    clear: clearAvailability,
  };
}

function parseCliSemver(version: string | null): [number, number, number] | null {
  const match = version?.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
}

function parseRequiredSemver(version: string): [number, number, number] {
  const parsed = parseCliSemver(version);
  if (!parsed) throw new Error(`Invalid required CLI version: ${version}`);
  return parsed;
}

function compareSemver(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    const diff = left[index]! - right[index]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

function formatSemver(version: [number, number, number]): string {
  return version.join('.');
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
