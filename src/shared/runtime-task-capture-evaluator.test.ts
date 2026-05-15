import { describe, expect, it } from 'vitest';

import { evaluateRuntimeTaskCapture } from './runtime-task-capture-evaluator.js';

function task(overrides: {
  id: string;
  title: string;
  state?: 'planned' | 'running' | 'completed' | 'archived';
  parentTaskId?: string | null;
}) {
  return {
    id: overrides.id,
    title: overrides.title,
    state: overrides.state ?? 'running',
    parentTaskId: overrides.parentTaskId ?? null,
  };
}

describe('runtime task capture evaluator', () => {
  it('allows specific new task candidates', () => {
    expect(evaluateRuntimeTaskCapture({
      title: '整理小程序验收清单',
      summary: '把已有子任务的验收点汇总成可检查清单。',
      existingTasks: [task({ id: 'task_1', title: '开发小程序' })],
    })).toMatchObject({
      allowed: true,
      issues: [],
    });
  });

  it('blocks duplicate open tasks', () => {
    const result = evaluateRuntimeTaskCapture({
      title: '开发小程序',
      existingTasks: [task({ id: 'task_1', title: '开发小程序' })],
    });

    expect(result).toMatchObject({
      allowed: false,
      issues: [
        {
          code: 'duplicate_open_task',
          matchedTaskId: 'task_1',
        },
      ],
    });
  });

  it('scopes duplicate checks to the same parent task', () => {
    expect(evaluateRuntimeTaskCapture({
      title: '需求分析',
      parentTaskId: 'project_2',
      existingTasks: [
        task({ id: 'child_1', title: '需求分析', parentTaskId: 'project_1' }),
      ],
    })).toMatchObject({
      allowed: true,
    });

    expect(evaluateRuntimeTaskCapture({
      title: '需求分析',
      parentTaskId: 'project_1',
      existingTasks: [
        task({ id: 'child_1', title: '需求分析', parentTaskId: 'project_1' }),
      ],
    })).toMatchObject({
      allowed: false,
      issues: [
        {
          code: 'duplicate_open_task',
          matchedTaskId: 'child_1',
        },
      ],
    });
  });

  it('ignores duplicate titles that are already closed', () => {
    expect(evaluateRuntimeTaskCapture({
      title: '开发小程序',
      existingTasks: [task({ id: 'task_1', title: '开发小程序', state: 'completed' })],
    })).toMatchObject({
      allowed: true,
    });
  });

  it('blocks generic title-only captures', () => {
    expect(evaluateRuntimeTaskCapture({
      title: '继续',
      existingTasks: [],
    })).toMatchObject({
      allowed: false,
      issues: [
        {
          code: 'generic_title',
        },
      ],
    });
  });
});
