import type { RunRecord, RunStepRecord } from './types/run.js';
import type { DecisionRecord } from './types/decision.js';
import type { TimelineEventRecord } from './types/task.js';
import type { TaskFileRecord } from './types/task-file.js';
import { buildRuntimeResumePlan, evaluateRuntimeHandoff } from './runtime-handoff.js';
import { getPanelRuntimeTimelineEventTitle, isPanelRuntimeTimelineEventType } from './runtime-panel-events.js';

export type RuntimeEventPriority = 'p1' | 'p2' | 'p3';

export type RuntimeEventRecord = {
  id: string;
  taskId: string | null;
  type: string;
  title: string;
  detail: string | null;
  sourceType: 'timeline' | 'run' | 'run_step' | 'task_record' | 'decision' | 'runtime_projection';
  sourceId: string;
  priority: RuntimeEventPriority;
  relatedTaskId?: string | null;
  createdAt: string;
};

export type RuntimeReplayGroupKind =
  | 'handoff'
  | 'project_structure'
  | 'execution_recovery'
  | 'decision'
  | 'durable_record'
  | 'source_context'
  | 'task_state'
  | 'general';

export type RuntimeReplayGroup = {
  id: string;
  kind: RuntimeReplayGroupKind;
  title: string;
  summary: string | null;
  taskId: string | null;
  priority: RuntimeEventPriority;
  eventIds: string[];
  relatedTaskIds: string[];
  sourceTypes: RuntimeEventRecord['sourceType'][];
  startedAt: string;
  updatedAt: string;
};

export type RuntimeEventProjectionInput = {
  decisions?: DecisionRecord[];
  runs?: RunRecord[];
  runStepsByRunId?: Record<string, RunStepRecord[] | undefined>;
  taskFiles?: TaskFileRecord[];
  taskId?: string | null;
  timeline?: TimelineEventRecord[];
};

export function projectRuntimeEvents(input: RuntimeEventProjectionInput): RuntimeEventRecord[] {
  const taskId = input.taskId ?? null;
  const timeline = input.timeline ?? [];
  const events: RuntimeEventRecord[] = [
    ...timeline.map(projectTimelineEvent),
    ...(input.runs ?? []).flatMap((run) => projectRunEvents(run, {
      taskId,
      steps: input.runStepsByRunId?.[run.id] ?? [],
    })),
    ...(input.taskFiles ?? []).filter(isTaskRecordFile).map(projectTaskRecordFile),
    ...(input.decisions ?? []).filter((decision) => shouldProjectDecision(decision, timeline)).map(projectDecision),
  ];

  const seen = new Set<string>();
  return events
    .filter((event) => {
      const key = `${event.sourceType}:${event.sourceId}:${event.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function groupRuntimeEventsForReplay(events: RuntimeEventRecord[]): RuntimeReplayGroup[] {
  const groups = new Map<string, RuntimeReplayGroup>();

  for (const event of [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    const classification = classifyRuntimeReplayEvent(event);
    const key = `${event.taskId ?? 'global'}:${classification.kind}:${classification.bucket}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: `replay:${key}`,
        kind: classification.kind,
        title: classification.title,
        summary: event.detail ?? classification.summary,
        taskId: event.taskId,
        priority: event.priority,
        eventIds: [event.id],
        relatedTaskIds: event.relatedTaskId ? [event.relatedTaskId] : [],
        sourceTypes: [event.sourceType],
        startedAt: event.createdAt,
        updatedAt: event.createdAt,
      });
      continue;
    }

    existing.eventIds.push(event.id);
    existing.updatedAt = event.createdAt > existing.updatedAt ? event.createdAt : existing.updatedAt;
    existing.priority = higherPriority(existing.priority, event.priority);
    if (event.relatedTaskId && !existing.relatedTaskIds.includes(event.relatedTaskId)) {
      existing.relatedTaskIds.push(event.relatedTaskId);
    }
    if (!existing.sourceTypes.includes(event.sourceType)) {
      existing.sourceTypes.push(event.sourceType);
    }
    if (!existing.summary && event.detail) {
      existing.summary = event.detail;
    }
  }

  return [...groups.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function classifyRuntimeReplayEvent(event: RuntimeEventRecord): {
  bucket: string;
  kind: RuntimeReplayGroupKind;
  summary: string | null;
  title: string;
} {
  if (
    event.type === 'panel.completion_handoff'
    || event.type === 'panel.context_switch_accepted'
    || /handoff|交接/i.test(event.title)
  ) {
    return {
      bucket: 'completion_handoff',
      kind: 'handoff',
      summary: '任务完成后的下一步交接路径。',
      title: '完成交接',
    };
  }

  if (
    event.type === 'panel.project_decomposed'
    || event.type === 'panel.project_membership_changed'
    || event.type.includes('task_dependency')
  ) {
    return {
      bucket: 'project_structure',
      kind: 'project_structure',
      summary: '项目结构、子任务或依赖关系发生变化。',
      title: '项目结构变化',
    };
  }

  if (/任务记忆建议|Task\.md|Task Record/.test(event.title) || /Task\.md|Task Record/.test(event.detail ?? '')) {
    return {
      bucket: 'durable_record',
      kind: 'durable_record',
      summary: '任务记忆或恢复文件需要更新。',
      title: '任务记忆建议',
    };
  }

  if (
    event.sourceType === 'run'
    || event.sourceType === 'run_step'
    || event.sourceType === 'runtime_projection'
    || event.type.includes('run')
    || event.type.includes('checkpoint')
  ) {
    return {
      bucket: event.sourceId,
      kind: 'execution_recovery',
      summary: '执行过程、检查点或恢复路径。',
      title: '执行与恢复',
    };
  }

  if (event.sourceType === 'decision' || event.type.includes('decision')) {
    return {
      bucket: event.sourceId,
      kind: 'decision',
      summary: '需要用户判断或已经完成判断的事项。',
      title: '拍板事项',
    };
  }

  if (
    event.sourceType === 'task_record'
    || event.type === 'panel.task_record_written'
    || event.type.includes('task_file')
    || event.type.includes('artifact')
  ) {
    return {
      bucket: 'durable_record',
      kind: 'durable_record',
      summary: '任务文件、记录或产物发生持久化变化。',
      title: '持久记录',
    };
  }

  if (event.type.includes('source_context') || event.type.includes('source_')) {
    return {
      bucket: 'source_context',
      kind: 'source_context',
      summary: '任务上下文或来源材料发生变化。',
      title: '上下文来源',
    };
  }

  if (event.type.startsWith('task.')) {
    return {
      bucket: 'task_state',
      kind: 'task_state',
      summary: '任务状态、风险、等待或下一步发生变化。',
      title: '任务状态变化',
    };
  }

  return {
    bucket: event.type,
    kind: 'general',
    summary: null,
    title: event.title,
  };
}

function higherPriority(left: RuntimeEventPriority, right: RuntimeEventPriority): RuntimeEventPriority {
  const rank: Record<RuntimeEventPriority, number> = { p1: 3, p2: 2, p3: 1 };
  return rank[right] > rank[left] ? right : left;
}

function isTaskRecordFile(file: TaskFileRecord): boolean {
  return file.kind === 'file' && file.path.replace(/\\/g, '/').startsWith('Task Records/');
}

function projectTaskRecordFile(file: TaskFileRecord): RuntimeEventRecord {
  return {
    id: `task_record:${file.id}`,
    taskId: file.taskId,
    type: 'task_record.updated',
    title: `任务记录：${file.name}`,
    detail: file.path,
    sourceType: 'task_record',
    sourceId: file.id,
    priority: /closeout|handoff|收尾|交接|checkpoint|decision|决策/i.test(file.path) ? 'p2' : 'p3',
    createdAt: file.updatedAt,
  };
}

function shouldProjectDecision(decision: DecisionRecord, timeline: TimelineEventRecord[]): boolean {
  if (!decision.taskId) return false;
  return !timeline.some((event) => {
    if (!event.payload || (event.type !== 'decision.created' && event.type !== 'decision.acted')) return false;
    try {
      const parsed = JSON.parse(event.payload) as Record<string, unknown>;
      return parsed.decisionId === decision.id;
    } catch {
      return false;
    }
  });
}

function projectDecision(decision: DecisionRecord): RuntimeEventRecord {
  return {
    id: `decision:${decision.id}`,
    taskId: decision.taskId,
    type: `decision.${decision.status}`,
    title: decision.status === 'pending'
      ? `待拍板：${decision.title}`
      : `决策已${decision.status === 'approved' ? '批准' : decision.status === 'deferred' ? '暂缓' : '取消'}：${decision.title}`,
    detail: decision.context?.whyNow ?? decision.recommendation?.reason ?? decision.sourceLabel ?? null,
    sourceType: 'decision',
    sourceId: decision.id,
    priority: decision.status === 'pending' ? 'p2' : 'p3',
    createdAt: decision.updatedAt,
  };
}

function projectTimelineEvent(event: TimelineEventRecord): RuntimeEventRecord {
  return {
    id: `timeline:${event.id}`,
    taskId: event.taskId,
    type: event.type,
    title: timelineTitle(event.type, event.payload),
    detail: timelineDetail(event.type, event.payload),
    sourceType: 'timeline',
    sourceId: event.id,
    priority: priorityForType(event.type),
    relatedTaskId: extractRelatedTaskId(event.type, event.payload),
    createdAt: event.createdAt,
  };
}

function projectRunEvents(run: RunRecord, params: {
  taskId: string | null;
  steps: RunStepRecord[];
}): RuntimeEventRecord[] {
  const events: RuntimeEventRecord[] = [{
    id: `run:${run.id}`,
    taskId: run.taskId,
    type: `run.${run.status}`,
    title: run.status === 'paused'
      ? 'Run 暂停，等待 checkpoint 恢复'
      : run.status === 'completed'
        ? 'Run 已完成'
        : run.status === 'failed'
          ? 'Run 执行失败'
          : run.status === 'running'
            ? 'Run 正在执行'
            : 'Run 状态更新',
    detail: run.failureReason ?? run.output ?? run.instructions,
    sourceType: 'run',
    sourceId: run.id,
    priority: run.status === 'failed' ? 'p1' : run.status === 'paused' ? 'p2' : 'p3',
    createdAt: run.updatedAt,
  }];

  if (run.status === 'paused' || /resume checkpoint|续跑/.test(run.output ?? '')) {
    const plan = buildRuntimeResumePlan(evaluateRuntimeHandoff({
      intent: 'resume_run',
      fromTaskId: run.taskId || params.taskId,
    }));
    events.push({
      id: `runtime_resume:${run.id}`,
      taskId: run.taskId,
      type: run.status === 'paused' ? 'runtime.resume_pending' : 'runtime.resume_completed',
      title: run.status === 'paused' ? '等待恢复计划' : '已完成恢复计划',
      detail: run.status === 'paused' ? plan.summary : `已完成恢复路径。${plan.nextAction}`,
      sourceType: 'runtime_projection',
      sourceId: run.id,
      priority: 'p2',
      createdAt: run.updatedAt,
    });
  }

  events.push(...params.steps.map((step) => ({
    id: `run_step:${step.id}`,
    taskId: run.taskId,
    type: `run_step.${step.kind}.${step.status}`,
    title: `Run Step · ${step.title}`,
    detail: step.error ?? step.output ?? step.input,
    sourceType: 'run_step' as const,
    sourceId: step.id,
    priority: step.status === 'failed' ? 'p1' as const : step.kind === 'decision' || step.kind === 'checkpoint' ? 'p2' as const : 'p3' as const,
    createdAt: step.updatedAt,
  })));

  return events;
}

function timelineTitle(type: string, payload: string | null): string {
  const payloadText = payload ? payload.slice(0, 48) : '';
  switch (type) {
    case 'task.created': return '任务已创建';
    case 'task.updated': return '任务信息已更新';
    case 'task.next_step_changed': return payloadText ? `下一步：${payloadText}` : '下一步已更新';
    case 'task.waiting_changed': return payloadText ? `等待：${payloadText}` : '等待状态已变更';
    case 'task.risk_changed': return payloadText ? `风险等级：${payloadText}` : '风险等级已变更';
    case 'task.transitioned': return payloadText ? `状态变更 → ${payloadText}` : '任务状态已变更';
    case 'task.completion_check': return '任务完成检查';
    case 'run.created': return 'AI 开始执行';
    case 'run.completed': return 'AI 执行完成';
    case 'run.failed': return 'AI 执行失败';
    case 'run.paused': return 'AI 执行暂停';
    case 'source_context.created': return payloadText ? `上下文已添加：${payloadText}` : '上下文已添加';
    case 'source_context.updated': return payloadText ? `上下文已更新：${payloadText}` : '上下文已更新';
    case 'task_dependency.created': return payloadText ? `新增依赖：${payloadText}` : '新增任务依赖';
    case 'task_dependency.resolved': return '依赖已解除';
    case 'blocker.created': return payloadText ? `阻塞：${payloadText}` : '发现阻塞项';
    case 'blocker.resolved': return '阻塞已解除';
    case 'decision.created': return 'AI 提交决策请求';
    case 'decision.acted': return '决策已拍板';
    default:
      return isPanelRuntimeTimelineEventType(type)
        ? getPanelRuntimeTimelineEventTitle(type)
        : type.replace(/\./g, ' › ');
  }
}

function timelineDetail(type: string, payload: string | null): string | null {
  if (!payload || type !== 'task.completion_check') return null;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
    const runVerificationDetail = typeof parsed.runVerificationDetail === 'string'
      ? parsed.runVerificationDetail.trim()
      : '';
    return [reason, runVerificationDetail].filter(Boolean).join(' · ') || null;
  } catch {
    return null;
  }
}

function priorityForType(type: string): RuntimeEventPriority {
  if (type.includes('blocker') || type.includes('failed')) return 'p1';
  if (type.includes('waiting') || type.includes('decision') || type === 'task.completion_check' || type.includes('paused') || type.startsWith('panel.')) return 'p2';
  return 'p3';
}

function extractRelatedTaskId(type: string, payload: string | null): string | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const candidate = type === 'panel.completion_handoff'
      ? parsed.nextTaskId
      : type === 'panel.context_switch_accepted'
        ? parsed.toTaskId
        : type === 'panel.project_membership_changed'
          ? parsed.parentTaskId
          : null;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
  } catch {
    return null;
  }
}
