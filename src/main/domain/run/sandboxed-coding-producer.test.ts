import { describe, expect, it } from 'vitest';

import {
  buildSandboxedCodingProducerSource,
  mapSandboxedCodingProducerEventToRunStep,
  previewSandboxedCodingProducerPatchReview,
  validateSandboxedCodingProducerRequest,
} from './sandboxed-coding-producer.js';

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

  it('builds a validated sandbox patch draft source from a producer request and staged patch', () => {
    const result = buildSandboxedCodingProducerSource({
      evidence: {
        commandSummaries: ['lint: passed'],
        modelSummary: 'Changed notes workflow.',
        observations: ['Read src/notes.md'],
      },
      patchDraft: {
        diff: '--- a/src/notes.md\n+++ b/src/notes.md',
        files: ['src/notes.md'],
        summary: 'Update notes workflow',
      },
      request: validRequest,
    });

    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.source).toMatchObject({
        runId: 'run_1',
        sourceId: 'sandbox_source_1',
        sourceKind: 'sandbox_session',
        taskId: 'task_1',
        workspaceRoot: '/tmp/taskplane-workspace',
      });
      expect(result.source.requestedScripts).toEqual(['lint', 'test']);
      expect(result.summary).toContain('Sandboxed coding producer source ready');
    }
  });

  it('blocks producer source creation when the staged patch draft is empty', () => {
    const result = buildSandboxedCodingProducerSource({
      patchDraft: {
        diff: '',
        files: [],
        summary: '',
      },
      request: validRequest,
    });

    expect(result).toMatchObject({
      valid: false,
      blockedReasons: expect.arrayContaining([
        'Sandbox patch draft source requires a patch summary.',
        'Sandbox patch draft source requires a diff preview.',
        'Sandbox patch draft source requires at least one changed file.',
      ]),
    });
  });

  it('previews a ready sandbox patch review plan from producer output without execution dependencies', () => {
    const plan = previewSandboxedCodingProducerPatchReview({
      decisionTitle: '确认提升 producer sandbox patch',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      patchDraft: {
        diff: '--- a/src/notes.md\n+++ b/src/notes.md',
        files: ['src/notes.md'],
        summary: 'Update notes workflow',
      },
      request: validRequest,
    });

    expect(plan.status).toBe('ready');

    if (plan.status === 'ready') {
      expect(plan.decisionTitle).toBe('确认提升 producer sandbox patch');
      expect(plan.requestBundle.audit.patchDraftSource).toEqual({
        sourceId: 'sandbox_source_1',
        sourceKind: 'sandbox_session',
      });
      expect(plan.requestBundle.audit.idempotencyKey).toBe(
        'sandbox-patch-review:sandbox_session:sandbox_source_1:run_1:task_1:lint,test',
      );
    }
  });

  it('keeps producer patch review blocked while the sandbox feature flag is disabled', () => {
    const plan = previewSandboxedCodingProducerPatchReview({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
      },
      patchDraft: {
        diff: '--- a/src/notes.md\n+++ b/src/notes.md',
        files: ['src/notes.md'],
        summary: 'Update notes workflow',
      },
      request: validRequest,
    });

    expect(plan).toMatchObject({
      status: 'blocked',
      reason: expect.stringContaining('feature flag is off'),
    });
  });

  it('maps producer lifecycle, tool, check, and source events into compact run steps', () => {
    expect(mapSandboxedCodingProducerEventToRunStep({
      runId: 'run_1',
      sessionId: 'producer_session_1',
      sourceId: 'sandbox_source_1',
      status: 'started',
      summary: 'Preparing sandboxed coding producer.',
      type: 'sandbox_producer.started',
    })).toEqual({
      runId: 'run_1',
      kind: 'plan',
      status: 'running',
      title: 'Sandboxed coding producer started',
      input: 'session=producer_session_1\nsource=sandbox_source_1',
      output: 'Preparing sandboxed coding producer.',
    });

    expect(mapSandboxedCodingProducerEventToRunStep({
      inputSummary: 'path=src/notes.md',
      runId: 'run_1',
      sessionId: 'producer_session_1',
      sourceId: 'sandbox_source_1',
      tool: 'workspace.read_file',
      type: 'sandbox_producer.tool_requested',
    })).toMatchObject({
      kind: 'tool_call',
      status: 'running',
      title: 'Sandbox producer tool requested: workspace.read_file',
    });

    expect(mapSandboxedCodingProducerEventToRunStep({
      outputSummary: 'lint: passed',
      runId: 'run_1',
      script: 'lint',
      sessionId: 'producer_session_1',
      sourceId: 'sandbox_source_1',
      status: 'passed',
      type: 'sandbox_producer.check_completed',
    })).toMatchObject({
      kind: 'tool_result',
      status: 'completed',
      title: 'Sandbox producer check passed: lint',
      output: 'lint: passed',
    });

    expect(mapSandboxedCodingProducerEventToRunStep({
      files: ['src/notes.md'],
      runId: 'run_1',
      sessionId: 'producer_session_1',
      sourceId: 'sandbox_source_1',
      summary: '1 file changed',
      type: 'sandbox_producer.source_ready',
    })).toMatchObject({
      kind: 'artifact',
      status: 'completed',
      title: 'Sandbox producer source ready',
      input: 'session=producer_session_1\nsource=sandbox_source_1\nfiles=src/notes.md',
    });
  });

  it('maps terminal producer events into blocked, failed, and paused run steps', () => {
    expect(mapSandboxedCodingProducerEventToRunStep({
      reason: 'No sandbox backend is ready.',
      runId: 'run_1',
      sessionId: 'producer_session_1',
      sourceId: 'sandbox_source_1',
      type: 'sandbox_producer.blocked',
    })).toMatchObject({
      kind: 'final',
      status: 'completed',
      title: 'Sandbox producer blocked',
      output: 'No sandbox backend is ready.',
    });

    expect(mapSandboxedCodingProducerEventToRunStep({
      reason: 'Producer failed.',
      runId: 'run_1',
      sessionId: 'producer_session_1',
      sourceId: 'sandbox_source_1',
      type: 'sandbox_producer.failed',
    })).toMatchObject({
      kind: 'final',
      status: 'failed',
      title: 'Sandbox producer failed',
      error: 'Producer failed.',
    });

    expect(mapSandboxedCodingProducerEventToRunStep({
      reason: 'Waiting for review.',
      runId: 'run_1',
      sessionId: 'producer_session_1',
      sourceId: 'sandbox_source_1',
      type: 'sandbox_producer.paused',
    })).toMatchObject({
      kind: 'checkpoint',
      status: 'pending',
      title: 'Sandbox producer paused',
    });
  });
});
