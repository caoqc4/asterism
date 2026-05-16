import { describe, expect, it } from 'vitest';

import { buildRuntimeRecoveryGuidance } from './runtime-recovery-guidance.js';

describe('runtime recovery guidance', () => {
  it('returns structured Task.md guidance with the legacy message', () => {
    const guidance = buildRuntimeRecoveryGuidance({
      text: '下一步是复核 owner 输出。',
      hasTaskContext: true,
      producedDurableChange: true,
      taskMdReasonHint: 'next_step',
    });

    expect(guidance.messages).toEqual(['Task.md update recommended: next_step']);
    expect(guidance.items[0]).toMatchObject({
      target: 'task_md',
      message: 'Task.md update recommended: next_step',
      evaluation: {
        shouldUpdateTaskMd: true,
        reason: 'next_step',
      },
      referencePath: null,
    });
  });

  it('keeps important file references as structured guidance metadata', () => {
    const guidance = buildRuntimeRecoveryGuidance({
      text: '创建了交付说明。',
      hasTaskContext: true,
      importantFilePath: 'Artifacts/release-note.md',
      producedDurableChange: true,
      taskMdReasonHint: 'important_file',
    });

    expect(guidance.items[0]).toMatchObject({
      target: 'task_md',
      referencePath: 'Artifacts/release-note.md',
      evaluation: {
        reason: 'important_file',
      },
    });
  });

  it('can include Task Record guidance for external signals', () => {
    const guidance = buildRuntimeRecoveryGuidance({
      text: '外部来源更新了关键约束，需要后续恢复时参考。',
      hasTaskContext: true,
      producedDurableChange: true,
      taskMdReasonHint: 'durable_state_change',
      taskRecordReasonHint: 'external_signal',
      includeTaskRecord: true,
    });

    expect(guidance.messages).toEqual([
      'Task.md update recommended: durable_state_change',
      'Task Record may be useful: external_signal',
    ]);
    expect(guidance.items.map((item) => item.target)).toEqual(['task_md', 'task_record']);
  });

  it('does not recommend task-bound recovery writes without task context', () => {
    const guidance = buildRuntimeRecoveryGuidance({
      text: '创建了一个重要文件。',
      hasTaskContext: false,
      importantFilePath: 'Artifacts/report.md',
      producedDurableChange: true,
      taskMdReasonHint: 'important_file',
      taskRecordReasonHint: 'durable_state_change',
      includeTaskRecord: true,
    });

    expect(guidance.messages).toEqual([]);
    expect(guidance.items).toEqual([]);
  });

  it('can keep Task Record guidance from using durable-change fallback', () => {
    const guidance = buildRuntimeRecoveryGuidance({
      text: '已创建普通来源材料，后续可按需读取。',
      hasTaskContext: true,
      producedDurableChange: true,
      taskRecordProducedDurableChange: false,
      taskMdReasonHint: 'durable_state_change',
      includeTaskRecord: true,
    });

    expect(guidance.messages).toEqual(['Task.md update recommended: durable_state_change']);
    expect(guidance.items.map((item) => item.target)).toEqual(['task_md']);
  });

  it('can derive Task.md guidance from structured durable fields', () => {
    const guidance = buildRuntimeRecoveryGuidance({
      text: '工具写入了任务字段。',
      hasTaskContext: true,
      producedDurableChange: true,
      taskMdDurableFields: ['completionCriteria', 'nextStep'],
    });

    expect(guidance.items[0]).toMatchObject({
      target: 'task_md',
      message: 'Task.md update recommended: next_step',
      evaluation: {
        reason: 'next_step',
        confidence: 'high',
      },
    });
  });
});
