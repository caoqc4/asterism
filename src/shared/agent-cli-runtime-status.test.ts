import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE,
  buildAgentCliRuntimeStatus,
  buildDefaultAgentCliRuntimeCapabilities,
  emptyAgentCliRuntimeStatus,
} from './agent-cli-runtime-status.js';

describe('agent cli runtime status', () => {
  it('defines Codex and Claude Code as first manual-run runtimes', () => {
    expect(DEFAULT_AGENT_CLI_RUNTIME_CATALOGUE).toEqual([
      expect.objectContaining({
        id: 'codex',
        command: 'codex',
        executionSupport: 'manual_run',
        capabilities: expect.objectContaining({
          nativeGoalMode: expect.objectContaining({
            availability: 'unknown',
            minimumVersion: '0.133.0',
          }),
          defaultResetStrategy: 'product_transcript_reset',
          supportsNativeClear: false,
          supportsNativeCompact: false,
          supportsNativeGoalMode: false,
          supportsPersistentSession: false,
          supportsStructuredProgressEvents: true,
          nativeCapabilities: expect.objectContaining({
            structuredProgressEvents: expect.objectContaining({ availability: 'available' }),
            webSearch: expect.objectContaining({ availability: 'unverified' }),
            workspaceRead: expect.objectContaining({ availability: 'available' }),
            workspaceWrite: expect.objectContaining({ availability: 'unsupported' }),
            memory: expect.objectContaining({ availability: 'product_controlled' }),
            compact: expect.objectContaining({ availability: 'product_controlled' }),
            clear: expect.objectContaining({ availability: 'product_controlled' }),
          }),
          commandRouting: expect.objectContaining({
            passthroughRequiresExplicitNamespace: true,
          }),
        }),
      }),
      expect.objectContaining({
        id: 'claude',
        command: 'claude',
        executionSupport: 'manual_run',
        capabilities: expect.objectContaining({
          defaultPermissionMode: 'plan',
          nativeGoalMode: expect.objectContaining({
            availability: 'unsupported',
          }),
          defaultResetStrategy: 'product_transcript_reset',
          supportsNativeClear: false,
          supportsNativeCompact: false,
          supportsNativeResume: false,
          supportsNativeGoalMode: false,
          supportsPersistentSession: false,
          supportsStructuredProgressEvents: true,
          nativeCapabilities: expect.objectContaining({
            structuredProgressEvents: expect.objectContaining({ availability: 'available' }),
            webSearch: expect.objectContaining({ availability: 'unverified' }),
            workspaceRead: expect.objectContaining({ availability: 'available' }),
            workspaceWrite: expect.objectContaining({ availability: 'unsupported' }),
          }),
        }),
      }),
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

  it('promotes probed Claude native agent and hook signals into capability declarations', () => {
    const status = buildAgentCliRuntimeStatus([
      {
        id: 'claude',
        label: 'Claude Code',
        command: 'claude',
        capabilities: buildDefaultAgentCliRuntimeCapabilities('claude', 'Claude Code', '2.1.144', {
          hooks: true,
          nativeMemory: true,
          nativeResume: true,
          structuredProgressEvents: true,
          subagents: true,
        }),
        installed: true,
        version: '2.1.144 (Claude Code)',
        authState: 'ready',
        executionSupport: 'manual_run',
        workload: 'idle',
        missingReason: null,
      },
    ], '2026-05-19T00:00:00.000Z');

    expect(status.runtimes[0]?.capabilities?.nativeCapabilities).toMatchObject({
      hooks: { availability: 'runtime_dependent' },
      memory: { availability: 'runtime_dependent' },
      structuredProgressEvents: { availability: 'available' },
      subagents: { availability: 'runtime_dependent' },
    });
    expect(status.runtimes[0]?.capabilities?.supportsNativeResume).toBe(true);
  });

  it('promotes probed Codex web search and resume signals without granting writes', () => {
    const capabilities = buildDefaultAgentCliRuntimeCapabilities('codex', 'Codex CLI', 'codex-cli 0.133.0', {
      nativeResume: true,
      structuredProgressEvents: true,
      webSearch: true,
    });

    expect(capabilities).toMatchObject({
      supportsNativeGoalMode: true,
      supportsNativeResume: true,
      supportsWorkspaceWrite: false,
      nativeCapabilities: {
        webSearch: {
          availability: 'runtime_dependent',
        },
        workspaceWrite: {
          availability: 'unsupported',
        },
      },
    });
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
        executionSupport: 'manual_run',
        workload: 'idle',
        missingReason: 'Login failed.',
      },
    ], '2026-05-19T00:00:00.000Z');

    expect(status).toMatchObject({
      catalogueCount: 2,
      detectedCount: 2,
      readyCount: 1,
      manualRunCount: 2,
      readyManualRunCount: 1,
      runningCount: 1,
      errorCount: 1,
      updatedAt: '2026-05-19T00:00:00.000Z',
    });
    expect(status.runtimes.find((runtime) => runtime.id === 'codex')?.capabilities).toMatchObject({
      executionKind: 'cli',
      nativeGoalMode: {
        availability: 'available',
        minimumVersion: '0.133.0',
      },
      supportsNativeGoalMode: true,
      supportsNativeClear: false,
      supportsPersistentSession: false,
      supportsStructuredProgressEvents: true,
      defaultResetStrategy: 'product_transcript_reset',
      supportsWorkspaceWrite: false,
      nativeCapabilities: expect.objectContaining({
        structuredProgressEvents: expect.objectContaining({ availability: 'available' }),
        workspaceRead: expect.objectContaining({ availability: 'available' }),
        workspaceWrite: expect.objectContaining({ availability: 'unsupported' }),
      }),
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
