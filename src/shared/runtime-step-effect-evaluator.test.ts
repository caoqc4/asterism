import { describe, expect, it } from 'vitest';

import { evaluateRuntimeStepEffect } from './runtime-step-effect-evaluator.js';
import type { RunStepRecord } from './types/run.js';

const now = '2026-01-01T00:00:00.000Z';

function buildStep(partial: Partial<RunStepRecord> = {}): RunStepRecord {
  return {
    id: partial.id ?? 'run_step_1',
    runId: partial.runId ?? 'run_1',
    index: partial.index ?? 1,
    kind: partial.kind ?? 'model',
    status: partial.status ?? 'completed',
    title: partial.title ?? '模型执行',
    input: partial.input ?? null,
    output: partial.output ?? null,
    error: partial.error ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe('runtime step effect evaluator', () => {
  it('detects durable artifact-like changes from step kind', () => {
    expect(evaluateRuntimeStepEffect(buildStep({
      kind: 'artifact',
      title: '保存产物',
      output: 'report.md',
    }))).toMatchObject({
      producedDurableChange: true,
      hasRecoveryNote: true,
    });
  });

  it('detects durable changes from step text', () => {
    expect(evaluateRuntimeStepEffect(buildStep({
      kind: 'tool_result',
      title: 'write task file',
      output: 'Task.md updated',
    }))).toMatchObject({
      producedDurableChange: true,
      hasRecoveryNote: true,
    });
  });

  it('requires promotion evidence for native workspace write candidates', () => {
    expect(evaluateRuntimeStepEffect(buildStep({
      kind: 'tool_call',
      title: 'Codex CLI 工作区写入候选：apply_patch',
      output: [
        'capability=workspace_write',
        'provider_event=item.completed',
        'apply_patch changed src/app.ts',
      ].join('\n'),
    }))).toMatchObject({
      producedDurableChange: true,
      hasRecoveryNote: true,
      requiresPromotionEvidence: true,
      reasons: expect.arrayContaining(['workspace write candidate requires promotion evidence']),
    });
  });

  it('flags durable changes without a recovery note', () => {
    expect(evaluateRuntimeStepEffect(buildStep({
      kind: 'decision',
      title: 'created checkpoint',
      output: null,
      error: null,
    }))).toMatchObject({
      producedDurableChange: true,
      hasRecoveryNote: false,
    });
  });

  it('leaves ordinary model steps non-durable', () => {
    expect(evaluateRuntimeStepEffect(buildStep({
      kind: 'model',
      title: '模型执行',
      output: '分析完成',
    }))).toMatchObject({
      producedDurableChange: false,
      hasRecoveryNote: true,
    });
  });
});
