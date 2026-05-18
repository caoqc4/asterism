import { execFile } from 'node:child_process';

import {
  DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE,
  buildAgentCliRuntimeStatus,
  emptyAgentCliRuntimeStatus,
  type AgentCliRuntimeRecord,
  type AgentCliRuntimeStatus,
} from '../../../shared/agent-cli-runtime-status.js';
import { readEnvValue } from '../../config/env.js';

export type AgentCliCommandProbe = (command: string) => Promise<{
  installed: boolean;
  version: string | null;
  errorReason?: string | null;
}>;

const PROBE_TIMEOUT_MS = 1_500;
export const AGENT_CLI_RUNTIME_FIXTURE_ENV = 'TASKPLANE_AGENT_CLI_RUNTIME_FIXTURE_JSON';

export class AgentCliRuntimeStatusService {
  constructor(
    private readonly probeCommand: AgentCliCommandProbe = probeAgentCliCommand,
  ) {}

  async getStatus(): Promise<AgentCliRuntimeStatus> {
    const fixture = parseAgentCliRuntimeFixture(readEnvValue(AGENT_CLI_RUNTIME_FIXTURE_ENV));
    if (fixture) return fixture;

    const records = await Promise.all(DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE.map(async (runtime): Promise<AgentCliRuntimeRecord> => {
      const probe = await this.probeCommand(runtime.command);
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
        authState: 'unknown',
        installed: true,
        missingReason: runtime.executionSupport === 'manual_run'
          ? `Authentication is managed by ${runtime.label}; run ${runtime.command} --login if execution reports a login error.`
          : `${runtime.label} detection is status-only in this version.`,
        version: probe.version,
        workload: 'idle',
      };
    }));

    return buildAgentCliRuntimeStatus(records, new Date().toISOString());
  }
}

export function createAgentCliRuntimeStatusService(): AgentCliRuntimeStatusService {
  return new AgentCliRuntimeStatusService();
}

async function probeAgentCliCommand(command: string): Promise<{
  installed: boolean;
  version: string | null;
  errorReason?: string | null;
}> {
  const pathProbe = await runProbe('/bin/zsh', ['-lc', `command -v ${shellQuote(command)}`]);
  if (pathProbe.exitCode !== 0 || !pathProbe.stdout.trim()) {
    return {
      errorReason: `${command} was not found on PATH.`,
      installed: false,
      version: null,
    };
  }

  const versionProbe = await runProbe(command, ['--version']);
  return {
    installed: true,
    version: versionProbe.exitCode === 0
      ? firstLine(versionProbe.stdout || versionProbe.stderr)
      : null,
  };
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
