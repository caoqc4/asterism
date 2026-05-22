import type {
  AgentPolicy,
  AgentRunRequest,
  AgentWorkingContext,
} from '../../../shared/types/agent-execution.js';
import type { CreateRunInput, RunRecord } from '../../../shared/types/run.js';
import type { TaskDetail, TimelineEventRecord } from '../../../shared/types/task.js';
import { TASKPLANE_CORE_AGENT_CONTEXT } from '../../../shared/core-agent-context.js';
import {
  buildRuntimeContextAssemblyPolicy,
  buildRuntimeContextManifest,
  formatRuntimeContextManifestForStep,
} from '../../../shared/runtime-context.js';
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
const TASK_FILE_LIMIT = 6;
const DECISION_LIMIT = 5;
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
    .sort((a, b) => (b.capturedAt ?? b.updatedAt).localeCompare(a.capturedAt ?? a.updatedAt));
  const keySources = activeSources.filter((source) => source.isKey);

  return (keySources.length ? keySources : activeSources).slice(0, SOURCE_CONTEXT_LIMIT);
}

function selectAgentDecisions(task: TaskDetail): NonNullable<TaskDetail['decisions']> {
  return [...(task.decisions ?? [])]
    .sort((left, right) => (
      Number(right.status === 'pending') - Number(left.status === 'pending')
      || right.updatedAt.localeCompare(left.updatedAt)
    ))
    .slice(0, DECISION_LIMIT);
}

export function buildAgentWorkingContext(task: TaskDetail): AgentWorkingContext {
  const completionStatus = task.resumeCard.completionStatus;
  const selectedSources = selectAgentSourceContexts(task);
  const selectedDecisions = selectAgentDecisions(task);

  return {
    productPrinciples: TASKPLANE_CORE_AGENT_CONTEXT,
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
    decisions: selectedDecisions.map((decision) => ({
      id: decision.id,
      title: decision.title,
      status: decision.status,
      scope: decision.scope,
      kind: decision.kind,
      sourceLabel: decision.sourceLabel ?? null,
      contextPreview: preview([
        decision.context?.whyNow,
        decision.context?.impact,
        decision.context?.ifDeferred,
      ].filter(Boolean).join('\n')),
      recommendationLabel: decision.recommendation?.label ?? null,
      recommendationReason: decision.recommendation?.reason ?? null,
      updatedAt: decision.updatedAt,
    })),
    sources: selectedSources
      .map((source) => ({
        capturedAt: source.capturedAt ?? null,
        createdAt: source.createdAt,
        id: source.id,
        title: source.title,
        kind: source.kind,
        isKey: source.isKey,
        note: source.note,
        contentPreview: preview(source.content),
        runId: source.runId ?? null,
        sourceRole: source.sourceRole ?? null,
        status: source.status,
        credibility: source.credibility ?? null,
        isDuplicate: source.isDuplicate,
        containsSensitiveData: source.containsSensitiveData,
        updatedAt: source.updatedAt,
        uri: source.uri,
      })),
    artifacts: [...task.artifacts]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, ARTIFACT_LIMIT)
      .map((artifact) => ({
        title: artifact.title,
        kind: artifact.kind,
        sourceType: artifact.sourceType,
        updatedAt: artifact.updatedAt,
        contentPreview: preview(artifact.content),
      })),
    taskFiles: [...(task.taskFiles ?? [])]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, TASK_FILE_LIMIT)
      .map((file) => ({
        path: file.path,
        kind: file.kind,
        updatedAt: file.updatedAt,
        contentPreview: file.kind === 'file' ? preview(file.content) : null,
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

export function evaluateAgentRunContextAssembly(request: AgentRunRequest) {
  const runtimeContextManifest = buildRuntimeContextManifest({
    workingContext: request.context,
    applicableWorkHabits: request.applicableWorkHabits,
  });
  return buildRuntimeContextAssemblyPolicy({
    manifest: runtimeContextManifest,
  });
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
  const runtimeContextManifest = buildRuntimeContextManifest({
    workingContext: request.context,
    applicableWorkHabits: request.applicableWorkHabits,
  });
  const runtimeContextAssemblyPolicy = evaluateAgentRunContextAssembly(request);
  return [
    `Run 模式：${request.mode}`,
    `目标：${request.goal}`,
    request.instructions ? `附加要求：${request.instructions}` : '附加要求：无',
    formatRuntimeContextManifestForStep(runtimeContextManifest),
    `上下文装配：${runtimeContextAssemblyPolicy.summary}`,
    '产品原则：read-only',
    request.context.productPrinciples,
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
