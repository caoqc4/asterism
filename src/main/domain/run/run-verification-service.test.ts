import { describe, expect, it, vi } from 'vitest';

import { persistLightweightRunVerifications } from './run-verification-service.js';
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
