import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AgentCliRuntimeId } from '../../../shared/agent-cli-runtime-status.js';

import {
  AGENT_CLI_RUNTIME_FIXTURE_ENV,
  AgentCliRuntimeStatusService,
  executableProbeFailureReason,
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
    fs.writeFileSync(path.join(tempRoot, 'claude'), '#!/bin/sh\necho no\n', { mode: 0o644 });
    process.env.PATH = `${tempRoot}:${previousPath ?? ''}`;

    try {
      const status = await probeAgentCliCommand('claude', 'claude');

      expect(status).toMatchObject({
        authState: 'error',
        executablePath: path.join(tempRoot, 'claude'),
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
