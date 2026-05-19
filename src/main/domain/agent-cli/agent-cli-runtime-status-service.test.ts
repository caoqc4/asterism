import { afterEach, describe, expect, it } from 'vitest';

import type { AgentCliRuntimeId } from '../../../shared/agent-cli-runtime-status.js';

import {
  AGENT_CLI_RUNTIME_FIXTURE_ENV,
  AgentCliRuntimeStatusService,
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
      installed: command === 'codex',
      version: command === 'codex' ? 'codex 0.42.0' : null,
    }));

    const status = await service.getStatus();

    expect(status.readyCount).toBe(1);
    expect(status.runtimes.find((runtime) => runtime.id === 'codex')).toMatchObject({
      authState: 'ready',
      missingReason: null,
    });
  });

  it('reports Claude Code login state without enabling execution support', async () => {
    const service = new AgentCliRuntimeStatusService(async (command) => ({
      authState: command === 'claude' ? 'needs_login' : 'ready',
      installed: true,
      version: command === 'claude' ? 'claude 2.1.128' : 'codex 0.42.0',
    }));

    const status = await service.getStatus();

    expect(status.runtimes.find((runtime) => runtime.id === 'claude')).toMatchObject({
      authState: 'needs_login',
      executionSupport: 'status_only',
      installed: true,
      missingReason: 'Claude Code is installed but not logged in; run claude auth login.',
    });
    expect(status.manualRunCount).toBe(1);
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
