import { describe, expect, it } from 'vitest';

import type { AgentSandboxBackendProbe } from '../../../shared/agent-sandbox-provider.js';
import {
  evaluateSandboxedCodingProducerBackendConnectionGate,
  evaluateSandboxedCodingProducerBackendReadiness,
} from './sandboxed-coding-producer-backend.js';

const request = {
  commandPolicy: {
    allowedScripts: ['test', 'lint'],
    outputLimitBytes: 64_000,
    timeoutMs: 120_000,
  },
  executionPolicy: {
    network: 'disabled',
    noCredentialPassthrough: true,
    promotion: 'decision_required',
  },
  intent: {
    completionCriteria: ['Patch is reviewable'],
    instructions: 'Prepare a staged coding patch.',
    taskTitle: 'Prepare coding patch',
  },
  modelPolicy: {
    providerKind: 'openai-compatible',
    toolExposure: 'sandboxed_coding_producer',
  },
  runId: 'run_1',
  sourceId: 'sandbox_source_1',
  taskId: 'task_1',
  workspaceRoot: '/tmp/taskplane-workspace',
};

const availableProbe: AgentSandboxBackendProbe = {
  backendId: 'local-container',
  environmentPolicy: 'empty',
  isolation: 'container',
  kind: 'local_container',
  networkMode: 'disabled',
  status: 'available',
  supportsOutputLimits: true,
  supportsPatchArtifacts: true,
  supportsStagedWrites: true,
  supportsStructuredCommands: true,
  supportsTargetedCommands: true,
  supportsWorkspaceMount: true,
};

describe('evaluateSandboxedCodingProducerBackendReadiness', () => {
  it('accepts an available local-container probe with a valid producer request', () => {
    expect(evaluateSandboxedCodingProducerBackendReadiness({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: availableProbe,
      request,
    })).toEqual({
      ready: true,
      summary: 'Sandboxed coding producer backend ready / backend=local-container / kind=local_container / workspace=/tmp/taskplane-workspace',
    });
  });

  it('blocks when the sandbox feature flag is disabled', () => {
    const readiness = evaluateSandboxedCodingProducerBackendReadiness({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
      },
      probe: availableProbe,
      request,
    });

    expect(readiness).toMatchObject({
      ready: false,
      blockedReasons: expect.arrayContaining([
        'sandbox coding-agent feature flag is disabled',
      ]),
    });
  });

  it('blocks unavailable backend probes before backend connection', () => {
    expect(evaluateSandboxedCodingProducerBackendReadiness({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: {
        backendId: 'local-container',
        kind: 'local_container',
        reason: 'docker: command not found',
        status: 'unavailable',
      },
      request,
    })).toMatchObject({
      ready: false,
      blockedReasons: ['docker: command not found'],
    });
  });

  it('blocks host-process-like backend probes even when the request is valid', () => {
    expect(evaluateSandboxedCodingProducerBackendReadiness({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: {
        ...availableProbe,
        environmentPolicy: 'inherit_host',
        isolation: 'host_process',
      },
      request,
    })).toMatchObject({
      ready: false,
      blockedReasons: expect.arrayContaining([
        'sandbox backend must not run as a host process',
        'sandbox backend must not inherit the host environment',
      ]),
    });
  });

  it('blocks invalid producer requests before backend connection', () => {
    expect(evaluateSandboxedCodingProducerBackendReadiness({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: availableProbe,
      request: {
        ...request,
        modelPolicy: {
          providerKind: 'openai-compatible',
          toolExposure: 'normal_agent_prompt',
        },
      },
    })).toMatchObject({
      ready: false,
      blockedReasons: expect.arrayContaining([
        'Sandboxed coding producer requires sandbox-only tool exposure.',
      ]),
    });
  });

  it('opens a connection gate only after readiness, profile, and request validation pass', () => {
    expect(evaluateSandboxedCodingProducerBackendConnectionGate({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: availableProbe,
      request,
    })).toMatchObject({
      profile: {
        id: 'local-container',
        isolation: 'container',
        kind: 'local_container',
      },
      ready: true,
      request: {
        runId: 'run_1',
        sourceId: 'sandbox_source_1',
        workspaceRoot: '/tmp/taskplane-workspace',
      },
      summary: 'Sandboxed coding producer backend connection allowed / backend=local-container / kind=local_container / source=sandbox_source_1',
    });
  });

  it('keeps the connection gate closed when Docker/backend probing is unavailable', () => {
    expect(evaluateSandboxedCodingProducerBackendConnectionGate({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: {
        backendId: 'local-container',
        kind: 'local_container',
        reason: 'docker daemon unavailable',
        status: 'unavailable',
      },
      request,
    })).toEqual({
      blockedReasons: ['docker daemon unavailable'],
      readiness: {
        blockedReasons: ['docker daemon unavailable'],
        ready: false,
        summary: 'Sandboxed coding producer backend blocked: docker daemon unavailable',
      },
      ready: false,
      summary: 'Sandboxed coding producer backend connection blocked: docker daemon unavailable',
    });
  });
});
