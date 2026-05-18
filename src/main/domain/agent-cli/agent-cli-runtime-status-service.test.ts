import { afterEach, describe, expect, it } from 'vitest';

import {
  AGENT_CLI_RUNTIME_FIXTURE_ENV,
  AgentCliRuntimeStatusService,
} from './agent-cli-runtime-status-service.js';

describe('agent cli runtime status service', () => {
  afterEach(() => {
    delete process.env[AGENT_CLI_RUNTIME_FIXTURE_ENV];
  });

  it('detects Codex and Claude CLI availability through an injected probe', async () => {
    const service = new AgentCliRuntimeStatusService(async (command) => {
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
      missingReason: 'Authentication is managed by Codex CLI; run codex --login if execution reports a login error.',
    });
    expect(status.runtimes.find((runtime) => runtime.id === 'claude')).toMatchObject({
      installed: false,
      workload: 'blocked',
      missingReason: 'claude was not found on PATH.',
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
