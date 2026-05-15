import { describe, expect, it } from 'vitest';

import { evaluateRuntimeIntake, isRuntimeFollowUpTaskProposal } from './runtime-intake-evaluator.js';

describe('runtime intake evaluator', () => {
  it('blocks empty or underspecified intake', () => {
    expect(evaluateRuntimeIntake({ text: '嗯' })).toMatchObject({
      outcome: 'continue_discussion',
      allowed: false,
      suggestedSurface: 'discussion',
    });
  });

  it('captures actionable global input as a pending task', () => {
    expect(evaluateRuntimeIntake({
      text: '准备投资人沟通材料',
      source: 'global_chat',
    })).toMatchObject({
      outcome: 'create_task',
      allowed: true,
      suggestedSurface: 'task',
      requiresConfirmation: true,
      title: '准备投资人沟通材料',
    });
  });

  it('routes task-context closeout or handoff notes to task records', () => {
    expect(evaluateRuntimeIntake({
      text: '阶段收尾：已经完成质量检查，保留当前上下文交接记录',
      hasTaskContext: true,
    })).toMatchObject({
      outcome: 'create_task_record',
      allowed: false,
      suggestedSurface: 'task_record',
    });
  });

  it('routes approval and choice language to decisions', () => {
    expect(evaluateRuntimeIntake({
      text: '这个风险是否允许继续推进，需要用户拍板',
      hasTaskContext: true,
    })).toMatchObject({
      outcome: 'surface_decision',
      allowed: false,
      suggestedSurface: 'decision',
      requiresConfirmation: true,
    });
  });

  it('routes cross-task preferences to work habits', () => {
    expect(evaluateRuntimeIntake({
      text: '以后每次阶段收尾都自动做质量检查，不要再让我手动点',
      hasTaskContext: true,
    })).toMatchObject({
      outcome: 'propose_work_habit',
      allowed: false,
      suggestedSurface: 'work_habit',
    });
  });

  it('routes task-context document writes to task file proposals', () => {
    expect(evaluateRuntimeIntake({
      text: '把这段讨论生成 Markdown 文件提案',
      source: 'task_chat',
    })).toMatchObject({
      outcome: 'propose_task_file',
      allowed: false,
      suggestedSurface: 'task_file',
    });
  });

  it('keeps generic task-context discussion out of task creation', () => {
    expect(evaluateRuntimeIntake({
      text: '继续评估一下这里的交互是否合理',
      source: 'task_chat',
    })).toMatchObject({
      outcome: 'continue_discussion',
      allowed: false,
      suggestedSurface: 'discussion',
    });
  });

  it('allows explicit task creation even from task context', () => {
    expect(evaluateRuntimeIntake({
      text: '把这个作为后续任务创建：补充 Decisions 待决策页空状态',
      source: 'task_chat',
    })).toMatchObject({
      outcome: 'create_task',
      allowed: true,
      suggestedSurface: 'task',
      confidence: 'high',
    });
  });

  it('detects explicit follow-up task proposals for closeout gating', () => {
    expect(isRuntimeFollowUpTaskProposal('把这个作为后续任务创建：补充验收回归')).toBe(true);
    expect(isRuntimeFollowUpTaskProposal('create a follow-up task for release notes')).toBe(true);
    expect(isRuntimeFollowUpTaskProposal('创建任务：准备沟通材料')).toBe(false);
  });
});
