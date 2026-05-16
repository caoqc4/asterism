import type { DecisionRecord } from './types/decision.js';
import type { TaskListItemRecord } from './types/task.js';

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

export type DecisionJudgmentProjection = {
  id: string;
  taskId: string;
  title: string;
  taskTitle: string;
  taskStateLabel: string;
  taskSignal: string;
  sourceLabel: string;
  typeLabel: string;
  updatedLabel: string;
  lane: string;
  urgency: 'today' | 'week';
  deadline?: string;
  category: DecisionCategory;
  context: DecisionJudgmentContext;
  options: DecisionJudgmentOption[];
  recommendation: string;
  recommendationClarity: 'clear' | 'review';
  impactLabel: string;
  reversibilityLabel: string;
  sortScore: number;
};

export function projectDecisionJudgment(
  decision: DecisionRecord,
  task: TaskListItemRecord | null,
): DecisionJudgmentProjection {
  const isAgentCheckpoint = decision.sourceType === 'agent_checkpoint';
  const category = classifyDecisionJudgment(decision, task);
  const taskTitle = task?.title ?? decision.sourceLabel ?? decision.sourceId ?? '全局事项';
  const fallbackOptions = isAgentCheckpoint
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
    ?? (isAgentCheckpoint ? '恢复执行' : category.key === 'completion' ? '确认完成' : '批准');

  return {
    id: decision.id,
    taskId: decision.taskId ?? '',
    title: decision.title,
    taskTitle,
    taskStateLabel: task ? formatTaskState(task.state) : '未关联到当前任务',
    taskSignal: buildTaskSignal(task),
    sourceLabel: decision.sourceLabel ?? decision.sourceId ?? taskTitle,
    typeLabel: formatDecisionType(decision.sourceType),
    updatedLabel: `更新 ${formatDecisionDate(decision.updatedAt)}`,
    lane: 'continue',
    urgency: isAgentCheckpoint ? 'today' : 'week',
    category,
    context: {
      whyNow: isAgentCheckpoint
        ? `Agent 在「${decision.sourceLabel ?? decision.title}」的执行检查点暂停，需要你确认是否恢复推进。`
        : decision.context?.whyNow ?? buildWhyNow(decision, task, category),
      ifDeferred: isAgentCheckpoint
        ? '如果暂不处理，Agent 会保持暂停，相关任务不会自动继续执行。'
        : decision.context?.ifDeferred ?? buildDeferredImpact(task, category),
    },
    options,
    recommendation,
    recommendationClarity: isAgentCheckpoint ? 'review' : 'clear',
    impactLabel: impactLabelFor(category, task),
    reversibilityLabel: reversibilityLabelFor(category),
    sortScore: scoreDecision(decision, task, category),
  };
}

export function classifyDecisionJudgment(
  decision: DecisionRecord,
  task: TaskListItemRecord | null,
): DecisionCategory {
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

function formatDecisionDate(value: string): string {
  return value.slice(0, 10);
}
