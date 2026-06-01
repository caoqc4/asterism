import type { DecisionRecord } from './types/decision.js';
import type { TaskListItemRecord } from './types/task.js';
import { groupDecisionEffects } from './decision-effect-evaluator.js';

export type DecisionCategoryKey = 'agent' | 'risk' | 'completion' | 'direction';

export type DecisionCategory = {
  key: DecisionCategoryKey;
  label: string;
  tone: 'agent' | 'risk' | 'completion' | 'direction';
};

export type DecisionJudgmentContext = {
  whyNow: string;
  ifDeferred: string;
};

export type DecisionJudgmentOption = {
  label: string;
  desc: string;
  risk?: string;
};

export type DecisionJudgmentSourceKind =
  | 'task'
  | 'run'
  | 'agent_checkpoint'
  | 'tool'
  | 'external_access'
  | 'workspace'
  | 'system'
  | 'manual'
  | 'global';

export type DecisionJudgmentSourceTarget = {
  kind: DecisionJudgmentSourceKind;
  id: string | null;
  label: string;
  taskId: string | null;
  routeHint: 'open_task' | 'open_run' | 'resume_checkpoint' | 'review_source' | 'none';
};

export type DecisionJudgmentProjection = {
  id: string;
  taskId: string;
  title: string;
  taskTitle: string;
  taskStateLabel: string;
  taskSignal: string;
  sourceLabel: string;
  sourceTarget: DecisionJudgmentSourceTarget;
  sourceKindLabel: string;
  sourceActionLabel: string | null;
  typeLabel: string;
  boundaryLabel: string;
  updatedLabel: string;
  lane: string;
  urgency: 'today' | 'week';
  deadline?: string;
  category: DecisionCategory;
  context: DecisionJudgmentContext;
  options: DecisionJudgmentOption[];
  recommendation: string;
  recommendationClarity: 'clear' | 'review';
  recommendationReason: string | null;
  impactLabel: string;
  reversibilityLabel: string;
  sortScore: number;
  group: DecisionJudgmentGroup;
};

export type DecisionJudgmentGroup = {
  key: string;
  label: string;
  pendingCount: number;
  effectLabel: string;
  effectDetail: string;
  decisionIds: string[];
};

export function projectDecisionJudgment(
  decision: DecisionRecord,
  task: TaskListItemRecord | null,
  group?: DecisionJudgmentGroup,
): DecisionJudgmentProjection {
  const isAgentCheckpoint = decision.sourceType === 'agent_checkpoint';
  const isPatchPromotion = isPatchPromotionDecision(decision);
  const category = classifyDecisionJudgment(decision, task);
  const taskTitle = task?.title ?? decision.sourceLabel ?? decision.sourceId ?? '全局事项';
  const sourceTarget = buildDecisionSourceTarget(decision, task);
  const fallbackOptions = isPatchPromotion
    ? [
        {
          label: '批准 reviewed patch',
          desc: '批准仅覆盖当前 workspace.staged_patch；feature flag 开启时才会先做 promotion preflight，再写入匹配的工作区文件。',
          risk: '可能写入工作区',
        },
        { label: '暂停等待', desc: '暂缓处理，保留检查点；工作区保持不变，等补充审查后再决定。' },
        { label: '取消本次执行', desc: '取消这次 patch promotion 请求，不把 sandbox patch 写入工作区。' },
      ]
    : isAgentCheckpoint
    ? [
        { label: '恢复执行', desc: '确认当前检查点，让 Agent 按当前上下文继续推进；这不会授予后续同类动作的长期权限。' },
        { label: '暂停等待', desc: '暂缓处理，保留检查点，等补充信息后再恢复。' },
        { label: '取消本次执行', desc: '取消这次检查点请求，不自动继续当前执行。' },
      ]
    : [
        { label: category.key === 'completion' ? '确认完成' : '批准', desc: optionApproveDescription(category) },
        { label: '稍后再定', desc: '暂缓处理，任务会回到等待状态。' },
        { label: '取消', desc: '取消这次决策请求，不改变任务当前执行状态。' },
      ];
  const options = decision.options?.length
    ? decision.options.map((option) => ({
        label: option.label,
        desc: option.description ?? option.risk ?? '按此方案处理，并记录这次拍板。',
        risk: option.risk ?? undefined,
      }))
    : fallbackOptions;
  const recommendation = decision.recommendation?.label
    ?? (isPatchPromotion ? '批准 reviewed patch' : isAgentCheckpoint ? '恢复执行' : category.key === 'completion' ? '确认完成' : '批准');

  return {
    id: decision.id,
    taskId: decision.taskId ?? '',
    title: decision.title,
    taskTitle,
    taskStateLabel: task ? formatTaskState(task.state) : '未关联到当前任务',
    taskSignal: buildTaskSignal(task),
    sourceLabel: sourceTarget.label,
    sourceTarget,
    sourceKindLabel: formatDecisionSourceKind(sourceTarget.kind),
    sourceActionLabel: sourceActionLabelFor(sourceTarget),
    typeLabel: formatDecisionType(decision.sourceType),
    boundaryLabel: boundaryLabelFor(category, sourceTarget),
    updatedLabel: `更新 ${formatDecisionDate(decision.updatedAt)}`,
    lane: 'continue',
    urgency: isAgentCheckpoint ? 'today' : 'week',
    category,
    context: {
      whyNow: isPatchPromotion
        ? `Agent 已产出「${decision.sourceLabel ?? 'workspace.staged_patch'}」sandbox patch，需要你确认是否提升；只有启用 apply flag 时，批准才会先预检再写入匹配文件。`
        : isAgentCheckpoint
        ? `Agent 在「${decision.sourceLabel ?? decision.title}」的执行检查点暂停，需要你确认是否恢复推进。`
        : decision.context?.whyNow ?? buildWhyNow(decision, task, category),
      ifDeferred: isPatchPromotion
        ? '如果暂不处理，Agent 会保持暂停，sandbox patch 只留作证据，工作区文件不会被写入。'
        : isAgentCheckpoint
        ? '如果暂不处理，Agent 会保持暂停，相关任务不会自动继续执行。'
        : decision.context?.ifDeferred ?? buildDeferredImpact(task, category),
    },
    options,
    recommendation,
    recommendationClarity: isAgentCheckpoint ? 'review' : 'clear',
    recommendationReason: decision.recommendation?.reason ?? null,
    impactLabel: decision.context?.impact ?? (isPatchPromotion ? '工作区写入影响' : impactLabelFor(category, task)),
    reversibilityLabel: decision.context?.reversibility ?? (isPatchPromotion ? '需预检留痕' : reversibilityLabelFor(category)),
    sortScore: scoreDecision(decision, task, category),
    group: group ?? {
      key: decision.taskId
        ? `task:${decision.taskId}`
        : decision.sourceType && decision.sourceId
          ? `source:${decision.sourceType}:${decision.sourceId}`
          : 'global',
      label: taskTitle,
      pendingCount: 1,
      effectLabel: '待拍板阻断',
      effectDetail: '这条决策需要用户拍板后才能继续。',
      decisionIds: [decision.id],
    },
  };
}

function buildDecisionSourceTarget(
  decision: DecisionRecord,
  task: TaskListItemRecord | null,
): DecisionJudgmentSourceTarget {
  const taskId = decision.taskId ?? task?.id ?? null;

  if (decision.sourceType === 'agent_checkpoint') {
    return {
      kind: 'agent_checkpoint',
      id: decision.sourceId ?? null,
      label: decision.sourceLabel ?? decision.sourceId ?? 'Agent 检查点',
      taskId,
      routeHint: 'resume_checkpoint',
    };
  }

  if (decision.sourceType === 'run') {
    return {
      kind: 'run',
      id: decision.sourceId ?? null,
      label: decision.sourceLabel ?? decision.sourceId ?? '执行记录',
      taskId,
      routeHint: decision.sourceId ? 'open_run' : taskId ? 'open_task' : 'none',
    };
  }

  if (decision.sourceType === 'tool') {
    return {
      kind: 'tool',
      id: decision.sourceId ?? null,
      label: decision.sourceLabel ?? decision.sourceId ?? '工具调用',
      taskId,
      routeHint: taskId ? 'open_task' : 'none',
    };
  }

  if (decision.sourceType === 'external_access' || decision.scope === 'external_access') {
    return {
      kind: 'external_access',
      id: decision.sourceId ?? null,
      label: decision.sourceLabel ?? '外部访问',
      taskId,
      routeHint: 'review_source',
    };
  }

  if (decision.sourceType === 'workspace' || decision.scope === 'workspace') {
    return {
      kind: 'workspace',
      id: decision.sourceId ?? null,
      label: decision.sourceLabel ?? decision.sourceId ?? '工作区操作',
      taskId,
      routeHint: taskId ? 'open_task' : 'review_source',
    };
  }

  if (decision.sourceType === 'system' || decision.scope === 'system') {
    return {
      kind: 'system',
      id: decision.sourceId ?? null,
      label: decision.sourceLabel ?? '系统事项',
      taskId,
      routeHint: taskId ? 'open_task' : 'none',
    };
  }

  if (taskId) {
    return {
      kind: 'task',
      id: taskId,
      label: decision.sourceLabel ?? task?.title ?? decision.title,
      taskId,
      routeHint: 'open_task',
    };
  }

  return {
    kind: decision.sourceType === 'manual' ? 'manual' : 'global',
    id: decision.sourceId ?? null,
    label: decision.sourceLabel ?? decision.sourceId ?? '全局拍板',
    taskId: null,
    routeHint: 'none',
  };
}

export function projectDecisionJudgments(
  decisions: DecisionRecord[],
  tasksById: Map<string, TaskListItemRecord>,
): DecisionJudgmentProjection[] {
  const pendingDecisions = decisions.filter((decision) => decision.status === 'pending');
  const groupByDecisionId = new Map<string, DecisionJudgmentGroup>();

  for (const group of groupDecisionEffects(pendingDecisions)) {
    const taskTitle = group.taskId ? tasksById.get(group.taskId)?.title : null;
    const projectedGroup: DecisionJudgmentGroup = {
      key: group.key,
      label: taskTitle ?? group.label,
      pendingCount: group.summary.pendingCount,
      effectLabel: group.summary.effectLabel,
      effectDetail: group.summary.effectDetail,
      decisionIds: group.decisionIds,
    };
    for (const decisionId of group.decisionIds) {
      groupByDecisionId.set(decisionId, projectedGroup);
    }
  }

  return pendingDecisions
    .map((decision) => projectDecisionJudgment(
      decision,
      decision.taskId ? tasksById.get(decision.taskId) ?? null : null,
      groupByDecisionId.get(decision.id),
    ))
    .sort((left, right) => (
      right.sortScore - left.sortScore
      || right.updatedLabel.localeCompare(left.updatedLabel)
    ));
}

export function classifyDecisionJudgment(
  decision: DecisionRecord,
  task: TaskListItemRecord | null,
): DecisionCategory {
  if (isPatchPromotionDecision(decision)) {
    return { key: 'risk', label: '工作区写入', tone: 'risk' };
  }
  if (decision.kind === 'agent_resume' || decision.scope === 'agent') {
    return { key: 'agent', label: 'Agent 暂停', tone: 'agent' };
  }
  if (
    decision.kind === 'risk_approval'
    || decision.kind === 'external_write'
    || decision.scope === 'external_access'
    || decision.scope === 'workspace'
  ) {
    return { key: 'risk', label: decision.kind === 'external_write' ? '外部写入' : '风险确认', tone: 'risk' };
  }
  if (decision.kind === 'completion_acceptance') {
    return { key: 'completion', label: '完成验收', tone: 'completion' };
  }
  if (decision.sourceType === 'agent_checkpoint') {
    return { key: 'agent', label: 'Agent 暂停', tone: 'agent' };
  }
  const text = `${decision.title} ${decision.sourceLabel ?? ''}`.toLowerCase();
  if (task?.riskLevel === 'high' || text.includes('写入') || text.includes('promotion') || text.includes('权限')) {
    return { key: 'risk', label: '风险确认', tone: 'risk' };
  }
  if (text.includes('完成') || text.includes('验收') || text.includes('交付')) {
    return { key: 'completion', label: '完成验收', tone: 'completion' };
  }
  return { key: 'direction', label: '方向拍板', tone: 'direction' };
}

function buildWhyNow(
  decision: DecisionRecord,
  task: TaskListItemRecord | null,
  category: DecisionCategory,
): string {
  const subject = task?.title ?? decision.sourceLabel ?? decision.title;
  if (category.key === 'risk') {
    return `「${subject}」涉及高影响或外部写入，需要你确认风险边界后再继续。`;
  }
  if (category.key === 'completion') {
    return `「${subject}」进入验收节点，需要你确认是否可以作为完成状态记录。`;
  }
  if (task?.activeBlocker) {
    return `「${subject}」当前有阻塞，拍板结果会决定下一步是继续推进、补充信息还是暂停。`;
  }
  return `这次拍板会决定「${subject}」是否按当前方向继续推进。`;
}

function buildDeferredImpact(task: TaskListItemRecord | null, category: DecisionCategory): string {
  if (category.key === 'risk') return '如果暂不处理，相关高风险动作不会继续执行，任务保持等待人工确认。';
  if (category.key === 'completion') return '如果暂不处理，任务不会进入完成状态，后续仍会保留为待验收。';
  if (task?.activeBlocker) return '如果暂不处理，阻塞不会解除，依赖它的后续任务也不应自动推进。';
  return '如果暂不处理，相关任务会继续停留在等待拍板状态，后续执行不应自动推进。';
}

function optionApproveDescription(category: DecisionCategory): string {
  if (category.key === 'risk') return '确认当前风险可以接受，并记录这次授权范围。';
  if (category.key === 'completion') return '确认当前结果达到完成标准，并记录这次验收。';
  return '按当前建议继续推进，并记录这次拍板。';
}

function scoreDecision(
  decision: DecisionRecord,
  task: TaskListItemRecord | null,
  category: DecisionCategory,
): number {
  let score = category.key === 'agent' ? 50 : category.key === 'risk' ? 40 : category.key === 'completion' ? 30 : 20;
  if (task?.activeBlocker) score += 6;
  if (task?.riskLevel === 'high') score += 5;
  if (decision.sourceType === 'agent_checkpoint') score += 4;
  return score;
}

function impactLabelFor(category: DecisionCategory, task: TaskListItemRecord | null): string {
  if (category.key === 'agent' || category.key === 'risk' || task?.riskLevel === 'high') return '高影响';
  if (category.key === 'completion') return '交付影响';
  return '中影响';
}

function reversibilityLabelFor(category: DecisionCategory): string {
  if (category.key === 'agent') return '需谨慎恢复';
  if (category.key === 'risk') return '需留痕';
  if (category.key === 'completion') return '可复核';
  return '可回退';
}

function buildTaskSignal(task: TaskListItemRecord | null): string {
  if (!task) return '这条决策没有匹配到当前任务，仍可在这里处理。';
  if (task.activeBlocker) return `阻塞：${task.activeBlocker.title}`;
  if (task.activeDependency) return `依赖：${task.activeDependency.blockedByTaskTitle ?? task.activeDependency.blockedByTaskId}`;
  if (task.activeWaitingItem) return `等待：${task.activeWaitingItem.reason}`;
  if (task.nextStep) return `下一步：${task.nextStep}`;
  return task.summary ?? '暂无更多任务上下文。';
}

function formatTaskState(state: TaskListItemRecord['state']): string {
  const labels: Record<TaskListItemRecord['state'], string> = {
    captured: '待明确',
    triaged: '已整理',
    planned: '推进中',
    running: '执行中',
    waiting_external: '等待中',
    completed: '已完成',
    archived: '已归档',
  };
  return labels[state];
}

function formatDecisionType(sourceType: DecisionRecord['sourceType']): string {
  if (sourceType === 'agent_checkpoint') return 'Agent 检查点';
  if (sourceType === 'external_access') return '外部授权';
  if (sourceType === 'workspace') return '工作区操作';
  if (sourceType === 'run') return '执行记录';
  if (sourceType === 'tool') return '工具调用';
  if (sourceType === 'system') return '系统事项';
  return '人工决策';
}

function formatDecisionSourceKind(kind: DecisionJudgmentSourceKind): string {
  const labels: Record<DecisionJudgmentSourceKind, string> = {
    task: '任务上下文',
    run: '执行记录',
    agent_checkpoint: 'Agent 检查点',
    tool: '工具调用',
    external_access: '外部访问',
    workspace: '工作区',
    system: '系统事项',
    manual: '人工录入',
    global: '全局事项',
  };
  return labels[kind];
}

function sourceActionLabelFor(sourceTarget: DecisionJudgmentSourceTarget): string | null {
  if (!sourceTarget.taskId) return null;
  if (sourceTarget.routeHint === 'resume_checkpoint') return '查看任务上下文';
  if (sourceTarget.routeHint === 'open_run') return '查看关联任务';
  if (sourceTarget.routeHint === 'review_source') return '查看来源任务';
  if (sourceTarget.routeHint === 'open_task') return '查看任务';
  return null;
}

function boundaryLabelFor(
  category: DecisionCategory,
  sourceTarget: DecisionJudgmentSourceTarget,
): string {
  if (isPatchPromotionSource(sourceTarget)) {
    return '批准仅覆盖当前 reviewed patch；只有 apply flag 开启时才会写入匹配工作区文件';
  }
  if (category.key === 'agent') return '批准后仅恢复当前检查点，不授予长期权限';
  if (category.key === 'risk') return '批准后仅记录本次授权范围';
  if (category.key === 'completion') return '批准后可作为完成验收依据';
  if (sourceTarget.kind === 'global') return '只影响当前全局拍板事项';
  return '批准后只影响当前任务方向';
}

function formatDecisionDate(value: string): string {
  return value.slice(0, 10);
}

function isPatchPromotionDecision(decision: DecisionRecord): boolean {
  const text = `${decision.title} ${decision.sourceLabel ?? ''}`.toLowerCase();
  return decision.sourceLabel === 'workspace.staged_patch'
    || text.includes('workspace.staged_patch')
    || text.includes('patch promotion')
    || text.includes('sandbox patch');
}

function isPatchPromotionSource(sourceTarget: DecisionJudgmentSourceTarget): boolean {
  const label = sourceTarget.label.toLowerCase();
  return label === 'workspace.staged_patch'
    || label.includes('workspace.staged_patch')
    || label.includes('patch promotion')
    || label.includes('sandbox patch');
}
