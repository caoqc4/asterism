import { describe, expect, it } from 'vitest';
import { evaluateTaskRecordWorthiness } from './task-record-worthiness.js';

describe('task record worthiness', () => {
  it('accepts handoff and closeout recovery context when task-bound', () => {
    expect(evaluateTaskRecordWorthiness({
      hasTaskContext: true,
      text: '阶段收尾：已完成质量检查，下一任务需要先读取验收风险。',
    })).toMatchObject({
      shouldCreateTaskRecord: true,
      reason: 'phase_closeout',
      missing: [],
    });

    expect(evaluateTaskRecordWorthiness({
      hasTaskContext: true,
      text: '交接到子任务 A：保留当前验收范围和未解决风险。',
    })).toMatchObject({
      shouldCreateTaskRecord: true,
      reason: 'handoff',
    });
  });

  it('accepts corrections, option rationale, failures, and external signals', () => {
    expect(evaluateTaskRecordWorthiness({
      hasTaskContext: true,
      text: '我提醒一下：以后这个任务不要把阶段收尾当成新任务拆解。',
    }).reason).toBe('user_correction');

    expect(evaluateTaskRecordWorthiness({
      hasTaskContext: true,
      text: '方案对比：选择保留父任务，拒绝创建三个更笼统的子任务。',
    }).reason).toBe('option_comparison');

    expect(evaluateTaskRecordWorthiness({
      hasTaskContext: true,
      text: '失败复盘：保存后文件分类错误，原因是没有统一路由。',
    }).reason).toBe('failure_review');

    expect(evaluateTaskRecordWorthiness({
      hasTaskContext: true,
      text: '外部信号：GitHub review 要求先补充验收证据。',
    }).reason).toBe('external_signal');
  });

  it('rejects generic, duplicate, or unbound notes', () => {
    expect(evaluateTaskRecordWorthiness({
      hasTaskContext: true,
      text: '继续看看有没有别的问题。',
    })).toMatchObject({
      shouldCreateTaskRecord: false,
      reason: 'generic_or_minor',
    });

    expect(evaluateTaskRecordWorthiness({
      hasTaskContext: true,
      text: '这个结论已记录，不用再记一次。',
    })).toMatchObject({
      shouldCreateTaskRecord: false,
      reason: 'duplicate',
    });

    expect(evaluateTaskRecordWorthiness({
      hasTaskContext: false,
      text: '交接：下一步需要读取验收风险。',
    })).toMatchObject({
      shouldCreateTaskRecord: false,
      reason: 'handoff',
      requiresTaskContext: true,
      missing: ['需要绑定任务上下文。'],
    });
  });

  it('allows callers to provide a durable reason hint', () => {
    expect(evaluateTaskRecordWorthiness({
      hasTaskContext: true,
      reasonHint: 'decision_rationale',
      text: '选择现在推进，因为阻塞已经解除。',
    })).toMatchObject({
      shouldCreateTaskRecord: true,
      reason: 'decision_rationale',
      confidence: 'high',
    });
  });
});
