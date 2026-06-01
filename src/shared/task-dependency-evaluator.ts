export type TaskDependencyIssueCode =
  | 'missing_task'
  | 'missing_dependency'
  | 'self_dependency';

export type TaskDependencyIssue = {
  code: TaskDependencyIssueCode;
  message: string;
};

export type TaskDependencyEvaluation = {
  allowed: boolean;
  summary: string;
  issues: TaskDependencyIssue[];
};

export function evaluateTaskDependencyBoundary(params: {
  taskId?: string | null;
  blockedByTaskId?: string | null;
}): TaskDependencyEvaluation {
  const taskId = params.taskId?.trim() ?? '';
  const blockedByTaskId = params.blockedByTaskId?.trim() ?? '';
  const issues: TaskDependencyIssue[] = [];

  if (!taskId) {
    issues.push({
      code: 'missing_task',
      message: '依赖关系缺少被阻塞任务。',
    });
  }

  if (!blockedByTaskId) {
    issues.push({
      code: 'missing_dependency',
      message: '依赖关系缺少上游任务。',
    });
  }

  if (taskId && blockedByTaskId && taskId === blockedByTaskId) {
    issues.push({
      code: 'self_dependency',
      message: '任务不能依赖自己。',
    });
  }

  return {
    allowed: issues.length === 0,
    issues,
    summary: issues.length
      ? `任务依赖暂不能保存：${issues[0]?.message ?? '存在阻断问题。'}`
      : '任务依赖通过边界检查。',
  };
}
