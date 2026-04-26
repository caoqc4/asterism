import { describe, expect, it, vi } from 'vitest';

import { LocalContainerSandboxedCodingProducerExecutionService } from './local-container-sandboxed-coding-producer-execution-service.js';

const featureFlags = {
  enableScheduler: false,
  enableSandboxCodingAgent: true,
};

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
    instructions: 'Prepare a staged notes patch.',
    taskTitle: 'Prepare notes patch',
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

describe('LocalContainerSandboxedCodingProducerExecutionService', () => {
  it('blocks before Docker probing without explicit operator confirmation', async () => {
    const previewService = {
      run: vi.fn(),
    };
    const probeRunner = vi.fn();
    const service = new LocalContainerSandboxedCodingProducerExecutionService(previewService as never);

    await expect(service.run({
      commandRunner: vi.fn(),
      featureFlags,
      operatorConfirmed: false,
      patchSummary: 'No patch',
      probeRunner,
      producerLoop: vi.fn(),
      request,
    })).resolves.toEqual({
      reason: 'Local container producer execution requires explicit operator confirmation.',
      status: 'blocked',
      summary: 'Local container producer execution blocked before Docker probe.',
    });
    expect(probeRunner).not.toHaveBeenCalled();
    expect(previewService.run).not.toHaveBeenCalled();
  });

  it('probes Docker and passes the resulting backend probe into the preview service after confirmation', async () => {
    const previewService = {
      run: vi.fn().mockResolvedValue({
        status: 'previewed',
        summary: 'preview completed',
      }),
    };
    const commandRunner = vi.fn();
    const producerLoop = vi.fn();
    const probeRunner = vi.fn().mockResolvedValue({
      stderr: '',
      stdout: '29.3.1',
    });
    const service = new LocalContainerSandboxedCodingProducerExecutionService(previewService as never);

    await expect(service.run({
      commandRunner,
      featureFlags,
      operatorConfirmed: true,
      patchSummary: 'Update notes',
      probeRunner,
      producerLoop,
      request,
    })).resolves.toEqual({
      preview: {
        status: 'previewed',
        summary: 'preview completed',
      },
      status: 'completed',
      summary: 'preview completed',
    });
    expect(probeRunner).toHaveBeenCalledWith({
      args: ['version', '--format', '{{.Server.Version}}'],
      command: 'docker',
      timeoutMs: 2_000,
    });
    expect(previewService.run).toHaveBeenCalledWith(expect.objectContaining({
      commandRunner,
      featureFlags,
      patchSummary: 'Update notes',
      probe: expect.objectContaining({
        backendId: 'local-container',
        kind: 'local_container',
        status: 'available',
      }),
      producerLoop,
      request,
    }));
  });

  it('returns a completed orchestration result even when preview service reports blocked diagnostics', async () => {
    const previewService = {
      run: vi.fn().mockResolvedValue({
        status: 'blocked',
        summary: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
      }),
    };
    const probeRunner = vi.fn().mockRejectedValue(new Error('docker daemon unavailable'));
    const service = new LocalContainerSandboxedCodingProducerExecutionService(previewService as never);

    await expect(service.run({
      commandRunner: vi.fn(),
      featureFlags,
      operatorConfirmed: true,
      patchSummary: 'No patch',
      probeRunner,
      producerLoop: vi.fn(),
      request,
    })).resolves.toEqual({
      preview: {
        status: 'blocked',
        summary: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
      },
      status: 'completed',
      summary: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
    });
    expect(previewService.run).toHaveBeenCalledWith(expect.objectContaining({
      probe: expect.objectContaining({
        reason: 'docker daemon unavailable',
        status: 'unavailable',
      }),
    }));
  });
});
