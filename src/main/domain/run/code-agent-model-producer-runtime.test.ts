import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { RuntimeAiConfig } from '../../keychain/ai-config-service.js';
import { prepareCodeAgentModelProducerRuntime } from './code-agent-model-producer-runtime.js';
import type { NormalizedSandboxedCodingProducerRequest } from './sandboxed-coding-producer.js';

const runtimeConfig: RuntimeAiConfig = {
  apiKey: 'secret',
  featureFlags: {
    enableSandboxCodingAgent: true,
    enableScheduler: false,
  },
  model: 'google/gemini-2.5-flash',
  provider: 'fal-openrouter',
  workspaceRoot: '/tmp/taskplane-workspace',
};

const request: NormalizedSandboxedCodingProducerRequest = {
  commandPolicy: {
    allowedScripts: ['test'],
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
    instructions: 'Create a note.',
    taskTitle: 'Create note',
  },
  modelPolicy: {
    providerKind: 'fal-openrouter',
    toolExposure: 'sandboxed_coding_producer',
  },
  runId: 'run_1',
  sourceId: 'source_1',
  taskId: 'task_1',
  workspaceRoot: '/tmp/taskplane-workspace',
};

describe('prepareCodeAgentModelProducerRuntime', () => {
  it('blocks by default before resolving AI config', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn(),
    };

    const runtime = await prepareCodeAgentModelProducerRuntime({
      aiConfigService,
    });

    expect(runtime).toMatchObject({
      reason: 'Code Agent model producer runtime requires an explicit provider-call opt-in.',
      status: 'blocked',
    });
    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
  });

  it('blocks when sandbox coding is disabled', async () => {
    const runtime = await prepareCodeAgentModelProducerRuntime({
      aiConfigService: {
        resolveRuntimeConfig: vi.fn().mockResolvedValue({
          ...runtimeConfig,
          featureFlags: {
            enableSandboxCodingAgent: false,
            enableScheduler: false,
          },
        }),
      },
      allowProviderCalls: true,
    });

    expect(runtime).toMatchObject({
      reason: 'Code Agent model producer runtime requires enableSandboxCodingAgent=true.',
      status: 'blocked',
    });
  });

  it('returns a loop that calls the injected text generator only after explicit opt-in', async () => {
    const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-code-agent-runtime-'));
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({
      files: [
        {
          content: 'note\n',
          path: 'docs/runtime-note.md',
        },
      ],
      observations: ['Generated through runtime adapter.'],
      summary: 'Create runtime note.',
    }));
    const runtime = await prepareCodeAgentModelProducerRuntime({
      aiConfigService: {
        resolveRuntimeConfig: vi.fn().mockResolvedValue(runtimeConfig),
      },
      allowProviderCalls: true,
      generateText,
      sourceContext: {
        items: [
          {
            content: 'title: Runtime source\ncontent:\nPrefer a small patch.',
            id: 'source_context_1',
            title: 'Runtime source',
          },
        ],
        summary: 'Code Agent source context content collected 1 item(s).',
      },
      workspaceContext: {
        files: [{ content: 'old\n', path: 'docs/runtime-note.md' }],
        summary: 'Code Agent workspace context collected 1 file(s).',
      },
    });

    expect(runtime).toMatchObject({
      model: 'google/gemini-2.5-flash',
      provider: 'fal-openrouter',
      status: 'ready',
    });

    if (runtime.status !== 'ready') {
      return;
    }

    const result = await runtime.createLoop()({
      emit: vi.fn(),
      envelope: {} as never,
      handle: {} as never,
      request,
      sessionId: 'session_1',
      stagingRoot,
    });

    expect(generateText).toHaveBeenCalledWith(
      runtimeConfig,
      expect.stringContaining('--- source context: Runtime source (source_context_1)'),
    );
    await expect(fs.readFile(path.join(stagingRoot, 'docs/runtime-note.md'), 'utf8')).resolves.toBe('note\n');
    expect(result).toMatchObject({
      status: 'completed',
      summary: 'Create runtime note.',
    });
  });
});
