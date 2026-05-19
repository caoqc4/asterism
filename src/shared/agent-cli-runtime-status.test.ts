import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE,
  buildAgentCliRuntimeStatus,
  emptyAgentCliRuntimeStatus,
} from './agent-cli-runtime-status.js';

describe('agent cli runtime status', () => {
  it('defines Codex as the first manual-run runtime and Claude Code as status-only', () => {
    expect(DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE).toEqual([
      expect.objectContaining({ id: 'codex', command: 'codex', executionSupport: 'manual_run' }),
      expect.objectContaining({ id: 'claude', command: 'claude', executionSupport: 'status_only' }),
    ]);
  });

  it('builds empty status from the default catalogue without counting missing CLIs as errors', () => {
    const status = emptyAgentCliRuntimeStatus();

    expect(status.catalogueCount).toBe(2);
    expect(status.detectedCount).toBe(0);
    expect(status.readyCount).toBe(0);
    expect(status.manualRunCount).toBe(0);
    expect(status.readyManualRunCount).toBe(0);
    expect(status.errorCount).toBe(0);
  });

  it('summarizes detected, ready, manual-run, running, and errored runtimes', () => {
    const status = buildAgentCliRuntimeStatus([
      {
        id: 'codex',
        label: 'Codex CLI',
        command: 'codex',
        installed: true,
        version: 'codex 1.0.0',
        authState: 'ready',
        executionSupport: 'manual_run',
        workload: 'running',
        missingReason: null,
      },
      {
        id: 'claude',
        label: 'Claude Code',
        command: 'claude',
        installed: true,
        version: null,
        authState: 'error',
        executionSupport: 'status_only',
        workload: 'idle',
        missingReason: 'Login failed.',
      },
    ], '2026-05-19T00:00:00.000Z');

    expect(status).toMatchObject({
      catalogueCount: 2,
      detectedCount: 2,
      readyCount: 1,
      manualRunCount: 1,
      readyManualRunCount: 1,
      runningCount: 1,
      errorCount: 1,
      updatedAt: '2026-05-19T00:00:00.000Z',
    });
  });

  it('does not count status-only authenticated runtimes as ready manual-run runtimes', () => {
    const status = buildAgentCliRuntimeStatus([
      {
        id: 'codex',
        label: 'Codex CLI',
        command: 'codex',
        installed: true,
        version: 'codex 1.0.0',
        authState: 'needs_login',
        executionSupport: 'manual_run',
        workload: 'idle',
        missingReason: 'Codex CLI login required.',
      },
      {
        id: 'claude',
        label: 'Claude Code',
        command: 'claude',
        installed: true,
        version: 'claude 2.1.128',
        authState: 'ready',
        executionSupport: 'status_only',
        workload: 'idle',
        missingReason: null,
      },
    ]);

    expect(status).toMatchObject({
      detectedCount: 2,
      readyCount: 1,
      manualRunCount: 1,
      readyManualRunCount: 0,
    });
  });
});
