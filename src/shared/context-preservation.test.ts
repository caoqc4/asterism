import { describe, expect, it } from 'vitest';

import {
  buildContextPreservationRecordContent,
  evaluateContextPreservation,
} from './context-preservation.js';

describe('context preservation', () => {
  it('does not require preservation outside business-line or task context', () => {
    expect(evaluateContextPreservation({
      hasTaskContext: false,
      messages: [{ role: 'user', text: '目标是稍后创建一个任务' }],
    })).toMatchObject({
      status: 'not_applicable',
      hasValuableSignals: true,
      requiredWriteIntents: [],
    });
  });

  it('keeps low-signal task chat instead of pretending it is recoverable', () => {
    expect(evaluateContextPreservation({
      hasTaskContext: true,
      chatMessageCount: 2,
      messages: [
        { role: 'user', text: '嗯嗯' },
        { role: 'assistant', text: '好的' },
      ],
    })).toMatchObject({
      status: 'keep_context',
      hasValuableSignals: false,
      missingCoverage: ['已有任务对话，但尚未形成目标、决定、风险、下一步、来源或交接信号。'],
    });
  });

  it('extracts recoverable signals and recommends the smallest write surfaces', () => {
    const result = evaluateContextPreservation({
      hasTaskContext: true,
      messages: [
        { role: 'user', text: '目标是做 Codex 基础教程网站，面向 agent 初学者。' },
        { role: 'user', text: '下一步先调研官方文档和案例，风险是不要做成大而全资料库。' },
      ],
    });

    expect(result.status).toBe('needs_write');
    expect(result.valuableSignals.map((signal) => signal.kind)).toEqual(expect.arrayContaining([
      'goal',
      'next_step',
      'risk',
      'source',
    ]));
    expect(result.requiredWriteIntents.map((intent) => intent.targetSurface)).toEqual(expect.arrayContaining([
      'task_md',
      'task_record',
      'source_context',
    ]));
  });

  it('routes durable business handoff signals to Business Records', () => {
    const result = evaluateContextPreservation({
      handoffType: 'durable_business_handoff',
      hasBusinessLineContext: true,
      hasTaskContext: false,
      messages: [
        { role: 'user', text: '阶段收尾：目标保持增长实验，风险是来源证据不足，下一步补 Source Context。' },
      ],
    });

    expect(result.handoffType).toBe('durable_business_handoff');
    expect(result.status).toBe('needs_write');
    expect(result.requiredWriteIntents.map((intent) => intent.targetSurface)).toEqual(expect.arrayContaining([
      'business_record',
      'source_context',
    ]));
    expect(result.requiredWriteIntents.map((intent) => intent.targetSurface)).not.toContain('task_record');
  });

  it('routes runtime or subagent handoff signals to run steps before writes are applied', () => {
    const result = evaluateContextPreservation({
      handoffType: 'runtime_or_subagent_handoff',
      hasTaskContext: true,
      messages: [
        { role: 'user', text: 'runtime handoff：实现已完成，下一步主 Agent 检查 diff，风险是验证还没跑。' },
      ],
    });

    expect(result.handoffType).toBe('runtime_or_subagent_handoff');
    expect(result.requiredWriteIntents.map((intent) => intent.targetSurface)).toContain('run_step');
  });

  it('marks recovery covered after the preservation write has completed', () => {
    expect(evaluateContextPreservation({
      hasTaskContext: true,
      memoryWriteCompleted: true,
      messages: [
        { role: 'user', text: '决定按基础教程和案例展示推进，下一步开始实现。' },
      ],
    })).toMatchObject({
      status: 'covered',
      recoveryCheck: {
        canRecoverState: true,
        canRecoverNextStep: true,
      },
      requiredWriteIntents: [],
    });
  });

  it('blocks preservation when the next move would bypass a user decision', () => {
    expect(evaluateContextPreservation({
      hasTaskContext: true,
      hasOpenDecision: true,
      chatMessageCount: 1,
    })).toMatchObject({
      status: 'needs_user_decision',
      requiredWriteIntents: [],
      valuableSignals: [expect.objectContaining({
        kind: 'decision',
        targetSurface: 'decision',
      })],
    });
  });

  it('renders a compact recovery proof instead of a full transcript archive', () => {
    const evaluation = evaluateContextPreservation({
      hasTaskContext: true,
      memoryWriteCompleted: true,
      messages: [
        { role: 'user', text: '目标是输出上下文保全方案，下一步补测试。' },
      ],
    });

    expect(buildContextPreservationRecordContent({
      capturedAt: '2026-05-24T00:00:00.000Z',
      evaluation,
      taskTitle: '上下文管理',
    })).toContain('# Record: 上下文保全证明');
    expect(buildContextPreservationRecordContent({
      capturedAt: '2026-05-24T00:00:00.000Z',
      evaluation,
      taskTitle: '上下文管理',
    })).toContain('保全状态：covered');
    expect(buildContextPreservationRecordContent({
      capturedAt: '2026-05-24T00:00:00.000Z',
      evaluation,
      taskTitle: '上下文管理',
    })).toContain('交接类型：next_action_handoff');
  });
});
