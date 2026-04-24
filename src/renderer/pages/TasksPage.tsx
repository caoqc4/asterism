import { Fragment, useEffect, useRef, useState } from 'react';

import type { RecommendedActionIntent } from '@shared/types/brief';
import type {
  BlockerKind,
  BlockerRecord,
  CreateBlockerInput,
  UpdateBlockerInput,
} from '@shared/types/blocker';
import type {
  CompletionCriteriaRecord,
  CreateCompletionCriteriaInput,
  UpdateCompletionCriteriaInput,
} from '@shared/types/completion-criteria';
import type { ResponsibilityKind } from '@shared/types/responsibility';
import type {
  CreateTaskDependencyInput,
  TaskDependencyRecord,
  UpdateTaskDependencyInput,
} from '@shared/types/task-dependency';
import type { CreateDecisionInput, DecisionDraftRecord, DecisionRecord } from '@shared/types/decision';
import type {
  ApplyProcessTemplateInput,
  AppliedProcessTemplateRecord,
  CreateProcessTemplateInput,
  ProcessTemplateKind,
  ProcessTemplateRecord,
  UpdateProcessTemplateInput,
} from '@shared/types/process-template';
import type { CreateRunInput, RunRecord } from '@shared/types/run';
import type {
  CreateSourceContextInput,
  SourceContextKind,
  SourceContextRecord,
  UpdateSourceContextInput,
} from '@shared/types/source-context';
import type {
  CreateTaskInput,
  TaskDetail,
  TaskListItemRecord,
  TaskRiskLevel,
  TaskState,
  TimelineEventRecord,
  UpdateTaskInput,
} from '@shared/types/task';
import {
  formatTaskTimelineEventSummary,
  getTaskTimelineEventLabel,
  getTaskTimelineFollowUpActionLabel,
  getTaskTimelineLane,
  getTaskTimelineLaneLabel,
  getTaskTimelineObjectAction,
  getTaskTimelinePreviewEvents,
  getTaskTimelinePriority,
  getTaskTimelinePriorityLabel,
  getTaskTimelineResponsibilitySummary,
  groupTaskTimelineEventsByPriority,
  interpretTaskTimelineEvent,
} from '@shared/working-context/timeline';
import { formatBlockerAgeLabel } from '@shared/working-context/blocker';
import type { PriorityLane } from '@shared/types/brief';
import { getPriorityLaneContextLabel, getPriorityLaneLabel } from '@shared/working-context/priority-lanes';
import {
  formatDependencyAgeLabel,
  getDependencyAgeReason,
  isStaleDependency,
} from '@shared/working-context/dependency';
import {
  getCompletionTransitionGuidance,
  getTaskTransitionGuidance,
  orderTaskTransitions,
} from '@shared/working-context/transitions';

const riskOptions: TaskRiskLevel[] = ['none', 'low', 'medium', 'high'];
const sourceContextKindOptions: SourceContextKind[] = [
  'link',
  'doc',
  'issue',
  'pr',
  'website_list',
  'note',
];
const processTemplateKindOptions: ProcessTemplateKind[] = [
  'skill',
  'workflow',
  'sop',
  'checklist',
];
const blockerKindOptions: BlockerKind[] = [
  'external_person',
  'external_team',
  'approval',
  'document_or_material',
  'system_or_tool',
  'other',
];

const responsibilityOptions: ResponsibilityKind[] = [
  'self',
  'external_person',
  'external_team',
  'upstream_task',
  'shared',
  'unknown',
];

const transitionOptions: Record<TaskState, TaskState[]> = {
  captured: ['triaged', 'planned', 'archived'],
  triaged: ['planned', 'archived'],
  planned: ['running', 'waiting_external', 'completed', 'archived'],
  running: ['planned', 'waiting_external', 'completed', 'archived'],
  waiting_external: ['planned', 'running', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

const TIMELINE_PREVIEW_COUNT = 5;
const COMPLETION_EVIDENCE_LIMIT = 3;

type CompletionEvidenceCard = {
  id: string;
  type: 'decision' | 'run' | 'artifact';
  title: string;
  detail: string;
  responsibilityGuidance: string | null;
  matchedCriteria: string[];
  matchedCriteriaIds: string[];
  targetId: string | null;
};

function isEarlyTask(task: Pick<TaskListItemRecord, 'state'>): boolean {
  return task.state === 'captured' || task.state === 'triaged';
}

function getTaskCardSummary(task: TaskListItemRecord): string {
  if (task.dependencyReevaluation) {
    return task.dependencyReevaluation.status === 'upstream_ready'
      ? '上游任务已完成，建议重新判断是否解除依赖。'
      : '上游任务刚解除关键阻塞，建议重新判断是否解除依赖。';
  }

  if (task.summary?.trim()) {
    return task.summary;
  }

  if (task.activeDependency?.blockedByTaskTitle) {
    return `当前依赖上游任务：${task.activeDependency.blockedByTaskTitle}。`;
  }

  if (isEarlyTask(task)) {
    return task.state === 'captured'
      ? '刚进入系统，先补一句任务摘要。'
      : '刚完成初步整理，先补清摘要与下一步。';
  }

  return task.id;
}

function getTaskCardNextMoveHint(task: TaskListItemRecord): string | null {
  if (task.dependencyReevaluation) {
    return task.dependencyReevaluation.status === 'upstream_ready'
      ? '重判重点：确认上游任务已完成后，这条任务是否可以恢复推进。'
      : '重判重点：先确认上游阻塞是否已足够解除，再决定是否恢复推进。';
  }

  if (task.activeDependency?.blockedByTaskTitle) {
    return `解阻塞重点：先推动上游任务“${task.activeDependency.blockedByTaskTitle}”，再恢复这条任务。`;
  }

  if (task.nextStep) {
    return `下一步：${task.nextStep}`;
  }

  if (isEarlyTask(task)) {
    return task.state === 'captured'
      ? '整理重点：先补一句任务摘要，再明确下一步。'
      : '整理重点：先补清下一步，并判断是否需要拍板或执行。';
  }

  return null;
}

function getTaskCardTone(task: TaskListItemRecord): string {
  if (task.riskLevel === 'high') {
    return 'task-card-danger';
  }

  if (task.state === 'waiting_external' || task.waitingReason) {
    return 'task-card-warning';
  }

  if (!task.nextStep && !['completed', 'archived'].includes(task.state)) {
    return 'task-card-muted';
  }

  return '';
}

function buildTaskBadges(task: TaskListItemRecord): string[] {
  const badges: string[] = [];

  if (task.riskLevel !== 'none') {
    badges.push(`risk:${task.riskLevel}`);
  }

  if (task.state === 'waiting_external' || task.waitingReason) {
    badges.push('waiting');
  }

  if (!task.nextStep && !['completed', 'archived'].includes(task.state)) {
    badges.push('next-step?');
  }

  return badges;
}

function safeParsePayload(payload: string | null): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeCompletionText(value: string): string {
  return value.trim().toLowerCase();
}

function buildCompletionKeywords(value: string): string[] {
  return normalizeCompletionText(value)
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function findMatchedCompletionCriteria(
  criteria: CompletionCriteriaRecord[],
  evidenceTexts: string[],
): string[] {
  const openCriteria = criteria.filter((item) => item.status === 'open');

  if (openCriteria.length === 0) {
    return [];
  }

  if (openCriteria.length === 1) {
    return [openCriteria[0]!.text];
  }

  const haystack = evidenceTexts.map(normalizeCompletionText).join(' ');

  const matched = openCriteria.filter((item) => {
    const normalized = normalizeCompletionText(item.text);

    if (normalized && haystack.includes(normalized)) {
      return true;
    }

    const keywords = buildCompletionKeywords(item.text);
    return keywords.some((keyword) => haystack.includes(keyword));
  });

  return matched.map((item) => item.text);
}

function findMatchedCompletionCriteriaIds(
  criteria: CompletionCriteriaRecord[],
  evidenceTexts: string[],
): string[] {
  const openCriteria = criteria.filter((item) => item.status === 'open');

  if (openCriteria.length === 0) {
    return [];
  }

  if (openCriteria.length === 1) {
    return [openCriteria[0]!.id];
  }

  const haystack = evidenceTexts.map(normalizeCompletionText).join(' ');

  return openCriteria
    .filter((item) => {
      const normalized = normalizeCompletionText(item.text);

      if (normalized && haystack.includes(normalized)) {
        return true;
      }

      const keywords = buildCompletionKeywords(item.text);
      return keywords.some((keyword) => haystack.includes(keyword));
    })
    .map((item) => item.id);
}

function formatSourceContextKind(kind: SourceContextKind): string {
  switch (kind) {
    case 'doc':
      return '文档';
    case 'issue':
      return 'Issue';
    case 'pr':
      return 'PR';
    case 'website_list':
      return '网站列表';
    case 'note':
      return '备注';
    default:
      return '链接';
  }
}

function formatProcessTemplateKind(kind: ProcessTemplateKind): string {
  switch (kind) {
    case 'workflow':
      return '流程';
    case 'sop':
      return 'SOP';
    case 'checklist':
      return '清单';
    default:
      return 'Skill';
  }
}

function formatBlockerKind(kind: BlockerKind): string {
  switch (kind) {
    case 'external_person':
      return '外部个人';
    case 'external_team':
      return '外部团队';
    case 'approval':
      return '审批';
    case 'document_or_material':
      return '资料';
    case 'system_or_tool':
      return '系统/工具';
    default:
      return '其他';
  }
}

function formatResponsibilityKind(kind: ResponsibilityKind): string {
  switch (kind) {
    case 'self':
      return '自己推进';
    case 'external_person':
      return '外部个人推进';
    case 'external_team':
      return '外部团队推进';
    case 'upstream_task':
      return '上游任务推进';
    case 'shared':
      return '共同推进';
    default:
      return '责任待明确';
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '未填写';
  }

  return String(value);
}

function getTimelineToneClass(type: string): string {
  if (getTaskTimelinePriority(type) === 'p3') {
    return 'timeline-item-muted';
  }

  switch (type) {
    case 'task.decision_cancelled':
    case 'task.run_failed':
    case 'task.risk_changed':
      return 'timeline-item-risk';
    case 'task.decision_approved':
    case 'task.decision_deferred':
      return 'timeline-item-state';
    case 'task.run_completed':
      return 'timeline-item-state';
    case 'task.waiting_changed':
    case 'waiting_item.created':
    case 'waiting_item.updated':
    case 'waiting_item.resolved':
      return 'timeline-item-waiting';
    case 'artifact.created':
      return 'timeline-item-next-step';
    case 'source_context.created':
    case 'source_context.updated':
    case 'source_context.archived':
    case 'blocker.created':
    case 'blocker.updated':
    case 'blocker.resolved':
    case 'task_dependency.created':
    case 'task_dependency.updated':
    case 'task_dependency.resolved':
    case 'process_template.applied':
    case 'process_template.removed':
    case 'process_template.selected':
    case 'process_template.skipped':
      return 'timeline-item-default';
    case 'task.transitioned':
      return 'timeline-item-state';
    case 'task.next_step_changed':
      return 'timeline-item-next-step';
    default:
      return 'timeline-item-default';
  }
}

function formatTimelineSummary(event: TimelineEventRecord): string {
  return formatTaskTimelineEventSummary(event);
}

function getTimelineActionLabel(type: string): string | null {
  return getTaskTimelineFollowUpActionLabel(type);
}

function getTimelineObjectLabel(event: TimelineEventRecord): string | null {
  return getTaskTimelineObjectAction(event).label;
}

function buildQuickDecisionSeed(detail: TaskDetail, lane: PriorityLane | undefined): string {
  switch (lane) {
    case 'escalate_now':
      return detail.activeBlocker?.title
        ? `优先明确升级路径、责任归属和解除条件：${detail.activeBlocker.title}`
        : '优先明确升级路径和当前高风险事项的拍板点。';
    case 'unblock_or_decide':
      return detail.activeBlocker?.title
        ? `优先明确如何解除当前阻塞：${detail.activeBlocker.title}`
        : '优先明确当前需要拍板或解阻塞的关键点。';
    case 'continue_or_review':
      return detail.nextStep?.trim() || '围绕最近结果继续推进，并明确本轮需要复核的重点。';
    case 'clarify':
      return detail.activeWaitingItem?.reason ?? detail.waitingReason ?? '先补清当前下一步、等待条件或缺失信息。';
    default:
      return detail.nextStep ?? '';
  }
}

function buildQuickRunSeed(detail: TaskDetail, lane: PriorityLane | undefined): string {
  const explicitNextStep = detail.nextStep?.trim();
  const summary = detail.summary?.trim();

  switch (lane) {
    case 'escalate_now':
      return explicitNextStep
        ? `${explicitNextStep}\n\n本轮执行优先围绕升级处理当前高风险/阻塞，输出可直接用于推进的结果。`
        : '本轮执行优先围绕升级处理当前高风险/阻塞，输出可直接用于推进的结果。';
    case 'unblock_or_decide':
      return detail.activeBlocker?.title
        ? `请围绕当前阻塞“${detail.activeBlocker.title}”整理解阻塞所需输入、判断点和建议下一步。`
        : '请围绕当前拍板/解阻塞需要，整理关键信息、判断点和建议下一步。';
    case 'continue_or_review':
      return explicitNextStep
        ? `${explicitNextStep}\n\n请基于最近结果继续推进，并明确下一步可执行输出。`
        : '请基于最近结果继续推进，并明确下一步可执行输出。';
    case 'clarify':
      return detail.activeWaitingItem?.reason ?? detail.waitingReason
        ? `请先帮助澄清当前等待/缺口：${detail.activeWaitingItem?.reason ?? detail.waitingReason}`
        : '请先帮助补清下一步、等待条件或缺失上下文。';
    default:
      return explicitNextStep ?? summary ?? '';
  }
}

function getQuickDecisionGuidance(lane: PriorityLane | undefined): string {
  switch (lane) {
    case 'escalate_now':
      return '当前按「立即升级」语义，草拟更偏向明确升级路径、责任归属和拍板点。';
    case 'unblock_or_decide':
      return '当前按「先解阻塞/拍板」语义，草拟更偏向明确当前阻塞或待拍板的关键判断。';
    case 'continue_or_review':
      return '当前按「继续推进/复核」语义，草拟更偏向承接最近结果并组织下一步判断。';
    case 'clarify':
      return '当前按「先补清晰度」语义，草拟更偏向补清下一步、等待条件或缺失信息。';
    default:
      return '当前保持稳态推进，草拟会优先围绕现有下一步组织。';
  }
}

function getQuickDecisionResponsibilityGuidance(detail: TaskDetail | null): string | null {
  if (!detail) {
    return null;
  }

  const completionResponsibility = detail.resumeCard.completionStatus.nextOpenResponsibilitySummary?.trim();
  if (completionResponsibility) {
    return `如果这次拍板会影响收尾判断，也应顺手明确最后由谁确认完成标准。${completionResponsibility}`;
  }

  const blockerResponsibility = detail.resumeCard.currentBlocker.responsibilitySummary?.trim();
  if (detail.activeBlocker && blockerResponsibility) {
    return `如果这次拍板是为了解阻塞，也应顺手明确解除责任。${blockerResponsibility}`;
  }

  const dependencyResponsibility = detail.resumeCard.currentDependency?.responsibilitySummary?.trim();
  if (detail.activeDependency && dependencyResponsibility) {
    return `如果这次拍板会影响依赖链路，也应顺手明确由谁推动上游任务。${dependencyResponsibility}`;
  }

  return null;
}

function getCompletionEvidenceResponsibilityGuidance(
  responsibilitySummary: string | null | undefined,
): string | null {
  const actor = responsibilitySummary
    ?.trim()
    .replace(/^确认责任：/, '')
    .replace(/负责确认$/, '')
    .replace(/确认$/, '')
    .trim();

  if (!actor) {
    return null;
  }

  return `如果这条证据对应当前未满足标准，仍需由${actor}确认。`;
}

function getQuickRunGuidance(lane: PriorityLane | undefined): string {
  switch (lane) {
    case 'escalate_now':
      return '当前按「立即升级」语义，本轮 run 默认更偏向输出可直接用于升级处理的结果。';
    case 'unblock_or_decide':
      return '当前按「先解阻塞/拍板」语义，本轮 run 默认更偏向整理解阻塞或拍板所需输入。';
    case 'continue_or_review':
      return '当前按「继续推进/复核」语义，本轮 run 默认更偏向承接最近结果继续推进。';
    case 'clarify':
      return '当前按「先补清晰度」语义，本轮 run 默认更偏向补清下一步、等待条件或缺失上下文。';
    default:
      return '当前保持稳态推进，本轮 run 默认会围绕现有下一步或摘要展开。';
  }
}

function isEarlyTaskState(state: TaskState | undefined): boolean {
  return state === 'captured' || state === 'triaged';
}

function getPrimaryMoveConfig(detail: TaskDetail | null, lane: PriorityLane | undefined): Array<{
  id: 'detail' | 'decision' | 'run' | 'transition' | 'blocker' | 'dependency' | 'completion';
  label: string;
}> {
  if (!detail) {
    return [];
  }

  if (isEarlyTaskState(detail.state)) {
    return [
      { id: 'detail', label: '补摘要与下一步' },
      { id: 'decision', label: '判断是否需要拍板' },
    ];
  }

  if (detail.activeBlocker) {
    return [
      { id: 'blocker', label: '处理当前阻塞' },
      { id: 'transition', label: '调整任务状态' },
    ];
  }

  if (detail.activeDependency) {
    return [
      {
        id: 'dependency',
        label: detail.dependencyReevaluation ? '重新判断依赖' : '推动上游任务',
      },
      { id: 'transition', label: '调整任务状态' },
    ];
  }

  if (detail.resumeCard.completionStatus.total > 0) {
    return [
      {
        id: 'completion',
        label: detail.resumeCard.completionStatus.open === 0 ? '最终收尾判断' : '核对完成标准',
      },
      { id: 'transition', label: '调整任务状态' },
    ];
  }

  switch (lane) {
    case 'escalate_now':
    case 'unblock_or_decide':
      return [
        { id: 'decision', label: '草拟或创建 Decision' },
        { id: 'transition', label: '调整任务状态' },
      ];
    case 'continue_or_review':
      return [
        { id: 'run', label: '配置并触发 Run' },
        { id: 'transition', label: '调整任务状态' },
      ];
    case 'clarify':
      return [
        { id: 'detail', label: '补摘要与下一步' },
        { id: 'decision', label: '判断是否需要拍板' },
      ];
    default:
      return [
        { id: 'run', label: '配置并触发 Run' },
        { id: 'decision', label: '草拟或创建 Decision' },
      ];
  }
}

function getActionDeskStageGuidance(detail: TaskDetail | null): string {
  if (!detail) {
    return '先给当前最常用的三个入口，详细配置再放到下方，不把中层做成工具箱。';
  }

  if (isEarlyTaskState(detail.state)) {
    return '当前任务还在捕获/整理阶段，先补清摘要、下一步和是否需要拍板，再考虑执行动作。';
  }

  return '先给当前最值得处理的一到两个入口，详细配置再放到下方，不把中层做成工具箱。';
}

function getActionSetupGuidance(detail: TaskDetail | null): string {
  if (!detail) {
    return '需要补充上下文时，再使用这里的详细表单。';
  }

  if (isEarlyTaskState(detail.state)) {
    return '当前仍以整理任务为主，Run 放在补清摘要、下一步和拍板判断之后。';
  }

  return '需要补充上下文时，再使用这里的详细表单。';
}

function getActionSetupOrder(detail: TaskDetail | null, lane: PriorityLane | undefined): Array<'decision' | 'run'> {
  if (!detail) {
    return ['decision', 'run'];
  }

  if (isEarlyTaskState(detail.state)) {
    return ['decision', 'run'];
  }

  return lane === 'continue_or_review' || lane === 'steady' || !lane
    ? ['run', 'decision']
    : ['decision', 'run'];
}

function getDependencyReevaluationNextStep(detail: TaskDetail): string | null {
  if (!detail.activeDependency?.blockedByTaskTitle || !detail.dependencyReevaluation) {
    return null;
  }

  return detail.dependencyReevaluation.status === 'upstream_ready'
    ? `基于上游任务完成重新判断是否解除依赖：${detail.activeDependency.blockedByTaskTitle}`
    : `基于上游任务进展重新判断是否解除依赖：${detail.activeDependency.blockedByTaskTitle}`;
}

function getDependencyEscalationNextStep(detail: TaskDetail): string | null {
  if (!detail.activeDependency?.blockedByTaskTitle) {
    return null;
  }

  return `优先推动上游任务“${detail.activeDependency.blockedByTaskTitle}”，并重新判断是否解除对“${detail.title}”的依赖。`;
}

type TasksPageProps = {
  decisions: DecisionRecord[];
  focusedTaskRequest: {
    key: string;
    taskId: string;
    intent: RecommendedActionIntent | null;
  } | null;
  runs: RunRecord[];
  taskPriorityLanes: Map<string, PriorityLane>;
  tasks: TaskListItemRecord[];
  onApplyProcessTemplate: (input: ApplyProcessTemplateInput) => Promise<AppliedProcessTemplateRecord>;
  onArchiveProcessTemplate: (id: string) => Promise<ProcessTemplateRecord>;
  onCreateBlocker: (input: CreateBlockerInput) => Promise<BlockerRecord>;
  onCreateCompletionCriteria: (
    input: CreateCompletionCriteriaInput,
  ) => Promise<CompletionCriteriaRecord>;
  onCreateDecision: (input: CreateDecisionInput) => Promise<void>;
  onCreateTaskDependency: (input: CreateTaskDependencyInput) => Promise<TaskDependencyRecord>;
  onDraftDecision: (taskId: string, note?: string | null) => Promise<DecisionDraftRecord>;
  onCreateProcessTemplate: (input: CreateProcessTemplateInput) => Promise<ProcessTemplateRecord>;
  onCreateSourceContext: (input: CreateSourceContextInput) => Promise<SourceContextRecord>;
  onArchiveSourceContext: (id: string) => Promise<SourceContextRecord>;
  onOpenDecision: (decisionId: string) => void;
  onOpenRun: (runId: string) => void;
  onRefresh: () => Promise<void>;
  onReopenCompletionCriteria: (id: string) => Promise<CompletionCriteriaRecord>;
  onCreateTask: (input: CreateTaskInput) => Promise<TaskListItemRecord>;
  onRemoveProcessTemplate: (bindingId: string) => Promise<AppliedProcessTemplateRecord>;
  onResolveBlocker: (id: string) => Promise<BlockerRecord>;
  onResolveTaskDependency: (id: string) => Promise<TaskDependencyRecord>;
  onSatisfyCompletionCriteria: (id: string) => Promise<CompletionCriteriaRecord>;
  onTriggerRun: (input: CreateRunInput) => Promise<RunRecord>;
  onUpdateBlocker: (input: UpdateBlockerInput) => Promise<BlockerRecord>;
  onUpdateCompletionCriteria: (
    input: UpdateCompletionCriteriaInput,
  ) => Promise<CompletionCriteriaRecord>;
  onUpdateTaskDependency: (input: UpdateTaskDependencyInput) => Promise<TaskDependencyRecord>;
  onUpdateProcessTemplate: (input: UpdateProcessTemplateInput) => Promise<ProcessTemplateRecord>;
  onUpdateSourceContext: (input: UpdateSourceContextInput) => Promise<SourceContextRecord>;
  onUpdateTask: (input: UpdateTaskInput) => Promise<TaskListItemRecord>;
  onTransitionTask: (
    taskId: string,
    nextState: TaskState,
    waitingReason?: string,
  ) => Promise<TaskListItemRecord>;
  onTaskFocusConsumed: () => void;
};

export function TasksPage({
  decisions,
  focusedTaskRequest,
  runs,
  taskPriorityLanes,
  tasks,
  onApplyProcessTemplate,
  onArchiveProcessTemplate,
  onCreateBlocker,
  onCreateCompletionCriteria,
  onCreateDecision,
  onCreateTaskDependency,
  onDraftDecision,
  onCreateProcessTemplate,
  onCreateSourceContext,
  onArchiveSourceContext,
  onOpenDecision,
  onOpenRun,
  onRefresh,
  onReopenCompletionCriteria,
  onCreateTask,
  onRemoveProcessTemplate,
  onResolveBlocker,
  onResolveTaskDependency,
  onSatisfyCompletionCriteria,
  onTriggerRun,
  onUpdateBlocker,
  onUpdateCompletionCriteria,
  onUpdateTaskDependency,
  onUpdateProcessTemplate,
  onUpdateSourceContext,
  onUpdateTask,
  onTransitionTask,
  onTaskFocusConsumed,
}: TasksPageProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(tasks[0]?.id ?? null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftNextStep, setDraftNextStep] = useState('');
  const [draftWaitingReason, setDraftWaitingReason] = useState('');
  const [draftRiskLevel, setDraftRiskLevel] = useState<TaskRiskLevel>('none');
  const [draftRiskNote, setDraftRiskNote] = useState('');
  const [quickDecisionTitle, setQuickDecisionTitle] = useState('');
  const [quickDecisionNote, setQuickDecisionNote] = useState('');
  const [quickDecisionRationale, setQuickDecisionRationale] = useState<string | null>(null);
  const [quickRunType, setQuickRunType] = useState<CreateRunInput['type']>('draft');
  const [quickRunInstructions, setQuickRunInstructions] = useState('');
  const [transitionWaitingReason, setTransitionWaitingReason] = useState('');
  const [blockerEditingId, setBlockerEditingId] = useState<string | null>(null);
  const [blockerTitle, setBlockerTitle] = useState('');
  const [blockerKind, setBlockerKind] = useState<BlockerKind>('other');
  const [blockerDetail, setBlockerDetail] = useState('');
  const [blockerOwner, setBlockerOwner] = useState('');
  const [blockerResponsibility, setBlockerResponsibility] = useState<ResponsibilityKind>('unknown');
  const [blockerResponsibilityLabel, setBlockerResponsibilityLabel] = useState('');
  const [blockerSourceContextId, setBlockerSourceContextId] = useState('');
  const [blockerError, setBlockerError] = useState<string | null>(null);
  const [completionCriteriaEditingId, setCompletionCriteriaEditingId] = useState<string | null>(null);
  const [completionCriteriaFocusIds, setCompletionCriteriaFocusIds] = useState<string[]>([]);
  const [completionCriteriaText, setCompletionCriteriaText] = useState('');
  const [completionCriteriaResponsibility, setCompletionCriteriaResponsibility] = useState<ResponsibilityKind>('unknown');
  const [completionCriteriaResponsibilityLabel, setCompletionCriteriaResponsibilityLabel] = useState('');
  const [completionCriteriaError, setCompletionCriteriaError] = useState<string | null>(null);
  const [dependencyEditingId, setDependencyEditingId] = useState<string | null>(null);
  const [dependencyBlockedByTaskId, setDependencyBlockedByTaskId] = useState('');
  const [dependencyReason, setDependencyReason] = useState('');
  const [dependencyError, setDependencyError] = useState<string | null>(null);
  const [sourceContextEditingId, setSourceContextEditingId] = useState<string | null>(null);
  const [sourceContextTitle, setSourceContextTitle] = useState('');
  const [sourceContextKind, setSourceContextKind] = useState<SourceContextKind>('link');
  const [sourceContextIsKey, setSourceContextIsKey] = useState(false);
  const [sourceContextUri, setSourceContextUri] = useState('');
  const [sourceContextContent, setSourceContextContent] = useState('');
  const [sourceContextNote, setSourceContextNote] = useState('');
  const [sourceContextError, setSourceContextError] = useState<string | null>(null);
  const [processTemplateEditingId, setProcessTemplateEditingId] = useState<string | null>(null);
  const [processTemplateTitle, setProcessTemplateTitle] = useState('');
  const [processTemplateSummary, setProcessTemplateSummary] = useState('');
  const [processTemplateKind, setProcessTemplateKind] = useState<ProcessTemplateKind>('skill');
  const [processTemplateTags, setProcessTemplateTags] = useState('');
  const [processTemplateContent, setProcessTemplateContent] = useState('');
  const [processTemplateError, setProcessTemplateError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const detailFormRef = useRef<HTMLFormElement | null>(null);
  const quickActionsRef = useRef<HTMLDivElement | null>(null);
  const quickDecisionCardRef = useRef<HTMLFormElement | null>(null);
  const quickRunCardRef = useRef<HTMLFormElement | null>(null);
  const transitionCardRef = useRef<HTMLDivElement | null>(null);
  const blockerSectionRef = useRef<HTMLDivElement | null>(null);
  const completionCriteriaSectionRef = useRef<HTMLDivElement | null>(null);
  const dependencySectionRef = useRef<HTMLDivElement | null>(null);
  const sourceContextSectionRef = useRef<HTMLDivElement | null>(null);
  const processContextSectionRef = useRef<HTMLDivElement | null>(null);
  const resumeCurrentBlocker = detail?.resumeCard.currentBlocker ?? {
    blockerId: null,
    title: '暂无当前阻塞项',
    detail: null,
  };
  const resumeCurrentDependency = detail?.resumeCard.currentDependency ?? {
    dependencyId: null,
    title: '暂无任务依赖',
    detail: null,
  };
  const resumeCompletionStatus = detail?.resumeCard.completionStatus ?? {
    total: 0,
    satisfied: 0,
    open: 0,
    summary: '尚未定义完成标准',
  };
  const resumeLane = detail ? taskPriorityLanes.get(detail.id) : undefined;
  const resumeLaneLabel = getPriorityLaneContextLabel({
    lane: resumeLane,
    completionProgress: detail?.resumeCard.completionStatus,
  });
  const quickDecisionGuidance = getQuickDecisionGuidance(resumeLane);
  const quickDecisionResponsibilityGuidance = getQuickDecisionResponsibilityGuidance(detail);
  const quickRunGuidance = getQuickRunGuidance(resumeLane);
  const taskDecisions = detail
    ? decisions.filter((decision) => decision.taskId === detail.id)
    : [];
  const taskRuns = detail ? runs.filter((run) => run.taskId === detail.id) : [];
  const completionEvidenceCards: CompletionEvidenceCard[] = detail
    ? [
        ...taskDecisions
          .filter((decision) => decision.status === 'approved')
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 1)
          .map((decision) => ({
            id: `decision:${decision.id}`,
            type: 'decision' as const,
            title: decision.title,
            detail: '这条拍板结果可能说明某些完成标准已经具备。',
            responsibilityGuidance: getCompletionEvidenceResponsibilityGuidance(
              resumeCompletionStatus.nextOpenResponsibilitySummary,
            ),
            matchedCriteria: findMatchedCompletionCriteria(detail.completionCriteria, [
              decision.title,
              decision.status,
            ]),
            matchedCriteriaIds: findMatchedCompletionCriteriaIds(detail.completionCriteria, [
              decision.title,
              decision.status,
            ]),
            targetId: decision.id,
          })),
        ...taskRuns
          .filter((run) => run.status === 'completed' || run.status === 'failed')
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 1)
          .map((run) => ({
            id: `run:${run.id}`,
            type: 'run' as const,
            title: `${run.type} · ${run.status}`,
            detail:
              run.status === 'completed'
                ? '这次执行结果值得先对照当前未满足的完成标准。'
                : '这次执行虽然失败，但也可能说明某条完成标准仍未达成。',
            responsibilityGuidance: getCompletionEvidenceResponsibilityGuidance(
              resumeCompletionStatus.nextOpenResponsibilitySummary,
            ),
            matchedCriteria: findMatchedCompletionCriteria(detail.completionCriteria, [
              run.type,
              run.status,
              run.instructions ?? '',
              run.output ?? '',
              run.failureReason ?? '',
            ]),
            matchedCriteriaIds: findMatchedCompletionCriteriaIds(detail.completionCriteria, [
              run.type,
              run.status,
              run.instructions ?? '',
              run.output ?? '',
              run.failureReason ?? '',
            ]),
            targetId: run.id,
          })),
        ...detail.artifacts
          .slice(0, 1)
          .map((artifact) => ({
            id: `artifact:${artifact.id}`,
            type: 'artifact' as const,
            title: artifact.title,
            detail: '这份最近产物可能已经覆盖某条完成标准，值得先核对。',
            responsibilityGuidance: getCompletionEvidenceResponsibilityGuidance(
              resumeCompletionStatus.nextOpenResponsibilitySummary,
            ),
            matchedCriteria: findMatchedCompletionCriteria(detail.completionCriteria, [
              artifact.title,
              artifact.content,
            ]),
            matchedCriteriaIds: findMatchedCompletionCriteriaIds(detail.completionCriteria, [
              artifact.title,
              artifact.content,
            ]),
            targetId: artifact.sourceType === 'run' ? artifact.sourceId : null,
          })),
      ].slice(0, COMPLETION_EVIDENCE_LIMIT)
    : [];
  const transitionStates = detail
    ? orderTaskTransitions({
        currentState: detail.state,
        availableStates: transitionOptions[detail.state],
        lane: resumeLane,
        hasActiveBlocker: Boolean(detail.activeBlocker),
        hasPendingDecision: taskDecisions.some((decision) => decision.status === 'pending'),
        hasWaitingContext: Boolean(detail.activeWaitingItem || detail.waitingReason),
      })
    : [];
  const transitionGuidance = detail
    ? getTaskTransitionGuidance({
        currentState: detail.state,
        availableStates: transitionOptions[detail.state],
        lane: resumeLane,
        hasActiveBlocker: Boolean(detail.activeBlocker),
        hasPendingDecision: taskDecisions.some((decision) => decision.status === 'pending'),
        hasWaitingContext: Boolean(detail.activeWaitingItem || detail.waitingReason),
      })
    : null;
  const openCompletionCriteria = detail?.completionCriteria.filter((criteria) => criteria.status === 'open') ?? [];
  const completionTransitionGuidance = detail
    ? getCompletionTransitionGuidance({
        currentState: detail.state,
        availableStates: transitionStates,
        completionTotal: resumeCompletionStatus.total,
        completionOpen: resumeCompletionStatus.open,
        openCriteriaTexts: openCompletionCriteria.map((criteria) => criteria.text),
        nextOpenResponsibilitySummary: resumeCompletionStatus.nextOpenResponsibilitySummary,
      })
    : null;

  function updateDraftRiskLevel(nextRiskLevel: TaskRiskLevel) {
    setDraftRiskLevel(nextRiskLevel);

    if (detailError) {
      setDetailError(null);
    }

    if (
      nextRiskLevel !== 'high' &&
      detail?.riskLevel === 'high' &&
      draftRiskNote === (detail.riskNote ?? '')
    ) {
      setDraftRiskNote('');
    }
  }

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (!focusedTaskRequest) {
      return;
    }

    const taskExists = tasks.some((task) => task.id === focusedTaskRequest.taskId);

    if (taskExists) {
      setSelectedTaskId(focusedTaskRequest.taskId);
    }
  }, [focusedTaskRequest, tasks]);

  useEffect(() => {
    if (!focusedTaskRequest || !detail || focusedTaskRequest.taskId !== detail.id) {
      return;
    }

    const intent = focusedTaskRequest.intent;

    if (intent?.prefillNextStep !== undefined) {
      setDraftNextStep(intent.prefillNextStep ?? '');
    }

    if (intent?.prefillRunInstructions !== undefined) {
      setQuickRunInstructions(intent.prefillRunInstructions ?? '');
    }

    if (intent?.prefillRiskLevel) {
      setDraftRiskLevel(intent.prefillRiskLevel);
    }

    if (intent?.prefillRiskNote !== undefined) {
      setDraftRiskNote(intent.prefillRiskNote ?? '');
    }

    if (intent?.sourceContextId) {
      const matchedSourceContext = detail.sourceContexts.find(
        (item) => item.id === intent.sourceContextId,
      );

      if (matchedSourceContext) {
        populateSourceContextForm(matchedSourceContext);
      }
    }

    const focusTarget =
      intent?.type === 'focus_source_context'
        ? sourceContextSectionRef.current
        : intent?.focusArea === 'quick-actions'
          ? quickActionsRef.current
          : detailFormRef.current;

    if (typeof focusTarget?.scrollIntoView === 'function') {
      focusTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    onTaskFocusConsumed();
  }, [detail, focusedTaskRequest, onTaskFocusConsumed]);

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      if (!selectedTaskId) {
        setDetail(null);
        return;
      }

      const nextDetail = await window.api.getTaskDetail(selectedTaskId);

      if (mounted) {
        setDetail(nextDetail);
        setDraftTitle(nextDetail?.title ?? '');
        setDraftSummary(nextDetail?.summary ?? '');
        setDraftNextStep(nextDetail?.nextStep ?? '');
        setDraftWaitingReason(nextDetail?.waitingReason ?? '');
        setDraftRiskLevel(nextDetail?.riskLevel ?? 'none');
        setDraftRiskNote(nextDetail?.riskNote ?? '');
        setTransitionWaitingReason(nextDetail?.waitingReason ?? '');
        setBlockerEditingId(null);
        setBlockerTitle('');
        setBlockerKind('other');
        setBlockerDetail('');
        setBlockerOwner('');
        setBlockerSourceContextId('');
        setBlockerError(null);
        setDependencyEditingId(null);
        setDependencyBlockedByTaskId('');
        setDependencyReason('');
        setDependencyError(null);
        setCompletionCriteriaFocusIds([]);
        setSourceContextEditingId(null);
        setSourceContextTitle('');
        setSourceContextKind('link');
        setSourceContextIsKey(false);
        setSourceContextUri('');
        setSourceContextContent('');
        setSourceContextNote('');
        setSourceContextError(null);
        setProcessTemplateEditingId(null);
        setProcessTemplateTitle('');
        setProcessTemplateSummary('');
        setProcessTemplateKind('skill');
        setProcessTemplateTags('');
        setProcessTemplateContent('');
        setProcessTemplateError(null);
        setDetailError(null);
        setTransitionError(null);
        setShowAllTimeline(false);
        setQuickDecisionTitle(
          nextDetail ? `${nextDetail.title} 需要拍板` : '',
        );
        const nextLane = nextDetail ? taskPriorityLanes.get(nextDetail.id) : undefined;
        setQuickDecisionNote(nextDetail ? buildQuickDecisionSeed(nextDetail, nextLane) : '');
        setQuickDecisionRationale(null);
        setQuickRunInstructions(nextDetail ? buildQuickRunSeed(nextDetail, nextLane) : '');
      }
    }

    void loadDetail();

    return () => {
      mounted = false;
    };
  }, [selectedTaskId, taskPriorityLanes, tasks]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newTaskTitle.trim()) {
      return;
    }

    const created = await onCreateTask({ title: newTaskTitle.trim() });
    setNewTaskTitle('');
    setSelectedTaskId(created.id);
    await onRefresh();
  }

  async function handleSaveDetail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    if (draftRiskLevel === 'high' && !draftRiskNote.trim()) {
      setDetailError('将风险等级设为 high 前，请先填写风险说明。');
      return;
    }

    setDetailError(null);

    await onUpdateTask({
      id: detail.id,
      title: draftTitle,
      summary: draftSummary,
      nextStep: draftNextStep,
      waitingReason: draftWaitingReason,
      riskLevel: draftRiskLevel,
      riskNote: draftRiskNote,
    });

    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
  }

  async function handleTransition(nextState: TaskState) {
    if (!detail) {
      return;
    }

    if (nextState === 'waiting_external' && !transitionWaitingReason.trim()) {
      setTransitionError('转入 waiting_external 前，请先填写等待原因。');
      return;
    }

    setTransitionError(null);

    await onTransitionTask(detail.id, nextState, nextState === 'waiting_external' ? transitionWaitingReason : undefined);
    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
  }

  async function handleQuickDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail || !quickDecisionTitle.trim()) {
      return;
    }

    await onCreateDecision({
      taskId: detail.id,
      title: quickDecisionTitle.trim(),
    });
    setQuickDecisionTitle(`${detail.title} 需要拍板`);
    setQuickDecisionRationale(null);
    await onRefresh();
  }

  async function handleDraftQuickDecision() {
    if (!detail) {
      return;
    }

    const draft = await onDraftDecision(detail.id, quickDecisionNote.trim() || null);
    setQuickDecisionTitle(draft.title);
    setQuickDecisionRationale(
      `${draft.source === 'ai' ? 'AI 草拟' : 'Fallback 草拟'}：${draft.rationale}${
        draft.selectedTemplateTitles.length
          ? ` | 模板：${draft.selectedTemplateTitles.join('、')}`
          : ''
      }`,
    );
  }

  async function handleQuickRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    await onTriggerRun({
      taskId: detail.id,
      type: quickRunType,
      instructions: quickRunInstructions.trim(),
    });
    await onRefresh();
  }

  function populateBlockerForm(item: BlockerRecord) {
    setBlockerEditingId(item.id);
    setBlockerTitle(item.title);
    setBlockerKind(item.kind);
    setBlockerDetail(item.detail ?? '');
    setBlockerOwner(item.owner ?? '');
    setBlockerResponsibility(item.responsibility ?? 'unknown');
    setBlockerResponsibilityLabel(item.responsibilityLabel ?? '');
    setBlockerSourceContextId(item.sourceContextId ?? '');
    setBlockerError(null);
  }

  function resetBlockerForm() {
    setBlockerEditingId(null);
    setBlockerTitle('');
    setBlockerKind('other');
    setBlockerDetail('');
    setBlockerOwner('');
    setBlockerResponsibility('unknown');
    setBlockerResponsibilityLabel('');
    setBlockerSourceContextId('');
    setBlockerError(null);
  }

  function focusBlockerSection() {
    if (typeof blockerSectionRef.current?.scrollIntoView === 'function') {
      blockerSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function handleSaveBlocker(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    if (!blockerTitle.trim()) {
      setBlockerError('请先填写阻塞项标题。');
      return;
    }

    setBlockerError(null);

    if (blockerEditingId) {
      await onUpdateBlocker({
        id: blockerEditingId,
        title: blockerTitle,
        kind: blockerKind,
        detail: blockerDetail,
        owner: blockerOwner,
        responsibility: blockerResponsibility,
        responsibilityLabel: blockerResponsibilityLabel,
        sourceContextId: blockerSourceContextId || null,
      });
    } else {
      await onCreateBlocker({
        taskId: detail.id,
        title: blockerTitle,
        kind: blockerKind,
        detail: blockerDetail,
        owner: blockerOwner,
        responsibility: blockerResponsibility,
        responsibilityLabel: blockerResponsibilityLabel,
        sourceContextId: blockerSourceContextId || null,
      });
    }

    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));
    resetBlockerForm();
  }

  async function handleResolveCurrentBlocker(id: string) {
    if (!detail) {
      return;
    }

    await onResolveBlocker(id);
    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));

    if (blockerEditingId === id) {
      resetBlockerForm();
    }
  }

  function populateDependencyForm(item: TaskDependencyRecord) {
    setDependencyEditingId(item.id);
    setDependencyBlockedByTaskId(item.blockedByTaskId);
    setDependencyReason(item.reason ?? '');
    setDependencyError(null);
  }

  function resetDependencyForm() {
    setDependencyEditingId(null);
    setDependencyBlockedByTaskId('');
    setDependencyReason('');
    setDependencyError(null);
  }

  function focusDependencySection() {
    if (typeof dependencySectionRef.current?.scrollIntoView === 'function') {
      dependencySectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function populateCompletionCriteriaForm(item: CompletionCriteriaRecord) {
    setCompletionCriteriaEditingId(item.id);
    setCompletionCriteriaText(item.text);
    setCompletionCriteriaResponsibility(item.verificationResponsibility ?? 'unknown');
    setCompletionCriteriaResponsibilityLabel(item.verificationResponsibilityLabel ?? '');
    setCompletionCriteriaError(null);
  }

  function resetCompletionCriteriaForm() {
    setCompletionCriteriaEditingId(null);
    setCompletionCriteriaText('');
    setCompletionCriteriaResponsibility('unknown');
    setCompletionCriteriaResponsibilityLabel('');
    setCompletionCriteriaError(null);
  }

  function focusCompletionCriteriaSection(matchedCriteriaIds: string[] = []) {
    setCompletionCriteriaFocusIds(matchedCriteriaIds);

    if (typeof completionCriteriaSectionRef.current?.scrollIntoView === 'function') {
      completionCriteriaSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function handleSaveCompletionCriteria(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    if (!completionCriteriaText.trim()) {
      setCompletionCriteriaError('请先填写完成标准。');
      return;
    }

    setCompletionCriteriaError(null);

    if (completionCriteriaEditingId) {
      await onUpdateCompletionCriteria({
        id: completionCriteriaEditingId,
        text: completionCriteriaText,
        verificationResponsibility: completionCriteriaResponsibility,
        verificationResponsibilityLabel: completionCriteriaResponsibilityLabel,
      });
    } else {
      await onCreateCompletionCriteria({
        taskId: detail.id,
        text: completionCriteriaText,
        verificationResponsibility: completionCriteriaResponsibility,
        verificationResponsibilityLabel: completionCriteriaResponsibilityLabel,
      });
    }

    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));
    resetCompletionCriteriaForm();
  }

  async function handleSatisfyCurrentCompletionCriteria(id: string) {
    if (!detail) {
      return;
    }

    await onSatisfyCompletionCriteria(id);
    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));
  }

  async function handleReopenCurrentCompletionCriteria(id: string) {
    if (!detail) {
      return;
    }

    await onReopenCompletionCriteria(id);
    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));
  }

  function reevaluateCurrentDependency() {
    if (!detail) {
      return;
    }

    const nextStep = getDependencyReevaluationNextStep(detail);

    if (!nextStep) {
      return;
    }

    setDraftNextStep(nextStep);
    setDetailError(null);

    if (typeof detailFormRef.current?.scrollIntoView === 'function') {
      detailFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function shouldEscalateCurrentDependency(): boolean {
    return Boolean(
      detail?.activeDependency &&
        !detail.dependencyReevaluation &&
        isStaleDependency(detail.activeDependency.createdAt),
    );
  }

  function escalateCurrentDependency() {
    if (!detail) {
      return;
    }

    const nextStep = getDependencyEscalationNextStep(detail);

    if (!nextStep) {
      return;
    }

    setDraftNextStep(nextStep);
    setDetailError(null);

    if (typeof detailFormRef.current?.scrollIntoView === 'function') {
      detailFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function openUpstreamDependencyTask() {
    if (!detail?.activeDependency?.blockedByTaskId) {
      return;
    }

    setSelectedTaskId(detail.activeDependency.blockedByTaskId);
  }

  async function handleSaveDependency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    if (!dependencyBlockedByTaskId) {
      setDependencyError('请先选择上游任务。');
      return;
    }

    if (dependencyBlockedByTaskId === detail.id) {
      setDependencyError('任务不能依赖自己。');
      return;
    }

    setDependencyError(null);

    if (dependencyEditingId) {
      await onUpdateTaskDependency({
        id: dependencyEditingId,
        blockedByTaskId: dependencyBlockedByTaskId,
        reason: dependencyReason,
      });
    } else {
      await onCreateTaskDependency({
        taskId: detail.id,
        blockedByTaskId: dependencyBlockedByTaskId,
        reason: dependencyReason,
      });
    }

    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));
    resetDependencyForm();
  }

  async function handleResolveCurrentDependency(id: string) {
    if (!detail) {
      return;
    }

    await onResolveTaskDependency(id);
    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));

    if (dependencyEditingId === id) {
      resetDependencyForm();
    }
  }

  function populateSourceContextForm(item: SourceContextRecord) {
    setSourceContextEditingId(item.id);
    setSourceContextTitle(item.title);
    setSourceContextKind(item.kind);
    setSourceContextIsKey(item.isKey);
    setSourceContextUri(item.uri ?? '');
    setSourceContextContent(item.content ?? '');
    setSourceContextNote(item.note ?? '');
    setSourceContextError(null);
  }

  function resetSourceContextForm() {
    setSourceContextEditingId(null);
    setSourceContextTitle('');
    setSourceContextKind('link');
    setSourceContextIsKey(false);
    setSourceContextUri('');
    setSourceContextContent('');
    setSourceContextNote('');
    setSourceContextError(null);
  }

  function focusSourceContext(sourceContextId: string | null) {
    if (!detail || !sourceContextId) {
      return;
    }

    const matchedSourceContext = detail.sourceContexts.find((item) => item.id === sourceContextId);

    if (!matchedSourceContext) {
      return;
    }

    populateSourceContextForm(matchedSourceContext);
    if (typeof sourceContextSectionRef.current?.scrollIntoView === 'function') {
      sourceContextSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function populateProcessTemplateForm(item: ProcessTemplateRecord) {
    setProcessTemplateEditingId(item.id);
    setProcessTemplateTitle(item.title);
    setProcessTemplateSummary(item.summary ?? '');
    setProcessTemplateKind(item.kind);
    setProcessTemplateTags(item.tags.join(', '));
    setProcessTemplateContent(item.content);
    setProcessTemplateError(null);
  }

  function resetProcessTemplateForm() {
    setProcessTemplateEditingId(null);
    setProcessTemplateTitle('');
    setProcessTemplateSummary('');
    setProcessTemplateKind('skill');
    setProcessTemplateTags('');
    setProcessTemplateContent('');
    setProcessTemplateError(null);
  }

  function focusProcessTemplate(templateId: string | null) {
    if (!detail || !templateId) {
      return;
    }

    const matchedTemplate =
      detail.processTemplates.find((item) => item.id === templateId) ??
      detail.availableProcessTemplates.find((item) => item.id === templateId);

    if (!matchedTemplate) {
      return;
    }

    populateProcessTemplateForm(matchedTemplate);
    if (typeof processContextSectionRef.current?.scrollIntoView === 'function') {
      processContextSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function focusActionTarget(target: 'detail' | 'decision' | 'run' | 'transition' | 'blocker' | 'dependency' | 'completion') {
    const node =
      target === 'detail'
        ? detailFormRef.current
        : target === 'completion'
          ? completionCriteriaSectionRef.current
        : target === 'blocker'
          ? blockerSectionRef.current
        : target === 'dependency'
          ? dependencySectionRef.current
        : target === 'decision'
        ? quickDecisionCardRef.current
        : target === 'run'
          ? quickRunCardRef.current
          : transitionCardRef.current;

    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function adoptResumeNextStep() {
    if (!detail) {
      return;
    }

    setDraftNextStep(detail.resumeCard.nextSuggestedMove);
    setDetailError(null);
    if (typeof detailFormRef.current?.scrollIntoView === 'function') {
      detailFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function openResumeLatestChange() {
    if (!detail?.resumeCard.latestChange.action.targetType || !detail.resumeCard.latestChange.action.targetId) {
      return;
    }

    if (detail.resumeCard.latestChange.action.targetType === 'source_context') {
      focusSourceContext(detail.resumeCard.latestChange.action.targetId);
      return;
    }

    if (detail.resumeCard.latestChange.action.targetType === 'decision') {
      onOpenDecision(detail.resumeCard.latestChange.action.targetId);
      return;
    }

    onOpenRun(detail.resumeCard.latestChange.action.targetId);
  }

  async function handleSaveSourceContext(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    if (!sourceContextTitle.trim()) {
      setSourceContextError('请先填写来源标题。');
      return;
    }

    if (
      ['link', 'doc', 'issue', 'pr'].includes(sourceContextKind) &&
      !sourceContextUri.trim()
    ) {
      setSourceContextError('该来源类型需要填写链接。');
      return;
    }

    setSourceContextError(null);

    if (sourceContextEditingId) {
      await onUpdateSourceContext({
        id: sourceContextEditingId,
        title: sourceContextTitle,
        kind: sourceContextKind,
        isKey: sourceContextIsKey,
        uri: sourceContextUri,
        content: sourceContextContent,
        note: sourceContextNote,
      });
    } else {
      await onCreateSourceContext({
        taskId: detail.id,
        title: sourceContextTitle,
        kind: sourceContextKind,
        isKey: sourceContextIsKey,
        uri: sourceContextUri,
        content: sourceContextContent,
        note: sourceContextNote,
      });
    }

    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
    resetSourceContextForm();
  }

  async function handleArchiveCurrentSourceContext(id: string) {
    if (!detail) {
      return;
    }

    await onArchiveSourceContext(id);
    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);

    if (sourceContextEditingId === id) {
      resetSourceContextForm();
    }
  }

  async function handleSaveProcessTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    if (!processTemplateTitle.trim()) {
      setProcessTemplateError('请先填写模板标题。');
      return;
    }

    if (!processTemplateContent.trim()) {
      setProcessTemplateError('请先填写模板内容。');
      return;
    }

    setProcessTemplateError(null);
    const tags = processTemplateTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (processTemplateEditingId) {
      await onUpdateProcessTemplate({
        id: processTemplateEditingId,
        title: processTemplateTitle,
        summary: processTemplateSummary,
        kind: processTemplateKind,
        tags,
        content: processTemplateContent,
      });
    } else {
      const created = await onCreateProcessTemplate({
        title: processTemplateTitle,
        summary: processTemplateSummary,
        kind: processTemplateKind,
        tags,
        content: processTemplateContent,
      });

      await onApplyProcessTemplate({
        taskId: detail.id,
        templateId: created.id,
      });
    }

    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
    resetProcessTemplateForm();
  }

  async function handleApplyAvailableProcessTemplate(templateId: string) {
    if (!detail) {
      return;
    }

    await onApplyProcessTemplate({
      taskId: detail.id,
      templateId,
    });
    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));
  }

  async function handleRemoveCurrentProcessTemplate(bindingId: string) {
    if (!detail) {
      return;
    }

    await onRemoveProcessTemplate(bindingId);
    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));
  }

  async function handleArchiveCurrentProcessTemplate(id: string) {
    if (!detail) {
      return;
    }

    await onArchiveProcessTemplate(id);
    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));

    if (processTemplateEditingId === id) {
      resetProcessTemplateForm();
    }
  }

  function handleTimelineAction(event: TimelineEventRecord) {
    if (!detail) {
      return;
    }

    const payload = safeParsePayload(event.payload);

    if (event.type === 'task.decision_cancelled') {
      setQuickDecisionTitle(`${detail.title} 重新拍板`);
    }

    if (event.type === 'task.decision_approved') {
      setDraftNextStep(`已获批准，继续推进：${formatValue(payload?.decisionTitle)}`);
    }

    if (event.type === 'task.decision_deferred') {
      setDraftNextStep('跟进该决策是否可以恢复拍板，或准备替代推进路径。');
      setTransitionWaitingReason(formatValue(payload?.waitingReason));
    }

    if (event.type === 'task.run_failed') {
      setQuickRunType('draft');
      setQuickRunInstructions(
        `请先处理这个失败原因，再准备新的执行内容：${formatValue(payload?.failureReason)}`,
      );
    }

    if (event.type === 'task.waiting_changed') {
      setDraftNextStep(`跟进并确认是否解除等待：${formatValue(payload?.to)}`);
    }

    if (event.type === 'blocker.created' || event.type === 'blocker.updated') {
      setDraftNextStep(`先解除阻塞项，再继续推进：${formatValue(payload?.title)}`);
      if (detail.activeBlocker) {
        populateBlockerForm(detail.activeBlocker);
      }
    }

    if (event.type === 'task.risk_changed') {
      const nextRisk = (payload?.to as Record<string, unknown> | undefined) ?? {};
      const nextRiskLevel = nextRisk.level;
      const nextRiskNote = formatValue(nextRisk.note);

      if (nextRiskLevel && ['none', 'low', 'medium', 'high'].includes(String(nextRiskLevel))) {
        setDraftRiskLevel(nextRiskLevel as TaskRiskLevel);
      }

      setDraftRiskNote(nextRiskNote === '未填写' ? '' : nextRiskNote);
      setDraftNextStep(
        `处理当前风险并确认是否需要降级：${nextRiskNote === '未填写' ? '补充风险说明' : nextRiskNote}`,
      );
    }

    if (event.type === 'artifact.created') {
      const artifactId = payload?.artifactId;
      const artifact = detail.artifacts.find((item) => item.id === artifactId);
      const artifactTitle = artifact?.title ?? formatValue(payload?.title);
      const artifactContent = artifact?.content ?? '';

      setDraftNextStep(`基于产物继续推进：${artifactTitle}`);
      setQuickRunInstructions(
        artifactContent
          ? `请基于这份已有产物继续扩展、改写或整理：${artifactContent}`
          : `请基于已有产物继续推进：${artifactTitle}`,
      );
    }

    const focusTarget =
      event.type === 'task.decision_approved' ||
      event.type === 'task.decision_deferred' ||
      event.type === 'task.waiting_changed' ||
      event.type === 'blocker.created' ||
      event.type === 'blocker.updated' ||
      event.type === 'task.risk_changed' ||
      event.type === 'artifact.created'
        ? detailFormRef.current
        : quickActionsRef.current;

    if (typeof focusTarget?.scrollIntoView === 'function') {
      focusTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleTimelineObjectOpen(event: TimelineEventRecord) {
    const objectAction = getTaskTimelineObjectAction(event);

    if (objectAction.targetType === 'decision' && objectAction.targetId) {
      onOpenDecision(objectAction.targetId);
      return;
    }

    if (objectAction.targetType === 'run' && objectAction.targetId) {
      onOpenRun(objectAction.targetId);
      return;
    }

    if (objectAction.targetType === 'source_context' && objectAction.targetId) {
      focusSourceContext(objectAction.targetId);
    }
  }

  const relatedDecisions = detail
    ? taskDecisions
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 5)
    : [];

  const relatedRuns = detail
    ? taskRuns
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 5)
    : [];

  const visibleTimeline = detail
    ? showAllTimeline
      ? detail.timeline
      : getTaskTimelinePreviewEvents(detail.timeline, TIMELINE_PREVIEW_COUNT)
    : [];
  const visibleTimelineGroups = groupTaskTimelineEventsByPriority(visibleTimeline);
  const primaryMoves = getPrimaryMoveConfig(detail, resumeLane);
  const actionSetupOrder = getActionSetupOrder(detail, resumeLane);
  const snapshotArtifact = detail?.artifacts[0] ?? null;
  const snapshotSourceContext = detail?.sourceContexts[0] ?? null;
  const snapshotProcessTemplate = detail?.processTemplates[0] ?? null;
  const orderedLaneLabels = tasks.reduce<string[]>((labels, task) => {
    const laneLabel = getPriorityLaneLabel(taskPriorityLanes.get(task.id));

    if (!laneLabel || labels.includes(laneLabel)) {
      return labels;
    }

    labels.push(laneLabel);
    return labels;
  }, []);
  const taskQueueSummary =
    tasks.length === 0
      ? '当前没有任务，先创建一条开始流转。'
      : tasks.some((task) => Boolean(task.dependencyReevaluation))
        ? `当前队列先重新判断已具备条件的依赖任务；共 ${tasks.length} 条任务，优先确认上游任务完成或解阻塞后是否可以恢复推进。`
      : orderedLaneLabels[0] === '先补清晰度' && tasks.some((task) => isEarlyTask(task))
        ? `当前队列先处理新进入系统、还需整理清楚的任务；共 ${tasks.length} 条任务，先补摘要、下一步和是否需要拍板。`
      : orderedLaneLabels.length <= 1
        ? `当前队列按「${orderedLaneLabels[0] ?? '稳态推进'}」语义排序，共 ${tasks.length} 条任务。`
        : `当前队列会先处理「${orderedLaneLabels[0]}」，再到「${orderedLaneLabels[1]}」；共 ${tasks.length} 条任务，分布在 ${orderedLaneLabels.length} 个优先级层次。`;
  const quickDecisionSetup = (
    <form
      className="stack task-card quick-action-card"
      key="decision"
      onSubmit={handleQuickDecision}
      ref={quickDecisionCardRef}
    >
      <strong>Decision</strong>
      <label>
        决策标题
        <input
          value={quickDecisionTitle}
          onChange={(event) => setQuickDecisionTitle(event.target.value)}
        />
      </label>
      <label>
        拍板背景
        <textarea
          rows={3}
          value={quickDecisionNote}
          onChange={(event) => setQuickDecisionNote(event.target.value)}
        />
      </label>
      <p className="meta">{quickDecisionGuidance}</p>
      {quickDecisionResponsibilityGuidance ? (
        <p className="meta">{quickDecisionResponsibilityGuidance}</p>
      ) : null}
      {quickDecisionRationale ? <p className="meta">{quickDecisionRationale}</p> : null}
      <button type="button" className="ghost-button" onClick={() => void handleDraftQuickDecision()}>
        草拟 Decision
      </button>
      <button type="submit">提交 Decision</button>
    </form>
  );
  const quickRunSetup = (
    <form
      className="stack task-card quick-action-card"
      key="run"
      onSubmit={handleQuickRun}
      ref={quickRunCardRef}
    >
      <strong>Run</strong>
      <label>
        Run 类型
        <select
          value={quickRunType}
          onChange={(event) =>
            setQuickRunType(event.target.value as CreateRunInput['type'])
          }
        >
          <option value="draft">draft</option>
          <option value="summarize">summarize</option>
        </select>
      </label>
      <label>
        附加要求
        <textarea
          rows={3}
          value={quickRunInstructions}
          onChange={(event) => setQuickRunInstructions(event.target.value)}
        />
      </label>
      <p className="meta">{quickRunGuidance}</p>
      <button type="submit">触发 Run</button>
    </form>
  );
  const actionSetupCards = {
    decision: quickDecisionSetup,
    run: quickRunSetup,
  };

  return (
    <section className="tasks-layout">
      <article className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Tasks</p>
            <h2>任务列表</h2>
            <p className="lede">{taskQueueSummary}</p>
          </div>
        </div>
        <form className="stack" onSubmit={handleCreate}>
          <label>
            新任务标题
            <input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} />
          </label>
          <p className="meta">新任务创建后会先按「先补清晰度」语义打开，方便立刻补下一步。</p>
          <button type="submit">创建任务</button>
        </form>
        <div className="task-list">
          {tasks.length === 0 ? (
            <p className="meta">还没有任务，先创建一条开始流转。</p>
          ) : (
            tasks.map((task, index) => {
              const lane = taskPriorityLanes.get(task.id);
              const laneLabel = getPriorityLaneLabel(lane);
              const previousLane = index > 0 ? taskPriorityLanes.get(tasks[index - 1]!.id) : null;
              const showLaneSection = laneLabel && lane !== previousLane;

              return (
                <div className="task-list-item" key={task.id}>
                  {showLaneSection ? (
                    <div className="task-lane-section">
                      <span className={`status lane-status lane-status-${lane}`}>{laneLabel}</span>
                    </div>
                  ) : null}
                  <button
                    className={`task-card task-card-button ${getTaskCardTone(task)} ${
                      task.id === selectedTaskId ? 'task-card-active' : ''
                    }`}
                    onClick={() => setSelectedTaskId(task.id)}
                    type="button"
                  >
                    <div className="task-row">
                      <strong>{task.title}</strong>
                      <div className="task-row task-row-compact">
                        {laneLabel ? (
                          <span className={`status lane-status lane-status-${lane}`}>
                            {laneLabel}
                          </span>
                        ) : null}
                        <span className="status">{task.state}</span>
                      </div>
                    </div>
                    <p className="meta">{getTaskCardSummary(task)}</p>
                    {buildTaskBadges(task).length ? (
                      <div className="signal-row">
                        {buildTaskBadges(task).map((badge) => (
                          <span className="signal-pill" key={badge}>
                            {badge}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {getTaskCardNextMoveHint(task) ? (
                      <p className="meta">{getTaskCardNextMoveHint(task)}</p>
                    ) : null}
                    {task.dependencyReevaluation ? (
                      <p className="meta">
                        {task.dependencyReevaluation.status === 'upstream_ready'
                          ? `依赖重判：上游任务“${task.dependencyReevaluation.upstreamTaskTitle}”已完成。`
                          : `依赖重判：上游任务“${task.dependencyReevaluation.upstreamTaskTitle}”刚解除关键阻塞。`}
                      </p>
                    ) : task.activeDependency?.blockedByTaskTitle ? (
                      <>
                        <p className="meta">依赖：当前被上游任务“{task.activeDependency.blockedByTaskTitle}”卡住。</p>
                        <p className="meta">{formatDependencyAgeLabel(task.activeDependency.createdAt)}</p>
                        {getDependencyAgeReason(task.activeDependency.createdAt, 'task') ? (
                          <p className="meta">{getDependencyAgeReason(task.activeDependency.createdAt, 'task')}</p>
                        ) : null}
                      </>
                    ) : null}
                    {task.waitingReason ? <p className="meta">等待：{task.waitingReason}</p> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </article>

      <article className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Task Detail</p>
            <h2>{detail?.title ?? '选择一个任务'}</h2>
          </div>
        </div>
        {detail ? (
          <>
            <div className="transition-group detail-stage">
                <div className="detail-stage-head">
                  <div>
                    <p className="eyebrow">Current Snapshot</p>
                    <h3>恢复与当前推进</h3>
                  </div>
                  <p className="meta">第一屏只保留能帮助你恢复状态、看清当前对象并继续推进的切片。</p>
                </div>
              <div className="detail-cluster-grid">
                <div className="transition-group detail-card-group detail-card-wide">
                  <h3>Task Resume Card</h3>
                  <div className="timeline-item timeline-item-state">
                    <strong>Resume Summary</strong>
                    <p className="meta">{detail.resumeCard.summary}</p>
                    <div className="resume-grid">
                      <div className="resume-cell">
                        <strong>Priority Lane</strong>
                        {resumeLaneLabel ? (
                          <>
                            <span className={`status lane-status lane-status-${resumeLane}`}>{resumeLaneLabel}</span>
                            <p className="meta">这条任务当前在跨任务队列里按这类优先级语义排序。</p>
                          </>
                        ) : (
                          <p className="meta">当前没有更高优先级语义，保持稳态推进。</p>
                        )}
                      </div>
                      <div className="resume-cell">
                        <strong>Current State</strong>
                        <p className="meta">{detail.resumeCard.currentState}</p>
                      </div>
                      <div className="resume-cell">
                        <strong>Completion Status</strong>
                        <p className="meta">{resumeCompletionStatus.summary}</p>
                        {resumeCompletionStatus.total > 0 ? (
                          <>
                            <p className="meta">
                              还差 {resumeCompletionStatus.open} 条完成标准，当前已满足 {resumeCompletionStatus.satisfied} 条。
                            </p>
                            {resumeCompletionStatus.satisfiedCriteriaHighlights?.length ? (
                              <p className="meta">
                                已满足：
                                {resumeCompletionStatus.satisfiedCriteriaHighlights.join('；')}
                              </p>
                            ) : null}
                            {resumeCompletionStatus.nextOpenCriterion ? (
                              <p className="meta">
                                最后还差：{resumeCompletionStatus.nextOpenCriterion}
                              </p>
                            ) : null}
                            {resumeCompletionStatus.nextOpenResponsibilitySummary ? (
                              <p className="meta">{resumeCompletionStatus.nextOpenResponsibilitySummary}</p>
                            ) : null}
                          </>
                        ) : (
                          <p className="meta">建议先补 1 到 3 条完成标准，帮助判断这条任务何时可以收尾。</p>
                        )}
                      </div>
                      <div className="resume-cell">
                        <strong>Latest Change</strong>
                          <p className="meta">{detail.resumeCard.latestChange.summary}</p>
                        {detail.resumeCard.latestChange.action.label ? (
                          <button
                            className="ghost-button timeline-action"
                            onClick={openResumeLatestChange}
                            type="button"
                          >
                            {detail.resumeCard.latestChange.action.label}
                          </button>
                        ) : null}
                      </div>
                      <div className="resume-cell">
                        <strong>Current Blocker</strong>
                        <p className="meta">{resumeCurrentBlocker.title}</p>
                        {resumeCurrentBlocker.detail ? (
                          <p className="meta">{resumeCurrentBlocker.detail}</p>
                        ) : null}
                        {resumeCurrentBlocker.ageLabel ? (
                          <p className="meta">{resumeCurrentBlocker.ageLabel}</p>
                        ) : null}
                        {resumeCurrentBlocker.priorityReason ? (
                          <p className="meta">{resumeCurrentBlocker.priorityReason}</p>
                        ) : null}
                        {resumeCurrentBlocker.responsibilitySummary ? (
                          <p className="meta">{resumeCurrentBlocker.responsibilitySummary}</p>
                        ) : null}
                      </div>
                      <div className="resume-cell">
                        <strong>Current Dependency</strong>
                        <p className="meta">{resumeCurrentDependency.title}</p>
                        {resumeCurrentDependency.detail ? (
                          <p className="meta">{resumeCurrentDependency.detail}</p>
                        ) : null}
                        {resumeCurrentDependency.ageLabel ? (
                          <p className="meta">{resumeCurrentDependency.ageLabel}</p>
                        ) : null}
                        {resumeCurrentDependency.priorityReason ? (
                          <p className="meta">{resumeCurrentDependency.priorityReason}</p>
                        ) : null}
                        {resumeCurrentDependency.responsibilitySummary ? (
                          <p className="meta">{resumeCurrentDependency.responsibilitySummary}</p>
                        ) : null}
                      </div>
                      <div className="resume-cell resume-cell-source-lane">
                        <strong>Key Source</strong>
                        <p className="meta context-lane-meta">Material Shelf slice</p>
                        <p className="meta">{detail.resumeCard.keySource.title}</p>
                        {detail.resumeCard.keySource.detail ? (
                          <p className="meta">{detail.resumeCard.keySource.detail}</p>
                        ) : null}
                        {detail.resumeCard.keySource.priorityReason ? (
                          <p className="meta">{detail.resumeCard.keySource.priorityReason}</p>
                        ) : null}
                      </div>
                      <div className="resume-cell resume-cell-process-lane">
                        <strong>Current Method</strong>
                        <p className="meta context-lane-meta">Active Methods slice</p>
                        <p className="meta">{detail.resumeCard.currentMethod.title}</p>
                        {detail.resumeCard.currentMethod.detail ? (
                          <p className="meta">{detail.resumeCard.currentMethod.detail}</p>
                        ) : null}
                        {detail.resumeCard.currentMethod.selectionReason ? (
                          <p className="meta">{detail.resumeCard.currentMethod.selectionReason}</p>
                        ) : null}
                      </div>
                      <div className="resume-cell resume-cell-wide">
                        <strong>Next Suggested Move</strong>
                        <p className="meta">{detail.resumeCard.nextSuggestedMove}</p>
                      </div>
                    </div>
                    <div className="timeline-actions">
                      {detail.resumeCard.keySource.sourceContextId ? (
                        <button
                          className="ghost-button timeline-action"
                          onClick={() => focusSourceContext(detail.resumeCard.keySource.sourceContextId)}
                          type="button"
                        >
                          打开 Material Shelf
                        </button>
                      ) : null}
                      {detail.resumeCard.currentMethod.templateId ? (
                        <button
                          className="ghost-button timeline-action"
                          onClick={() => focusProcessTemplate(detail.resumeCard.currentMethod.templateId)}
                          type="button"
                        >
                          打开 Active Methods
                        </button>
                      ) : null}
                      {resumeCurrentBlocker.blockerId ? (
                        <button
                          className="ghost-button timeline-action"
                          onClick={focusBlockerSection}
                          type="button"
                        >
                          打开 Current Blocker
                        </button>
                      ) : null}
                      {resumeCurrentDependency.dependencyId ? (
                        <button
                          className="ghost-button timeline-action"
                          onClick={focusDependencySection}
                          type="button"
                        >
                          打开 Task Dependency
                        </button>
                      ) : null}
                      <button
                        className="ghost-button timeline-action"
                        onClick={() => focusCompletionCriteriaSection()}
                        type="button"
                      >
                        打开 Completion Criteria
                      </button>
                      {shouldEscalateCurrentDependency() ? (
                        <button
                          className="ghost-button timeline-action"
                          onClick={escalateCurrentDependency}
                          type="button"
                        >
                          直接升级依赖链路
                        </button>
                      ) : null}
                      <button
                        className="ghost-button timeline-action"
                        onClick={adoptResumeNextStep}
                        type="button"
                      >
                        采用建议下一步
                      </button>
                    </div>
                  </div>
                </div>

                <div className="transition-group detail-card-group">
                  <h3>Active Slices</h3>
                  <p className="meta">这里把当前信号、等待、阻塞和依赖压成摘要切片；完整维护下沉到 Context Studio。</p>
                  <div className="timeline-list">
                    <div className="timeline-item">
                      <div className="task-row">
                        <strong>Task Signals</strong>
                        <span className="signal-pill timeline-badge timeline-item-default">{detail.riskLevel}</span>
                      </div>
                      <p className="meta">Next Step: {detail.nextStep ?? '未填写'}</p>
                      <p className="meta">
                        Waiting: {detail.activeWaitingItem?.reason ?? detail.waitingReason ?? '未填写'}
                      </p>
                      {detail.riskNote ? <p className="meta">Risk note: {detail.riskNote}</p> : null}
                    </div>

                    {detail.activeWaitingItem ? (
                      <div className="timeline-item timeline-item-waiting">
                        <div className="task-row">
                          <strong>Waiting: {detail.activeWaitingItem.reason}</strong>
                          <span className="signal-pill timeline-badge timeline-item-waiting">
                            {detail.activeWaitingItem.status}
                          </span>
                        </div>
                        <p className="meta">
                          waiting item · {detail.activeWaitingItem.status} · since {detail.activeWaitingItem.createdAt}
                        </p>
                        {detail.state === 'waiting_external' ? (
                          <button
                            className="ghost-button timeline-action"
                            onClick={() => void handleTransition('planned')}
                            type="button"
                          >
                            解除等待
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {detail.activeBlocker ? (
                      <div className="timeline-item timeline-item-risk">
                        <div className="task-row">
                          <strong>Blocker: {detail.activeBlocker.title}</strong>
                          <span className="signal-pill timeline-badge timeline-item-risk">
                            {formatBlockerKind(detail.activeBlocker.kind)}
                          </span>
                        </div>
                        {detail.activeBlocker.detail ? (
                          <p className="meta">{detail.activeBlocker.detail}</p>
                        ) : null}
                        {detail.resumeCard.currentBlocker.priorityReason ? (
                          <p className="meta">{detail.resumeCard.currentBlocker.priorityReason}</p>
                        ) : (
                          <p className="meta">{formatBlockerAgeLabel(detail.activeBlocker.createdAt)}</p>
                        )}
                        <div className="timeline-actions">
                          <button
                            className="ghost-button timeline-action"
                            onClick={focusBlockerSection}
                            type="button"
                          >
                            管理阻塞项
                          </button>
                          {detail.activeBlocker.sourceContextId ? (
                            <button
                              className="ghost-button timeline-action"
                              onClick={() => focusSourceContext(detail.activeBlocker?.sourceContextId ?? null)}
                              type="button"
                            >
                              查看阻塞来源
                            </button>
                          ) : null}
                          <button
                            className="ghost-button timeline-action"
                            onClick={() => void handleResolveCurrentBlocker(detail.activeBlocker!.id)}
                            type="button"
                          >
                            解除阻塞
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {detail.activeDependency ? (
                      <div className="timeline-item timeline-item-default">
                        <div className="task-row">
                          <strong>Dependency: {detail.activeDependency.blockedByTaskTitle ?? '未命名上游任务'}</strong>
                          <span className="signal-pill timeline-badge timeline-item-default">task</span>
                        </div>
                        {detail.activeDependency.reason ? (
                          <p className="meta">{detail.activeDependency.reason}</p>
                        ) : null}
                        <p className="meta">
                          {detail.resumeCard.currentDependency?.ageLabel ?? `depends since ${detail.activeDependency.createdAt.slice(0, 10)}`}
                        </p>
                        {detail.resumeCard.currentDependency?.priorityReason ? (
                          <p className="meta">{detail.resumeCard.currentDependency.priorityReason}</p>
                        ) : null}
                        <div className="timeline-actions">
                          <button
                            className="ghost-button timeline-action"
                            onClick={focusDependencySection}
                            type="button"
                          >
                            管理依赖
                          </button>
                          {detail.dependencyReevaluation ? (
                            <button
                              className="ghost-button timeline-action"
                              onClick={reevaluateCurrentDependency}
                              type="button"
                            >
                              重新判断依赖
                            </button>
                          ) : null}
                          {detail.activeDependency.blockedByTaskId ? (
                            <button
                              className="ghost-button timeline-action"
                              onClick={openUpstreamDependencyTask}
                              type="button"
                            >
                              打开上游任务
                            </button>
                          ) : null}
                          {shouldEscalateCurrentDependency() ? (
                            <button
                              className="ghost-button timeline-action"
                              onClick={escalateCurrentDependency}
                              type="button"
                            >
                              直接升级依赖链路
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="transition-group detail-card-group">
                  <h3>Recent Artifact</h3>
                  <p className="meta">这里只显示最新产物，避免把当前层做成产物归档区。</p>
                  <div className="timeline-list">
                    {snapshotArtifact ? (
                      <div className="timeline-item timeline-item-next-step" key={snapshotArtifact.id}>
                        <div className="task-row">
                          <strong>{snapshotArtifact.title}</strong>
                          <span className="signal-pill timeline-badge timeline-item-next-step">
                            {snapshotArtifact.kind}
                          </span>
                        </div>
                        <p className="meta">
                          source: {snapshotArtifact.sourceType} · {snapshotArtifact.sourceId}
                        </p>
                        <p className="meta brief-preview">{snapshotArtifact.content}</p>
                        {detail.artifacts.length > 1 ? (
                          <p className="meta">其余 {detail.artifacts.length - 1} 条产物留在下方活动与历史层。</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="meta">当前任务还没有沉淀出 artifact。</p>
                    )}
                  </div>
                </div>

                <div className="transition-group detail-card-group">
                  <h3>Context Slices</h3>
                  <p className="meta">这里只保留当前最关键的来源和方法入口，完整材料架与方法库下沉到 Context Studio。</p>
                  <div className="timeline-list">
                    {snapshotSourceContext ? (
                      <button
                        className="task-card task-card-button task-card-muted"
                        key={`key-source:${snapshotSourceContext.id}`}
                        onClick={() => populateSourceContextForm(snapshotSourceContext)}
                        type="button"
                      >
                        <div className="task-row">
                          <strong>{snapshotSourceContext.title}</strong>
                          <span className="signal-pill timeline-badge timeline-item-default">
                            {formatSourceContextKind(snapshotSourceContext.kind)}
                            {snapshotSourceContext.isKey ? ' · key' : ''}
                          </span>
                        </div>
                        {snapshotSourceContext.note ? <p className="meta">{snapshotSourceContext.note}</p> : null}
                        {snapshotSourceContext.uri ? (
                          <p className="meta brief-preview">{snapshotSourceContext.uri}</p>
                        ) : null}
                        <p className="meta">最近更新：{snapshotSourceContext.updatedAt}</p>
                        {detail.sourceContexts.length > 1 ? (
                          <p className="meta">其余 {detail.sourceContexts.length - 1} 条来源材料移到 Context Studio。</p>
                        ) : null}
                      </button>
                    ) : (
                      <p className="meta">当前还没有关键来源材料。</p>
                    )}

                    {snapshotProcessTemplate ? (
                      <div
                        className="timeline-item timeline-item-state"
                        key={`current-method:${snapshotProcessTemplate.bindingId}`}
                      >
                        <div className="task-row">
                          <strong>{snapshotProcessTemplate.title}</strong>
                          <span className="signal-pill timeline-badge timeline-item-state">
                            {formatProcessTemplateKind(snapshotProcessTemplate.kind)}
                          </span>
                        </div>
                        {snapshotProcessTemplate.summary ? (
                          <p className="meta">{snapshotProcessTemplate.summary}</p>
                        ) : null}
                        {snapshotProcessTemplate.tags.length ? (
                          <p className="meta">tags: {snapshotProcessTemplate.tags.join(', ')}</p>
                        ) : null}
                        {detail.resumeCard.currentMethod.selectionReason ? (
                          <p className="meta">{detail.resumeCard.currentMethod.selectionReason}</p>
                        ) : null}
                        {detail.processTemplates.length > 1 ? (
                          <p className="meta">其余 {detail.processTemplates.length - 1} 个方法模板移到 Context Studio。</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="meta">当前任务还没有启用中的方法模板。</p>
                    )}
                  </div>
                  <div className="timeline-actions">
                    {snapshotSourceContext ? (
                      <button
                        className="ghost-button timeline-action"
                        onClick={() => focusSourceContext(snapshotSourceContext.id)}
                        type="button"
                      >
                        管理来源材料
                      </button>
                    ) : null}
                    {snapshotProcessTemplate ? (
                      <button
                        className="ghost-button timeline-action"
                        onClick={() => focusProcessTemplate(snapshotProcessTemplate.id)}
                        type="button"
                      >
                        管理当前方法
                      </button>
                    ) : null}
                  </div>
                </div>

              </div>
            </div>

            <div className="transition-group detail-stage" ref={completionCriteriaSectionRef}>
              <div className="detail-stage-head">
                <div>
                  <p className="eyebrow">Completion Criteria</p>
                  <h3>完成判断与收尾标准</h3>
                </div>
                <p className="meta">这一层回答“做到什么程度才算真的完成”，不是过程清单，也不自动替你判定完成。</p>
              </div>
              <div className="detail-cluster-grid">
                <div className="transition-group detail-card-group detail-card-wide">
                  <h3>Current Completion Criteria</h3>
                  <p className="meta">先看还差哪些完成标准，再决定这条任务是否真的可以收尾。</p>
                  <div className="timeline-list">
                    {detail.completionCriteria.length ? (
                      detail.completionCriteria.map((criteria) => (
                        <div
                          className={`timeline-item timeline-item-state ${
                            completionCriteriaFocusIds.includes(criteria.id)
                              ? 'timeline-item-completion-focus'
                              : ''
                          }`}
                          key={criteria.id}
                        >
                          <div className="task-row">
                            <strong>{criteria.text}</strong>
                            <div className="timeline-badge-row">
                              {completionCriteriaFocusIds.includes(criteria.id) ? (
                                <span className="signal-pill timeline-badge timeline-item-next-step">
                                  证据可能对应
                                </span>
                              ) : null}
                              <span
                                className={`signal-pill timeline-badge ${
                                  criteria.status === 'satisfied'
                                    ? 'timeline-item-state'
                                    : 'timeline-item-default'
                                }`}
                              >
                                {criteria.status === 'satisfied' ? '已满足' : '未满足'}
                              </span>
                            </div>
                          </div>
                          <p className="meta">
                            created {criteria.createdAt.slice(0, 10)}
                            {criteria.satisfiedAt ? ` · satisfied ${criteria.satisfiedAt.slice(0, 10)}` : ''}
                          </p>
                          {criteria.verificationResponsibility ||
                          criteria.verificationResponsibilityLabel ? (
                            <p className="meta">
                              确认责任：
                              {criteria.verificationResponsibilityLabel ??
                                formatResponsibilityKind(
                                  criteria.verificationResponsibility ?? 'unknown',
                                )}
                            </p>
                          ) : null}
                          <div className="timeline-actions">
                            {criteria.status === 'open' ? (
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => void handleSatisfyCurrentCompletionCriteria(criteria.id)}
                                type="button"
                              >
                                标记已满足
                              </button>
                            ) : (
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => void handleReopenCurrentCompletionCriteria(criteria.id)}
                                type="button"
                              >
                                重新打开
                              </button>
                            )}
                            <button
                              className="ghost-button timeline-action"
                              onClick={() => populateCompletionCriteriaForm(criteria)}
                              type="button"
                            >
                              编辑标准
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="meta">当前任务还没有定义完成标准。首版建议先补 1 到 3 条，帮助判断什么时候真的可以完成。</p>
                    )}
                  </div>
                </div>

                <div className="transition-group detail-card-group">
                  <h3>Completion Snapshot</h3>
                  <p className="meta">恢复卡只保留一条切片，这里再补一层当前完成判断状态。</p>
                  <div className="timeline-list">
                    <div className="timeline-item timeline-item-default">
                      <strong>{resumeCompletionStatus.summary}</strong>
                      {resumeCompletionStatus.total > 0 ? (
                        <>
                          <p className="meta">
                            未满足 {resumeCompletionStatus.open} 条，已满足{' '}
                            {resumeCompletionStatus.satisfied} 条。
                          </p>
                          {resumeCompletionStatus.nextOpenResponsibilitySummary ? (
                            <p className="meta">
                              {resumeCompletionStatus.nextOpenResponsibilitySummary}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="meta">还没有退出条件对象，当前不适合直接凭感觉判断已完成。</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="transition-group detail-card-group">
                  <h3>Potential Completion Evidence</h3>
                  <p className="meta">系统只提示最近哪些结果值得先对照完成标准，不会自动替你标记已满足。</p>
                  <div className="timeline-list">
                    {completionEvidenceCards.length ? (
                      completionEvidenceCards.map((evidence) => (
                        <div className="timeline-item timeline-item-default" key={evidence.id}>
                          <div className="task-row">
                            <strong>{evidence.title}</strong>
                            <span className="signal-pill timeline-badge timeline-item-default">
                              {evidence.type === 'decision'
                                ? '拍板结果'
                                : evidence.type === 'run'
                                  ? '执行结果'
                                  : '最近产物'}
                            </span>
                          </div>
                          <p className="meta">{evidence.detail}</p>
                          {evidence.matchedCriteria.length ? (
                            <p className="meta">
                              可能对应：{evidence.matchedCriteria.slice(0, 2).join('；')}
                              {evidence.matchedCriteria.length > 2 ? '；…' : ''}
                            </p>
                          ) : (
                            <p className="meta">值得先对照当前仍未满足的完成标准。</p>
                          )}
                          {evidence.responsibilityGuidance ? (
                            <p className="meta">{evidence.responsibilityGuidance}</p>
                          ) : null}
                          <div className="timeline-actions">
                            <button
                              className="ghost-button timeline-action"
                              onClick={() => focusCompletionCriteriaSection(evidence.matchedCriteriaIds)}
                              type="button"
                            >
                              {evidence.matchedCriteriaIds.length ? '对照可能对应标准' : '对照未满足标准'}
                            </button>
                            {evidence.type === 'decision' && evidence.targetId ? (
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => onOpenDecision(evidence.targetId as string)}
                                type="button"
                              >
                                查看 Decision
                              </button>
                            ) : null}
                            {(evidence.type === 'run' || evidence.type === 'artifact') && evidence.targetId ? (
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => onOpenRun(evidence.targetId as string)}
                                type="button"
                              >
                                查看 Run
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="meta">最近还没有足够明确的完成证据。后续的拍板结果、执行结果或产物会先出现在这里。</p>
                    )}
                  </div>
                </div>

                <div className="transition-group detail-card-group">
                  <form className="stack studio-form" onSubmit={handleSaveCompletionCriteria}>
                    <div className="studio-section-head">
                      <strong>{completionCriteriaEditingId ? 'Edit Completion Criteria' : 'Add Completion Criteria'}</strong>
                      <p className="meta">填写一条退出条件，例如“稿件已发出并获确认”，而不是过程步骤。</p>
                    </div>
                    <label>
                      完成标准
                      <textarea
                        rows={3}
                        value={completionCriteriaText}
                        onChange={(event) => {
                          setCompletionCriteriaText(event.target.value);
                          if (completionCriteriaError) {
                            setCompletionCriteriaError(null);
                          }
                        }}
                      />
                    </label>
                    <label>
                      确认责任
                      <select
                        value={completionCriteriaResponsibility}
                        onChange={(event) =>
                          setCompletionCriteriaResponsibility(
                            event.target.value as ResponsibilityKind,
                          )
                        }
                      >
                        {responsibilityOptions.map((item) => (
                          <option key={item} value={item}>
                            {formatResponsibilityKind(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      确认责任说明
                      <input
                        value={completionCriteriaResponsibilityLabel}
                        onChange={(event) =>
                          setCompletionCriteriaResponsibilityLabel(event.target.value)
                        }
                        placeholder="例如：我自己确认 / 客户确认 / 法务确认"
                      />
                    </label>
                    {completionCriteriaError ? <p className="meta">{completionCriteriaError}</p> : null}
                    <div className="timeline-actions">
                      <button type="submit">
                        {completionCriteriaEditingId ? '保存完成标准' : '新增完成标准'}
                      </button>
                      {completionCriteriaEditingId ? (
                        <button className="ghost-button" onClick={resetCompletionCriteriaForm} type="button">
                          取消编辑
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </div>
            </div>

            <div className="transition-group detail-stage">
              <div className="detail-stage-head">
                <div>
                  <p className="eyebrow">Action Desk</p>
                  <h3>动作与状态流转</h3>
                </div>
                <p className="meta">{getActionDeskStageGuidance(detail)}</p>
              </div>
              <div className="detail-cluster-grid">
                <div className="transition-group detail-card-group detail-card-wide">
                  <h3>Primary Moves</h3>
                  <p className="meta">这里只前置当前最值得先处理的一到两个入口，具体填写和状态选择放在下方。</p>
                  <div className="primary-moves-grid">
                    {primaryMoves.map((move) => (
                      <button
                        className="ghost-button primary-move-button"
                        key={move.id}
                        onClick={() => focusActionTarget(move.id)}
                        type="button"
                      >
                        {move.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="transition-group detail-card-group" ref={sourceContextSectionRef}>
                  <h3>Action Setup</h3>
                  <p className="meta">{getActionSetupGuidance(detail)}</p>
                  <div className="quick-actions-grid" ref={quickActionsRef}>
                    {actionSetupOrder.map((setup) => actionSetupCards[setup])}
                  </div>
                </div>

                <div className="transition-group detail-card-group" ref={transitionCardRef}>
                  <h3>状态流转</h3>
                  <p className="meta">只保留当前状态允许的后续流转，避免把所有状态都摊在面前。</p>
                  {transitionGuidance ? <p className="meta">{transitionGuidance}</p> : null}
                  <div className="stack">
                    <label>
                      Waiting Transition Reason
                      <input
                        placeholder="例如：等待外部审批 / 客户回复 / 法务确认"
                        value={transitionWaitingReason}
                        onChange={(event) => {
                          setTransitionWaitingReason(event.target.value);
                          if (transitionError) {
                            setTransitionError(null);
                          }
                        }}
                      />
                    </label>
                    {transitionError ? <p className="meta">{transitionError}</p> : null}
                  </div>
                  {completionTransitionGuidance ? (
                    <div className="task-card stack">
                      <strong>完成前判断</strong>
                      <p className="meta">{completionTransitionGuidance.summary}</p>
                      {completionTransitionGuidance.tone !== 'ready' ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => focusCompletionCriteriaSection()}
                        >
                          打开 Completion Criteria
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="chip-row">
                    {transitionStates.length === 0 ? (
                      <p className="meta">当前状态没有可用的下一步。</p>
                    ) : (
                      transitionStates.map((nextState) => (
                        <button
                          className="ghost-button"
                          key={nextState}
                          onClick={() => void handleTransition(nextState)}
                          type="button"
                        >
                          {nextState === 'completed' && completionTransitionGuidance
                            ? completionTransitionGuidance.buttonLabel
                            : `转到 ${nextState}`}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="transition-group detail-stage">
              <div className="detail-stage-head">
                <div>
                  <p className="eyebrow">Activity Feed</p>
                  <h3>关联活动与任务历史</h3>
                </div>
                <p className="meta">最后再看相关对象和 Timeline，更容易分清“当前”与“历史”。</p>
              </div>

              <div className="transition-group detail-card-group">
                <h3>Related Activity</h3>
                <div className="related-grid">
                  <div className="timeline-list">
                    <strong>Decisions</strong>
                    {relatedDecisions.length ? (
                      relatedDecisions.map((decision) => (
                        <button
                          className="timeline-item task-card-button"
                          key={decision.id}
                          onClick={() => onOpenDecision(decision.id)}
                          type="button"
                        >
                          <div className="task-row">
                            <strong>{decision.title}</strong>
                            <span className="status">{decision.status}</span>
                          </div>
                          <p className="meta">{decision.updatedAt}</p>
                        </button>
                      ))
                    ) : (
                      <p className="meta">当前任务还没有关联 decision。</p>
                    )}
                  </div>

                  <div className="timeline-list">
                    <strong>Recent Runs</strong>
                    {relatedRuns.length ? (
                      relatedRuns.map((run) => (
                        <button
                          className="timeline-item task-card-button"
                          key={run.id}
                          onClick={() => onOpenRun(run.id)}
                          type="button"
                        >
                          <div className="task-row">
                            <strong>{run.type}</strong>
                            <span className="status">{run.status}</span>
                          </div>
                          <p className="meta">
                            {run.outputSource ? `来源：${run.outputSource}` : '来源：尚未产生'}
                          </p>
                          <p className="meta">{run.updatedAt}</p>
                        </button>
                      ))
                    ) : (
                      <p className="meta">当前任务还没有关联 run。</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="transition-group detail-card-group">
                <div className="task-row">
                  <div>
                    <h3>Timeline</h3>
                    <p className="meta">预览优先展示关键事件与解释事件，较弱的留痕事件默认后退。</p>
                  </div>
                  {detail.timeline.length > TIMELINE_PREVIEW_COUNT ? (
                    <button
                      className="ghost-button timeline-toggle"
                      onClick={() => setShowAllTimeline((current) => !current)}
                      type="button"
                    >
                      {showAllTimeline ? '收起旧事件' : `展开全部 (${detail.timeline.length})`}
                    </button>
                  ) : null}
                </div>
                <div className="timeline-list">
                  {visibleTimelineGroups.map((group) => (
                    <Fragment key={group.id}>
                      <div className="timeline-group-heading">
                        <span>{group.title}</span>
                        <span>{group.events.length}</span>
                      </div>
                      {group.events.map((event) => (
                        <div className={`timeline-item ${getTimelineToneClass(event.type)}`} key={event.id}>
                          <div className="task-row">
                            <strong>{formatTimelineSummary(event)}</strong>
                            <div className="timeline-badge-row">
                              <span
                                className={`signal-pill timeline-badge ${getTimelineToneClass(event.type)}`}
                              >
                                {getTaskTimelineEventLabel(event.type)}
                              </span>
                              <span className="signal-pill timeline-priority-pill">
                                {getTaskTimelinePriorityLabel(event.type)}
                              </span>
                              {getTaskTimelineLaneLabel(event.type) ? (
                                <span
                                  className={`signal-pill lane-status lane-status-${getTaskTimelineLane(event.type)}`}
                                >
                                  {getTaskTimelineLaneLabel(event.type)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <p className="meta">{event.createdAt}</p>
                          {getTaskTimelineResponsibilitySummary(event) ? (
                            <p className="meta">{getTaskTimelineResponsibilitySummary(event)}</p>
                          ) : null}
                          {getTimelineActionLabel(event.type) || getTimelineObjectLabel(event) ? (
                            <div className="timeline-actions">
                              {getTimelineActionLabel(event.type) ? (
                                <button
                                  className="ghost-button timeline-action"
                                  onClick={() => handleTimelineAction(event)}
                                  type="button"
                                >
                                  {getTimelineActionLabel(event.type)}
                                </button>
                              ) : null}
                              {getTimelineObjectLabel(event) ? (
                                <button
                                  className="ghost-button timeline-action"
                                  onClick={() => handleTimelineObjectOpen(event)}
                                  type="button"
                                >
                                  {getTimelineObjectLabel(event)}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>

            <div className="transition-group detail-stage">
              <div className="detail-stage-head">
                <div>
                  <p className="eyebrow">Context Studio</p>
                  <h3>来源与方法管理</h3>
                </div>
                <p className="meta">完整的来源材料和方法模板管理下沉到这一层，不再抢第一屏恢复入口。</p>
              </div>
              <div className="detail-cluster-grid">
                <form
                  className="transition-group detail-card-group detail-card-wide stack"
                  onSubmit={handleSaveDetail}
                  ref={detailFormRef}
                >
                  <div className="studio-section-head">
                    <strong>Task Basics</strong>
                    <p className="meta">基础字段管理下沉到这一层，避免抢占第一屏的恢复入口。</p>
                  </div>
                  <label>
                    标题
                    <input
                      value={draftTitle}
                      onChange={(event) => {
                        setDraftTitle(event.target.value);
                        if (detailError) {
                          setDetailError(null);
                        }
                      }}
                    />
                  </label>
                  <label>
                    Summary
                    <textarea
                      rows={4}
                      value={draftSummary}
                      onChange={(event) => {
                        setDraftSummary(event.target.value);
                        if (detailError) {
                          setDetailError(null);
                        }
                      }}
                    />
                  </label>
                  <label>
                    Next Step
                    <input
                      value={draftNextStep}
                      onChange={(event) => {
                        setDraftNextStep(event.target.value);
                        if (detailError) {
                          setDetailError(null);
                        }
                      }}
                    />
                  </label>
                  <label>
                    Waiting Reason
                    <input
                      value={draftWaitingReason}
                      onChange={(event) => {
                        setDraftWaitingReason(event.target.value);
                        if (detailError) {
                          setDetailError(null);
                        }
                      }}
                    />
                  </label>
                  <label>
                    Risk Level
                    <select
                      value={draftRiskLevel}
                      onChange={(event) => updateDraftRiskLevel(event.target.value as TaskRiskLevel)}
                    >
                      {riskOptions.map((riskLevel) => (
                        <option key={riskLevel} value={riskLevel}>
                          {riskLevel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Risk Note
                    <textarea
                      rows={3}
                      value={draftRiskNote}
                      onChange={(event) => {
                        setDraftRiskNote(event.target.value);
                        if (detailError) {
                          setDetailError(null);
                        }
                      }}
                    />
                  </label>
                  {detailError ? <p className="meta">{detailError}</p> : null}
                  <button type="submit">保存详情</button>
                </form>

                <div className="transition-group detail-card-group" ref={blockerSectionRef}>
                  <h3>Blocker Context</h3>
                  <p className="meta">这一层管理当前阻塞项；上方 Resume Card 和 Current Snapshot 只抽出当前主阻塞切片。</p>
                  <div className="studio-section studio-section-risk-lane">
                    <div className="studio-section-head">
                      <strong className="context-lane-heading">Current Blocker</strong>
                      <p className="meta">当前任务的主阻塞项。</p>
                    </div>
                    <div className="timeline-list">
                      {detail.activeBlocker ? (
                        <div className="timeline-item timeline-item-risk">
                          <div className="task-row">
                            <strong>{detail.activeBlocker.title}</strong>
                            <span className="signal-pill timeline-badge timeline-item-risk">
                              {formatBlockerKind(detail.activeBlocker.kind)}
                            </span>
                          </div>
                          {detail.activeBlocker.detail ? (
                            <p className="meta">{detail.activeBlocker.detail}</p>
                          ) : null}
                          {detail.activeBlocker.owner ? (
                            <p className="meta">owner: {detail.activeBlocker.owner}</p>
                          ) : null}
                          {detail.activeBlocker.responsibility ||
                          detail.activeBlocker.responsibilityLabel ? (
                            <p className="meta">
                              解除责任：
                              {detail.activeBlocker.responsibilityLabel ??
                                formatResponsibilityKind(
                                  detail.activeBlocker.responsibility ?? 'unknown',
                                )}
                            </p>
                          ) : null}
                          <p className="meta">{formatBlockerAgeLabel(detail.activeBlocker.createdAt)}</p>
                          <div className="timeline-actions">
                            <button
                              className="ghost-button timeline-action"
                              onClick={() => populateBlockerForm(detail.activeBlocker!)}
                              type="button"
                            >
                              编辑阻塞项
                            </button>
                            {detail.activeBlocker.sourceContextId ? (
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => focusSourceContext(detail.activeBlocker?.sourceContextId ?? null)}
                                type="button"
                              >
                                查看阻塞来源
                              </button>
                            ) : null}
                            <button
                              className="ghost-button timeline-action"
                              onClick={() => void handleResolveCurrentBlocker(detail.activeBlocker!.id)}
                              type="button"
                            >
                              解除阻塞
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="meta">当前任务还没有 active blocker。</p>
                      )}
                    </div>
                  </div>
                  <form className="stack studio-form" onSubmit={handleSaveBlocker}>
                    <div className="studio-section-head">
                      <strong>{blockerEditingId ? 'Edit Blocker' : 'Add Blocker'}</strong>
                      <p className="meta">把“为什么推进不下去”单独对象化，而不是继续散在 waiting 或风险备注里。</p>
                    </div>
                    <label>
                      阻塞项标题
                      <input
                        value={blockerTitle}
                        onChange={(event) => {
                          setBlockerTitle(event.target.value);
                          if (blockerError) {
                            setBlockerError(null);
                          }
                        }}
                      />
                    </label>
                    <label>
                      阻塞项类型
                      <select
                        value={blockerKind}
                        onChange={(event) => setBlockerKind(event.target.value as BlockerKind)}
                      >
                        {blockerKindOptions.map((kind) => (
                          <option key={kind} value={kind}>
                            {formatBlockerKind(kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      阻塞说明
                      <textarea
                        rows={2}
                        value={blockerDetail}
                        onChange={(event) => setBlockerDetail(event.target.value)}
                      />
                    </label>
                    <label>
                      owner / 卡点对象
                      <input
                        value={blockerOwner}
                        onChange={(event) => setBlockerOwner(event.target.value)}
                      />
                    </label>
                    <label>
                      解除责任
                      <select
                        value={blockerResponsibility}
                        onChange={(event) =>
                          setBlockerResponsibility(event.target.value as ResponsibilityKind)
                        }
                      >
                        {responsibilityOptions.map((item) => (
                          <option key={item} value={item}>
                            {formatResponsibilityKind(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      解除责任说明
                      <input
                        value={blockerResponsibilityLabel}
                        onChange={(event) => setBlockerResponsibilityLabel(event.target.value)}
                        placeholder="例如：法务团队确认 / 我自己跟进 / 对方运营回复"
                      />
                    </label>
                    <label>
                      关联来源材料
                      <select
                        value={blockerSourceContextId}
                        onChange={(event) => setBlockerSourceContextId(event.target.value)}
                      >
                        <option value="">不关联来源</option>
                        {detail.sourceContexts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {blockerError ? <p className="meta">{blockerError}</p> : null}
                    <div className="timeline-actions">
                      <button type="submit">{blockerEditingId ? '保存阻塞项' : '新增阻塞项'}</button>
                      {blockerEditingId ? (
                        <button className="ghost-button" onClick={resetBlockerForm} type="button">
                          取消编辑
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>

                <div className="transition-group detail-card-group" ref={dependencySectionRef}>
                  <h3>Task Dependency</h3>
                  <p className="meta">这一层管理“被哪条任务卡住”的关系；上方 Resume Card 和 Current Snapshot 只抽当前依赖切片。</p>
                  <div className="studio-section studio-section-default-lane">
                    <div className="studio-section-head">
                      <strong className="context-lane-heading">Current Dependency</strong>
                      <p className="meta">当前任务依赖的上游任务。</p>
                    </div>
                    <div className="timeline-list">
                      {detail.activeDependency ? (
                        <div className="timeline-item timeline-item-default">
                          <div className="task-row">
                            <strong>{detail.activeDependency.blockedByTaskTitle ?? '未命名上游任务'}</strong>
                            <span className="signal-pill timeline-badge timeline-item-default">task</span>
                          </div>
                          {detail.activeDependency.reason ? (
                            <p className="meta">{detail.activeDependency.reason}</p>
                          ) : null}
                          <p className="meta">{detail.resumeCard.currentDependency?.ageLabel ?? `depends since ${detail.activeDependency.createdAt.slice(0, 10)}`}</p>
                          {detail.resumeCard.currentDependency?.priorityReason ? (
                            <p className="meta">{detail.resumeCard.currentDependency.priorityReason}</p>
                          ) : null}
                          <div className="timeline-actions">
                            {detail.dependencyReevaluation ? (
                              <button
                                className="ghost-button timeline-action"
                                onClick={reevaluateCurrentDependency}
                                type="button"
                              >
                                重新判断依赖
                              </button>
                            ) : null}
                            {detail.activeDependency.blockedByTaskId ? (
                              <button
                                className="ghost-button timeline-action"
                                onClick={openUpstreamDependencyTask}
                                type="button"
                                >
                                  打开上游任务
                                </button>
                              ) : null}
                            {shouldEscalateCurrentDependency() ? (
                              <button
                                className="ghost-button timeline-action"
                                onClick={escalateCurrentDependency}
                                type="button"
                              >
                                直接升级依赖链路
                              </button>
                            ) : null}
                            <button
                              className="ghost-button timeline-action"
                              onClick={() => populateDependencyForm(detail.activeDependency!)}
                              type="button"
                            >
                              编辑依赖
                            </button>
                            <button
                              className="ghost-button timeline-action"
                              onClick={() => void handleResolveCurrentDependency(detail.activeDependency!.id)}
                              type="button"
                            >
                              解除依赖
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="meta">当前任务还没有 active dependency。</p>
                      )}
                    </div>
                  </div>
                  <form className="stack studio-form" onSubmit={handleSaveDependency}>
                    <div className="studio-section-head">
                      <strong>{dependencyEditingId ? 'Edit Dependency' : 'Add Dependency'}</strong>
                      <p className="meta">把“被另一条任务卡住”的关系单独对象化，而不是继续散在阻塞或等待说明里。</p>
                    </div>
                    <label>
                      上游任务
                      <select
                        value={dependencyBlockedByTaskId}
                        onChange={(event) => {
                          setDependencyBlockedByTaskId(event.target.value);
                          if (dependencyError) {
                            setDependencyError(null);
                          }
                        }}
                      >
                        <option value="">请选择上游任务</option>
                        {tasks
                          .filter((item) => !detail || item.id !== detail.id)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      依赖说明
                      <textarea
                        rows={2}
                        value={dependencyReason}
                        onChange={(event) => setDependencyReason(event.target.value)}
                      />
                    </label>
                    {dependencyError ? <p className="meta">{dependencyError}</p> : null}
                    <div className="timeline-actions">
                      <button type="submit">{dependencyEditingId ? '保存依赖' : '新增依赖'}</button>
                      {dependencyEditingId ? (
                        <button className="ghost-button" onClick={resetDependencyForm} type="button">
                          取消编辑
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>

                <div className="transition-group detail-card-group">
                  <h3>Source Context</h3>
                  <p className="meta">这一层管理任务依赖的材料，不和方法模板混在一起；上方 Resume Card 的 Key Source 就是从这里抽出的关键切片。</p>
                  <div className="studio-section studio-section-source-lane">
                    <div className="studio-section-head">
                      <strong className="context-lane-heading">Material Shelf</strong>
                      <p className="meta">当前任务已挂载的来源材料。</p>
                    </div>
                    <div className="timeline-list">
                      {detail.sourceContexts.length ? (
                        detail.sourceContexts.map((item) => (
                          <div className="timeline-item" key={item.id}>
                            <div className="task-row">
                              <strong>{item.title}</strong>
                              <span className="signal-pill timeline-badge timeline-item-default">
                                {formatSourceContextKind(item.kind)}
                                {item.isKey ? ' · key' : ''}
                              </span>
                            </div>
                            {item.uri ? (
                              <p className="meta">
                                <a href={item.uri} rel="noreferrer" target="_blank">
                                  {item.uri}
                                </a>
                              </p>
                            ) : null}
                            {item.note ? <p className="meta">{item.note}</p> : null}
                            {item.content ? <p className="meta brief-preview">{item.content}</p> : null}
                            <div className="timeline-actions">
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => populateSourceContextForm(item)}
                                type="button"
                              >
                                编辑来源
                              </button>
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => void handleArchiveCurrentSourceContext(item.id)}
                                type="button"
                              >
                                归档来源
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="meta">当前任务还没有挂载来源材料。</p>
                      )}
                    </div>
                  </div>
                  <form className="stack studio-form" onSubmit={handleSaveSourceContext}>
                    <div className="studio-section-head">
                      <strong>{sourceContextEditingId ? 'Edit Material' : 'Add Material'}</strong>
                      <p className="meta">在这里维护来源标题、链接、说明和是否为关键来源。</p>
                    </div>
                    <label>
                      来源标题
                      <input
                        value={sourceContextTitle}
                        onChange={(event) => {
                          setSourceContextTitle(event.target.value);
                          if (sourceContextError) {
                            setSourceContextError(null);
                          }
                        }}
                      />
                    </label>
                    <label>
                      来源类型
                      <select
                        value={sourceContextKind}
                        onChange={(event) => setSourceContextKind(event.target.value as SourceContextKind)}
                      >
                        {sourceContextKindOptions.map((kind) => (
                          <option key={kind} value={kind}>
                            {formatSourceContextKind(kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="checkbox-row">
                      <input
                        checked={sourceContextIsKey}
                        onChange={(event) => setSourceContextIsKey(event.target.checked)}
                        type="checkbox"
                      />
                      标记为关键来源
                    </label>
                    <label>
                      链接 / URI
                      <input
                        value={sourceContextUri}
                        onChange={(event) => {
                          setSourceContextUri(event.target.value);
                          if (sourceContextError) {
                            setSourceContextError(null);
                          }
                        }}
                      />
                    </label>
                    <label>
                      说明
                      <textarea
                        rows={2}
                        value={sourceContextNote}
                        onChange={(event) => setSourceContextNote(event.target.value)}
                      />
                    </label>
                    <label>
                      补充内容
                      <textarea
                        rows={3}
                        value={sourceContextContent}
                        onChange={(event) => setSourceContextContent(event.target.value)}
                      />
                    </label>
                    {sourceContextError ? <p className="meta">{sourceContextError}</p> : null}
                    <div className="timeline-actions">
                      <button type="submit">{sourceContextEditingId ? '保存来源' : '新增来源'}</button>
                      {sourceContextEditingId ? (
                        <button className="ghost-button" onClick={resetSourceContextForm} type="button">
                          取消编辑
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>

                <div className="transition-group detail-card-group" ref={processContextSectionRef}>
                  <h3>Process Context</h3>
                  <p className="meta">这一层管理任务当前采用的方法和可复用模板库；上方 Resume Card 的 Current Method 就是从这里抽出的当前切片。</p>
                  <div className="studio-section studio-section-process-lane">
                    <div className="studio-section-head">
                      <strong className="context-lane-heading">Active Methods</strong>
                      <p className="meta">当前任务已挂载的方法模板。</p>
                    </div>
                    <div className="timeline-list">
                      {detail.processTemplates.length ? (
                        detail.processTemplates.map((item) => (
                          <div className="timeline-item timeline-item-state" key={item.bindingId}>
                            <div className="task-row">
                              <strong>{item.title}</strong>
                              <span className="signal-pill timeline-badge timeline-item-state">
                                {formatProcessTemplateKind(item.kind)}
                              </span>
                            </div>
                            {item.summary ? <p className="meta">{item.summary}</p> : null}
                            {item.tags.length ? <p className="meta">tags: {item.tags.join(', ')}</p> : null}
                            <p className="meta">active template · bound at {item.boundAt}</p>
                            <p className="meta brief-preview">{item.content}</p>
                            <div className="timeline-actions">
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => populateProcessTemplateForm(item)}
                                type="button"
                              >
                                编辑模板
                              </button>
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => void handleRemoveCurrentProcessTemplate(item.bindingId)}
                                type="button"
                              >
                                移除模板
                              </button>
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => void handleArchiveCurrentProcessTemplate(item.id)}
                                type="button"
                              >
                                归档模板
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="meta">当前任务还没有挂载方法模板。</p>
                      )}
                    </div>
                  </div>
                  <div className="studio-section">
                    <div className="studio-section-head">
                      <strong>Template Library</strong>
                      <p className="meta">可复用的方法模板库，用来给当前任务补充方法卡。</p>
                    </div>
                    <div className="timeline-list">
                      <div className="timeline-item">
                        {detail.availableProcessTemplates.length ? (
                          <div className="stack">
                            {detail.availableProcessTemplates.map((item) => (
                              <div className="task-row" key={item.id}>
                                <div>
                                  <strong>{item.title}</strong>
                                  <p className="meta">
                                    {formatProcessTemplateKind(item.kind)}
                                    {item.summary ? ` · ${item.summary}` : ''}
                                  </p>
                                </div>
                                <button
                                  className="ghost-button timeline-action"
                                  onClick={() => void handleApplyAvailableProcessTemplate(item.id)}
                                  type="button"
                                >
                                  挂载模板
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="meta">当前没有可挂载的其它模板。</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <form className="stack studio-form" onSubmit={handleSaveProcessTemplate}>
                    <div className="studio-section-head">
                      <strong>{processTemplateEditingId ? 'Edit Template' : 'Create Template'}</strong>
                      <p className="meta">维护可复用的方法卡，再决定是否挂到当前任务上。</p>
                    </div>
                    <label>
                      模板标题
                      <input
                        value={processTemplateTitle}
                        onChange={(event) => {
                          setProcessTemplateTitle(event.target.value);
                          if (processTemplateError) {
                            setProcessTemplateError(null);
                          }
                        }}
                      />
                    </label>
                    <label>
                      模板类型
                      <select
                        value={processTemplateKind}
                        onChange={(event) => setProcessTemplateKind(event.target.value as ProcessTemplateKind)}
                      >
                        {processTemplateKindOptions.map((kind) => (
                          <option key={kind} value={kind}>
                            {formatProcessTemplateKind(kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      简述
                      <input
                        value={processTemplateSummary}
                        onChange={(event) => setProcessTemplateSummary(event.target.value)}
                      />
                    </label>
                    <label>
                      标签
                      <input
                        placeholder="writing, outreach, review"
                        value={processTemplateTags}
                        onChange={(event) => setProcessTemplateTags(event.target.value)}
                      />
                    </label>
                    <label>
                      模板内容
                      <textarea
                        rows={5}
                        value={processTemplateContent}
                        onChange={(event) => setProcessTemplateContent(event.target.value)}
                      />
                    </label>
                    {processTemplateError ? <p className="meta">{processTemplateError}</p> : null}
                    <div className="timeline-actions">
                      <button type="submit">
                        {processTemplateEditingId ? '保存模板' : '创建模板并挂载'}
                      </button>
                      {processTemplateEditingId ? (
                        <button className="ghost-button" onClick={resetProcessTemplateForm} type="button">
                          取消编辑
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="meta">先在左侧创建或选择一个任务。</p>
        )}
      </article>
    </section>
  );
}
