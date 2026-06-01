import type { TaskState } from './types/task.js';

export type RuntimeActionKind =
  | 'context_switch'
  | 'context_clear'
  | 'decision_action'
  | 'phase_closeout'
  | 'run_resume'
  | 'run_start'
  | 'task_mutation'
  | 'task_state_transition'
  | 'task_file_write_proposal'
  | 'task_capture';

export type RuntimeActionSurface =
  | 'ui_only'
  | 'timeline'
  | 'task_record'
  | 'decision_checkpoint'
  | 'run';

export type RuntimeActionEvaluation = {
  action: RuntimeActionKind;
  allowed: boolean;
  surface: RuntimeActionSurface;
  requiresConfirmation: boolean;
  shouldPersistTaskRecord: boolean;
  shouldRefreshContext: boolean;
  reason: string;
};

export function evaluateRuntimeAction(params: {
  action: RuntimeActionKind;
  decisionAction?: 'approve' | 'defer' | 'cancel' | null;
  fromTaskId?: string | null;
  hasSpecificHandoffSignal?: boolean;
  messageCount?: number;
  targetTaskId?: string | null;
  targetTaskState?: TaskState | null;
}): RuntimeActionEvaluation {
  const messageCount = params.messageCount ?? 0;
  const hasTaskContext = Boolean(params.fromTaskId);
  const sameTask = Boolean(params.fromTaskId && params.targetTaskId && params.fromTaskId === params.targetTaskId);

  switch (params.action) {
    case 'context_switch':
      if (sameTask) {
        return {
          action: params.action,
          allowed: true,
          surface: 'ui_only',
          requiresConfirmation: false,
          shouldPersistTaskRecord: false,
          shouldRefreshContext: false,
          reason: '已经在当前任务上下文中，无需切换。',
        };
      }
      return {
        action: params.action,
        allowed: true,
        surface: hasTaskContext && messageCount > 0 ? 'task_record' : 'timeline',
        requiresConfirmation: hasTaskContext && messageCount > 0,
        shouldPersistTaskRecord: hasTaskContext && Boolean(params.hasSpecificHandoffSignal),
        shouldRefreshContext: true,
        reason: hasTaskContext && messageCount > 0
          ? '切换任务前应保全有用上下文，并由用户确认切换。'
          : '可以直接进入目标任务上下文。',
      };
    case 'context_clear':
      return {
        action: params.action,
        allowed: !hasTaskContext || messageCount === 0 || Boolean(params.hasSpecificHandoffSignal),
        surface: hasTaskContext && messageCount > 0 ? 'task_record' : 'ui_only',
        requiresConfirmation: hasTaskContext && messageCount > 0,
        shouldPersistTaskRecord: hasTaskContext && Boolean(params.hasSpecificHandoffSignal),
        shouldRefreshContext: true,
        reason: !hasTaskContext || messageCount === 0
          ? '全局或空会话可以直接刷新。'
          : params.hasSpecificHandoffSignal
            ? '刷新任务会话前应先保全关键恢复上下文。'
            : '任务会话缺少可恢复信号，暂不应刷新。',
      };
    case 'decision_action':
      return {
        action: params.action,
        allowed: true,
        surface: 'decision_checkpoint',
        requiresConfirmation: params.decisionAction === 'approve',
        shouldPersistTaskRecord: false,
        shouldRefreshContext: params.decisionAction === 'approve',
        reason: params.decisionAction === 'approve'
          ? '拍板通过会解除对应判断点，并可能让任务或 Agent 继续推进。'
          : params.decisionAction === 'defer'
            ? '暂缓拍板会保留判断上下文，不应自动继续执行。'
            : '取消拍板会关闭本次判断请求，不应自动继续执行。',
      };
    case 'task_state_transition':
      return {
        action: params.action,
        allowed: hasTaskContext && Boolean(params.targetTaskState),
        surface: 'timeline',
        requiresConfirmation: params.targetTaskState === 'completed' || params.targetTaskState === 'archived',
        shouldPersistTaskRecord: params.targetTaskState === 'completed',
        shouldRefreshContext: params.targetTaskState === 'completed' || params.targetTaskState === 'waiting_external',
        reason: params.targetTaskState === 'completed'
          ? '任务完成会改变执行队列，应先通过完成检查或用户确认，并保留交接线索。'
          : params.targetTaskState === 'waiting_external'
            ? '任务进入等待会退出当前推进队列，并保留等待原因。'
            : params.targetTaskState === 'archived'
              ? '归档会从常规执行视图移除任务，需要用户明确触发。'
              : '任务状态迁移应作为 timeline 事件记录。',
      };
    case 'task_mutation':
      return {
        action: params.action,
        allowed: hasTaskContext,
        surface: 'timeline',
        requiresConfirmation: false,
        shouldPersistTaskRecord: false,
        shouldRefreshContext: true,
        reason: hasTaskContext
          ? '任务字段或完成标准变更应绑定当前任务，并作为任务 timeline 事件保留。'
          : '任务变更需要绑定任务上下文。',
      };
    case 'phase_closeout':
      return {
        action: params.action,
        allowed: hasTaskContext && messageCount > 0,
        surface: 'task_record',
        requiresConfirmation: false,
        shouldPersistTaskRecord: true,
        shouldRefreshContext: true,
        reason: hasTaskContext && messageCount > 0
          ? '阶段收尾应自动保存任务记录、执行质量检查并刷新上下文。'
          : '阶段收尾需要任务上下文和实际讨论内容。',
      };
    case 'run_start':
      return {
        action: params.action,
        allowed: hasTaskContext,
        surface: 'run',
        requiresConfirmation: false,
        shouldPersistTaskRecord: false,
        shouldRefreshContext: true,
        reason: hasTaskContext
          ? '启动 Run 应重新组装任务上下文，并将执行过程记录到 run steps。'
          : '启动 Run 需要绑定任务上下文。',
      };
    case 'run_resume':
      return {
        action: params.action,
        allowed: hasTaskContext,
        surface: 'run',
        requiresConfirmation: true,
        shouldPersistTaskRecord: false,
        shouldRefreshContext: true,
        reason: hasTaskContext
          ? '续跑 paused Run 必须通过 checkpoint 恢复路径，并继续记录后续 run steps。'
          : '续跑 Run 需要绑定任务上下文。',
      };
    case 'task_file_write_proposal':
      return {
        action: params.action,
        allowed: hasTaskContext && messageCount > 0,
        surface: 'decision_checkpoint',
        requiresConfirmation: true,
        shouldPersistTaskRecord: false,
        shouldRefreshContext: false,
        reason: hasTaskContext && messageCount > 0
          ? '文件写入应先生成提案，确认后再写入 durable task file。'
          : '文件写入提案需要任务上下文和实际讨论内容。',
      };
    case 'task_capture':
      return {
        action: params.action,
        allowed: !hasTaskContext && messageCount > 0,
        surface: 'timeline',
        requiresConfirmation: true,
        shouldPersistTaskRecord: false,
        shouldRefreshContext: true,
        reason: '全局讨论可以捕获为待确认任务，确认后再进入任务管理。',
      };
  }
}
