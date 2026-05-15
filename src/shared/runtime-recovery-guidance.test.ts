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
});
