import { describe, expect, it } from 'vitest';

import type { AgentSandboxBackendProbe } from '../../../shared/agent-sandbox-provider.js';
import {
  buildSandboxedCodingProducerBackendBlockedPreviewResult,
  buildSandboxedCodingProducerBackendConnectionPlan,
  buildSandboxedCodingProducerBackendLaunchEnvelope,
  evaluateSandboxedCodingProducerBackendConnectionGate,
  evaluateSandboxedCodingProducerBackendReadiness,
  validateSandboxedCodingProducerBackendLaunchEnvelope,
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

  it('builds a ready connection plan from an open gate without starting a backend runner', () => {
    const gate = evaluateSandboxedCodingProducerBackendConnectionGate({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: availableProbe,
      request,
    });

    expect(buildSandboxedCodingProducerBackendConnectionPlan(gate)).toEqual({
      backendId: 'local-container',
      backendKind: 'local_container',
      commandScripts: ['lint', 'test'],
      gateSummary: 'Sandboxed coding producer backend connection allowed / backend=local-container / kind=local_container / source=sandbox_source_1',
      network: 'disabled',
      noCredentialPassthrough: true,
      promotion: 'decision_required',
      requiredRunner: 'local_container_sandboxed_coding_producer',
      sourceId: 'sandbox_source_1',
      status: 'ready',
      summary: 'Sandboxed coding producer backend connection plan ready / backend=local-container / runner=local_container_sandboxed_coding_producer / source=sandbox_source_1 / checks=lint,test',
      workspaceRoot: '/tmp/taskplane-workspace',
    });
  });

  it('builds a blocked connection plan from a closed gate', () => {
    const gate = evaluateSandboxedCodingProducerBackendConnectionGate({
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
    });

    expect(buildSandboxedCodingProducerBackendConnectionPlan(gate)).toEqual({
      blockedReasons: ['docker daemon unavailable'],
      gateSummary: 'Sandboxed coding producer backend connection blocked: docker daemon unavailable',
      status: 'blocked',
      summary: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
    });
  });

  it('maps a blocked connection plan to a producer diagnostic preview result', () => {
    const gate = evaluateSandboxedCodingProducerBackendConnectionGate({
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
    });
    const plan = buildSandboxedCodingProducerBackendConnectionPlan(gate);

    expect(plan.status).toBe('blocked');
    if (plan.status !== 'blocked') {
      throw new Error('Expected a blocked plan');
    }

    const result = buildSandboxedCodingProducerBackendBlockedPreviewResult({
      commandScripts: request.commandPolicy.allowedScripts,
      network: request.executionPolicy.network,
      plan,
      providerKind: request.modelPolicy.providerKind,
      runId: request.runId,
      sourceId: request.sourceId,
      workspaceRoot: request.workspaceRoot,
    });

    expect(result).toMatchObject({
      events: [],
      plan: null,
      reason: 'docker daemon unavailable',
      sessionSummary: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
      status: 'blocked',
      steps: [
        {
          kind: 'final',
          output: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
          runId: 'run_1',
          status: 'completed',
          title: 'Sandbox producer backend blocked',
        },
      ],
    });
    expect(result.sessionMetadata).toContain('executor=sandboxed_coding_producer');
    expect(result.sessionMetadata).toContain('producerStatus=blocked');
    expect(result.sessionMetadata).toContain('blockedReasons=docker daemon unavailable');
    expect(result.sessionMetadata).toContain('workspace=/tmp/taskplane-workspace');
    expect(result.steps[0].input).toContain('gate=Sandboxed coding producer backend connection blocked: docker daemon unavailable');
  });

  it('builds and validates a ready backend launch envelope without starting a runner', () => {
    const gate = evaluateSandboxedCodingProducerBackendConnectionGate({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: availableProbe,
      request,
    });

    const envelope = buildSandboxedCodingProducerBackendLaunchEnvelope(gate);

    expect(envelope).toMatchObject({
      backendId: 'local-container',
      backendKind: 'local_container',
      commandPolicy: {
        allowedScripts: ['lint', 'test'],
      },
      executionPolicy: {
        network: 'disabled',
        noCredentialPassthrough: true,
        promotion: 'decision_required',
      },
      invariants: {
        noCredentialPassthrough: true,
        noHostEnvironment: true,
        noHostProcess: true,
        promotion: 'decision_required',
        stagedWritesOnly: true,
        workspaceReadOnly: true,
      },
      requiredRunner: 'local_container_sandboxed_coding_producer',
      runId: 'run_1',
      sessionId: 'sandboxed_producer:sandbox_source_1',
      sourceId: 'sandbox_source_1',
      status: 'ready',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    });
    expect(validateSandboxedCodingProducerBackendLaunchEnvelope(envelope)).toMatchObject({
      valid: true,
      summary: 'Sandboxed coding producer backend launch envelope ready / backend=local-container / runner=local_container_sandboxed_coding_producer / run=run_1 / source=sandbox_source_1',
    });
  });

  it('keeps launch envelopes blocked when the connection gate is closed', () => {
    const gate = evaluateSandboxedCodingProducerBackendConnectionGate({
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
    });

    const envelope = buildSandboxedCodingProducerBackendLaunchEnvelope(gate);

    expect(envelope).toEqual({
      blockedReasons: ['docker daemon unavailable'],
      gateSummary: 'Sandboxed coding producer backend connection blocked: docker daemon unavailable',
      status: 'blocked',
      summary: 'Sandboxed coding producer backend launch blocked: docker daemon unavailable',
    });
    expect(validateSandboxedCodingProducerBackendLaunchEnvelope(envelope)).toEqual({
      blockedReasons: ['docker daemon unavailable'],
      summary: 'Sandboxed coding producer backend launch blocked: docker daemon unavailable',
      valid: false,
    });
  });

  it('rejects launch envelopes that weaken sandbox invariants', () => {
    const gate = evaluateSandboxedCodingProducerBackendConnectionGate({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: availableProbe,
      request,
    });
    const envelope = buildSandboxedCodingProducerBackendLaunchEnvelope(gate);
    if (envelope.status !== 'ready') {
      throw new Error('Expected a ready launch envelope');
    }

    const invalidEnvelope = {
      ...envelope,
      executionPolicy: {
        ...envelope.executionPolicy,
        network: 'allowlisted' as const,
      },
      invariants: {
        ...envelope.invariants,
        noHostEnvironment: false as true,
      },
      requiredRunner: 'remote_sandboxed_coding_producer' as const,
    };

    expect(validateSandboxedCodingProducerBackendLaunchEnvelope(invalidEnvelope)).toMatchObject({
      valid: false,
      blockedReasons: expect.arrayContaining([
        'Local container backend launch envelope requires the local container producer runner.',
        'Sandboxed coding producer backend launch envelope must start with disabled network.',
        'Sandboxed coding producer backend launch envelope must preserve sandbox isolation invariants.',
      ]),
    });
  });
});
