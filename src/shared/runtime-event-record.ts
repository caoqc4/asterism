import type { RunRecord, RunStepRecord } from './types/run.js';
import type { DecisionRecord } from './types/decision.js';
import type { TimelineEventRecord } from './types/task.js';
import type { TaskFileRecord } from './types/task-file.js';
import { buildRuntimeResumePlan, evaluateRuntimeHandoff } from './runtime-handoff.js';
import { getPanelRuntimeTimelineEventTitle, isPanelRuntimeTimelineEventType } from './runtime-panel-events.js';
import { isTaskRecordPath } from './task-memory-path.js';

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
  runId?: string | null;
  relatedTaskId?: string | null;
  createdAt: string;
};

export type RuntimeReplayGroupKind =
  | 'handoff'
  | 'project_structure'
  | 'execution_recovery'
  | 'decision'
  | 'quality_gate'
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
      bucket: event.runId ?? event.sourceId,
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
    event.type === 'task.completion_check'
    || /completion check|完成检查|质量检查|验收检查/i.test(`${event.title} ${event.detail ?? ''}`)
  ) {
    return {
      bucket: 'quality_gate',
      kind: 'quality_gate',
      summary: '完成、验收或阶段收尾前的质量检查记录。',
      title: '质量检查',
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
  return file.kind === 'file' && isTaskRecordPath(file.path);
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
  const agentCli = parseAgentCliRunDescriptor(run);
  const nativeGoalAudit = parseRuntimeNativeGoalAuditDescriptor(run);
  const events: RuntimeEventRecord[] = [{
    id: `run:${run.id}`,
    taskId: run.taskId,
    type: `run.${run.status}`,
    title: formatRunEventTitle(run, agentCli, nativeGoalAudit),
    detail: formatRunEventDetail(run, agentCli, nativeGoalAudit),
    sourceType: 'run',
    sourceId: run.id,
    priority: run.status === 'failed' ? 'p1' : run.status === 'paused' ? 'p2' : 'p3',
    runId: run.id,
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

  events.push(...params.steps.map((step) => projectRunStepEvent(run, step, agentCli, nativeGoalAudit)));

  return events;
}

function projectRunStepEvent(
  run: RunRecord,
  step: RunStepRecord,
  agentCli: AgentCliRunDescriptor | null,
  nativeGoalAudit: RuntimeNativeGoalAuditDescriptor | null,
): RuntimeEventRecord {
  return {
    id: `run_step:${step.id}`,
    taskId: run.taskId,
    type: `run_step.${step.kind}.${step.status}`,
    title: formatRunStepTitle(step, agentCli, nativeGoalAudit),
    detail: formatRunStepDetail(step, agentCli, nativeGoalAudit),
    sourceType: 'run_step',
    sourceId: step.id,
    priority: step.status === 'failed' ? 'p1' : step.kind === 'decision' || step.kind === 'checkpoint' ? 'p2' : 'p3',
    runId: run.id,
    createdAt: step.updatedAt,
  };
}

type AgentCliRunDescriptor = {
  label: string;
  sandboxMode: string;
  userPrompt: string | null;
};

type RuntimeNativeGoalAuditDescriptor = {
  label: string;
  objective: string | null;
};

function parseAgentCliRunDescriptor(run: RunRecord): AgentCliRunDescriptor | null {
  const instructions = run.instructions ?? '';
  const match = instructions.match(/^Agent CLI \(([^)]+)\) ([^:]+):\s*([\s\S]*)$/);
  if (!match) return null;
  return {
    label: match[1]?.trim() || 'Agent CLI',
    sandboxMode: match[2]?.trim() || 'unknown',
    userPrompt: match[3]?.trim() || null,
  };
}

function parseRuntimeNativeGoalAuditDescriptor(run: RunRecord): RuntimeNativeGoalAuditDescriptor | null {
  const instructions = run.instructions ?? '';
  const match = instructions.match(/^Runtime native goal request \(([^)]+)\):\s*([\s\S]*)$/);
  if (!match) return null;
  return {
    label: match[1]?.trim() || 'Runtime',
    objective: match[2]?.trim() || null,
  };
}

function formatRunEventTitle(
  run: RunRecord,
  agentCli: AgentCliRunDescriptor | null,
  nativeGoalAudit: RuntimeNativeGoalAuditDescriptor | null,
): string {
  if (nativeGoalAudit) return `${nativeGoalAudit.label} Native Goal 请求已审计`;
  if (agentCli) {
    if (run.status === 'completed') return `${agentCli.label} 已完成`;
    if (run.status === 'failed') return `${agentCli.label} 执行失败`;
    if (run.status === 'running') return `${agentCli.label} 后台运行中`;
    if (run.status === 'paused') return `${agentCli.label} 暂停`;
    return `${agentCli.label} 状态更新`;
  }
  return run.status === 'paused'
    ? 'Run 暂停，等待 checkpoint 恢复'
    : run.status === 'completed'
      ? 'Run 已完成'
      : run.status === 'failed'
        ? 'Run 执行失败'
        : run.status === 'running'
          ? 'Run 正在执行'
          : 'Run 状态更新';
}

function formatRunEventDetail(
  run: RunRecord,
  agentCli: AgentCliRunDescriptor | null,
  nativeGoalAudit: RuntimeNativeGoalAuditDescriptor | null,
): string | null {
  if (nativeGoalAudit) {
    return [
      nativeGoalAudit.objective ? `objective=${nativeGoalAudit.objective}` : null,
      'forwarded=no',
      run.output,
    ].filter((value): value is string => Boolean(value)).join(' / ') || null;
  }
  if (!agentCli) return run.failureReason ?? run.output ?? run.instructions;
  const parts = [
    `sandbox=${agentCli.sandboxMode}`,
    'auth=official CLI',
    agentCli.userPrompt ? `request=${agentCli.userPrompt}` : null,
    run.failureReason ? `failure=${run.failureReason}` : null,
    !run.failureReason && run.output ? run.output : null,
  ].filter((value): value is string => Boolean(value));
  return parts.join(' / ') || null;
}

function formatRunStepTitle(
  step: RunStepRecord,
  agentCli: AgentCliRunDescriptor | null,
  nativeGoalAudit: RuntimeNativeGoalAuditDescriptor | null,
): string {
  if (nativeGoalAudit && step.title === 'Runtime Native Goal 请求审计') {
    return `${nativeGoalAudit.label} Native Goal 未透传`;
  }
  if (!agentCli) return `Run Step · ${step.title}`;
  if (step.title === 'agent cli run accepted') return `${agentCli.label} 已接收`;
  if (step.title === 'codex cli completed' || step.title === 'claude code completed') return `${agentCli.label} 输出`;
  if (step.title === 'codex cli failed' || step.title === 'claude code failed') return `${agentCli.label} 失败证据`;
  return `${agentCli.label} · ${step.title}`;
}

function formatRunStepDetail(
  step: RunStepRecord,
  agentCli: AgentCliRunDescriptor | null,
  nativeGoalAudit: RuntimeNativeGoalAuditDescriptor | null,
): string | null {
  if (nativeGoalAudit && step.title === 'Runtime Native Goal 请求审计') {
    const payload = parsePayload(step.input);
    const objective = typeof payload?.objective === 'string' && payload.objective.trim()
      ? `目标：${payload.objective.trim()}`
      : nativeGoalAudit.objective ? `目标：${nativeGoalAudit.objective}` : null;
    const forwarded = payload?.forwarded === true ? '已透传' : '未透传';
    const reason = typeof payload?.reason === 'string' && payload.reason.trim()
      ? `原因：${payload.reason.trim()}`
      : null;
    const detail = [objective, forwarded, reason].filter(Boolean).join(' / ');
    return detail || (step.output ?? null);
  }
  if (!agentCli) return step.error ?? step.output ?? step.input;
  const parts = [
    step.error ? `错误：${step.error}` : null,
    step.input ? `命令：${firstLine(step.input)}` : null,
    step.output ? `输出：${step.output}` : null,
  ].filter((value): value is string => Boolean(value));
  return parts.join(' / ') || null;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? value.trim();
}

function timelineTitle(type: string, payload: string | null): string {
  const payloadText = payload ? payload.slice(0, 48) : '';
  switch (type) {
    case 'task.created': return '任务已创建';
    case 'task.updated': return formatTaskUpdatedTitle(payload);
    case 'task.next_step_changed': return payloadText ? `下一步：${payloadText}` : '下一步已更新';
    case 'task.waiting_changed': return payloadText ? `等待：${payloadText}` : '等待状态已变更';
    case 'task.risk_changed': return payloadText ? `风险等级：${payloadText}` : '风险等级已变更';
    case 'task.transitioned': return payloadText ? `状态变更 → ${payloadText}` : '任务状态已变更';
    case 'task.completion_check': return '任务完成检查';
    case 'run.created': return 'AI 开始执行';
    case 'run.completed': return 'AI 执行完成';
    case 'run.failed': return 'AI 执行失败';
    case 'run.paused': return 'AI 执行暂停';
    case 'source_context.created': return timelinePayloadTitle(payload, '上下文已添加', 'title');
    case 'source_context.updated': return timelinePayloadTitle(payload, '上下文已更新', 'title');
    case 'source_context.archived': return timelinePayloadTitle(payload, '上下文已归档', 'title');
    case 'completion_criteria.created': return timelinePayloadTitle(payload, '完成标准已添加', 'text');
    case 'completion_criteria.updated': return timelinePayloadTitle(payload, '完成标准已更新', 'text');
    case 'completion_criteria.satisfied': return timelinePayloadTitle(payload, '完成标准已满足', 'text');
    case 'completion_criteria.reopened': return timelinePayloadTitle(payload, '完成标准已重开', 'text');
    case 'task_dependency.created': return timelinePayloadTitle(payload, '新增依赖', 'blockedByTaskTitle');
    case 'task_dependency.updated': return timelinePayloadTitle(payload, '依赖已更新', 'blockedByTaskTitle');
    case 'task_dependency.resolved': return '依赖已解除';
    case 'blocker.created': return timelinePayloadTitle(payload, '发现阻塞项', 'title');
    case 'blocker.updated': return timelinePayloadTitle(payload, '阻塞已更新', 'title');
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
  if (!payload) return null;
  if (type === 'task.updated') return formatTaskUpdatedDetail(payload);
  if (type === 'panel.task_goal_updated') return formatTaskGoalUpdatedDetail(payload);
  if (type === 'panel.task_goal_paused') return formatTaskGoalControlDetail(payload, '已暂停');
  if (type === 'panel.task_goal_resumed') return formatTaskGoalControlDetail(payload, '已恢复');
  if (type === 'panel.runtime_native_goal_requested') return formatRuntimeNativeGoalRequestedDetail(payload);
  if (type === 'panel.scheduled_event_agent_triggered') return formatScheduledEventAgentTriggeredDetail(payload);
  if (type.startsWith('completion_criteria.')) return formatCompletionCriteriaDetail(payload);
  if (type.startsWith('task_dependency.')) return formatTaskDependencyDetail(payload);
  if (type.startsWith('blocker.')) return formatBlockerDetail(payload);
  if (type.startsWith('source_context.')) return formatSourceContextDetail(payload);
  if (type !== 'task.completion_check') return null;
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

function formatTaskGoalUpdatedDetail(payload: string): string | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  const cleared = parsed.cleared === true ? '目标：已清除' : null;
  const objective = typeof parsed.objective === 'string' && parsed.objective.trim()
    ? `目标：${parsed.objective.trim()}`
    : null;
  const previousObjective = typeof parsed.previousObjective === 'string' && parsed.previousObjective.trim()
    ? `原目标：${parsed.previousObjective.trim()}`
    : null;
  const source = typeof parsed.source === 'string' && parsed.source.trim()
    ? `来源：${parsed.source.trim()}`
    : '来源：/goal';
  return [cleared ?? objective, previousObjective, source].filter(Boolean).join(' / ') || null;
}

function formatTaskGoalControlDetail(payload: string, status: string): string | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  const objective = typeof parsed.objective === 'string' && parsed.objective.trim()
    ? `目标：${parsed.objective.trim()}`
    : null;
  const source = typeof parsed.source === 'string' && parsed.source.trim()
    ? `来源：${parsed.source.trim()}`
    : null;
  return [`状态：${status}`, objective, source].filter(Boolean).join(' / ') || null;
}

function formatRuntimeNativeGoalRequestedDetail(payload: string): string | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  const runtime = typeof parsed.runtimeLabel === 'string' && parsed.runtimeLabel.trim()
    ? `Runtime：${parsed.runtimeLabel.trim()}`
    : typeof parsed.runtimeId === 'string' && parsed.runtimeId.trim()
      ? `Runtime：${parsed.runtimeId.trim()}`
      : null;
  const objective = typeof parsed.objective === 'string' && parsed.objective.trim()
    ? `目标：${parsed.objective.trim()}`
    : null;
  const forwarded = parsed.forwarded === true ? '已透传' : '未透传';
  const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
    ? `原因：${parsed.reason.trim()}`
    : null;
  return [runtime, objective, forwarded, reason].filter(Boolean).join(' / ') || null;
}

function formatScheduledEventAgentTriggeredDetail(payload: string): string | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  const runId = typeof parsed.runId === 'string' && parsed.runId.trim()
    ? `Run：${parsed.runId.trim()}`
    : null;
  const runStatus = typeof parsed.runStatus === 'string' && parsed.runStatus.trim()
    ? `状态：${parsed.runStatus.trim()}`
    : null;
  const terminalRunEvidence = parsed.terminalRunEvidenceStatus === 'present'
    ? '终态证据：已记录'
    : parsed.terminalRunEvidenceStatus === 'pending'
      ? '终态证据：等待中'
      : null;
  const triggerRunEvidence = parsed.triggerRunEvidenceStatus === 'ready_for_terminal_review'
    ? '触发证据：可复核'
    : parsed.triggerRunEvidenceStatus === 'pending_terminal_run_evidence'
      ? '触发证据：等待终态'
      : null;
  const policyId = typeof parsed.standingApprovalPolicyId === 'string' && parsed.standingApprovalPolicyId.trim()
    ? `授权：${parsed.standingApprovalPolicyId.trim()}`
    : null;
  return [runId, runStatus, terminalRunEvidence, triggerRunEvidence, policyId].filter(Boolean).join(' / ') || null;
}

function timelinePayloadTitle(payload: string | null, fallback: string, field: string): string {
  const parsed = parsePayload(payload);
  const value = parsed?.[field];
  return typeof value === 'string' && value.trim()
    ? `${fallback}：${value.trim()}`
    : fallback;
}

function formatTaskUpdatedTitle(payload: string | null): string {
  const fields = extractChangedTaskFieldLabels(payload);
  return fields.length
    ? `任务字段已更新：${fields.join('、')}`
    : '任务信息已更新';
}

function formatTaskUpdatedDetail(payload: string): string | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  const parts = [
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? `摘要：${parsed.summary.trim()}`
      : null,
    typeof parsed.nextStep === 'string' && parsed.nextStep.trim()
      ? `下一步：${parsed.nextStep.trim()}`
      : null,
    typeof parsed.waitingReason === 'string' && parsed.waitingReason.trim()
      ? `等待：${parsed.waitingReason.trim()}`
      : null,
    typeof parsed.riskLevel === 'string' && parsed.riskLevel !== 'none'
      ? `风险：${parsed.riskLevel}${typeof parsed.riskNote === 'string' && parsed.riskNote.trim() ? ` · ${parsed.riskNote.trim()}` : ''}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(' / ') || null;
}

function extractChangedTaskFieldLabels(payload: string | null): string[] {
  const parsed = parsePayload(payload);
  if (!parsed || !Array.isArray(parsed.changedFields)) return [];
  return parsed.changedFields
    .map((field) => typeof field === 'string' ? TASK_FIELD_LABELS[field] : null)
    .filter((label): label is string => Boolean(label));
}

function formatCompletionCriteriaDetail(payload: string): string | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  const status = typeof parsed.status === 'string' && parsed.status.trim()
    ? `状态：${formatCompletionCriteriaStatus(parsed.status.trim())}`
    : null;
  const satisfiedAt = typeof parsed.satisfiedAt === 'string' && parsed.satisfiedAt.trim()
    ? `满足于：${parsed.satisfiedAt.trim()}`
    : null;
  return [status, satisfiedAt].filter(Boolean).join(' / ') || null;
}

function formatTaskDependencyDetail(payload: string): string | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  const upstream = typeof parsed.blockedByTaskTitle === 'string' && parsed.blockedByTaskTitle.trim()
    ? `上游：${parsed.blockedByTaskTitle.trim()}`
    : typeof parsed.blockedByTaskId === 'string' && parsed.blockedByTaskId.trim()
      ? `上游：${parsed.blockedByTaskId.trim()}`
      : null;
  const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
    ? `原因：${parsed.reason.trim()}`
    : null;
  const status = typeof parsed.status === 'string' && parsed.status.trim()
    ? `状态：${parsed.status.trim()}`
    : null;
  return [upstream, reason, status].filter(Boolean).join(' / ') || null;
}

function formatBlockerDetail(payload: string): string | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  const kind = typeof parsed.kind === 'string' && parsed.kind.trim()
    ? `类型：${parsed.kind.trim()}`
    : null;
  const detail = typeof parsed.detail === 'string' && parsed.detail.trim()
    ? `说明：${parsed.detail.trim()}`
    : null;
  const owner = typeof parsed.owner === 'string' && parsed.owner.trim()
    ? `负责人：${parsed.owner.trim()}`
    : null;
  const status = typeof parsed.status === 'string' && parsed.status.trim()
    ? `状态：${parsed.status.trim()}`
    : null;
  return [kind, detail, owner, status].filter(Boolean).join(' / ') || null;
}

function formatSourceContextDetail(payload: string): string | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  const role = typeof parsed.sourceRole === 'string' && parsed.sourceRole.trim()
    ? `角色：${parsed.sourceRole.trim()}`
    : null;
  const kind = typeof parsed.kind === 'string' && parsed.kind.trim()
    ? `类型：${parsed.kind.trim()}`
    : null;
  const uri = typeof parsed.uri === 'string' && parsed.uri.trim()
    ? `位置：${parsed.uri.trim()}`
    : null;
  const flags = [
    parsed.isKey === true ? '关键来源' : null,
    parsed.isDuplicate === true ? '重复来源' : null,
    parsed.containsSensitiveData === true ? '含敏感信息' : null,
  ].filter(Boolean).join('、');
  return [role, kind, uri, flags || null].filter(Boolean).join(' / ') || null;
}

function formatCompletionCriteriaStatus(status: string): string {
  if (status === 'satisfied') return '已满足';
  if (status === 'open') return '未满足';
  return status;
}

const TASK_FIELD_LABELS: Record<string, string> = {
  title: '标题',
  summary: '摘要',
  taskType: '任务类型',
  taskFacets: '任务视图',
  parentTaskId: '父任务',
  childTaskIds: '子任务',
  nextStep: '下一步',
  waitingReason: '等待原因',
  riskLevel: '风险等级',
  riskNote: '风险说明',
};

function parsePayload(payload: string | null): Record<string, unknown> | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
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
      ? parsed.nextTaskId ?? parsed.previousTaskId
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
