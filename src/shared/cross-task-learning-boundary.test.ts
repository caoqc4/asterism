import { describe, expect, it } from 'vitest';

import { evaluateCrossTaskLearningBoundary } from './cross-task-learning-boundary.js';

describe('cross task learning boundary', () => {
  it('keeps task-specific corrections inside task records', () => {
    expect(evaluateCrossTaskLearningBoundary('这个任务应该以用户刚刚确认的范围为准')).toMatchObject({
      surface: 'task_record',
      requiresConfirmation: false,
      scope: 'task',
    });
  });

  it('keeps current-task phrasing task-bound even when it mentions future behavior', () => {
    expect(evaluateCrossTaskLearningBoundary('这个任务以后都按当前验收口径处理')).toMatchObject({
      surface: 'task_record',
      requiresConfirmation: false,
      scope: 'task',
    });
  });

  it('keeps batch and phase phrasing task-bound even when it sounds reusable', () => {
    expect(evaluateCrossTaskLearningBoundary('这批任务以后都先按当前阶段的验收口径处理')).toMatchObject({
      surface: 'task_record',
      requiresConfirmation: false,
      scope: 'task',
    });
  });

  it('routes global preferences to pending work habit proposals', () => {
    expect(evaluateCrossTaskLearningBoundary('以后所有任务都先做第一性原理评估')).toMatchObject({
      surface: 'work_habit_proposal',
      requiresConfirmation: true,
      scope: 'global',
    });
  });

  it('routes reusable process-shaped rules to process template proposals', () => {
    expect(evaluateCrossTaskLearningBoundary('类似任务默认按步骤：1. 检查上下文 2. 执行 3. 记录收尾')).toMatchObject({
      surface: 'process_template_proposal',
      requiresConfirmation: true,
      scope: 'task_type',
    });
  });

  it('does not turn temporary brainstorming into cross-task memory', () => {
    expect(evaluateCrossTaskLearningBoundary('也许可以讨论一下这个流程是否合理')).toMatchObject({
      surface: 'discussion_only',
      requiresConfirmation: false,
      scope: null,
    });
  });

  it('requires scope confirmation for process text without cross-task wording', () => {
    expect(evaluateCrossTaskLearningBoundary('流程：先评估，再执行，最后检查')).toMatchObject({
      surface: 'process_template_proposal',
      requiresConfirmation: true,
      missing: ['确认适用任务类型或项目范围'],
    });
  });
});
