import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AgentCliRuntimeId } from '../../../shared/agent-cli-runtime-status.js';

import {
  AGENT_CLI_RUNTIME_FIXTURE_ENV,
  AgentCliRuntimeStatusService,
  detectPackagedCliCapabilitySignals,
  detectWorkspaceCapabilitySignals,
  executableProbeFailureReason,
  mergeAgentCliCapabilitySignals,
  nativeCapabilityProbeArgs,
  parseAgentCliCapabilitySignals,
  probeAgentCliCommand,
} from './agent-cli-runtime-status-service.js';
import { AgentCliRuntimeWorkloadTracker } from './agent-cli-runtime-workload.js';

describe('agent cli runtime status service', () => {
  afterEach(() => {
    delete process.env[AGENT_CLI_RUNTIME_FIXTURE_ENV];
  });

  it('detects Codex and Claude CLI availability through an injected probe', async () => {
    const probed: Array<{ command: string; runtimeId: AgentCliRuntimeId }> = [];
    const service = new AgentCliRuntimeStatusService(async (command, runtimeId) => {
      probed.push({ command, runtimeId });
      if (command === 'codex') {
        return { installed: true, version: 'codex 0.42.0' };
      }
      return { installed: false, version: null, errorReason: `${command} was not found on PATH.` };
    });

    const status = await service.getStatus();

    expect(status.detectedCount).toBe(1);
    expect(status.manualRunCount).toBe(1);
    expect(status.readyCount).toBe(0);
    expect(status.runtimes.find((runtime) => runtime.id === 'codex')).toMatchObject({
      installed: true,
      version: 'codex 0.42.0',
      authState: 'unknown',
      executionSupport: 'manual_run',
      workload: 'idle',
      missingReason: 'Authentication is managed by Codex CLI; run codex login if execution reports a login error.',
      capabilities: {
        nativeGoalMode: {
          availability: 'requires_update',
          minimumVersion: '0.133.0',
        },
        nativeCapabilities: {
          structuredProgressEvents: {
            availability: 'available',
          },
          workspaceRead: {
            availability: 'available',
          },
          workspaceWrite: {
            availability: 'unsupported',
          },
        },
        supportsStructuredProgressEvents: true,
        supportsNativeGoalMode: false,
      },
    });
    expect(status.runtimes.find((runtime) => runtime.id === 'claude')).toMatchObject({
      installed: false,
      workload: 'blocked',
      missingReason: 'claude was not found on PATH.',
    });
    expect(probed).toEqual([
      { command: 'codex', runtimeId: 'codex' },
      { command: 'claude', runtimeId: 'claude' },
    ]);
  });

  it('marks Codex ready when the injected probe reports official CLI login status', async () => {
    const service = new AgentCliRuntimeStatusService(async (command) => ({
      authState: command === 'codex' ? 'ready' : 'unknown',
      executablePath: command === 'codex' ? '/opt/homebrew/bin/codex' : null,
      installed: command === 'codex',
      version: command === 'codex' ? 'codex 0.42.0' : null,
    }));

    const status = await service.getStatus();

    expect(status.readyCount).toBe(1);
    expect(status.runtimes.find((runtime) => runtime.id === 'codex')).toMatchObject({
      authState: 'ready',
      command: 'codex',
      executablePath: '/opt/homebrew/bin/codex',
      missingReason: null,
      capabilities: {
        nativeGoalMode: {
          availability: 'requires_update',
        },
        nativeCapabilities: {
          structuredProgressEvents: {
            availability: 'available',
          },
          webSearch: {
            availability: 'unverified',
          },
        },
        supportsStructuredProgressEvents: true,
        supportsNativeGoalMode: false,
      },
    });
  });

  it('checks multiple help surfaces for native capability signals', () => {
    expect(nativeCapabilityProbeArgs('codex')).toEqual([['--help'], ['exec', '--help']]);
    expect(nativeCapabilityProbeArgs('claude')).toEqual([['--help'], ['-p', '--help']]);
  });

  it('parses Codex web search and resume signals from help output', () => {
    const signals = parseAgentCliCapabilitySignals('codex', [
      'Commands:',
      '  exec',
      '  resume',
      'Options:',
      '  --search Enable live web search',
      '  --json Print events to stdout as JSONL',
      '  --sandbox <SANDBOX_MODE> [possible values: read-only, workspace-write]',
    ].join('\n'), '');

    expect(signals).toMatchObject({
      nativeResume: true,
      planMode: true,
      structuredProgressEvents: true,
      webSearch: true,
    });
  });

  it('parses Claude hooks, subagents, memory, plan, and resume signals from help output', () => {
    const signals = parseAgentCliCapabilitySignals('claude', [
      '--include-hook-events Include all hook lifecycle events',
      '--agents <json> JSON object defining custom agents',
      '--permission-mode <mode> choices: acceptEdits, auto, default, plan',
      '--bare Minimal mode: skip hooks, auto-memory, and CLAUDE.md auto-discovery',
      '--resume Resume a conversation by session ID',
      '--output-format <format> choices: text, json, stream-json',
    ].join('\n'), '');

    expect(signals).toMatchObject({
      hooks: true,
      nativeMemory: true,
      nativeResume: true,
      planMode: true,
      structuredProgressEvents: true,
      subagents: true,
    });
  });

  it('parses native compact and clear context signals from help output', () => {
    const signals = parseAgentCliCapabilitySignals('claude', [
      'Hook events: PreCompact, PostCompact',
      'Use clear to reset the conversation context.',
    ].join('\n'), '');

    expect(signals).toMatchObject({
      nativeClear: true,
      nativeCompact: true,
    });
  });

  it('promotes probed compact and clear signals into adapter capability support without granting persistence', async () => {
    const service = new AgentCliRuntimeStatusService(async (command) => ({
      authState: command === 'claude' ? 'ready' : 'unknown',
      capabilitySignals: command === 'claude'
        ? {
            nativeClear: true,
            nativeCompact: true,
          }
        : null,
      installed: command === 'claude',
      version: command === 'claude' ? 'claude 2.1.144' : null,
    }));

    const status = await service.getStatus();
    const claude = status.runtimes.find((runtime) => runtime.id === 'claude');

    expect(claude).toMatchObject({
      capabilities: {
        supportsNativeClear: true,
        supportsNativeCompact: true,
        supportsPersistentSession: false,
        nativeCapabilities: {
          clear: { availability: 'runtime_dependent' },
          compact: { availability: 'runtime_dependent' },
        },
      },
    });
  });

  it('detects workspace-native guidance, hook, and subagent files without executing a runtime', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-workspace-signals-'));

    try {
      fs.writeFileSync(path.join(tempRoot, 'AGENTS.md'), '# Agent guidance\n');
      fs.mkdirSync(path.join(tempRoot, '.codex'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, '.codex', 'config.toml'), 'web_search = true\n');
      fs.writeFileSync(path.join(tempRoot, 'CLAUDE.md'), '# Claude guidance\n');
      fs.mkdirSync(path.join(tempRoot, '.claude', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, '.claude', 'agents', 'reviewer.md'), '# Reviewer\n');
      fs.writeFileSync(path.join(tempRoot, '.claude', 'settings.json'), JSON.stringify({
        allowedTools: ['WebSearch'],
        hooks: {
          PreToolUse: [{
            hooks: [{
              command: 'npm test',
              type: 'command',
            }],
          }],
        },
      }));

      expect(detectWorkspaceCapabilitySignals('codex', tempRoot)).toMatchObject({
        nativeMemory: true,
        webSearch: true,
      });
      expect(detectWorkspaceCapabilitySignals('claude', tempRoot)).toMatchObject({
        hooks: true,
        nativeMemory: true,
        subagents: true,
        webSearch: true,
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not treat placeholder Claude agent markdown as subagent readiness', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-placeholder-agent-signals-'));

    try {
      fs.mkdirSync(path.join(tempRoot, '.claude', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, '.claude', 'agents', 'placeholder.md'), 'placeholder\n');

      expect(detectWorkspaceCapabilitySignals('claude', tempRoot)).toBeNull();

      fs.writeFileSync(path.join(tempRoot, '.claude', 'agents', 'usable.md'), [
        '---',
        'name: reviewer',
        'description: Reviews code changes',
        '---',
        '',
      ].join('\n'));

      expect(detectWorkspaceCapabilitySignals('claude', tempRoot)).toMatchObject({
        subagents: true,
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('promotes metadata web search signals through runtime status without executing a runtime', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-metadata-signals-'));

    try {
      fs.mkdirSync(path.join(tempRoot, '.codex'), { recursive: true });
      fs.mkdirSync(path.join(tempRoot, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, '.codex', 'config.json'), JSON.stringify({
        tools: {
          web_search: true,
        },
      }));
      fs.writeFileSync(path.join(tempRoot, '.claude', 'settings.local.json'), JSON.stringify({
        permissions: {
          allow: ['WebFetch'],
        },
      }));
      const service = new AgentCliRuntimeStatusService(async (command) => ({
        authState: 'ready',
        installed: true,
        version: command === 'codex' ? 'codex-cli 0.133.0' : 'claude 2.1.144',
      }));

      const status = await service.getStatus({ workspaceRoot: tempRoot });

      expect(status.runtimes.find((runtime) => runtime.id === 'codex')).toMatchObject({
        capabilities: {
          nativeCapabilities: {
            webSearch: { availability: 'runtime_dependent' },
          },
        },
      });
      expect(status.runtimes.find((runtime) => runtime.id === 'claude')).toMatchObject({
        capabilities: {
          nativeCapabilities: {
            webSearch: { availability: 'runtime_dependent' },
          },
        },
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('detects explicit provider-owned package metadata without executing the CLI', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-package-signals-'));

    try {
      const packageRoot = path.join(tempRoot, 'node_modules', '@openai', 'codex');
      fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(packageRoot, 'bin', 'codex.js'), '#!/usr/bin/env node\n');
      fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
        name: '@openai/codex',
        taskplane: {
          nativeCapabilities: {
            web_search: true,
          },
        },
      }));

      expect(detectPackagedCliCapabilitySignals(path.join(packageRoot, 'bin', 'codex.js'), 'codex')).toMatchObject({
        webSearch: true,
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('ignores non-provider package metadata even when it mentions search tools', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-package-ignore-'));

    try {
      fs.mkdirSync(path.join(tempRoot, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, 'bin', 'codex.js'), '#!/usr/bin/env node\n');
      fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
        name: 'local-wrapper',
        capabilities: {
          web_search: true,
        },
      }));

      expect(detectPackagedCliCapabilitySignals(path.join(tempRoot, 'bin', 'codex.js'), 'codex')).toBeNull();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not treat empty Claude hook settings as configured hook readiness', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-empty-hook-signals-'));

    try {
      fs.mkdirSync(path.join(tempRoot, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, '.claude', 'settings.json'), JSON.stringify({
        hooks: {
          PreToolUse: [],
          PostToolUse: {},
        },
      }));
      fs.writeFileSync(path.join(tempRoot, 'CLAUDE.md'), '# Claude guidance\n');

      expect(detectWorkspaceCapabilitySignals('claude', tempRoot)).toMatchObject({
        nativeMemory: true,
      });
      expect(detectWorkspaceCapabilitySignals('claude', tempRoot)).not.toMatchObject({
        hooks: true,
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('requires non-empty Claude agent markdown files for workspace subagent readiness', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-empty-agent-signals-'));

    try {
      fs.mkdirSync(path.join(tempRoot, '.claude', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, '.claude', 'agents', 'empty.md'), '');
      fs.writeFileSync(path.join(tempRoot, '.claude', 'agents', 'notes.txt'), 'not an agent markdown file\n');
      fs.writeFileSync(path.join(tempRoot, 'CLAUDE.md'), '# Claude guidance\n');

      expect(detectWorkspaceCapabilitySignals('claude', tempRoot)).toMatchObject({
        nativeMemory: true,
      });
      expect(detectWorkspaceCapabilitySignals('claude', tempRoot)).not.toMatchObject({
        subagents: true,
      });

      fs.writeFileSync(path.join(tempRoot, '.claude', 'agents', 'reviewer.md'), '# Reviewer\n');

      expect(detectWorkspaceCapabilitySignals('claude', tempRoot)).toMatchObject({
        nativeMemory: true,
        subagents: true,
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('merges provider help signals with workspace signals conservatively', () => {
    expect(mergeAgentCliCapabilitySignals(
      { structuredProgressEvents: false, webSearch: true },
      { hooks: true, structuredProgressEvents: true },
    )).toMatchObject({
      hooks: true,
      structuredProgressEvents: true,
      webSearch: true,
    });
  });

  it('marks Codex native goal capability available only on the stabilized CLI version', async () => {
    const service = new AgentCliRuntimeStatusService(async (command) => ({
      authState: command === 'codex' ? 'ready' : 'unknown',
      installed: command === 'codex',
      version: command === 'codex' ? 'codex-cli 0.133.0' : null,
    }));

    const status = await service.getStatus();

    expect(status.runtimes.find((runtime) => runtime.id === 'codex')).toMatchObject({
      capabilities: {
        nativeGoalMode: {
          availability: 'available',
          minimumVersion: '0.133.0',
        },
        supportsClearGoal: true,
        supportsNativeGoalMode: true,
        supportsPauseGoal: true,
        supportsResumeGoal: true,
      },
    });
  });

  it('reports Claude Code login state for the manual-run adapter', async () => {
    const service = new AgentCliRuntimeStatusService(async (command) => ({
      authState: command === 'claude' ? 'needs_login' : 'ready',
      installed: true,
      version: command === 'claude' ? 'claude 2.1.128' : 'codex 0.42.0',
    }));

    const status = await service.getStatus();

    expect(status.runtimes.find((runtime) => runtime.id === 'claude')).toMatchObject({
      authState: 'needs_login',
      executionSupport: 'manual_run',
      installed: true,
      missingReason: 'Claude Code is installed but not logged in; run claude auth login.',
    });
    expect(status.manualRunCount).toBe(2);
  });

  it('classifies present but non-executable CLI probes as install errors', () => {
    expect(executableProbeFailureReason('claude', {
      exitCode: 126,
      stdout: '',
      stderr: 'zsh: permission denied: claude',
    })).toBe('claude is present but is not executable; reinstall the official CLI.');

    expect(executableProbeFailureReason('claude', {
      exitCode: 1,
      stdout: '',
      stderr: 'Error: claude native binary not installed. Either postinstall did not run or optional dependency was not downloaded.',
    })).toBe('claude install is incomplete; reinstall the official CLI with optional dependencies enabled.');
  });

  it('keeps probing a PATH command that exists but is not executable', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-probe-'));
    const previousPath = process.env.PATH;
    fs.writeFileSync(path.join(tempRoot, 'taskplane-fake-claude'), '#!/bin/sh\necho no\n', { mode: 0o644 });
    process.env.PATH = `${tempRoot}:${previousPath ?? ''}`;

    try {
      const status = await probeAgentCliCommand('taskplane-fake-claude', 'claude');

      expect(status).toMatchObject({
        authState: 'error',
        executablePath: path.join(tempRoot, 'taskplane-fake-claude'),
        installed: true,
        version: null,
      });
      expect(status.authReason).toContain('not executable');
    } finally {
      process.env.PATH = previousPath;
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('projects active Agent CLI runs into runtime workload status', async () => {
    const workloadTracker = new AgentCliRuntimeWorkloadTracker();
    const lease = workloadTracker.start('codex', 'run_1');
    const service = new AgentCliRuntimeStatusService(async (command) => ({
      authState: command === 'codex' ? 'ready' : 'unknown',
      installed: command === 'codex',
      version: command === 'codex' ? 'codex 0.42.0' : null,
    }), workloadTracker);

    const runningStatus = await service.getStatus();
    lease.finish();
    const idleStatus = await service.getStatus();

    expect(runningStatus.runningCount).toBe(1);
    expect(runningStatus.runtimes.find((runtime) => runtime.id === 'codex')).toMatchObject({
      workload: 'running',
    });
    expect(idleStatus.runningCount).toBe(0);
    expect(idleStatus.runtimes.find((runtime) => runtime.id === 'codex')).toMatchObject({
      workload: 'idle',
    });
  });

  it('keeps fixture status deterministic instead of overlaying live workload', async () => {
    const workloadTracker = new AgentCliRuntimeWorkloadTracker();
    workloadTracker.start('codex', 'run_1');
    process.env[AGENT_CLI_RUNTIME_FIXTURE_ENV] = JSON.stringify({
      updatedAt: '2026-05-19T00:00:00.000Z',
      runtimes: [{
        id: 'codex',
        label: 'Codex CLI',
        command: 'codex',
        installed: true,
        version: 'codex fixture',
        authState: 'ready',
        executionSupport: 'manual_run',
        workload: 'idle',
        missingReason: null,
      }],
    });
    const service = new AgentCliRuntimeStatusService(async () => {
      throw new Error('probe should not run when fixture is provided');
    }, workloadTracker);

    const status = await service.getStatus();

    expect(status.runningCount).toBe(0);
    expect(status.runtimes.find((runtime) => runtime.id === 'codex')).toMatchObject({
      workload: 'idle',
    });
  });

  it('uses a fixture environment value for deterministic status tests', async () => {
    process.env[AGENT_CLI_RUNTIME_FIXTURE_ENV] = JSON.stringify({
      updatedAt: '2026-05-19T00:00:00.000Z',
      runtimes: [{
        id: 'codex',
        label: 'Codex CLI',
        command: 'codex',
        installed: true,
        version: 'codex fixture',
        authState: 'ready',
        executionSupport: 'manual_run',
        workload: 'idle',
        missingReason: null,
      }],
    });
    const service = new AgentCliRuntimeStatusService(async () => {
      throw new Error('probe should not run when fixture is provided');
    });

    const status = await service.getStatus();

    expect(status.readyCount).toBe(1);
    expect(status.updatedAt).toBe('2026-05-19T00:00:00.000Z');
  });
});
