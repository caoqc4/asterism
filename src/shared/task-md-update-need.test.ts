import { describe, expect, it } from 'vitest';
import { evaluateTaskMdUpdateNeed } from './task-md-update-need.js';

describe('task md update need', () => {
  it('requires Task.md updates for primary recovery fields', () => {
    expect(evaluateTaskMdUpdateNeed({
      hasTaskContext: true,
      changeText: '下一步：进入第一个子任务继续实现。',
    })).toMatchObject({
      shouldUpdateTaskMd: true,
      reason: 'next_step',
    });

    expect(evaluateTaskMdUpdateNeed({
      hasTaskContext: true,
      changeText: '决策：拒绝创建更笼统的三个子任务。',
    })).toMatchObject({
      shouldUpdateTaskMd: true,
      reason: 'decision',
    });

    expect(evaluateTaskMdUpdateNeed({
      hasTaskContext: true,
      changeText: '风险：文件分类路由还没有完全接入。',
    })).toMatchObject({
      shouldUpdateTaskMd: true,
      reason: 'constraint_or_blocker',
    });
  });

  it('requires Task.md updates for important file references', () => {
    expect(evaluateTaskMdUpdateNeed({
      hasTaskContext: true,
      importantFilePath: 'Task Records/2026-05-14-phase-closeout.md',
    })).toMatchObject({
      shouldUpdateTaskMd: true,
      reason: 'important_file',
      missing: [],
    });
  });

  it('does not duplicate existing important file references', () => {
    expect(evaluateTaskMdUpdateNeed({
      hasTaskContext: true,
      existingTaskMdContent: '## Important Files\n- report.md',
      importantFilePath: 'report.md',
    })).toMatchObject({
      shouldUpdateTaskMd: false,
      reason: 'not_needed',
    });
  });

  it('blocks task-bound updates without task context', () => {
    expect(evaluateTaskMdUpdateNeed({
      hasTaskContext: false,
      changeText: '下一步：继续验收。',
    })).toMatchObject({
      shouldUpdateTaskMd: false,
      reason: 'next_step',
      requiresTaskContext: true,
      missing: ['需要绑定任务上下文。'],
    });
  });
});
