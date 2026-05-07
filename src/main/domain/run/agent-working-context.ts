import type {
  AgentPolicy,
  AgentRunRequest,
  AgentWorkingContext,
} from '../../../shared/types/agent-execution.js';
import type { CreateRunInput, RunRecord } from '../../../shared/types/run.js';
import type { TaskDetail, TimelineEventRecord } from '../../../shared/types/task.js';
import { deriveTaskDetailPriorityLane } from '../../../shared/working-context/priority-lanes.js';
import {
  formatTaskTimelineEventSummary,
  getTaskTimelineDateGroupTitle,
  getTaskTimelineObjectFamily,
  getTaskTimelineObjectFamilyTitle,
  getTaskTimelinePriority,
  getTaskTimelinePriorityGroupTitle,
} from '../../../shared/working-context/timeline.js';

const RECENT_TIMELINE_LIMIT = 6;
const SOURCE_CONTEXT_LIMIT = 3;
const ARTIFACT_LIMIT = 5;
const SOURCE_PREVIEW_LIMIT = 240;

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  maxSteps: 8,
  maxWallTimeMs: 120_000,
  allowNetwork: false,
  allowLocalWorkspaceRead: false,
  allowTaskMutationTools: false,
  allowLocalCommandRun: false,
  allowLocalFileWrite: false,
  confirmationRequiredRisks: ['local_command', 'local_write', 'external_write', 'sensitive'],
};

export const LOCAL_AGENT_TOOL_POLICY: AgentPolicy = {
  ...DEFAULT_AGENT_POLICY,
  confirmationRequiredRisks: ['external_write', 'sensitive'],
};

function preview(value: string | null | undefined, limit = SOURCE_PREVIEW_LIMIT): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed;
}

function recentTimeline(events: TimelineEventRecord[]): AgentWorkingContext['recentTimeline'] {
  return [...events]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, RECENT_TIMELINE_LIMIT)
    .map((event) => ({
      type: event.type,
      summary: formatTaskTimelineEventSummary(event),
      createdAt: event.createdAt,
      dateGroup: getTaskTimelineDateGroupTitle(event.createdAt),
      objectFamily: getTaskTimelineObjectFamilyTitle(getTaskTimelineObjectFamily(event.type)),
      priorityGroup: getTaskTimelinePriorityGroupTitle(getTaskTimelinePriority(event.type)),
    }));
}

function selectAgentSourceContexts(task: TaskDetail): TaskDetail['sourceContexts'] {
  const activeSources = task.sourceContexts
    .filter((source) => source.status === 'active')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const keySources = activeSources.filter((source) => source.isKey);

  return (keySources.length ? keySources : activeSources).slice(0, SOURCE_CONTEXT_LIMIT);
}

export function buildAgentWorkingContext(task: TaskDetail): AgentWorkingContext {
  const completionStatus = task.resumeCard.completionStatus;
  const selectedSources = selectAgentSourceContexts(task);

  return {
    task: {
      id: task.id,
      title: task.title,
      summary: task.summary,
      state: task.state,
      nextStep: task.nextStep,
      riskLevel: task.riskLevel,
      riskNote: task.riskNote,
    },
    priorityLane: deriveTaskDetailPriorityLane(task),
    resumeSummary: task.resumeCard.summary,
    completion: {
      total: completionStatus.total,
      satisfied: completionStatus.satisfied,
      open: completionStatus.open,
      nextOpenCriterion: completionStatus.nextOpenCriterion ?? null,
    },
    blockers: task.activeBlocker
      ? [
          {
            title: task.activeBlocker.title,
            detail: task.activeBlocker.detail,
            owner: task.activeBlocker.owner,
          },
        ]
      : [],
        dependencies: task.activeDependency
      ? [
          {
            title: task.activeDependency.blockedByTaskTitle ?? task.activeDependency.blockedByTaskId,
            detail: task.activeDependency.reason,
          },
        ]
      : [],
    sources: selectedSources
      .map((source) => ({
        title: source.title,
        kind: source.kind,
        isKey: source.isKey,
        note: source.note,
        contentPreview: preview(source.content),
      })),
    artifacts: [...task.artifacts]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, ARTIFACT_LIMIT)
      .map((artifact) => ({
        title: artifact.title,
        kind: artifact.kind,
        sourceType: artifact.sourceType,
        updatedAt: artifact.updatedAt,
      })),
    processTemplates: task.processTemplates.map((template) => ({
      id: template.id,
      title: template.title,
      kind: template.kind,
      summary: template.summary,
    })),
    recentTimeline: recentTimeline(task.timeline),
  };
}

export function buildAgentRunRequest(params: {
  run: RunRecord;
  task: TaskDetail;
  input: CreateRunInput;
  applicableWorkHabitSummaries?: string[];
  policy?: AgentPolicy;
}): AgentRunRequest {
  return {
    runId: params.run.id,
    taskId: params.task.id,
    goal: getRunGoal(params.input.type),
    instructions: params.input.instructions?.trim() || null,
    mode: params.input.type,
    context: buildAgentWorkingContext(params.task),
    applicableWorkHabits: params.applicableWorkHabitSummaries ?? [],
    policy: params.policy ?? DEFAULT_AGENT_POLICY,
  };
}

function getRunGoal(type: CreateRunInput['type']): string {
  switch (type) {
    case 'draft':
      return '产出一份可继续编辑的工作草稿';
    case 'agent':
      return '围绕当前任务执行一轮受限本地 agent 推进';
    default:
      return '产出一份简洁明确的工作摘要';
  }
}

export function formatAgentRunRequestForStep(request: AgentRunRequest): string {
  return [
    `Run 模式：${request.mode}`,
    `目标：${request.goal}`,
    request.instructions ? `附加要求：${request.instructions}` : '附加要求：无',
    `任务状态：${request.context.task.state}`,
    `优先级语义：${request.context.priorityLane}`,
    `完成标准：${request.context.completion.satisfied}/${request.context.completion.total}`,
    `可用来源：${request.context.sources.length}`,
    `可用产物：${request.context.artifacts.length}`,
    `可用方法模板：${request.context.processTemplates.length}`,
    `适用工作习惯：${request.applicableWorkHabits.length}`,
    ...request.applicableWorkHabits.map((habit) => `- ${habit}`),
    `策略：maxSteps=${request.policy.maxSteps}, allowNetwork=${request.policy.allowNetwork}`,
  ].join('\n');
}
