import { useState, useRef, useCallback, useEffect } from 'react';
import type { ProjectDecompositionResult, TriggerScheduledEventAgentRunResult } from '@shared/types/ipc';
import type { TaskDetail, TaskListItemRecord, TaskRiskLevel, TaskState, UpdateTaskInput } from '@shared/types/task';
import type { SourceContextRecord } from '@shared/types/source-context';
import type { ArtifactRecord } from '@shared/types/artifact';
import type { TaskFileRecord } from '@shared/types/task-file';
import type { DecisionRecord } from '@shared/types/decision';
import type { RunDetailRecord, RunRecord } from '@shared/types/run';
import type { AiConfigStatus } from '@shared/types/settings';
import { isUnconfirmedPanelCaptureRecord } from '@shared/panel-capture';
import { summarizeDecisionEffects } from '@shared/decision-effect-evaluator';
import type { TaskCloseoutEvaluation } from '@shared/task-closeout-evaluator';
import { evaluateRuntimeVerification, type RuntimeVerificationResult } from '@shared/runtime-verification';
import {
  buildAgentExecutionOrchestrationSnapshot,
  buildStandingApprovalConfirmationDraft,
  evaluateSkillInformedAutomationReadiness,
  type AgentStandingApprovalConfirmationDraft,
} from '@shared/agent-orchestration';
import {
  classifyRuntimeFileSurface,
  classifySourceContextSurface,
  type RuntimeFileSurfaceKind,
} from '@shared/runtime-surface-routing';
import { evaluateRuntimeSubtaskDraft } from '@shared/runtime-subtask-evaluator';
import { evaluateTaskAdvancement } from '@shared/task-advancement-orchestrator';
import { evaluateTaskMdUpdateNeed } from '@shared/task-md-update-need';
import { evaluateTaskRecordWorthiness } from '@shared/task-record-worthiness';
import { isTaskMdPath, isTaskRecordPath } from '@shared/task-memory-path';
import type { PanelRuntimeTimelineEventType } from '@shared/runtime-panel-events';
import {
  groupRuntimeEventsForReplay,
  projectRuntimeEvents,
  type RuntimeEventRecord,
  type RuntimeReplayGroup,
} from '@shared/runtime-event-record';
import {
  effectiveParentTaskId as sharedEffectiveParentTaskId,
  findNextOpenChildAfter,
  orderedChildrenForTask,
  orderedTaskChildren,
} from '@shared/task-hierarchy';
import { selectApplicableWorkHabits as selectApplicableWorkHabitsFromList } from '@shared/work-habit-rules';
import {
  projectPriorityAttention,
  type PriorityRecommendationCandidate,
  type PriorityRecommendationTaskSignal,
} from '@shared/priority-recommendation-ranking';
import { evaluateAgentApiDecompositionPromotionReadinessFromEvidence } from '@shared/ai-runtime-invocation';
import { buildSubtaskCreateManyWritebackApplyPlan } from '@shared/taskplane-writeback-apply-plan';
import {
  buildTaskplaneWritebackApprovalItems,
  type TaskplaneWritebackApprovalItem,
} from '@shared/taskplane-writeback-approval';
import {
  projectSandboxPatchPromotionViews,
  type SandboxPatchPromotionView,
} from '@shared/sandbox-patch-promotion-view';
import { TaskCompletionCheckModal } from '../components/TaskCompletionCheckModal';
import {
  guardDurablePanelAction,
  guardTaskCapture,
  guardTaskMutation,
  guardTaskStateTransition,
  verifyDurablePanelActionCompleted,
} from '../lib/runtimeActionGuards';
import {
  buildProjectDecompositionGuidance,
  buildTaskPlanningPrompt,
  defaultScheduleForType,
  defaultTriggerForType,
  inferTaskTypeProfile,
  clearTaskHierarchyAttributesForPersistedTasks,
  loadTaskAttributes,
  normalizeTaskTypeFacets,
  saveTaskAttributes,
  type TaskAttributeRecord,
  type TaskExecutionType,
} from '../lib/taskAttributes';
import { getPersistedWorkHabitStorageSnapshot, type WorkHabitRecord } from '../lib/workHabits';
import {
  createManualArtifact,
  deleteArtifactWorkspace,
  mergeTaskArtifacts,
  updateArtifactWorkspace,
} from '../lib/artifactWorkspace';
import {
  createLocalTaskFile,
  deleteLocalTaskFile,
  loadLocalTaskFiles,
  loadTaskFileContentOverrides,
  updateLocalTaskFile,
  updateTaskFileContentOverride,
  type LocalTaskFileRecord,
} from '../lib/taskFileWorkspace';
import {
  authoritativeTaskFacets,
  authoritativeTaskType,
} from '../lib/taskHierarchyAdapter';

type Lane = 'escalate' | 'unblock' | 'continue' | 'clarify' | 'steady';
type TaskStatus = 'running' | 'waiting' | 'blocked' | 'idle' | 'done';
type TaskType = TaskExecutionType;
type ViewMode = 'lane' | 'list' | 'timeline';
type TaskDetailViewMode = 'manage' | 'timeline';
type CapturedTaskSummary = { id: string; title: string; type: TaskType };
type SelectedObject = 'task-list' | 'task' | 'file' | 'task-create';
type TaskFileFilter = 'all' | 'task' | 'record' | 'ai_output' | 'artifact' | 'source' | 'file';
type TaskFileClass = RuntimeFileSurfaceKind;
type VirtualTaskFile = {
  id: string;
  taskId: string;
  name: string;
  path: string;
  kind: 'task_record' | 'records_folder' | 'source' | 'artifact' | 'local_file' | 'local_folder';
  content: string;
  editable: boolean;
  updatedAt?: string;
  sourceId?: string;
  sourceRole?: SourceContextRecord['sourceRole'];
  sourceNote?: string | null;
  sourceUri?: string | null;
  artifactId?: string;
  artifactKind?: ArtifactRecord['kind'];
};

function scalarSummaryValue(summary: string | null | undefined, key: string): string | null {
  const text = summary ?? '';
  const part = text.split(' / ').find((item) => item.trim().startsWith(`${key}=`));
  return part?.slice(`${key}=`.length).trim() ?? null;
}

function standingApprovalEvidenceChips(draft: AgentStandingApprovalConfirmationDraft): string[] {
  return [
    `standingApprovalReady=${scalarSummaryValue(draft.evaluation.summary, 'standingApprovalReady') ?? (draft.evaluation.accepted ? 'yes' : 'no')}`,
    `schedulerTriggerAllowed=${draft.schedulerTriggerAllowed ? 'true' : 'false'}`,
    `workspaceWriteAllowed=${draft.workspaceWriteAllowed ? 'true' : 'false'}`,
  ];
}

function projectDecompositionPromotionEvidenceChips(
  readiness: ProjectDecompositionResult['promotionReadiness'],
): string[] {
  if (!readiness) {
    return [];
  }
  const summaryKeys = [
    'proposalId',
    'parentTask',
    'subtaskCount',
    'evidenceRunId',
    'confirmationBoundary',
    'draftOnlyBeforeConfirmation',
    'runtimeMode',
    'invocationLayer',
  ];
  return [
    `promotionReady=${readiness.ready ? 'yes' : 'no'}`,
    `requirements=${readiness.satisfiedRequirements.length}/${readiness.satisfiedRequirements.length + readiness.missingRequirements.length}`,
    `missing=${readiness.missingRequirements.join(',') || 'none'}`,
    ...summaryKeys
      .map((key) => {
        const value = scalarSummaryValue(readiness.summary, key);
        return value ? `${key}=${value}` : null;
      })
      .filter((chip): chip is string => Boolean(chip)),
  ];
}

function scheduledEventAgentRunStartedMessage(result: TriggerScheduledEventAgentRunResult): string {
  const runFailureReason = result.run?.failureReason?.trim();
  const triggerEvidenceItems = result.plan.triggerRunEvidenceRequired.length > 0
    ? `，触发证据项：${result.plan.triggerRunEvidenceRequired.join(',')}`
    : '';
  const runLimit = typeof result.plan.runLimit.runsStartedToday === 'number'
    && typeof result.plan.runLimit.maxRunsPerDay === 'number'
    ? `，限额：${result.plan.runLimit.runsStartedToday}/${result.plan.runLimit.maxRunsPerDay}`
    : '';
  return `已启动受控 Agent run：${result.run?.id ?? 'unknown'}（终态证据：${result.terminalRunEvidenceStatus === 'present' ? '已记录' : '等待中'}，触发证据：${result.triggerRunEvidenceStatus === 'ready_for_terminal_review' ? '可复核' : '等待终态'}${triggerEvidenceItems}${runLimit}，写入：提案模式${runFailureReason ? `，失败原因：${runFailureReason}` : ''}）`;
}
type RelatedFileCategory = 'task' | 'record' | 'ai_output' | 'artifact' | 'source' | 'file';
type RelatedTaskFileItem = {
  file: VirtualTaskFile;
  category: RelatedFileCategory;
  label: string;
  note: string;
};
type TaskDirectoryGroup = {
  root: Task;
  children: Task[];
  rootMatches: boolean;
};
type ExecutionQueueItem = {
  task: Task;
  parentTask: Task | null;
  rankBand: number;
  reason: string;
  nextAction: string;
};
type PendingFileSwitch = (() => void) | null;
type PostCompletionHandoff = {
  completedTask: Task;
  nextTask: Task | null;
  parentTask: Task | null;
  evaluation: TaskCloseoutEvaluation | null;
  startVerification?: RuntimeVerificationResult | null;
};
type FileContextMenuState = {
  fileId: string;
  x: number;
  y: number;
};
export type TaskWorkspaceSelectionContext = {
  taskId: string | null;
  taskTitle: string | null;
  parentTaskId: string | null;
  childTaskIds: string[];
  selectedFile: {
    path: string;
    kind: string;
    dirty?: boolean;
    contentPreview: string | null;
  } | null;
};

interface Task {
  id: string;
  title: string;
  lane: Lane;
  status: TaskStatus;
  type: TaskType;
  facets: TaskType[];
  owner?: 'user' | 'system';
  visibility?: 'visible' | 'hidden';
  parentTaskId?: string;
  childTaskIds: string[];
  whyNow?: string;
  nextStep?: string;
  waitingOn?: string;
  riskLevel: TaskRiskLevel;
  activeBlockerCreatedAt?: string;
  commitment?: string;
  schedule?: string;
  trigger?: string;
  dependencyId?: string;
  blockedByTaskId?: string;
  dependencyReady?: boolean;
  createdAt: string;
  updatedAtIso: string;
  updatedAt: string;
  state: TaskState;
}

const LANE_LABELS: Record<Lane, string> = {
  escalate: '优先处理',
  unblock:  '解除阻塞',
  continue: '继续推进',
  clarify:  '待明确',
  steady:   '平稳推进',
};

const LANE_ORDER: Lane[] = ['escalate', 'unblock', 'continue', 'clarify', 'steady'];

type Lens =
  | 'all'
  | 'running' | 'waiting' | 'blocked' | 'clarify'
  | 'needsDecision'
  | 'simple' | 'project' | 'scheduled' | 'event' | 'routine'
  | 'composite'
  | 'done'
  | `project:${string}`;

type ExplorerGroup = 'status' | 'type' | 'files';

const DEFER_OPTIONS = [
  { label: '明天', value: 'tomorrow' },
  { label: '本周末', value: 'weekend' },
  { label: '下周一', value: 'next-monday' },
  { label: '选日期…', value: 'custom' },
];

const RELATED_FILE_CATEGORY_ORDER: Array<{ key: RelatedFileCategory; label: string }> = [
  { key: 'task', label: '任务说明' },
  { key: 'record', label: '记录文件' },
  { key: 'ai_output', label: 'AI 产出' },
  { key: 'artifact', label: '产物文件' },
  { key: 'source', label: '来源材料' },
  { key: 'file', label: '任务文件' },
];

const TASK_FILE_FILTERS: Array<{ key: TaskFileFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'task', label: '任务说明' },
  { key: 'record', label: '记录' },
  { key: 'ai_output', label: 'AI 产出' },
  { key: 'artifact', label: '产物' },
  { key: 'source', label: '来源' },
  { key: 'file', label: '文件' },
];

function deferLabel(value: string): string {
  return DEFER_OPTIONS.find((opt) => opt.value === value)?.label ?? value;
}

/* ─── Map real task record → UI task ─── */

function derivelane(r: TaskListItemRecord): Lane {
  if (r.riskLevel === 'high') return 'escalate';
  if (r.activeDependency) return 'unblock';
  if (r.activeBlocker || r.state === 'waiting_external') return 'unblock';
  if (r.state === 'running') return 'continue';
  if (r.state === 'captured') return 'clarify';
  if (r.riskLevel === 'medium') return 'unblock';
  if (r.state === 'completed' || r.state === 'archived') return 'steady';
  return 'continue';
}

function deriveStatus(r: TaskListItemRecord): TaskStatus {
  if (r.state === 'running') return 'running';
  if (r.state === 'waiting_external') return 'waiting';
  if (r.activeDependency) return 'blocked';
  if (r.activeBlocker) return 'blocked';
  if (r.state === 'completed' || r.state === 'archived') return 'done';
  return 'idle';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `更新 ${d.getMonth() + 1}月${d.getDate()}日`;
}

function compactTaskTitle(value: string): string {
  return value.replace(/[\s:：,，.。/\\|()[\]（）【】_-]+/g, '').trim();
}

function projectTaskKeyword(value: string): string {
  return compactTaskTitle(value).replace(/^(开发|实现|建设|搭建|制作|设计|优化|测试|上线|发布|完成|推进)/, '');
}

function taskDependencyText(task: Task): string {
  return compactTaskTitle(task.waitingOn ?? '');
}

function taskHasProjectDependencySignal(task: Task, allTasks: Task[], projectKey: string): boolean {
  const taskTitle = compactTaskTitle(task.title);
  const dependencyText = taskDependencyText(task);
  if (dependencyText.includes(projectKey)) return true;

  return allTasks.some((candidate) => {
    const candidateTitle = compactTaskTitle(candidate.title);
    const candidateDependencyText = taskDependencyText(candidate);
    return candidateTitle.includes(projectKey)
      && (
        candidate.blockedByTaskId === task.id
        || candidateDependencyText.includes(taskTitle)
      );
  });
}

function rendererInferredProjectParentTaskId(task: Task, allTasks: Task[]): string | null {
  if (task.parentTaskId) return null;
  const taskTitle = compactTaskTitle(task.title);
  if (!taskTitle) return null;
  return allTasks.find((candidate) => {
    if (candidate.id === task.id || candidate.parentTaskId || candidate.status === 'done') return false;
    const key = projectTaskKeyword(candidate.title);
    if (key.length < 2 || !taskTitle.includes(key)) return false;
    return taskHasProjectDependencySignal(task, allTasks, key);
  })?.id ?? null;
}

function effectiveParentTaskId(task: Task, allTasks: Task[]): string | null {
  return sharedEffectiveParentTaskId(task, allTasks)
    ?? rendererInferredProjectParentTaskId(task, allTasks);
}

function isTopLevelRuntimeTask(task: Task, allTasks: Task[]): boolean {
  return !effectiveParentTaskId(task, allTasks);
}

function hasTaskStructure(task: Task, allTasks: Task[]): boolean {
  return orderedChildrenForTask(task, allTasks).some((child) => child.status !== 'done');
}

function effectiveTaskType(task: Task, allTasks: Task[]): TaskType {
  if (!effectiveParentTaskId(task, allTasks) && hasTaskStructure(task, allTasks)) return 'project';
  return task.type;
}

function isTaskTypeLens(lens: Lens): boolean {
  return lens === 'simple'
    || lens === 'project'
    || lens === 'scheduled'
    || lens === 'event'
    || lens === 'routine'
    || lens === 'composite'
    || lens.startsWith('project:');
}

function taskHasPendingDecision(task: Task, decisions: DecisionRecord[]): boolean {
  return decisions.some((decision) => decision.taskId === task.id);
}

function isProgressingTask(task: Task): boolean {
  if (task.status === 'done' || task.status === 'waiting' || task.status === 'blocked') return false;
  if (task.status === 'running') return true;
  return Boolean(task.nextStep) || task.lane === 'continue' || task.lane === 'escalate';
}

function isClarifyTask(task: Task): boolean {
  return task.status !== 'done'
    && task.status !== 'waiting'
    && task.status !== 'blocked'
    && task.lane === 'clarify'
    && !isProgressingTask(task);
}

function executionQueueItemForTask(task: Task, allTasks: Task[], decisions: DecisionRecord[]): ExecutionQueueItem {
  const parentTaskId = effectiveParentTaskId(task, allTasks);
  const parentTask = parentTaskId
    ? allTasks.find((candidate) => candidate.id === parentTaskId) ?? null
    : null;

  if (taskHasPendingDecision(task, decisions)) {
    return {
      task,
      parentTask,
      rankBand: 0,
      reason: '需拍板',
      nextAction: '去拍板',
    };
  }
  if (task.dependencyReady) {
    return {
      task,
      parentTask,
      rankBand: 1,
      reason: '可解除依赖',
      nextAction: '解除依赖',
    };
  }
  if (isProgressingTask(task)) {
    return {
      task,
      parentTask,
      rankBand: 2,
      reason: '下一步明确',
      nextAction: task.type === 'project' ? '推进项目' : '进入任务',
    };
  }
  if (task.status === 'blocked') {
    return {
      task,
      parentTask,
      rankBand: 3,
      reason: '有前置阻塞',
      nextAction: '查看阻塞',
    };
  }
  if (task.lane === 'clarify') {
    return {
      task,
      parentTask,
      rankBand: 4,
      reason: '需补下一步',
      nextAction: '补充下一步',
    };
  }
  if (task.status === 'waiting') {
    return {
      task,
      parentTask,
      rankBand: 5,
      reason: '等待外部条件',
      nextAction: '查看等待',
    };
  }
  return {
    task,
    parentTask,
    rankBand: 6,
    reason: '按需处理',
    nextAction: '进入任务',
  };
}

function executionQueueStatusLabel(task: Task, item: ExecutionQueueItem): string {
  if (item.rankBand === 0) return '待拍板';
  if (task.status === 'blocked') return task.dependencyReady ? '可复核' : '有阻塞';
  if (task.status === 'waiting') return '等待中';
  if (isProgressingTask(task)) return '推进中';
  if (task.lane === 'clarify') return '待明确';
  return formatTaskStatus(task.status);
}

function executionQueueStatusTone(task: Task, item: ExecutionQueueItem): string {
  if (item.rankBand === 0) return 'decision';
  if (task.status === 'blocked') return task.dependencyReady ? 'ready' : 'blocked';
  if (task.status === 'waiting') return 'waiting';
  if (isProgressingTask(task)) return 'running';
  return statusDot(task.status) || 'idle';
}

function taskStatusLabel(task: Task): string {
  if (task.status === 'blocked') return task.dependencyReady ? '可复核' : '有阻塞';
  if (task.status === 'waiting') return '等待中';
  if (isProgressingTask(task)) return '推进中';
  if (isClarifyTask(task)) return '待明确';
  return formatTaskStatus(task.status);
}

function taskStatusTone(task: Task): string {
  if (task.status === 'blocked') return task.dependencyReady ? 'ready' : 'blocked';
  if (task.status === 'waiting') return 'waiting';
  if (isProgressingTask(task)) return 'running';
  if (isClarifyTask(task)) return 'clarify';
  return statusDot(task.status) || 'idle';
}

function taskDisplayStatusLabel(task: Task): string {
  if (isProgressingTask(task)) return '推进中';
  return formatTaskStatus(task.status);
}

function formatCompactWaitingOn(value: string): string {
  return value.replace(/^依赖可复核：/, '可复核：').replace(/^依赖：/, '依赖上一步：').replace(/^等待：/, '等待：');
}

function executionTimeScore(task: Task): number {
  const now = Date.now();
  const updatedAt = new Date(task.updatedAtIso).getTime();
  const createdAt = new Date(task.createdAt).getTime();
  let score = 0;
  if (task.type === 'scheduled' || task.schedule) score += 20;
  if (task.type === 'event' || task.trigger) score += 10;
  if (!Number.isNaN(updatedAt) && now - updatedAt <= 24 * 60 * 60 * 1000) score += 8;
  if (!Number.isNaN(createdAt) && now - createdAt <= 24 * 60 * 60 * 1000) score += 4;
  return score;
}

function projectChildOrderIndex(task: Task, allTasks: Task[]): number {
  const parentTaskId = effectiveParentTaskId(task, allTasks);
  if (!parentTaskId) return Number.POSITIVE_INFINITY;
  const parent = allTasks.find((candidate) => candidate.id === parentTaskId);
  if (!parent) return Number.POSITIVE_INFINITY;
  const index = parent.childTaskIds.indexOf(task.id);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function executionQueueFallbackOrder(left: ExecutionQueueItem, right: ExecutionQueueItem, allTasks: Task[]): number {
  const leftParentId = effectiveParentTaskId(left.task, allTasks);
  const rightParentId = effectiveParentTaskId(right.task, allTasks);
  if (leftParentId && leftParentId === rightParentId) {
    const leftProjectOrder = projectChildOrderIndex(left.task, allTasks);
    const rightProjectOrder = projectChildOrderIndex(right.task, allTasks);
    if (leftProjectOrder !== rightProjectOrder) return leftProjectOrder - rightProjectOrder;
  }
  if (left.task.dependencyId && !right.task.dependencyId) return 1;
  if (!left.task.dependencyId && right.task.dependencyId) return -1;
  const timeDiff = executionTimeScore(right.task) - executionTimeScore(left.task);
  if (timeDiff !== 0) return timeDiff;
  const laneDiff = LANE_ORDER.indexOf(left.task.lane) - LANE_ORDER.indexOf(right.task.lane);
  if (laneDiff !== 0) return laneDiff;
  return right.task.updatedAtIso.localeCompare(left.task.updatedAtIso);
}

function priorityLaneFromTask(task: Task, item: ExecutionQueueItem): PriorityRecommendationCandidate['lane'] {
  if (item.rankBand === 0) return 'unblock_or_decide';
  if (task.riskLevel === 'high') return 'escalate_now';
  if (task.status === 'blocked' || task.dependencyReady || task.activeBlockerCreatedAt) return 'unblock_or_decide';
  if (task.status === 'waiting' || task.lane === 'clarify') return 'clarify';
  if (task.status === 'done') return 'steady';
  return 'continue_or_review';
}

function priorityCandidateForExecutionItem(
  item: ExecutionQueueItem,
  order: number,
  decisions: DecisionRecord[],
): PriorityRecommendationCandidate {
  const task = item.task;
  if (taskHasPendingDecision(task, decisions)) {
    return { id: `decision:${task.id}`, taskId: task.id, lane: 'unblock_or_decide', priority: 'high', order };
  }
  if (task.riskLevel === 'high') {
    return { id: `risk:${task.id}`, taskId: task.id, lane: 'escalate_now', priority: 'high', order };
  }
  if (task.activeBlockerCreatedAt) {
    return { id: `blocker:${task.id}`, taskId: task.id, lane: priorityLaneFromTask(task, item), priority: 'medium', order };
  }
  if (task.dependencyId) {
    return { id: `task-dependency:${task.dependencyId}`, taskId: task.id, lane: task.dependencyReady ? 'continue_or_review' : 'unblock_or_decide', priority: 'medium', order };
  }
  if (task.status === 'waiting') {
    return { id: `waiting:${task.id}`, taskId: task.id, lane: 'clarify', priority: 'medium', order };
  }
  if (task.lane === 'clarify') {
    return { id: `next-step:${task.id}`, taskId: task.id, lane: 'clarify', priority: 'medium', order };
  }
  return { id: `next-step:${task.id}`, taskId: task.id, lane: priorityLaneFromTask(task, item), priority: 'low', order };
}

function priorityTaskSignalFromTask(task: Task): PriorityRecommendationTaskSignal {
  return {
    id: task.id,
    activeDependency: task.blockedByTaskId ? { blockedByTaskId: task.blockedByTaskId } : null,
    activeBlocker: task.activeBlockerCreatedAt ? { createdAt: task.activeBlockerCreatedAt } : null,
  };
}

function buildExecutionQueueItems(tasks: Task[], allTasks: Task[], decisions: DecisionRecord[]): ExecutionQueueItem[] {
  const rootTasks = Array.from(
    new Map(tasks.map((task) => {
      const root = rootTaskFor(task, allTasks);
      return [root.id, root] as const;
    })).values(),
  );
  const taskSet = new Set(rootTasks.map((task) => task.id));
  const taskSignalById = new Map(allTasks.map((task) => [task.id, priorityTaskSignalFromTask(task)]));
  const items = rootTasks
    .filter((task) => {
      if (task.status === 'done') return true;
      const activeChildren = allTasks.filter((candidate) => (
        effectiveParentTaskId(candidate, allTasks) === task.id
        && candidate.status !== 'done'
        && taskSet.has(candidate.id)
      ));
      if (activeChildren.length === 0) return true;
      if (taskHasPendingDecision(task, decisions)) return true;
      if (task.status === 'blocked' || task.status === 'waiting') return true;
      return false;
    })
    .map((task) => executionQueueItemForTask(task, allTasks, decisions));
  const fallbackOrderByTaskId = new Map(
    [...items]
      .sort((left, right) => executionQueueFallbackOrder(left, right, allTasks))
      .map((item, index) => [item.task.id, index]),
  );

  return projectPriorityAttention({
    candidates: items.map((item) => ({
      item,
      ...priorityCandidateForExecutionItem(item, fallbackOrderByTaskId.get(item.task.id) ?? 0, decisions),
    })),
    taskById: taskSignalById,
  }).items
    .map((candidate) => candidate.item);
}

function rootTaskFor(task: Task, allTasks: Task[]): Task {
  let current = task;
  const seen = new Set<string>();
  let parentTaskId = effectiveParentTaskId(current, allTasks);
  while (parentTaskId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = allTasks.find((candidate) => candidate.id === parentTaskId);
    if (!parent) break;
    current = parent;
    parentTaskId = effectiveParentTaskId(current, allTasks);
  }
  return current;
}

function buildTaskDirectoryGroups(tasks: Task[], allTasks: Task[]): TaskDirectoryGroup[] {
  const candidateIds = new Set(tasks.map((task) => task.id));
  const groups = new Map<string, TaskDirectoryGroup>();

  for (const task of tasks) {
    const root = rootTaskFor(task, allTasks);
    const existing = groups.get(root.id) ?? {
      root,
      children: [],
      rootMatches: candidateIds.has(root.id),
    };

    if (task.id !== root.id) {
      existing.children.push(task);
    }

    groups.set(root.id, existing);
  }

  return [...groups.values()]
    .map((group) => {
      if (group.rootMatches) {
        const children = orderedChildrenForTask(group.root, allTasks)
          .filter((child) => child.status !== 'done' || candidateIds.has(child.id));
        return {
          ...group,
          children: uniqueTasksById([...children, ...group.children]),
        };
      }
      return {
        ...group,
        children: uniqueTasksById(group.children),
      };
    })
    .sort((a, b) => {
      const laneDiff = LANE_ORDER.indexOf(a.root.lane) - LANE_ORDER.indexOf(b.root.lane);
      if (laneDiff !== 0) return laneDiff;
      return b.root.updatedAtIso.localeCompare(a.root.updatedAtIso);
    });
}

function uniqueTasksById(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  const result: Task[] = [];
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    result.push(task);
  }
  return result;
}

function buildCompletionHandoffContent(completedTask: Task, nextTask: Task, parentTask: Task | null): string {
  return [
    '# Record: Task Completion Handoff',
    '',
    '## Trigger',
    '任务完成后，用户确认继续处理下一项项目子任务。',
    '',
    '## From',
    `- ${completedTask.title}`,
    '',
    '## To',
    `- ${nextTask.title}`,
    parentTask ? `- Parent project: ${parentTask.title}` : null,
    '',
    '## Completion Check',
    '- 当前任务已通过完成确认流程进入完成状态。',
    '',
    '## Carry Forward',
    '- 下一任务应读取自身 Task.md、Task Records、结构化任务状态，以及本交接记录中说明的父项目顺序关系。',
    '',
    '## Next',
    `- 切换到「${nextTask.title}」后，先确认下一步行动、完成标准和是否需要补充上下文。`,
    '',
  ].filter((line): line is string => line !== null).join('\n');
}

function buildNextTaskPrompt(completedTask: Task, nextTask: Task, parentTask: Task | null): string {
  return [
    `刚刚已完成「${completedTask.title}」。`,
    parentTask ? `它属于项目「${parentTask.title}」。` : null,
    `现在请切换到下一项任务「${nextTask.title}」。`,
    '',
    '请先按 Taskplane Agent Operating Principles 读取并重建这个任务的上下文，然后简要说明：',
    '1. 为什么这是下一步；',
    '2. 当前任务的第一步应该是什么；',
    '3. 是否需要补充完成标准、任务文件或用户确认。',
  ].filter((line): line is string => line !== null).join('\n');
}

function toTaskListItemRecord(task: Task): TaskListItemRecord {
  return {
    id: task.id,
    title: task.title,
    summary: task.whyNow ?? null,
    state: task.state,
    nextStep: task.nextStep ?? null,
    waitingReason: task.waitingOn ?? null,
    riskLevel: task.riskLevel,
    riskNote: null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAtIso,
    activeWaitingItem: null,
    activeBlocker: task.activeBlockerCreatedAt
      ? {
        id: `blocker:${task.id}`,
        taskId: task.id,
        title: '当前仍有阻塞项',
        kind: 'other',
        detail: null,
        owner: null,
        responsibility: null,
        responsibilityLabel: null,
        sourceContextId: null,
        status: 'active',
        createdAt: task.activeBlockerCreatedAt,
        updatedAt: task.activeBlockerCreatedAt,
        resolvedAt: null,
      }
      : null,
    activeDependency: task.dependencyId
      ? {
        id: task.dependencyId,
        taskId: task.id,
        blockedByTaskId: task.blockedByTaskId ?? '',
        blockedByTaskTitle: task.waitingOn ?? null,
        reason: task.waitingOn ?? null,
        status: 'active',
        createdAt: task.createdAt,
        updatedAt: task.updatedAtIso,
        resolvedAt: null,
      }
      : null,
    dependencyReevaluation: task.dependencyReady && task.dependencyId
      ? {
        dependencyId: task.dependencyId,
        upstreamTaskId: task.blockedByTaskId ?? '',
        upstreamTaskTitle: task.waitingOn ?? '上游任务',
        status: 'upstream_ready',
        updatedAt: task.updatedAtIso,
      }
      : null,
  };
}

function completionHandoffFromEvaluation(task: Task, allTasks: Task[]): PostCompletionHandoff {
  const root = rootTaskFor(task, allTasks);
  const parentTask = root.id !== task.id ? root : null;
  const record = toTaskListItemRecord(task);
  const taskDetail = {
    ...record,
    artifacts: [],
    completionCriteria: [],
    sourceContexts: [],
    taskFiles: [],
    processTemplates: [],
    availableProcessTemplates: [],
    timeline: [],
    resumeCard: {
      summary: task.whyNow ?? '',
      currentState: task.status,
      latestChange: { summary: '任务完成确认', action: { label: null, targetType: null, targetId: null } },
      completionStatus: { total: 0, satisfied: 0, open: 0, summary: '完成确认已通过' },
      currentBlocker: { blockerId: record.activeBlocker?.id ?? null, title: record.activeBlocker?.title ?? '无', detail: record.activeBlocker?.detail ?? null },
      currentDependency: record.activeDependency
        ? {
          dependencyId: record.activeDependency.id,
          title: record.activeDependency.blockedByTaskTitle ?? record.activeDependency.blockedByTaskId,
          detail: record.activeDependency.reason,
        }
        : undefined,
      keySource: { sourceContextId: null, title: '无', detail: null, priorityReason: null },
      currentMethod: { templateId: null, title: '无', detail: null, selectionReason: null },
      nextSuggestedMove: task.nextStep ?? '继续推进',
    },
  } satisfies TaskDetail;
  const children = allTasks.filter((candidate) => effectiveParentTaskId(candidate, allTasks) === task.id);
  const evaluation = evaluateRuntimeVerification({
    mode: 'task_closeout',
    intent: 'task_completion',
    task: taskDetail,
    childTaskIds: task.childTaskIds,
    childTasks: children.map(toTaskListItemRecord),
  }).taskCloseout;
  if (!evaluation) {
    throw new Error('任务完成检查未返回任务收尾结论。');
  }
  const fallback = findNextOpenChildAfter(task, allTasks);
  const nextTask = evaluation.nextTaskId
    ? allTasks.find((candidate) => candidate.id === evaluation.nextTaskId) ?? fallback.nextTask
    : fallback.nextTask;
  return {
    completedTask: task,
    nextTask,
    parentTask,
    evaluation,
    startVerification: null,
  };
}

function evaluateCompletionHandoffStart(params: {
  completedTask: Task;
  nextTask: Task;
  nextTaskDetail: TaskDetail | null;
  parentTask: Task | null;
}): RuntimeVerificationResult {
  const expectedParentTaskId = params.parentTask?.id ?? null;
  const nextContextRecord = params.nextTaskDetail ?? toTaskListItemRecord(params.nextTask);
  const nextRecord = {
    ...nextContextRecord,
    parentTaskId: params.nextTask.parentTaskId ?? expectedParentTaskId,
  };
  return evaluateRuntimeVerification({
    mode: 'subtask_start',
    targetTask: nextRecord,
    parentTask: params.parentTask ? toTaskListItemRecord(params.parentTask) : null,
    expectedParentTaskId,
    previousTask: toTaskListItemRecord(params.completedTask),
    requiresPreviousHandoff: true,
    previousHandoffAvailable: true,
    contextSignals: {
      targetTaskId: params.nextTask.id,
    },
    availableContext: {
      taskState: true,
      taskMd: hasTaskMdFile(params.nextTaskDetail),
      relevantTaskRecords: hasRelevantTaskRecordFile(params.nextTaskDetail),
      completionCriteria: hasKnownCompletionOrNextStep(nextContextRecord),
      nextStep: Boolean(nextContextRecord.nextStep?.trim()),
      parentConstraints: Boolean(params.parentTask),
      handoffNotes: true,
      decisions: true,
    },
  });
}

function hasTaskMdFile(task: TaskDetail | null): boolean | undefined {
  if (!task?.taskFiles) return undefined;
  return task.taskFiles.some((file) => isTaskMdPath(file.path));
}

function hasRelevantTaskRecordFile(task: TaskDetail | null): boolean | undefined {
  if (!task?.taskFiles) return undefined;
  return task.taskFiles.some((file) => isTaskRecordPath(file.path));
}

function hasKnownCompletionOrNextStep(task: TaskDetail | TaskListItemRecord | null): boolean | undefined {
  if (!task) return undefined;
  if ('completionCriteria' in task && task.completionCriteria.length > 0) return true;
  if (task.nextStep?.trim()) return true;
  if ('completionCriteria' in task) return false;
  return undefined;
}

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  simple:    '一次性',
  project:   '项目型',
  scheduled: '定时',
  event:     '事件',
  routine:   '常设',
};

function buildVisibleTaskPlanningDraft(taskTitle: string, type: TaskType): string {
  if (type === 'project') {
    return `请帮我拆解「${taskTitle}」，先给出子任务方案，不要直接创建。`;
  }
  if (type === 'scheduled') {
    return `请帮我规划「${taskTitle}」的周期、触发时间和下一次执行前要确认的信息。`;
  }
  if (type === 'event') {
    return `请帮我规划「${taskTitle}」的触发条件、处理边界和下一步确认项。`;
  }
  if (type === 'routine') {
    return `请帮我规划「${taskTitle}」的维护范围、检查节奏和记录方式。`;
  }
  return `请帮我规划「${taskTitle}」的目标、验收标准和下一步行动。`;
}

function extractTaskRecordLine(content: string, heading: string): string | null {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const headingIndex = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (headingIndex < 0) return null;
  const collected: string[] = [];
  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed)) break;
    if (!trimmed || trimmed.startsWith('#')) continue;
    collected.push(trimmed.replace(/^[-*]\s+/, ''));
    if (collected.join(' ').length >= 120) break;
  }
  return collected.join(' ').trim() || null;
}

function latestTaskRecordSummary(files: LocalTaskFileRecord[]): {
  confirmed: string | null;
  focus: string | null;
  open: string | null;
} | null {
  const records = files
    .filter((file) => isTaskRecordPath(file.path))
    .filter((file) => file.content.trim())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latest = records[0];
  if (!latest) return null;
  const summary = extractTaskRecordLine(latest.content, 'Summary');
  const confirmed = extractTaskRecordLine(latest.content, 'Confirmed');
  const open = extractTaskRecordLine(latest.content, 'Open');
  const focus = summary?.match(/最近关注[：:]\s*(.+)$/m)?.[1]?.trim()
    ?? summary
    ?? confirmed
    ?? open;
  return {
    confirmed,
    focus,
    open,
  };
}

function buildChildTaskAdvanceDraft(child: Task, _parent: Task, files: LocalTaskFileRecord[] = []): string {
  const record = latestTaskRecordSummary(files);
  if (record?.focus || record?.confirmed || record?.open) {
    return [
      `基于已有任务记录继续推进「${child.title}」。`,
      '先收束首版目标、范围、非目标和下一步；只有关键缺口会阻止推进时再提问。',
    ].filter(Boolean).join('\n');
  }
  return `先帮我把「${child.title}」推进到可执行状态：确认目标、范围和下一步。`;
}

function isGenericAgentReviewStep(value: string): boolean {
  return /审阅最新\s*(agent|draft|run|执行|产物)|决定是否继续推进|review latest/i.test(value);
}

function formatTaskTypeForDisplay(task: Task, parentTask: Task | null, displayType: TaskType = task.type): string {
  if (parentTask) return displayType === 'project' ? '子项目型' : '项目子任务';
  return task.facets.length > 1 && displayType === task.type
    ? `${TASK_TYPE_LABELS[displayType]} · 复合`
    : TASK_TYPE_LABELS[displayType];
}

function formatSecondaryFacets(task: Task, displayType: TaskType = task.type): string[] {
  return task.facets
    .filter((facet) => facet !== displayType && !(displayType === 'project' && facet === 'simple'))
    .map((facet) => TASK_TYPE_LABELS[facet]);
}

function isAutonomousTaskClass(task: Task): boolean {
  return task.type === 'scheduled'
    || task.type === 'event'
    || task.type === 'routine'
    || task.facets.includes('scheduled')
    || task.facets.includes('event')
    || task.facets.includes('routine');
}

function buildStandingApprovalDraftForTask(
  task: Task,
  detail: TaskDetail,
  aiStatus: AiConfigStatus,
): AgentStandingApprovalConfirmationDraft {
  const taskForReadiness = {
    ...detail,
    taskFacets: task.facets,
    taskType: task.type,
  };
  const snapshot = buildAgentExecutionOrchestrationSnapshot(aiStatus);
  const readiness = evaluateSkillInformedAutomationReadiness({
    snapshot,
    task: taskForReadiness,
  });

  return buildStandingApprovalConfirmationDraft({
    now: new Date(),
    readiness,
    runtimeId: snapshot.runtime.id,
    task: {
      id: task.id,
      riskLevel: detail.riskLevel,
      taskFacets: task.facets,
      taskType: task.type,
    },
  });
}

function hasConfirmedStandingApproval(
  detail: TaskDetail,
  draftId: string,
): boolean {
  return detail.timeline.some((event) => {
    if (event.type !== 'panel.standing_approval_confirmed') return false;
    if (!event.payload) return false;
    try {
      const payload = JSON.parse(event.payload) as {
        policy?: { id?: unknown };
      };
      return payload.policy?.id === draftId;
    } catch {
      return false;
    }
  });
}

function lensForTaskType(task: Task, allTasks: Task[]): Lens {
  const displayType = effectiveTaskType(task, allTasks);
  if (displayType !== task.type) return displayType;
  if (task.facets.length > 1) return 'composite';
  return task.type;
}

function shouldUpgradeLegacySimpleTaskType(
  task: TaskListItemRecord,
  attrs: TaskAttributeRecord | null | undefined,
  inferredType: TaskType,
): boolean {
  if (inferredType === 'simple') return false;
  if (attrs?.typeConfirmed === true) return false;
  if (task.taskType !== 'simple') return false;
  if (task.parentTaskId) return false;
  const normalizedTitle = task.title.toLowerCase();
  return /项目|开发|实现|建设|搭建|制作|设计|优化|测试|上线|发布|完成|推进|重构|完整|方案|计划|campaign|project|app|应用|软件/.test(
    normalizedTitle,
  );
}

const RISK_OPTIONS: Array<{ label: string; value: TaskRiskLevel }> = [
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
  { label: '无', value: 'none' },
];

function fromRecord(r: TaskListItemRecord, attrs?: TaskAttributeRecord | null): Task {
  const inferredProfile = inferTaskTypeProfile(r.title);
  const authoritativeType = authoritativeTaskType(r, attrs);
  const persistedTypeLooksLikeLegacyDefault = shouldUpgradeLegacySimpleTaskType(r, attrs, inferredProfile.primaryType);
  const type = persistedTypeLooksLikeLegacyDefault
    ? inferredProfile.primaryType
    : authoritativeType ?? inferredProfile.primaryType;
  const facets = normalizeTaskTypeFacets(
    persistedTypeLooksLikeLegacyDefault
      ? inferredProfile.facets
      : authoritativeTaskFacets(r, attrs) ?? inferredProfile.facets,
    type,
  );
  return {
    id: r.id,
    title: r.title,
    lane: derivelane(r),
    status: deriveStatus(r),
    type,
    facets,
    owner: attrs?.owner ?? 'user',
    visibility: attrs?.visibility ?? 'visible',
    parentTaskId: r.parentTaskId ?? undefined,
    childTaskIds: r.childTaskIds ?? [],
    whyNow: r.summary ?? undefined,
    nextStep: r.nextStep ?? undefined,
    riskLevel: r.riskLevel,
    activeBlockerCreatedAt: r.activeBlocker?.createdAt,
    waitingOn: r.activeDependency
      ? r.dependencyReevaluation
        ? `依赖可复核：${r.dependencyReevaluation.upstreamTaskTitle}`
        : `依赖：${r.activeDependency.blockedByTaskTitle ?? r.activeDependency.reason ?? '上游任务'}`
      : r.waitingReason ? `等待：${r.waitingReason}` : undefined,
    dependencyId: r.activeDependency?.id,
    blockedByTaskId: r.activeDependency?.blockedByTaskId,
    dependencyReady: Boolean(r.dependencyReevaluation),
    commitment: attrs?.commitment ?? undefined,
    schedule: attrs?.schedule ?? undefined,
    trigger: attrs?.trigger ?? undefined,
    createdAt: r.createdAt,
    updatedAtIso: r.updatedAt,
    updatedAt: formatDate(r.updatedAt),
    state: r.state,
  };
}

function confirmedTaskRecords(records: TaskListItemRecord[]): TaskListItemRecord[] {
  return records.filter((record) => !isUnconfirmedPanelCaptureRecord(record));
}

interface TasksPageProps {
  onOpenPanel: (taskId: string, draftPrompt?: string, taskTitle?: string, autoSendDraftPrompt?: boolean, forceTaskBinding?: boolean, prefillDraftPrompt?: boolean) => void;
  onOpenDecision: () => void;
  onSelectionContextChange?: (context: TaskWorkspaceSelectionContext) => void;
  focusTaskId?: string | null;
}

export function TasksPage({ onOpenPanel, onOpenDecision, onSelectionContextChange, focusTaskId = null }: TasksPageProps) {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [lens, setLens] = useState<Lens>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('lane');
  const [taskDetailViewMode, setTaskDetailViewMode] = useState<TaskDetailViewMode>('manage');
  const [openGroups, setOpenGroups] = useState<Record<ExplorerGroup, boolean>>({
    status: true,
    type: true,
    files: true,
  });
  const [openTypeGroups, setOpenTypeGroups] = useState<Record<string, boolean>>({});
  const [expandedTypeGroups, setExpandedTypeGroups] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<SelectedObject>('task-list');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [fileDraft, setFileDraft] = useState('');
  const [fileDirty, setFileDirty] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [fileFilter, setFileFilter] = useState<TaskFileFilter>('all');
  const [showNewFileMenu, setShowNewFileMenu] = useState(false);
  const [fileContextMenu, setFileContextMenu] = useState<FileContextMenuState | null>(null);
  const [patchReviewPreviewMessages, setPatchReviewPreviewMessages] = useState<Record<string, string>>({});
  const [previewingPatchReviewArtifactId, setPreviewingPatchReviewArtifactId] = useState<string | null>(null);
  const [runningPatchReviewArtifactId, setRunningPatchReviewArtifactId] = useState<string | null>(null);
  const [applyingPatchPromotionCheckpointId, setApplyingPatchPromotionCheckpointId] = useState<string | null>(null);
  const [sandboxPatchPromotionApplyEnabled, setSandboxPatchPromotionApplyEnabled] = useState(false);
  const [aiConfigStatus, setAiConfigStatus] = useState<AiConfigStatus | null>(null);
  const [fileContentOverrides, setFileContentOverrides] = useState<Record<string, string>>(() => loadTaskFileContentOverrides());
  const [localTaskFiles, setLocalTaskFiles] = useState<Record<string, LocalTaskFileRecord[]>>(() => loadLocalTaskFiles());
  const [pendingFileSwitch, setPendingFileSwitch] = useState<PendingFileSwitch>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetail | null>(null);
  const [selectedSources, setSelectedSources] = useState<SourceContextRecord[]>([]);
  const [selectedArtifacts, setSelectedArtifacts] = useState<ArtifactRecord[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<RunRecord[]>([]);
  const [selectedRunDetailsById, setSelectedRunDetailsById] = useState<Record<string, RunDetailRecord>>({});
  const [allDecisions, setAllDecisions] = useState<DecisionRecord[]>([]);
  const [pendingDecisions, setPendingDecisions] = useState<DecisionRecord[]>([]);
  const [deferOpenId, setDeferOpenId] = useState<string | null>(null);
  const [deferConflict, setDeferConflict] = useState<{ task: Task; option: string; count: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [completionCheckTask, setCompletionCheckTask] = useState<Task | null>(null);
  const [postCompletionHandoff, setPostCompletionHandoff] = useState<PostCompletionHandoff | null>(null);
  const [projectDraft, setProjectDraft] = useState<{ projectId: string; result: ProjectDecompositionResult } | null>(null);
  const [projectDecomposingId, setProjectDecomposingId] = useState<string | null>(null);
  const [projectCreatingChildrenId, setProjectCreatingChildrenId] = useState<string | null>(null);
  const [projectDecompositionError, setProjectDecompositionError] = useState<string | null>(null);
  const [applyingWritebackApprovalId, setApplyingWritebackApprovalId] = useState<string | null>(null);
  const [appliedWritebackApprovalIds, setAppliedWritebackApprovalIds] = useState<Record<string, boolean>>({});
  const [writebackApprovalMessages, setWritebackApprovalMessages] = useState<Record<string, string>>({});
  const [confirmingStandingApprovalId, setConfirmingStandingApprovalId] = useState<string | null>(null);
  const [triggeringScheduledEventId, setTriggeringScheduledEventId] = useState<string | null>(null);
  const [standingApprovalMessages, setStandingApprovalMessages] = useState<Record<string, string>>({});
  const [workHabits, setWorkHabits] = useState<WorkHabitRecord[]>([]);

  const [showCapture, setShowCapture] = useState(false);
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureType, setCaptureType] = useState<TaskType>('simple');
  const [captureFacets, setCaptureFacets] = useState<TaskType[]>(['simple']);
  const [captureTypeTouched, setCaptureTypeTouched] = useState(false);
  const [captureCommitment, setCaptureCommitment] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [capturedTask, setCapturedTask] = useState<CapturedTaskSummary | null>(null);

  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  function reloadTasks() {
    window.api?.listTasks().then((records) => {
      const confirmedRecords = confirmedTaskRecords(records);
      clearTaskHierarchyAttributesForPersistedTasks(confirmedRecords);
      const attrs = loadTaskAttributes();
      setAllTasks(confirmedRecords
        .map((record) => fromRecord(record, attrs[record.id]))
        .filter((task) => task.visibility !== 'hidden'));
    }).catch(() => {});
  }

  function reloadPendingDecisions() {
    window.api?.listDecisions?.()
      .then((decisions) => {
        setAllDecisions(decisions);
        setPendingDecisions(decisions.filter((decision) => decision.status === 'pending'));
      })
      .catch(() => {});
  }

  function reloadWorkHabits() {
    void getPersistedWorkHabitStorageSnapshot()
      .then((snapshot) => setWorkHabits(snapshot.habits))
      .catch(() => {});
  }

  function reloadTaskFilesForTask(taskId: string) {
    if (!window.api?.listTaskFiles) return;
    window.api.listTaskFiles(taskId)
      .then((files) => {
        setLocalTaskFiles((current) => ({
          ...current,
          [taskId]: files.map(taskFileRecordToLocalRecord),
        }));
      })
      .catch(() => {});
  }

  function reloadRunsForTask(taskId: string | null = selectedIdRef.current) {
    if (!taskId || !window.api?.listRuns) {
      setSelectedRuns([]);
      setSelectedRunDetailsById({});
      return;
    }
    window.api.listRuns()
      .then(async (runs) => {
        const taskRuns = runs
          .filter((run) => run.taskId === taskId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (selectedIdRef.current !== taskId) return;
        setSelectedRuns(taskRuns);
        if (!window.api?.getRunDetail || taskRuns.length === 0) {
          setSelectedRunDetailsById({});
          return;
        }
        const detailEntries = await Promise.all(taskRuns.map(async (run) => {
          const detail = await window.api!.getRunDetail!(run.id).catch(() => null);
          return detail ? ([run.id, detail] as const) : null;
        }));
        if (selectedIdRef.current !== taskId) return;
        setSelectedRunDetailsById(Object.fromEntries(detailEntries.filter(Boolean) as Array<readonly [string, RunDetailRecord]>));
      })
      .catch(() => {
        setSelectedRuns([]);
        setSelectedRunDetailsById({});
      });
  }

  function reloadSandboxPatchPromotionApplyFlag() {
    if (!window.api?.getAiConfigStatus) return;
    window.api.getAiConfigStatus()
      .then((status) => {
        setAiConfigStatus(status);
        setSandboxPatchPromotionApplyEnabled(Boolean(status.featureFlags.enableSandboxPatchPromotionApply));
      })
      .catch(() => {
        setAiConfigStatus(null);
        setSandboxPatchPromotionApplyEnabled(false);
      });
  }

  function reloadTaskDetailForTask(taskId: string, isCancelled: () => boolean = () => false) {
    if (!window.api?.getTaskDetail) return;
    window.api.getTaskDetail(taskId)
      .then((detail) => {
        if (isCancelled()) return;
        setSelectedTaskDetail(detail);
        const keySources = (detail?.sourceContexts ?? [])
          .filter((source) => source.status === 'active')
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 8);
        setSelectedSources(keySources);
        setSelectedArtifacts(mergeTaskArtifacts(taskId, detail?.artifacts ?? []));
      })
      .catch(() => {});
    reloadTaskFilesForTask(taskId);
    reloadRunsForTask(taskId);
  }

  // Load real tasks from backend when available
  useEffect(() => {
    if (!window.api) return;
    setLoading(true);
    window.api.listTasks()
      .then((records) => {
        const confirmedRecords = confirmedTaskRecords(records);
        clearTaskHierarchyAttributesForPersistedTasks(confirmedRecords);
        const attrs = loadTaskAttributes();
        setAllTasks(confirmedRecords.map((record) => fromRecord(record, attrs[record.id])));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    reloadPendingDecisions();
    reloadWorkHabits();
    reloadSandboxPatchPromotionApplyFlag();

    const unsub = window.api.subscribeToEvents((event) => {
      if (event.type === 'task.changed') {
        reloadTasks();
        if (event.entityId) {
          reloadTaskFilesForTask(event.entityId);
          if (event.entityId === selectedIdRef.current) {
            reloadTaskDetailForTask(event.entityId);
          }
        }
      }
      if (event.type === 'run.changed') reloadRunsForTask();
      if (event.type === 'decision.changed') {
        reloadPendingDecisions();
        reloadRunsForTask();
      }
      if (event.type === 'settings.changed') {
        reloadSandboxPatchPromotionApplyFlag();
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (showCapture) reloadWorkHabits();
  }, [showCapture]);

  const activeTasks = allTasks.filter((task) => task.status !== 'done');
  const projectParents = activeTasks.filter((task) => effectiveTaskType(task, allTasks) === 'project' && isTopLevelRuntimeTask(task, allTasks));
  const taskTypeGroups: Array<{ key: string; label: string; lens: Lens; icon: string; tasks: Task[] }> = [
    { key: 'simple', label: '一次性任务', lens: 'simple', icon: '•', tasks: activeTasks.filter((task) => effectiveTaskType(task, allTasks) === 'simple' && isTopLevelRuntimeTask(task, allTasks)) },
    { key: 'project', label: '项目型', lens: 'project', icon: '▰', tasks: activeTasks.filter((task) => effectiveTaskType(task, allTasks) === 'project' && isTopLevelRuntimeTask(task, allTasks)) },
    { key: 'scheduled', label: '定时任务', lens: 'scheduled', icon: '↻', tasks: activeTasks.filter((task) => effectiveTaskType(task, allTasks) === 'scheduled' && isTopLevelRuntimeTask(task, allTasks)) },
    { key: 'event', label: '事件触发', lens: 'event', icon: '⚡', tasks: activeTasks.filter((task) => effectiveTaskType(task, allTasks) === 'event' && isTopLevelRuntimeTask(task, allTasks)) },
    { key: 'routine', label: '常设任务', lens: 'routine', icon: '∞', tasks: activeTasks.filter((task) => effectiveTaskType(task, allTasks) === 'routine' && isTopLevelRuntimeTask(task, allTasks)) },
    { key: 'composite', label: '复合任务', lens: 'composite', icon: '◈', tasks: activeTasks.filter((task) => task.facets.length > 1 && effectiveTaskType(task, allTasks) === task.type && isTopLevelRuntimeTask(task, allTasks)) },
  ];
  const pendingDecisionTaskIds = new Set(pendingDecisions.map((decision) => decision.taskId));
  const tasksWithPendingDecision = allTasks.filter((task) => task.status !== 'done' && pendingDecisionTaskIds.has(task.id));
  const filtered = allTasks.filter((t) => {
    if (lens === 'all') return t.status !== 'done';
    if (lens === 'running') return isProgressingTask(t) && isTopLevelRuntimeTask(t, allTasks);
    if (lens === 'waiting') return t.status === 'waiting';
    if (lens === 'blocked') return t.status === 'blocked';
    if (lens === 'clarify') return isClarifyTask(t);
    if (lens === 'needsDecision') return tasksWithPendingDecision.some((task) => task.id === t.id);
    if (lens === 'simple') return t.status !== 'done' && effectiveTaskType(t, allTasks) === 'simple' && isTopLevelRuntimeTask(t, allTasks);
    if (lens === 'project') return t.status !== 'done' && effectiveTaskType(t, allTasks) === 'project' && isTopLevelRuntimeTask(t, allTasks);
    if (lens === 'scheduled') return t.status !== 'done' && effectiveTaskType(t, allTasks) === 'scheduled' && isTopLevelRuntimeTask(t, allTasks);
    if (lens === 'event') return t.status !== 'done' && effectiveTaskType(t, allTasks) === 'event' && isTopLevelRuntimeTask(t, allTasks);
    if (lens === 'routine') return t.status !== 'done' && effectiveTaskType(t, allTasks) === 'routine' && isTopLevelRuntimeTask(t, allTasks);
    if (lens === 'composite') return t.status !== 'done' && t.facets.length > 1 && effectiveTaskType(t, allTasks) === t.type && isTopLevelRuntimeTask(t, allTasks);
    if (lens === 'done') return t.status === 'done';
    if (lens.startsWith('project:')) {
      const projectId = lens.slice('project:'.length);
      return t.status !== 'done' && (t.id === projectId || effectiveParentTaskId(t, allTasks) === projectId);
    }
    return true;
  });

  const selectedTask = allTasks.find((t) => t.id === selectedId) ?? null;
  const selectedParentTaskId = selectedTask ? effectiveParentTaskId(selectedTask, allTasks) : null;
  const selectedParentTask = selectedParentTaskId
    ? allTasks.find((task) => task.id === selectedParentTaskId) ?? null
    : null;
  const selectedEffectiveType = selectedTask ? effectiveTaskType(selectedTask, allTasks) : null;
  const selectedHasDecision = Boolean(selectedTask && pendingDecisions.some((decision) => decision.taskId === selectedTask.id));
  const selectedTaskPlanningPrompt = selectedTask
    ? buildTaskPlanningPrompt(selectedTask.title, selectedEffectiveType ?? selectedTask.type, 'panel')
    : null;
  const captureSopSuggestions = captureTitle.trim()
    ? selectApplicableWorkHabitsFromList(workHabits, {
        taskTitle: captureTitle,
        taskTypeLabel: TASK_TYPE_LABELS[captureType],
        limit: 4,
      }).filter((habit): habit is WorkHabitRecord => habit.source === 'sop')
    : [];
  useEffect(() => {
    let cancelled = false;
    setSelectedTaskDetail(null);
    setSelectedSources([]);
    setSelectedArtifacts([]);
    setSelectedRuns([]);
    if (!selectedId || !window.api?.getTaskDetail) return;

    reloadTaskDetailForTask(selectedId, () => cancelled);

    return () => { cancelled = true; };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedTask) return;
    const childIds = allTasks
      .filter((candidate) => effectiveParentTaskId(candidate, allTasks) === selectedTask.id)
      .map((child) => child.id);
    childIds.forEach((childId) => {
      if (localTaskFiles[childId] == null) {
        reloadTaskFilesForTask(childId);
      }
    });
  }, [allTasks, localTaskFiles, selectedTask?.id]);

  function runObjectSwitch(action: () => void) {
    if (!fileDirty) {
      action();
      return;
    }
    setPendingFileSwitch(() => action);
  }

  async function recordPanelTimelineEvent(
    taskId: string,
    type: PanelRuntimeTimelineEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await window.api?.recordTaskTimelineEvent?.({
      taskId,
      type,
      payload,
    }).catch(() => undefined);
  }

  async function confirmWritebackApproval(item: TaskplaneWritebackApprovalItem) {
    if (applyingWritebackApprovalId || !selectedTask) return;
    if (!window.api?.applyTaskplaneWriteback) {
      setWritebackApprovalMessages((current) => ({
        ...current,
        [item.id]: '当前环境缺少主进程写回审批入口，请先在右侧面板处理这条提案。',
      }));
      return;
    }
    setApplyingWritebackApprovalId(item.id);
    setWritebackApprovalMessages((current) => ({
      ...current,
      [item.id]: '正在确认写回...',
    }));
    try {
      const result = await window.api.applyTaskplaneWriteback({
        plan: item.plan,
        taskId: item.taskId,
      });
      if (result.status === 'blocked') {
        setWritebackApprovalMessages((current) => ({
          ...current,
          [item.id]: result.message,
        }));
        return;
      }
      setAppliedWritebackApprovalIds((current) => ({ ...current, [item.id]: true }));
      setWritebackApprovalMessages((current) => ({
        ...current,
        [item.id]: result.successMessage,
      }));
      reloadTasks();
      reloadPendingDecisions();
      reloadTaskFilesForTask(item.taskId);
      reloadRunsForTask(item.taskId);
      reloadTaskDetailForTask(item.taskId);
    } catch (error) {
      setWritebackApprovalMessages((current) => ({
        ...current,
        [item.id]: `写回失败：${error instanceof Error ? error.message : '未知错误'}`,
      }));
    } finally {
      setApplyingWritebackApprovalId(null);
    }
  }

  async function confirmStandingApprovalDraft(draft: AgentStandingApprovalConfirmationDraft) {
    if (!selectedTask || confirmingStandingApprovalId) return;
    if (draft.status !== 'ready') {
      setStandingApprovalMessages((current) => ({
        ...current,
        [draft.id]: '当前授权草案仍有 readiness 缺口，不能确认。',
      }));
      return;
    }
    if (!window.api?.recordTaskTimelineEvent) {
      setStandingApprovalMessages((current) => ({
        ...current,
        [draft.id]: '当前环境缺少任务动态写入入口。',
      }));
      return;
    }

    setConfirmingStandingApprovalId(draft.id);
    setStandingApprovalMessages((current) => ({
      ...current,
      [draft.id]: '正在确认 Standing Approval...',
    }));
    try {
      await recordPanelTimelineEvent(selectedTask.id, 'panel.standing_approval_confirmed', {
        confirmedAt: new Date().toISOString(),
        evaluation: draft.evaluation,
        policy: draft.policy,
        schedulerTriggerAllowed: false,
        summary: draft.summary,
        workspaceWriteAllowed: false,
      });
      setStandingApprovalMessages((current) => ({
        ...current,
        [draft.id]: 'Standing Approval 已确认；当前不会启动 scheduler，也不会写入工作区。',
      }));
      reloadTaskDetailForTask(selectedTask.id);
    } catch (error) {
      setStandingApprovalMessages((current) => ({
        ...current,
        [draft.id]: `确认失败：${error instanceof Error ? error.message : '未知错误'}`,
      }));
    } finally {
      setConfirmingStandingApprovalId(null);
    }
  }

  async function triggerScheduledEventAgentRun(draft: AgentStandingApprovalConfirmationDraft) {
    if (!selectedTask || triggeringScheduledEventId) return;
    if (!standingApprovalConfirmed) {
      setStandingApprovalMessages((current) => ({
        ...current,
        [draft.id]: '请先确认 Standing Approval，再启动一次受控 Agent run。',
      }));
      return;
    }
    if (!window.api?.triggerScheduledEventAgentRun) {
      setStandingApprovalMessages((current) => ({
        ...current,
        [draft.id]: '当前环境缺少 scheduled/event Agent trigger 入口。',
      }));
      return;
    }

    setTriggeringScheduledEventId(draft.id);
    setStandingApprovalMessages((current) => ({
      ...current,
      [draft.id]: '正在启动一次受控 Agent run...',
    }));
    try {
      const result = await window.api.triggerScheduledEventAgentRun({ taskId: selectedTask.id });
      setStandingApprovalMessages((current) => ({
        ...current,
        [draft.id]: result.status === 'started'
          ? scheduledEventAgentRunStartedMessage(result)
          : `未启动：${result.summary}`,
      }));
      reloadTaskDetailForTask(selectedTask.id);
    } catch (error) {
      setStandingApprovalMessages((current) => ({
        ...current,
        [draft.id]: `启动失败：${error instanceof Error ? error.message : '未知错误'}`,
      }));
    } finally {
      setTriggeringScheduledEventId(null);
    }
  }

  async function saveFileDraft() {
    if (!selectedFile) return;
    const nextContent = fileDraft;
    setFileContentOverrides((current) => ({ ...current, [selectedFile.id]: nextContent }));
    if (selectedFile.kind === 'task_record' || selectedFile.kind === 'local_file') {
      updateTaskFileContentOverride(selectedFile.id, nextContent);
    }
    if (selectedFile.kind === 'task_record' && window.api?.updateTask) {
      const patch = parseTaskRecordPatch(nextContent);
      if (patch.summary !== undefined || patch.nextStep !== undefined) {
        const guard = guardTaskMutation({ taskId: selectedFile.taskId });
        if (!guard.allowed) return;
        const updated = await window.api.updateTask({
          id: selectedFile.taskId,
          ...patch,
        }).catch(() => null);
        if (updated) {
          setAllTasks((current) => current.map((task) => (
            task.id === selectedFile.taskId
              ? {
                  ...task,
                  whyNow: updated.summary ?? undefined,
                  nextStep: updated.nextStep ?? undefined,
                  updatedAtIso: updated.updatedAt,
                  updatedAt: formatDate(updated.updatedAt),
                }
              : task
          )));
          setSelectedTaskDetail((current) => (
            current?.id === selectedFile.taskId
              ? {
                  ...current,
                  summary: updated.summary,
                  nextStep: updated.nextStep,
                  updatedAt: updated.updatedAt,
                }
              : current
          ));
        }
      }
      if (window.api.createTaskFile && window.api.updateTaskFile) {
        if (!guardDurablePanelAction({ taskId: selectedFile.taskId, confirmed: true }).allowed) return;
        const taskMdUpdate = evaluateTaskMdUpdateNeed({
          changeText: nextContent,
          hasTaskContext: true,
          producedDurableChange: true,
          reasonHint: 'durable_state_change',
        });
        if (!taskMdUpdate.shouldUpdateTaskMd) return;
        const existingTaskRecord = (localTaskFiles[selectedFile.taskId] ?? []).find(isPersistedTaskRecordFile);
        const persisted = existingTaskRecord
          ? await window.api.updateTaskFile({ id: existingTaskRecord.id, content: nextContent }).catch(() => null)
          : await window.api.createTaskFile({
            taskId: selectedFile.taskId,
            name: 'Task.md',
            path: 'Task.md',
            kind: 'file',
            content: nextContent,
          }).catch(() => null);
        if (persisted) {
          const nextFile = taskFileRecordToLocalRecord(persisted);
          setLocalTaskFiles((current) => {
            const withoutOld = (current[selectedFile.taskId] ?? []).filter((file) => file.id !== nextFile.id);
            return {
              ...current,
              [selectedFile.taskId]: [nextFile, ...withoutOld],
            };
          });
          verifyDurablePanelActionCompleted({
            title: '保存任务说明',
            output: `已保存 ${nextFile.path}`,
          });
          await recordPanelTimelineEvent(selectedFile.taskId, 'panel.task_file_written', {
            path: nextFile.path,
            source: 'tasks_page',
          });
        }
      }
    }
    if (selectedFile.kind === 'source' && selectedFile.sourceId && window.api?.updateSourceContext) {
      if (!guardDurablePanelAction({ taskId: selectedFile.taskId, confirmed: true }).allowed) return;
      const updated = await window.api.updateSourceContext({ id: selectedFile.sourceId, content: nextContent }).catch(() => undefined);
      if (updated) {
        verifyDurablePanelActionCompleted({
          title: '保存来源内容',
          output: `已保存来源：${selectedFile.name}`,
        });
        await recordPanelTimelineEvent(selectedFile.taskId, 'panel.source_updated', {
          sourceId: updated.id,
          title: updated.title,
          field: 'content',
          source: 'tasks_page',
        });
      }
    }
    if (selectedFile.kind === 'artifact' && selectedFile.artifactId) {
      if (!guardDurablePanelAction({ taskId: selectedFile.taskId, confirmed: true }).allowed) return;
      if (window.api?.updateArtifact) {
        const updated = await window.api.updateArtifact({ id: selectedFile.artifactId, content: nextContent }).catch(() => null);
        if (updated) {
          setSelectedArtifacts((current) => mergeTaskArtifacts(selectedFile.taskId, current.map((artifact) => (
            artifact.id === updated.id ? updated : artifact
          ))));
          verifyDurablePanelActionCompleted({
            title: '保存产物内容',
            output: `已保存产物：${updated.title}`,
          });
          await recordPanelTimelineEvent(selectedFile.taskId, 'panel.artifact_written', {
            artifactId: updated.id,
            title: updated.title,
            field: 'content',
            source: 'tasks_page',
          });
        }
      } else {
        updateArtifactWorkspace(selectedFile.artifactId, { content: nextContent });
        verifyDurablePanelActionCompleted({
          title: '保存产物内容',
          output: `已保存本地产物：${selectedFile.name}`,
        });
        await recordPanelTimelineEvent(selectedFile.taskId, 'panel.artifact_written', {
          artifactId: selectedFile.artifactId,
          title: selectedFile.name,
          field: 'content',
          source: 'tasks_page',
        });
      }
    }
    if (selectedFile.kind === 'local_file') {
      if (!guardDurablePanelAction({ taskId: selectedFile.taskId, confirmed: true }).allowed) return;
      const persisted = window.api?.updateTaskFile
        ? await window.api.updateTaskFile({ id: selectedFile.id, content: nextContent }).catch(() => null)
        : null;
      if (!persisted) {
        updateLocalTaskFile(selectedFile.taskId, selectedFile.id, { content: nextContent });
      }
      const nextFile: LocalTaskFileRecord = persisted
        ? taskFileRecordToLocalRecord(persisted)
        : { ...selectedFile, kind: 'local_file', content: nextContent, updatedAt: new Date().toISOString() };
      setLocalTaskFiles((current) => ({
        ...current,
        [selectedFile.taskId]: (current[selectedFile.taskId] ?? []).map((file) => (
          file.id === selectedFile.id ? { ...file, ...nextFile } : file
        )),
      }));
      verifyDurablePanelActionCompleted({
        title: '保存任务文件',
        output: `已保存 ${nextFile.path}`,
      });
      await recordPanelTimelineEvent(selectedFile.taskId, 'panel.task_file_written', {
        path: nextFile.path,
        source: 'tasks_page',
      });
    }
    setFileDirty(false);
  }

  async function saveAndContinueSwitch() {
    const next = pendingFileSwitch;
    await saveFileDraft();
    setPendingFileSwitch(null);
    next?.();
  }

  function discardAndContinueSwitch() {
    const next = pendingFileSwitch;
    setFileDirty(false);
    setFileDraft(selectedFile?.content ?? '');
    setPendingFileSwitch(null);
    next?.();
  }

  function selectTask(id: string | null, options: { syncLensToTaskType?: boolean } = {}) {
    runObjectSwitch(() => {
      const nextTask = id ? allTasks.find((task) => task.id === id) ?? null : null;
      const nextParentTaskId = nextTask ? effectiveParentTaskId(nextTask, allTasks) : null;
      const nextParentTask = nextParentTaskId
        ? allTasks.find((task) => task.id === nextParentTaskId) ?? null
        : null;
      if (nextParentTask && effectiveTaskType(nextParentTask, allTasks) === 'project') {
        setLens('project');
        setOpenGroups((current) => ({ ...current, type: true }));
        setOpenTypeGroups((current) => ({ ...current, project: true }));
      }
      if (options.syncLensToTaskType && nextTask && !nextParentTask) {
        const nextLens = lensForTaskType(nextTask, allTasks);
        setLens(nextLens);
        setViewMode('list');
        setOpenGroups((current) => ({ ...current, type: true }));
        setOpenTypeGroups((current) => ({ ...current, [nextLens]: true }));
      }
      setSelectedId(id);
      setSelectedFileId(null);
      setFileDirty(false);
      setFileDraft('');
      setSelectedObject(id ? 'task' : 'task-list');
      setShowCapture(false);
      setTaskDetailViewMode('manage');
      setDeferOpenId(null);
    });
  }

  function selectLens(nextLens: Lens) {
    runObjectSwitch(() => {
      setLens(nextLens);
      setViewMode(isTaskTypeLens(nextLens) ? 'list' : 'lane');
      setSelectedId(null);
      setSelectedFileId(null);
      setFileDirty(false);
      setFileDraft('');
      setSelectedObject('task-list');
      setShowCapture(false);
      setTaskDetailViewMode('manage');
      setDeferOpenId(null);
    });
  }

  function openTaskCreateView() {
    runObjectSwitch(() => {
      resetCaptureDraft();
      setShowCapture(true);
      setSelectedFileId(null);
      setFileDirty(false);
      setFileDraft('');
      setSelectedObject('task-create');
      setTaskDetailViewMode('manage');
      setDeferOpenId(null);
    });
  }

  function closeTaskCreateView() {
    resetCaptureDraft();
    setShowCapture(false);
    setSelectedObject(selectedId ? 'task' : 'task-list');
  }

  useEffect(() => {
    if (!focusTaskId || focusTaskId === selectedId) return;
    selectTask(focusTaskId);
  }, [focusTaskId, selectedId]);

  function handleRowClick(id: string) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      selectTask(selectedId === id ? null : id);
    }, 180);
  }

  function handleRowDoubleClick(id: string) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    const task = allTasks.find((item) => item.id === id);
    if (!task) return;
    onOpenPanel(task.id, buildVisibleTaskPlanningDraft(task.title, effectiveTaskType(task, allTasks)), task.title, false, false, true);
  }

  const persistedSelectedTaskFiles = selectedTask ? localTaskFiles[selectedTask.id] ?? [] : [];
  const persistedTaskRecord = persistedSelectedTaskFiles.find(isPersistedTaskRecordFile) ?? null;
  const visiblePersistedTaskFiles = persistedSelectedTaskFiles.filter((file) => !isPersistedTaskRecordFile(file));
  const taskFiles = selectedTask
    ? applyFileOverrides([
      ...buildVirtualTaskFiles(selectedTask, selectedSources, selectedArtifacts, persistedTaskRecord?.content),
      ...visiblePersistedTaskFiles,
    ], fileContentOverrides)
    : [];
  const visibleTaskFiles = taskFiles.filter((file) => {
    const query = fileSearch.trim().toLowerCase();
    const matchesSearch = !query
      || file.path.toLowerCase().includes(query)
      || file.name.toLowerCase().includes(query);
    if (!matchesSearch) return false;
    if (fileFilter === 'all') return true;
    return taskFileFilterForFile(file) === fileFilter;
  });
  const selectedFile = taskFiles.find((file) => file.id === selectedFileId) ?? null;
  const contextMenuFile = fileContextMenu ? taskFiles.find((file) => file.id === fileContextMenu.fileId) ?? null : null;
  const patchPromotionViewsByArtifactId = new Map(
    projectSandboxPatchPromotionViews({
      decisions: selectedTask
        ? allDecisions.filter((decision) => decision.taskId === selectedTask.id || decision.sourceType === 'agent_checkpoint')
        : allDecisions,
      runDetails: Object.values(selectedRunDetailsById),
    }).map((view) => [view.artifactId, view] as const),
  );
  const selectedPatchPromotionView = selectedFile?.artifactId
    ? patchPromotionViewsByArtifactId.get(selectedFile.artifactId) ?? null
    : null;
  const contextMenuPatchPromotionView = contextMenuFile?.artifactId
    ? patchPromotionViewsByArtifactId.get(contextMenuFile.artifactId) ?? null
    : null;
  function patchPromotionApplyAvailableFor(file: VirtualTaskFile | null, view: SandboxPatchPromotionView | null): boolean {
    return isPatchArtifactFile(file)
      && Boolean(window.api?.applySandboxPatchPromotion)
      && sandboxPatchPromotionApplyEnabled
      && view?.tone === 'ready'
      && view.decisionStatus === 'approved'
      && view.promotionStatus === 'pending';
  }
  const selectedPatchPromotionApplyFlagGuidance = isPatchArtifactFile(selectedFile)
    && selectedPatchPromotionView?.tone === 'ready'
    && selectedPatchPromotionView.decisionStatus === 'approved'
    && selectedPatchPromotionView.promotionStatus === 'pending'
    && !sandboxPatchPromotionApplyEnabled
      ? 'Apply flag 当前关闭；这次审批仍是 no-write 状态。开启 apply flag 后仍需重新复核 Run 证据，并通过显式应用动作触发 promotion preflight。'
      : null;
  const selectedPatchReviewMessage = selectedFile?.artifactId
    ? [
        patchReviewPreviewMessages[selectedFile.artifactId] ?? null,
        selectedPatchPromotionView ? formatSandboxPatchPromotionNotice(selectedPatchPromotionView) : null,
        selectedPatchPromotionApplyFlagGuidance,
      ].filter(Boolean).join(' ')
      || null
    : null;
  const selectedPatchReviewTone = selectedPatchPromotionView?.tone ?? null;
  const selectedPatchReviewAvailable = isPatchArtifactFile(selectedFile)
    && Boolean(window.api?.previewPatchArtifactSandboxReview);
  const selectedPatchReviewRunAvailable = isPatchArtifactFile(selectedFile)
    && Boolean(window.api?.runPatchArtifactSandboxReview);
  const selectedPatchPromotionApplyAvailable = patchPromotionApplyAvailableFor(selectedFile, selectedPatchPromotionView);
  const contextMenuPatchPromotionApplyAvailable = patchPromotionApplyAvailableFor(contextMenuFile, contextMenuPatchPromotionView);
  const selectedPatchPromotionApplyDisabledAction = selectedPatchPromotionApplyFlagGuidance
    ? {
        description: '默认不写工作区；开启 apply flag 后仍需手动触发 promotion preflight。',
        disabled: true,
        label: '应用到工作区已关闭',
        onClick: () => undefined,
      }
    : null;
  const directChildTasks = selectedTask
    ? orderedChildrenForTask(selectedTask, allTasks)
    : [];
  const selectedTaskVerificationAdvancement = selectedTask && selectedTaskDetail
    ? evaluateTaskAdvancement({
        entrypoint: 'selected_task_verification',
        hasTaskContext: true,
        prompt: 'selected_task_verification',
        task: selectedTaskDetail,
      })
    : null;
  const selectedProjectVerification = selectedTask
    && selectedTaskDetail
    && selectedEffectiveType === 'project'
    && selectedTaskVerificationAdvancement?.route !== 'blocked'
    ? evaluateRuntimeVerification({
        mode: 'project',
        task: selectedTaskDetail,
        childTasks: directChildTasks.map(toTaskListItemRecord),
        artifactCount: selectedArtifacts.length,
        keySourceCount: selectedSources.filter((source) => source.isKey && source.status !== 'archived').length,
        decisionEffect: summarizeDecisionEffects(allDecisions.filter((decision) => decision.taskId === selectedTask.id)),
      })
    : null;
  const relatedFiles = buildRelatedTaskFileItems(taskFiles);
  const projectedTaskFiles: TaskFileRecord[] = selectedTask
    ? [
        ...(selectedTaskDetail?.taskFiles ?? []),
        ...persistedSelectedTaskFiles
          .filter((file) => file.kind === 'local_file' || file.kind === 'local_folder')
          .map((file): TaskFileRecord => ({
            id: file.id,
            taskId: file.taskId,
            name: file.name,
            path: file.path,
            kind: file.kind === 'local_folder' ? 'folder' : 'file',
            content: file.content,
            createdAt: file.updatedAt,
            updatedAt: file.updatedAt,
          })),
      ].filter((file, index, files) => files.findIndex((candidate) => candidate.id === file.id) === index)
    : [];
  const writebackApprovalItems = selectedTask
    ? buildTaskplaneWritebackApprovalItems({
        existing: {
          activeBlocker: selectedTaskDetail?.activeBlocker ?? null,
          artifacts: selectedArtifacts,
          decisions: allDecisions.filter((decision) => decision.taskId === selectedTask.id),
          nextStep: selectedTask.nextStep,
          sourceContexts: selectedTaskDetail?.sourceContexts ?? [],
          taskFiles: projectedTaskFiles,
        },
        runDetails: selectedRuns
          .map((run) => selectedRunDetailsById[run.id])
          .filter((detail): detail is RunDetailRecord => Boolean(detail)),
        timeline: selectedTaskDetail?.timeline ?? [],
        taskId: selectedTask.id,
        taskTitle: selectedTask.title,
      }).filter((item) => !appliedWritebackApprovalIds[item.id])
    : [];
  const standingApprovalDraft = selectedTask && selectedTaskDetail && aiConfigStatus && isAutonomousTaskClass(selectedTask)
    ? buildStandingApprovalDraftForTask(selectedTask, selectedTaskDetail, aiConfigStatus)
    : null;
  const standingApprovalConfirmed = standingApprovalDraft && selectedTaskDetail
    ? hasConfirmedStandingApproval(selectedTaskDetail, standingApprovalDraft.id)
    : false;
  const runtimeEvents = selectedTask
    ? projectRuntimeEvents({
        taskId: selectedTask.id,
        timeline: selectedTaskDetail?.timeline ?? [],
        runs: selectedRuns,
        runStepsByRunId: Object.fromEntries(selectedRuns.map((run) => [
          run.id,
          selectedRunDetailsById[run.id]?.steps ?? [],
        ])),
        taskFiles: projectedTaskFiles,
        decisions: allDecisions.filter((decision) => decision.taskId === selectedTask.id),
      })
    : [];
  const globalExecutionQueueItems = buildExecutionQueueItems(activeTasks, allTasks, pendingDecisions);
  const executionQueueItems = lens === 'all'
    ? globalExecutionQueueItems
    : buildExecutionQueueItems(filtered, allTasks, pendingDecisions);
  const executionQueueTasks = executionQueueItems.map((item) => item.task);
  const progressingQueueCount = buildExecutionQueueItems(
    allTasks.filter((task) => task.status !== 'done' && isProgressingTask(task)),
    allTasks,
    pendingDecisions,
  ).length;
  const taskDirectoryGroups = buildTaskDirectoryGroups(filtered, allTasks);

  async function previewPatchArtifactSandboxReview(file: VirtualTaskFile | null) {
    if (!isPatchArtifactFile(file) || !window.api?.previewPatchArtifactSandboxReview) return;

    const artifactId = file.artifactId;
    setPreviewingPatchReviewArtifactId(artifactId);
    setPatchReviewPreviewMessages((current) => ({
      ...current,
      [artifactId]: '正在生成沙箱预检计划...',
    }));

    try {
      const result = await window.api.previewPatchArtifactSandboxReview({
        artifactId,
        requestedChecks: ['test', 'lint'],
      });
      const message = result.status === 'ready'
        ? [
            '沙箱预检就绪',
            result.changedFiles.length ? `文件：${result.changedFiles.join(', ')}` : null,
            result.checks.length ? `检查：${result.checks.join(', ')}` : null,
            '未写入工作区',
          ].filter(Boolean).join('；')
        : `沙箱预检阻塞：${result.reason}`;
      setPatchReviewPreviewMessages((current) => ({
        ...current,
        [artifactId]: message,
      }));
      await recordPanelTimelineEvent(file.taskId, 'panel.artifact_written', {
        artifactId,
        noWorkspaceFilesWritten: true,
        source: 'tasks_page',
        status: result.status,
        summary: result.summary,
        type: 'sandbox_review_preview',
      });
    } catch (error) {
      setPatchReviewPreviewMessages((current) => ({
        ...current,
        [artifactId]: `沙箱预检失败：${error instanceof Error ? error.message : '未知错误'}`,
      }));
    } finally {
      setPreviewingPatchReviewArtifactId(null);
    }
  }

  async function runPatchArtifactSandboxReview(file: VirtualTaskFile | null) {
    if (!isPatchArtifactFile(file) || !window.api?.runPatchArtifactSandboxReview) return;

    const artifactId = file.artifactId;
    setRunningPatchReviewArtifactId(artifactId);
    setPatchReviewPreviewMessages((current) => ({
      ...current,
      [artifactId]: '正在运行沙箱 review；工作区保持只读...',
    }));

    try {
      const result = await window.api.runPatchArtifactSandboxReview({
        artifactId,
        operatorConfirmed: true,
        requestedChecks: ['test', 'lint'],
      });
      const message = result.status === 'completed'
        ? [
            '沙箱 review 完成',
            result.decisionId ? `已创建 promotion Decision：${result.decisionId}` : '未创建 promotion Decision',
            `Run：${result.runId}`,
            '未写入工作区',
          ].join('；')
        : `沙箱 review ${result.status === 'blocked' ? '阻塞' : '失败'}：${result.reason}`;
      setPatchReviewPreviewMessages((current) => ({
        ...current,
        [artifactId]: message,
      }));
      await recordPanelTimelineEvent(file.taskId, 'panel.artifact_written', {
        artifactId,
        noWorkspaceFilesWritten: true,
        runId: result.runId,
        source: 'tasks_page',
        status: result.status,
        summary: result.summary,
        type: 'sandbox_review_run',
      });
      reloadRunsForTask(file.taskId);
      reloadTaskDetailForTask(file.taskId);
      reloadPendingDecisions();
      reloadTasks();
    } catch (error) {
      setPatchReviewPreviewMessages((current) => ({
        ...current,
        [artifactId]: `沙箱 review 失败：${error instanceof Error ? error.message : '未知错误'}`,
      }));
    } finally {
      setRunningPatchReviewArtifactId(null);
    }
  }

  async function applySandboxPatchPromotion(view: SandboxPatchPromotionView | null, file: VirtualTaskFile | null) {
    if (!view || !file?.artifactId || !window.api?.applySandboxPatchPromotion) return;
    if (!guardDurablePanelAction({ taskId: file.taskId, confirmed: true }).allowed) return;
    const confirmed = window.confirm('确认将这份 reviewed patch 应用到工作区？Taskplane 只会写入 reviewed patch 中通过 promotion preflight 的匹配文件；如果工作区内容已漂移，apply 会阻塞并记录 Run 证据。');
    if (!confirmed) return;

    setApplyingPatchPromotionCheckpointId(view.checkpointId);
    setPatchReviewPreviewMessages((current) => ({
      ...current,
      [file.artifactId!]: '正在执行 promotion apply 预检并准备写入工作区...',
    }));

    try {
      const result = await window.api.applySandboxPatchPromotion({
        checkpointId: view.checkpointId,
        operatorConfirmed: true,
      });
      const message = result.status === 'blocked'
        ? `promotion apply 阻塞：${result.auditSummary}`
        : [
            result.status === 'already_applied' ? 'promotion 已经应用' : 'promotion apply 完成',
            result.touchedFiles.length ? `文件：${result.touchedFiles.join(', ')}` : null,
            'Run 证据已刷新，请复核 touched files 和后续验证结果',
          ].filter(Boolean).join('；');
      setPatchReviewPreviewMessages((current) => ({
        ...current,
        [file.artifactId!]: message,
      }));
      await recordPanelTimelineEvent(file.taskId, 'panel.artifact_written', {
        artifactId: file.artifactId,
        checkpointId: view.checkpointId,
        noWorkspaceFilesWritten: result.status !== 'applied',
        source: 'tasks_page',
        status: result.status,
        summary: result.auditSummary,
        type: 'sandbox_promotion_apply',
      });
      reloadRunsForTask(file.taskId);
      reloadTaskDetailForTask(file.taskId);
      reloadTasks();
    } catch (error) {
      setPatchReviewPreviewMessages((current) => ({
        ...current,
        [file.artifactId!]: `promotion apply 失败：${error instanceof Error ? error.message : '未知错误'}`,
      }));
    } finally {
      setApplyingPatchPromotionCheckpointId(null);
    }
  }

  useEffect(() => {
    const selectedFileContext = selectedObject === 'file' && selectedFile
      ? {
          path: selectedFile.path,
          kind: selectedFile.kind,
          dirty: fileDirty,
          contentPreview: truncateFileContext(fileDirty ? fileDraft : selectedFile.content),
        }
      : null;
    onSelectionContextChange?.({
      taskId: selectedTask?.id ?? null,
      taskTitle: selectedTask?.title ?? null,
      parentTaskId: selectedTask?.parentTaskId ?? null,
      childTaskIds: selectedTask?.childTaskIds ?? [],
      selectedFile: selectedFileContext,
    });
  }, [
    fileDirty,
    fileDraft,
    onSelectionContextChange,
    selectedFile?.content,
    selectedFile?.kind,
    selectedFile?.path,
    selectedObject,
    selectedTask?.id,
    selectedTask?.childTaskIds,
    selectedTask?.parentTaskId,
    selectedTask?.title,
  ]);

  function selectTaskFile(file: VirtualTaskFile) {
    if (file.kind === 'records_folder' || file.kind === 'local_folder') return;
    runObjectSwitch(() => {
      setSelectedId(file.taskId);
      setSelectedFileId(file.id);
      setSelectedObject('file');
      setFileDraft(file.content);
      setFileDirty(false);
    });
  }

  function returnToTaskWorkspace() {
    runObjectSwitch(() => {
      setSelectedObject(selectedId ? 'task' : 'task-list');
      setSelectedFileId(null);
      setFileDraft('');
      setFileDirty(false);
    });
  }

  async function createTaskFile(kind: 'file' | 'folder') {
    if (!selectedTask) return;
    const fallbackName = kind === 'file' ? 'notes.md' : 'drafts/';
    const rawName = window.prompt(kind === 'file' ? '新建文件名' : '新建文件夹名', fallbackName)?.trim();
    if (!rawName) return;
    if (!guardDurablePanelAction({ taskId: selectedTask.id, confirmed: true }).allowed) return;
    const normalizedName = kind === 'folder' && !rawName.endsWith('/') ? `${rawName}/` : rawName;
    if (isTaskMdPath(normalizedName) || isTaskRecordPath(normalizedName)) {
      window.alert('Task.md 和 Task Records/ 是任务记忆保留路径。请使用任务说明或任务记录入口创建。');
      return;
    }
    const persisted = window.api?.createTaskFile
      ? await window.api.createTaskFile({
        taskId: selectedTask.id,
        name: normalizedName,
        kind,
        content: '',
      }).catch(() => null)
      : null;
    const file = persisted
      ? taskFileRecordToLocalRecord(persisted)
      : createLocalTaskFile({
        taskId: selectedTask.id,
        name: normalizedName,
        kind: kind === 'file' ? 'local_file' : 'local_folder',
      });
    setLocalTaskFiles((current) => ({
      ...current,
      [selectedTask.id]: [file, ...(current[selectedTask.id] ?? [])],
    }));
    if (kind === 'file') {
      selectTaskFile(file);
    }
    verifyDurablePanelActionCompleted({
      title: kind === 'file' ? '创建任务文件' : '创建任务文件夹',
      output: `已创建 ${normalizedName}`,
    });
    await recordPanelTimelineEvent(selectedTask.id, 'panel.task_file_created', {
      path: file.path,
      kind,
      source: 'tasks_page',
    });
  }

  async function createTaskRecordFile() {
    if (!selectedTask) return;
    const today = new Date().toISOString().slice(0, 10);
    const fallbackName = `${today}-record.md`;
    const rawName = window.prompt('新建任务记录', fallbackName)?.trim();
    if (!rawName) return;
    if (!guardDurablePanelAction({ taskId: selectedTask.id, confirmed: true }).allowed) return;
    const normalizedName = rawName.endsWith('.md') ? rawName : `${rawName}.md`;
    const recordFileName = normalizedName.split('/').filter(Boolean).at(-1) ?? normalizedName;
    const recordPath = isTaskRecordPath(normalizedName)
      ? normalizedName
      : `Task Records/${recordFileName}`;
    const displayName = recordPath.split('/').filter(Boolean).at(-1) ?? normalizedName;
    const content = [
      `# Record: ${displayName.replace(/\.md$/i, '')}`,
      '',
      '## Trigger',
      '',
      '## Summary',
      '',
      '## Confirmed',
      '',
      '## Open',
      '',
      '## Next',
      '',
      '## Links',
      '',
    ].join('\n');
    const worthiness = evaluateTaskRecordWorthiness({
      text: content,
      hasTaskContext: true,
      reasonHint: 'durable_state_change',
    });
    if (!worthiness.shouldCreateTaskRecord) return;
    const persisted = window.api?.createTaskFile
      ? await window.api.createTaskFile({
        taskId: selectedTask.id,
        name: displayName,
        path: recordPath,
        kind: 'file',
        content,
      }).catch(() => null)
      : null;
    const file = persisted
      ? taskFileRecordToLocalRecord(persisted)
      : createLocalTaskFile({
        taskId: selectedTask.id,
        name: displayName,
        kind: 'local_file',
        content,
      });
    const nextFile = persisted ? file : { ...file, path: recordPath };
    setLocalTaskFiles((current) => ({
      ...current,
      [selectedTask.id]: [nextFile, ...(current[selectedTask.id] ?? [])],
    }));
    selectTaskFile(nextFile);
    verifyDurablePanelActionCompleted({
      title: '创建任务记录',
      output: `已创建 ${recordPath}`,
    });
    await recordPanelTimelineEvent(selectedTask.id, 'panel.task_record_written', {
      path: recordPath,
      source: 'tasks_page',
    });
  }

  async function createArtifactFile() {
    if (!selectedTask) return;
    const title = window.prompt('新建产物文件名', 'notes.md')?.trim();
    if (!title) return;
    if (!guardDurablePanelAction({ taskId: selectedTask.id, confirmed: true }).allowed) return;
    const artifact = window.api?.createManualArtifact
      ? await window.api.createManualArtifact({ taskId: selectedTask.id, title, content: '' }).catch(() => null)
      : null;
    const fallbackArtifact = artifact ?? createManualArtifact({ taskId: selectedTask.id, title, content: '' });
    setSelectedArtifacts((current) => mergeTaskArtifacts(selectedTask.id, [fallbackArtifact, ...current]));
    const file = artifactToVirtualFile(fallbackArtifact);
    selectTaskFile(file);
    verifyDurablePanelActionCompleted({
      title: '创建产物',
      output: `已创建产物 ${title}`,
    });
    await recordPanelTimelineEvent(selectedTask.id, 'panel.artifact_written', {
      artifactId: fallbackArtifact.id,
      title,
      action: 'created',
      source: 'tasks_page',
    });
  }

  async function renameFile(file: VirtualTaskFile | null) {
    if (!file) return;
    const nextName = window.prompt('重命名', file.name)?.trim();
    if (!nextName || nextName === file.name) return;
    if (!guardDurablePanelAction({ taskId: file.taskId, confirmed: true }).allowed) return;
    if (file.kind === 'artifact' && file.artifactId) {
      if (window.api?.updateArtifact) {
        const updated = await window.api.updateArtifact({ id: file.artifactId, title: nextName }).catch(() => null);
        if (updated) {
          setSelectedArtifacts((current) => mergeTaskArtifacts(file.taskId, current.map((artifact) => (
            artifact.id === updated.id ? updated : artifact
          ))));
        }
      } else {
        updateArtifactWorkspace(file.artifactId, { title: nextName });
        setSelectedArtifacts((current) => mergeTaskArtifacts(file.taskId, current));
      }
      verifyDurablePanelActionCompleted({
        title: '重命名产物',
        output: `已重命名为 ${nextName}`,
      });
      await recordPanelTimelineEvent(file.taskId, 'panel.artifact_written', {
        artifactId: file.artifactId,
        title: nextName,
        action: 'renamed',
        source: 'tasks_page',
      });
      return;
    }
    if (file.kind !== 'local_file' && file.kind !== 'local_folder') return;
    const normalizedName = file.kind === 'local_folder' && !nextName.endsWith('/') ? `${nextName}/` : nextName;
    const persisted = window.api?.updateTaskFile
      ? await window.api.updateTaskFile({ id: file.id, name: normalizedName, path: normalizedName }).catch(() => null)
      : null;
    if (!persisted) {
      updateLocalTaskFile(file.taskId, file.id, { name: normalizedName, path: normalizedName });
    }
    const nextFile: LocalTaskFileRecord = persisted
      ? taskFileRecordToLocalRecord(persisted)
      : {
        ...file,
        kind: file.kind,
        name: normalizedName,
        path: normalizedName,
        updatedAt: new Date().toISOString(),
      };
    setLocalTaskFiles((current) => ({
      ...current,
      [file.taskId]: (current[file.taskId] ?? []).map((item) => (
        item.id === file.id ? { ...item, ...nextFile } : item
      )),
    }));
    verifyDurablePanelActionCompleted({
      title: '重命名任务文件',
      output: `已重命名为 ${normalizedName}`,
    });
    await recordPanelTimelineEvent(file.taskId, 'panel.task_file_moved', {
      from: file.path,
      to: nextFile.path,
      action: 'renamed',
      source: 'tasks_page',
    });
  }

  async function renameSelectedFile() {
    await renameFile(selectedFile);
  }

  async function moveFile(file: VirtualTaskFile | null) {
    if (!file || file.kind === 'task_record' || file.kind === 'source') return;
    const nextPath = window.prompt('移动到路径', file.path)?.trim();
    if (!nextPath || nextPath === file.path) return;
    if (!guardDurablePanelAction({ taskId: file.taskId, confirmed: true }).allowed) return;
    const nextName = nextPath.split('/').filter(Boolean).at(-1) ?? file.name;
    if (file.kind === 'artifact' && file.artifactId) {
      if (window.api?.updateArtifact) {
        const updated = await window.api.updateArtifact({ id: file.artifactId, title: nextName }).catch(() => null);
        if (updated) {
          setSelectedArtifacts((current) => mergeTaskArtifacts(file.taskId, current.map((artifact) => (
            artifact.id === updated.id ? updated : artifact
          ))));
        }
      } else {
        updateArtifactWorkspace(file.artifactId, { title: nextName });
        setSelectedArtifacts((current) => mergeTaskArtifacts(file.taskId, current));
      }
      verifyDurablePanelActionCompleted({
        title: '移动产物',
        output: `已移动/重命名为 ${nextName}`,
      });
      await recordPanelTimelineEvent(file.taskId, 'panel.artifact_written', {
        artifactId: file.artifactId,
        title: nextName,
        action: 'moved',
        source: 'tasks_page',
      });
      return;
    }
    if (file.kind !== 'local_file' && file.kind !== 'local_folder') return;
    const normalizedPath = file.kind === 'local_folder' && !nextPath.endsWith('/') ? `${nextPath}/` : nextPath;
    const persisted = window.api?.updateTaskFile
      ? await window.api.updateTaskFile({ id: file.id, name: nextName, path: normalizedPath }).catch(() => null)
      : null;
    if (!persisted) {
      updateLocalTaskFile(file.taskId, file.id, { name: nextName, path: normalizedPath });
    }
    const nextFile: LocalTaskFileRecord = persisted
      ? taskFileRecordToLocalRecord(persisted)
      : {
        ...file,
        kind: file.kind,
        name: nextName,
        path: normalizedPath,
        updatedAt: new Date().toISOString(),
      };
    setLocalTaskFiles((current) => ({
      ...current,
      [file.taskId]: (current[file.taskId] ?? []).map((item) => (
        item.id === file.id ? { ...item, ...nextFile } : item
      )),
    }));
    verifyDurablePanelActionCompleted({
      title: '移动任务文件',
      output: `已移动到 ${normalizedPath}`,
    });
    await recordPanelTimelineEvent(file.taskId, 'panel.task_file_moved', {
      from: file.path,
      to: normalizedPath,
      source: 'tasks_page',
    });
  }

  async function moveSelectedFile() {
    await moveFile(selectedFile);
  }

  async function deleteFile(file: VirtualTaskFile | null) {
    if (!file || file.kind === 'task_record' || file.kind === 'source') return;
    if (!window.confirm(`删除 ${file.name}？`)) return;
    if (!guardDurablePanelAction({ taskId: file.taskId, confirmed: true }).allowed) return;
    if (file.kind === 'artifact' && file.artifactId) {
      if (window.api?.deleteArtifact) {
        const deleted = await window.api.deleteArtifact(file.artifactId).catch(() => null);
        if (deleted) {
          setSelectedArtifacts((current) => mergeTaskArtifacts(file.taskId, current.filter((artifact) => artifact.id !== deleted.id)));
        }
      } else {
        deleteArtifactWorkspace(file.artifactId);
        setSelectedArtifacts((current) => mergeTaskArtifacts(file.taskId, current));
      }
    }
    if (file.kind === 'local_file' || file.kind === 'local_folder') {
      const deleted = window.api?.deleteTaskFile
        ? await window.api.deleteTaskFile(file.id).catch(() => null)
        : null;
      if (!deleted) {
        deleteLocalTaskFile(file.taskId, file.id);
      }
      setLocalTaskFiles((current) => ({
        ...current,
        [file.taskId]: (current[file.taskId] ?? []).filter((item) => item.id !== file.id),
      }));
    }
    if (selectedFileId === file.id) {
      setSelectedObject('task');
      setSelectedFileId(null);
      setFileDraft('');
      setFileDirty(false);
    }
    verifyDurablePanelActionCompleted({
      title: '删除任务文件',
      output: `已删除 ${file.name}`,
    });
    await recordPanelTimelineEvent(file.taskId, file.kind === 'artifact' ? 'panel.artifact_deleted' : 'panel.task_file_deleted', {
      path: file.path,
      artifactId: file.artifactId,
      title: file.name,
      source: 'tasks_page',
    });
  }

  async function deleteSelectedFile() {
    await deleteFile(selectedFile);
  }

  async function toggleSourceKey(file: VirtualTaskFile | null) {
    if (!file?.sourceId || !window.api?.updateSourceContext) return;
    const source = selectedSources.find((item) => item.id === file.sourceId);
    if (!source) return;
    if (!guardDurablePanelAction({ taskId: file.taskId, confirmed: true }).allowed) return;
    const updated = await window.api.updateSourceContext({ id: source.id, isKey: !source.isKey }).catch(() => null);
    if (!updated) return;
    setSelectedSources((current) => current.map((item) => item.id === updated.id ? updated : item));
    verifyDurablePanelActionCompleted({
      title: '更新来源标记',
      output: `${updated.title} 已${updated.isKey ? '设为关键来源' : '取消关键来源'}`,
    });
    await recordPanelTimelineEvent(file.taskId, 'panel.source_updated', {
      sourceId: updated.id,
      title: updated.title,
      isKey: updated.isKey,
      source: 'tasks_page',
    });
  }

  async function archiveSourceFile(file: VirtualTaskFile | null) {
    if (!file?.sourceId || !window.api?.archiveSourceContext) return;
    if (!window.confirm(`归档${taskFileKindLabel(file)} ${file.name}？`)) return;
    if (!guardDurablePanelAction({ taskId: file.taskId, confirmed: true }).allowed) return;
    const archived = await window.api.archiveSourceContext(file.sourceId).catch(() => null);
    if (!archived) return;
    setSelectedSources((current) => current.filter((item) => item.id !== archived.id));
    if (selectedFileId === file.id) {
      setSelectedObject('task');
      setSelectedFileId(null);
      setFileDraft('');
      setFileDirty(false);
    }
    verifyDurablePanelActionCompleted({
      title: '归档来源',
      output: `已归档 ${file.name}`,
    });
    await recordPanelTimelineEvent(file.taskId, 'panel.source_archived', {
      sourceId: archived.id,
      title: archived.title,
      source: 'tasks_page',
    });
  }

  function copyFilePath(file: VirtualTaskFile | null) {
    if (!file) return;
    void navigator.clipboard?.writeText(file.path).catch(() => {});
  }

  function handleContextMenu(e: React.MouseEvent, taskId: string) {
    e.preventDefault();
    setSelectedId(taskId);
    if (selectedObject === 'task') {
      setSelectedObject('task');
      setSelectedFileId(null);
    }
    setFileContextMenu(null);
    setShowNewFileMenu(false);
    const position = constrainFloatingMenuPosition(e.clientX, e.clientY, 180, 310);
    setContextMenu({ ...position, taskId });
  }

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setFileContextMenu(null);
    setShowNewFileMenu(false);
  }, []);

  function toggleGroup(group: ExplorerGroup) {
    setOpenGroups((current) => ({ ...current, [group]: !current[group] }));
  }

  function isTypeGroupOpen(key: string): boolean {
    return openTypeGroups[key] ?? true;
  }

  function toggleTypeGroup(key: string) {
    setOpenTypeGroups((current) => ({ ...current, [key]: !(current[key] ?? true) }));
  }

  async function transitionWithPlanningHop(task: Task, nextState: TaskState, waitingReason?: string | null) {
    if (!window.api) return;
    const guard = guardTaskStateTransition({
      taskId: task.id,
      nextState,
      confirmationSatisfied: nextState === 'completed' || nextState === 'archived',
    });
    if (!guard.allowed) return;
    if ((task.state === 'captured' || task.state === 'triaged') && nextState !== 'archived') {
      await window.api.transitionTask({ id: task.id, nextState: 'planned' });
    }
    await window.api.transitionTask({ id: task.id, nextState, waitingReason });
  }

  function completeTask(task: Task) {
    const handoff = completionHandoffFromEvaluation(task, allTasks);
    setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
    setSelectedId(null);
    setPostCompletionHandoff(handoff);
    transitionWithPlanningHop(task, 'completed').catch(() => reloadTasks());
  }

  async function continueToNextTaskFromCompletion() {
    if (!postCompletionHandoff?.nextTask) return;
    const { completedTask, nextTask, parentTask } = postCompletionHandoff;
    const nextTaskDetail = await window.api?.getTaskDetail?.(nextTask.id).catch(() => null) ?? null;
    const startVerification = evaluateCompletionHandoffStart({
      completedTask,
      nextTask,
      nextTaskDetail,
      parentTask,
    });
    if (!startVerification.canProceed) {
      setPostCompletionHandoff({
        ...postCompletionHandoff,
        startVerification,
      });
      return;
    }
    const content = buildCompletionHandoffContent(completedTask, nextTask, parentTask);
    const handoffWorthiness = evaluateTaskRecordWorthiness({
      text: content,
      hasTaskContext: true,
      producedDurableChange: true,
      reasonHint: 'handoff',
    });
    if (!handoffWorthiness.shouldCreateTaskRecord) return;
    const today = new Date().toISOString().slice(0, 10);
    const handoffRecord = await window.api?.createTaskFile?.({
      taskId: completedTask.id,
      name: `${today}-completion-handoff.md`,
      path: `Task Records/${today}-completion-handoff.md`,
      kind: 'file',
      content,
    }).catch(() => undefined);
    const receivedHandoffRecord = await window.api?.createTaskFile?.({
      taskId: nextTask.id,
      name: `${today}-received-handoff.md`,
      path: `Task Records/${today}-received-handoff.md`,
      kind: 'file',
      content,
    }).catch(() => undefined);
    await recordPanelTimelineEvent(completedTask.id, 'panel.completion_handoff', {
      nextTaskId: nextTask.id,
      nextTaskTitle: nextTask.title,
      parentTaskId: parentTask?.id ?? null,
      parentTaskTitle: parentTask?.title ?? null,
      recordPath: handoffRecord?.path ?? `Task Records/${today}-completion-handoff.md`,
      receivedRecordPath: receivedHandoffRecord?.path ?? `Task Records/${today}-received-handoff.md`,
      source: 'tasks_page',
    });
    await recordPanelTimelineEvent(nextTask.id, 'panel.completion_handoff', {
      previousTaskId: completedTask.id,
      previousTaskTitle: completedTask.title,
      parentTaskId: parentTask?.id ?? null,
      parentTaskTitle: parentTask?.title ?? null,
      recordPath: receivedHandoffRecord?.path ?? `Task Records/${today}-received-handoff.md`,
      source: 'tasks_page',
    });
    setPostCompletionHandoff(null);
    setSelectedId(nextTask.id);
    setSelectedObject('task');
    setSelectedFileId(null);
    setFileDraft('');
    setFileDirty(false);
    onOpenPanel(nextTask.id, buildNextTaskPrompt(completedTask, nextTask, parentTask), nextTask.title, true, true);
  }

  function markWaitingAfterCompletionCheck(task: Task, reason: string) {
    setCompletionCheckTask(null);
    setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
    setSelectedId(null);
    transitionWithPlanningHop(task, 'waiting_external', reason).catch(() => reloadTasks());
  }

  function deferTask(task: Task, option: string) {
    setDeferOpenId(null);
    const simulatedCount = option === 'next-monday' ? 4 : 1;
    if (simulatedCount >= 3) {
      setDeferConflict({ task, option, count: simulatedCount });
      return;
    }
    confirmDeferTask(task, deferLabel(option));
  }

  function confirmDeferTask(task: Task, targetLabel: string) {
    setDeferConflict(null);
    setSelectedId(null);
    setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
    transitionWithPlanningHop(task, 'waiting_external', `延后处理：${targetLabel}`).catch(() => reloadTasks());
  }

  function updateTaskRisk(taskId: string, riskLevel: TaskRiskLevel) {
    const nextLane: Lane = riskLevel === 'high'
      ? 'escalate'
      : riskLevel === 'medium'
        ? 'unblock'
        : 'continue';
    setContextMenu(null);
    setSelectedId(taskId);
    setAllTasks((prev) => prev.map((task) => (
      task.id === taskId
        ? { ...task, lane: nextLane, status: riskLevel === 'high' ? 'blocked' : task.status }
        : task
    )));
    if (!guardTaskMutation({ taskId }).allowed) {
      reloadTasks();
      return;
    }
    window.api?.updateTask({ id: taskId, riskLevel }).catch(() => reloadTasks());
  }

  function archiveTask(taskId: string) {
    const task = allTasks.find((item) => item.id === taskId);
    if (!task) return;
    setContextMenu(null);
    setSelectedId(null);
    setAllTasks((prev) => prev.filter((item) => item.id !== taskId));
    transitionWithPlanningHop(task, 'archived').catch(() => reloadTasks());
  }

  function copyTaskLink(taskId: string) {
    setContextMenu(null);
    const link = `taskplane://task/${taskId}`;
    void navigator.clipboard?.writeText(link).catch(() => {});
  }

  function openFileContextMenu(event: React.MouseEvent, file: VirtualTaskFile) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setShowNewFileMenu(false);
    const position = constrainFloatingMenuPosition(event.clientX, event.clientY, 170, 230);
    setFileContextMenu({ fileId: file.id, ...position });
  }

  function closeFileContextMenu() {
    setFileContextMenu(null);
  }

  function moveIntoProject(taskId: string, projectId: string | null) {
    const currentTask = allTasks.find((task) => task.id === taskId);
    if (!currentTask) return;
    const previousProject = currentTask.parentTaskId
      ? allTasks.find((task) => task.id === currentTask.parentTaskId) ?? null
      : null;
    const nextProject = projectId
      ? allTasks.find((task) => task.id === projectId) ?? null
      : null;
    const nextChildTaskIds = nextProject && !nextProject.childTaskIds.includes(taskId)
      ? [...nextProject.childTaskIds, taskId]
      : nextProject?.childTaskIds ?? [];
    const previousChildTaskIds = previousProject
      ? previousProject.childTaskIds.filter((id) => id !== taskId)
      : [];
    if (guardTaskMutation({ taskId }).allowed) {
      void window.api?.updateTask?.({
        id: taskId,
        parentTaskId: projectId,
      }).catch(() => undefined);
    }
    if (previousProject) {
      if (guardTaskMutation({ taskId: previousProject.id }).allowed) {
        void window.api?.updateTask?.({
          id: previousProject.id,
          childTaskIds: previousChildTaskIds,
        }).catch(() => undefined);
      }
    }
    if (nextProject) {
      if (guardTaskMutation({ taskId: nextProject.id }).allowed) {
        void window.api?.updateTask?.({
          id: nextProject.id,
          taskType: 'project',
          taskFacets: nextProject.facets,
          childTaskIds: nextChildTaskIds,
        }).catch(() => undefined);
      }
    }
    setContextMenu(null);
    setSelectedId(taskId);
    setAllTasks((prev) => prev.map((task) => {
      if (task.id === taskId) {
        return { ...task, parentTaskId: projectId ?? undefined };
      }
      if (previousProject && task.id === previousProject.id) {
        return { ...task, childTaskIds: previousChildTaskIds };
      }
      if (nextProject && task.id === nextProject.id) {
        return { ...task, type: 'project', childTaskIds: nextChildTaskIds };
      }
      return task;
    }));
    void recordPanelTimelineEvent(taskId, 'panel.project_membership_changed', {
      taskId,
      previousProjectId: previousProject?.id ?? null,
      nextProjectId: nextProject?.id ?? projectId,
      parentTaskId: projectId,
      source: 'tasks_page',
    });
  }

  async function resolveReadyDependency(task: Task) {
    if (!window.api || !task.dependencyId) return;
    try {
      await window.api.resolveTaskDependency(task.dependencyId);
      setAllTasks((prev) => prev.map((item) => (
        item.id === task.id
          ? {
              ...item,
              dependencyId: undefined,
              dependencyReady: false,
              waitingOn: undefined,
              status: 'idle',
              lane: item.state === 'captured' ? 'clarify' : 'continue',
            }
          : item
      )));
    } catch {
      reloadTasks();
    }
  }

  async function generateProjectDecomposition(project: Task) {
    if (!window.api?.decomposeProject || projectDecomposingId) {
      setProjectDecompositionError('当前版本暂时无法调用 AI 拆解服务。');
      return;
    }
    const advancement = evaluateTaskAdvancement({
      entrypoint: 'project_decompose',
      hasTaskContext: true,
      prompt: `拆解项目：${project.title}`,
      runtime: { apiRuntimeReady: Boolean(window.api?.decomposeProject) },
      task: {
        childTaskIds: project.childTaskIds,
        nextStep: project.nextStep ?? null,
        parentTaskId: project.parentTaskId ?? null,
        riskLevel: project.riskLevel,
        state: project.state,
        summary: project.whyNow ?? null,
        title: project.title,
      },
    });
    if (advancement.route === 'blocked') {
      setProjectDecompositionError(advancement.userMessage);
      return;
    }
    const existingStructureEvaluation = evaluateRuntimeSubtaskDraft({
      parentTask: project,
      proposedSubtasks: [],
      existingTasks: allTasks,
    });
    if (!existingStructureEvaluation.allowed) {
      setProjectDecompositionError(existingStructureEvaluation.summary);
      return;
    }
    setProjectDecomposingId(project.id);
    setProjectDecompositionError(null);
    try {
      const result = await window.api.decomposeProject({
        taskId: project.id,
        instructions: buildProjectDecompositionGuidance(project.title),
      });
      setProjectDraft({ projectId: project.id, result });
    } catch (error) {
      setProjectDecompositionError(error instanceof Error ? error.message : 'AI 拆解失败，请稍后重试。');
    } finally {
      setProjectDecomposingId(null);
    }
  }

  async function createProjectChildren(project: Task) {
    if (!window.api || projectCreatingChildrenId) return;
    const draft = projectDraft?.projectId === project.id ? projectDraft.result : null;
    if (!draft) return;
    const draftEvaluation = evaluateRuntimeSubtaskDraft({
      parentTask: project,
      proposedSubtasks: draft.subtasks,
      existingTasks: allTasks,
    });
    if (!draftEvaluation.allowed) {
      setProjectDecompositionError(draftEvaluation.summary);
      return;
    }
    if (!guardDurablePanelAction({ taskId: project.id, confirmed: true }).allowed) {
      setProjectDecompositionError('项目拆解写入被 runtime 检查暂停。');
      return;
    }
    if (!guardTaskMutation({ taskId: project.id }).allowed) {
      setProjectDecompositionError('项目父任务更新被 runtime 检查暂停。');
      return;
    }
    if (!window.api.applyTaskplaneWriteback) {
      setProjectDecompositionError('当前环境缺少统一写回入口，无法确认项目拆解草案。');
      return;
    }
    setProjectCreatingChildrenId(project.id);
    setProjectDecompositionError(null);
    try {
      const plan = buildSubtaskCreateManyWritebackApplyPlan({
        nextStep: draft.nextStep,
        parentSummary: draft.parentGoal,
        parentTaskId: project.id,
        review: draft.review,
        runtimeContract: draft.invocation
          ? {
              invocationLayer: draft.invocation.layer,
              phase: draft.invocation.phase,
              runtimeLabel: draft.invocation.runtime.label,
              runtimeMode: draft.invocation.runtime.mode,
            }
          : null,
        source: 'agent_api_decomposition',
        subtasks: draft.subtasks.map((subtask) => ({
          acceptanceCriteria: subtask.acceptanceCriteria,
          dependency: subtask.dependency,
          summary: subtask.summary,
          title: subtask.title,
        })),
      });
      const promotionReadiness = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
        applyPlan: plan,
        parentTaskId: project.id,
        reversibleProposalCard: {
          proposalId: `project_decomposition:${project.id}`,
          status: 'ready',
        },
        selectedRuntimeContract: draft.invocation
          ? {
              invocationLayer: draft.invocation.layer,
              phase: draft.invocation.phase,
              runtimeMode: draft.invocation.runtime.mode,
            }
          : null,
      });
      if (!promotionReadiness.ready) {
        setProjectDecompositionError(promotionReadiness.summary);
        return;
      }
      const result = await window.api.applyTaskplaneWriteback({
        plan,
        taskId: project.id,
      });
      if (result.status === 'blocked') {
        setProjectDecompositionError(result.message);
        return;
      }
      const createdCount = result.createdTasks?.length ?? draft.subtasks.length;
      verifyDurablePanelActionCompleted({
        title: '确认项目拆解',
        output: `已通过统一写回入口为「${project.title}」创建 ${createdCount} 个子任务。`,
      });
      setProjectDraft(null);
      reloadTasks();
      reloadTaskDetailForTask(project.id);
      reloadTaskFilesForTask(project.id);
    } catch (error) {
      setProjectDecompositionError(error instanceof Error ? error.message : '创建子任务失败，请稍后重试。');
    } finally {
      setProjectCreatingChildrenId(null);
    }
  }

function groupByLane(tasks: Task[]): Record<Lane, Task[]> {
  const result = {} as Record<Lane, Task[]>;
  LANE_ORDER.forEach((lane) => { result[lane] = []; });
  tasks.forEach((t) => result[t.lane].push(t));
  return result;
}

function resetCaptureDraft() {
    setCaptureTitle('');
    setCaptureType('simple');
    setCaptureFacets(['simple']);
    setCaptureTypeTouched(false);
    setCaptureCommitment('');
  }

  async function captureTask() {
    const title = captureTitle.trim();
    if (!title || capturing) return;
    if (!guardTaskCapture({
      confirmationSatisfied: true,
      messageCount: 1,
      candidateTitle: title,
      candidateSummary: captureCommitment,
      existingTasks: allTasks,
    }).allowed) return;
    setCapturing(true);
    try {
      let newId: string;
      const selectedType = captureType;
      const selectedFacets = normalizeTaskTypeFacets(captureFacets, selectedType);
      if (window.api) {
        const summary = captureCommitment.trim();
        const record = await window.api.createTask({
          title,
          summary: summary || undefined,
          taskType: selectedType,
          taskFacets: selectedFacets,
        });
        newId = record.id;
        const plannedRecord = await window.api.transitionTask({ id: record.id, nextState: 'planned' });
        const attrs = saveTaskAttributes(newId, {
          type: selectedType,
          facets: selectedFacets,
          typeConfirmed: true,
          commitment: captureCommitment,
          schedule: defaultScheduleForType(selectedType),
          trigger: defaultTriggerForType(selectedType),
        });
        setAllTasks((prev) => [fromRecord({ ...plannedRecord, activeBlocker: null, activeWaitingItem: null }, attrs), ...prev]);
      } else {
        newId = `t-${Date.now()}`;
        const attrs = saveTaskAttributes(newId, {
          type: selectedType,
          facets: selectedFacets,
          typeConfirmed: true,
          commitment: captureCommitment,
          schedule: defaultScheduleForType(selectedType),
          trigger: defaultTriggerForType(selectedType),
        });
        const fake: Task = {
          id: newId, title, lane: 'clarify', status: 'idle',
          type: attrs.type,
          facets: attrs.facets ?? [attrs.type],
          childTaskIds: attrs.childTaskIds ?? [],
          commitment: attrs.commitment ?? undefined,
          schedule: attrs.schedule ?? undefined,
          trigger: attrs.trigger ?? undefined,
          riskLevel: 'none',
          createdAt: new Date().toISOString(),
          updatedAtIso: new Date().toISOString(),
          updatedAt: new Date().toLocaleDateString('zh'),
          state: 'planned',
        };
        setAllTasks((prev) => [fake, ...prev]);
      }
      resetCaptureDraft();
      setShowCapture(false);
      setSelectedId(newId);
      setSelectedObject('task');
      setCapturedTask({ id: newId, title, type: selectedType });
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="tasks-page" onClick={closeContextMenu}>
      <aside className="lenses-rail task-resource-explorer">
        <div className="task-explorer-head">
          <span>Tasks</span>
          <button
            className="task-new-button"
            aria-label="+ 新建任务"
            title="新建任务"
            onClick={openTaskCreateView}
          >
            新增
          </button>
        </div>

        <ExplorerGroupHeader label="执行清单" open={openGroups.status} onClick={() => toggleGroup('status')} />
        {openGroups.status && (
          <>
            <LensItem label="当前建议" active={selectedObject === 'task-list' && lens === 'all'} onClick={() => selectLens('all')} count={globalExecutionQueueItems.length} icon="•" />
            <LensItem label="推进中" active={selectedObject === 'task-list' && lens === 'running'} onClick={() => selectLens('running')}
              dot="running" count={progressingQueueCount} />
            <LensItem label="等待中" active={selectedObject === 'task-list' && lens === 'waiting'} onClick={() => selectLens('waiting')}
              dot="waiting" count={allTasks.filter(t => t.status === 'waiting').length} />
            <LensItem label="有阻塞" active={selectedObject === 'task-list' && lens === 'blocked'} onClick={() => selectLens('blocked')}
              dot="risk" count={allTasks.filter(t => t.status === 'blocked').length} />
            <LensItem label="待明确" active={selectedObject === 'task-list' && lens === 'clarify'} onClick={() => selectLens('clarify')} icon="?"
              count={allTasks.filter(isClarifyTask).length} />
            <LensItem label="待拍板" active={selectedObject === 'task-list' && lens === 'needsDecision'} onClick={() => selectLens('needsDecision')} icon="?"
              count={tasksWithPendingDecision.length} />
            <LensItem label="已完成 / 已归档" active={selectedObject === 'task-list' && lens === 'done'} onClick={() => selectLens('done')} icon="▣"
              count={allTasks.filter(t => t.status === 'done').length} />
          </>
        )}

        <ExplorerGroupHeader label="任务类型" open={openGroups.type} onClick={() => toggleGroup('type')} />
        {openGroups.type && (
          <div className="task-type-tree">
            {taskTypeGroups.map((group) => (
              <div className="task-type-group" key={group.key}>
                <div className="task-type-group-head">
                  <button
                    className="task-type-disclosure"
                    aria-label={isTypeGroupOpen(group.key) ? '收起任务类型分组' : '展开任务类型分组'}
                    onClick={() => toggleTypeGroup(group.key)}
                    title={isTypeGroupOpen(group.key) ? '收起' : '展开'}
                  >
                    {isTypeGroupOpen(group.key) ? '▾' : '▸'}
                  </button>
                  <LensItem
                    label={group.label}
                    active={selectedObject === 'task-list' && lens === group.lens}
                    onClick={() => selectLens(group.lens)}
                    icon={group.icon}
                    count={group.tasks.length}
                  />
                </div>
                {isTypeGroupOpen(group.key) && group.tasks.length > 0 && (
                  <div className="task-type-children">
                    {group.tasks.slice(0, expandedTypeGroups[group.key] ? group.tasks.length : 12).map((task) => (
                      <TaskExplorerTreeItem
                        key={task.id}
                        task={task}
                        selectedId={selectedId}
                        selectedParentId={selectedParentTask?.id ?? null}
                        selectedObject={selectedObject}
                        onSelect={(id) => selectTask(id, { syncLensToTaskType: true })}
                      />
                    ))}
                  </div>
                )}
                {isTypeGroupOpen(group.key) && group.tasks.length > 12 && !expandedTypeGroups[group.key] && (
                  <button
                    className="task-type-more"
                    onClick={() => setExpandedTypeGroups((current) => ({ ...current, [group.key]: true }))}
                  >
                    展开剩余 {group.tasks.length - 12} 个
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="task-file-group-head">
          <ExplorerGroupHeader label="任务文件" open={openGroups.files} onClick={() => toggleGroup('files')} />
          {selectedTask && (
            <button
              className="task-file-head-action"
              aria-label="+ 新建"
              title="新建任务文件"
              onClick={(event) => {
                event.stopPropagation();
                setShowNewFileMenu((open) => !open);
                setFileContextMenu(null);
              }}
            >
              +
            </button>
          )}
          {showNewFileMenu && selectedTask && (
            <div className="task-file-new-menu">
              <button onClick={() => { setShowNewFileMenu(false); void createTaskFile('file'); }}>普通文件</button>
              <button onClick={() => { setShowNewFileMenu(false); void createTaskFile('folder'); }}>文件夹</button>
              <button onClick={() => { setShowNewFileMenu(false); void createTaskRecordFile(); }}>任务记录</button>
              <button onClick={() => { setShowNewFileMenu(false); void createArtifactFile(); }}>产物文件</button>
            </div>
          )}
        </div>
        {openGroups.files && (
          <>
            {selectedTask && (
              <div className="task-file-tools" onClick={(event) => event.stopPropagation()}>
                <input
                  className="task-file-search"
                  value={fileSearch}
                  onChange={(event) => setFileSearch(event.target.value)}
                  placeholder="搜索文件"
                />
                <div className="task-file-filter-row" role="tablist" aria-label="任务文件类型筛选">
                  {TASK_FILE_FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      className={`task-file-filter${fileFilter === filter.key ? ' active' : ''}`}
                      onClick={() => setFileFilter(filter.key)}
                      role="tab"
                      aria-selected={fileFilter === filter.key}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="task-file-tree">
              {!selectedTask && <div className="task-explorer-empty">选择任务后显示文件</div>}
              {selectedTask && visibleTaskFiles.map((file) => (
                <button
                  key={file.id}
                  className={`task-file-item${selectedFileId === file.id ? ' active' : ''}${file.kind === 'records_folder' || file.kind === 'local_folder' ? ' folder' : ''}`}
                  onClick={() => selectTaskFile(file)}
                  onContextMenu={(event) => openFileContextMenu(event, file)}
                  title={file.path}
                >
                  <span>{file.kind === 'records_folder' || file.kind === 'local_folder' ? '▸' : file.kind === 'source' ? '◇' : file.kind === 'artifact' ? '◆' : '•'}</span>
                  <span>{file.name}</span>
                </button>
              ))}
              {selectedTask && visibleTaskFiles.length === 0 && (
                <div className="task-explorer-empty">没有匹配的任务文件</div>
              )}
            </div>
          </>
        )}
      </aside>

      <div className="tasks-main">
        <div className="tasks-toolbar">
          {selectedObject === 'file' && selectedFile ? (
            <FileHeader
              file={selectedFile}
              dirty={fileDirty}
              onBack={returnToTaskWorkspace}
              onSave={saveFileDraft}
              onRename={renameSelectedFile}
              onMove={moveSelectedFile}
              onDelete={deleteSelectedFile}
              onPreviewPatchReview={selectedPatchReviewAvailable ? () => previewPatchArtifactSandboxReview(selectedFile) : undefined}
              patchReviewBusy={selectedFile?.artifactId === previewingPatchReviewArtifactId}
              onRunPatchReview={selectedPatchReviewRunAvailable ? () => runPatchArtifactSandboxReview(selectedFile) : undefined}
              patchReviewRunBusy={selectedFile?.artifactId === runningPatchReviewArtifactId}
            />
          ) : selectedObject === 'task-create' ? (
            <div className="tasks-toolbar-title">
              <strong>新增任务</strong>
            </div>
          ) : selectedObject === 'task' && selectedTask ? (
            <div className="view-switcher">
              {([
                ['manage', '任务管理'],
                ['timeline', '任务动态'],
              ] as Array<[TaskDetailViewMode, string]>).map(([mode, label]) => (
                <button
                  key={mode}
                  className={`view-btn${taskDetailViewMode === mode ? ' active' : ''}`}
                  onClick={() => setTaskDetailViewMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="view-switcher">
              {(['lane', 'list', 'timeline'] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  className={`view-btn${viewMode === m ? ' active' : ''}`}
                  onClick={() => setViewMode(m)}
                >
                  {m === 'lane' ? '优先处理' : m === 'list' ? '任务目录' : '任务动态'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Post-capture AI nudge */}
        {capturedTask && (
          <div className="capture-nudge">
            <span>✓ 已创建</span>
            <button className="btn sm primary" onClick={() => {
              onOpenPanel(
                capturedTask.id,
                buildVisibleTaskPlanningDraft(capturedTask.title, capturedTask.type),
                capturedTask.title,
                false,
                false,
                true,
              );
              setCapturedTask(null);
            }}>
              {buildTaskPlanningPrompt(capturedTask.title, capturedTask.type).label} →
            </button>
            <button className="icon-btn" style={{ marginLeft: 4 }} onClick={() => setCapturedTask(null)} title="关闭">
              <span style={{ fontSize: 12, lineHeight: 1 }}>×</span>
            </button>
          </div>
        )}

        <div className="task-list">
          {selectedObject === 'task-create' && showCapture ? (
            <div className="capture-form capture-form-page">
              <input
                className="capture-input"
                autoFocus
                placeholder="任务标题… (Enter 快速创建)"
                value={captureTitle}
                onChange={(e) => {
                  const nextTitle = e.target.value;
                  setCaptureTitle(nextTitle);
                  if (!captureTypeTouched) {
                    const profile = inferTaskTypeProfile(nextTitle);
                    setCaptureType(profile.primaryType);
                    setCaptureFacets(profile.facets);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void captureTask(); }
                  if (e.key === 'Escape') closeTaskCreateView();
                }}
              />
              <div className="capture-type-suggestion">
                <span>{captureTypeTouched ? '已确认' : '建议'}</span>
                <strong>
                  {TASK_TYPE_LABELS[captureType]}
                  {captureFacets.length > 1
                    ? ` · 复合：${captureFacets.filter((facet) => facet !== captureType).map((facet) => TASK_TYPE_LABELS[facet]).join(' / ')}`
                    : ''}
                </strong>
              </div>
              <div className="capture-type-row">
                {(['simple', 'project', 'scheduled', 'event', 'routine'] as TaskType[]).map((type) => (
                  <button
                    key={type}
                    className={`capture-type-btn${captureType === type ? ' active' : ''}`}
                    onClick={() => {
                      setCaptureType(type);
                      setCaptureFacets([type]);
                      setCaptureTypeTouched(true);
                    }}
                  >
                    {TASK_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <input
                className="capture-commitment-input"
                placeholder="交付备注（可选）"
                value={captureCommitment}
                onChange={(e) => setCaptureCommitment(e.target.value)}
              />
              {captureSopSuggestions.length > 0 && (
                <div className="capture-sop-suggestions">
                  <span>可参考流程模板</span>
                  {captureSopSuggestions.slice(0, 2).map((habit) => (
                    <strong key={habit.id}>{habit.rule}</strong>
                  ))}
                  <small>创建后 AI 会在规划讨论中建议是否加载，不会自动套用。</small>
                </div>
              )}
              <div className="capture-actions">
                <button className={`btn sm primary${capturing ? ' disabled' : ''}`} onClick={() => void captureTask()} disabled={!captureTitle.trim() || capturing}>
                  {capturing ? '创建中…' : '创建'}
                </button>
                <button className="btn sm ghost" onClick={closeTaskCreateView}>
                  取消
                </button>
              </div>
            </div>
          ) : selectedObject === 'file' && selectedFile ? (
            <FileWorkspace
              file={selectedFile}
              draft={fileDraft}
              dirty={fileDirty}
              notice={selectedPatchReviewMessage}
              noticeTone={selectedPatchReviewTone}
              noticeAction={selectedPatchPromotionApplyAvailable ? {
                description: '只写入 reviewed patch 中通过 preflight 的匹配文件；完成或阻塞后请复核 Run 证据。',
                disabled: applyingPatchPromotionCheckpointId === selectedPatchPromotionView?.checkpointId,
                label: applyingPatchPromotionCheckpointId === selectedPatchPromotionView?.checkpointId
                  ? '应用中...'
                  : '应用到工作区',
                onClick: () => void applySandboxPatchPromotion(selectedPatchPromotionView, selectedFile),
              } : selectedPatchPromotionApplyDisabledAction}
              onChange={(value) => {
                setFileDraft(value);
                setFileDirty(value !== selectedFile.content);
              }}
            />
          ) : selectedObject === 'task' && selectedTask && taskDetailViewMode === 'timeline' ? (
            <TaskTimelineView
              task={selectedTask}
              parentTask={selectedParentTask}
              displayType={selectedEffectiveType ?? selectedTask.type}
              events={runtimeEvents}
              runCount={selectedRuns.length}
              writebackApprovals={writebackApprovalItems}
              standingApprovalDraft={standingApprovalDraft}
              standingApprovalConfirmed={standingApprovalConfirmed}
              confirmingStandingApprovalId={confirmingStandingApprovalId}
              triggeringScheduledEventId={triggeringScheduledEventId}
              standingApprovalMessages={standingApprovalMessages}
              applyingWritebackApprovalId={applyingWritebackApprovalId}
              writebackApprovalMessages={writebackApprovalMessages}
              onConfirmStandingApproval={confirmStandingApprovalDraft}
              onTriggerScheduledEventAgentRun={triggerScheduledEventAgentRun}
              onConfirmWriteback={confirmWritebackApproval}
              onSelectParent={selectTask}
            />
          ) : selectedObject === 'task' && selectedTask ? (
            <TaskPreview
              task={selectedTask}
              parentTask={selectedParentTask}
              childTasks={directChildTasks}
              displayType={selectedEffectiveType ?? selectedTask.type}
              completionCriteria={selectedTaskDetail?.completionCriteria ?? []}
              taskFiles={taskFiles}
              relatedFiles={relatedFiles}
              artifactCount={selectedArtifacts.length}
              projectDraft={projectDraft?.projectId === selectedTask.id ? projectDraft.result : null}
              projectBusy={projectDecomposingId === selectedTask.id}
              projectCreating={projectCreatingChildrenId === selectedTask.id}
              projectError={projectDecompositionError}
              projectVerification={selectedProjectVerification}
              keySources={selectedSources.slice(0, 3)}
              hasPendingDecision={selectedHasDecision}
              planningLabel={selectedTaskPlanningPrompt?.label ?? '规划讨论'}
              onOpenPanel={() => {
                if (!selectedTaskPlanningPrompt) return;
                const nextChildTask = directChildTasks.find((task) => task.status !== 'done') ?? null;
                if (nextChildTask && (selectedEffectiveType === 'project' || directChildTasks.length > 0)) {
                  selectTask(nextChildTask.id);
                  onOpenPanel(
                    nextChildTask.id,
                    buildChildTaskAdvanceDraft(nextChildTask, selectedTask, localTaskFiles[nextChildTask.id] ?? []),
                    nextChildTask.title,
                    false,
                    true,
                    true,
                  );
                  return;
                }
                onOpenPanel(
                  selectedTask.id,
                  buildVisibleTaskPlanningDraft(selectedTask.title, selectedEffectiveType ?? selectedTask.type),
                  selectedTask.title,
                  false,
                  false,
                  true,
                );
              }}
              runCount={selectedRuns.length}
              onShowTaskDynamics={() => setTaskDetailViewMode('timeline')}
              onOpenDecision={onOpenDecision}
              deferOpen={deferOpenId === selectedTask.id}
              onDeferToggle={() => setDeferOpenId((prev) => (prev === selectedTask.id ? null : selectedTask.id))}
              onDeferSelect={(option) => deferTask(selectedTask, option)}
              onComplete={() => setCompletionCheckTask(selectedTask)}
              onResolveDependency={() => resolveReadyDependency(selectedTask)}
  onGenerateDecomposition={() => {
                if (!selectedTaskPlanningPrompt) return;
                onOpenPanel(
                  selectedTask.id,
                  buildVisibleTaskPlanningDraft(selectedTask.title, selectedEffectiveType ?? selectedTask.type),
                  selectedTask.title,
                  false,
                  false,
                  true,
                );
              }}
              onCreateDraftChildren={() => createProjectChildren(selectedTask)}
              onDiscardDraft={() => setProjectDraft((current) => (
                current?.projectId === selectedTask.id ? null : current
              ))}
              onSelectChild={selectTask}
              onSelectParent={selectTask}
              onSelectFile={selectTaskFile}
            />
          ) : viewMode === 'lane' ? (
            <ExecutionQueueView
              items={executionQueueItems}
              selectedId={selectedId}
              deferOpenId={deferOpenId}
              onRowClick={handleRowClick}
              onRowDoubleClick={handleRowDoubleClick}
              onContextMenu={handleContextMenu}
              onDeferToggle={(task) => setDeferOpenId((prev) => (prev === task.id ? null : task.id))}
              onDeferSelect={deferTask}
              onComplete={(task) => setCompletionCheckTask(task)}
              onMore={(event, task) => handleContextMenu(event, task.id)}
              onResolveDependency={resolveReadyDependency}
            />
          ) : viewMode === 'timeline' ? (
            <TimelineView tasks={filtered} onOpen={selectTask} />
          ) : (
            <TaskDirectoryView
              groups={taskDirectoryGroups}
              selectedId={selectedId}
              deferOpenId={deferOpenId}
              onRowClick={handleRowClick}
              onRowDoubleClick={handleRowDoubleClick}
              onContextMenu={handleContextMenu}
              onDeferToggle={(task) => setDeferOpenId((prev) => (prev === task.id ? null : task.id))}
              onDeferSelect={deferTask}
              onComplete={(task) => setCompletionCheckTask(task)}
              onMore={(event, task) => handleContextMenu(event, task.id)}
              onResolveDependency={resolveReadyDependency}
            />
          )}
          {selectedObject === 'task-list' && (
            viewMode === 'lane' ? executionQueueTasks.length === 0 : viewMode === 'list' ? taskDirectoryGroups.length === 0 : filtered.length === 0
          ) && !loading && (
            <div className="tasks-empty">
              {allTasks.length === 0
                ? <><p>还没有任何任务。</p><p className="muted" style={{ marginTop: 4, fontSize: 12 }}>点击左侧「+」开始捕获你的第一个任务。</p></>
                : <p>当前视角下没有任务。</p>
              }
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          task={allTasks.find((task) => task.id === contextMenu.taskId) ?? null}
          projects={projectParents}
          onClose={closeContextMenu}
          onMoveToProject={(projectId) => moveIntoProject(contextMenu.taskId, projectId)}
          onUpdateRisk={(riskLevel) => updateTaskRisk(contextMenu.taskId, riskLevel)}
          onArchive={() => archiveTask(contextMenu.taskId)}
          onCopyLink={() => copyTaskLink(contextMenu.taskId)}
        />
      )}

      {fileContextMenu && contextMenuFile && (
        <FileContextMenu
          x={fileContextMenu.x}
          y={fileContextMenu.y}
          file={contextMenuFile}
          source={contextMenuFile.sourceId ? selectedSources.find((item) => item.id === contextMenuFile.sourceId) ?? null : null}
          onClose={closeFileContextMenu}
          onOpen={() => { selectTaskFile(contextMenuFile); closeFileContextMenu(); }}
          onRename={() => { closeFileContextMenu(); void renameFile(contextMenuFile); }}
          onMove={() => { closeFileContextMenu(); void moveFile(contextMenuFile); }}
          onDelete={() => { closeFileContextMenu(); void deleteFile(contextMenuFile); }}
          onCopyPath={() => { copyFilePath(contextMenuFile); closeFileContextMenu(); }}
          onPreviewPatchReview={() => { closeFileContextMenu(); void previewPatchArtifactSandboxReview(contextMenuFile); }}
          onRunPatchReview={() => { closeFileContextMenu(); void runPatchArtifactSandboxReview(contextMenuFile); }}
          onApplyPatchPromotion={contextMenuPatchPromotionApplyAvailable
            ? () => {
                selectTaskFile(contextMenuFile);
                closeFileContextMenu();
                void applySandboxPatchPromotion(contextMenuPatchPromotionView, contextMenuFile);
              }
            : null}
          onToggleSourceKey={() => { closeFileContextMenu(); void toggleSourceKey(contextMenuFile); }}
          onArchiveSource={() => { closeFileContextMenu(); void archiveSourceFile(contextMenuFile); }}
        />
      )}

      {deferConflict && (
        <div className="modal-backdrop" onClick={() => setDeferConflict(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>目标日已比较饱满</h3>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                下周一已有 {deferConflict.count} 件任务，继续安排到周一还是移到周二？
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn sm" onClick={() => setDeferConflict(null)}>
                取消
              </button>
              <button
                className="btn sm"
                onClick={() => confirmDeferTask(deferConflict.task, deferLabel(deferConflict.option))}
              >
                周一
              </button>
              <button
                className="btn sm primary"
                onClick={() => confirmDeferTask(deferConflict.task, '周二')}
              >
                周二
              </button>
              <button
                className="btn sm ghost"
                onClick={() => {
                  const taskId = deferConflict.task.id;
                  setDeferConflict(null);
                  setSelectedId(taskId);
                  setDeferOpenId(taskId);
                }}
              >
                我来选
              </button>
            </div>
          </div>
        </div>
      )}

      {completionCheckTask && (
        <TaskCompletionCheckModal
          taskId={completionCheckTask.id}
          taskTitle={completionCheckTask.title}
          onCancel={() => setCompletionCheckTask(null)}
          onCompleteAnyway={() => {
            const task = completionCheckTask;
            if (!task) return;
            setCompletionCheckTask(null);
            completeTask(task);
          }}
          onMarkWaiting={(reason) => {
            const task = completionCheckTask;
            if (!task) return;
            markWaitingAfterCompletionCheck(task, reason);
          }}
        />
      )}

      {postCompletionHandoff && (
        <div className="modal-backdrop" onClick={() => setPostCompletionHandoff(null)}>
          <div className="modal completion-handoff-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>任务已完成</h3>
            </div>
            <div className="modal-body">
              <div className="completion-handoff-summary">
                <span className="completion-check-label">已完成</span>
                <strong>{postCompletionHandoff.completedTask.title}</strong>
                {postCompletionHandoff.parentTask && (
                  <p>所属项目：{postCompletionHandoff.parentTask.title}</p>
                )}
              </div>
              {postCompletionHandoff.nextTask ? (
                <div className="completion-handoff-next">
                  <span className="completion-check-label">运行时交接建议</span>
                  <strong>{postCompletionHandoff.nextTask.title}</strong>
                  <p>{postCompletionHandoff.evaluation?.reason ?? '将保存一条轻量交接记录，并把右侧 AI 面板切换到这项任务。不会自动执行下一任务。'}</p>
                  {postCompletionHandoff.startVerification && !postCompletionHandoff.startVerification.canProceed && (
                    <p>{postCompletionHandoff.startVerification.detail}</p>
                  )}
                </div>
              ) : (
                <div className="completion-handoff-next quiet">
                  <span className="completion-check-label">运行时判断</span>
                  <p>{postCompletionHandoff.evaluation?.reason ?? '当前没有明确的项目后续子任务。可以回到优先处理继续选择。'}</p>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setPostCompletionHandoff(null)}>
                仅完成任务
              </button>
              {postCompletionHandoff.nextTask && (
                <button className="btn sm primary" onClick={() => void continueToNextTaskFromCompletion()}>
                  进入下一任务
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {pendingFileSwitch && (
        <div className="modal-backdrop" onClick={() => setPendingFileSwitch(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>文件有未保存修改</h3>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                先保存、放弃修改，或取消本次切换。
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn sm" onClick={() => setPendingFileSwitch(null)}>取消</button>
              <button className="btn sm ghost" onClick={discardAndContinueSwitch}>放弃修改</button>
              <button className="btn sm primary" onClick={() => void saveAndContinueSwitch()}>保存并继续</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildVirtualTaskFiles(
  task: Task,
  sources: SourceContextRecord[],
  artifacts: ArtifactRecord[],
  persistedTaskRecordContent?: string,
): VirtualTaskFile[] {
  const taskRecord = persistedTaskRecordContent ?? [
    '# Task',
    '',
    '## Goal',
    task.title,
    '',
    '## Current Progress',
    task.whyNow ?? 'No summary recorded yet.',
    '',
    '## Key Context',
    sources.length ? sources.map((source) => `- ${source.title}${source.note ? `: ${source.note}` : ''}`).join('\n') : 'No key files or sources linked yet.',
    '',
    '## Decisions',
    'No durable decisions recorded in this task file yet.',
    '',
    '## Constraints',
    task.waitingOn ?? 'No active constraint recorded.',
    '',
    '## Open Questions',
    'No open questions recorded yet.',
    '',
    '## Next Step',
    task.nextStep ?? 'Clarify the next step.',
    '',
    '## Important Files',
    sources.length ? sources.map((source) => `- ${source.title}`).join('\n') : 'No important files linked yet.',
    '',
    '## Recent Records',
    'Task Records/ is ready for durable handoffs and milestone notes.',
    '',
  ].join('\n');

  return [
    {
      id: `${task.id}:task-md`,
      taskId: task.id,
      name: 'Task.md',
      path: 'Task.md',
      kind: 'task_record',
      content: taskRecord,
      editable: true,
      updatedAt: task.updatedAt,
    },
    {
      id: `${task.id}:records`,
      taskId: task.id,
      name: 'Task Records/',
      path: 'Task Records/',
      kind: 'records_folder',
      content: '',
      editable: false,
      updatedAt: task.updatedAt,
    },
    ...sources.map((source) => sourceToVirtualFile(task.id, source)),
    ...artifacts.map(artifactToVirtualFile),
  ];
}

function parseTaskRecordPatch(content: string): Pick<UpdateTaskInput, 'summary' | 'nextStep'> {
  const summary = normalizeTaskRecordSection(readMarkdownSection(content, 'Current Progress'), [
    'No summary recorded yet.',
  ]);
  const nextStep = normalizeTaskRecordSection(readMarkdownSection(content, 'Next Step'), [
    'Clarify the next step.',
  ]);
  const patch: Pick<UpdateTaskInput, 'summary' | 'nextStep'> = {};
  if (summary !== undefined) patch.summary = summary;
  if (nextStep !== undefined) patch.nextStep = nextStep;
  return patch;
}

function readMarkdownSection(content: string, heading: string): string | undefined {
  const expectedHeading = `## ${heading.toLowerCase()}`;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim().toLowerCase() === expectedHeading);
  if (start === -1) return undefined;

  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^##\s+/.test(line.trim())) break;
    section.push(line);
  }
  return section.join('\n').trim();
}

function normalizeTaskRecordSection(value: string | undefined, placeholders: string[]): string | null | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || placeholders.includes(normalized)) return null;
  return normalized;
}

function artifactToVirtualFile(artifact: ArtifactRecord): VirtualTaskFile {
  return {
    id: `${artifact.taskId}:artifact:${artifact.id}`,
    taskId: artifact.taskId,
    name: artifact.title,
    path: `Artifacts/${artifact.title}`,
    kind: 'artifact',
    artifactId: artifact.id,
    artifactKind: artifact.kind,
    content: artifact.content,
    editable: artifact.kind === 'note' || artifact.title.endsWith('.md') || artifact.title.endsWith('.txt'),
    updatedAt: artifact.updatedAt,
  };
}

function isOpenableTaskFile(file: VirtualTaskFile): boolean {
  return file.kind !== 'records_folder' && file.kind !== 'local_folder';
}

function isPatchArtifactFile(file: VirtualTaskFile | null): file is VirtualTaskFile & { artifactId: string } {
  return Boolean(file?.artifactId && file.kind === 'artifact' && file.artifactKind === 'patch');
}

function formatSandboxPatchPromotionNotice(view: SandboxPatchPromotionView): string {
  const decisionLabel = view.decisionId
    ? `Decision ${view.decisionId}`
    : '未关联 Decision';
  return `Promotion：${view.label}（${decisionLabel}）；${view.detail}`;
}

function runtimeSurfaceForFile(file: VirtualTaskFile) {
  return classifyRuntimeFileSurface({
    kind: file.kind,
    path: file.path,
    name: file.name,
    sourceRole: file.sourceRole,
    sourceNote: file.sourceNote,
    sourceUri: file.sourceUri,
    artifactKind: file.artifactKind,
  });
}

function classifyTaskFile(file: VirtualTaskFile): TaskFileClass {
  return runtimeSurfaceForFile(file).fileClass;
}

function taskFileCategory(file: VirtualTaskFile): RelatedFileCategory {
  return classifyTaskFile(file);
}

function constrainFloatingMenuPosition(x: number, y: number, width: number, height: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y };
  const padding = 8;
  const maxX = Math.max(padding, window.innerWidth - width - padding);
  const maxY = Math.max(padding, window.innerHeight - height - padding);
  return {
    x: Math.min(Math.max(padding, x), maxX),
    y: Math.min(Math.max(padding, y), maxY),
  };
}

function taskFileFilterForFile(file: VirtualTaskFile): Exclude<TaskFileFilter, 'all'> | null {
  return classifyTaskFile(file);
}

function taskFileKindLabel(file: VirtualTaskFile): string {
  return runtimeSurfaceForFile(file).label;
}

function taskFileNote(file: VirtualTaskFile): string {
  return runtimeSurfaceForFile(file).note;
}

function relatedFileScore(file: VirtualTaskFile): number {
  return runtimeSurfaceForFile(file).rank;
}

function fileTimeValue(file: VirtualTaskFile): number {
  if (!file.updatedAt) return 0;
  const time = new Date(file.updatedAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function buildRelatedTaskFileItems(files: VirtualTaskFile[]): RelatedTaskFileItem[] {
  return files
    .filter(isOpenableTaskFile)
    .sort((a, b) => {
      const score = relatedFileScore(a) - relatedFileScore(b);
      if (score !== 0) return score;
      const time = fileTimeValue(b) - fileTimeValue(a);
      return time !== 0 ? time : a.name.localeCompare(b.name);
    })
    .map((file) => ({
      file,
      category: taskFileCategory(file),
      label: taskFileKindLabel(file),
      note: taskFileNote(file),
    }));
}

function applyFileOverrides(files: VirtualTaskFile[], overrides: Record<string, string>): VirtualTaskFile[] {
  return files.map((file) => overrides[file.id] == null ? file : { ...file, content: overrides[file.id] });
}

function taskFileRecordToLocalRecord(record: TaskFileRecord): LocalTaskFileRecord {
  return {
    id: record.id,
    taskId: record.taskId,
    name: record.name,
    path: record.path,
    kind: record.kind === 'folder' ? 'local_folder' : 'local_file',
    content: record.content,
    editable: record.kind === 'file',
    updatedAt: record.updatedAt,
  };
}

function isPersistedTaskRecordFile(file: LocalTaskFileRecord): boolean {
  return isTaskMdPath(file.path);
}

function truncateFileContext(value: string, limit = 1600): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed;
}

function safeSourcePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[\\/:\*\?"<>\|#]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    || 'source';
}

function sourceCapturedDate(source: SourceContextRecord): string {
  return (source.capturedAt ?? source.createdAt ?? source.updatedAt).slice(0, 10) || 'undated';
}

function sourceBatchSegment(source: SourceContextRecord): string | null {
  const batch = source.batchId ?? (source.runId ? `run:${source.runId}` : null);
  if (!batch) return null;
  return safeSourcePathSegment(batch.replace(/^run:/, 'run-'));
}

function sourceToVirtualFile(taskId: string, source: SourceContextRecord): VirtualTaskFile {
  const sourceSurface = classifySourceContextSurface({
    title: source.title,
    note: source.note,
    sourceRole: source.sourceRole,
  });
  const isTaskRecord = sourceSurface === 'task_record';
  const sourcePathParts = [
    'Sources',
    sourceCapturedDate(source),
    sourceBatchSegment(source),
    `${safeSourcePathSegment(source.title)}.md`,
  ].filter(Boolean);
  return {
    id: `${taskId}:source:${source.id}`,
    taskId,
    name: `${source.title}.md`,
    path: isTaskRecord ? `Task Records/${safeSourcePathSegment(source.title)}.md` : sourcePathParts.join('/'),
    kind: 'source',
    sourceId: source.id,
    sourceRole: source.sourceRole ?? 'raw',
    sourceNote: source.note,
    sourceUri: source.uri,
    content: [
      `# ${source.title}`,
      '',
      `Captured: ${source.capturedAt ?? source.createdAt ?? source.updatedAt}`,
      source.runId ? `Run: ${source.runId}` : null,
      source.batchId ? `Batch: ${source.batchId}` : null,
      `Role: ${source.sourceRole ?? 'raw'}`,
      source.uri ? `URI: ${source.uri}` : null,
      source.note ? `Note: ${source.note}` : null,
      '',
      source.content ?? 'No content captured for this source yet.',
      '',
    ].filter(Boolean).join('\n'),
    editable: true,
    updatedAt: source.capturedAt ?? source.updatedAt,
  };
}

function fileProjectionLabel(file: VirtualTaskFile): string {
  return runtimeSurfaceForFile(file).projectionLabel;
}

function FileHeader({
  file,
  dirty,
  onBack,
  onSave,
  onRename,
  onMove,
  onDelete,
  onPreviewPatchReview,
  patchReviewBusy = false,
  onRunPatchReview,
  patchReviewRunBusy = false,
}: {
  file: VirtualTaskFile;
  dirty: boolean;
  onBack: () => void;
  onSave: () => void | Promise<void>;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onPreviewPatchReview?: () => void | Promise<void>;
  patchReviewBusy?: boolean;
  onRunPatchReview?: () => void | Promise<void>;
  patchReviewRunBusy?: boolean;
}) {
  const immutableFile = file.kind === 'task_record' || file.kind === 'source';
  const fileLocationLabel = taskFileKindLabel(file);
  return (
    <div className="file-workspace-header">
      <button className="btn sm ghost" onClick={onBack}>返回任务</button>
      <div className="file-tab active">
        <span>{file.name}</span>
        {dirty && <span className="file-dirty">•</span>}
      </div>
      <span className="file-path">{fileLocationLabel}</span>
      <button className="btn sm ghost" onClick={onRename} disabled={immutableFile}>重命名</button>
      <button className="btn sm ghost" onClick={onMove} disabled={immutableFile}>移动</button>
      <button className="btn sm ghost" onClick={onDelete} disabled={immutableFile}>删除</button>
      {onPreviewPatchReview && (
        <button className="btn sm ghost" onClick={() => void onPreviewPatchReview()} disabled={patchReviewBusy}>
          {patchReviewBusy ? '预检中...' : '沙箱预检'}
        </button>
      )}
      {onRunPatchReview && (
        <button className="btn sm ghost" onClick={() => void onRunPatchReview()} disabled={patchReviewRunBusy}>
          {patchReviewRunBusy ? 'review 中...' : '运行 review'}
        </button>
      )}
      <button className="btn sm primary" onClick={() => void onSave()} disabled={!dirty}>保存</button>
    </div>
  );
}

function ExplorerGroupHeader({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button className="lens-group-toggle" onClick={onClick} aria-expanded={open}>
      <span>{open ? '▾' : '▸'}</span>
      <span>{label}</span>
    </button>
  );
}

function FileWorkspace({
  file,
  draft,
  dirty,
  notice,
  noticeAction,
  noticeTone,
  onChange,
}: {
  file: VirtualTaskFile;
  draft: string;
  dirty: boolean;
  notice?: string | null;
  noticeAction?: {
    description?: string;
    disabled?: boolean;
    label: string;
    onClick: () => void;
  } | null;
  noticeTone?: SandboxPatchPromotionView['tone'] | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="file-workspace">
      <div className="file-workspace-meta">
        <span>{fileProjectionLabel(file)}</span>
        <span>{file.editable ? (dirty ? 'Unsaved changes' : 'Saved') : 'Read-only preview'}</span>
      </div>
      {!file.editable && (
        <div className="file-readonly-note">
          此文件当前仅支持只读预览；非文本或受保护文件不会在 v1 中强制内联编辑。
        </div>
      )}
      {notice && (
        <div className={`file-readonly-note${noticeTone ? ` ${noticeTone}` : ''}`}>
          <span className="file-readonly-note-copy">
            <span>{notice}</span>
            {noticeAction?.description && <small>{noticeAction.description}</small>}
          </span>
          {noticeAction && (
            <button
              className="file-readonly-note-action"
              disabled={noticeAction.disabled}
              onClick={noticeAction.onClick}
            >
              {noticeAction.label}
            </button>
          )}
        </div>
      )}
      <textarea
        className="file-editor"
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        readOnly={!file.editable}
        spellCheck={false}
      />
    </div>
  );
}

function TaskTimelineView({
  task,
  parentTask,
  displayType,
  events,
  runCount,
  writebackApprovals,
  standingApprovalDraft,
  standingApprovalConfirmed,
  confirmingStandingApprovalId,
  triggeringScheduledEventId,
  standingApprovalMessages,
  applyingWritebackApprovalId,
  writebackApprovalMessages,
  onConfirmStandingApproval,
  onTriggerScheduledEventAgentRun,
  onConfirmWriteback,
  onSelectParent,
}: {
  task: Task;
  parentTask: Task | null;
  displayType: TaskType;
  events: RuntimeEventRecord[];
  runCount: number;
  writebackApprovals: TaskplaneWritebackApprovalItem[];
  standingApprovalDraft: AgentStandingApprovalConfirmationDraft | null;
  standingApprovalConfirmed: boolean;
  confirmingStandingApprovalId: string | null;
  triggeringScheduledEventId: string | null;
  standingApprovalMessages: Record<string, string>;
  applyingWritebackApprovalId: string | null;
  writebackApprovalMessages: Record<string, string>;
  onConfirmStandingApproval: (draft: AgentStandingApprovalConfirmationDraft) => void;
  onTriggerScheduledEventAgentRun: (draft: AgentStandingApprovalConfirmationDraft) => void;
  onConfirmWriteback: (item: TaskplaneWritebackApprovalItem) => void;
  onSelectParent: (taskId: string) => void;
}) {
  const ordered = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groupedEvents = groupRuntimeEventsByDate(ordered);
  const replayGroups = groupRuntimeEventsForReplay(ordered);
  const eventById = new Map(ordered.map((event) => [event.id, event]));
  const scopeCopy = parentTask
    ? `当前显示子任务动态；父任务「${parentTask.title}」保留项目层汇总。任务动态由任务事件、执行、任务记录和拍板项统一投影。`
    : displayType === 'project'
      ? '当前显示父任务的项目层任务动态；子任务细节进入对应子任务查看。任务动态由任务事件、执行、任务记录和拍板项统一投影。'
      : '当前显示此任务自己的任务动态，包含任务事件、执行、任务记录和拍板项。';

  return (
    <div className="task-timeline-workspace">
      <div className="task-preview-head">
        {parentTask && (
          <button className="task-parent-return" onClick={() => onSelectParent(parentTask.id)}>
            ← 返回父任务：{parentTask.title}
          </button>
        )}
        <span className={`tag lane-${task.lane}`}>{LANE_LABELS[task.lane]}</span>
        <h3 className="task-preview-title">{task.title}</h3>
        <div className="task-preview-type-row">
          <span className="tag">{formatTaskTypeForDisplay(task, parentTask, displayType)}</span>
          {formatSecondaryFacets(task, displayType).map((facet) => (
            <span className="tag subtle" key={facet}>{facet}</span>
          ))}
          {runCount > 0 && <span className="preview-type-hint">{runCount} 条执行记录</span>}
        </div>
      </div>

      <div className="preview-section">
        <div className="preview-label">任务动态</div>
        <p className="preview-config-note compact">{scopeCopy}</p>
        {standingApprovalDraft && (
          <div className="task-writeback-approvals" aria-label="Standing Approval 授权草案">
            <div className="task-writeback-approval">
              <div className="task-writeback-approval-main">
                <div className="task-writeback-approval-title">
                  <strong>{standingApprovalDraft.title}</strong>
                  <span>{standingApprovalConfirmed ? '已确认' : standingApprovalDraft.status === 'ready' ? 'L2 授权草案' : '授权未就绪'}</span>
                </div>
                <p>{standingApprovalConfirmed
                  ? 'Standing Approval 已记录到任务动态；当前仍不会启动 scheduler，也不会写入工作区。'
                  : standingApprovalDraft.evaluation.accepted
                    ? '可确认有限自主行动策略；当前不会启动 scheduler，也不会写入工作区。'
                    : '当前任务仍有授权前缺口；请先补齐 readiness。'}</p>
                <small>{standingApprovalDraft.detail}</small>
                <div className="task-writeback-evidence-chips" aria-label="Standing Approval readiness evidence">
                  {standingApprovalEvidenceChips(standingApprovalDraft).map((chip) => (
                    <span key={chip}>{chip}</span>
                  ))}
                </div>
                {!standingApprovalDraft.evaluation.accepted && (
                  <em>{standingApprovalDraft.evaluation.blockedReasons.join('；')}</em>
                )}
                {standingApprovalMessages[standingApprovalDraft.id] && (
                  <em>{standingApprovalMessages[standingApprovalDraft.id]}</em>
                )}
              </div>
              <button
                className={`btn sm${standingApprovalDraft.status !== 'ready' || standingApprovalConfirmed || confirmingStandingApprovalId ? ' disabled' : ''}`}
                disabled={standingApprovalDraft.status !== 'ready' || standingApprovalConfirmed || Boolean(confirmingStandingApprovalId)}
                onClick={() => onConfirmStandingApproval(standingApprovalDraft)}
              >
                {standingApprovalConfirmed
                  ? '已确认'
                  : confirmingStandingApprovalId === standingApprovalDraft.id
                    ? '确认中...'
                    : standingApprovalDraft.status === 'ready'
                      ? '确认授权'
                      : '暂不可确认'}
              </button>
              {standingApprovalConfirmed && (
                <button
                  className={`btn sm${triggeringScheduledEventId ? ' disabled' : ''}`}
                  disabled={Boolean(triggeringScheduledEventId)}
                  onClick={() => onTriggerScheduledEventAgentRun(standingApprovalDraft)}
                >
                  {triggeringScheduledEventId === standingApprovalDraft.id ? '启动中...' : '启动一次'}
                </button>
              )}
            </div>
          </div>
        )}
        {writebackApprovals.length > 0 && (
          <div className="task-writeback-approvals" aria-label="待确认写回提案">
            {writebackApprovals.slice(0, 4).map((item) => {
              const busy = applyingWritebackApprovalId === item.id;
              return (
                <div className="task-writeback-approval" key={item.id}>
                  <div className="task-writeback-approval-main">
                    <div className="task-writeback-approval-title">
                      <strong>{item.title}</strong>
                      <span>{writebackApprovalSourceLabel(item)}</span>
                    </div>
                    <p>{item.summary}</p>
                    <small>{truncateRuntimeApprovalDetail(item.detail)}</small>
                    {writebackApprovalMessages[item.id] && (
                      <em>{writebackApprovalMessages[item.id]}</em>
                    )}
                  </div>
                  <button
                    className={`btn sm${busy ? ' disabled' : ''}`}
                    disabled={Boolean(applyingWritebackApprovalId)}
                    onClick={() => onConfirmWriteback(item)}
                  >
                    {busy ? '确认中…' : '确认写回'}
                  </button>
                </div>
              );
            })}
            {writebackApprovals.length > 4 && (
              <div className="task-writeback-overflow">{`另有 ${writebackApprovals.length - 4} 条写回提案，请回到右侧面板逐条处理。`}</div>
            )}
          </div>
        )}
        {ordered.length === 0 ? (
          <div className="tasks-empty compact">
            <p>当前任务还没有任务动态。</p>
          </div>
        ) : (
          <>
            {replayGroups.length > 0 && (
              <div className="task-timeline-list" aria-label="任务动态关键脉络">
                <section className="task-timeline-day">
                  <div className="task-timeline-date">关键脉络</div>
                  <div className="task-timeline-day-items">
                    {replayGroups.slice(0, 5).map((group) => {
                      const groupEvents = group.eventIds
                        .map((eventId) => eventById.get(eventId))
                        .filter((event): event is RuntimeEventRecord => Boolean(event));
                      return (
                        <div key={group.id} className="task-timeline-item">
                          <span className={`task-timeline-marker ${runtimeReplayGroupTone(group)}`} />
                          <span className="task-timeline-time">{formatRuntimeReplayGroupTimeRange(group)}</span>
                          <div className="task-timeline-content">
                            <div className="task-timeline-title-row">
                              <strong>{group.title}</strong>
                              <span>{formatRuntimeReplayGroupScope(group)}</span>
                            </div>
                            <div className="task-replay-meta" aria-label="脉络来源">
                              {formatRuntimeReplayGroupSourceLabels(group).map((label) => (
                                <span key={label}>{label}</span>
                              ))}
                            </div>
                            <p>{group.summary ?? '相关任务动态已归并到同一条脉络。'}</p>
                            {groupEvents.length > 0 && (
                              <ul className="task-replay-events">
                                {groupEvents.slice(0, 3).map((event) => (
                                  <li key={event.id}>{event.title}</li>
                                ))}
                                {groupEvents.length > 3 && (
                                  <li>{`另有 ${groupEvents.length - 3} 条动态`}</li>
                                )}
                              </ul>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}
            <div className="task-timeline-list">
              {groupedEvents.map((group) => (
                <section className="task-timeline-day" key={group.date}>
                  <div className="task-timeline-date">{group.date}</div>
                  <div className="task-timeline-day-items">
                    {group.events.map((event) => {
                      return (
                        <div key={event.id} className="task-timeline-item">
                          <span className={`task-timeline-marker ${runtimeEventTone(event)}`} />
                          <span className="task-timeline-time">{formatIsoTime(event.createdAt)}</span>
                          <div className="task-timeline-content">
                            <div className="task-timeline-title-row">
                              <strong>{event.title}</strong>
                              <span>{formatRuntimeEventScope(event)}</span>
                            </div>
                            {event.detail && <p>{event.detail}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatRuntimeReplayGroupScope(group: RuntimeReplayGroup): string {
  const parts = [
    `${group.eventIds.length} 条动态`,
    formatRuntimeReplayGroupKind(group.kind),
    group.relatedTaskIds.length > 0 ? `${group.relatedTaskIds.length} 个关联任务` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function truncateRuntimeApprovalDetail(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= 160) return compact;
  return `${compact.slice(0, 157)}...`;
}

function writebackApprovalSourceLabel(item: TaskplaneWritebackApprovalItem): string {
  if (item.source === 'task_memory_guidance') return '任务记忆';
  if (item.source === 'scheduler_decision_proposal') return '调度提案';
  return 'Write Intent';
}

function formatRuntimeReplayGroupTimeRange(group: RuntimeReplayGroup): string {
  const start = formatIsoTime(group.startedAt);
  const end = formatIsoTime(group.updatedAt);
  return start === end ? end : `${start}-${end}`;
}

function formatRuntimeReplayGroupSourceLabels(group: RuntimeReplayGroup): string[] {
  const labels = group.sourceTypes.map(formatRuntimeEventSourceType);
  return Array.from(new Set(labels));
}

function formatRuntimeEventSourceType(sourceType: RuntimeEventRecord['sourceType']): string {
  if (sourceType === 'run') return 'Run';
  if (sourceType === 'run_step') return 'Run Step';
  if (sourceType === 'task_record') return '任务记录';
  if (sourceType === 'decision') return '拍板';
  if (sourceType === 'runtime_projection') return '运行时';
  return '任务事件';
}

function formatRuntimeReplayGroupKind(kind: RuntimeReplayGroup['kind']): string {
  switch (kind) {
    case 'handoff': return '交接';
    case 'project_structure': return '结构';
    case 'execution_recovery': return '执行';
    case 'decision': return '拍板';
    case 'quality_gate': return '质量';
    case 'durable_record': return '记录';
    case 'source_context': return '上下文';
    case 'task_state': return '状态';
    default: return '一般';
  }
}

function runtimeReplayGroupTone(group: RuntimeReplayGroup): 'risk' | 'wait' | 'running' | '' {
  if (group.priority === 'p1') return 'risk';
  if (group.kind === 'decision' || group.kind === 'quality_gate' || group.priority === 'p2') return 'wait';
  if (group.kind === 'execution_recovery') return 'running';
  return '';
}

function groupRuntimeEventsByDate(events: RuntimeEventRecord[]): Array<{ date: string; events: RuntimeEventRecord[] }> {
  const grouped = new Map<string, RuntimeEventRecord[]>();
  for (const event of events) {
    const key = formatTimelineDate(event.createdAt);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(event);
  }
  return Array.from(grouped, ([date, items]) => ({ date, events: items }));
}

function formatTimelineDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatIsoTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatIsoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function runtimeEventTone(event: RuntimeEventRecord): string {
  if (event.priority === 'p1') return 'attention';
  if (event.type.includes('decision') || event.type.includes('completion_check')) return 'attention';
  if (event.sourceType === 'run' || event.sourceType === 'run_step' || event.type.includes('artifact')) return 'execution';
  if (event.type.includes('source_context') || event.type.includes('context')) return 'context';
  if (event.type.includes('completion_criteria') || event.type.includes('completion_handoff')) return 'criteria';
  return 'record';
}

function formatRuntimeEventScope(event: RuntimeEventRecord): string {
  if (event.sourceType === 'run' || event.sourceType === 'run_step') return '执行';
  if (event.sourceType === 'task_record') return '记录';
  if (event.sourceType === 'decision' || event.type.includes('decision')) return '拍板';
  if (event.sourceType === 'runtime_projection') return '运行时';
  if (event.type.includes('artifact')) return '产物';
  if (event.type.includes('source_context') || event.type.includes('source')) return '来源';
  if (event.type.includes('completion')) return '验收';
  if (event.type.startsWith('panel.')) return '面板';
  return '任务';
}

function formatTaskStatus(status: TaskStatus): string {
  if (status === 'running') return '进行中';
  if (status === 'waiting') return '等待中';
  if (status === 'blocked') return '有阻塞';
  if (status === 'done') return '已完成';
  return '未开始';
}

function formatTaskLaneForDetail(lane: Lane): string {
  if (lane === 'escalate') return '需立即处理';
  if (lane === 'unblock') return '需解除阻塞';
  if (lane === 'continue') return '继续推进';
  if (lane === 'clarify') return '待明确';
  return '平稳推进';
}

/* ─── Timeline view ─── */

function TimelineView({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const grouped = new Map<string, Task[]>();
  for (const t of [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const key = t.updatedAt;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  if (tasks.length === 0) return null;

  return (
    <div className="timeline-view">
      {[...grouped.entries()].map(([date, group]) => (
        <div key={date} className="timeline-group">
          <div className="timeline-date">{date}</div>
          <div className="timeline-items">
            {group.map((task) => (
              <div key={task.id} className="timeline-item" onClick={() => onOpen(task.id)}>
                <div className={`timeline-dot ${task.status}`} />
                <div className="timeline-content">
                  <span className="timeline-title">{task.title}</span>
                  <span className={`tag lane-${task.lane}`} style={{ fontSize: 10, marginLeft: 8 }}>
                    {LANE_LABELS[task.lane]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Lens item ─── */

interface LensItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  dot?: string;
  icon?: string;
}

function LensItem({ label, active, onClick, count, dot, icon }: LensItemProps) {
  return (
    <button className={`lens-item${active ? ' active' : ''}`} onClick={onClick}>
      {dot && <span className={`dot ${dot}`} />}
      {icon && <span className="lens-icon">{icon}</span>}
      <span className="lens-label">{label}</span>
      {count != null && count > 0 && (
        <span className="lens-count">{count}</span>
      )}
    </button>
  );
}

function TaskExplorerTreeItem({
  task,
  selectedId,
  selectedParentId,
  selectedObject,
  onSelect,
}: {
  task: Task;
  selectedId: string | null;
  selectedParentId: string | null;
  selectedObject: SelectedObject;
  onSelect: (id: string) => void;
}) {
  const active = selectedId === task.id || selectedParentId === task.id;
  return (
    <div className="task-type-node">
      <button
        className={`task-explorer-task${active ? ' active' : ''}${selectedParentId === task.id && selectedId !== task.id ? ' parent-active' : ''}`}
        aria-label={task.title}
        onClick={() => onSelect(task.id)}
        title={task.title}
      >
        <span className={`dot ${statusDot(task.status)}`} />
        <span className="task-explorer-title-visual" data-title={task.title} aria-hidden="true" />
      </button>
    </div>
  );
}

function ExecutionQueueView({
  items,
  selectedId,
  deferOpenId,
  onRowClick,
  onRowDoubleClick,
  onContextMenu,
  onDeferToggle,
  onDeferSelect,
  onComplete,
  onMore,
  onResolveDependency,
}: {
  items: ExecutionQueueItem[];
  selectedId: string | null;
  deferOpenId: string | null;
  onRowClick: (id: string) => void;
  onRowDoubleClick: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
  onDeferToggle: (task: Task) => void;
  onDeferSelect: (task: Task, option: string) => void;
  onComplete: (task: Task) => void;
  onMore: (event: React.MouseEvent, task: Task) => void;
  onResolveDependency: (task: Task) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="execution-queue">
      <div className="execution-queue-head">
        <div>
          <strong>优先处理队列</strong>
          <span>按可行动性优先，同类再看日期、触发、影响范围和最近意图</span>
        </div>
        <span>{items.length} 项建议</span>
      </div>
      {items.map((item, index) => {
        const task = item.task;
        const selected = selectedId === task.id;
        const parentLabel = item.parentTask ? `父任务：${item.parentTask.title}` : '顶层任务';
        const statusLabel = executionQueueStatusLabel(task, item);
        const statusTone = executionQueueStatusTone(task, item);
        return (
          <div
            key={task.id}
            className={`execution-queue-card${selected ? ' selected' : ''}`}
            onClick={() => onRowClick(task.id)}
            onDoubleClick={() => onRowDoubleClick(task.id)}
            onContextMenu={(event) => onContextMenu(event, task.id)}
          >
            <span className={`execution-rank${index < 3 ? ' high' : ''}`}>{index + 1}</span>
            <div className="execution-queue-main">
              <div className="execution-queue-title-row">
                <strong title={task.title}>{task.title}</strong>
                <span className="execution-title-meta">
                  <span className="execution-status-label" title={statusLabel} aria-label={statusLabel}>
                    <span className={`execution-state-block ${statusTone}`} aria-hidden="true" />
                    <span>{statusLabel}</span>
                  </span>
                  <span>{parentLabel}</span>
                  <span>{task.updatedAt}</span>
                </span>
              </div>
              {task.waitingOn && (
                <div className={`execution-waiting${task.dependencyReady ? ' ready' : ''}`}>{task.waitingOn}</div>
              )}
              <div className="execution-next">
                <span>{item.reason}</span>
                <p>{task.nextStep || task.waitingOn || '先补充下一步行动或验收标准。'}</p>
              </div>
            </div>
            <div className="execution-queue-actions" onClick={(event) => event.stopPropagation()}>
              <button
                className="btn sm primary"
                onClick={() => {
                  if (task.dependencyReady && task.dependencyId) {
                    onResolveDependency(task);
                    return;
                  }
                  onRowClick(task.id);
                }}
              >
                {item.nextAction} →
              </button>
              {selected && (
                <>
                  <div className="preview-defer-action">
                    <button className="btn sm ghost" onClick={() => onDeferToggle(task)}>延后 ▾</button>
                    {deferOpenId === task.id && (
                      <div className="defer-menu">
                        {DEFER_OPTIONS.map((opt) => (
                          <button key={opt.value} className="defer-option" onClick={() => onDeferSelect(task, opt.value)}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="btn sm" onClick={() => onComplete(task)}>完成</button>
                </>
              )}
              <button className="btn sm ghost" onClick={(event) => onMore(event, task)} style={{ padding: '3px 6px' }}>⋯</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskDirectoryView({
  groups,
  selectedId,
  deferOpenId,
  onRowClick,
  onRowDoubleClick,
  onContextMenu,
  onDeferToggle,
  onDeferSelect,
  onComplete,
  onMore,
  onResolveDependency,
}: {
  groups: TaskDirectoryGroup[];
  selectedId: string | null;
  deferOpenId: string | null;
  onRowClick: (id: string) => void;
  onRowDoubleClick: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
  onDeferToggle: (task: Task) => void;
  onDeferSelect: (task: Task, option: string) => void;
  onComplete: (task: Task) => void;
  onMore: (event: React.MouseEvent, task: Task) => void;
  onResolveDependency: (task: Task) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="task-directory">
      {groups.map((group) => {
        const done = group.children.filter((task) => task.status === 'done').length;
        const blocked = group.children.filter((task) => task.status === 'blocked').length;
        const clarify = group.children.filter((task) => task.status !== 'done' && task.lane === 'clarify').length;
        const projectStats = [
          group.children.length > 0 ? `${done}/${group.children.length} 完成` : null,
          blocked > 0 ? `${blocked} 阻塞` : null,
          clarify > 0 ? `${clarify} 待明确` : null,
        ].filter(Boolean).join(' · ');
        return (
          <div key={group.root.id} className={`task-directory-group${group.rootMatches ? '' : ' context-only'}`}>
            <div className="task-directory-head">
              <span className="project-disclosure">▾</span>
              <span className="task-directory-title">{group.root.title}</span>
              {group.root.type === 'project' && <span className="task-directory-kind">项目</span>}
              {group.children.length > 0 && (
                <span className="task-directory-progress">{projectStats}</span>
              )}
              {!group.rootMatches && <span className="task-directory-context-note">父任务归属</span>}
            </div>
            <TaskRow
              task={group.root}
              selected={selectedId === group.root.id}
              deferOpen={deferOpenId === group.root.id}
              onClick={() => onRowClick(group.root.id)}
              onDoubleClick={() => onRowDoubleClick(group.root.id)}
              onContextMenu={(event) => onContextMenu(event, group.root.id)}
              onDeferToggle={(event) => { event.stopPropagation(); onDeferToggle(group.root); }}
              onDeferSelect={(option) => onDeferSelect(group.root, option)}
              onComplete={(event) => { event.stopPropagation(); onComplete(group.root); }}
              onMore={(event) => { event.stopPropagation(); onMore(event, group.root); }}
              onResolveDependency={onResolveDependency}
            />
            {group.children.map((child) => (
              <div key={child.id} className="task-directory-child-row">
                <TaskRow
                  task={child}
                  selected={selectedId === child.id}
                  deferOpen={deferOpenId === child.id}
                  onClick={() => onRowClick(child.id)}
                  onDoubleClick={() => onRowDoubleClick(child.id)}
                  onContextMenu={(event) => onContextMenu(event, child.id)}
                  onDeferToggle={(event) => { event.stopPropagation(); onDeferToggle(child); }}
                  onDeferSelect={(option) => onDeferSelect(child, option)}
                  onComplete={(event) => { event.stopPropagation(); onComplete(child); }}
                  onMore={(event) => { event.stopPropagation(); onMore(event, child); }}
                  onResolveDependency={onResolveDependency}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ProjectTreeView({
  projects,
  tasks,
  selectedId,
  deferOpenId,
  onRowClick,
  onRowDoubleClick,
  onContextMenu,
  onDeferToggle,
  onDeferSelect,
  onComplete,
  onMore,
  onResolveDependency,
  projectDraft,
  decomposingId,
  creatingChildrenId,
  decompositionError,
  onGenerateDecomposition,
  onCreateDraftChildren,
  onDiscardDraft,
}: {
  projects: Task[];
  tasks: Task[];
  selectedId: string | null;
  deferOpenId: string | null;
  onRowClick: (id: string) => void;
  onRowDoubleClick: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
  onDeferToggle: (task: Task) => void;
  onDeferSelect: (task: Task, option: string) => void;
  onComplete: (task: Task) => void;
  onMore: (event: React.MouseEvent, task: Task) => void;
  onResolveDependency: (task: Task) => void;
  projectDraft: { projectId: string; result: ProjectDecompositionResult } | null;
  decomposingId: string | null;
  creatingChildrenId: string | null;
  decompositionError: string | null;
  onGenerateDecomposition: (project: Task) => void;
  onCreateDraftChildren: (project: Task) => void;
  onDiscardDraft: (project: Task) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <div className="project-tree">
      {projects.map((project) => {
        const children = orderedTaskChildren(project, tasks);
        const done = children.filter((task) => task.status === 'done').length;
        return (
          <div key={project.id} className="project-group">
            <div className="project-group-head">
              <span className="project-disclosure">▾</span>
              <span className="project-group-title">{project.title}</span>
              <span className="project-progress">{done}/{children.length} 子任务完成</span>
            </div>
            <TaskRow
              task={project}
              selected={selectedId === project.id}
              deferOpen={deferOpenId === project.id}
              onClick={() => onRowClick(project.id)}
              onDoubleClick={() => onRowDoubleClick(project.id)}
              onContextMenu={(event) => onContextMenu(event, project.id)}
              onDeferToggle={(event) => { event.stopPropagation(); onDeferToggle(project); }}
              onDeferSelect={(option) => onDeferSelect(project, option)}
              onComplete={(event) => { event.stopPropagation(); onComplete(project); }}
              onMore={(event) => { event.stopPropagation(); onMore(event, project); }}
              onResolveDependency={onResolveDependency}
            />
            {children.map((child) => (
              <div key={child.id} className="project-child-row">
                <TaskRow
                  task={child}
                  selected={selectedId === child.id}
                  deferOpen={deferOpenId === child.id}
                  onClick={() => onRowClick(child.id)}
                  onDoubleClick={() => onRowDoubleClick(child.id)}
                  onContextMenu={(event) => onContextMenu(event, child.id)}
                  onDeferToggle={(event) => { event.stopPropagation(); onDeferToggle(child); }}
                  onDeferSelect={(option) => onDeferSelect(child, option)}
                  onComplete={(event) => { event.stopPropagation(); onComplete(child); }}
                  onMore={(event) => { event.stopPropagation(); onMore(event, child); }}
                  onResolveDependency={onResolveDependency}
                />
              </div>
            ))}
            {children.length === 0 && (
              <ProjectDecompositionPanel
                project={project}
                draft={projectDraft?.projectId === project.id ? projectDraft.result : null}
                busy={decomposingId === project.id}
                creating={creatingChildrenId === project.id}
                error={decompositionError}
                onGenerate={() => onGenerateDecomposition(project)}
                onCreate={() => onCreateDraftChildren(project)}
                onDiscard={() => onDiscardDraft(project)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProjectDecompositionPanel({
  project,
  draft,
  busy,
  creating,
  error,
  onGenerate,
  onCreate,
  onDiscard,
}: {
  project: Task;
  draft: ProjectDecompositionResult | null;
  busy: boolean;
  creating: boolean;
  error: string | null;
  onGenerate: () => void;
  onCreate: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="project-child-empty">
      {!draft ? (
        <>
          <div className="project-empty-title">还没有项目拆解</div>
          <div className="project-empty-copy">先在右侧 AI 面板讨论拆解方案，确认后再创建真实子任务和验收标准。</div>
          <button className={`btn sm primary${busy ? ' disabled' : ''}`} onClick={onGenerate} disabled={busy}>
            {busy ? '生成中…' : '拆解任务'}
          </button>
        </>
      ) : (
        <>
          <div className="project-draft-head">
            <div>
              <div className="project-empty-title">AI 拆解草稿</div>
              <div className="project-empty-copy">{draft.parentGoal}</div>
              {draft.invocation && (
                <small>Runtime：{draft.invocation.runtime.label} · {draft.invocation.layer}</small>
              )}
            </div>
            <div className="project-draft-actions">
              <button className="btn sm ghost" onClick={onGenerate} disabled={busy || creating}>
                {busy ? '生成中…' : '重新生成'}
              </button>
              <button className="btn sm ghost" onClick={onDiscard} disabled={creating}>
                放弃草稿
              </button>
              <button className={`btn sm primary${creating ? ' disabled' : ''}`} onClick={onCreate} disabled={creating}>
                {creating ? '创建中…' : '确认创建子任务'}
              </button>
            </div>
          </div>
          <div className="project-draft-list">
            {draft.subtasks.map((subtask) => (
              <div key={`${project.id}-${subtask.title}`} className="project-draft-item">
                <strong>{subtask.title}</strong>
                <span>{subtask.summary}</span>
                <small>验收：{subtask.acceptanceCriteria}</small>
                {subtask.dependency && <small>依赖：{subtask.dependency}</small>}
                <small>独立性：{subtask.rationale}</small>
              </div>
            ))}
          </div>
          <div className="project-draft-review">
            <div className="project-draft-review-title">拆解自检</div>
            <div className="project-draft-checks">
              <span>大块任务</span>
              <span>边界独立</span>
              <span>依赖明确</span>
              <span>验收可见</span>
            </div>
            <p>{draft.review}</p>
            <small>{draft.nextStep}</small>
            <small>层级规则：最多保持项目 → 子任务两层；复杂子任务应升级为项目型重新拆解。</small>
          </div>
        </>
      )}
      {error && <div className="project-draft-error">{error}</div>}
    </div>
  );
}

/* ─── Task row ─── */

interface TaskRowProps {
  task: Task;
  selected: boolean;
  deferOpen: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDeferToggle: (e: React.MouseEvent) => void;
  onDeferSelect: (opt: string) => void;
  onComplete: (e: React.MouseEvent) => void;
  onMore: (e: React.MouseEvent) => void;
  onResolveDependency: (task: Task) => void;
}

function TaskRow({
  task, selected, deferOpen,
  onClick, onDoubleClick, onContextMenu,
  onDeferToggle, onDeferSelect, onComplete, onMore, onResolveDependency,
}: TaskRowProps) {
  return (
    <div
      className={`task-row${selected ? ' selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Status dot */}
      <span className={`dot ${taskStatusTone(task)}`} style={{ flexShrink: 0 }} />

      {/* Title + metadata */}
      <div className="task-row-body">
        <span className="task-row-title">{task.title}</span>
        <div className="task-row-meta">
          {task.type !== 'simple' && (
            <span className="tag">
              {task.type === 'project' ? '项目' : task.type === 'scheduled' ? '定时' : task.type === 'event' ? '事件' : '常设'}
            </span>
          )}
          <span className={`task-row-status ${taskStatusTone(task)}`}>{taskStatusLabel(task)}</span>
          {task.whyNow && !selected && (
            <span className="task-row-why">{task.whyNow}</span>
          )}
          {task.waitingOn && (
            <span className={`task-row-waiting${task.dependencyReady ? ' ready' : ''}`}>{formatCompactWaitingOn(task.waitingOn)}</span>
          )}
        </div>
      </div>

      {/* Right side: timestamp or action buttons */}
      {selected ? (
        <div className="task-row-actions" onClick={(e) => e.stopPropagation()}>
          {task.dependencyReady && task.dependencyId && (
            <button className="btn sm" onClick={() => onResolveDependency(task)}>解除依赖</button>
          )}
          <div style={{ position: 'relative' }}>
            <button className="btn sm ghost" onClick={onDeferToggle}>延后 ▾</button>
            {deferOpen && (
              <div className="defer-menu">
                {DEFER_OPTIONS.map((opt) => (
                  <button key={opt.value} className="defer-option"
                    onClick={(e) => { e.stopPropagation(); onDeferSelect(opt.value); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn sm" onClick={onComplete}>完成</button>
          <button className="btn sm ghost" onClick={onMore} style={{ padding: '3px 6px' }}>⋯</button>
        </div>
      ) : (
        <span className="task-row-date">{task.updatedAt}</span>
      )}
    </div>
  );
}

function statusDot(status: TaskStatus): string {
  if (status === 'running') return 'running';
  if (status === 'waiting') return 'waiting';
  if (status === 'blocked') return 'risk';
  if (status === 'done') return 'completed';
  return '';
}

/* ─── Task preview ─── */

interface TaskPreviewProps {
  task: Task;
  parentTask: Task | null;
  childTasks: Task[];
  displayType: TaskType;
  completionCriteria: TaskDetail['completionCriteria'];
  taskFiles: VirtualTaskFile[];
  relatedFiles: RelatedTaskFileItem[];
  artifactCount: number;
  projectDraft: ProjectDecompositionResult | null;
  projectBusy: boolean;
  projectCreating: boolean;
  projectError: string | null;
  projectVerification: RuntimeVerificationResult | null;
  keySources: SourceContextRecord[];
  runCount: number;
  hasPendingDecision: boolean;
  planningLabel: string;
  onOpenPanel: () => void;
  onShowTaskDynamics: () => void;
  onOpenDecision: () => void;
  deferOpen: boolean;
  onDeferToggle: () => void;
  onDeferSelect: (opt: string) => void;
  onComplete: () => void;
  onResolveDependency: () => void;
  onGenerateDecomposition: () => void;
  onCreateDraftChildren: () => void;
  onDiscardDraft: () => void;
  onSelectChild: (taskId: string) => void;
  onSelectParent: (taskId: string) => void;
  onSelectFile: (file: VirtualTaskFile) => void;
}

function TaskPreview({
  task,
  parentTask,
  childTasks,
  displayType,
  completionCriteria,
  taskFiles,
  relatedFiles,
  artifactCount,
  projectDraft,
  projectBusy,
  projectCreating,
  projectError,
  projectVerification,
  keySources,
  runCount,
  hasPendingDecision,
  planningLabel,
  onOpenPanel,
  onShowTaskDynamics,
  onOpenDecision,
  deferOpen,
  onDeferToggle,
  onDeferSelect,
  onComplete,
  onResolveDependency,
  onGenerateDecomposition,
  onCreateDraftChildren,
  onDiscardDraft,
  onSelectChild,
  onSelectParent,
  onSelectFile,
}: TaskPreviewProps) {
  const draftPanelRef = useRef<HTMLDivElement | null>(null);
  const [activeRelatedCategory, setActiveRelatedCategory] = useState<RelatedFileCategory>('task');
  const hasNonDefaultTaskFiles = taskFiles.some((file) => !['records_folder', 'local_folder', 'task_record'].includes(file.kind));
  const completedCriteria = completionCriteria.filter((criterion) => criterion.status === 'satisfied').length;
  const orderedChildren = childTasks;
  const completedChildren = orderedChildren.filter((child) => child.status === 'done').length;
  const hasChildTaskStructure = childTasks.length > 0;
  const isProjectLikeTask = displayType === 'project' || hasChildTaskStructure;
  const projectVerificationResult = projectVerification?.project ?? null;
  const needsProjectDecomposition = task.type === 'project' && childTasks.length === 0;
  const isFreshProject = needsProjectDecomposition && !projectDraft;
  const hasExecutionContext = keySources.length > 0 || artifactCount > 0 || hasNonDefaultTaskFiles;
  const isCompletedTask = task.status === 'done';
  const readyForExecution = Boolean(task.nextStep)
    && !task.waitingOn
    && task.status !== 'blocked'
    && task.status !== 'waiting'
    && (completionCriteria.length > 0 || hasExecutionContext || runCount > 0 || task.type === 'scheduled' || task.type === 'event' || task.type === 'routine');
  const hasStructureContent = isProjectLikeTask
    || task.type === 'routine'
    || completionCriteria.length > 0
    || Boolean(task.schedule)
    || Boolean(task.trigger)
    || Boolean(task.commitment);
  const primaryAction = isCompletedTask
    ? {
        label: '查看任务动态 →',
        onClick: onShowTaskDynamics,
          disabled: false,
        tone: 'plan' as const,
      }
    : hasPendingDecision
    ? {
        label: '去拍板 →',
        onClick: onOpenDecision,
        disabled: false,
        tone: 'decision' as const,
      }
    : needsProjectDecomposition
      ? {
          label: '拆解任务 →',
          onClick: onGenerateDecomposition,
        disabled: false,
        tone: 'decompose' as const,
      }
      : task.status === 'blocked'
        ? {
            label: '处理阻塞 →',
            onClick: onOpenPanel,
            disabled: false,
            tone: 'plan' as const,
          }
        : task.status === 'waiting'
          ? {
              label: '补充信息 →',
              onClick: onOpenPanel,
              disabled: false,
              tone: 'plan' as const,
            }
          : isProjectLikeTask && childTasks.length > 0
            ? {
                label: '推进子任务 →',
                onClick: onOpenPanel,
                disabled: false,
                tone: 'plan' as const,
              }
            : readyForExecution
              ? {
                  label: '开始执行 →',
                  onClick: onOpenPanel,
                  disabled: false,
                  tone: 'plan' as const,
                }
              : {
                  label: `${planningLabel} →`,
                  onClick: onOpenPanel,
                  disabled: false,
                  tone: 'plan' as const,
                };
  const progressionLabel = isCompletedTask ? '完成状态' : isFreshProject ? '当前阶段' : '当前推进';
  const nextStepLabel = isCompletedTask ? '结果' : isFreshProject ? '建议操作' : '下一步';
  const nextStepCopy = isCompletedTask
    ? '这项任务已经完成，保留在已完成 / 已归档视角中作为记录。'
    : isFreshProject
    ? '先在右侧 AI 面板讨论拆解方案，确认后再创建真实子任务和验收标准。'
    : task.nextStep || '等待补充下一步行动。';
  const freshProjectReason = '这个项目还没有可执行结构，需要先拆解成清晰的子任务。';
  const relatedCategories = RELATED_FILE_CATEGORY_ORDER
    .map((category) => ({
      ...category,
      count: relatedFiles.filter((item) => item.category === category.key).length,
    }))
    .filter((category) => category.count > 0);
  const currentRelatedCategory = relatedCategories.some((category) => category.key === activeRelatedCategory)
    ? activeRelatedCategory
    : relatedCategories[0]?.key ?? 'task';
  const currentRelatedFiles = relatedFiles
    .filter((item) => item.category === currentRelatedCategory)
    .sort((a, b) => {
      const time = fileTimeValue(b.file) - fileTimeValue(a.file);
      return time !== 0 ? time : a.file.name.localeCompare(b.file.name);
    });
  const visibleRelatedFiles = currentRelatedFiles.slice(0, 10);
  const hiddenRelatedFileCount = Math.max(0, currentRelatedFiles.length - visibleRelatedFiles.length);

  useEffect(() => {
    setActiveRelatedCategory('task');
  }, [task.id]);

  return (
    <div className="task-preview-inner">
      <section className="task-detail-layer identity">
        <div className="task-detail-layer-head">
          <span className="preview-label">任务概览</span>
          <span className="preview-type-hint">更新 {formatIsoDate(task.updatedAt)}</span>
        </div>
        <div className="task-preview-head">
          {parentTask && (
            <button className="task-parent-return" onClick={() => onSelectParent(parentTask.id)}>
              ← 返回父任务：{parentTask.title}
            </button>
          )}
          <h3 className="task-preview-title">{task.title}</h3>
          <div className="task-preview-type-row">
            <span className={`tag ${taskStatusTone(task)}`}>{taskStatusLabel(task)}</span>
            <span className="tag">{formatTaskTypeForDisplay(task, parentTask, displayType)}</span>
            {formatSecondaryFacets(task, displayType).map((facet) => (
              <span className="tag subtle" key={facet}>{facet}</span>
            ))}
            {isProjectLikeTask && <span className="preview-type-hint">可在项目结构中查看子任务</span>}
            {task.type === 'scheduled' && <span className="preview-type-hint">周期触发</span>}
            {task.type === 'event' && <span className="preview-type-hint">监听外部条件</span>}
            {task.type === 'routine' && <span className="preview-type-hint">长期维护</span>}
          </div>
          {(task.whyNow || isFreshProject) && (
            <p className="task-summary-line">
              <span>任务摘要：</span>
              {task.whyNow || freshProjectReason}
            </p>
          )}
          <div className="task-object-summary">
            <div>
              <strong>{taskDisplayStatusLabel(task)}</strong>
              <span>当前状态</span>
            </div>
            <div>
              <strong>{isProjectLikeTask ? `${completedChildren}/${childTasks.length}` : `${completedCriteria}/${completionCriteria.length}`}</strong>
              <span>{isProjectLikeTask ? '子任务完成' : '标准满足'}</span>
            </div>
            <div>
              <strong>{runCount}</strong>
              <span>执行记录</span>
            </div>
            <div>
              <strong>{relatedFiles.length}</strong>
              <span>上下文文件</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`task-detail-layer progression${isFreshProject ? ' fresh-project' : ''}`}>
        <div className="task-detail-layer-head">
          <span className="preview-label">{progressionLabel}</span>
          {hasPendingDecision && <span className="task-detail-alert">等待拍板</span>}
        </div>

        <div className="task-detail-action-strip">
          <div className="task-detail-next-step">
            <span>{nextStepLabel}</span>
            <p>{nextStepCopy}</p>
          </div>

          <button
            className={`btn primary task-primary-action ${primaryAction.tone}`}
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </button>
        </div>

        {task.waitingOn && (
          <div className="preview-chip">
            <span className="dot waiting" />
            {task.waitingOn}
          </div>
        )}

        {isCompletedTask ? (
          <p className="preview-config-note compact">已完成任务不再显示延后、完成等推进动作；需要继续处理时，可从任务动态或任务文件回溯上下文后创建后续任务。</p>
        ) : (
        <div className="preview-task-actions">
          {task.dependencyReady && task.dependencyId && (
            <button className="btn sm" onClick={onResolveDependency}>解除依赖</button>
          )}
          <div className="preview-defer-action">
            <button className="btn sm ghost" onClick={onDeferToggle}>延后 ▾</button>
            {deferOpen && (
              <div className="defer-menu">
                {DEFER_OPTIONS.map((opt) => (
                  <button key={opt.value} className="defer-option" onClick={() => onDeferSelect(opt.value)}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn sm" onClick={onComplete}>完成</button>
        </div>
        )}
      </section>

      <section className={`task-detail-layer structure${hasStructureContent ? '' : ' quiet'}`}>
        <div className="task-detail-layer-head">
          <span className="preview-label">{isProjectLikeTask ? '项目结构' : '结构'}</span>
          {!hasStructureContent && <span className="preview-type-hint">按需建立</span>}
        </div>

        {isProjectLikeTask ? (
          <>
            <div className="task-detail-grid">
              <div className="task-detail-stat">
                <strong>{completedChildren}/{childTasks.length}</strong>
                <span>子任务</span>
              </div>
              <div className="task-detail-stat">
                <strong>{completionCriteria.length}</strong>
                <span>完成标准</span>
              </div>
            </div>
            {childTasks.length === 0 && (
              <p className="preview-config-note">在 AI 面板确认拆解方案后，这里会显示子任务和完成标准；确认前不会写入真实任务。</p>
            )}
            {projectVerificationResult && (
              <div className={`project-verification-panel ${projectVerification?.tone ?? 'pending'}`}>
                <div className="project-verification-head">
                  <span>项目验证</span>
                  <strong>{projectVerification?.label}</strong>
                </div>
                <p>{projectVerification?.detail}</p>
                <div className="project-verification-metrics">
                  <span>子任务 {projectVerificationResult.childCompleted}/{projectVerificationResult.childTotal}</span>
                  {projectVerificationResult.childOpen > 0 && <span>未完成 {projectVerificationResult.childOpen}</span>}
                  {projectVerificationResult.blockerCount > 0 && <span>阻塞/依赖 {projectVerificationResult.blockerCount}</span>}
                  {projectVerificationResult.waitingCount > 0 && <span>等待 {projectVerificationResult.waitingCount}</span>}
                  {projectVerificationResult.criteriaOpen > 0 && <span>父任务标准未满足 {projectVerificationResult.criteriaOpen}</span>}
                  {projectVerificationResult.decisionEffect && projectVerificationResult.decisionEffect.tone !== 'none' && (
                    <span>{projectVerificationResult.decisionEffect.effectLabel}</span>
                  )}
                  {projectVerificationResult.artifactCount !== null && <span>产出 {projectVerificationResult.artifactCount}</span>}
                  {projectVerificationResult.keySourceCount !== null && <span>关键来源 {projectVerificationResult.keySourceCount}</span>}
                </div>
              </div>
            )}
            {orderedChildren.length > 0 && (
              <div className="project-child-list">
                {orderedChildren.map((child, index) => (
                  <button
                    key={child.id}
                    className="project-child-card"
                    onClick={() => onSelectChild(child.id)}
                    title={child.title}
                  >
                    <span className="project-child-order">{index + 1}</span>
                    <span className={`dot ${statusDot(child.status)}`} />
                    <span className="project-child-main">
                      <strong>{child.title}</strong>
                      <small>{formatTaskStatus(child.status)} · {LANE_LABELS[child.lane]}</small>
                    </span>
                    <span className="project-child-open">进入 →</span>
                  </button>
                ))}
              </div>
            )}
            {projectDraft && (
              <div ref={draftPanelRef} className="task-detail-project-draft">
                <div className="task-detail-project-draft-head">
                  <strong>AI 拆解草稿</strong>
                  <span>
                    {projectDraft.subtasks.length} 个建议子任务
                    {projectDraft.invocation ? ` · ${projectDraft.invocation.runtime.label}` : ''}
                  </span>
                </div>
                {projectDraft.promotionReadiness && (
                  <div className="task-detail-project-draft-readiness" aria-label="Agent API decomposition promotion readiness">
                    {projectDecompositionPromotionEvidenceChips(projectDraft.promotionReadiness).map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                )}
                <div className="task-detail-project-draft-list">
                  {projectDraft.subtasks.slice(0, 3).map((subtask) => (
                    <div key={`${task.id}-${subtask.title}`} className="task-detail-project-draft-item">
                      <strong>{subtask.title}</strong>
                      <span>{subtask.summary}</span>
                      <small>验收：{subtask.acceptanceCriteria}</small>
                      {subtask.dependency && <small>依赖：{subtask.dependency}</small>}
                      <small>独立性：{subtask.rationale}</small>
                    </div>
                  ))}
                </div>
                <div className="task-detail-project-draft-review">
                  <span>拆解自检</span>
                  <p>{projectDraft.review}</p>
                  <small>{projectDraft.nextStep}</small>
                </div>
                <div className="task-detail-project-draft-actions">
                  <button className="btn sm ghost" onClick={onGenerateDecomposition} disabled={projectBusy || projectCreating}>
                    {projectBusy ? '生成中…' : '重新生成'}
                  </button>
                  <button className="btn sm ghost" onClick={onDiscardDraft} disabled={projectCreating}>放弃草稿</button>
                  <button className={`btn sm primary${projectCreating ? ' disabled' : ''}`} onClick={onCreateDraftChildren} disabled={projectCreating}>
                    {projectCreating ? '创建中…' : '确认创建子任务'}
                  </button>
                </div>
              </div>
            )}
            {projectError && (
              <div className="project-draft-error">{projectError}</div>
            )}
          </>
        ) : completionCriteria.length > 0 ? (
          <>
            <div className="task-detail-grid">
              <div className="task-detail-stat">
                <strong>{completedCriteria}/{completionCriteria.length}</strong>
                <span>完成标准满足</span>
              </div>
              <div className="task-detail-stat">
                <strong>{runCount}</strong>
                <span>执行记录</span>
              </div>
            </div>
            <div className="task-detail-criteria-list">
              {completionCriteria.slice(0, 3).map((criterion) => (
                <div key={criterion.id} className={`task-detail-criterion ${criterion.status}`}>
                  <span>{criterion.status === 'satisfied' ? '✓' : '○'}</span>
                  <p>{criterion.text}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="preview-config-note compact">暂无完成标准；需要验收标准时可在任务详情或 AI 面板补充。</p>
        )}

        {task.schedule && (
          <>
            <div className="preview-chip">
              <span>↻</span>
              <span>{task.schedule}</span>
            </div>
            <p className="preview-config-note">周期配置保存在任务属性中，每次触发会在执行记录里形成独立 Run。</p>
          </>
        )}
        {task.trigger && (
          <>
            <div className="preview-chip">
              <span>⚡</span>
              <span>{task.trigger}</span>
            </div>
            <p className="preview-config-note">事件触发任务是一条持续监听规则，触发结果会追加到任务产物和执行记录，不会自动新建散乱任务。</p>
          </>
        )}
        {task.type === 'routine' && (
          <p className="preview-config-note">常设任务用于长期维护、日常整理或持续运营；可以沉淀阶段性记录，也可以在需要建设时拆出项目型任务。</p>
        )}
        {task.commitment && (
          <div className="preview-chip">
            <span>交付</span>
            <span>{task.commitment}</span>
          </div>
        )}
      </section>

      <section className="task-detail-layer related-files">
        <div className="task-detail-layer-head">
          <span className="preview-label">相关文件</span>
          <span className="preview-type-hint">当前任务节点</span>
        </div>

        {relatedCategories.length > 0 ? (
          <>
            <div className="related-file-tabs" role="tablist" aria-label="相关文件分类">
              {relatedCategories.map((category) => (
                <button
                  key={category.key}
                  className={`related-file-tab${category.key === currentRelatedCategory ? ' active' : ''}`}
                  onClick={() => setActiveRelatedCategory(category.key)}
                  role="tab"
                  aria-selected={category.key === currentRelatedCategory}
                >
                  {category.label}
                  <span>{category.count}</span>
                </button>
              ))}
            </div>
            <div className="related-file-list">
              {visibleRelatedFiles.map((item) => (
                <button
                  key={item.file.id}
                  className="related-file-card"
                  onClick={() => onSelectFile(item.file)}
                  title={item.file.path}
                >
                  <span className="related-file-kind">{item.label}</span>
                  <span className="related-file-main">
                    <strong>{item.file.name}</strong>
                    <small>{item.note}</small>
                  </span>
                  <span className="related-file-open">打开 →</span>
                </button>
              ))}
            </div>
            {hiddenRelatedFileCount > 0 && (
              <p className="preview-config-note compact">
                还有 {hiddenRelatedFileCount} 个文件，请在左侧任务文件中查看全部。
              </p>
            )}
          </>
        ) : (
          <p className="preview-config-note compact">当前任务还没有可展示的关键文件。</p>
        )}
      </section>

    </div>
  );
}

/* ─── Context menu ─── */

interface ContextMenuProps {
  x: number;
  y: number;
  task: Task | null;
  projects: Task[];
  onClose: () => void;
  onMoveToProject: (projectId: string | null) => void;
  onUpdateRisk: (riskLevel: TaskRiskLevel) => void;
  onArchive: () => void;
  onCopyLink: () => void;
}

function ContextMenu({
  x,
  y,
  task,
  projects,
  onClose,
  onMoveToProject,
  onUpdateRisk,
  onArchive,
  onCopyLink,
}: ContextMenuProps) {
  const projectOptions = task
    ? projects.filter((project) => project.id !== task.id && project.id !== task.parentTaskId)
    : [];
  const items = [
    { label: '归档', action: onArchive },
    { label: '复制链接', action: onCopyLink },
  ];

  return (
    <div
      className="ctx-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="ctx-menu-item muted" onClick={onClose}>
        移至项目
      </button>
      {projectOptions.map((project) => (
        <button key={project.id} className="ctx-menu-item sub" onClick={() => onMoveToProject(project.id)}>
          {project.title}
        </button>
      ))}
      {task?.parentTaskId && (
        <button className="ctx-menu-item sub" onClick={() => onMoveToProject(null)}>
          移出项目
        </button>
      )}
      <button className="ctx-menu-item muted" onClick={onClose}>
        改优先级
      </button>
      {RISK_OPTIONS.map((option) => (
        <button key={option.value} className="ctx-menu-item sub" onClick={() => onUpdateRisk(option.value)}>
          {option.label}
        </button>
      ))}
      {items.map((item) => (
        <button key={item.label} className="ctx-menu-item" onClick={item.action}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

interface FileContextMenuProps {
  x: number;
  y: number;
  file: VirtualTaskFile;
  source: SourceContextRecord | null;
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  onPreviewPatchReview: () => void;
  onRunPatchReview: () => void;
  onApplyPatchPromotion?: (() => void) | null;
  onToggleSourceKey: () => void;
  onArchiveSource: () => void;
}

function FileContextMenu({
  x,
  y,
  file,
  source,
  onClose,
  onOpen,
  onRename,
  onMove,
  onDelete,
  onCopyPath,
  onPreviewPatchReview,
  onRunPatchReview,
  onApplyPatchPromotion,
  onToggleSourceKey,
  onArchiveSource,
}: FileContextMenuProps) {
  const canEditLocal = file.kind === 'local_file' || file.kind === 'local_folder';
  const canRename = canEditLocal || file.kind === 'artifact';
  const canMove = canEditLocal;
  const canDelete = canEditLocal || file.kind === 'artifact';
  const canPreviewPatchReview = isPatchArtifactFile(file) && Boolean(window.api?.previewPatchArtifactSandboxReview);
  const canRunPatchReview = isPatchArtifactFile(file) && Boolean(window.api?.runPatchArtifactSandboxReview);
  const fileClass = classifyTaskFile(file);
  const isSourceMaterial = fileClass === 'source';

  return (
    <div
      className="ctx-menu file-ctx-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="ctx-menu-item" onClick={onOpen}>
        打开
      </button>
      {canPreviewPatchReview && (
        <button className="ctx-menu-item" onClick={onPreviewPatchReview}>
          沙箱预检
        </button>
      )}
      {canRunPatchReview && (
        <button className="ctx-menu-item" onClick={onRunPatchReview}>
          运行 review
        </button>
      )}
      {onApplyPatchPromotion && (
        <button className="ctx-menu-item" onClick={onApplyPatchPromotion}>
          应用到工作区
        </button>
      )}
      {isSourceMaterial && (
        <>
          <button className="ctx-menu-item" onClick={onToggleSourceKey}>
            {source?.isKey ? '取消关键来源' : '标记关键来源'}
          </button>
          <button className="ctx-menu-item" onClick={onArchiveSource}>
            归档来源
          </button>
        </>
      )}
      {canRename && (
        <button className="ctx-menu-item" onClick={onRename}>
          重命名
        </button>
      )}
      {canMove && (
        <button className="ctx-menu-item" onClick={onMove}>
          移动
        </button>
      )}
      {canDelete && (
        <button className="ctx-menu-item danger" onClick={onDelete}>
          删除
        </button>
      )}
      <button className="ctx-menu-item" onClick={onCopyPath}>
        复制路径
      </button>
      <button className="ctx-menu-item muted" onClick={onClose}>
        关闭
      </button>
    </div>
  );
}
