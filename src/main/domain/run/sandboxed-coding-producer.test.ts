import { describe, expect, it } from 'vitest';

import { validateSandboxedCodingProducerRequest } from './sandboxed-coding-producer.js';

const validRequest = {
  commandPolicy: {
    allowedScripts: ['test', 'lint', 'test'],
    outputLimitBytes: 64_000,
    timeoutMs: 120_000,
  },
  executionPolicy: {
    network: 'disabled',
    noCredentialPassthrough: true,
    promotion: 'decision_required',
  },
  intent: {
    completionCriteria: ['Tests pass', 'Patch is reviewable'],
    instructions: 'Implement the requested notes change.',
    taskTitle: 'Update notes workflow',
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

describe('validateSandboxedCodingProducerRequest', () => {
  it('accepts and normalizes a bounded producer request', () => {
    const validation = validateSandboxedCodingProducerRequest(validRequest);

    expect(validation.valid).toBe(true);

    if (validation.valid) {
      expect(validation.request.commandPolicy.allowedScripts).toEqual(['lint', 'test']);
      expect(validation.request.intent.completionCriteria).toEqual([
        'Tests pass',
        'Patch is reviewable',
      ]);
      expect(validation.summary).toContain('source=sandbox_session:sandbox_source_1');
      expect(validation.summary).toContain('promotion=decision_required');
    }
  });

  it('rejects missing identity and intent fields', () => {
    const validation = validateSandboxedCodingProducerRequest({
      ...validRequest,
      intent: {
        completionCriteria: [],
        instructions: ' ',
        taskTitle: ' ',
      },
      runId: '',
      sourceId: '',
      taskId: '',
      workspaceRoot: '',
    });

    expect(validation.valid).toBe(false);

    if (!validation.valid) {
      expect(validation.blockedReasons).toEqual(expect.arrayContaining([
        'Sandboxed coding producer requires a run id.',
        'Sandboxed coding producer requires a task id.',
        'Sandboxed coding producer requires a source id.',
        'Sandboxed coding producer requires a workspace root.',
        'Sandboxed coding producer requires a task title.',
        'Sandboxed coding producer requires instructions.',
      ]));
    }
  });

  it('rejects non-sandbox tool exposure', () => {
    const validation = validateSandboxedCodingProducerRequest({
      ...validRequest,
      modelPolicy: {
        providerKind: 'openai-compatible',
        toolExposure: 'normal_agent_prompt',
      },
    });

    expect(validation.valid).toBe(false);

    if (!validation.valid) {
      expect(validation.blockedReasons).toContain(
        'Sandboxed coding producer requires sandbox-only tool exposure.',
      );
    }
  });

  it('rejects non-allowlisted scripts and unbounded command policy', () => {
    const validation = validateSandboxedCodingProducerRequest({
      ...validRequest,
      commandPolicy: {
        allowedScripts: ['test', 'build'],
        outputLimitBytes: 10_000_000,
        timeoutMs: 0,
      },
    });

    expect(validation.valid).toBe(false);

    if (!validation.valid) {
      expect(validation.blockedReasons).toEqual(expect.arrayContaining([
        'Sandboxed coding producer check scripts must be allowlisted.',
        'Sandboxed coding producer requires a bounded timeout.',
        'Sandboxed coding producer requires a bounded output limit.',
      ]));
    }
  });

  it('rejects credential passthrough and non-Decision promotion', () => {
    const validation = validateSandboxedCodingProducerRequest({
      ...validRequest,
      executionPolicy: {
        network: 'host',
        noCredentialPassthrough: false,
        promotion: 'auto_apply',
      },
    });

    expect(validation.valid).toBe(false);

    if (!validation.valid) {
      expect(validation.blockedReasons).toEqual(expect.arrayContaining([
        'Sandboxed coding producer requires bounded network mode.',
        'Sandboxed coding producer forbids credential passthrough.',
        'Sandboxed coding producer requires Decision promotion.',
      ]));
    }
  });
});
