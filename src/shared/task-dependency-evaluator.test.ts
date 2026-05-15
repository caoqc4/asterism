import { describe, expect, it } from 'vitest';

import { evaluateTaskDependencyBoundary } from './task-dependency-evaluator.js';

describe('task dependency evaluator', () => {
  it('allows a task to depend on a different upstream task', () => {
    expect(evaluateTaskDependencyBoundary({
      taskId: 'task_downstream',
      blockedByTaskId: 'task_upstream',
    })).toMatchObject({
      allowed: true,
      issues: [],
    });
  });

  it('blocks missing task ids', () => {
    expect(evaluateTaskDependencyBoundary({
      taskId: '',
      blockedByTaskId: 'task_upstream',
    })).toMatchObject({
      allowed: false,
      issues: [
        {
          code: 'missing_task',
        },
      ],
    });

    expect(evaluateTaskDependencyBoundary({
      taskId: 'task_downstream',
      blockedByTaskId: null,
    })).toMatchObject({
      allowed: false,
      issues: [
        {
          code: 'missing_dependency',
        },
      ],
    });
  });

  it('blocks self dependencies', () => {
    expect(evaluateTaskDependencyBoundary({
      taskId: 'task_1',
      blockedByTaskId: 'task_1',
    })).toMatchObject({
      allowed: false,
      issues: [
        {
          code: 'self_dependency',
        },
      ],
      summary: '任务依赖暂不能保存：任务不能依赖自己。',
    });
  });
});
