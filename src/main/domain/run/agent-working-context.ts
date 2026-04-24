import type {
  AgentPolicy,
  AgentRunRequest,
  AgentWorkingContext,
} from '../../../shared/types/agent-execution.js';
import type { CreateRunInput, RunRecord } from '../../../shared/types/run.js';
import type { TaskDetail, TimelineEventRecord } from '../../../shared/types/task.js';
import { deriveTaskDetailPriorityLane } from '../../../shared/working-context/priority-lanes.js';
import { formatTaskTimelineEventSummary } from '../../../shared/working-context/timeline.js';

const RECENT_TIMELINE_LIMIT = 6;
const SOURCE_PREVIEW_LIMIT = 240;

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  maxSteps: 8,
  maxWallTimeMs: 120_000,
  allowNetwork: false,
  allowLocalFileWrite: false,
  confirmationRequiredRisks: ['local_write', 'external_write', 'sensitive'],
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
    }));
}

export function buildAgentWorkingContext(task: TaskDetail): AgentWorkingContext {
  const completionStatus = task.resumeCard.completionStatus;

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
    sources: task.sourceContexts
      .filter((source) => source.status === 'active')
      .map((source) => ({
        title: source.title,
        kind: source.kind,
        isKey: source.isKey,
        note: source.note,
        contentPreview: preview(source.content),
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
  policy?: AgentPolicy;
}): AgentRunRequest {
  return {
    runId: params.run.id,
    taskId: params.task.id,
    goal:
      params.input.type === 'draft'
        ? '产出一份可继续编辑的工作草稿'
        : '产出一份简洁明确的工作摘要',
    instructions: params.input.instructions?.trim() || null,
    mode: params.input.type,
    context: buildAgentWorkingContext(params.task),
    policy: params.policy ?? DEFAULT_AGENT_POLICY,
  };
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
    `可用方法模板：${request.context.processTemplates.length}`,
    `策略：maxSteps=${request.policy.maxSteps}, allowNetwork=${request.policy.allowNetwork}`,
  ].join('\n');
}
