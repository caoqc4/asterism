import { execFile } from 'node:child_process';

import {
  DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE,
  buildAgentCliRuntimeStatus,
  emptyAgentCliRuntimeStatus,
  type AgentCliAuthState,
  type AgentCliRuntimeId,
  type AgentCliRuntimeRecord,
  type AgentCliRuntimeStatus,
} from '../../../shared/agent-cli-runtime-status.js';
import { readEnvValue } from '../../config/env.js';
import {
  agentCliRuntimeWorkloadTracker,
  type AgentCliRuntimeWorkloadTracker,
} from './agent-cli-runtime-workload.js';

export type AgentCliCommandProbe = (command: string, runtimeId: AgentCliRuntimeId) => Promise<{
  authReason?: string | null;
  authState?: AgentCliAuthState;
  executablePath?: string | null;
  installed: boolean;
  version: string | null;
  errorReason?: string | null;
}>;

const PROBE_TIMEOUT_MS = 1_500;
export const AGENT_CLI_RUNTIME_FIXTURE_ENV = 'TASKPLANE_AGENT_CLI_RUNTIME_FIXTURE_JSON';

export class AgentCliRuntimeStatusService {
  constructor(
    private readonly probeCommand: AgentCliCommandProbe = probeAgentCliCommand,
    private readonly workloadTracker: AgentCliRuntimeWorkloadTracker = agentCliRuntimeWorkloadTracker,
  ) {}

  async getStatus(): Promise<AgentCliRuntimeStatus> {
    const fixture = parseAgentCliRuntimeFixture(readEnvValue(AGENT_CLI_RUNTIME_FIXTURE_ENV));
    if (fixture) return fixture;

    const records = await Promise.all(DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE.map(async (runtime): Promise<AgentCliRuntimeRecord> => {
      const probe = await this.probeCommand(runtime.command, runtime.id);
      if (!probe.installed) {
        return {
          ...runtime,
          authState: 'unknown',
          installed: false,
          missingReason: probe.errorReason ?? `${runtime.label} is not installed or not available on PATH.`,
          version: null,
          workload: 'blocked',
        };
      }

      return {
        ...runtime,
        authState: probe.authState ?? 'unknown',
        executablePath: probe.executablePath ?? null,
        installed: true,
        missingReason: installedRuntimeMissingReason(runtime.id, runtime.label, runtime.command, runtime.executionSupport, probe.authState, probe.authReason),
        version: probe.version,
        workload: 'idle',
      };
    }));

    return buildAgentCliRuntimeStatus(
      records.map((runtime) => (
        this.workloadTracker.getActiveRunCount(runtime.id) > 0
          ? { ...runtime, workload: 'running' }
          : runtime
      )),
      new Date().toISOString(),
    );
  }
}

export function createAgentCliRuntimeStatusService(): AgentCliRuntimeStatusService {
  return new AgentCliRuntimeStatusService();
}

async function probeAgentCliCommand(command: string, runtimeId: AgentCliRuntimeId): Promise<{
  authReason?: string | null;
  authState?: AgentCliAuthState;
  executablePath?: string | null;
  installed: boolean;
  version: string | null;
  errorReason?: string | null;
}> {
  const pathProbe = await runProbe('/bin/zsh', ['-lc', `command -v ${shellQuote(command)}`]);
  const executablePath = firstLine(pathProbe.stdout);
  if (pathProbe.exitCode !== 0 || !pathProbe.stdout.trim()) {
    return {
      errorReason: `${command} was not found on PATH.`,
      installed: false,
      version: null,
    };
  }

  const executable = executablePath ?? command;
  const authProbePromise = runtimeId === 'codex'
    ? runProbe(executable, ['login', 'status'])
    : runtimeId === 'claude'
      ? runProbe(executable, ['auth', 'status'])
      : Promise.resolve(null);
  const [versionProbe, authProbe] = await Promise.all([
    runProbe(executable, ['--version']),
    authProbePromise,
  ]);
  const authStatus = authProbe
    ? authStateFromLoginProbe(authProbe, { nonZeroMeansNeedsLogin: runtimeId === 'claude' })
    : null;
  return {
    authReason: authStatus?.reason ?? null,
    authState: authStatus?.state,
    executablePath,
    installed: true,
    version: versionProbe.exitCode === 0
      ? firstLine(versionProbe.stdout || versionProbe.stderr)
      : null,
  };
}

function installedRuntimeMissingReason(
  runtimeId: AgentCliRuntimeId,
  label: string,
  command: string,
  executionSupport: 'manual_run' | 'status_only',
  authState: AgentCliAuthState | undefined,
  authReason: string | null | undefined,
): string | null {
  if (authState === 'ready') return null;
  if (authState === 'needs_login') return `${label} is installed but not logged in; run ${loginCommandHint(runtimeId, command)}.`;
  if (authState === 'error') return authReason ?? `${label} login status could not be checked.`;
  return executionSupport === 'manual_run'
    ? `Authentication is managed by ${label}; run ${loginCommandHint(runtimeId, command)} if execution reports a login error.`
    : `${label} detection is status-only in this version.`;
}

function loginCommandHint(runtimeId: AgentCliRuntimeId, command: string): string {
  if (runtimeId === 'claude') return `${command} auth login`;
  return `${command} login`;
}

function authStateFromLoginProbe(probe: {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}, options: { nonZeroMeansNeedsLogin?: boolean } = {}): { reason: string | null; state: AgentCliAuthState } {
  const reason = firstLine(probe.stdout || probe.stderr);
  if (probe.exitCode === 0) {
    return { reason, state: 'ready' };
  }
  if (options.nonZeroMeansNeedsLogin) {
    return { reason, state: 'needs_login' };
  }
  if (/not\s+logged\s+in|login|required|unauth/i.test(`${probe.stdout}\n${probe.stderr}`)) {
    return { reason, state: 'needs_login' };
  }
  return { reason, state: 'error' };
}

function runProbe(command: string, args: string[]): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    execFile(command, args, {
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      resolve({
        exitCode: typeof error?.code === 'number' ? error.code : error ? 1 : 0,
        stderr: String(stderr ?? ''),
        stdout: String(stdout ?? ''),
      });
    });
  });
}

function firstLine(value: string): string | null {
  const line = value.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  return line ?? null;
}

function parseAgentCliRuntimeFixture(rawValue: string | null): AgentCliRuntimeStatus | null {
  if (!rawValue?.trim()) return null;
  try {
    const parsed = JSON.parse(rawValue) as Partial<AgentCliRuntimeStatus>;
    if (!Array.isArray(parsed.runtimes)) return emptyAgentCliRuntimeStatus();
    return buildAgentCliRuntimeStatus(
      parsed.runtimes.filter((runtime): runtime is AgentCliRuntimeRecord => (
        runtime != null
        && (runtime.id === 'codex' || runtime.id === 'claude')
        && typeof runtime.label === 'string'
        && typeof runtime.command === 'string'
        && typeof runtime.installed === 'boolean'
      )),
      parsed.updatedAt ?? null,
    );
  } catch {
    return emptyAgentCliRuntimeStatus();
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export { emptyAgentCliRuntimeStatus };
