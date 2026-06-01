import {
  contextOwnerHasBusinessLine,
  contextOwnerHasTaskCarrier,
  type ContextOwner,
} from './context-owner.js';
import type { TaskMemoryGuidanceState } from './task-memory-guidance-state.js';

export type ContextPreservationMessageRole = 'assistant' | 'system' | 'user';

export type ContextPreservationMessage = {
  role: ContextPreservationMessageRole;
  text: string;
};

export type ContextPreservationSignalKind =
  | 'artifact'
  | 'constraint'
  | 'correction'
  | 'decision'
  | 'goal'
  | 'handoff'
  | 'next_step'
  | 'risk'
  | 'source';

export type ContextPreservationSurface =
  | 'artifact_reference'
  | 'business_record'
  | 'decision'
  | 'discard'
  | 'run_step'
  | 'source_context'
  | 'task_md'
  | 'task_record'
  | 'temporary_file';

export type HandoffV2Type =
  | 'durable_business_handoff'
  | 'ephemeral_session_handoff'
  | 'next_action_handoff'
  | 'runtime_or_subagent_handoff';

export type ContextPreservationStatus =
  | 'covered'
  | 'keep_context'
  | 'needs_user_decision'
  | 'needs_write'
  | 'not_applicable';

export type ContextPreservationSignal = {
  kind: ContextPreservationSignalKind;
  summary: string;
  targetSurface: ContextPreservationSurface;
  covered: boolean;
  reason: string;
};

export type ContextRecoveryCheck = {
  canRecoverConstraints: boolean;
  canRecoverEvidence: boolean;
  canRecoverGoal: boolean;
  canRecoverNextStep: boolean;
  canRecoverState: boolean;
};

export type ContextPreservationWriteIntent = {
  targetSurface: Exclude<ContextPreservationSurface, 'discard'>;
  reason: string;
  summary: string;
};

export type HandoffRecoveryWriteIntentType =
  | 'business_handoff.record'
  | 'runtime_evidence.record'
  | 'task_record.create'
  | 'temporary_handoff.proof';

export type HandoffRecoveryArtifact = {
  artifactKind: 'handoff_recovery_artifact';
  blockers: string[];
  changedFilesOrArtifacts: string[];
  constraints: string[];
  currentState: string;
  decisions: string[];
  evidence: string[];
  exclusions: string[];
  handoffType: HandoffV2Type;
  nextStep: string | null;
  objective: string | null;
  rawTranscriptIncluded: false;
  source: 'context_preservation_evaluation';
  transcriptPolicy: 'digest_only';
  writebackTarget: {
    requiresTaskplaneGate: true;
    surface: Exclude<ContextPreservationSurface, 'discard'>;
    writeIntentType: HandoffRecoveryWriteIntentType;
  };
};

export type ContextPreservationInput = {
  chatMessageCount?: number;
  executionRecoveryNeeded?: boolean;
  handoffType?: HandoffV2Type;
  hasBlocker?: boolean;
  hasBusinessLineContext?: boolean;
  hasOpenDecision?: boolean;
  hasPendingRecoveryGuidance?: boolean;
  hasSpecificHandoffSignal?: boolean;
  hasTaskContext: boolean;
  memoryWriteCompleted?: boolean;
  messages?: ContextPreservationMessage[];
  owner?: ContextOwner;
  shortTermReasoningActive?: boolean;
  taskMemoryGuidance?: TaskMemoryGuidanceState | null;
};

export type ContextPreservationEvaluation = {
  discardRationale: string[];
  executionRecoveryNeeded: boolean;
  handoffArtifact: HandoffRecoveryArtifact | null;
  handoffType: HandoffV2Type | null;
  hasValuableSignals: boolean;
  missingCoverage: string[];
  owner: ContextOwner | null;
  reason: string;
  recoveryCheck: ContextRecoveryCheck;
  requiredWriteIntents: ContextPreservationWriteIntent[];
  status: ContextPreservationStatus;
  valuableSignals: ContextPreservationSignal[];
};

export function evaluateContextPreservation(
  input: ContextPreservationInput,
): ContextPreservationEvaluation {
  const messages = normalizeMessages(input.messages ?? []);
  const chatMessageCount = input.chatMessageCount ?? messages.filter((message) => message.role !== 'system').length;
  const owner = input.owner ?? null;
  const ownerHasBusinessLine = owner ? contextOwnerHasBusinessLine(owner) : false;
  const ownerHasTaskCarrier = owner ? contextOwnerHasTaskCarrier(owner) : false;
  const hasBusinessLineContext = Boolean(input.hasBusinessLineContext || ownerHasBusinessLine);
  const hasTaskContext = Boolean(input.hasTaskContext || ownerHasTaskCarrier);
  const hasBoundContext = hasTaskContext || hasBusinessLineContext;
  const handoffType = input.handoffType ?? inferHandoffType({
    hasBusinessLineContext,
    hasTaskContext,
    owner,
  });
  const activeDiscussion = hasBoundContext && chatMessageCount > 0;
  const pendingGuidance = input.taskMemoryGuidance?.outcome === 'pending' || input.hasPendingRecoveryGuidance;
  const baseSignals = extractContextPreservationSignals(messages, {
    executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
    hasBusinessLineContext,
    hasTaskContext,
    handoffType,
    owner,
  });
  const signals = ensureExplicitHandoffSignal(baseSignals, {
    activeDiscussion,
    executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
    hasSpecificHandoffSignal: Boolean(input.hasSpecificHandoffSignal),
    handoffType,
    owner,
  });
  const hasValuableSignals = signals.some((signal) => signal.targetSurface !== 'discard');
  const covered = Boolean(input.memoryWriteCompleted);
  const recoveryCheck = buildRecoveryCheck({ activeDiscussion, covered, hasValuableSignals, signals });

  if (!hasBoundContext) {
    return result('not_applicable', {
      discardRationale: ['当前是全局或未绑定业务线/任务上下文，不需要保全证明。'],
      executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
      handoffType,
      owner,
      recoveryCheck,
      reason: '当前没有业务线或任务上下文，不需要保全会话。',
      signals,
    });
  }

  if (input.hasOpenDecision) {
    return result('needs_user_decision', {
      executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
      missingCoverage: ['存在待拍板事项，不能通过整理上下文绕过用户判断。'],
      handoffType,
      owner,
      recoveryCheck,
      reason: '当前任务存在待拍板事项，需要先处理 Decision 边界。',
      signals: ensureDecisionSignal(signals),
    });
  }

  if (input.hasBlocker) {
    return result('keep_context', {
      executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
      missingCoverage: ['存在阻塞、依赖或等待条件，当前上下文仍有恢复价值。'],
      handoffType,
      owner,
      recoveryCheck,
      reason: '当前任务存在阻塞或依赖，应保留上下文直到阻塞状态被处理。',
      signals,
    });
  }

  if (input.shortTermReasoningActive) {
    return result('keep_context', {
      executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
      missingCoverage: ['当前仍处在短期推理现场，整理会丢失未稳定的判断链。'],
      handoffType,
      owner,
      recoveryCheck,
      reason: '当前对话仍是短期推理现场，暂不应重置上下文。',
      signals,
    });
  }

  if (pendingGuidance) {
    return result('needs_write', {
      executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
      missingCoverage: [
        input.taskMemoryGuidance?.reason
        ?? '当前存在尚未处理的任务记忆建议，应先确认写入 Task.md 或 Task Record。',
      ],
      handoffType,
      owner,
      recoveryCheck,
      reason: input.taskMemoryGuidance?.reason
        ?? '当前存在尚未处理的任务记忆建议，应先完成最小任务记忆写入。',
      signals,
    });
  }

  if (!activeDiscussion) {
    return result('covered', {
      discardRationale: ['当前任务没有活跃讨论，不需要写入额外记忆。'],
      executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
      handoffType,
      owner,
      recoveryCheck,
      reason: '当前没有需要保全的任务讨论。',
      signals,
    });
  }

  if (!hasValuableSignals) {
    return result('keep_context', {
      executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
      missingCoverage: ['已有任务对话，但尚未形成目标、决定、风险、下一步、来源或交接信号。'],
      handoffType,
      owner,
      recoveryCheck,
      reason: '当前任务会话缺少可恢复信号，保留上下文比重置更安全。',
      signals,
    });
  }

  if (!covered) {
    return result('needs_write', {
      executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
      missingCoverage: ['需要先把可恢复信号写入 Task.md、Task Record、Decision、Source Context 或产物引用。'],
      handoffType,
      owner,
      recoveryCheck,
      reason: '重置上下文前需要先完成保全写入。',
      signals,
    });
  }

  return result('covered', {
    discardRationale: ['关键恢复信号已经写入持久任务记忆，可以丢弃临时聊天窗口。'],
    executionRecoveryNeeded: Boolean(input.executionRecoveryNeeded),
    handoffType,
    owner,
    recoveryCheck,
    reason: '关键上下文已保全，可以重置或交接。',
    signals,
  });
}

export function buildContextPreservationRecordContent(params: {
  capturedAt?: string;
  evaluation: ContextPreservationEvaluation;
  taskTitle: string;
}): string {
  const capturedAt = params.capturedAt ?? new Date().toISOString();
  const grouped = groupSignalsBySurface(params.evaluation.valuableSignals);
  const missing = params.evaluation.missingCoverage.length
    ? params.evaluation.missingCoverage.map((item) => `- ${item}`)
    : ['- 暂无缺口。'];
  const discarded = params.evaluation.discardRationale.length
    ? params.evaluation.discardRationale.map((item) => `- ${item}`)
    : ['- 未记录寒暄、重复表达或已被结构化状态覆盖的临时文本。'];
  const handoffArtifact = params.evaluation.handoffArtifact
    ? formatHandoffRecoveryArtifactForRecord(params.evaluation.handoffArtifact)
    : ['- 无结构化交接 artifact。'];

  return [
    '# Record: 上下文保全证明',
    '',
    `Captured: ${capturedAt}`,
    'Role: context-preservation',
    'Note: 上下文刷新前的最小恢复证明；不保存完整聊天全文。',
    '',
    '## Summary',
    `任务：${params.taskTitle}`,
    `交接类型：${params.evaluation.handoffType ?? 'none'}`,
    `保全状态：${params.evaluation.status}`,
    `原因：${params.evaluation.reason}`,
    '',
    '## Preserved Signals',
    ...formatGroupedSignals(grouped),
    '',
    '## Recovery Check',
    `- 目标可恢复：${yesNo(params.evaluation.recoveryCheck.canRecoverGoal)}`,
    `- 状态可恢复：${yesNo(params.evaluation.recoveryCheck.canRecoverState)}`,
    `- 下一步可恢复：${yesNo(params.evaluation.recoveryCheck.canRecoverNextStep)}`,
    `- 约束可恢复：${yesNo(params.evaluation.recoveryCheck.canRecoverConstraints)}`,
    `- 证据可恢复：${yesNo(params.evaluation.recoveryCheck.canRecoverEvidence)}`,
    '',
    '## Missing Coverage',
    ...missing,
    '',
    '## Discarded',
    ...discarded,
    '',
    '## Handoff Recovery Artifact',
    ...handoffArtifact,
    '',
    '## Next',
    '- 刷新后从 Taskplane 业务线/任务结构化状态、Business Records、Task.md、Task Records、Source Context 和 Run evidence 重新装配上下文。',
  ].join('\n');
}

export function buildHandoffRecoveryArtifact(params: {
  evaluation: Pick<ContextPreservationEvaluation, 'discardRationale' | 'executionRecoveryNeeded' | 'handoffType' | 'missingCoverage' | 'owner' | 'reason' | 'requiredWriteIntents' | 'status' | 'valuableSignals'>;
}): HandoffRecoveryArtifact | null {
  const handoffType = params.evaluation.handoffType;
  if (!handoffType) return null;
  const signals = params.evaluation.valuableSignals;
  const objective = firstSignalSummary(signals, 'goal');
  const nextStep = firstSignalSummary(signals, 'next_step') ?? firstSignalSummary(signals, 'handoff');
  const decisions = signalSummaries(signals, 'decision');
  const constraints = [
    ...signalSummaries(signals, 'constraint'),
    ...signalSummaries(signals, 'risk'),
  ];
  const changedFilesOrArtifacts = signalSummaries(signals, 'artifact');
  const evidence = [
    ...signalSummaries(signals, 'source'),
    ...changedFilesOrArtifacts,
  ];
  const blockers = signalSummaries(signals, 'risk');
  const exclusions = params.evaluation.discardRationale.length
    ? params.evaluation.discardRationale
    : ['Raw transcript, duplicate chat, hidden prompts, and unrelated context are excluded.'];
  const writebackTarget = resolveHandoffWritebackTarget(params.evaluation);

  return {
    artifactKind: 'handoff_recovery_artifact',
    blockers,
    changedFilesOrArtifacts,
    constraints,
    currentState: params.evaluation.reason,
    decisions,
    evidence,
    exclusions,
    handoffType,
    nextStep,
    objective,
    rawTranscriptIncluded: false,
    source: 'context_preservation_evaluation',
    transcriptPolicy: 'digest_only',
    writebackTarget,
  };
}

function result(
  status: ContextPreservationStatus,
  params: {
    discardRationale?: string[];
    executionRecoveryNeeded?: boolean;
    missingCoverage?: string[];
    handoffType?: HandoffV2Type | null;
    owner?: ContextOwner | null;
    reason: string;
    recoveryCheck: ContextRecoveryCheck;
    signals: ContextPreservationSignal[];
  },
): ContextPreservationEvaluation {
  const valuableSignals = params.signals.filter((signal) => signal.targetSurface !== 'discard');
  const draftEvaluation = {
    discardRationale: params.discardRationale ?? [],
    executionRecoveryNeeded: Boolean(params.executionRecoveryNeeded),
    handoffType: params.handoffType ?? null,
    missingCoverage: params.missingCoverage ?? [],
    owner: params.owner ?? null,
    reason: params.reason,
    requiredWriteIntents: buildRequiredWriteIntents(status, valuableSignals),
    status,
    valuableSignals,
  };
  return {
    discardRationale: draftEvaluation.discardRationale,
    executionRecoveryNeeded: draftEvaluation.executionRecoveryNeeded,
    handoffArtifact: buildHandoffRecoveryArtifact({ evaluation: draftEvaluation }),
    handoffType: draftEvaluation.handoffType,
    hasValuableSignals: valuableSignals.length > 0,
    missingCoverage: draftEvaluation.missingCoverage,
    owner: draftEvaluation.owner,
    reason: draftEvaluation.reason,
    recoveryCheck: params.recoveryCheck,
    requiredWriteIntents: draftEvaluation.requiredWriteIntents,
    status,
    valuableSignals,
  };
}

function buildRequiredWriteIntents(
  status: ContextPreservationStatus,
  signals: ContextPreservationSignal[],
): ContextPreservationWriteIntent[] {
  if (status !== 'needs_write') return [];
  const bySurface = new Map<Exclude<ContextPreservationSurface, 'discard'>, ContextPreservationWriteIntent>();
  for (const signal of signals) {
    if (signal.targetSurface === 'discard') continue;
    if (signal.covered) continue;
    const existing = bySurface.get(signal.targetSurface);
    bySurface.set(signal.targetSurface, {
      targetSurface: signal.targetSurface,
      reason: existing ? `${existing.reason} / ${signal.reason}` : signal.reason,
      summary: existing ? `${existing.summary} / ${signal.summary}` : signal.summary,
    });
  }
  return [...bySurface.values()];
}

function normalizeMessages(messages: ContextPreservationMessage[]): ContextPreservationMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      text: normalizeLine(message.text, 260),
    }))
    .filter((message) => message.text);
}

function extractContextPreservationSignals(
  messages: ContextPreservationMessage[],
  params: {
    executionRecoveryNeeded: boolean;
    handoffType: HandoffV2Type;
    hasBusinessLineContext: boolean;
    hasTaskContext: boolean;
    owner: ContextOwner | null;
  },
): ContextPreservationSignal[] {
  const signals: ContextPreservationSignal[] = [];
  const userMessages = messages.filter((message) => message.role === 'user');
  for (const message of userMessages.slice(-8)) {
    const text = message.text;
    const lower = text.toLowerCase();
    if (/确认|同意|决定|拍板|就这样|按这个|采用|不要|别|改成|更正|不是|应该|必须|优先|默认/.test(text)) {
      signals.push(signal('decision', text, targetSurface(params, 'task_record', 'business_record'), '用户判断、修正或偏好会影响未来执行。'));
    }
    if (/目标|范围|定位|面向|受众|核心|非目标|边界|基调|主题/.test(text)) {
      signals.push(signal('goal', text, targetSurface(params, 'task_md', 'business_record'), '目标、范围或边界应进入当前恢复摘要。'));
    }
    if (/下一步|继续|开始|实现|检查|完善|优化|推进|提交|推送|验证|测试/.test(text)) {
      signals.push(signal('next_step', text, targetSurface(params, 'task_md', 'business_record'), '下一步会影响任务恢复和执行入口。'));
    }
    if (/风险|阻塞|问题|失败|不能|依赖|安全|权限|成本|漏洞|质量|下降/.test(text)) {
      signals.push(signal('risk', text, targetSurface(params, 'task_record', 'business_record'), '风险、阻塞或失败原因需要作为恢复依据。'));
    }
    if (/交接|handoff|切换|子任务|阶段|收尾|上下文|清理|重置|压缩|刷新/.test(text)) {
      signals.push(signal('handoff', text, handoffTargetSurface(params), '上下文、交接或阶段信息需要可恢复记录。'));
    }
    if (/https?:\/\/|官方|文档|资料|搜索|调研|引用|source|docs?|github/.test(lower)) {
      signals.push(signal('source', text, 'source_context', '来源或调研线索需要进入 Source Context 或来源摘要。'));
    }
    if (/文档|文件|报告|页面|网站|代码|PR|commit|产物|草稿/.test(text)) {
      signals.push(signal('artifact', text, 'artifact_reference', '产物或文件线索需要保留引用。'));
    }
    if (/约束|规则|规范|必须|不要|不能|默认|偏好|习惯/.test(text)) {
      signals.push(signal('constraint', text, targetSurface(params, 'task_record', 'business_record'), '约束或偏好会影响后续执行。'));
    }
  }
  return dedupeSignals(signals);
}

function signal(
  kind: ContextPreservationSignalKind,
  text: string,
  targetSurface: Exclude<ContextPreservationSurface, 'discard'>,
  reason: string,
): ContextPreservationSignal {
  return {
    covered: false,
    kind,
    reason,
    summary: normalizeLine(text, 150),
    targetSurface,
  };
}

function ensureExplicitHandoffSignal(
  signals: ContextPreservationSignal[],
  params: {
    activeDiscussion: boolean;
    executionRecoveryNeeded: boolean;
    hasSpecificHandoffSignal: boolean;
    handoffType: HandoffV2Type;
    owner: ContextOwner | null;
  },
): ContextPreservationSignal[] {
  if (!params.activeDiscussion || !params.hasSpecificHandoffSignal) return signals;
  if (signals.length > 0) return signals;
  return [
    ...signals,
    {
      covered: false,
      kind: 'handoff',
      reason: '上游判断当前讨论包含可恢复信号。',
      summary: '当前任务讨论包含需要保全的上下文信号。',
      targetSurface: handoffTargetSurface({
        executionRecoveryNeeded: params.executionRecoveryNeeded,
        handoffType: params.handoffType,
        owner: params.owner,
      }),
    },
  ];
}

function ensureDecisionSignal(signals: ContextPreservationSignal[]): ContextPreservationSignal[] {
  if (signals.some((signal) => signal.kind === 'decision')) return signals;
  return [
    ...signals,
    {
      covered: false,
      kind: 'decision',
      reason: '存在待用户处理的 Decision 边界。',
      summary: '当前任务存在待拍板事项。',
      targetSurface: 'decision',
    },
  ];
}

function inferHandoffType(params: {
  hasBusinessLineContext: boolean;
  hasTaskContext: boolean;
  owner?: ContextOwner | null;
}): HandoffV2Type {
  if (params.owner?.kind === 'business_line') return 'durable_business_handoff';
  if (params.owner?.kind === 'next_action' || params.owner?.kind === 'legacy_task') return 'next_action_handoff';
  if (params.owner?.kind === 'global') return 'ephemeral_session_handoff';
  if (params.hasBusinessLineContext && !params.hasTaskContext) return 'durable_business_handoff';
  return 'next_action_handoff';
}

function targetSurface(
  params: {
    executionRecoveryNeeded: boolean;
    handoffType: HandoffV2Type;
    hasBusinessLineContext: boolean;
    hasTaskContext: boolean;
    owner: ContextOwner | null;
  },
  taskSurface: Exclude<ContextPreservationSurface, 'discard'>,
  businessSurface: Exclude<ContextPreservationSurface, 'discard'>,
): Exclude<ContextPreservationSurface, 'discard'> {
  if (params.handoffType === 'ephemeral_session_handoff') return 'temporary_file';
  if (params.handoffType === 'runtime_or_subagent_handoff') return 'run_step';
  if (params.handoffType === 'durable_business_handoff') return businessSurface;
  if (params.owner?.kind === 'next_action' && !params.executionRecoveryNeeded) return businessSurface;
  if (params.owner?.kind === 'legacy_task') return taskSurface;
  if (params.hasBusinessLineContext && !params.hasTaskContext) return businessSurface;
  return taskSurface;
}

function handoffTargetSurface(params: {
  executionRecoveryNeeded?: boolean;
  handoffType: HandoffV2Type;
  owner?: ContextOwner | null;
}): Exclude<ContextPreservationSurface, 'discard'> {
  switch (params.handoffType) {
    case 'durable_business_handoff': return 'business_record';
    case 'ephemeral_session_handoff': return 'temporary_file';
    case 'runtime_or_subagent_handoff': return 'run_step';
    case 'next_action_handoff':
      if (params.owner?.kind === 'next_action' && !params.executionRecoveryNeeded) return 'business_record';
      return 'task_record';
  }
}

function buildRecoveryCheck(params: {
  activeDiscussion: boolean;
  covered: boolean;
  hasValuableSignals: boolean;
  signals: ContextPreservationSignal[];
}): ContextRecoveryCheck {
  if (!params.activeDiscussion) {
    return {
      canRecoverConstraints: true,
      canRecoverEvidence: true,
      canRecoverGoal: true,
      canRecoverNextStep: true,
      canRecoverState: true,
    };
  }
  const covered = params.covered;
  const hasGoal = params.signals.some((signal) => signal.kind === 'goal');
  const hasNextStep = params.signals.some((signal) => signal.kind === 'next_step' || signal.kind === 'handoff');
  const hasConstraint = params.signals.some((signal) => (
    signal.kind === 'constraint' || signal.kind === 'decision' || signal.kind === 'correction' || signal.kind === 'risk'
  ));
  const hasEvidence = params.signals.some((signal) => signal.kind === 'source' || signal.kind === 'artifact');

  return {
    canRecoverConstraints: covered || !hasConstraint,
    canRecoverEvidence: covered || !hasEvidence,
    canRecoverGoal: covered || !params.hasValuableSignals || hasGoal,
    canRecoverNextStep: covered || !params.hasValuableSignals || hasNextStep,
    canRecoverState: covered,
  };
}

function dedupeSignals(signals: ContextPreservationSignal[]): ContextPreservationSignal[] {
  const seen = new Set<string>();
  const result: ContextPreservationSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.kind}:${signal.targetSurface}:${signal.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(signal);
  }
  return result.slice(-12);
}

function groupSignalsBySurface(
  signals: ContextPreservationSignal[],
): Map<ContextPreservationSurface, ContextPreservationSignal[]> {
  const grouped = new Map<ContextPreservationSurface, ContextPreservationSignal[]>();
  for (const signal of signals) {
    grouped.set(signal.targetSurface, [...(grouped.get(signal.targetSurface) ?? []), signal]);
  }
  return grouped;
}

function formatGroupedSignals(grouped: Map<ContextPreservationSurface, ContextPreservationSignal[]>): string[] {
  if (grouped.size === 0) return ['- 暂无需要保全的具体信号。'];
  const lines: string[] = [];
  for (const [surface, signals] of grouped) {
    lines.push(`### ${surface}`);
    lines.push(...signals.map((signal) => `- [${signal.kind}] ${signal.summary}`));
  }
  return lines;
}

function yesNo(value: boolean): string {
  return value ? '是' : '否';
}

function firstSignalSummary(
  signals: ContextPreservationSignal[],
  kind: ContextPreservationSignalKind,
): string | null {
  return signals.find((signal) => signal.kind === kind)?.summary ?? null;
}

function signalSummaries(
  signals: ContextPreservationSignal[],
  kind: ContextPreservationSignalKind,
): string[] {
  return signals.filter((signal) => signal.kind === kind).map((signal) => signal.summary);
}

function resolveHandoffWritebackTarget(
  evaluation: Pick<ContextPreservationEvaluation, 'executionRecoveryNeeded' | 'handoffType' | 'owner' | 'requiredWriteIntents'>,
): HandoffRecoveryArtifact['writebackTarget'] {
  const surface = defaultHandoffSurface(evaluation.handoffType);
  const requiredSurfaces = new Set(evaluation.requiredWriteIntents.map((intent) => intent.targetSurface));
  const resolvedSurface = evaluation.handoffType === 'next_action_handoff'
    && evaluation.owner?.kind === 'next_action'
    && !evaluation.executionRecoveryNeeded
    && !requiredSurfaces.has('task_md')
    && !requiredSurfaces.has('task_record')
    ? 'business_record'
    : surface;
  return {
    requiresTaskplaneGate: true,
    surface: resolvedSurface,
    writeIntentType: writeIntentTypeForHandoffSurface(resolvedSurface),
  };
}

function defaultHandoffSurface(
  handoffType: HandoffV2Type | null,
): Exclude<ContextPreservationSurface, 'discard'> {
  switch (handoffType) {
    case 'durable_business_handoff': return 'business_record';
    case 'ephemeral_session_handoff': return 'temporary_file';
    case 'runtime_or_subagent_handoff': return 'run_step';
    case 'next_action_handoff':
    default:
      return 'task_record';
  }
}

function writeIntentTypeForHandoffSurface(
  surface: Exclude<ContextPreservationSurface, 'discard'>,
): HandoffRecoveryWriteIntentType {
  if (surface === 'business_record') return 'business_handoff.record';
  if (surface === 'run_step') return 'runtime_evidence.record';
  if (surface === 'temporary_file') return 'temporary_handoff.proof';
  return 'task_record.create';
}

function formatHandoffRecoveryArtifactForRecord(artifact: HandoffRecoveryArtifact): string[] {
  return [
    `- kind: ${artifact.artifactKind}`,
    `- handoffType: ${artifact.handoffType}`,
    `- objective: ${artifact.objective ?? 'none'}`,
    `- currentState: ${artifact.currentState}`,
    `- nextStep: ${artifact.nextStep ?? 'none'}`,
    `- writebackTarget: ${artifact.writebackTarget.surface} / ${artifact.writebackTarget.writeIntentType}`,
    `- rawTranscriptIncluded: ${artifact.rawTranscriptIncluded ? 'yes' : 'no'}`,
    `- transcriptPolicy: ${artifact.transcriptPolicy}`,
    artifact.decisions.length ? `- decisions: ${artifact.decisions.join(' | ')}` : '- decisions: none',
    artifact.constraints.length ? `- constraints: ${artifact.constraints.join(' | ')}` : '- constraints: none',
    artifact.blockers.length ? `- blockers: ${artifact.blockers.join(' | ')}` : '- blockers: none',
    artifact.changedFilesOrArtifacts.length ? `- changedFilesOrArtifacts: ${artifact.changedFilesOrArtifacts.join(' | ')}` : '- changedFilesOrArtifacts: none',
    artifact.evidence.length ? `- evidence: ${artifact.evidence.join(' | ')}` : '- evidence: none',
    artifact.exclusions.length ? `- exclusions: ${artifact.exclusions.join(' | ')}` : '- exclusions: none',
  ];
}

function normalizeLine(value: string, limit = 120): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}
