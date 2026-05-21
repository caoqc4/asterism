import type { TaskExecutionType } from './types/task.js';
import {
  inferTaskTypeProfile,
  normalizeTaskTypeFacets,
} from './task-type-profile.js';

export type TaskTypeReviewProposalSource = 'local_rule' | 'selected_runtime' | 'model_service_fallback';

export type TaskTypeReviewProposal = {
  taskId: string;
  taskTitle: string;
  currentType: TaskExecutionType;
  suggestedType: TaskExecutionType;
  suggestedFacets: TaskExecutionType[];
  reason: string;
  nextAction: string;
  source: TaskTypeReviewProposalSource;
  sourceLabel: string;
};

export const TASK_TYPE_REVIEW_LABELS: Record<TaskExecutionType, string> = {
  simple: '一次性',
  project: '项目型',
  scheduled: '定时任务',
  event: '事件触发',
  routine: '常设任务',
};

export const TASK_TYPE_REVIEW_NEXT_ACTION: Record<TaskExecutionType, string> = {
  simple: '保持单条任务推进，必要时补齐下一步和验收标准。',
  project: '按项目型任务处理，先确认拆解边界，再由用户确认真实子任务。',
  scheduled: '确认周期、触发时间和每次执行的验收口径。',
  event: '确认外部触发来源、进入条件和触发后的处理动作。',
  routine: '确认长期维护范围、复盘节奏和信息更新边界。',
};

export function buildLocalTaskTypeReviewProposal(params: {
  taskId: string;
  taskTitle: string;
  currentType: TaskExecutionType;
}): TaskTypeReviewProposal {
  const profile = inferTaskTypeProfile(params.taskTitle);
  const suggestedFacets = normalizeTaskTypeFacets(profile.facets, profile.primaryType);
  const reason = profile.primaryType === params.currentType
    ? `当前类型已经与标题规则判断一致：${TASK_TYPE_REVIEW_LABELS[profile.primaryType]}。`
    : `标题规则建议从「${TASK_TYPE_REVIEW_LABELS[params.currentType]}」调整为「${TASK_TYPE_REVIEW_LABELS[profile.primaryType]}」。`;
  return {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    currentType: params.currentType,
    suggestedType: profile.primaryType,
    suggestedFacets,
    reason,
    nextAction: TASK_TYPE_REVIEW_NEXT_ACTION[profile.primaryType],
    source: 'local_rule',
    sourceLabel: '本地结构化类型规则',
  };
}
