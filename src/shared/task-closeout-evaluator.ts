import type { TaskDetail, TaskListItemRecord, TaskRiskLevel } from './types/task.js';

export type TaskCloseoutIntent = 'phase_closeout' | 'task_completion';

export type TaskCloseoutOutcome =
  | 'ready_to_complete'
  | 'needs_user_confirmation'
  | 'needs_follow_up_confirmation'
  | 'pause_with_handoff'
  | 'continue_current_task'
  | 'handoff_to_existing_child'
  | 'handoff_to_existing_successor';

export type TaskCloseoutNextTaskKind = 'existing_child' | 'existing_successor';

export type TaskCloseoutFollowUpProposal = {
  title: string;
  summary?: string | null;
  evidence?: string[];
};

export type TaskCloseoutEvaluation = {
  outcome: TaskCloseoutOutcome;
  reason: string;
  recordNeeded: boolean;
  nextTaskId?: string;
  nextTaskKind?: TaskCloseoutNextTaskKind;
  followUpProposalAllowed?: boolean;
  proposedFollowUpCount?: number;
  criteriaTotal: number;
  criteriaSatisfied: number;
  criteriaOpen: number;
  runVerificationTone: 'pass' | 'warn' | 'fail' | 'pending';
  runVerificationLabel: string;
  runVerificationDetail: string;
};

export type TaskCloseoutEvaluatorInput = {
  intent: TaskCloseoutIntent;
  task: TaskDetail;
  childTasks?: TaskListItemRecord[];
  childTaskIds?: string[];
  proposedFollowUpTasks?: TaskCloseoutFollowUpProposal[];
  successorTaskIds?: string[];
  successorTasks?: TaskListItemRecord[];
};

function isOpenTask(task: TaskListItemRecord): boolean {
  return task.state !== 'completed' && task.state !== 'archived';
}

function isHighRisk(riskLevel: TaskRiskLevel): boolean {
  return riskLevel === 'high' || riskLevel === 'medium';
}

function orderedOpenChildren(input: TaskCloseoutEvaluatorInput): TaskListItemRecord[] {
  const children = (input.childTasks ?? []).filter(isOpenTask);
  const childIds = input.childTaskIds ?? [];
  if (childIds.length === 0) {
    return children.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }
  const childById = new Map(children.map((child) => [child.id, child]));
  const ordered = childIds
    .map((id) => childById.get(id))
    .filter((child): child is TaskListItemRecord => Boolean(child));
  const known = new Set(ordered.map((child) => child.id));
  const unlisted = children
    .filter((child) => !known.has(child.id))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  return [...ordered, ...unlisted];
}

function orderedOpenSuccessors(input: TaskCloseoutEvaluatorInput): TaskListItemRecord[] {
  const successors = (input.successorTasks ?? []).filter(isOpenTask);
  const successorIds = input.successorTaskIds ?? [];
  if (successorIds.length === 0) {
    return successors.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }
  const successorById = new Map(successors.map((successor) => [successor.id, successor]));
  const ordered = successorIds
    .map((id) => successorById.get(id))
    .filter((successor): successor is TaskListItemRecord => Boolean(successor));
  const known = new Set(ordered.map((successor) => successor.id));
  const unlisted = successors
    .filter((successor) => !known.has(successor.id))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  return [...ordered, ...unlisted];
}

function completionCounts(task: TaskDetail): {
  total: number;
  satisfied: number;
  open: number;
} {
  const fromResume = task.resumeCard?.completionStatus;
  if (fromResume) {
    return {
      total: fromResume.total,
      satisfied: fromResume.satisfied,
      open: fromResume.open,
    };
  }
  const total = task.completionCriteria.length;
  const satisfied = task.completionCriteria.filter((item) => item.status === 'satisfied').length;
  return {
    total,
    satisfied,
    open: total - satisfied,
  };
}

export function evaluateTaskCloseout(input: TaskCloseoutEvaluatorInput): TaskCloseoutEvaluation {
  const criteria = completionCounts(input.task);
  const openChildren = orderedOpenChildren(input);
  const openSuccessors = orderedOpenSuccessors(input);
  const activeBlocker = input.task.activeBlocker;
  const activeDependency = input.task.activeDependency;
  const proposedFollowUps = input.proposedFollowUpTasks ?? [];

  if (activeBlocker) {
    return {
      outcome: 'pause_with_handoff',
      reason: `当前仍有阻塞项：${activeBlocker.title}。`,
      recordNeeded: true,
      criteriaTotal: criteria.total,
      criteriaSatisfied: criteria.satisfied,
      criteriaOpen: criteria.open,
      runVerificationTone: 'warn',
      runVerificationLabel: '阶段收尾检查：仍有阻塞',
      runVerificationDetail: `阻塞项仍存在：${activeBlocker.title}`,
    };
  }

  if (activeDependency) {
    return {
      outcome: 'pause_with_handoff',
      reason: `当前仍有未解除依赖：${activeDependency.blockedByTaskTitle ?? activeDependency.reason ?? activeDependency.blockedByTaskId}。`,
      recordNeeded: true,
      criteriaTotal: criteria.total,
      criteriaSatisfied: criteria.satisfied,
      criteriaOpen: criteria.open,
      runVerificationTone: 'warn',
      runVerificationLabel: '阶段收尾检查：仍有依赖',
      runVerificationDetail: `依赖项仍存在：${activeDependency.blockedByTaskTitle ?? activeDependency.reason ?? activeDependency.blockedByTaskId}`,
    };
  }

  const nextChild = openChildren[0] ?? null;
  if (input.intent === 'phase_closeout' && nextChild) {
    return {
      outcome: 'handoff_to_existing_child',
      reason: `阶段已收尾，下一项可执行子任务是：${nextChild.title}。`,
      recordNeeded: true,
      nextTaskId: nextChild.id,
      nextTaskKind: 'existing_child',
      criteriaTotal: criteria.total,
      criteriaSatisfied: criteria.satisfied,
      criteriaOpen: criteria.open,
      runVerificationTone: 'pass',
      runVerificationLabel: '阶段收尾检查：交接到子任务',
      runVerificationDetail: `已找到可交接子任务：${nextChild.title}`,
    };
  }

  const nextSuccessor = openSuccessors[0] ?? null;
  if (input.intent === 'phase_closeout' && nextSuccessor) {
    return {
      outcome: 'handoff_to_existing_successor',
      reason: `阶段已收尾，下一项可交接到已有后续任务：${nextSuccessor.title}。`,
      recordNeeded: true,
      nextTaskId: nextSuccessor.id,
      nextTaskKind: 'existing_successor',
      criteriaTotal: criteria.total,
      criteriaSatisfied: criteria.satisfied,
      criteriaOpen: criteria.open,
      runVerificationTone: 'pass',
      runVerificationLabel: '阶段收尾检查：交接到后续任务',
      runVerificationDetail: `已找到可交接后续任务：${nextSuccessor.title}`,
    };
  }

  if (input.intent === 'phase_closeout' && proposedFollowUps.length > 0) {
    const allHaveEvidence = proposedFollowUps.every((proposal) => (proposal.evidence ?? []).some((item) => item.trim()));
    return {
      outcome: 'needs_follow_up_confirmation',
      reason: allHaveEvidence
        ? `检测到 ${proposedFollowUps.length} 个新后续任务提议，创建前仍需要用户确认。`
        : `检测到 ${proposedFollowUps.length} 个新后续任务提议，但缺少明确证据，不能在阶段收尾中自动创建。`,
      recordNeeded: true,
      followUpProposalAllowed: allHaveEvidence,
      proposedFollowUpCount: proposedFollowUps.length,
      criteriaTotal: criteria.total,
      criteriaSatisfied: criteria.satisfied,
      criteriaOpen: criteria.open,
      runVerificationTone: 'warn',
      runVerificationLabel: '阶段收尾检查：后续任务需确认',
      runVerificationDetail: allHaveEvidence
        ? '新后续任务有证据，但仍需要用户确认后创建。'
        : '新后续任务缺少证据，阶段收尾只能记录提议，不能自动拆分。',
    };
  }

  if (criteria.open > 0) {
    return {
      outcome: 'continue_current_task',
      reason: `仍有 ${criteria.open} 条完成标准未满足。`,
      recordNeeded: true,
      criteriaTotal: criteria.total,
      criteriaSatisfied: criteria.satisfied,
      criteriaOpen: criteria.open,
      runVerificationTone: 'pending',
      runVerificationLabel: '阶段收尾检查：仍需继续',
      runVerificationDetail: `完成标准进度：${criteria.satisfied}/${criteria.total}`,
    };
  }

  if (isHighRisk(input.task.riskLevel)) {
    return {
      outcome: 'needs_user_confirmation',
      reason: `任务风险为 ${input.task.riskLevel}，完成或交接前需要用户确认。`,
      recordNeeded: true,
      criteriaTotal: criteria.total,
      criteriaSatisfied: criteria.satisfied,
      criteriaOpen: criteria.open,
      runVerificationTone: 'warn',
      runVerificationLabel: '阶段收尾检查：需要确认',
      runVerificationDetail: `风险等级：${input.task.riskLevel}`,
    };
  }

  return {
    outcome: 'ready_to_complete',
    reason: '没有未满足完成标准、阻塞项、依赖项或可交接子任务。',
    recordNeeded: true,
    criteriaTotal: criteria.total,
    criteriaSatisfied: criteria.satisfied,
    criteriaOpen: criteria.open,
    runVerificationTone: 'pass',
    runVerificationLabel: '阶段收尾检查：可完成',
    runVerificationDetail: '当前任务已具备完成候选条件。',
  };
}
