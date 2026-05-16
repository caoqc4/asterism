import type { ArtifactKind, CreateManualArtifactInput } from './types/artifact.js';
import type { CreateDecisionInput, DecisionKind, DecisionScope, DecisionSourceType } from './types/decision.js';
import type { RunCheckpointKind, RunStepKind } from './types/run.js';
import type { CreateSourceContextInput, SourceContextRole } from './types/source-context.js';
import type { CreateTaskFileInput, TaskFileKind } from './types/task-file.js';
import type { CreateWorkHabitProposalInput, WorkHabitScope } from './types/work-habit.js';
import { isTaskMdPath, isTaskRecordPath, normalizeTaskMemoryPath } from './task-memory-path.js';

export type RuntimeSurfaceKind =
  | 'task_state'
  | 'task_file'
  | 'task_record'
  | 'source_material'
  | 'ai_output'
  | 'artifact'
  | 'decision'
  | 'run_step'
  | 'work_habit'
  | 'discussion';

export type RuntimeFileSurfaceKind =
  | 'task'
  | 'record'
  | 'ai_output'
  | 'artifact'
  | 'source'
  | 'file';

export type RuntimeSurfaceCandidate = {
  kind?: string | null;
  path?: string | null;
  name?: string | null;
  sourceRole?: SourceContextRole | null;
  sourceNote?: string | null;
  sourceUri?: string | null;
  artifactKind?: ArtifactKind | null;
  taskFileKind?: TaskFileKind | null;
};

export type RuntimeSurfaceDecision = {
  surface: RuntimeSurfaceKind;
  fileClass: RuntimeFileSurfaceKind;
  label: string;
  note: string;
  projectionLabel: string;
  rank: number;
};

export type RuntimeInformationRisk =
  | 'none'
  | 'local_write'
  | 'external_write'
  | 'sensitive'
  | 'irreversible'
  | 'completion';

export type RuntimeInformationCandidate = {
  text?: string | null;
  kind?: string | null;
  requiresUserChoice?: boolean;
  requiresConfirmation?: boolean;
  risk?: RuntimeInformationRisk | null;
  operation?: string | null;
  isCrossTaskPreference?: boolean;
  isRepeatedCorrection?: boolean;
  hasActionableChange?: boolean;
  workHabitScope?: WorkHabitScope | null;
};

export type RuntimeInformationRoutingDecision = {
  surface: RuntimeSurfaceKind;
  shouldPersist: boolean;
  requiresConfirmation: boolean;
  reason: string;
  decisionKind?: DecisionKind;
  workHabitScope?: WorkHabitScope;
};

export type RuntimeActionEventKind =
  | 'session_started'
  | 'plan_proposed'
  | 'model_completed'
  | 'tool_started'
  | 'tool_completed'
  | 'tool_failed'
  | 'checkpoint_created'
  | 'session_heartbeat'
  | 'session_paused'
  | 'session_completed'
  | 'session_failed'
  | 'session_interrupted'
  | 'session_cancelled';

export type RuntimeActionEventCandidate = {
  kind: RuntimeActionEventKind;
  text?: string | null;
  operation?: string | null;
  risk?: RuntimeInformationRisk | null;
  requiresConfirmation?: boolean;
  checkpointKind?: RunCheckpointKind | null;
};

export type RuntimeActionEventRoutingDecision = RuntimeInformationRoutingDecision & {
  runStepKind: RunStepKind;
  shouldRecordRunStep: boolean;
  shouldCreateDecision: boolean;
};

const AI_OUTPUT_PATTERN = /(^|\s)AI(\s|_|-)|自检|复盘|执行摘要|项目拆解|拆解自检|自学习观察|产物编辑观察/;
const TASK_RECORD_PATTERN = /任务记录|阶段收尾|会话刷新前保全|context-refresh|closeout|handoff|Task Record|^Record:/i;
const DECISION_PATTERN = /拍板|决定|选择|批准|审批|确认|是否|要不要|方案|风险|验收|完成确认|approve|approval|decide|decision/i;
const WORK_HABIT_PATTERN = /以后|以后都|每次|总是|默认|习惯|偏好|规则|流程|不要再|下次|所有任务|类似任务|cross-task/i;
const EXPLORATORY_PATTERN = /怎么想|聊聊|讨论|看看|可能|也许|思路|brainstorm|explore|想法/i;

function isTaskRecordCandidate(candidate: RuntimeSurfaceCandidate): boolean {
  return candidate.kind === 'records_folder' || isTaskRecordPath(candidate.path);
}

function isAiOutputCandidate(candidate: RuntimeSurfaceCandidate): boolean {
  if (candidate.sourceRole === 'digest') return true;
  if (candidate.artifactKind === 'run_output') return true;
  const text = `${candidate.name ?? ''} ${candidate.sourceNote ?? ''}`;
  return AI_OUTPUT_PATTERN.test(text);
}

export function classifyRuntimeFileSurface(candidate: RuntimeSurfaceCandidate): RuntimeSurfaceDecision {
  if (candidate.kind === 'task_record' || isTaskMdPath(candidate.path)) {
    return {
      surface: 'task_state',
      fileClass: 'task',
      label: '任务说明',
      note: '任务目标、进度与下一步',
      projectionLabel: 'Primary task record',
      rank: 0,
    };
  }

  if (isTaskRecordCandidate(candidate)) {
    return {
      surface: 'task_record',
      fileClass: 'record',
      label: '记录',
      note: '任务执行中的沉淀记录',
      projectionLabel: 'Projected task record',
      rank: 1,
    };
  }

  if (candidate.kind === 'source') {
    if (isAiOutputCandidate(candidate)) {
      return {
        surface: 'ai_output',
        fileClass: 'ai_output',
        label: 'AI 产出',
        note: 'AI 生成的任务上下文',
        projectionLabel: 'Projected AI output',
        rank: 2,
      };
    }
    return {
      surface: 'source_material',
      fileClass: 'source',
      label: '来源材料',
      note: '关联到任务的来源材料',
      projectionLabel: 'Projected source material',
      rank: 4,
    };
  }

  if (candidate.kind === 'artifact' || Boolean(candidate.path?.trim().replace(/\\/g, '/').startsWith('Artifacts/'))) {
    return {
      surface: 'artifact',
      fileClass: 'artifact',
      label: '产物',
      note: '任务执行产物',
      projectionLabel: 'Projected artifact',
      rank: 3,
    };
  }

  return {
    surface: 'task_file',
    fileClass: 'file',
    label: '文件',
    note: candidate.path ?? '任务文件',
    projectionLabel: 'Task file',
    rank: 3,
  };
}

export function routeRuntimeInformation(candidate: RuntimeSurfaceCandidate): RuntimeSurfaceKind {
  return classifyRuntimeFileSurface(candidate).surface;
}

export function classifySourceContextSurface(
  input: Pick<CreateSourceContextInput, 'title' | 'note' | 'sourceRole'>,
): RuntimeSurfaceKind {
  const text = `${input.title ?? ''} ${input.note ?? ''}`;
  if (TASK_RECORD_PATTERN.test(text)) return 'task_record';
  return classifyRuntimeFileSurface({
    kind: 'source',
    name: input.title,
    sourceNote: input.note,
    sourceRole: input.sourceRole,
  }).surface;
}

export function normalizeCreateSourceContextInput(input: CreateSourceContextInput): CreateSourceContextInput {
  if (input.sourceRole) return input;
  const surface = classifySourceContextSurface(input);
  return {
    ...input,
    sourceRole: surface === 'ai_output' || surface === 'task_record' ? 'digest' : 'raw',
  };
}

export function normalizeCreateTaskFileInput(input: CreateTaskFileInput): CreateTaskFileInput {
  const name = input.name.trim();
  const rawPath = normalizeTaskMemoryPath(input.path) ?? name;
  const path = input.kind === 'folder' && !rawPath.endsWith('/') ? `${rawPath}/` : rawPath;
  return {
    ...input,
    name: isTaskMdPath(path) ? 'Task.md' : name,
    path,
    content: input.kind === 'folder' ? '' : input.content ?? '',
  };
}

export function classifyCreateTaskFileSurface(input: CreateTaskFileInput): RuntimeSurfaceKind {
  const normalized = normalizeCreateTaskFileInput(input);
  return classifyRuntimeFileSurface({
    kind: isTaskMdPath(normalized.path) ? 'task_record' : 'local_file',
    path: normalized.path,
    name: normalized.name,
    taskFileKind: normalized.kind,
  }).surface;
}

export function normalizeCreateManualArtifactInput(input: CreateManualArtifactInput): CreateManualArtifactInput {
  return {
    ...input,
    title: input.title.trim() || 'Untitled artifact',
    content: input.content ?? '',
    kind: input.kind ?? 'note',
  };
}

function textForRuntimeInformation(candidate: RuntimeInformationCandidate): string {
  return `${candidate.kind ?? ''} ${candidate.operation ?? ''} ${candidate.text ?? ''}`;
}

function decisionKindForRuntimeInformation(candidate: RuntimeInformationCandidate): DecisionKind {
  const text = textForRuntimeInformation(candidate);
  if (candidate.risk === 'local_write' || candidate.risk === 'sensitive' || candidate.risk === 'irreversible' || /风险|敏感|不可逆|删除|覆盖/.test(text)) {
    return 'risk_approval';
  }
  if (candidate.risk === 'external_write' || /external|外部|发送|发布/.test(text)) return 'external_write';
  if (candidate.risk === 'completion' || /完成确认|验收|acceptance|complete/.test(text)) return 'completion_acceptance';
  if (/恢复|resume|checkpoint|继续执行/.test(text)) return 'agent_resume';
  if (/信息|补充|澄清|不明确|待明确/.test(text)) return 'information_request';
  if (/规则|policy|工作习惯|原则/.test(text)) return 'policy_change';
  return 'direction_choice';
}

function isDecisionCandidate(candidate: RuntimeInformationCandidate): boolean {
  const text = textForRuntimeInformation(candidate);
  return Boolean(
    candidate.requiresUserChoice
    || candidate.requiresConfirmation
    || (candidate.risk && candidate.risk !== 'none')
    || candidate.kind === 'decision'
    || DECISION_PATTERN.test(text),
  );
}

function isWorkHabitCandidate(candidate: RuntimeInformationCandidate): boolean {
  const text = textForRuntimeInformation(candidate);
  return Boolean(
    candidate.isCrossTaskPreference
    || candidate.isRepeatedCorrection
    || candidate.kind === 'work_habit'
    || WORK_HABIT_PATTERN.test(text),
  );
}

export function classifyRuntimeInformationCandidate(
  candidate: RuntimeInformationCandidate,
): RuntimeInformationRoutingDecision {
  const text = textForRuntimeInformation(candidate);

  if (candidate.kind === 'run_step' || candidate.kind === 'checkpoint' || candidate.kind === 'tool_result') {
    return {
      surface: 'run_step',
      shouldPersist: true,
      requiresConfirmation: false,
      reason: '结构化执行事件应记录为 run step 或 checkpoint。',
    };
  }

  if (isDecisionCandidate(candidate)) {
    return {
      surface: 'decision',
      shouldPersist: true,
      requiresConfirmation: true,
      reason: '该信息涉及用户选择、风险确认、外部写入、恢复或完成验收，必须进入 Decision。',
      decisionKind: decisionKindForRuntimeInformation(candidate),
    };
  }

  if (isWorkHabitCandidate(candidate)) {
    return {
      surface: 'work_habit',
      shouldPersist: true,
      requiresConfirmation: true,
      reason: '该信息像跨任务偏好、重复纠正或通用工作方式，应作为 Work Habit 候选而不是写入任务文件。',
      workHabitScope: candidate.workHabitScope ?? 'global',
    };
  }

  if (!candidate.hasActionableChange || EXPLORATORY_PATTERN.test(text)) {
    return {
      surface: 'discussion',
      shouldPersist: false,
      requiresConfirmation: false,
      reason: '该信息仍处于探索或普通讨论阶段，暂不写入 durable state。',
    };
  }

  return {
    surface: 'discussion',
    shouldPersist: false,
    requiresConfirmation: false,
    reason: '未命中明确 durable surface，保持讨论直到出现任务状态、文件、来源、决策或习惯边界。',
  };
}

function runStepKindForRuntimeAction(kind: RuntimeActionEventKind): RunStepKind {
  switch (kind) {
    case 'session_started':
    case 'plan_proposed':
    case 'session_heartbeat':
      return 'plan';
    case 'model_completed':
      return 'model';
    case 'tool_started':
      return 'tool_call';
    case 'tool_completed':
    case 'tool_failed':
      return 'tool_result';
    case 'checkpoint_created':
    case 'session_paused':
      return 'checkpoint';
    case 'session_completed':
    case 'session_failed':
    case 'session_interrupted':
    case 'session_cancelled':
      return 'final';
  }
}

function shouldRuntimeActionCreateDecision(candidate: RuntimeActionEventCandidate): boolean {
  return Boolean(
    candidate.requiresConfirmation
    || candidate.kind === 'checkpoint_created'
    || candidate.kind === 'session_paused'
    || (candidate.risk && candidate.risk !== 'none'),
  );
}

export function classifyRuntimeActionEvent(
  candidate: RuntimeActionEventCandidate,
): RuntimeActionEventRoutingDecision {
  const runStepKind = runStepKindForRuntimeAction(candidate.kind);
  const shouldCreateDecision = shouldRuntimeActionCreateDecision(candidate);
  const base = classifyRuntimeInformationCandidate({
    kind: runStepKind === 'checkpoint' ? 'checkpoint' : 'run_step',
    text: candidate.text,
    operation: candidate.operation ?? candidate.checkpointKind ?? candidate.kind,
    risk: candidate.risk,
  });
  const decision = shouldCreateDecision
    ? classifyRuntimeInformationCandidate({
        kind: 'decision',
        text: candidate.text,
        operation: candidate.operation ?? candidate.checkpointKind ?? candidate.kind,
        risk: candidate.risk,
        requiresConfirmation: true,
        requiresUserChoice: true,
      })
    : null;

  return {
    ...base,
    requiresConfirmation: Boolean(decision),
    decisionKind: decision?.decisionKind,
    runStepKind,
    shouldRecordRunStep: true,
    shouldCreateDecision,
    reason: shouldCreateDecision
      ? '该 runtime action 应记录为 run step，并在需要用户确认时关联 Decision/checkpoint。'
      : base.reason,
  };
}

function normalizeDecisionSourceType(input: CreateDecisionInput): DecisionSourceType {
  if (input.sourceType) return input.sourceType;
  return 'manual';
}

function normalizeDecisionScope(input: CreateDecisionInput, sourceType: DecisionSourceType): DecisionScope {
  if (input.scope) return input.scope;
  if (input.taskId?.trim()) return 'task';
  if (sourceType === 'external_access') return 'external_access';
  if (sourceType === 'workspace') return 'workspace';
  if (sourceType === 'system') return 'system';
  if (sourceType === 'agent_checkpoint') return 'agent';
  return 'global';
}

function normalizeDecisionKind(input: CreateDecisionInput, sourceType: DecisionSourceType): DecisionKind {
  if (input.kind) return input.kind;
  if (sourceType === 'agent_checkpoint') return 'agent_resume';
  const routing = classifyRuntimeInformationCandidate({
    kind: 'decision',
    text: [
      input.title,
      input.sourceLabel,
      input.context?.whyNow,
      input.context?.impact,
      input.context?.ifDeferred,
    ].filter(Boolean).join(' '),
    requiresUserChoice: true,
    requiresConfirmation: true,
    risk: sourceType === 'external_access' ? 'external_write' : null,
  });
  return routing.decisionKind ?? 'direction_choice';
}

export function normalizeCreateDecisionInput(input: CreateDecisionInput): CreateDecisionInput {
  const sourceType = normalizeDecisionSourceType(input);
  return {
    ...input,
    taskId: input.taskId?.trim() || null,
    title: input.title.trim(),
    scope: normalizeDecisionScope(input, sourceType),
    kind: normalizeDecisionKind(input, sourceType),
    sourceType,
    sourceId: input.sourceId?.trim() || null,
    sourceLabel: input.sourceLabel?.trim() || null,
    options: input.options ?? [],
    recommendation: input.recommendation ?? null,
  };
}

export function normalizeCreateWorkHabitProposalInput(
  input: CreateWorkHabitProposalInput,
): CreateWorkHabitProposalInput | null {
  const routing = classifyRuntimeInformationCandidate({
    text: [input.rule, input.examples, input.taskTitle].filter(Boolean).join(' '),
    isCrossTaskPreference: true,
    workHabitScope: input.scope ?? 'global',
  });
  if (routing.surface !== 'work_habit') return null;
  const scope = routing.workHabitScope ?? input.scope ?? 'global';
  return {
    ...input,
    rule: input.rule.trim(),
    scope,
    scopeLabel: input.scopeLabel?.trim() || (scope === 'global' ? '全局' : input.taskTitle?.trim() || '未分类'),
    examples: input.examples?.trim() || input.taskTitle?.trim() || '运行时识别的跨任务偏好候选',
  };
}
