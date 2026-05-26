import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE,
  buildDefaultAgentCliRuntimeCapabilities,
  buildAgentCliRuntimeStatus,
  emptyAgentCliRuntimeStatus,
  type AgentCliAuthState,
  type AgentCliRuntimeCapabilityProbeSignals,
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
  capabilitySignals?: AgentCliRuntimeCapabilityProbeSignals | null;
  executablePath?: string | null;
  installed: boolean;
  version: string | null;
  errorReason?: string | null;
}>;

const PROBE_TIMEOUT_MS = 1_500;
export const AGENT_CLI_RUNTIME_FIXTURE_ENV = 'TASKPLANE_AGENT_CLI_RUNTIME_FIXTURE_JSON';
const COMMON_CLI_PATH_SETUP = [
  'for d in "$HOME"/.nvm/versions/node/*/bin "$HOME"/.npm-global/bin "$HOME"/.local/bin /opt/homebrew/bin /usr/local/bin; do',
  '  [ -d "$d" ] && PATH="$PATH:$d"',
  'done',
].join('; ');

export class AgentCliRuntimeStatusService {
  constructor(
    private readonly probeCommand: AgentCliCommandProbe = probeAgentCliCommand,
    private readonly workloadTracker: AgentCliRuntimeWorkloadTracker = agentCliRuntimeWorkloadTracker,
  ) {}

  async getStatus(options: { workspaceRoot?: string | null } = {}): Promise<AgentCliRuntimeStatus> {
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
        capabilities: buildDefaultAgentCliRuntimeCapabilities(
          runtime.id,
          runtime.label,
          probe.version,
          mergeAgentCliCapabilitySignals(
            probe.capabilitySignals ?? null,
            detectWorkspaceCapabilitySignals(runtime.id, options.workspaceRoot),
          ),
        ),
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

export async function probeAgentCliCommand(command: string, runtimeId: AgentCliRuntimeId): Promise<{
  authReason?: string | null;
  authState?: AgentCliAuthState;
  capabilitySignals?: AgentCliRuntimeCapabilityProbeSignals | null;
  executablePath?: string | null;
  installed: boolean;
  version: string | null;
  errorReason?: string | null;
}> {
  const pathProbe = await runProbe('/bin/zsh', ['-lc', [
    COMMON_CLI_PATH_SETUP,
    `command -v ${shellQuote(command)} || for d in "\${(@s/:/)PATH}"; do [ -e "$d/${command}" ] && echo "$d/${command}" && break; done`,
  ].join('; ')]);
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
  const capabilityProbePromise = Promise.all(
    nativeCapabilityProbeArgs(runtimeId).map((args) => runProbe(executable, args)),
  );
  const packagedMetadataSignals = detectPackagedCliCapabilitySignals(executable, runtimeId);
  const [versionProbe, authProbe, capabilityProbe] = await Promise.all([
    runProbe(executable, ['--version']),
    authProbePromise,
    capabilityProbePromise,
  ]);
  const executableFailure = executableProbeFailureReason(command, versionProbe);
  if (executableFailure) {
    return {
      authReason: executableFailure,
      authState: 'error',
      executablePath,
      installed: true,
      version: null,
    };
  }
  const authStatus = authProbe
    ? authStateFromLoginProbe(authProbe, { nonZeroMeansNeedsLogin: runtimeId === 'claude' })
    : null;
  return {
    authReason: authStatus?.reason ?? null,
    authState: authStatus?.state,
    capabilitySignals: mergeAgentCliCapabilitySignals(
      capabilityProbe.some((probe) => probe.exitCode === 0)
        ? parseAgentCliCapabilitySignals(
          runtimeId,
          capabilityProbe.map((probe) => probe.stdout).join('\n'),
          capabilityProbe.map((probe) => probe.stderr).join('\n'),
        )
        : null,
      packagedMetadataSignals,
    ),
    executablePath,
    installed: true,
    version: versionProbe.exitCode === 0
      ? firstLine(versionProbe.stdout || versionProbe.stderr)
      : null,
  };
}

export function nativeCapabilityProbeArgs(runtimeId: AgentCliRuntimeId): string[][] {
  if (runtimeId === 'codex') return [['--help'], ['exec', '--help']];
  if (runtimeId === 'claude') return [['--help'], ['-p', '--help']];
  return [];
}

export function parseAgentCliCapabilitySignals(
  runtimeId: AgentCliRuntimeId,
  stdout: string,
  stderr: string,
): AgentCliRuntimeCapabilityProbeSignals {
  const output = `${stdout}\n${stderr}`;
  return {
    hooks: runtimeId === 'claude' && /--include-hook-events|hook lifecycle/i.test(output),
    nativeClear: /\b(clear|reset)\b/i.test(output) && /conversation|session|context/i.test(output),
    nativeCompact: /\bcompact\b|PreCompact|PostCompact/i.test(output),
    nativeMemory: runtimeId === 'claude'
      ? /auto-memory|CLAUDE\.md|memory paths|project memory/i.test(output)
      : /AGENTS\.md|memory/i.test(output),
    nativeResume: runtimeId === 'codex'
      ? /\bresume\b/i.test(output)
      : /--resume\b|--continue\b|resume a conversation/i.test(output),
    planMode: runtimeId === 'claude'
      ? /--permission-mode[\s\S]*\bplan\b|\bchoices:[^\n]*plan/i.test(output)
      : /--sandbox[\s\S]*read-only/i.test(output),
    structuredProgressEvents: runtimeId === 'codex'
      ? /--json\b/.test(output)
      : runtimeId === 'claude'
        ? /stream-json/.test(output)
        : undefined,
    subagents: runtimeId === 'claude' && /--agents?\b|custom agents/i.test(output),
    webSearch: runtimeId === 'codex'
      ? /--search\b|web_search/i.test(output)
      : /web\s*search|browser|chrome integration|--chrome\b/i.test(output),
  };
}

export function detectWorkspaceCapabilitySignals(
  runtimeId: AgentCliRuntimeId,
  workspaceRoot: string | null | undefined,
): AgentCliRuntimeCapabilityProbeSignals | null {
  const root = workspaceRoot?.trim();
  if (!root) return null;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(root);
  } catch {
    return null;
  }
  if (!stat.isDirectory()) return null;

  if (runtimeId === 'codex') {
    const metadataSignals = detectCodexMetadataSignals(root);
    return compactSignals({
      nativeMemory: fileExists(path.join(root, 'AGENTS.md'))
        || fileExists(path.join(root, '.codex', 'AGENTS.md')),
      webSearch: metadataSignals.webSearch,
    });
  }

  if (runtimeId === 'claude') {
    const settingsSignals = detectClaudeSettingsSignals(root);
    return compactSignals({
      hooks: settingsSignals.hooks
        || directoryHasEntries(path.join(root, '.claude', 'hooks')),
      nativeMemory: fileExists(path.join(root, 'CLAUDE.md'))
        || fileExists(path.join(root, '.claude', 'CLAUDE.md'))
        || fileExists(path.join(root, '.claude', 'memory.md')),
      subagents: directoryHasUsableClaudeAgentMarkdownFile(path.join(root, '.claude', 'agents')),
      webSearch: settingsSignals.webSearch,
    });
  }

  return null;
}

export function detectPackagedCliCapabilitySignals(
  executablePath: string | null | undefined,
  runtimeId: AgentCliRuntimeId,
): AgentCliRuntimeCapabilityProbeSignals | null {
  if (!executablePath?.trim()) return null;

  const packageJsonPath = findProviderOwnedPackageJson(executablePath, runtimeId);
  if (!packageJsonPath) return null;

  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isProviderOwnedCliPackage(parsed, runtimeId)) return null;
    return compactSignals({
      webSearch: packageMetadataDeclaresWebSearch(parsed),
    });
  } catch {
    return null;
  }
}

export function mergeAgentCliCapabilitySignals(
  primary: AgentCliRuntimeCapabilityProbeSignals | null | undefined,
  secondary: AgentCliRuntimeCapabilityProbeSignals | null | undefined,
): AgentCliRuntimeCapabilityProbeSignals | null {
  if (!primary && !secondary) return null;
  const result: AgentCliRuntimeCapabilityProbeSignals = {};
  const keys: Array<keyof AgentCliRuntimeCapabilityProbeSignals> = [
    'hooks',
    'nativeClear',
    'nativeCompact',
    'nativeMemory',
    'nativeResume',
    'planMode',
    'structuredProgressEvents',
    'subagents',
    'webSearch',
  ];

  for (const key of keys) {
    const primaryValue = primary?.[key];
    const secondaryValue = secondary?.[key];
    const value = primaryValue === true || secondaryValue === true
      ? true
      : primaryValue ?? secondaryValue;
    if (value !== undefined) result[key] = value;
  }

  return Object.keys(result).length ? result : null;
}

export function executableProbeFailureReason(
  command: string,
  probe: { exitCode: number | null; stdout: string; stderr: string },
): string | null {
  if (probe.exitCode === 0) return null;
  const output = `${probe.stdout}\n${probe.stderr}`;
  if (/permission denied|EACCES/i.test(output)) {
    return `${command} is present but is not executable; reinstall the official CLI.`;
  }
  if (/native binary not installed|postinstall did not run|optional dependency/i.test(output)) {
    return `${command} install is incomplete; reinstall the official CLI with optional dependencies enabled.`;
  }
  return null;
}

function compactSignals(
  signals: AgentCliRuntimeCapabilityProbeSignals,
): AgentCliRuntimeCapabilityProbeSignals | null {
  const compacted = Object.fromEntries(
    Object.entries(signals).filter(([, value]) => value !== undefined && value !== false),
  ) as AgentCliRuntimeCapabilityProbeSignals;
  return Object.keys(compacted).length ? compacted : null;
}

function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function directoryHasEntries(directoryPath: string): boolean {
  try {
    return fs.statSync(directoryPath).isDirectory()
      && fs.readdirSync(directoryPath).some((entry) => !entry.startsWith('.'));
  } catch {
    return false;
  }
}

function directoryHasUsableClaudeAgentMarkdownFile(directoryPath: string): boolean {
  try {
    if (!fs.statSync(directoryPath).isDirectory()) return false;
    return fs.readdirSync(directoryPath).some((entry) => {
      if (entry.startsWith('.') || !/\.md$/i.test(entry)) return false;
      const filePath = path.join(directoryPath, entry);
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size === 0) return false;
        const content = fs.readFileSync(filePath, 'utf8').trim();
        return hasUsableClaudeAgentContent(content);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function detectCodexMetadataSignals(workspaceRoot: string): AgentCliRuntimeCapabilityProbeSignals {
  return [
    path.join(workspaceRoot, '.codex', 'config.toml'),
    path.join(workspaceRoot, '.codex', 'config.json'),
  ].reduce<AgentCliRuntimeCapabilityProbeSignals>((signals, metadataPath) => {
    try {
      const raw = fs.readFileSync(metadataPath, 'utf8');
      if (codexMetadataDeclaresWebSearch(raw)) signals.webSearch = true;
    } catch {
      // Metadata probes are best-effort and must not block runtime status.
    }
    return signals;
  }, {});
}

function findProviderOwnedPackageJson(
  executablePath: string,
  runtimeId: AgentCliRuntimeId,
): string | null {
  let current: string;
  try {
    current = path.dirname(fs.realpathSync(executablePath));
  } catch {
    current = path.dirname(executablePath);
  }

  for (let depth = 0; depth < 8; depth += 1) {
    const packageJsonPath = path.join(current, 'package.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as unknown;
      if (isProviderOwnedCliPackage(parsed, runtimeId)) return packageJsonPath;
    } catch {
      // Keep walking; package metadata probes are optional and best-effort.
    }

    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }

  return null;
}

function isProviderOwnedCliPackage(value: unknown, runtimeId: AgentCliRuntimeId): boolean {
  if (!isRecord(value) || typeof value.name !== 'string') return false;
  const name = value.name.toLowerCase();
  return runtimeId === 'codex'
    ? /\b(openai|codex)\b/.test(name)
    : /\b(anthropic|claude)\b/.test(name);
}

function packageMetadataDeclaresWebSearch(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [
    value.taskplane,
    value.capabilities,
    value.nativeCapabilities,
    value.features,
    value.tools,
    value.permissions,
    value.cli,
    value.config,
  ].some(containsNativeWebSearchSignal);
}

function codexMetadataDeclaresWebSearch(raw: string): boolean {
  if (!raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    return containsNativeWebSearchSignal(parsed);
  } catch {
    return /(?:^|\n)\s*(?:web[_-]?search|search)\s*=\s*true\b/i.test(raw)
      || /\b(?:web[_-]?search|browser_search)\b[\s\S]{0,120}\b(?:enabled|available|true)\b/i.test(raw);
  }
}

function detectClaudeSettingsSignals(workspaceRoot: string): AgentCliRuntimeCapabilityProbeSignals {
  return [
    path.join(workspaceRoot, '.claude', 'settings.json'),
    path.join(workspaceRoot, '.claude', 'settings.local.json'),
  ].reduce<AgentCliRuntimeCapabilityProbeSignals>((signals, settingsPath) => {
    try {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      if (!raw.trim()) return signals;
      const parsed = JSON.parse(raw) as { hooks?: unknown };
      if (hasConfiguredClaudeHook(parsed.hooks)) signals.hooks = true;
      if (containsNativeWebSearchSignal(parsed)) signals.webSearch = true;
    } catch {
      // Metadata probes are best-effort and must not block runtime status.
    }
    return signals;
  }, {});
}

function hasConfiguredClaudeHook(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasConfiguredClaudeHook);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasConfiguredClaudeHook);
  }
  return Boolean(value);
}

function hasUsableClaudeAgentContent(content: string): boolean {
  if (!content) return false;
  if (/^(todo|tbd|placeholder)$/i.test(content)) return false;
  return /(?:^|\n)#\s+\S/.test(content)
    || /^---[\s\S]*\b(?:name|description)\s*:/i.test(content)
    || /\b(?:name|description|tools|model)\s*:/i.test(content);
}

function containsNativeWebSearchSignal(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (typeof value === 'string') {
    return /\b(?:WebSearch|WebFetch|web[_-]?search|web[_-]?fetch|browser_search|chrome)\b/i.test(value);
  }
  if (Array.isArray(value)) return value.some(containsNativeWebSearchSignal);
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([key, nested]) => (
      containsNativeWebSearchSignal(key) || containsNativeWebSearchSignal(nested)
    ));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
        stderr: String(stderr || error?.message || ''),
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
