import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildCodeAgentModelProducerPrompt,
  createCodeAgentModelProducerLoop,
} from './code-agent-model-producer-loop.js';
import type { NormalizedSandboxedCodingProducerRequest } from './sandboxed-coding-producer.js';

const request: NormalizedSandboxedCodingProducerRequest = {
  commandPolicy: {
    allowedScripts: ['lint', 'test'],
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
    instructions: 'Update the docs note.',
    taskTitle: 'Docs update',
  },
  modelPolicy: {
    providerKind: 'openai-compatible',
    toolExposure: 'sandboxed_coding_producer',
  },
  runId: 'run_1',
  sourceId: 'source_1',
  taskId: 'task_1',
  workspaceRoot: '/tmp/taskplane-workspace',
};

describe('buildCodeAgentModelProducerPrompt', () => {
  it('describes the strict staged-file JSON contract and sandbox policy', () => {
    const prompt = buildCodeAgentModelProducerPrompt(request);

    expect(prompt).toContain('Return exactly one strict JSON object.');
    expect(prompt).toContain('"files"');
    expect(prompt).toContain('Do not use absolute paths');
    expect(prompt).toContain('Allowed checks after staging: lint, test');
    expect(prompt).toContain('Network policy: disabled');
    expect(prompt).toContain('Promotion policy: Decision review is required');
    expect(prompt).toContain('No retained Taskplane runtime context manifest was provided for this run.');
    expect(prompt).toContain('No workspace file context was provided for this run.');
    expect(prompt).toContain('No source-context content was included for this run.');
  });

  it('includes retained runtime context as read-only Taskplane execution memory', () => {
    const prompt = buildCodeAgentModelProducerPrompt(request, {
      retainedContextManifest: [
        'RuntimeContextManifest / surface=task / items=2 / task=Docs update',
        'memory_retrieval:total=2:included=2:caution=0:excluded=0:top=task_record/task_record_received_handoff/include/current_task_scope',
        'task_file:Task Records/2026-05-20-received-handoff.md:Task Records/2026-05-20-received-handoff.md:content=no',
      ].join('\n'),
    });

    expect(prompt).toContain('Taskplane retained runtime context manifest:');
    expect(prompt).toContain('task_record/task_record_received_handoff/include/current_task_scope');
    expect(prompt).toContain('End Taskplane retained runtime context manifest.');
  });

  it('includes explicitly selected workspace context as read-only evidence', () => {
    const prompt = buildCodeAgentModelProducerPrompt(request, {
      workspaceContext: {
        files: [
          {
            content: 'existing notes\n',
            path: 'docs/notes.md',
          },
        ],
        summary: 'Code Agent workspace context collected 1 file(s).',
      },
    });

    expect(prompt).toContain('Treat workspace context as read-only evidence.');
    expect(prompt).toContain('--- file: docs/notes.md');
    expect(prompt).toContain('existing notes');
    expect(prompt).toContain('--- end file: docs/notes.md');
  });

  it('includes explicitly opted-in source context separately from workspace files', () => {
    const prompt = buildCodeAgentModelProducerPrompt(request, {
      sourceContext: {
        items: [
          {
            content: 'title: Reference doc\ncontent:\nUse the existing panel contract.',
            id: 'source_context_1',
            title: 'Reference doc',
          },
        ],
        summary: 'Code Agent source context content collected 1 item(s).',
      },
    });

    expect(prompt).toContain('Treat Taskplane source context as read-only evidence only when explicitly included.');
    expect(prompt).toContain('Taskplane source context:');
    expect(prompt).toContain('--- source context: Reference doc (source_context_1)');
    expect(prompt).toContain('Use the existing panel contract.');
    expect(prompt).toContain('--- end source context: source_context_1');
  });
});

describe('createCodeAgentModelProducerLoop', () => {
  it('writes a generated staged-file plan and emits producer tool events', async () => {
    const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-code-agent-loop-'));
    const generatePlanText = vi.fn().mockResolvedValue(JSON.stringify({
      files: [
        {
          content: '# Notes\n',
          path: 'docs/notes.md',
        },
      ],
      observations: ['Generated docs notes.'],
      summary: 'Update docs notes.',
    }));
    const emit = vi.fn();
    const loop = createCodeAgentModelProducerLoop({
      generatePlanText,
      workspaceContext: {
        files: [{ content: 'old\n', path: 'docs/notes.md' }],
        summary: 'Code Agent workspace context collected 1 file(s).',
      },
    });

    const result = await loop({
      emit,
      envelope: {} as never,
      handle: {} as never,
      request,
      sessionId: 'session_1',
      stagingRoot,
    });

    expect(generatePlanText).toHaveBeenCalledWith({
      prompt: expect.stringContaining('--- file: docs/notes.md'),
      request,
    });
    await expect(fs.readFile(path.join(stagingRoot, 'docs/notes.md'), 'utf8')).resolves.toBe('# Notes\n');
    expect(result).toMatchObject({
      evidence: {
        modelSummary: 'Update docs notes.',
        observations: ['Generated docs notes.'],
      },
      status: 'completed',
      summary: 'Update docs notes.',
    });
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'staging.write_file',
      type: 'sandbox_producer.tool_requested',
    }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'staging.write_file',
      type: 'sandbox_producer.tool_completed',
    }));
  });

  it('blocks malformed generated output before writing staged files', async () => {
    const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-code-agent-loop-'));
    const emit = vi.fn();
    const loop = createCodeAgentModelProducerLoop({
      generatePlanText: vi.fn().mockResolvedValue('not json'),
    });

    const result = await loop({
      emit,
      envelope: {} as never,
      handle: {} as never,
      request,
      sessionId: 'session_1',
      stagingRoot,
    });

    expect(result).toMatchObject({
      producerSource: 'model_backed',
      reason: expect.stringContaining('strict JSON'),
      status: 'blocked',
    });
    await expect(fs.readdir(stagingRoot)).resolves.toEqual([]);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      reason: expect.stringContaining('strict JSON'),
      tool: 'staging.write_file',
      type: 'sandbox_producer.tool_blocked',
    }));
  });
});
