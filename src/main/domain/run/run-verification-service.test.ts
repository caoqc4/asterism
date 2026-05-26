import { describe, expect, it, vi } from 'vitest';

import {
  persistLightweightRunVerifications,
  persistTerminalRunVerifications,
} from './run-verification-service.js';
import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { RunDetailRecord, RunStepRecord } from '../../../shared/types/run.js';

const now = '2026-05-25T00:00:00.000Z';

describe('run verification service', () => {
  it('requires promotion evidence for native workspace write candidates', async () => {
    const writer = { upsert: vi.fn().mockResolvedValue({}) };

    await persistLightweightRunVerifications(buildRunDetail({
      steps: [buildStep({
        title: 'Codex CLI 工作区写入候选：apply_patch',
        output: 'capability=workspace_write\napply_patch changed src/app.ts',
      })],
    }), writer, { includeRunLevel: false });

    expect(writer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      label: '写入候选需复核',
      targetId: 'run_step_1',
      targetType: 'step',
      tone: 'warn',
    }));
  });

  it('passes workspace write candidates when patch promotion evidence already exists', async () => {
    const writer = { upsert: vi.fn().mockResolvedValue({}) };

    await persistLightweightRunVerifications(buildRunDetail({
      artifacts: [buildArtifact({ kind: 'patch' })],
      steps: [buildStep({
        title: 'Codex CLI 工作区写入候选：apply_patch',
        output: 'capability=workspace_write\napply_patch changed src/app.ts',
      })],
    }), writer, { includeRunLevel: false });

    expect(writer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      label: '执行后检查通过',
      targetId: 'run_step_1',
      targetType: 'step',
      tone: 'pass',
    }));
  });

  it('does not treat ordinary run output artifacts as workspace write promotion evidence', async () => {
    const writer = { upsert: vi.fn().mockResolvedValue({}) };

    await persistLightweightRunVerifications(buildRunDetail({
      artifacts: [buildArtifact({ kind: 'run_output' })],
      steps: [buildStep({
        title: 'Codex CLI 工作区写入候选：apply_patch',
        output: 'capability=workspace_write\napply_patch changed src/app.ts',
      })],
    }), writer, { includeRunLevel: false });

    expect(writer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      label: '写入候选需复核',
      targetId: 'run_step_1',
      targetType: 'step',
      tone: 'warn',
    }));
  });

  it('accepts ready task-file Write Intent as workspace write promotion evidence', async () => {
    const writer = { upsert: vi.fn().mockResolvedValue({}) };

    await persistLightweightRunVerifications(buildRunDetail({
      output: [
        'I prepared a reviewable task file proposal.',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [{
            type: 'task_file.propose',
            path: 'implementation-notes.md',
            content: 'Reviewable notes for the workspace write candidate.',
            summary: 'Save notes before applying workspace changes.',
          }],
        }),
        '```',
      ].join('\n'),
      steps: [buildStep({
        title: 'Codex CLI 工作区写入候选：apply_patch',
        output: 'capability=workspace_write\napply_patch changed src/app.ts',
      })],
    }), writer, { includeRunLevel: false });

    expect(writer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      label: '执行后检查通过',
      targetId: 'run_step_1',
      targetType: 'step',
      tone: 'pass',
    }));
  });

  it('does not treat note artifact Write Intent as workspace write promotion evidence', async () => {
    const writer = { upsert: vi.fn().mockResolvedValue({}) };

    await persistLightweightRunVerifications(buildRunDetail({
      output: [
        'I prepared an ordinary note artifact proposal.',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [{
            type: 'artifact.propose',
            title: 'notes.md',
            kind: 'note',
            content: '# Notes',
            summary: 'Save notes.',
          }],
        }),
        '```',
      ].join('\n'),
      steps: [buildStep({
        title: 'Codex CLI 工作区写入候选：apply_patch',
        output: 'capability=workspace_write\napply_patch changed src/app.ts',
      })],
    }), writer, { includeRunLevel: false });

    expect(writer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      label: '写入候选需复核',
      targetId: 'run_step_1',
      targetType: 'step',
      tone: 'warn',
    }));
  });

  it('accepts ready patch artifact Write Intent as workspace write promotion evidence', async () => {
    const writer = { upsert: vi.fn().mockResolvedValue({}) };

    await persistLightweightRunVerifications(buildRunDetail({
      output: [
        'I prepared a reviewable patch artifact proposal.',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [{
            type: 'artifact.propose',
            title: 'changes.patch',
            kind: 'patch',
            content: [
              '--- a/src/app.ts',
              '+++ b/src/app.ts',
              '@@ -1 +1 @@',
              '-old',
              '+new',
            ].join('\n'),
            summary: 'Reviewable patch evidence.',
          }],
        }),
        '```',
      ].join('\n'),
      steps: [buildStep({
        title: 'Codex CLI 工作区写入候选：apply_patch',
        output: 'capability=workspace_write\napply_patch changed src/app.ts',
      })],
    }), writer, { includeRunLevel: false });

    expect(writer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      label: '执行后检查通过',
      targetId: 'run_step_1',
      targetType: 'step',
      tone: 'pass',
    }));
  });

  it('accepts patch promotion checkpoints as workspace write promotion evidence', async () => {
    const writer = { upsert: vi.fn().mockResolvedValue({}) };

    await persistLightweightRunVerifications(buildRunDetail({
      checkpoints: [{
        id: 'checkpoint_1',
        kind: 'patch_promotion',
        payload: null,
        resolvedAt: null,
        runId: 'run_1',
        status: 'open',
        stepId: null,
        createdAt: now,
      }],
      steps: [buildStep({
        title: 'Codex CLI 工作区写入候选：apply_patch',
        output: 'capability=workspace_write\napply_patch changed src/app.ts',
      })],
    }), writer, { includeRunLevel: false });

    expect(writer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      label: '执行后检查通过',
      targetId: 'run_step_1',
      targetType: 'step',
      tone: 'pass',
    }));
  });

  it('passes terminal workspace write verification when optional run artifacts are supplied', async () => {
    const writer = { upsert: vi.fn().mockResolvedValue({}) };
    const step = buildStep({
      title: 'Codex CLI 工作区写入候选：apply_patch',
      output: 'capability=workspace_write\napply_patch changed src/app.ts',
    });

    await persistTerminalRunVerifications({
      artifacts: [buildArtifact({ kind: 'patch' })],
      run: buildRunDetail(),
      runStepRepository: {
        listForRun: vi.fn().mockResolvedValue([step]),
      },
      runVerificationRepository: writer,
    });

    expect(writer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      label: '执行后检查通过',
      targetId: 'run_step_1',
      targetType: 'step',
      tone: 'pass',
    }));
  });
});

function buildRunDetail(partial: Partial<RunDetailRecord> = {}): RunDetailRecord {
  return {
    id: partial.id ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    type: partial.type ?? 'agent',
    status: partial.status ?? 'completed',
    instructions: partial.instructions ?? null,
    output: partial.output ?? 'done',
    outputSource: partial.outputSource ?? 'ai',
    failureReason: partial.failureReason ?? null,
    artifacts: partial.artifacts ?? [],
    checkpoints: partial.checkpoints ?? [],
    steps: partial.steps ?? [],
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildStep(partial: Partial<RunStepRecord> = {}): RunStepRecord {
  return {
    id: partial.id ?? 'run_step_1',
    runId: partial.runId ?? 'run_1',
    index: partial.index ?? 1,
    kind: partial.kind ?? 'tool_call',
    status: partial.status ?? 'completed',
    title: partial.title ?? 'Codex CLI 工作区读取：rg',
    input: partial.input ?? null,
    output: partial.output ?? 'capability=workspace_read\nrg TODO',
    error: partial.error ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildArtifact(partial: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: partial.id ?? 'artifact_1',
    taskId: partial.taskId ?? 'task_1',
    sourceType: partial.sourceType ?? 'run',
    sourceId: partial.sourceId ?? 'run_1',
    kind: partial.kind ?? 'patch',
    title: partial.title ?? 'Patch review',
    content: partial.content ?? 'diff --git a/src/app.ts b/src/app.ts',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}
