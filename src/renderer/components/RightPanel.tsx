import { useState, useRef, useEffect, useCallback, useReducer } from 'react';
import type { ChatMessage } from '@shared/types/ipc';
import type { CompletionCriteriaRecord } from '@shared/types/completion-criteria';
import {
  buildDefaultAgentCliRuntimeCapabilities,
  type AgentCliRuntimeId,
} from '@shared/agent-cli-runtime-status';
import type { AiRuntimeMode } from '@shared/types/settings';
import type { RunRecord, RunStepRecord } from '@shared/types/run';
import {
  selectBlockingTaskMemoryGuidance,
  type TaskMemoryGuidanceState,
} from '@shared/task-memory-guidance-state';
import {
  buildTaskMemoryWriteApplyPlan,
  type TaskMemoryWriteProposal,
} from '@shared/task-memory-write-proposal';
import type { TaskDetail, TaskListItemRecord } from '@shared/types/task';
import { selectApplicableWorkHabitMatches as selectApplicableWorkHabitMatchesFromList } from '@shared/work-habit-rules';
import { CONTEXT_COMPRESSION_THRESHOLD } from '@shared/settings-defaults';
import { PANEL_CAPTURE_SUMMARY_PREFIX } from '@shared/panel-capture';
import { evaluateRuntimeAction } from '@shared/runtime-action-evaluator';
import {
  evaluateRuntimeIntake,
  type RuntimeIntakeEvaluation,
} from '@shared/runtime-intake-evaluator';
import { evaluateTaskAdvancement } from '@shared/task-advancement-orchestrator';
import {
  buildBoundedPilotDecisionPrompt,
  buildPilotDecisionSnapshot,
  evaluatePilotDecision,
  type PilotDecision,
  type PilotDecisionBackend,
  shouldRunBoundedPilotDecisionBackend,
} from '@shared/pilot-decision-contract';
import {
  buildRuntimeHandoffPreview,
  buildRuntimeResumePlan,
  evaluateRuntimeHandoff,
} from '@shared/runtime-handoff';
import {
  buildContextPreservationRecordContent,
  evaluateContextPreservation,
  type ContextPreservationMessage,
} from '@shared/context-preservation';
import type { PanelRuntimeTimelineEventType } from '@shared/runtime-panel-events';
import {
  evaluateTaskRecordWorthiness,
  type TaskRecordWorthinessReason,
} from '@shared/task-record-worthiness';
import { evaluateTaskMemoryCoverage } from '@shared/task-memory-coverage';
import { evaluateTaskMdUpdateNeed } from '@shared/task-md-update-need';
import { isTaskMdPath, isTaskRecordPath } from '@shared/task-memory-path';
import { evaluateRuntimeVerification } from '@shared/runtime-verification';
import {
  extractTaskplaneWriteIntentsFromText,
  validateTaskplaneWriteIntent,
} from '@shared/taskplane-write-intent';
import {
  buildTaskplaneWritebackProposalsFromText,
  type TaskplaneArtifactWritebackProposal,
  type TaskplaneSourceContextWritebackProposal,
  type TaskplaneStructuredWritebackProposal,
} from '@shared/taskplane-writeback-proposal';
import {
  buildArtifactWritebackApplyPlan,
  buildSubtaskCreateManyWritebackApplyPlan,
  buildTaskFileUpdateWritebackApplyPlan,
  buildTaskFileWritebackApplyPlan,
  buildSourceContextWritebackApplyPlan,
  buildStructuredWritebackApplyPlan,
  formatSubtaskDraftSummary,
  type TaskplaneSubtaskCreateManyInput,
  type TaskplaneSubtaskCreateManyResult,
} from '@shared/taskplane-writeback-apply-plan';
import { dispatchTaskplaneWritebackApplyPlan } from '@shared/taskplane-writeback-dispatch';
import {
  classifyCreateTaskFileSurface,
  normalizeCreateTaskFileInput,
  type RuntimeSurfaceKind,
} from '@shared/runtime-surface-routing';
import {
  deriveTaskGoalLifecycleState,
  evaluateRuntimeNativeGoalForwarding,
  parseAgentRuntimeSlashCommand,
  parseProductGoalDraft,
  type AgentRuntimeAdapterCapabilities,
} from '@shared/agent-runtime-goal';
import {
  buildNativeGoalAuditReadinessEvidence,
  evaluateNativeGoalForwardingReadiness,
} from '@shared/native-goal-forwarding-readiness';
import {
  selectApplicableWorkHabitMatches,
  getPersistedWorkHabitStorageSnapshot,
  recordWorkHabitApplications,
  summarizeWorkHabitMatchesForPrompt,
} from '../lib/workHabits';
import {
  getTaskAttributes,
  inferTaskTypeProfile,
  type TaskExecutionType,
} from '../lib/taskAttributes';
import {
  deriveAgentCliProgress,
  type AgentCliProgressSnapshot,
} from '../lib/agentCliProgress';
import {
  guardDurablePanelAction,
  guardTaskCapture,
  guardTaskStateTransition,
  verifyDurablePanelActionCompleted,
} from '../lib/runtimeActionGuards';
import { orderedChildRecordsForTask } from '../lib/taskHierarchyAdapter';

type MessageRole = 'user' | 'assistant';
type ActiveAgentCliRunState = {
  allowDecompositionDraft?: boolean;
  progress?: AgentCliProgressSnapshot;
  runId: string;
  runtimeId: AgentCliRuntimeId;
  runtimeLabel: string;
  status: 'running' | 'cancelling';
  suppressMemoryProposal?: boolean;
  taskId: string;
};
const AGENT_CLI_PANEL_RUNTIME_LABELS: Record<AgentCliRuntimeId, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
};

const AGENT_CLI_PANEL_RUNTIME_HINTS: Record<AgentCliRuntimeId, string> = {
  claude: 'Claude Code · 原生能力',
  codex: 'Codex CLI · 原生能力',
};

const AGENT_CLI_PANEL_RUNTIMES: AgentCliRuntimeId[] = ['codex', 'claude'];

function pilotBackendForCliRuntime(runtimeId: AgentCliRuntimeId | null): PilotDecisionBackend | null {
  if (runtimeId === 'claude') return 'claude_cli';
  if (runtimeId === 'codex') return 'codex_cli';
  return null;
}

function buildAvailablePilotDecisionBackends(params: {
  apiReady: boolean;
  cliRuntimeId: AgentCliRuntimeId | null;
  cliReady: boolean;
}): PilotDecisionBackend[] {
  const backends: PilotDecisionBackend[] = ['rules'];
  if (params.apiReady) backends.push('agent_api');
  const cliBackend = params.cliReady ? pilotBackendForCliRuntime(params.cliRuntimeId) : null;
  if (cliBackend) backends.push(cliBackend);
  backends.push('human_review');
  return [...new Set(backends)];
}

function formatPilotEscalationMessage(decision: PilotDecision): string {
  return [
    '这个动作触及需要你确认的边界，我先暂停自动执行。',
    decision.advancement.userMessage,
    '确认后我再继续调用对应的执行 runtime。',
  ].join('\n\n');
}

function formatPilotDecisionLaunchNotice(decision: PilotDecision, runtimeLabel: string): string {
  if (!shouldRunBoundedPilotDecisionBackend(decision)) {
    return '正在准备任务上下文和可追溯来源，等待运行接收。';
  }

  return [
    `Pilot 有界判断中：${runtimeLabel} 会先判断推进路线，再执行下一步。`,
    '写入、拆任务、记忆和完成状态仍需 Taskplane gate 或用户确认。',
  ].join('\n');
}

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  ts: string;
}

interface PendingCtxSwitch {
  taskId: string;
  taskTitle: string;
}

interface TaskFileWriteProposal {
  evidenceRunId?: string | null;
  intentSource?: 'write_intent';
  path: string;
  summary: string;
  content: string;
  surface: RuntimeSurfaceKind;
  surfaceLabel: string;
  taskMemoryProposal?: TaskMemoryWriteProposal | null;
}

type SourceContextWriteProposal = TaskplaneSourceContextWritebackProposal;

type ArtifactWriteProposal = TaskplaneArtifactWritebackProposal;

type StructuredWritebackProposal = TaskplaneStructuredWritebackProposal;

interface TaskDecompositionDraft {
  nextStep: string;
  review: string;
  runId: string;
  subtasks: Array<{
    acceptanceCriteria: string;
    dependency?: string | null;
    summary: string;
    title: string;
  }>;
}

interface PanelSessionState {
  abandonConfirmOpen: boolean;
  activeTaskId: string | null;
  input: string;
  pendingCapturedTaskId: string | null;
  pendingSwitch: PendingCtxSwitch | null;
  phaseCloseoutNotice: string | null;
  phaseCloseoutSaved: boolean;
  sessionRefreshDismissed: boolean;
  artifactProposal: ArtifactWriteProposal | null;
  sourceContextProposal: SourceContextWriteProposal | null;
  structuredWritebackProposal: StructuredWritebackProposal | null;
  taskFileProposal: TaskFileWriteProposal | null;
}

type PanelSessionPatch = Partial<PanelSessionState>;

type PanelSessionAction =
  | { type: 'patch'; patch: PanelSessionPatch }
  | { type: 'apply_task_context'; taskId: string }
  | { type: 'clear_task_context' }
  | { type: 'reset_task_transients' };

function createPanelSessionState(taskId: string | null): PanelSessionState {
  return {
    abandonConfirmOpen: false,
    activeTaskId: taskId,
    input: '',
    pendingCapturedTaskId: null,
    pendingSwitch: null,
    phaseCloseoutNotice: null,
    phaseCloseoutSaved: false,
    sessionRefreshDismissed: false,
    artifactProposal: null,
    sourceContextProposal: null,
    structuredWritebackProposal: null,
    taskFileProposal: null,
  };
}

function clearTaskScopedTransients(state: PanelSessionState): PanelSessionState {
  return {
    ...state,
    abandonConfirmOpen: false,
    input: '',
    pendingCapturedTaskId: null,
    pendingSwitch: null,
    phaseCloseoutNotice: null,
    phaseCloseoutSaved: false,
    sessionRefreshDismissed: false,
    artifactProposal: null,
    sourceContextProposal: null,
    structuredWritebackProposal: null,
    taskFileProposal: null,
  };
}

function panelSessionReducer(state: PanelSessionState, action: PanelSessionAction): PanelSessionState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'apply_task_context':
      return {
        ...clearTaskScopedTransients(state),
        activeTaskId: action.taskId,
      };
    case 'clear_task_context':
      return {
        ...clearTaskScopedTransients(state),
        activeTaskId: null,
      };
    case 'reset_task_transients':
      return clearTaskScopedTransients(state);
  }
}

function taskTitle(taskId: string | null, cache: Record<string, string>): string | null {
  if (!taskId) return null;
  return cache[taskId] ?? null;
}

function makeWelcomeMessage(taskTitle: string): Message {
  return {
    id: 'm0',
    role: 'assistant',
    text: `已切换到任务上下文：**${taskTitle}**。\n\n我会从任务记忆、执行记录、关键来源和工作习惯重新组装上下文。有什么需要讨论或推进的？`,
    ts: now(),
  };
}

function makeTaskSessionRefreshedMessage(taskTitle: string): Message {
  return {
    id: nextId(),
    role: 'assistant',
    text: `已整理并刷新「${taskTitle}」的任务会话。关键恢复信息已写入任务记录，当前聊天会从这份任务记忆继续承接。`,
    ts: now(),
  };
}

function now() {
  return new Date().toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' });
}

let msgCounter = 1;
function nextId() { return `m${msgCounter++}`; }

function buildPanelRuntimeStep(params: {
  title: string;
  output?: string | null;
  error?: string | null;
}): RunStepRecord {
  const timestamp = new Date().toISOString();
  return {
    id: `panel_step_${timestamp}`,
    runId: 'panel_lightweight',
    index: 1,
    kind: 'final',
    status: params.error ? 'failed' : 'completed',
    title: params.title,
    input: null,
    output: params.output ?? null,
    error: params.error ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const TASK_TYPE_HABIT_LABELS: Record<TaskExecutionType, string> = {
  simple:    '一次性',
  project:   '项目型',
  scheduled: '定时任务',
  event:     '事件触发',
  routine:   '常设任务',
};

const PANEL_CONTEXT_TOKEN_BUDGET = 12_000;
const GENERIC_ASSISTANT_REPLY_PATTERNS = [
  /基于.*任务上下文/,
  /结合.*任务.*上下文/,
  /重点关注.*方向/,
  /建议下一步/,
  /当前任务处于正常推进中/,
  /需要我展开.*部分/,
];

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
const USER_CORRECTION_PATTERNS = [
  /不对/,
  /不是/,
  /刚才.*说错/,
  /前面.*错/,
  /改成/,
  /别.*要/,
  /不要.*要/,
];
const GENERIC_HANDOFF_PATTERNS = [
  /^下一步怎么推进$/,
  /^怎么推进$/,
  /^总结一下现在的状态$/,
  /^有什么风险需要注意$/,
  /^先看风险$/,
  /^再看来源$/,
  /^最后看下一步$/,
];

function normalizeUserMessage(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[，。！？、,.!?；;：:\s]/g, '');
}

function looksGenericAssistantReply(text: string): boolean {
  const normalized = text.replace(/\s+/g, '');
  return GENERIC_ASSISTANT_REPLY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeUserCorrection(text: string): boolean {
  return USER_CORRECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function estimateContextTokens(text: string): number {
  const compact = text.trim();
  if (!compact) return 0;
  const cjkChars = compact.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const nonCjkChars = compact.replace(/[\u3400-\u9fff]/g, '').length;
  return Math.ceil(cjkChars + nonCjkChars / 4);
}

function estimatePanelTranscriptUsage(
  messages: Message[],
  tokenBudget: number = PANEL_CONTEXT_TOKEN_BUDGET,
): { percent: number; tokens: number } {
  const tokens = messages.reduce((total, message) => (
    total + 6 + estimateContextTokens(`${message.role}: ${message.text}`)
  ), 0);
  const percent = tokenBudget > 0 ? Math.round((tokens / tokenBudget) * 100) : 0;
  return { percent, tokens };
}

function shouldSuggestSessionRefresh(
  messages: Message[],
  compressionThreshold: number = CONTEXT_COMPRESSION_THRESHOLD.default,
): { reason: string } | null {
  const userMessages = messages
    .filter((message) => message.role === 'user')
    .map((message) => normalizeUserMessage(message.text))
    .filter(Boolean);
  const transcriptUsage = estimatePanelTranscriptUsage(messages);

  const counts = new Map<string, number>();
  for (const message of userMessages) {
    const next = (counts.get(message) ?? 0) + 1;
    if (userMessages.length >= 3 && next >= 3 && hasPreservableContextSignals(messages)) {
      return { reason: '触发原因：同一个问题已重复出现 3 次。' };
    }
    counts.set(message, next);
  }
  if (transcriptUsage.percent >= compressionThreshold && hasPreservableContextSignals(messages)) {
    return {
      reason: `触发原因：估算上下文占用约 ${transcriptUsage.percent}%（约 ${transcriptUsage.tokens} tokens），达到 ${compressionThreshold}% 阈值。`,
    };
  }

  const recentCorrectionCount = userMessages
    .slice(-4)
    .filter((message) => looksLikeUserCorrection(message)).length;
  if (userMessages.length >= 3 && recentCorrectionCount >= 2 && hasPreservableContextSignals(messages)) {
    return { reason: '触发原因：最近多次出现改口或纠正，建议刷新任务会话。' };
  }

  const recentAssistantMessages = messages
    .filter((message) => message.role === 'assistant')
    .slice(-3);
  if (
    userMessages.length >= 3
    && recentAssistantMessages.length >= 3
    && recentAssistantMessages.every((message) => looksGenericAssistantReply(message.text))
    && hasPreservableContextSignals(messages)
  ) {
    return { reason: '触发原因：最近 3 次回复都偏泛化，建议刷新任务会话。' };
  }
  return null;
}

function hasPreservableContextSignals(messages: Message[]): boolean {
  const preservationMessages = buildContextPreservationMessages(messages);
  return evaluateContextPreservation({
    hasTaskContext: true,
    chatMessageCount: preservationMessages.filter((message) => message.role === 'user').length,
    messages: preservationMessages,
  }).hasValuableSignals;
}

async function preserveSessionRefreshMemory(params: {
  taskId: string;
  taskTitle: string;
  messages: Message[];
}): Promise<boolean> {
  const preservationMessages = buildContextPreservationMessages(params.messages);
  const userMessages = preservationMessages.filter((message) => message.role === 'user');
  const heuristicSignal = hasSpecificHandoffSignal(userMessages.map((message) => message.text));
  const planningEvaluation = evaluateContextPreservation({
    hasTaskContext: true,
    chatMessageCount: userMessages.length,
    hasSpecificHandoffSignal: heuristicSignal,
    memoryWriteCompleted: false,
    messages: preservationMessages,
  });
  if (userMessages.length === 0 || !planningEvaluation.hasValuableSignals) return false;

  const archivedEvaluation = evaluateContextPreservation({
    hasTaskContext: true,
    chatMessageCount: userMessages.length,
    hasSpecificHandoffSignal: heuristicSignal,
    memoryWriteCompleted: true,
    messages: preservationMessages,
  });
  const content = buildContextPreservationRecordContent({
    evaluation: archivedEvaluation,
    taskTitle: params.taskTitle,
  });

  const canWriteSource = guardDurablePanelAction({ taskId: params.taskId, confirmed: true }).allowed;
  const sourceWritten = canWriteSource && window.api?.createSourceContext
    ? await window.api.createSourceContext({
      taskId: params.taskId,
      title: '会话刷新前保全',
      kind: 'note',
      isKey: false,
      content,
      note: '上下文保全证明：刷新前保存目标、决策、风险、来源、下一步或交接信号。',
      sourceRole: 'digest',
    }).then(() => true).catch(() => false)
    : false;
  if (sourceWritten) {
    verifyDurablePanelActionCompleted({
      title: '保存会话刷新来源',
      output: '已保存会话刷新前保全。',
    });
  }
  const fileWritten = await writeTaskRecordFile({
    taskId: params.taskId,
    title: 'context-refresh-handoff',
    content,
    reasonHint: 'context_clear_archive',
  });
  if (sourceWritten || fileWritten) {
    await recordPanelTimelineEvent(params.taskId, 'panel.context_refreshed', {
      sourceWritten,
      fileWritten,
      preservationStatus: archivedEvaluation.status,
      signalCount: archivedEvaluation.valuableSignals.length,
      userMessageCount: userMessages.length,
    });
  }
  return sourceWritten || fileWritten;
}

function buildContextPreservationMessages(messages: Message[]): ContextPreservationMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      text: message.text.trim(),
    }))
    .filter((message) => message.text);
}

function hasSpecificHandoffSignal(userMessages: string[]): boolean {
  const recent = userMessages.slice(-5).map((message) => truncateMemoryLine(message, 160));
  const normalized = recent
    .map(normalizeUserMessage)
    .filter(Boolean)
    .filter((message) => !GENERIC_HANDOFF_PATTERNS.some((pattern) => pattern.test(message)));
  const unique = new Set(normalized);
  const combined = recent.join(' ');

  const heuristicSignal = unique.size >= 2
    || combined.length >= 48
    || /[A-Za-z]{3,}|[0-9]|\.md|\.ts|\.tsx|Playwright|MCP|API|RAG|任务拆解|验收|实现|优化文档/.test(combined);
  if (heuristicSignal) return true;
  return evaluateContextPreservation({
    hasTaskContext: true,
    chatMessageCount: userMessages.length,
    messages: userMessages.map((text) => ({ role: 'user', text })),
  }).hasValuableSignals;
}

async function preservePhaseCloseoutRecord(params: {
  taskId: string;
  taskTitle: string;
  messages: Message[];
}): Promise<{ recordPath: string | null }> {
  const meaningfulMessages = params.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      text: truncateMemoryLine(message.text, 120),
    }))
    .filter((message) => message.text);
  if (meaningfulMessages.length === 0) return { recordPath: null };

  const userMessages = meaningfulMessages.filter((message) => message.role === 'user');
  const assistantMessages = meaningfulMessages.filter((message) => message.role === 'assistant');
  const confirmed = userMessages.slice(-3).map((message) => `- ${message.text}`);
  const open = userMessages
    .filter((message) => /？|\?|怎么|是否|需要|风险|下一步/.test(message.text))
    .slice(-3)
    .map((message) => `- ${message.text}`);
  const next = assistantMessages.slice(-2).map((message) => `- ${message.text}`);
  const content = [
    '# Record: 阶段收尾',
    '',
    '## Trigger',
    '用户或 AI 判断当前任务讨论已形成可持久化阶段记录。',
    '',
    '## Summary',
    `任务：${params.taskTitle}`,
    `消息数：${meaningfulMessages.length}`,
    '',
    '## Confirmed',
    confirmed.length ? confirmed.join('\n') : '- 暂无明确确认项。',
    '',
    '## Open',
    open.length ? open.join('\n') : '- 暂无明确未解决问题。',
    '',
    '## Next',
    next.length ? next.join('\n') : '- 先执行阶段质量检查，再交接到已存在的下一项子任务；如无子任务，再回到规划入口补齐。',
    '',
    '## Links',
    '- 来自右侧任务讨论面板的阶段收尾动作。',
  ].join('\n');

  if (guardDurablePanelAction({ taskId: params.taskId, confirmed: true }).allowed) {
    const sourceWritten = await window.api?.createSourceContext?.({
      taskId: params.taskId,
      title: '阶段收尾记录',
      kind: 'note',
      isKey: false,
      content,
      note: '任务记录：阶段收尾、质量检查和执行交接。',
      sourceRole: 'digest',
    }).then(() => true).catch(() => false);
    if (sourceWritten) {
      verifyDurablePanelActionCompleted({
        title: '保存阶段收尾来源',
        output: '已保存阶段收尾记录。',
      });
    }
  }
  const recordWritten = await writeTaskRecordFile({
    taskId: params.taskId,
    title: 'phase-closeout',
    content,
    reasonHint: 'phase_closeout',
  });
  if (recordWritten) {
    await recordPanelTimelineEvent(params.taskId, 'panel.phase_closeout', {
      recordPath: `Task Records/${new Date().toISOString().slice(0, 10)}-phase-closeout.md`,
      messageCount: meaningfulMessages.length,
    });
  }
  return {
    recordPath: recordWritten ? `Task Records/${new Date().toISOString().slice(0, 10)}-phase-closeout.md` : null,
  };
}

function truncateMemoryLine(value: string, limit = 80): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length > limit ? `${singleLine.slice(0, limit)}...` : singleLine;
}

function uniqueGoalConditionLabels(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function slugFilePart(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii.slice(0, 36) || 'task';
}

function normalizeTaskFilePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function taskFileProposalSurfaceLabel(surface: RuntimeSurfaceKind): string {
  if (surface === 'task_md') return '任务说明';
  if (surface === 'task_record') return '任务记录';
  if (surface === 'artifact') return '产物';
  if (surface === 'ai_output') return 'AI 产出';
  return '任务文件';
}

function classifyTaskFileProposal(path: string): Pick<TaskFileWriteProposal, 'surface' | 'surfaceLabel'> {
  const normalizedPath = normalizeTaskFilePath(path);
  const name = normalizedPath.split('/').filter(Boolean).at(-1) ?? normalizedPath;
  const surface = classifyCreateTaskFileSurface({
    taskId: 'proposal',
    name,
    path: normalizedPath,
    kind: 'file',
  });
  return {
    surface,
    surfaceLabel: taskFileProposalSurfaceLabel(surface),
  };
}

function buildTaskFileProposalPath(params: {
  taskTitle: string;
  userFocus: string[];
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const titleSlug = slugFilePart(params.taskTitle);
  const focus = params.userFocus.join(' ');
  if (/记录|收尾|复盘|交接|保全|checkpoint|handoff|record/i.test(focus)) {
    return `Task Records/${today}-${titleSlug}-discussion.md`;
  }
  return `${today}-${titleSlug}-discussion.md`;
}

function buildTaskFileWriteProposal(params: {
  taskTitle: string;
  messages: Message[];
  selectedFilePath?: string | null;
}): TaskFileWriteProposal {
  const recent = params.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .filter((message) => message.id !== 'm0')
    .slice(-8);
  const userFocus = recent
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => truncateMemoryLine(message.text, 120));
  const path = buildTaskFileProposalPath({
    taskTitle: params.taskTitle,
    userFocus,
  });
  const surface = classifyTaskFileProposal(path);
  const content = [
    `# ${params.taskTitle} Discussion Notes`,
    '',
    '## Source',
    '- Created from the right-panel task discussion after user confirmation.',
    params.selectedFilePath ? `- Selected file context: ${params.selectedFilePath}` : null,
    '',
    '## Summary',
    userFocus.length ? userFocus.map((item) => `- ${item}`).join('\n') : '- No focused user message captured yet.',
    '',
    '## Conversation Notes',
    ...recent.map((message) => `- ${message.role === 'user' ? 'User' : 'AI'}: ${truncateMemoryLine(message.text, 180)}`),
    '',
    '## Next',
    '- Review this draft and decide whether it should become a task record, working document, or implementation input.',
    '',
  ].filter((line): line is string => line !== null).join('\n');
  return {
    path,
    summary: userFocus[0] ?? '从当前任务讨论生成 Markdown 草稿。',
    content,
    ...surface,
  };
}

function taskMemoryProposalToFileProposal(proposal: TaskMemoryWriteProposal): TaskFileWriteProposal {
  const surface = proposal.target === 'task_md' ? 'task_md' : 'task_record';
  return {
    path: proposal.path,
    summary: proposal.reason,
    content: proposal.contentTemplate,
    surface,
    surfaceLabel: taskFileProposalSurfaceLabel(surface),
    taskMemoryProposal: proposal,
  };
}

function isDecompositionMemoryProposal(proposal: TaskFileWriteProposal): boolean {
  if (!proposal.taskMemoryProposal) return false;
  return /拆解|子任务|subtask|decomposition|project structure/i.test([
    proposal.path,
    proposal.summary,
    proposal.content,
  ].join('\n'));
}

function taskFileProposalTitle(proposal: TaskFileWriteProposal): string {
  if (proposal.intentSource === 'write_intent' && proposal.surface === 'task_record') return '任务记录写入提案';
  if (!proposal.taskMemoryProposal) return '任务文件写入提案';
  return isDecompositionMemoryProposal(proposal) ? '拆解记录写入提案' : '任务记忆写入提案';
}

function taskFileProposalStatusCopy(proposal: TaskFileWriteProposal): string {
  if (proposal.intentSource === 'write_intent') return '来自 Agent 结构化意图，确认后写入';
  if (!proposal.taskMemoryProposal) return '新建文件，不覆盖现有文件';
  if (isDecompositionMemoryProposal(proposal)) return '确认后保存记录，不会直接创建子任务';
  return proposal.taskMemoryProposal.operation === 'update'
    ? '确认后更新现有任务记忆'
    : '确认后创建任务记忆';
}

function taskFileProposalConfirmLabel(proposal: TaskFileWriteProposal): string {
  if (proposal.intentSource === 'write_intent' && proposal.surface === 'task_record') return '确认写入记录';
  if (!proposal.taskMemoryProposal) return '确认写入文件';
  return isDecompositionMemoryProposal(proposal) ? '保存拆解记录' : '确认补写记忆';
}

function isExplicitAgentApiExecutionRequest(text: string): boolean {
  return /启动(?:任务)?\s*(?:agent\s*)?run|开始执行|执行(?:这个|当前)?任务|跑(?:一下)?(?:任务|agent)|agent\s*run|run\s*(?:this|task|agent)/i.test(text);
}

function formatAgentCliRunMessage(params: {
  output: string;
  childTaskConversation?: boolean;
  decompositionDraftCreated?: boolean;
  runId: string;
  runtimeLabel: string;
  steps?: RunStepRecord[];
  statusText: string;
}): string {
  if (params.childTaskConversation) {
    const activity = summarizeAgentCliActivityForChat(params.steps);
    return [
      activity,
      formatChildTaskConversationRunMessage(params.output),
    ].filter(Boolean).join('\n');
  }
  if (params.decompositionDraftCreated) {
    return '已生成子任务草案。你确认后，我会把它们创建到当前项目下。';
  }
  if (params.statusText !== '已完成') {
    const reason = summarizeAgentCliOutputForChat(params.output, { maxLines: 2 });
    return reason ? `任务运行没有完成：${reason}` : '任务运行没有完成，详情已记录到任务动态。';
  }
  const summary = summarizeAgentCliOutputForChat(params.output);
  const activity = summarizeAgentCliActivityForChat(params.steps);
  return [
    '已完成，结果已记录到任务动态。',
    activity,
    summary,
  ].filter(Boolean).join('\n');
}

function summarizeAgentCliActivityForChat(steps: RunStepRecord[] | undefined): string | null {
  if (!steps?.length) return null;
  const orderedSteps = [...steps].sort((left, right) => left.index - right.index);
  const lines: string[] = [];
  const webPreparationStep = orderedSteps.find((step) => /Agent CLI 联网调研准备/i.test(step.title));
  if (webPreparationStep) {
    const status = readStepKeyValue(webPreparationStep.output, 'status');
    const sources = readStepKeyValue(webPreparationStep.output, 'sources');
    const query = readStepKeyValue(webPreparationStep.output, 'query');
    const sourceContextIds = readStepKeyValue(webPreparationStep.output, 'source_context_ids');
    const batchId = readStepKeyValue(webPreparationStep.output, 'batch_id');
    const reason = readStepKeyValue(webPreparationStep.output, 'reason');
    if (status === 'captured') {
      const partial = reason ? /\bcaptured\s+\d+\s*\/\s*\d+\b/i.test(reason) : false;
      const queryLabel = query ? `；查询：${truncateAgentCliChatLine(query, 48)}` : '';
      const evidenceLabel = sourceContextIds
        ? `；证据：${truncateAgentCliChatLine(sourceContextIds, 72)}`
        : batchId
          ? `；批次：${truncateAgentCliChatLine(batchId, 72)}`
          : '';
      lines.push(`联网调研：已保存 ${sources ?? '若干'} 个来源到来源上下文${partial ? '，部分来源保存失败' : ''}${queryLabel}${evidenceLabel}。`);
    } else if (status === 'skipped' && reason) {
      const saveFailed = /none could be saved|could not be saved|source context.*unavailable/i.test(reason);
      lines.push(
        saveFailed
          ? `联网调研：已获取来源但未能保存，${truncateAgentCliChatLine(reason, 72)}`
          : `联网调研：未保存来源，${truncateAgentCliChatLine(reason, 72)}`,
      );
    }
  }

  const nativeWorkspaceWriteStep = orderedSteps.find((step) => (
    !/Agent CLI 联网调研准备/i.test(step.title)
    && readStepKeyValue(step.output, 'capability')?.toLowerCase() === 'workspace_write'
  ));
  if (nativeWorkspaceWriteStep) {
    const title = nativeWorkspaceWriteStep.title
      .replace(/^(Codex CLI|Claude Code)\s*/i, '')
      .replace(/^原生事件[:：]\s*/i, '')
      .trim();
    const detail = compactStepDetailForChat(nativeWorkspaceWriteStep.output);
    lines.push(`原生 CLI 工作区写入候选：${truncateAgentCliChatLine(title || detail || '已记录', 56)}；不会直接写入工作区，需要 patch artifact、ready task_file Write Intent、ready patch artifact Write Intent 或 patch-review/promotion evidence 审查。`);
  }

  const nativeWebStep = orderedSteps.find((step) => (
    !/Agent CLI 联网调研准备/i.test(step.title)
    && step.id !== nativeWorkspaceWriteStep?.id
    && isNativeWebResearchStep(step)
  ));
  if (nativeWebStep) {
    const title = nativeWebStep.title
      .replace(/^(Codex CLI|Claude Code)\s*/i, '')
      .replace(/^原生事件[:：]\s*/i, '')
      .trim();
    const detail = compactStepDetailForChat(nativeWebStep.output);
    lines.push(`原生 CLI 联网动作：${truncateAgentCliChatLine(title || detail || '已记录', 56)}。`);
  }

  const nativeLocalStep = orderedSteps.find((step) => (
    !/Agent CLI 联网调研准备/i.test(step.title)
    && step.id !== nativeWorkspaceWriteStep?.id
    && !isNativeWebResearchStep(step)
    && /capability=(workspace_read|shell_command)|工作区|命令执行|shell|command_execution|bash|terminal/i.test(`${step.title}\n${step.output ?? ''}`)
  ));
  if (nativeLocalStep) {
    const title = nativeLocalStep.title
      .replace(/^(Codex CLI|Claude Code)\s*/i, '')
      .replace(/^原生事件[:：]\s*/i, '')
      .trim();
    const detail = compactStepDetailForChat(nativeLocalStep.output);
    lines.push(`原生 CLI 本地动作：${truncateAgentCliChatLine(title || detail || '已记录', 56)}。`);
  }

  return lines.slice(0, 2).join('\n') || null;
}

function isNativeWebResearchStep(step: RunStepRecord): boolean {
  const output = step.output ?? '';
  const haystack = `${step.title}\n${output}`;
  const capability = readStepKeyValue(output, 'capability')?.toLowerCase();
  if (capability === 'web_search') return true;
  if (/capability=(workspace_read|workspace_write|shell_command)/i.test(output)) return false;
  if (/workspace[._-]search|workspace[._-]read|ripgrep|\brg\b|\bgrep\b|\bls\b|\bcat\b|\bsed\b/i.test(haystack)) {
    return false;
  }
  return /web[_\s.-]?search|websearch|browse|联网|网络检索|https?:\/\//i.test(haystack);
}

function readStepKeyValue(output: string | null, key: string): string | null {
  if (!output) return null;
  const pattern = new RegExp(`^${key}=([^\\n]*)`, 'im');
  const match = output.match(pattern);
  return match?.[1]?.trim() || null;
}

function compactStepDetailForChat(output: string | null): string | null {
  const firstLine = output
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => Boolean(line) && !/^(capability|provider_event)=/.test(line));
  return firstLine || null;
}

function truncateAgentCliChatLine(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function summarizeAgentCliOutputForChat(output: string, options: { maxLines?: number } = {}): string | null {
  const normalized = output
    .replace(/```(?:json)?\s*[\s\S]*?TASKPLANE_DECOMPOSITION[\s\S]*?```/gi, '')
    .replace(/\b(Codex CLI|Claude Code|Agent API|API Runtime)\b/gi, '')
    .replace(/\brun\s+已(完成|记录|启动|接收)/gi, '')
    .trim();
  if (!normalized) return null;
  const lines = normalized
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(结果摘要|Key Findings|Recommended Next Step|Verification Checks)[:：]?$/i.test(line))
    .filter((line) => !/完整输出已进入任务动态|任务记忆|写入提案|Run:/i.test(line))
    .filter((line) => !/^[-*]?\s*`?(pwd|ls|sed)\b/i.test(line))
    .filter((line) => !/^run[:：]/i.test(line));
  const important = lines.filter((line) => (
    /下一步|验证|风险|确认|结论|建议/i.test(line)
    || /^[-*]\s+/.test(line)
  ));
  const selected = (important.length ? important : lines).slice(0, options.maxLines ?? 4);
  if (!selected.length) return null;
  return selected
    .map((line) => line.replace(/^#{1,3}\s+/, '').replace(/^[-*]\s+/, '').replace(/\*\*/g, ''))
    .map((line) => line.length > 96 ? `${line.slice(0, 93)}...` : line)
    .join('\n');
}

function formatChildTaskConversationRunMessage(output: string): string {
  const normalized = output
    .replace(/```(?:json)?\s*[\s\S]*?TASKPLANE_DECOMPOSITION[\s\S]*?```/gi, '')
    .replace(/\b(Codex CLI|Claude Code|Agent API|API Runtime)\b/gi, '')
    .replace(/^(结果摘要|Key Findings|Recommended Next Step|Verification Checks)[:：]?$/gim, '')
    .replace(/完整输出已进入任务动态|生成了待确认的任务记录提案|任务记忆写入提案/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  const lines = normalized
    .split('\n')
    .map((line) => line
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+[.)、]\s+/, '')
      .replace(/^(理解|明白|收到)[：:，,]\s*/, '')
      .trim())
    .filter(Boolean)
    .filter((line) => !/^run[:：]/i.test(line))
    .filter((line) => !/任务动态|任务记忆|stdout|stderr|sandbox/i.test(line));
  const cleaned = lines.join('\n').trim();
  if (cleaned) {
    return cleaned;
  }
  const sentences = normalized
    .split(/(?<=[。！？?])\s+|\n+/)
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)、]\s+/, '').trim())
    .filter(Boolean)
    .filter((line) => !/^run[:：]/i.test(line))
    .filter((line) => !/任务动态|任务记忆|stdout|stderr|sandbox/i.test(line));
  const question = sentences.find((line) => /[？?]/.test(line) && line.length <= 90)
    ?? sentences.find((line) => /[？?]/.test(line));
  if (question) {
    const questionIndex = sentences.indexOf(question);
    const compactQuestion = question
      .replace(/例如[:：].*$/i, '')
      .replace(/^请先(?:回答)?(?:一个)?问题[:：]\s*/, '')
      .trim();
    const intro = sentences.slice(0, questionIndex).find((line) => (
      line.length <= 64
      && !/[？?]/.test(line)
      && !/请先|请确认以下|下面|如下|列表|关键/.test(line)
    ));
    return [intro, compactQuestion]
      .filter(Boolean)
      .join('\n');
  }
  const concise = sentences.find((line) => line.length <= 88);
  return concise
    ? `${concise}\n你先说说最想确认的一个点就好。`
    : '这个子任务先从目标说起。你希望它最终解决什么问题？';
}

function parseAgentCliDecompositionDraft(output: string, runId: string): TaskDecompositionDraft | null {
  if (!/TASKPLANE_DECOMPOSITION|TASKPLANE_WRITE_INTENT|subtask\.propose|子任务草案|拆解/i.test(output)) return null;
  const jsonCandidates = [
    ...Array.from(output.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)).map((match) => match[1] ?? ''),
    output,
  ];
  for (const candidate of jsonCandidates) {
    const parsed = parseDecompositionJson(candidate, runId);
    if (parsed) return parsed;
  }
  const fallback = parseDecompositionBullets(output, runId);
  return fallback && fallback.subtasks.length >= 2 ? fallback : null;
}

function parseAgentCliTaskRecordWriteIntent(params: {
  output: string;
  runId: string;
  taskId: string;
  taskTitle: string;
}): TaskFileWriteProposal | null {
  return buildTaskplaneWritebackProposalsFromText(params).taskRecord;
}

function parseAgentCliTaskFileWriteIntent(params: {
  output: string;
  runId: string;
  taskId: string;
}): TaskFileWriteProposal | null {
  return buildTaskplaneWritebackProposalsFromText({
    ...params,
    taskTitle: '',
  }).taskFile;
}

function parseAgentCliSourceContextWriteIntent(params: {
  output: string;
  runId: string;
  taskId: string;
}): SourceContextWriteProposal | null {
  return buildTaskplaneWritebackProposalsFromText({
    ...params,
    taskTitle: '',
  }).sourceContext;
}

function parseAgentCliArtifactWriteIntent(params: {
  output: string;
  runId: string;
  taskId: string;
}): ArtifactWriteProposal | null {
  return buildTaskplaneWritebackProposalsFromText({
    ...params,
    taskTitle: '',
  }).artifact;
}

function parseAgentCliStructuredWritebackIntent(params: {
  output: string;
  runId: string;
  taskId: string;
}): StructuredWritebackProposal | null {
  return buildTaskplaneWritebackProposalsFromText({
    ...params,
    taskTitle: '',
  }).structured;
}

function isChildTaskAdvancementText(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return /推进子任务|正在推进子任务|当前子任务|确认这个子任务|current child task|advance.{0,16}child task/i.test(normalized);
}

function isExplicitDecompositionRequest(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return /拆解|拆细|分解|拆成|子任务|前后端|前端|后端|模块|里程碑|break\s*down|split/i.test(normalized);
}

function buildChildTaskConversationPrompt(params: {
  childTaskConversationTurnCount?: number;
  parentTaskTitle?: string | null;
  taskSummary?: string | null;
  taskTitle: string | null;
  userText: string;
}): string {
  const turnCount = params.childTaskConversationTurnCount ?? 1;
  return [
    `正在推进子任务「${params.taskTitle ?? '当前子任务'}」。`,
    params.parentTaskTitle ? `父任务：「${params.parentTaskTitle}」。` : null,
    params.taskSummary ? `子任务摘要：${params.taskSummary}` : null,
    `用户刚补充：${params.userText}`,
    '请基于这次补充继续推进这个子任务，不要重新拆解父任务。',
    turnCount <= 1
      ? '如果用户只是说“推进/开始/一起推进”，请用一句自然的话请用户描述想法或预期；如果用户已经给出具体想法，请把它转成可确认的首版边界。'
      : '用户已经补充过方向时，不要继续细碎追问分类或偏好；请先收束成一个可确认的任务边界，并主动给出下一步。',
    '当用户已给出主题/产品、目标用户、内容形态或使用场景中的关键三项时，视为足够推进；不要再问“个人看还是给别人看”“目录型还是学习路径型”“更偏哪类展示”这类二级取舍。',
    '回复要推动任务线：优先给出“当前可暂定为…”这类可确认判断；信息已足够时给出首版目标、范围、非目标、资料调研或执行下一步，而不是继续追问。',
    '只有当缺口会阻止下一步行动、影响关键风险或改变交付边界时才提问；普通产品取舍先作为可调整默认项写进方案，不要提前变成用户选择题。',
    '如果是网站/文档/教程类任务，默认先产出首版定位、页面/内容范围、非目标和下一步调研或搭建动作；不要停在连续澄清。',
    '不要用“理解：”“明白：”“收到：”作固定开头。语气自然、简短；只有确实需要区分多个澄清点时才用列表。',
  ].filter((line): line is string => Boolean(line)).join('\n');
}

function parseDecompositionJson(value: string, runId: string): TaskDecompositionDraft | null {
  const intent = extractTaskplaneWriteIntentsFromText({
    evidenceRunId: runId,
    taskId: 'current',
    text: value,
  }).find((candidate) => candidate.type === 'subtask.propose');
  if (!intent || intent.type !== 'subtask.propose') return null;
  const validation = validateTaskplaneWriteIntent(intent);
  if (validation.status !== 'ready') return null;
  return {
    nextStep: intent.nextStep?.trim() || '确认后创建这些子任务。',
    review: intent.review?.trim() || '已按大块阶段拆解，确认后可创建子任务。',
    runId,
    subtasks: intent.subtasks,
  };
}

function parseDecompositionBullets(output: string, runId: string): TaskDecompositionDraft | null {
  const lines = output.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim());
  const subtasks = lines
    .map((line) => line.match(/^(?:[-*]|\d+[.)、])\s*(.+?)[:：-]\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      acceptanceCriteria: '确认该环节交付物满足父任务目标。',
      dependency: null,
      summary: truncateMemoryLine(match[2] ?? '', 160),
      title: truncateMemoryLine((match[1] ?? '').replace(/^子任务\s*/i, ''), 48),
    }))
    .filter((item) => item.title && item.summary)
    .slice(0, 6);
  if (subtasks.length < 2) return null;
  return {
    nextStep: '确认后创建这些子任务。',
    review: '从 Agent CLI 输出中提取了拆解草案，请确认标题和边界。',
    runId,
    subtasks,
  };
}

function normalizeDraftText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text || null;
}

function taskMemoryProposalPreviewItems(content: string): Array<{ label: string; value: string }> {
  const sections = markdownSections(content);
  const candidates: Array<[string, string | undefined]> = [
    ['关键判断', sections.get('summary')],
    ['下一步', sections.get('next') ?? sections.get('next step')],
    ['风险', sections.get('risks')],
    ['验证', sections.get('verification')],
    ['来源', sections.get('links') ?? sections.get('confirmed')],
  ];
  return candidates.flatMap(([label, value]) => {
    const preview = previewMarkdownSection(value);
    return preview ? [{ label, value: preview }] : [];
  }).slice(0, 5);
}

function markdownSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  let current: string | null = null;
  let lines: string[] = [];

  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/)?.[1]?.trim().toLowerCase() ?? null;
    if (heading) {
      if (current) sections.set(current, lines.join('\n').trim());
      current = heading;
      lines = [];
      continue;
    }
    if (current) lines.push(line);
  }

  if (current) sections.set(current, lines.join('\n').trim());
  return sections;
}

function previewMarkdownSection(value: string | undefined): string | null {
  const lines = (value ?? '')
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const preview = lines.slice(0, 3).join(' · ');
  return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
}

function buildMinimalTaskRecord(taskName: string, importantFilePath: string): string {
  return [
    '# Task',
    '',
    '## Goal',
    taskName,
    '',
    '## Current Progress',
    'No summary recorded yet.',
    '',
    '## Key Context',
    'No key files or sources linked yet.',
    '',
    '## Decisions',
    'No durable decisions recorded in this task file yet.',
    '',
    '## Constraints',
    'No active constraint recorded.',
    '',
    '## Open Questions',
    'No open questions recorded yet.',
    '',
    '## Next Step',
    'Clarify the next step.',
    '',
    '## Important Files',
    `- ${importantFilePath}`,
    '',
    '## Recent Records',
    'Task Records/ is ready for durable handoffs and milestone notes.',
    '',
  ].join('\n');
}

function appendImportantFileToTaskRecord(content: string, filePath: string): string {
  if (content.includes(filePath)) return content;
  const marker = '## Important Files';
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim() === marker);
  if (start === -1) {
    return [
      content.trimEnd(),
      '',
      marker,
      `- ${filePath}`,
      '',
    ].join('\n');
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]?.trim() ?? '')) {
      end = index;
      break;
    }
  }
  const before = lines.slice(0, end);
  const after = lines.slice(end);
  const existingSection = lines.slice(start + 1, end).map((line) => line.trim()).filter(Boolean);
  const placeholders = new Set(['No important files linked yet.', '暂无']);
  const cleanedBefore = placeholders.has(existingSection.join('\n'))
    ? lines.slice(0, start + 1)
    : before;
  return [
    ...cleanedBefore,
    `- ${filePath}`,
    ...after,
  ].join('\n');
}

async function referenceTaskFileFromTaskRecord(params: {
  taskId: string;
  taskName: string;
  filePath: string;
}): Promise<void> {
  if (!window.api?.listTaskFiles || !window.api.createTaskFile || !window.api.updateTaskFile) return;
  if (!guardDurablePanelAction({ taskId: params.taskId, confirmed: true }).allowed) return;
  const files = await window.api.listTaskFiles(params.taskId).catch(() => []);
  const taskRecord = files.find((file) => isTaskMdPath(file.path));
  if (taskRecord) {
    const updateNeed = evaluateTaskMdUpdateNeed({
      hasTaskContext: true,
      existingTaskMdContent: taskRecord.content,
      importantFilePath: params.filePath,
      reasonHint: 'important_file',
    });
    if (!updateNeed.shouldUpdateTaskMd) return;
    const updated = await window.api.updateTaskFile({
      id: taskRecord.id,
      content: appendImportantFileToTaskRecord(taskRecord.content, params.filePath),
    }).catch(() => null);
    if (updated) {
      verifyDurablePanelActionCompleted({
        title: '更新任务说明引用',
        output: `已在 Task.md 引用 ${params.filePath}。`,
      });
    }
    return;
  }
  const createNeed = evaluateTaskMdUpdateNeed({
    hasTaskContext: true,
    importantFilePath: params.filePath,
    reasonHint: 'important_file',
  });
  if (!createNeed.shouldUpdateTaskMd) return;
  const created = await window.api.createTaskFile({
    taskId: params.taskId,
    name: 'Task.md',
    path: 'Task.md',
    kind: 'file',
    content: buildMinimalTaskRecord(params.taskName, params.filePath),
  }).catch(() => null);
  if (created) {
    verifyDurablePanelActionCompleted({
      title: '创建任务说明引用',
      output: `已创建 Task.md 并引用 ${params.filePath}。`,
    });
  }
}

async function writeTaskRecordFile(params: {
  taskId: string;
  title: string;
  content: string;
  reasonHint: TaskRecordWorthinessReason;
}): Promise<boolean> {
  if (!window.api?.createTaskFile) return false;
  if (!guardDurablePanelAction({ taskId: params.taskId, confirmed: true }).allowed) return false;
  const worthiness = evaluateTaskRecordWorthiness({
    text: params.content,
    hasTaskContext: true,
    reasonHint: params.reasonHint,
  });
  if (!worthiness.shouldCreateTaskRecord) return false;
  const today = new Date().toISOString().slice(0, 10);
  const name = `${today}-${params.title}.md`;
  const created = await window.api.createTaskFile({
    taskId: params.taskId,
    name,
    path: `Task Records/${name}`,
    kind: 'file',
    content: params.content,
  }).then(() => true).catch(() => false);
  if (created) {
    verifyDurablePanelActionCompleted({
      title: '写入任务记录',
      output: `已写入 Task Records/${name}。`,
    });
  }
  return created;
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

interface RightPanelProps {
  taskId: string | null;
  taskTitleHint?: string | null;
  draftPrompt?: string | null;
  autoSendDraftPrompt?: boolean;
  selectedFile?: {
    path: string;
    kind: string;
    dirty?: boolean;
    contentPreview: string | null;
  } | null;
  hidden?: boolean;
  onTaskCaptured?: (taskId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onClose: (hasSession: boolean) => void;
  onClearTask: () => void;
}

export function RightPanel({
  taskId,
  taskTitleHint = null,
  draftPrompt = null,
  autoSendDraftPrompt = false,
  selectedFile = null,
  hidden = false,
  onTaskCaptured,
  onOpenTask,
  onClose,
  onClearTask,
}: RightPanelProps) {
  const [sessionState, dispatchSession] = useReducer(panelSessionReducer, taskId, createPanelSessionState);
  const [titleCache, setTitleCache] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [fullScreen, setFullScreen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<AiRuntimeMode>('codex');
  const [aiRuntimeStatusLoaded, setAiRuntimeStatusLoaded] = useState(false);
  const [activeAgentCliRun, setActiveAgentCliRun] = useState<ActiveAgentCliRunState | null>(null);
  const [activeTaskDetail, setActiveTaskDetail] = useState<TaskDetail | null>(null);
  const [agentCliAvailability, setAgentCliAvailability] = useState<Record<AgentCliRuntimeId, boolean>>({
    claude: false,
    codex: false,
  });
  const [agentCliCapabilities, setAgentCliCapabilities] = useState<Record<AgentCliRuntimeId, AgentRuntimeAdapterCapabilities | null>>({
    claude: null,
    codex: null,
  });
  const [compressionThreshold, setCompressionThreshold] = useState<number>(
    CONTEXT_COMPRESSION_THRESHOLD.default,
  );
  const [capturingTask, setCapturingTask] = useState(false);
  const [confirmingCapturedTask, setConfirmingCapturedTask] = useState(false);
  const [abandoningCapturedTask, setAbandoningCapturedTask] = useState(false);
  const [savingPhaseCloseout, setSavingPhaseCloseout] = useState(false);
  const [savingTaskFileProposal, setSavingTaskFileProposal] = useState(false);
  const [creatingDecompositionChildren, setCreatingDecompositionChildren] = useState(false);
  const [savingSourceContextProposal, setSavingSourceContextProposal] = useState(false);
  const [savingStructuredWritebackProposal, setSavingStructuredWritebackProposal] = useState(false);
  const [savingArtifactProposal, setSavingArtifactProposal] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [agentCliLaunchNotice, setAgentCliLaunchNotice] = useState<string | null>(null);
  const [taskDecompositionDraft, setTaskDecompositionDraft] = useState<TaskDecompositionDraft | null>(null);
  const [recentDecompositionConfirmedTaskId, setRecentDecompositionConfirmedTaskId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAppliedDraftPromptRef = useRef<string | null>(null);
  const lastAutoSentDraftPromptRef = useRef<string | null>(null);
  const pendingMemoryGuidanceLookupRef = useRef<string | null>(null);
  const {
    abandonConfirmOpen,
    activeTaskId,
    input,
    pendingCapturedTaskId,
    pendingSwitch,
    phaseCloseoutNotice,
    phaseCloseoutSaved,
    sessionRefreshDismissed,
    artifactProposal,
    sourceContextProposal,
    structuredWritebackProposal,
    taskFileProposal,
  } = sessionState;
  const activeTaskIdRef = useRef(activeTaskId);
  const activeAgentCliRunRef = useRef(activeAgentCliRun);
  const refreshAiRuntimeStatus = useCallback(() => {
    const request = window.api?.getAiConfigStatus();
    if (!request) {
      setAiRuntimeStatusLoaded(true);
      return;
    }
    setAiRuntimeStatusLoaded(false);
    request.then((status) => {
      setCompressionThreshold(
        status.featureFlags.contextCompressionThreshold ?? CONTEXT_COMPRESSION_THRESHOLD.default,
      );
      setRuntimeMode(status.runtimeMode ?? 'codex');
      const nextAvailability = AGENT_CLI_PANEL_RUNTIMES.reduce<Record<AgentCliRuntimeId, boolean>>((acc, runtimeId) => {
        acc[runtimeId] = Boolean(status.agentCliRuntimeStatus?.runtimes.some((runtime) => (
          runtime.id === runtimeId
          && runtime.installed
          && runtime.authState === 'ready'
          && runtime.executionSupport === 'manual_run'
        )));
        return acc;
      }, { claude: false, codex: false });
      const nextCapabilities = AGENT_CLI_PANEL_RUNTIMES.reduce<Record<AgentCliRuntimeId, AgentRuntimeAdapterCapabilities | null>>((acc, runtimeId) => {
        const runtime = status.agentCliRuntimeStatus?.runtimes.find((item) => item.id === runtimeId);
        acc[runtimeId] = runtime?.capabilities
          ?? buildDefaultAgentCliRuntimeCapabilities(runtimeId, AGENT_CLI_PANEL_RUNTIME_LABELS[runtimeId], runtime?.version ?? null);
        return acc;
      }, { claude: null, codex: null });
      setAgentCliAvailability(nextAvailability);
      setAgentCliCapabilities(nextCapabilities);
    }).finally(() => {
      setAiRuntimeStatusLoaded(true);
    });
  }, []);

  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  useEffect(() => {
    activeAgentCliRunRef.current = activeAgentCliRun;
  }, [activeAgentCliRun]);

  useEffect(() => {
    const runId = activeAgentCliRun?.runId;
    if (!runId || !window.api?.getRunDetail) return undefined;

    let cancelled = false;
    const refreshProgress = async () => {
      const detail = await window.api!.getRunDetail!(runId).catch(() => null);
      if (cancelled) return;
      const progress = deriveAgentCliProgress(detail);
      setActiveAgentCliRun((current) => (
        current?.runId === runId
          ? { ...current, progress }
          : current
      ));
    };

    void refreshProgress();
    const timer = window.setInterval(() => {
      void refreshProgress();
    }, 1400);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeAgentCliRun?.runId]);

  function patchSession(patch: PanelSessionPatch) {
    dispatchSession({ type: 'patch', patch });
  }

  function setSessionInput(value: string) {
    patchSession({ input: value });
  }

  function updateTaskFileProposal(
    updater: TaskFileWriteProposal | null | ((current: TaskFileWriteProposal | null) => TaskFileWriteProposal | null),
  ) {
    patchSession({
      taskFileProposal: typeof updater === 'function'
        ? updater(taskFileProposal)
        : updater,
    });
  }

  function updateSourceContextProposal(
    updater: SourceContextWriteProposal | null | ((current: SourceContextWriteProposal | null) => SourceContextWriteProposal | null),
  ) {
    patchSession({
      sourceContextProposal: typeof updater === 'function'
        ? updater(sourceContextProposal)
        : updater,
    });
  }

  function updateArtifactProposal(
    updater: ArtifactWriteProposal | null | ((current: ArtifactWriteProposal | null) => ArtifactWriteProposal | null),
  ) {
    patchSession({
      artifactProposal: typeof updater === 'function'
        ? updater(artifactProposal)
        : updater,
    });
  }

  function updateStructuredWritebackProposal(
    updater: StructuredWritebackProposal | null | ((current: StructuredWritebackProposal | null) => StructuredWritebackProposal | null),
  ) {
    patchSession({
      structuredWritebackProposal: typeof updater === 'function'
        ? updater(structuredWritebackProposal)
        : updater,
    });
  }

  // Fetch task title and seed welcome message when panel first opens with a task
  useEffect(() => {
    if (!taskId) return;
    if (taskTitleHint) {
      setTitleCache((prev) => ({ ...prev, [taskId]: taskTitleHint }));
      setMessages([makeWelcomeMessage(taskTitleHint)]);
      return;
    }
    if (titleCache[taskId]) {
      setMessages([makeWelcomeMessage(titleCache[taskId])]);
      return;
    }
    window.api?.getTaskDetail(taskId).then((d) => {
      if (!d) return;
      setTitleCache((prev) => ({ ...prev, [taskId]: d.title }));
      setMessages([makeWelcomeMessage(d.title)]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshAiRuntimeStatus();
  }, [refreshAiRuntimeStatus]);

  useEffect(() => {
    if (!hidden) refreshAiRuntimeStatus();
  }, [hidden, refreshAiRuntimeStatus]);

  useEffect(() => {
    if (!activeTaskId || !window.api?.getTaskDetail) {
      setActiveTaskDetail(null);
      return;
    }
    let cancelled = false;
    void window.api.getTaskDetail(activeTaskId).then((detail) => {
      if (cancelled) return;
      setActiveTaskDetail(detail);
      if (detail) {
        setTitleCache((prev) => ({ ...prev, [detail.id]: detail.title }));
      }
    }).catch(() => {
      if (!cancelled) setActiveTaskDetail(null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTaskId]);

  useEffect(() => {
    if (!window.api?.subscribeToEvents) return undefined;
    return window.api.subscribeToEvents((event) => {
      if (event.type === 'settings.changed' || event.type === 'run.changed') {
        refreshAiRuntimeStatus();
      }
      const current = activeAgentCliRunRef.current;
      if (event.type !== 'run.changed' || !current || event.entityId !== current.runId) return;
      void window.api.getRunDetail(current.runId).then((detail) => {
        if (!detail || detail.status === 'running' || detail.status === 'pending') return;
        const statusText = detail.status === 'completed'
          ? '已完成'
          : detail.status === 'failed'
            ? '失败'
            : detail.status;
        const output = detail.output?.trim() || detail.failureReason || '终态已记录。';
        const suppressMemoryProposal = Boolean(current.suppressMemoryProposal);
        const decompositionDraft = current.allowDecompositionDraft
          ? parseAgentCliDecompositionDraft(output, detail.id)
          : null;
        if (decompositionDraft) {
          setTaskDecompositionDraft(decompositionDraft);
        } else {
          const taskTitle = titleCache[current.taskId] ?? activeTaskDetail?.title ?? current.taskId;
          const taskRecordProposal = parseAgentCliTaskRecordWriteIntent({
            output,
            runId: detail.id,
            taskId: current.taskId,
            taskTitle,
          });
          const taskFileProposal = taskRecordProposal ?? parseAgentCliTaskFileWriteIntent({
            output,
            runId: detail.id,
            taskId: current.taskId,
          });
          if (taskFileProposal) {
            updateTaskFileProposal((existing) => existing ?? taskFileProposal);
          }
          const sourceProposal = parseAgentCliSourceContextWriteIntent({
            output,
            runId: detail.id,
            taskId: current.taskId,
          });
          if (sourceProposal) {
            updateSourceContextProposal((existing) => existing ?? sourceProposal);
          }
          const artifactProposal = parseAgentCliArtifactWriteIntent({
            output,
            runId: detail.id,
            taskId: current.taskId,
          });
          if (artifactProposal) {
            updateArtifactProposal((existing) => existing ?? artifactProposal);
          }
          const structuredProposal = parseAgentCliStructuredWritebackIntent({
            output,
            runId: detail.id,
            taskId: current.taskId,
          });
          if (structuredProposal) {
            updateStructuredWritebackProposal((existing) => existing ?? structuredProposal);
          }
        }
        appendSysMsg(formatAgentCliRunMessage({
          childTaskConversation: suppressMemoryProposal,
          decompositionDraftCreated: Boolean(decompositionDraft),
          output,
          runId: detail.id,
          runtimeLabel: current.runtimeLabel,
          steps: detail.steps,
          statusText,
        }));
        setActiveAgentCliRun((value) => value?.runId === detail.id ? null : value);
      }).catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    if (!autoSendDraftPrompt || !draftPrompt || taskId !== activeTaskId) return;
    if (!aiRuntimeStatusLoaded) return;
    const key = `${taskId ?? 'global'}:${draftPrompt}`;
    if (lastAutoSentDraftPromptRef.current === key) return;
    lastAutoSentDraftPromptRef.current = key;
    void send(draftPrompt, { displayUserMessage: false });
  }, [activeTaskId, aiRuntimeStatusLoaded, autoSendDraftPrompt, draftPrompt, taskId]);

  useEffect(() => {
    if (autoSendDraftPrompt || !draftPrompt || taskId !== activeTaskId) return;
    if (input.trim()) return;
    const key = `${taskId ?? 'global'}:${draftPrompt}`;
    if (lastAppliedDraftPromptRef.current === key) return;
    lastAppliedDraftPromptRef.current = key;
    setSessionInput(draftPrompt);
    requestAnimationFrame(() => autoResize());
  }, [activeTaskId, autoSendDraftPrompt, draftPrompt, input, taskId]);

  // When taskId changes from outside (e.g. clicking a different task)
  useEffect(() => {
    if (taskId === activeTaskId) {
      if (pendingSwitch) patchSession({ pendingSwitch: null });
      return;
    }
    if (taskId === null) {
      dispatchSession({ type: 'clear_task_context' });
      return;
    }
    // Fetch title if not cached, then propose soft context switch
    const fetchAndPropose = async () => {
      let title = taskTitleHint ?? titleCache[taskId];
      if (taskTitleHint) {
        setTitleCache((prev) => (
          prev[taskId] === taskTitleHint ? prev : { ...prev, [taskId]: taskTitleHint }
        ));
      }
      if (!title && window.api) {
        const d = await window.api.getTaskDetail(taskId).catch(() => null);
      if (d) {
          title = d.title;
          setTitleCache((prev) => ({ ...prev, [taskId]: title }));
        }
      }
      if (title && (pendingSwitch?.taskId !== taskId || pendingSwitch.taskTitle !== title)) {
        patchSession({ pendingSwitch: { taskId, taskTitle: title } });
      }
    };
    void fetchAndPropose();
  }, [activeTaskId, pendingSwitch, taskId, taskTitleHint, titleCache]);

  function applyTaskContext(nextTaskId: string, nextTitle: string, options: { addMessage?: boolean } = {}) {
    setTitleCache((current) => ({ ...current, [nextTaskId]: nextTitle }));
    dispatchSession({ type: 'apply_task_context', taskId: nextTaskId });
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (options.addMessage !== false) {
      appendSysMsg(`已切换到任务：**${nextTitle}**`);
    }
  }

  async function confirmSwitch() {
    if (!pendingSwitch) return;
    const fromTaskId = activeTaskId;
    const targetSwitch = pendingSwitch;
    const { archived, hasSpecificSignal, userMessageCount } = await archiveTaskConversationIfNeeded();
    const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(fromTaskId);
    const handoff = evaluateRuntimeHandoff({
      intent: 'switch_task',
      fromTaskId,
      toTaskId: targetSwitch.taskId,
      messageCount: userMessageCount,
      hasSpecificHandoffSignal: hasSpecificSignal,
      archived,
      taskMemoryGuidance,
    });
    if (!handoff.canProceed) {
      handleMissingRefreshArchive(handoff.reason);
      return;
    }
    if (fromTaskId) {
      await recordPanelTimelineEvent(fromTaskId, 'panel.context_switch_accepted', {
        toTaskId: targetSwitch.taskId,
        toTaskTitle: targetSwitch.taskTitle,
        archived,
        messageCount: userMessageCount,
        reason: handoff.reason,
      });
    }
    applyTaskContext(targetSwitch.taskId, targetSwitch.taskTitle);
  }

  async function dismissSwitch() {
    const dismissedSwitch = pendingSwitch;
    if (activeTaskId && dismissedSwitch) {
      await recordPanelTimelineEvent(activeTaskId, 'panel.context_switch_dismissed', {
        toTaskId: dismissedSwitch.taskId,
        toTaskTitle: dismissedSwitch.taskTitle,
        reason: '用户选择保留当前上下文。',
      });
    }
    patchSession({ pendingSwitch: null });
    onClearTask();
  }

  function appendSysMsg(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'assistant', text, ts: now() },
    ]);
  }

  function isChildTaskContext(taskId: string | null): boolean {
    if (!taskId) return false;
    if (activeTaskDetail?.id === taskId && activeTaskDetail.parentTaskId) return true;
    return Boolean(getTaskAttributes(taskId)?.parentTaskId);
  }

  function canCreateDecompositionDraftForTask(taskId: string | null): boolean {
    if (!taskId) return false;
    if (activeTaskDetail?.id === taskId) {
      return activeTaskDetail.taskType === 'project';
    }
    const attrs = getTaskAttributes(taskId);
    return attrs?.type === 'project';
  }

  function parentTitleForActiveChild(): string | null {
    const parentTaskId = activeTaskDetail?.parentTaskId ?? activeAttrs?.parentTaskId ?? null;
    return parentTaskId ? titleCache[parentTaskId] ?? null : null;
  }

  async function archiveTaskConversationIfNeeded() {
    const taskName = title ?? (activeTaskId ? titleCache[activeTaskId] ?? activeTaskId : null);
    const userMessages = messages
      .filter((message) => message.role === 'user')
      .map((message) => message.text.trim())
      .filter(Boolean);
    const hasSpecificSignal = hasSpecificHandoffSignal(userMessages);
    let archived = false;
    if (activeTaskId && userMessages.length > 0) {
      archived = await preserveSessionRefreshMemory({
        taskId: activeTaskId,
        taskTitle: taskName ?? activeTaskId,
        messages,
      });
    }
    return {
      taskName,
      archived,
      hasSpecificSignal,
      userMessageCount: userMessages.length,
      recentFocus: userMessages.slice(-3).map((message) => truncateMemoryLine(message, 80)),
    };
  }

  async function getBlockingTaskMemoryGuidance(taskId: string | null): Promise<TaskMemoryGuidanceState | null> {
    if (!taskId || !window.api?.listRuns || !window.api?.getRunDetail) return null;
    if (isChildTaskContext(taskId)) return null;
    const runs = await window.api.listRuns().catch(() => []);
    const taskRuns = runs
      .filter((run) => run.taskId === taskId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (taskRuns.length === 0) return null;
    const details = await Promise.all(
      taskRuns.map((run) => window.api!.getRunDetail(run.id).catch(() => null)),
    );
    const proposal = details
      .flatMap((detail) => detail?.taskMemoryWriteProposals ?? [])
      .find(Boolean);
    if (proposal) {
      updateTaskFileProposal((current) => current ?? taskMemoryProposalToFileProposal(proposal));
    }
    return selectBlockingTaskMemoryGuidance(details.map((detail) => detail?.taskMemoryGuidance));
  }

  function clearTaskSessionAfterArchive(taskName: string | null) {
    setMessages(taskName
      ? [
          makeWelcomeMessage(taskName),
          makeTaskSessionRefreshedMessage(taskName),
        ]
      : []);
    setHistoryOpen(false);
    patchSession({
      input: '',
      sessionRefreshDismissed: false,
    });
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleMissingRefreshArchive(reason?: string | null) {
    if (activeTaskId) {
      appendSysMsg([
        '这次刷新前的保全信息还不够具体，暂不刷新当前任务会话。',
        reason && reason !== '任务会话缺少可恢复信号，暂不应刷新。' ? reason : null,
        '请先补充已确认结论、候选方案、未解决问题或下一步动作。',
      ].filter(Boolean).join(' '));
      patchSession({ sessionRefreshDismissed: true });
    }
  }

  async function refreshTaskSessionWithPreservation() {
    const advancement = evaluateTaskAdvancement({
      entrypoint: 'context_refresh',
      hasTaskContext: Boolean(activeTaskId),
      prompt: 'context_refresh',
      task: activeTaskDetail,
    });
    if (advancement.route === 'blocked') {
      appendSysMsg(advancement.userMessage);
      return;
    }
    const {
      taskName,
      archived,
      hasSpecificSignal,
      userMessageCount,
      recentFocus,
    } = await archiveTaskConversationIfNeeded();
    const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(activeTaskId);
    const handoff = evaluateRuntimeHandoff({
      intent: 'context_refresh',
      fromTaskId: activeTaskId,
      messageCount: userMessageCount,
      hasSpecificHandoffSignal: hasSpecificSignal,
      archived,
      taskMemoryGuidance,
    });
    if (!handoff.canProceed) {
      handleMissingRefreshArchive(handoff.reason);
      return;
    }
    const preview = buildRuntimeHandoffPreview(handoff, {
      archived,
      messageCount: userMessageCount,
      recentFocus,
    });
    if (!preview.canPreview) {
      handleMissingRefreshArchive(preview.detail);
      return;
    }
    clearTaskSessionAfterArchive(taskName);
  }

  async function startNewConversation() {
    const { archived, hasSpecificSignal, userMessageCount } = await archiveTaskConversationIfNeeded();
    const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(activeTaskId);
    const handoff = evaluateRuntimeHandoff({
      intent: 'start_global_conversation',
      fromTaskId: activeTaskId,
      messageCount: userMessageCount,
      hasSpecificHandoffSignal: hasSpecificSignal,
      archived,
      taskMemoryGuidance,
    });
    if (!handoff.canProceed) {
      handleMissingRefreshArchive(handoff.reason);
      return;
    }
    setMessages([]);
    setHistoryOpen(false);
    dispatchSession({ type: 'clear_task_context' });
    onClearTask();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  async function leaveTaskContext() {
    const { archived, hasSpecificSignal, userMessageCount } = await archiveTaskConversationIfNeeded();
    const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(activeTaskId);
    const handoff = evaluateRuntimeHandoff({
      intent: 'leave_task_context',
      fromTaskId: activeTaskId,
      messageCount: userMessageCount,
      hasSpecificHandoffSignal: hasSpecificSignal,
      archived,
      taskMemoryGuidance,
    });
    if (!handoff.canProceed) {
      handleMissingRefreshArchive(handoff.reason);
      return;
    }
    dispatchSession({ type: 'clear_task_context' });
    onClearTask();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function getLastUserMessage(): string | null {
    const last = [...messages].reverse().find((message) => message.role === 'user');
    return last?.text.trim() || null;
  }

  function deriveCapturedTaskTitle(text: string): string {
    const firstLine = text.split('\n').find((line) => line.trim())?.trim() ?? text.trim();
    return firstLine.length > 42 ? `${firstLine.slice(0, 42)}…` : firstLine;
  }

  function describeIntakeRedirect(evaluation: RuntimeIntakeEvaluation): string {
    switch (evaluation.outcome) {
      case 'create_task_record':
        return '这更像当前任务记录/交接信息，应写入任务记录，而不是新建任务。';
      case 'propose_task_file':
        return '这更像任务文件或输出写入请求，应先生成写入提案，而不是直接捕获为任务。';
      case 'surface_decision':
        return '这更像需要拍板的事项，先不要直接捕获为任务。可以进入 Decisions 确认，或继续补充判断上下文。';
      case 'propose_work_habit':
        return '这更像跨任务工作习惯，应走工作习惯确认，而不是创建任务。';
      case 'continue_discussion':
        return evaluation.reason;
      case 'create_task':
        return evaluation.reason;
    }
  }

  async function captureGlobalConversationAsTask() {
    const lastUserText = getLastUserMessage();
    if (!lastUserText || capturingTask || !window.api?.createTask) return;
    const intakeEvaluation = evaluateRuntimeIntake({
      text: lastUserText,
      hasTaskContext: Boolean(activeTaskId),
      source: activeTaskId ? 'task_chat' : 'global_chat',
    });
    if (intakeEvaluation.outcome !== 'create_task' || !intakeEvaluation.allowed) {
      appendSysMsg(describeIntakeRedirect(intakeEvaluation));
      return;
    }
    const candidateTitle = intakeEvaluation.title ?? deriveCapturedTaskTitle(lastUserText);
    const existingTasks = await (window.api?.listTasks?.().catch(() => []) ?? Promise.resolve([]));
    const captureGuard = guardTaskCapture({
      fromTaskId: activeTaskId,
      messageCount: 1,
      confirmationSatisfied: true,
      candidateTitle,
      candidateSummary: lastUserText,
      existingTasks,
    });
    if (!captureGuard.allowed) {
      appendSysMsg(`捕获任务已暂停：${captureGuard.reason}`);
      return;
    }
    const actionEvaluation = evaluateRuntimeAction({
      action: 'task_capture',
      fromTaskId: activeTaskId,
      messageCount: 1,
    });
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      hasRequiredContext: true,
      confirmationSatisfied: true,
    });
    if (!preStepVerification.canProceed) {
      appendSysMsg(`捕获任务已暂停：${preStepVerification.detail}`);
      return;
    }
    setCapturingTask(true);
    try {
      const typeProfile = inferTaskTypeProfile(candidateTitle);
      const created = await window.api.createTask({
        title: candidateTitle,
        summary: `${PANEL_CAPTURE_SUMMARY_PREFIX}${lastUserText}`,
        taskType: typeProfile.primaryType,
        taskFacets: typeProfile.facets,
      });
      verifyDurablePanelActionCompleted({
        title: '捕获任务',
        output: `已捕获任务：${created.title}`,
      });
      patchSession({
        abandonConfirmOpen: false,
        activeTaskId: created.id,
        pendingCapturedTaskId: created.id,
      });
      setTitleCache((prev) => ({ ...prev, [created.id]: created.title }));
      onTaskCaptured?.(created.id);
      appendSysMsg(`已捕获为任务：**${created.title}**（待确认）。确认后才进入 Tasks；如果需要调整类型、补齐上下文或拆解项目，可以直接在聊天里说明。`);
    } catch {
      appendSysMsg('捕获任务失败，请稍后再试。');
    } finally {
      setCapturingTask(false);
    }
  }

  async function confirmCapturedTask() {
    if (!activeTaskId || pendingCapturedTaskId !== activeTaskId || confirmingCapturedTask) return;
    const guard = guardTaskStateTransition({
      taskId: activeTaskId,
      nextState: 'planned',
      confirmationSatisfied: true,
    });
    if (!guard.allowed) {
      appendSysMsg(`确认任务已暂停：${guard.reason}`);
      return;
    }
    setConfirmingCapturedTask(true);
    try {
      await window.api?.transitionTask({ id: activeTaskId, nextState: 'planned' });
      patchSession({
        abandonConfirmOpen: false,
        pendingCapturedTaskId: null,
      });
      appendSysMsg('已确认加入 Tasks。你可以继续在这里规划，也可以回到任务列表推进。');
    } catch {
      appendSysMsg('确认任务失败，请稍后再试。');
    } finally {
      setConfirmingCapturedTask(false);
    }
  }

  async function closeoutCurrentPhase() {
    if (!activeTaskId || savingPhaseCloseout) return;
    const taskName = title ?? titleCache[activeTaskId] ?? activeTaskId;
    const closeoutTaskId = activeTaskId;
    const advancement = evaluateTaskAdvancement({
      entrypoint: 'phase_closeout',
      hasTaskContext: true,
      prompt: 'phase_closeout',
      task: activeTaskDetail,
    });
    if (advancement.route === 'blocked') {
      appendSysMsg(advancement.userMessage);
      return;
    }
    const userMessageCount = messages.filter((message) => message.role === 'user').length;
    const actionEvaluation = evaluateRuntimeAction({
      action: 'phase_closeout',
      fromTaskId: closeoutTaskId,
      messageCount: userMessageCount,
    });
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      hasRequiredContext: true,
    });
    if (!preStepVerification.canProceed) {
      appendSysMsg(`阶段收尾已暂停：${preStepVerification.detail}`);
      return;
    }
    setSavingPhaseCloseout(true);
    try {
      const preserved = await preservePhaseCloseoutRecord({
        taskId: closeoutTaskId,
        taskTitle: taskName,
        messages,
      });
      const phaseCloseoutMemory = evaluateTaskMemoryCoverage({
        action: 'phase_closeout',
        hasTaskContext: true,
        chatMessageCount: messages.filter((message) => message.role === 'user' || message.role === 'assistant').length,
        hasSpecificHandoffSignal: hasSpecificHandoffSignal(
          messages
            .filter((message) => message.role === 'user')
            .map((message) => message.text),
        ),
        memoryWriteCompleted: Boolean(preserved.recordPath),
      });
      if (!phaseCloseoutMemory.canProceed) {
        patchSession({ phaseCloseoutNotice: `阶段收尾已暂停：${phaseCloseoutMemory.reason}` });
        appendSysMsg(`阶段收尾已暂停：${phaseCloseoutMemory.reason}`);
        return;
      }
      const postStepVerification = evaluateRuntimeVerification({
        mode: 'post_step',
        step: buildPanelRuntimeStep({
          title: '阶段收尾记录',
          output: preserved.recordPath ? `已写入任务记录：${preserved.recordPath}` : null,
          error: preserved.recordPath ? null : '阶段收尾任务记录写入失败。',
        }),
        producedDurableChange: true,
        hasTaskRecord: Boolean(preserved.recordPath),
        hasRecoveryNote: Boolean(preserved.recordPath),
      });
      if (!postStepVerification.canProceed) {
        patchSession({ phaseCloseoutNotice: `阶段收尾已暂停：${postStepVerification.detail}` });
        appendSysMsg(`阶段收尾已暂停：${postStepVerification.detail}`);
        return;
      }
      if (preserved.recordPath) {
        await referenceTaskFileFromTaskRecord({
          taskId: closeoutTaskId,
          taskName,
          filePath: preserved.recordPath,
        });
      }
      const [taskDetail, tasks] = await Promise.all([
        window.api?.getTaskDetail?.(closeoutTaskId).catch(() => null) ?? Promise.resolve(null),
        window.api?.listTasks?.().catch(() => []) ?? Promise.resolve([]),
      ]);
      if (!taskDetail) {
        patchSession({
          phaseCloseoutNotice: '阶段记录已保存，但暂时没有读取到完整任务详情。请回到任务详情确认状态后再继续交接。',
          phaseCloseoutSaved: true,
        });
        setMessages([
          {
            id: nextId(),
            role: 'assistant',
            text: `已保存「${taskName}」的阶段收尾记录，但暂时没有读取到完整任务详情。请回到任务详情确认状态后再继续交接。`,
            ts: now(),
          },
        ]);
        return;
      }
      const taskListRecord = tasks.find((task) => task.id === closeoutTaskId) ?? taskDetail;
      const orderedChildren = orderedChildRecordsForTask(taskListRecord, tasks, {});
      const evaluation = evaluateRuntimeVerification({
        mode: 'task_closeout',
        intent: 'phase_closeout',
        task: taskDetail,
        childTaskIds: taskListRecord.childTaskIds ?? [],
        childTasks: orderedChildren,
      }).taskCloseout;
      if (!evaluation) {
        throw new Error('阶段收尾检查未返回任务收尾结论。');
      }
      const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(closeoutTaskId);
      const handoff = evaluateRuntimeHandoff({
        intent: 'phase_closeout',
        fromTaskId: closeoutTaskId,
        closeout: evaluation,
        recordPath: preserved.recordPath,
        taskMemoryGuidance,
      });
      if (!handoff.canProceed) {
        patchSession({ phaseCloseoutNotice: `阶段收尾已暂停：${handoff.reason}` });
        appendSysMsg(`阶段收尾已暂停：${handoff.reason}`);
        return;
      }
      await window.api?.recordTaskCompletionCheck?.({
        taskId: closeoutTaskId,
        action: 'passed',
        criteriaTotal: evaluation.criteriaTotal,
        criteriaSatisfied: evaluation.criteriaSatisfied,
        criteriaOpen: evaluation.criteriaOpen,
        reason: `阶段收尾自动检查：${evaluation.reason}`,
        runVerificationTone: evaluation.runVerificationTone,
        runVerificationLabel: evaluation.runVerificationLabel,
        runVerificationDetail: evaluation.runVerificationDetail,
        source: 'lightweight_rule_engine',
      }).catch(() => undefined);
      patchSession({
        phaseCloseoutNotice: `阶段记录已保存，质量检查已记录，会话已刷新。${evaluation.reason}`,
        phaseCloseoutSaved: true,
      });
      const nextTask = evaluation.nextTaskId
        ? tasks.find((task) => task.id === evaluation.nextTaskId) ?? null
        : null;
      const nextTaskDetail = nextTask
        ? await window.api?.getTaskDetail?.(nextTask.id).catch(() => null) ?? null
        : null;
      const nextTaskStartRecord = nextTask
        ? {
          ...(nextTaskDetail ?? nextTask),
          parentTaskId: (nextTaskDetail ?? nextTask).parentTaskId
            ?? (evaluation.nextTaskKind === 'existing_child' ? closeoutTaskId : null),
        }
        : null;
      const resumePlan = buildRuntimeResumePlan(handoff, handoff.action === 'handoff_to_task' && nextTask
        ? {
          subtaskStartInput: {
            targetTask: nextTaskStartRecord,
            parentTask: taskDetail,
            expectedParentTaskId: evaluation.nextTaskKind === 'existing_child' ? closeoutTaskId : null,
            previousTask: taskListRecord,
            requiresPreviousHandoff: true,
            previousHandoffAvailable: Boolean(preserved.recordPath),
            contextSignals: {
              targetTaskId: nextTask.id,
            },
            availableContext: {
              taskState: true,
              taskMd: hasTaskMdFile(nextTaskDetail),
              relevantTaskRecords: hasRelevantTaskRecordFile(nextTaskDetail),
              completionCriteria: hasKnownCompletionOrNextStep(nextTaskDetail ?? nextTask),
              nextStep: Boolean((nextTaskDetail ?? nextTask).nextStep?.trim()),
              parentConstraints: true,
              handoffNotes: Boolean(preserved.recordPath),
              sourceMaterials: nextTaskDetail ? nextTaskDetail.sourceContexts.length > 0 : undefined,
              decisions: true,
              files: nextTaskDetail?.taskFiles ? nextTaskDetail.taskFiles.length > 0 : undefined,
            },
          },
        }
        : {});
      if (handoff.action === 'handoff_to_task' && nextTask) {
        if (resumePlan.subtaskStart && !resumePlan.subtaskStart.canProceed) {
          patchSession({ phaseCloseoutNotice: `阶段收尾已保存，但进入下一任务前需要处理：${resumePlan.subtaskStart.detail}` });
          setMessages([
            {
              id: nextId(),
              role: 'assistant',
              text: `已完成「${taskName}」的阶段收尾：阶段记录已保存，质量检查已记录。进入「${nextTask.title}」前需要先处理：${resumePlan.subtaskStart.detail}`,
              ts: now(),
            },
          ]);
          return;
        }
        applyTaskContext(nextTask.id, nextTask.title, { addMessage: false });
        setMessages([
          makeWelcomeMessage(nextTask.title),
          {
            id: nextId(),
            role: 'assistant',
            text: `已完成「${taskName}」的阶段收尾：阶段记录已保存，质量检查已记录，本阶段会话已刷新。现在进入第一项子任务：**${nextTask.title}**。${resumePlan.nextAction}`,
            ts: now(),
          },
        ]);
        if (nextTask.state === 'captured' || nextTask.state === 'triaged') {
          await window.api?.transitionTask?.({ id: nextTask.id, nextState: 'planned' }).catch(() => undefined);
        }
        if (nextTask.state !== 'running' && nextTask.state !== 'waiting_external') {
          await window.api?.transitionTask?.({ id: nextTask.id, nextState: 'running' }).catch(() => undefined);
        }
        onOpenTask?.(nextTask.id);
        return;
      }
      setMessages([
        {
          id: nextId(),
          role: 'assistant',
          text: `已完成「${taskName}」的阶段收尾：阶段记录已保存，质量检查已记录，本阶段会话已刷新。${resumePlan.summary}`,
          ts: now(),
        },
      ]);
    } finally {
      setSavingPhaseCloseout(false);
    }
  }

  function proposeTaskFileWrite() {
    if (!activeTaskId) return;
    const taskName = title ?? titleCache[activeTaskId] ?? activeTaskId;
    updateTaskFileProposal(buildTaskFileWriteProposal({
      taskTitle: taskName,
      messages,
      selectedFilePath: selectedFile?.path ?? null,
    }));
  }

  async function createSubtasksFromPanelFallback(
    input: TaskplaneSubtaskCreateManyInput,
  ): Promise<TaskplaneSubtaskCreateManyResult> {
    if (!window.api?.createTask) {
      throw new Error('当前环境不支持创建任务。');
    }
    const currentDetail = activeTaskDetail?.id === input.parentTaskId
      ? activeTaskDetail
      : await window.api?.getTaskDetail?.(input.parentTaskId).catch(() => null);
    let updatedTask: TaskListItemRecord | null = null;
    if (currentDetail) {
      const previousType = currentDetail.taskType ?? 'simple';
      const nextFacets: TaskExecutionType[] = Array.from(
        new Set<TaskExecutionType>(['project', previousType, ...(currentDetail.taskFacets ?? [])]),
      );
      const shouldUpdateParent =
        currentDetail.taskType !== 'project'
        || Boolean(input.nextStep?.trim());
      if (shouldUpdateParent) {
        const nextParentTask = await window.api.updateTask({
          id: input.parentTaskId,
          nextStep: input.nextStep?.trim() || currentDetail.nextStep,
          taskFacets: nextFacets,
          taskType: 'project',
        });
        updatedTask = nextParentTask;
        setActiveTaskDetail((current) => current?.id === input.parentTaskId
          ? { ...current, ...nextParentTask }
          : current);
      }
    }
    const createdTasks = await Promise.all(input.subtasks.map((subtask) => (
      window.api!.createTask({
        title: subtask.title,
        summary: formatSubtaskDraftSummary(subtask),
        taskType: 'simple',
        taskFacets: ['simple'],
        parentTaskId: input.parentTaskId,
      })
    )));
    const plannedTasks = await Promise.all(createdTasks.map((task) => (
      window.api?.transitionTask?.({ id: task.id, nextState: 'planned' }).catch(() => task) ?? Promise.resolve(task)
    )));
    await Promise.all(plannedTasks.map((task, index) => {
      const acceptanceCriteria = input.subtasks[index]?.acceptanceCriteria.trim();
      if (!acceptanceCriteria) return Promise.resolve(null);
      if (!window.api?.createCompletionCriteria) return Promise.resolve(null);
      return Promise.resolve(window.api.createCompletionCriteria({
        taskId: task.id,
        text: acceptanceCriteria,
        verificationResponsibility: 'unknown',
      })).catch(() => null);
    }));
    const plannedByTitle = new Map(plannedTasks.map((task) => [task.title.trim(), task]));
    await Promise.all(input.subtasks.map((subtask, index) => {
      const dependencyTitle = subtask.dependency?.trim();
      if (!dependencyTitle) return Promise.resolve(null);
      const dependency = plannedByTitle.get(dependencyTitle)
        ?? plannedTasks.find((task) => (
          dependencyTitle.includes(task.title.trim()) || task.title.trim().includes(dependencyTitle)
        ));
      const child = plannedTasks[index];
      if (!child || !dependency || dependency.id === child.id) return Promise.resolve(null);
      if (!window.api?.createTaskDependency) return Promise.resolve(null);
      return Promise.resolve(window.api.createTaskDependency({
        taskId: child.id,
        blockedByTaskId: dependency.id,
        reason: subtask.dependency ?? null,
      })).catch(() => null);
    }));
    return {
      createdTasks: plannedTasks,
      updatedTask,
    };
  }

  async function confirmTaskDecompositionDraft() {
    if (
      !activeTaskId
      || !taskDecompositionDraft
      || creatingDecompositionChildren
      || (!window.api?.applyTaskplaneWriteback && !window.api?.createTask)
    ) return;
    const actionEvaluation = evaluateRuntimeAction({
      action: 'task_mutation',
      fromTaskId: activeTaskId,
      messageCount: messages.filter((message) => message.role === 'user').length,
    });
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      hasRequiredContext: true,
      confirmationSatisfied: true,
    });
    if (!preStepVerification.canProceed) {
      appendSysMsg(`创建子任务已暂停：${preStepVerification.detail}`);
      return;
    }
    setCreatingDecompositionChildren(true);
    const plan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: taskDecompositionDraft.runId,
      nextStep: taskDecompositionDraft.nextStep,
      parentTaskId: activeTaskId,
      review: taskDecompositionDraft.review,
      source: 'agent_cli_decomposition',
      subtasks: taskDecompositionDraft.subtasks,
    });
    try {
      const result = window.api?.applyTaskplaneWriteback
        ? await window.api.applyTaskplaneWriteback({ plan, taskId: activeTaskId })
        : await dispatchTaskplaneWritebackApplyPlan({
          plan,
          taskId: activeTaskId,
          ports: {
            createSubtasks: createSubtasksFromPanelFallback,
            recordTimelineEvent: recordPanelTimelineEvent,
          },
        });
      if (result.status === 'blocked') {
        appendSysMsg(result.message);
        return;
      }
      if (result.updatedTask) {
        const nextParentTask = result.updatedTask;
        setActiveTaskDetail((current) => current?.id === activeTaskId
          ? { ...current, ...nextParentTask }
          : current);
      }
      const createdCount = result.createdTasks?.length ?? taskDecompositionDraft.subtasks.length;
      verifyDurablePanelActionCompleted({
        title: '创建项目子任务',
        output: `已创建 ${createdCount} 个子任务。`,
      });
      appendSysMsg(result.successMessage);
      setTaskDecompositionDraft(null);
      setRecentDecompositionConfirmedTaskId(activeTaskId);
      onOpenTask?.(activeTaskId);
    } catch (error) {
      appendSysMsg(`创建子任务失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setCreatingDecompositionChildren(false);
    }
  }

  async function confirmSourceContextWrite() {
    if (!activeTaskId || !sourceContextProposal || savingSourceContextProposal) return;
    setSavingSourceContextProposal(true);
    const plan = buildSourceContextWritebackApplyPlan({
      proposal: sourceContextProposal,
      taskId: activeTaskId,
    });
    try {
      const result = window.api?.applyTaskplaneWriteback
        ? await window.api.applyTaskplaneWriteback({ plan, taskId: activeTaskId })
        : await dispatchTaskplaneWritebackApplyPlan({
          plan,
          taskId: activeTaskId,
          ports: {
            createSourceContext: window.api?.createSourceContext,
            recordTimelineEvent: recordPanelTimelineEvent,
          },
        });
      if (result.status === 'blocked') {
        appendSysMsg(result.message);
        return;
      }
      updateSourceContextProposal(null);
      appendSysMsg(result.successMessage);
    } finally {
      setSavingSourceContextProposal(false);
    }
  }

  async function confirmArtifactWrite() {
    if (!activeTaskId || !artifactProposal || savingArtifactProposal) return;
    setSavingArtifactProposal(true);
    const plan = buildArtifactWritebackApplyPlan({
      proposal: artifactProposal,
      taskId: activeTaskId,
    });
    try {
      const result = window.api?.applyTaskplaneWriteback
        ? await window.api.applyTaskplaneWriteback({ plan, taskId: activeTaskId })
        : await dispatchTaskplaneWritebackApplyPlan({
          plan,
          taskId: activeTaskId,
          ports: {
            createArtifact: (input) => window.api.createManualArtifact({
              content: input.content,
              taskId: input.taskId,
              title: input.title,
            }),
            recordTimelineEvent: recordPanelTimelineEvent,
          },
        });
      if (result.status === 'blocked') {
        appendSysMsg(result.message);
        return;
      }
      updateArtifactProposal(null);
      appendSysMsg(result.successMessage);
    } finally {
      setSavingArtifactProposal(false);
    }
  }

  async function confirmStructuredWriteback() {
    if (!activeTaskId || !structuredWritebackProposal || savingStructuredWritebackProposal) return;
    setSavingStructuredWritebackProposal(true);
    const plan = buildStructuredWritebackApplyPlan({
      proposal: structuredWritebackProposal,
      taskId: activeTaskId,
    });
    try {
      const result = window.api?.applyTaskplaneWriteback
        ? await window.api.applyTaskplaneWriteback({ plan, taskId: activeTaskId })
        : await dispatchTaskplaneWritebackApplyPlan({
          plan,
          taskId: activeTaskId,
          ports: {
            createBlocker: window.api?.createBlocker,
            createDecision: window.api?.createDecision,
            recordTimelineEvent: recordPanelTimelineEvent,
            updateTask: window.api?.updateTask,
          },
        });
      if (result.status === 'blocked') {
        appendSysMsg(result.message);
        return;
      }
      if (result.updatedTask) {
        setActiveTaskDetail((prev) => prev && prev.id === activeTaskId
          ? { ...prev, nextStep: result.updatedTask?.nextStep ?? prev.nextStep }
          : prev);
      }
      updateStructuredWritebackProposal(null);
      appendSysMsg(result.successMessage);
    } finally {
      setSavingStructuredWritebackProposal(false);
    }
  }

  async function confirmTaskFileWrite() {
    if (
      !activeTaskId
      || !taskFileProposal
      || savingTaskFileProposal
      || (!window.api?.applyTaskplaneWriteback && !window.api?.createTaskFile)
    ) return;
    const normalizedInput = normalizeCreateTaskFileInput({
      taskId: activeTaskId,
      name: normalizeTaskFilePath(taskFileProposal.path).split('/').filter(Boolean).at(-1) ?? taskFileProposal.path,
      path: taskFileProposal.path,
      kind: 'file',
      content: taskFileProposal.content,
    });
    const path = normalizedInput.path ?? normalizedInput.name;
    const writebackSource = taskFileProposal.intentSource === 'write_intent'
      ? 'taskplane_write_intent'
      : taskFileProposal.taskMemoryProposal ? 'task_memory_write_proposal' : 'right_panel_file_proposal';
    const memoryApplyPlan = taskFileProposal.taskMemoryProposal
      ? buildTaskMemoryWriteApplyPlan({
        proposal: {
          ...taskFileProposal.taskMemoryProposal,
          contentTemplate: taskFileProposal.content,
          path,
        },
        taskId: activeTaskId,
      })
      : null;
    if (memoryApplyPlan?.status === 'blocked') {
      appendSysMsg(`任务记忆写入已暂停：${memoryApplyPlan.reason}`);
      return;
    }
    if (!path || (!taskFileProposal.taskMemoryProposal && !/\.(md|txt)$/i.test(path))) {
      appendSysMsg('任务文件写入已暂停：当前 v1 只允许新建 .md 或 .txt 文件。');
      return;
    }
    const actionEvaluation = evaluateRuntimeAction({
      action: 'task_file_write_proposal',
      fromTaskId: activeTaskId,
      messageCount: messages.filter((message) => message.role === 'user').length,
    });
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      hasRequiredContext: true,
      confirmationSatisfied: true,
    });
    if (!preStepVerification.canProceed) {
      appendSysMsg(`任务文件写入已暂停：${preStepVerification.detail}`);
      return;
    }
    setSavingTaskFileProposal(true);
    try {
      let taskFileWritebackApplied = false;
      const existing = window.api.listTaskFiles
        ? await window.api.listTaskFiles(activeTaskId).catch(() => [])
        : [];
      if (
        (!taskFileProposal.taskMemoryProposal || memoryApplyPlan?.status === 'ready' && memoryApplyPlan.action === 'create')
        && existing.some((file) => file.path === path)
      ) {
        appendSysMsg(`任务文件写入已暂停：\`${path}\` 已存在。请换一个文件名后再确认写入。`);
        return;
      }
      if (memoryApplyPlan?.status === 'ready') {
        const taskFilePlan = memoryApplyPlan.action === 'update'
          ? buildTaskFileUpdateWritebackApplyPlan({
            evidenceRunId: taskFileProposal.evidenceRunId ?? null,
            input: memoryApplyPlan.input,
            path,
            source: writebackSource,
            surface: taskFileProposal.surface,
            surfaceLabel: taskFileProposal.surfaceLabel,
            taskId: activeTaskId,
          })
          : buildTaskFileWritebackApplyPlan({
            evidenceRunId: taskFileProposal.evidenceRunId ?? null,
            input: memoryApplyPlan.input,
            source: writebackSource,
            surface: taskFileProposal.surface,
            surfaceLabel: taskFileProposal.surfaceLabel,
            taskId: activeTaskId,
          });
        if (window.api?.applyTaskplaneWriteback) {
          const result = await window.api.applyTaskplaneWriteback({
            plan: taskFilePlan,
            taskId: activeTaskId,
          });
          if (result.status === 'blocked') {
            appendSysMsg(result.message);
            return;
          }
          taskFileWritebackApplied = true;
        }
        if (memoryApplyPlan.action === 'update') {
          if (!taskFileWritebackApplied && !window.api.updateTaskFile) {
            appendSysMsg('任务记忆写入已暂停：当前环境不支持更新任务文件。');
            return;
          }
          if (!taskFileWritebackApplied) await window.api.updateTaskFile(memoryApplyPlan.input);
        } else if (!taskFileWritebackApplied) {
          if (!window.api.createTaskFile) {
            appendSysMsg('任务记忆写入已暂停：当前环境不支持创建任务文件。');
            return;
          }
          await window.api.createTaskFile(memoryApplyPlan.input);
        }
      } else {
        const createInput = {
          ...normalizedInput,
          taskId: activeTaskId,
        };
        const taskFilePlan = buildTaskFileWritebackApplyPlan({
          evidenceRunId: taskFileProposal.evidenceRunId ?? null,
          input: createInput,
          source: writebackSource,
          surface: taskFileProposal.surface,
          surfaceLabel: taskFileProposal.surfaceLabel,
          taskId: activeTaskId,
        });
        if (window.api?.applyTaskplaneWriteback) {
          const result = await window.api.applyTaskplaneWriteback({
            plan: taskFilePlan,
            taskId: activeTaskId,
          });
          if (result.status === 'blocked') {
            appendSysMsg(result.message);
            return;
          }
          taskFileWritebackApplied = true;
        }
        if (!taskFileWritebackApplied) {
          if (!window.api.createTaskFile) {
            appendSysMsg('任务文件写入已暂停：当前环境不支持创建任务文件。');
            return;
          }
          await window.api.createTaskFile(createInput);
        }
        await referenceTaskFileFromTaskRecord({
          taskId: activeTaskId,
          taskName: title ?? titleCache[activeTaskId] ?? activeTaskId,
          filePath: path,
        });
      }
      const postStepVerification = evaluateRuntimeVerification({
        mode: 'post_step',
        step: buildPanelRuntimeStep({
          title: taskFileProposal.taskMemoryProposal ? '任务记忆写入' : '任务文件写入',
          output: taskFileProposal.taskMemoryProposal
            ? `已补写任务记忆：${path}`
            : `已写入任务文件：${path}`,
        }),
        producedDurableChange: true,
        hasRecoveryNote: true,
      });
      if (!postStepVerification.canProceed) {
        appendSysMsg(`任务文件已写入，但后置检查提示：${postStepVerification.detail}`);
      }
      if (!taskFileWritebackApplied) {
        await recordPanelTimelineEvent(activeTaskId, 'panel.task_file_written', {
          evidenceRunId: taskFileProposal.evidenceRunId ?? null,
          path,
          surface: taskFileProposal.surface,
          surfaceLabel: taskFileProposal.surfaceLabel,
          source: writebackSource,
        });
      }
      updateTaskFileProposal(null);
      appendSysMsg(taskFileProposal.taskMemoryProposal
        ? [
            `已确认并写入任务记忆：\`${path}\`。`,
            '',
            `目标：${taskFileProposal.surfaceLabel}。`,
            '这条待处理的任务记忆提案已完成确认；后续任务 Agent run 不会再被这条 pending-memory gate 阻塞。',
          ].join('\n')
        : `已写入任务文件：\`${path}\`。`);
    } finally {
      setSavingTaskFileProposal(false);
    }
  }

  async function abandonCapturedTask() {
    if (!activeTaskId || pendingCapturedTaskId !== activeTaskId || abandoningCapturedTask) return;
    if (!abandonConfirmOpen) {
      patchSession({ abandonConfirmOpen: true });
      return;
    }
    const guard = guardTaskStateTransition({
      taskId: activeTaskId,
      nextState: 'archived',
      confirmationSatisfied: true,
    });
    if (!guard.allowed) {
      appendSysMsg(`放弃任务已暂停：${guard.reason}`);
      return;
    }
    setAbandoningCapturedTask(true);
    try {
      await window.api?.transitionTask({ id: activeTaskId, nextState: 'archived' });
      dispatchSession({ type: 'clear_task_context' });
      onClearTask();
      appendSysMsg('已放弃这条待确认任务，当前会话已回到全局。');
    } catch {
      appendSysMsg('放弃任务失败，请稍后再试。');
    } finally {
      setAbandoningCapturedTask(false);
    }
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, thinking]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function send(forcedText?: string, options: { displayUserMessage?: boolean } = {}) {
    const text = (forcedText ?? input).trim();
    if (!text || thinking) return;
    const displayUserMessage = options.displayUserMessage ?? true;
    const isChildTask = isChildTaskContext(activeTaskId);
    const canDraftDecomposition = canCreateDecompositionDraftForTask(activeTaskId) || isExplicitDecompositionRequest(text);
    const runtimeAvailability = {
      agentCliReady: Boolean(activeAgentCliRuntimeMode && shouldUseAgentCliRuntime && activeTaskId && window.api?.triggerAgentCliRun),
      apiRuntimeReady: Boolean(isAgentApiRuntimeMode && window.api?.chatWithAI),
    };
    const pilotDecision = evaluatePilotDecision({
      availableDecisionBackends: buildAvailablePilotDecisionBackends({
        apiReady: runtimeAvailability.apiRuntimeReady,
        cliReady: runtimeAvailability.agentCliReady,
        cliRuntimeId: activeAgentCliRuntimeMode,
      }),
      entrypoint: isChildTask ? 'child_advance' : 'right_panel_chat',
      hasTaskContext: Boolean(activeTaskId),
      isChildTask,
      prompt: text,
      runtime: runtimeAvailability,
      selectedCliRuntime: activeAgentCliRuntimeMode,
      task: activeTaskDetail,
    });
    const advancement = pilotDecision.advancement;
    const childTaskConversation = advancement.promptMode === 'child_task_advance' || isChildTask;
    const childTaskConversationTurnCount = childTaskConversation
      ? messages.filter((message) => message.role === 'user').length + 1
      : 0;
    const allowDecompositionDraft = advancement.promptMode === 'decomposition_draft' || canDraftDecomposition;
    const rawTaskplaneConversationPrompt = childTaskConversation
      ? buildChildTaskConversationPrompt({
          childTaskConversationTurnCount,
          parentTaskTitle: parentTitleForActiveChild(),
          taskSummary: activeTaskDetail?.summary ?? null,
          taskTitle: title,
          userText: text,
        })
      : text;
    const taskplaneConversationPrompt = buildBoundedPilotDecisionPrompt({
      decision: pilotDecision,
      task: activeTaskDetail,
      userText: rawTaskplaneConversationPrompt,
    });
    const agentCliPrompt = buildBoundedPilotDecisionPrompt({
      decision: pilotDecision,
      task: activeTaskDetail,
      userText: text,
    });
    patchSession({
      artifactProposal: null,
      sourceContextProposal: null,
      structuredWritebackProposal: null,
      taskFileProposal: null,
    });

    const historyForAI: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user', content: taskplaneConversationPrompt },
    ];

    setThinking(true);
    if (displayUserMessage) {
      const userMsg: Message = { id: nextId(), role: 'user', text, ts: now() };
      setMessages((prev) => [...prev, userMsg]);
    }
    setRecentDecompositionConfirmedTaskId(null);
    setSessionInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const slashCommand = parseAgentRuntimeSlashCommand(text);
    let replyText: string | null;
    try {
      if (slashCommand.kind !== 'none') {
        replyText = await handleAgentRuntimeSlashCommand(slashCommand);
      } else if (!aiRuntimeStatusLoaded) {
        replyText = 'AI Runtime 状态仍在加载中，请稍后再发送。Taskplane 不会在未确认所选 Runtime 前调用 AI。';
      } else if (activeTaskId && pilotDecision.messagePriority === 'escalate') {
        replyText = formatPilotEscalationMessage(pilotDecision);
      } else if (advancement.route === 'local_rule' && advancement.movement === 'ask') {
        replyText = advancement.userMessage;
      } else if (
        advancement.route === 'agent_cli'
        && pilotDecision.shouldStartExecutor
        && (pilotDecision.executor === 'codex_cli' || pilotDecision.executor === 'claude_cli')
        && activeAgentCliRuntimeMode
        && shouldUseAgentCliRuntime
        && activeTaskId
        && window.api?.triggerAgentCliRun
      ) {
        const runtimeLabel = AGENT_CLI_PANEL_RUNTIME_LABELS[activeAgentCliRuntimeMode];
        setAgentCliLaunchNotice(formatPilotDecisionLaunchNotice(pilotDecision, runtimeLabel));
        const run = await window.api.triggerAgentCliRun({
          operatorConfirmed: true,
          pilotDecision: buildPilotDecisionSnapshot(pilotDecision),
          prompt: agentCliPrompt,
          runtimeId: activeAgentCliRuntimeMode,
          sandboxMode: 'read-only',
          taskId: activeTaskId,
        });
        setAgentCliLaunchNotice(null);
        const detail = await window.api.getRunDetail(run.id).catch(() => null);
        const output = detail?.output?.trim() || run.output?.trim() || run.failureReason || `${runtimeLabel} run 已记录。`;
        const decompositionDraft = allowDecompositionDraft
          ? parseAgentCliDecompositionDraft(output, run.id)
          : null;
        if (decompositionDraft) {
          setTaskDecompositionDraft(decompositionDraft);
        } else if (activeTaskId) {
          const taskRecordProposal = parseAgentCliTaskRecordWriteIntent({
            output,
            runId: run.id,
            taskId: activeTaskId,
            taskTitle: title ?? titleCache[activeTaskId] ?? activeTaskId,
          });
          const taskFileProposal = taskRecordProposal ?? parseAgentCliTaskFileWriteIntent({
            output,
            runId: run.id,
            taskId: activeTaskId,
          });
          if (taskFileProposal) {
            updateTaskFileProposal((existing) => existing ?? taskFileProposal);
          }
          const sourceProposal = parseAgentCliSourceContextWriteIntent({
            output,
            runId: run.id,
            taskId: activeTaskId,
          });
          if (sourceProposal) {
            updateSourceContextProposal((existing) => existing ?? sourceProposal);
          }
          const artifactProposal = parseAgentCliArtifactWriteIntent({
            output,
            runId: run.id,
            taskId: activeTaskId,
          });
          if (artifactProposal) {
            updateArtifactProposal((existing) => existing ?? artifactProposal);
          }
          const structuredProposal = parseAgentCliStructuredWritebackIntent({
            output,
            runId: run.id,
            taskId: activeTaskId,
          });
          if (structuredProposal) {
            updateStructuredWritebackProposal((existing) => existing ?? structuredProposal);
          }
        }
        if (run.status === 'running') {
          setActiveAgentCliRun({
            runId: run.id,
            runtimeId: activeAgentCliRuntimeMode,
            runtimeLabel,
            allowDecompositionDraft,
            status: 'running',
            suppressMemoryProposal: childTaskConversation || isChildTaskAdvancementText(taskplaneConversationPrompt),
            taskId: activeTaskId,
          });
        }
        replyText = run.status === 'running'
          ? null
          : formatAgentCliRunMessage({
              childTaskConversation,
              decompositionDraftCreated: Boolean(decompositionDraft),
              output,
              runId: run.id,
              runtimeLabel,
              steps: (run as RunRecord & { steps?: RunStepRecord[] }).steps,
              statusText: run.status === 'completed' ? '已完成' : run.status,
            });
      } else if (activeAgentCliRuntimeMode && !activeTaskId) {
        replyText = [
          '当前是全局助手会话。',
          '请先进入具体任务后再发起任务 Agent run。',
          'Taskplane 不会在未说明的情况下切换到另一条 AI Runtime。',
        ].join('\n\n');
      } else if (activeAgentCliRuntimeMode && activeTaskId && !shouldUseAgentCliRuntime) {
        replyText = [
          '当前任务运行方式不可用，任务 Agent run 未启动。',
          '请到 AI Runtime 页完成安装、登录或重新检测后再试。',
          'Taskplane 不会在未说明的情况下切换到另一条 AI Runtime。',
        ].join('\n\n');
      } else if (
        isAgentApiRuntimeMode
        && activeTaskId
        && pilotDecision.shouldStartExecutor
        && pilotDecision.executor === 'agent_api'
        && isExplicitAgentApiExecutionRequest(text)
        && window.api?.triggerRun
      ) {
        const runtimeLabel = 'Agent API Runtime';
        setAgentCliLaunchNotice(formatPilotDecisionLaunchNotice(pilotDecision, runtimeLabel));
        const run = await window.api.triggerRun({
          instructions: taskplaneConversationPrompt,
          taskId: activeTaskId,
          type: 'agent',
        });
        setAgentCliLaunchNotice(null);
        const detail = await window.api.getRunDetail(run.id).catch(() => null);
        const output = detail?.output?.trim() || run.output?.trim() || run.failureReason || `${runtimeLabel} run 已记录。`;
        const taskRecordProposal = parseAgentCliTaskRecordWriteIntent({
          output,
          runId: run.id,
          taskId: activeTaskId,
          taskTitle: title ?? titleCache[activeTaskId] ?? activeTaskId,
        });
        const taskFileProposal = taskRecordProposal ?? parseAgentCliTaskFileWriteIntent({
          output,
          runId: run.id,
          taskId: activeTaskId,
        });
        if (taskFileProposal) {
          updateTaskFileProposal((existing) => existing ?? taskFileProposal);
        }
        const sourceProposal = parseAgentCliSourceContextWriteIntent({
          output,
          runId: run.id,
          taskId: activeTaskId,
        });
        if (sourceProposal) {
          updateSourceContextProposal((existing) => existing ?? sourceProposal);
        }
        const artifactProposal = parseAgentCliArtifactWriteIntent({
          output,
          runId: run.id,
          taskId: activeTaskId,
        });
        if (artifactProposal) {
          updateArtifactProposal((existing) => existing ?? artifactProposal);
        }
        const structuredProposal = parseAgentCliStructuredWritebackIntent({
          output,
          runId: run.id,
          taskId: activeTaskId,
        });
        if (structuredProposal) {
          updateStructuredWritebackProposal((existing) => existing ?? structuredProposal);
        }
        replyText = formatAgentCliRunMessage({
          childTaskConversation,
          output,
          runId: run.id,
          runtimeLabel,
          steps: detail?.steps ?? (run as RunRecord & { steps?: RunStepRecord[] }).steps,
          statusText: run.status === 'completed' ? '已完成' : run.status,
        });
      } else if (
        isAgentApiRuntimeMode
        && (!activeTaskId || (pilotDecision.shouldStartExecutor && pilotDecision.executor === 'agent_api'))
        && window.api?.chatWithAI
      ) {
        const habitParams = {
          taskTitle: titleCache[activeTaskId ?? ''] ?? null,
          taskTypeLabel: activeAttrs ? TASK_TYPE_HABIT_LABELS[activeAttrs.type] : null,
          projectLabel: activeAttrs?.type === 'project' ? titleCache[activeTaskId ?? ''] ?? null : null,
        };
        const snapshot = await getPersistedWorkHabitStorageSnapshot().catch(() => null);
        const selectedHabitMatches = snapshot
          ? selectApplicableWorkHabitMatchesFromList(snapshot.habits, habitParams)
          : selectApplicableWorkHabitMatches(habitParams);
        const appliedHabits = summarizeWorkHabitMatchesForPrompt(selectedHabitMatches);
        const res = await window.api.chatWithAI({
          messages: historyForAI,
          pilotDecision: buildPilotDecisionSnapshot(pilotDecision),
          taskId: activeTaskId,
          workHabits: appliedHabits,
          selectedFile,
        });
        if (selectedHabitMatches.length > 0) {
          const habitIds = selectedHabitMatches.map((match) => match.habit.id);
          if (window.api.recordWorkHabitApplications) {
            void window.api.recordWorkHabitApplications({ habitIds });
          } else {
            recordWorkHabitApplications(habitIds);
          }
        }
        replyText = res.text;
      } else {
        await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
        replyText = generateReply(text, activeTaskId);
      }
    } catch (error) {
      setAgentCliLaunchNotice(null);
      replyText = slashCommand.kind !== 'none'
        ? `Runtime 命令执行失败：${error instanceof Error ? error.message : '未知错误'}`
        : activeAgentCliRuntimeMode
        ? `任务运行未启动：${error instanceof Error ? error.message : '未知错误'}`
        : generateReply(text, activeTaskId);
    }

    if (replyText?.trim()) {
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: replyText, ts: now() }]);
    }
    setThinking(false);
  }

  async function handleAgentRuntimeSlashCommand(command: ReturnType<typeof parseAgentRuntimeSlashCommand>): Promise<string> {
    const goalLifecycle = deriveTaskGoalLifecycleState({
      fallbackGoal: activeTaskDetail?.resumeCard?.nextSuggestedMove,
      nextStep: activeTaskDetail?.nextStep,
      timeline: activeTaskDetail?.timeline,
    });
    const currentGoal = goalLifecycle.status === 'cleared' ? null : goalLifecycle.objective;
    const currentGoalConditions = goalLifecycle.completionConditions.length
      ? uniqueGoalConditionLabels(goalLifecycle.completionConditions)
      : uniqueGoalConditionLabels((activeTaskDetail?.completionCriteria ?? [])
        .filter((criteria) => criteria.status === 'open')
        .map((criteria) => criteria.text));
    if (!activeTaskId) {
      if (command.kind === 'product_status') {
        return '当前是全局助手会话。Agent runtime 命令需要先进入具体任务；全局消息会继续作为普通助手问答处理。';
      }
      return '这里是全局助手会话。`/goal` 是任务级控制命令，请先进入一个任务后再设置 Taskplane Task Goal。';
    }

    if (command.kind === 'product_goal_set') {
      const goalDraft = parseProductGoalDraft(command.objective);
      if (!goalDraft.objective) {
        return 'Task Goal 不能为空。可以输入 `/goal <可验收的目标>`。';
      }
      if (!window.api?.updateTask) {
        return '当前环境暂不支持更新任务目标。';
      }
      const updated = await window.api.updateTask({
        id: activeTaskId,
        nextStep: goalDraft.objective,
      });
      const createdCriteria: CompletionCriteriaRecord[] = [];
      if (window.api.createCompletionCriteria) {
        const existingOpenCriteria = new Set((activeTaskDetail?.completionCriteria ?? [])
          .filter((criteria) => criteria.status === 'open')
          .map((criteria) => criteria.text.trim().toLowerCase()));
        for (const condition of goalDraft.completionConditions) {
          if (existingOpenCriteria.has(condition.toLowerCase())) continue;
          const created = await window.api.createCompletionCriteria({
            taskId: activeTaskId,
            text: condition,
            verificationResponsibility: 'shared',
            verificationResponsibilityLabel: 'Taskplane verifier',
          }).catch(() => null);
          if (created) {
            existingOpenCriteria.add(created.text.trim().toLowerCase());
            createdCriteria.push(created);
          }
        }
      }
      await recordPanelTimelineEvent(activeTaskId, 'panel.task_goal_updated', {
        objective: goalDraft.objective,
        ...(goalDraft.completionConditions.length ? { completionConditions: goalDraft.completionConditions } : {}),
        previousObjective: currentGoal,
        source: '/goal',
      });
      appendLocalTaskGoalEvent('panel.task_goal_updated', {
        objective: goalDraft.objective,
        ...(goalDraft.completionConditions.length ? { completionConditions: goalDraft.completionConditions } : {}),
        previousObjective: currentGoal,
        source: '/goal',
      });
      setActiveTaskDetail((prev) => prev && prev.id === activeTaskId
        ? {
          ...prev,
          nextStep: updated.nextStep ?? goalDraft.objective,
          completionCriteria: createdCriteria.length
            ? [...prev.completionCriteria, ...createdCriteria]
            : prev.completionCriteria,
        }
        : prev);
      return [
        '已设置 Taskplane Task Goal。',
        '',
        `目标：${goalDraft.objective}`,
        ...(goalDraft.completionConditions.length
          ? [
            '',
            `验收条件：${goalDraft.completionConditions.join('；')}`,
          ]
          : []),
        '',
        '这次不会把 `/goal` 透传给 Codex CLI 或 Claude Code。下一次任务 Agent run 会把这个目标写入 Run Goal Contract，再由 Taskplane 做验收和任务记忆提案。',
      ].join('\n');
    }

    if (command.kind === 'product_goal_status') {
      return [
        'Taskplane Task Goal',
        '',
        currentGoal ? `当前目标：${currentGoal}` : '当前还没有明确 Task Goal。可以用 `/goal <可验收的目标>` 设置。',
        `目标状态：${goalLifecycle.status === 'paused' ? '已暂停' : goalLifecycle.status === 'cleared' ? '已清除' : currentGoal ? '推进中' : '未设置'}`,
        currentGoalConditions.length
          ? `验收条件：${currentGoalConditions.join('；')}`
          : '验收条件：未设置，可在 `/goal` 后添加 `验收:` 条目。',
        '',
        `执行 runtime：${executionRuntimeStatusLabel}`,
        shouldUseAgentCliRuntime
          ? `执行边界：${sandboxBoundaryLabel}`
          : runtimeMode === 'api'
            ? '执行边界：Agent API Runtime 普通任务讨论走 API assistant；明确执行请求会通过 Taskplane RunService 记录 evidence。'
            : '执行边界：所选 Agent CLI 未就绪或当前阶段未接入；不会隐式切换到其他 AI Runtime。',
      ].join('\n');
    }

    if (command.kind === 'product_goal_pause' || command.kind === 'product_goal_resume') {
      if (!currentGoal) {
        return '当前还没有可暂停或恢复的 Task Goal。可以用 `/goal <可验收的目标>` 设置。';
      }
      if (command.kind === 'product_goal_pause') {
        if (goalLifecycle.status === 'paused') return `Task Goal 已经处于暂停状态。\n\n目标：${currentGoal}`;
        await recordPanelTimelineEvent(activeTaskId, 'panel.task_goal_paused', {
          objective: currentGoal,
          source: '/goal pause',
        });
        appendLocalTaskGoalEvent('panel.task_goal_paused', {
          objective: currentGoal,
          source: '/goal pause',
        });
        return [
          '已暂停 Taskplane Task Goal。',
          '',
          `目标：${currentGoal}`,
          '',
          '暂停期间不会把该目标投影为下一次 Run Goal Contract 的 objective；普通任务消息仍可作为一次性请求执行。',
        ].join('\n');
      }
      if (goalLifecycle.status !== 'paused') return `Task Goal 当前没有暂停。\n\n目标：${currentGoal}`;
      await recordPanelTimelineEvent(activeTaskId, 'panel.task_goal_resumed', {
        objective: currentGoal,
        source: '/goal resume',
      });
      appendLocalTaskGoalEvent('panel.task_goal_resumed', {
        objective: currentGoal,
        source: '/goal resume',
      });
      return [
        '已恢复 Taskplane Task Goal。',
        '',
        `目标：${currentGoal}`,
        '',
        '下一次任务 Agent run 会重新把该目标写入 Run Goal Contract。',
      ].join('\n');
    }

    if (command.kind === 'product_goal_clear') {
      if (!currentGoal) {
        return '当前还没有可清除的 Task Goal。可以用 `/goal <可验收的目标>` 设置。';
      }
      if (!window.api?.updateTask) {
        return '当前环境暂不支持清除任务目标。';
      }
      const updated = await window.api.updateTask({
        id: activeTaskId,
        nextStep: null,
      });
      await recordPanelTimelineEvent(activeTaskId, 'panel.task_goal_updated', {
        cleared: true,
        objective: null,
        previousObjective: currentGoal,
        source: '/goal clear',
      });
      appendLocalTaskGoalEvent('panel.task_goal_updated', {
        cleared: true,
        objective: null,
        previousObjective: currentGoal,
        source: '/goal clear',
      });
      setActiveTaskDetail((prev) => prev && prev.id === activeTaskId
        ? { ...prev, nextStep: updated.nextStep ?? null }
        : prev);
      return [
        '已清除 Taskplane Task Goal。',
        '',
        `原目标：${currentGoal}`,
        '',
        '后续任务 Agent run 会回到普通任务请求；如需继续持久推进，可以再用 `/goal <目标>` 设置新的可验收目标。',
      ].join('\n');
    }

    if (command.kind === 'runtime_native_goal') {
      const targetRuntime = command.runtimeId === 'selected'
        ? activeAgentCliRuntimeMode
        : command.runtimeId;
      const runtimeLabel = targetRuntime ? AGENT_CLI_PANEL_RUNTIME_LABELS[targetRuntime] : '当前 runtime';
      const capabilities = targetRuntime ? agentCliCapabilities[targetRuntime] : null;
      const nativeGoalDecision = evaluateRuntimeNativeGoalForwarding(capabilities);
      const nativeGoalReadinessEvidence = buildNativeGoalAuditReadinessEvidence({
        adapterId: targetRuntime ?? command.runtimeId,
        supportsNativeGoalMode: nativeGoalDecision.supportsNativeGoalMode,
      });
      const nativeGoalReadiness = evaluateNativeGoalForwardingReadiness(nativeGoalReadinessEvidence);
      await recordPanelTimelineEvent(activeTaskId, 'panel.runtime_native_goal_requested', {
        forwarded: nativeGoalDecision.forwarded,
        nativeGoalForwardingReadiness: {
          missingEvidence: nativeGoalReadiness.missingEvidence,
          status: nativeGoalReadiness.status,
          summary: nativeGoalReadiness.summary,
        },
        objective: command.objective,
        reason: nativeGoalDecision.reason,
        runtimeId: targetRuntime ?? command.runtimeId,
        runtimeLabel,
        supportsNativeGoalMode: nativeGoalDecision.supportsNativeGoalMode,
      });
      const auditRun = targetRuntime && window.api?.recordRuntimeNativeGoalRequest
        ? await window.api.recordRuntimeNativeGoalRequest({
            forwarded: nativeGoalDecision.forwarded,
            objective: command.objective,
            operatorConfirmed: true,
            reason: nativeGoalDecision.reason,
            runtimeId: targetRuntime,
            runtimeLabel,
            supportsNativeGoalMode: nativeGoalDecision.supportsNativeGoalMode,
            taskId: activeTaskId,
          }).catch(() => null)
        : null;
      const nativeGoalStatusLine = nativeGoalDecision.supportsNativeGoalMode
        ? `${runtimeLabel} native goal mode 已被 adapter 识别，但 Taskplane 透传入口尚未开放。`
        : nativeGoalDecision.policy === 'runtime_requires_update'
          ? `${runtimeLabel} native goal mode 需要更新 CLI 后才可用。`
          : nativeGoalDecision.policy === 'native_goal_unverified'
            ? `${runtimeLabel} native goal mode 仍待 adapter 确认。`
            : `${runtimeLabel} native goal mode 尚未开启。`;
      return [
        nativeGoalStatusLine,
        '',
        'Taskplane 已识别这是显式 runtime-native goal 请求，但本版本不会直接透传到底层 CLI，避免目标状态落在 Taskplane 会话之外。',
        auditRun ? `审计 Run: ${auditRun.id}` : null,
        `Readiness: ${nativeGoalReadiness.summary}`,
        nativeGoalReadiness.missingEvidence.length
          ? `Missing evidence: ${nativeGoalReadiness.missingEvidence.join(', ')}`
          : 'Missing evidence: none',
        capabilities
          ? `Adapter capability: supportsNativeGoalMode=${String(nativeGoalDecision.supportsNativeGoalMode)}, passthroughRequiresExplicitNamespace=${String(nativeGoalDecision.passthroughRequiresExplicitNamespace)}, policy=${nativeGoalDecision.policy}`
          : 'Adapter capability: unavailable',
        command.objective ? `请求目标：${command.objective}` : null,
        '',
        '当前可用路径：用 `/goal <目标>` 设置 Taskplane Task Goal，然后发送普通任务消息启动任务 Agent run。',
      ].filter((line): line is string => line !== null).join('\n');
    }

    if (command.kind === 'product_cancel') {
      if (activeTaskAgentCliRun) {
        await cancelActiveAgentCliRun();
        return '已发送取消请求。';
      }
      return '当前任务没有正在运行的任务 Agent。';
    }

    if (command.kind === 'product_status') {
      return [
        'Taskplane Runtime Status',
        '',
        `上下文：${runtimeChipLabel}`,
        currentGoal ? `Task Goal：${currentGoal}` : 'Task Goal：未设置',
        activeTaskAgentCliRun ? `运行中：${activeTaskAgentCliRun.runtimeLabel} · ${activeTaskAgentCliRun.runId}` : '运行中：无',
      ].join('\n');
    }

    return `暂不支持命令 ${command.kind === 'unknown' ? command.command : 'unknown'}。可用命令：/goal、/goal status、/goal pause、/goal resume、/goal clear、/status、/cancel。`;
  }

  function appendLocalTaskGoalEvent(type: PanelRuntimeTimelineEventType, payload: Record<string, unknown>) {
    if (!activeTaskId) return;
    setActiveTaskDetail((prev) => prev && prev.id === activeTaskId
      ? {
          ...prev,
          timeline: [
            ...prev.timeline,
            {
              createdAt: new Date().toISOString(),
              id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              payload: JSON.stringify(payload),
              taskId: activeTaskId,
              type,
            },
          ],
        }
      : prev);
  }

  async function cancelActiveAgentCliRun() {
    if (!activeAgentCliRun || activeAgentCliRun.status === 'cancelling' || !window.api?.cancelAgentCliRun) return;
    setActiveAgentCliRun((value) => value ? { ...value, status: 'cancelling' } : value);
    try {
      const result = await window.api.cancelAgentCliRun({
        operatorConfirmed: true,
        reason: `Operator cancelled the ${activeAgentCliRun.runtimeLabel} run from Taskplane.`,
        runId: activeAgentCliRun.runId,
      });
      if (!result.cancelled) {
        appendSysMsg(`取消请求未生效：${result.summary}`);
        setActiveAgentCliRun(null);
        return;
      }
      appendSysMsg('已发送取消请求。');
    } catch (error) {
      appendSysMsg(`取消失败：${error instanceof Error ? error.message : '未知错误'}`);
      setActiveAgentCliRun((value) => value?.runId === activeAgentCliRun.runId
        ? { ...value, status: 'running' }
        : value);
    }
  }

  const title = taskTitle(activeTaskId, titleCache);
  const activeAttrs = activeTaskId ? getTaskAttributes(activeTaskId) : null;
  const userMessageTexts = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.text.trim())
    .filter(Boolean);
  const latestUserMessageText = getLastUserMessage();
  const latestIntakeEvaluation = latestUserMessageText
    ? evaluateRuntimeIntake({
        text: latestUserMessageText,
        hasTaskContext: Boolean(activeTaskId),
        source: activeTaskId ? 'task_chat' : 'global_chat',
      })
    : null;
  const hasSpecificConversationSignal = hasSpecificHandoffSignal(userMessageTexts);
  const sessionRefreshSuggestion = activeTaskId && !sessionRefreshDismissed
    ? shouldSuggestSessionRefresh(messages, compressionThreshold)
    : null;
  const canCaptureGlobalConversation = Boolean(
    evaluateRuntimeAction({
      action: 'task_capture',
      fromTaskId: activeTaskId,
      messageCount: userMessageTexts.length,
    }).allowed
    && latestIntakeEvaluation?.outcome === 'create_task'
    && latestIntakeEvaluation.allowed
  );
  const phaseCloseoutEvaluation = evaluateRuntimeAction({
    action: 'phase_closeout',
    fromTaskId: activeTaskId,
    messageCount: userMessageTexts.length,
  });
  const phaseCloseoutPreStep = evaluateRuntimeVerification({
    mode: 'pre_step',
    action: phaseCloseoutEvaluation,
    hasRequiredContext: Boolean(activeTaskId),
  });
  const taskFileWriteEvaluation = evaluateRuntimeAction({
    action: 'task_file_write_proposal',
    fromTaskId: activeTaskId,
    messageCount: userMessageTexts.length,
  });
  const contextSwitchEvaluation = pendingSwitch
    ? evaluateRuntimeAction({
        action: 'context_switch',
        fromTaskId: activeTaskId,
        targetTaskId: pendingSwitch.taskId,
        messageCount: userMessageTexts.length,
        hasSpecificHandoffSignal: hasSpecificConversationSignal,
      })
    : null;
  const canCloseoutActiveTaskPhaseBase = Boolean(!phaseCloseoutSaved && phaseCloseoutPreStep.canProceed);
  const canProposeTaskFileWriteBase = Boolean(!taskFileProposal && taskFileWriteEvaluation.allowed);
  const canUseAgentCliRuntime = (runtimeId: AgentCliRuntimeId) =>
    Boolean(activeTaskId && agentCliAvailability[runtimeId] && window.api?.triggerAgentCliRun);
  const activeAgentCliRuntimeMode: AgentCliRuntimeId | null = runtimeMode === 'codex' || runtimeMode === 'claude'
    ? runtimeMode
    : null;
  const isAgentApiRuntimeMode = runtimeMode === 'api';
  const shouldUseAgentCliRuntime = Boolean(
    activeAgentCliRuntimeMode && canUseAgentCliRuntime(activeAgentCliRuntimeMode),
  );
  const activeTaskAgentCliRun = activeAgentCliRun && activeAgentCliRun.taskId === activeTaskId
    ? activeAgentCliRun
    : null;
  const activeIsChildTaskContext = isChildTaskContext(activeTaskId);
  const suppressSecondaryTaskSuggestions = Boolean(
    thinking
    || agentCliLaunchNotice
    || activeTaskAgentCliRun
    || artifactProposal
    || sourceContextProposal
    || structuredWritebackProposal
    || taskDecompositionDraft
    || recentDecompositionConfirmedTaskId === activeTaskId
  );
  const canCloseoutActiveTaskPhase = Boolean(
    canCloseoutActiveTaskPhaseBase
    && !suppressSecondaryTaskSuggestions
    && !activeIsChildTaskContext
  );
  const canProposeTaskFileWrite = Boolean(
    canProposeTaskFileWriteBase
    && !suppressSecondaryTaskSuggestions
    && !activeIsChildTaskContext
  );
  const executionRuntimeStatusLabel = activeAgentCliRuntimeMode
    ? shouldUseAgentCliRuntime
      ? AGENT_CLI_PANEL_RUNTIME_LABELS[activeAgentCliRuntimeMode]
      : `${AGENT_CLI_PANEL_RUNTIME_LABELS[activeAgentCliRuntimeMode]}（不可用）`
    : isAgentApiRuntimeMode
      ? 'Agent API Runtime'
      : '未选择 AI Runtime';
  const runtimeChipLabel = !aiRuntimeStatusLoaded
    ? 'AI Runtime 加载中'
    : !activeTaskId
    ? activeAgentCliRuntimeMode
      ? `全局助手 · ${AGENT_CLI_PANEL_RUNTIME_LABELS[activeAgentCliRuntimeMode]}（待接入）`
      : isAgentApiRuntimeMode
        ? '全局助手 · Agent API Runtime'
        : '全局助手 · 未选择 AI Runtime'
    : activeAgentCliRuntimeMode
      ? shouldUseAgentCliRuntime
        ? `任务 Agent · ${AGENT_CLI_PANEL_RUNTIME_HINTS[activeAgentCliRuntimeMode]}`
        : `任务 Agent · ${AGENT_CLI_PANEL_RUNTIME_LABELS[activeAgentCliRuntimeMode]} 不可用`
      : isAgentApiRuntimeMode
        ? '任务助手 · Agent API Runtime'
        : '任务助手 · 未选择 AI Runtime';
  const sandboxBoundaryLabel = shouldUseAgentCliRuntime
    ? activeAgentCliRuntimeMode === 'claude'
      ? 'Claude 原生能力'
      : 'Codex 原生能力'
    : '无 CLI 执行';
  const footerRuntimeLabel = !aiRuntimeStatusLoaded
    ? 'Runtime 加载中'
    : activeAgentCliRuntimeMode
      ? shouldUseAgentCliRuntime
        ? AGENT_CLI_PANEL_RUNTIME_LABELS[activeAgentCliRuntimeMode]
        : `${AGENT_CLI_PANEL_RUNTIME_LABELS[activeAgentCliRuntimeMode]} ${activeTaskId ? '不可用' : '待接入'}`
      : isAgentApiRuntimeMode
        ? 'Agent API'
        : 'Runtime 未选择';
  const hasSessionActivity = Boolean(activeTaskId || messages.length > 0 || input.trim());
  const pendingMemoryGuidanceLookupKey = activeTaskId
    && sessionRefreshSuggestion
    && !taskFileProposal
    && !artifactProposal
    && !sourceContextProposal
    && !structuredWritebackProposal
    && !taskDecompositionDraft
    && !activeTaskAgentCliRun
    && !thinking
    && !activeIsChildTaskContext
    ? `${activeTaskId}:${userMessageTexts.length}:${sessionRefreshSuggestion.reason}`
    : null;

  useEffect(() => {
    if (!activeTaskId || !pendingMemoryGuidanceLookupKey) return undefined;
    if (pendingMemoryGuidanceLookupRef.current === pendingMemoryGuidanceLookupKey) return undefined;
    pendingMemoryGuidanceLookupRef.current = pendingMemoryGuidanceLookupKey;
    void getBlockingTaskMemoryGuidance(activeTaskId).catch(() => null);
    return undefined;
  }, [activeTaskId, pendingMemoryGuidanceLookupKey]);

  return (
    <div className={`right-panel${fullScreen ? ' fullscreen' : ''}${hidden ? ' hidden' : ''}`}>
      {/* Header */}
      <div className="panel-header">
        <div className="panel-header-ctx">
          {activeTaskId ? (
            <button className="panel-ctx-tag" onClick={() => void leaveTaskContext()} title="离开任务上下文">
              <IconTask />
              <span>{title ?? activeTaskId}</span>
              <span className="ctx-tag-x">×</span>
            </button>
          ) : (
            <span className="panel-ctx-global">
              <IconGlobe />
              全局
            </span>
          )}
        </div>
        <div className="panel-header-actions">
          <button
            className={`icon-btn${historyOpen ? ' active' : ''}`}
            onClick={() => setHistoryOpen((value) => !value)}
            title="历史记录"
          >
            <IconHistory />
          </button>
          <button
            className="icon-btn"
            onClick={() => setFullScreen((value) => !value)}
            title={fullScreen ? '退出全屏' : '全屏显示'}
          >
            {fullScreen ? <IconMinimize /> : <IconMaximize />}
          </button>
          <button className="icon-btn" onClick={() => onClose(hasSessionActivity)} title="关闭面板">
            <IconClose />
          </button>
          {historyOpen && (
            <div className="panel-history-popover">
              <div className="panel-history-title">当前会话</div>
              <div className="panel-history-row">
                <span>上下文</span>
                <strong>{title ?? '全局'}</strong>
              </div>
              <div className="panel-history-row">
                <span>消息</span>
                <strong>{messages.length}</strong>
              </div>
              <div className="panel-history-note">
                当前会话只是临时工作内存；开始新会话会先归档有用任务信号，然后回到全局讨论。
              </div>
              <button className="btn sm ghost" onClick={() => void startNewConversation()}>
                开始新会话
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="panel-messages">
        {messages.length === 0 && (
          <div className="panel-empty">
            <p>围绕任务或想法说一句…</p>
            <span className="muted">重要内容会进入任务记忆，不依赖聊天窗口长期保存。</span>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Soft context switch banner */}
        {pendingSwitch && (
          <div className="panel-ctx-switch">
            <div className="panel-ctx-switch-text">
              <IconTask style={{ width: 12, height: 12 }} />
              <strong>{pendingSwitch.taskTitle}</strong> 上下文已可用
            </div>
            <div className="panel-ctx-switch-note">
              不会中断当前对话；上下文切换由你确认。
              {contextSwitchEvaluation?.reason ? ` ${contextSwitchEvaluation.reason}` : ''}
            </div>
            <div className="panel-ctx-switch-actions">
              <button className="btn sm primary" onClick={confirmSwitch}>切换到此任务</button>
              <button className="btn sm ghost" onClick={() => void dismissSwitch()}>保持全局</button>
            </div>
          </div>
        )}

        {sessionRefreshSuggestion && (
          <div className="panel-refresh-suggestion">
            <div className="panel-refresh-text">
              这个任务的讨论已经有点长了。可以先保全关键结论并刷新当前会话；不会跳过保全证明。
            </div>
            <div className="panel-refresh-reason">{sessionRefreshSuggestion.reason}</div>
            <div className="panel-refresh-actions">
              <button className="btn sm primary" onClick={() => void refreshTaskSessionWithPreservation()}>整理并刷新</button>
              <button className="btn sm ghost" onClick={() => patchSession({ sessionRefreshDismissed: true })}>继续当前会话</button>
            </div>
          </div>
        )}

        {canCaptureGlobalConversation && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              这段讨论可以先捕获为任务，之后再由 AI 判断类型、补齐上下文或拆解；不会直接执行。
            </div>
            <button
              className={`btn sm primary${capturingTask ? ' disabled' : ''}`}
              onClick={() => void captureGlobalConversationAsTask()}
              disabled={capturingTask}
            >
              {capturingTask ? '捕获中…' : '捕获为任务'}
            </button>
          </div>
        )}

        {canCloseoutActiveTaskPhase && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              这段任务讨论可以收成阶段记录，用于质量检查、完成判断和上下文刷新。
            </div>
            <button
              className={`btn sm primary${savingPhaseCloseout ? ' disabled' : ''}`}
              onClick={() => void closeoutCurrentPhase()}
              disabled={savingPhaseCloseout}
            >
              {savingPhaseCloseout ? '保存中…' : '收尾本阶段'}
            </button>
          </div>
        )}

        {canProposeTaskFileWrite && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              这段讨论可以先生成任务文件写入提案，确认后再新建 Markdown 文件。
            </div>
            <button className="btn sm ghost" onClick={proposeTaskFileWrite}>
              生成文件提案
            </button>
          </div>
        )}

        {taskFileProposal && (
          <div className="panel-file-proposal">
            <div className="panel-file-proposal-head">
              <strong>{taskFileProposalTitle(taskFileProposal)}</strong>
              <span>{taskFileProposalStatusCopy(taskFileProposal)}</span>
            </div>
            <input
              className="panel-file-proposal-path"
              value={taskFileProposal.path}
              onChange={(event) => updateTaskFileProposal((proposal) => (
                proposal
                  ? {
                      ...proposal,
                      path: event.target.value,
                      ...classifyTaskFileProposal(event.target.value),
                    }
                  : proposal
              ))}
              aria-label="任务文件路径"
            />
            <div className="panel-file-proposal-surface">
              建议归类：{taskFileProposal.surfaceLabel}
            </div>
            <div className="panel-refresh-reason">{taskFileProposal.summary}</div>
            {taskFileProposal.taskMemoryProposal && (
              <div className="panel-memory-proposal-preview" aria-label="任务记忆提案摘要">
                <div className="panel-memory-proposal-preview-title">提案摘要</div>
                {taskMemoryProposalPreviewItems(taskFileProposal.content).map((item) => (
                  <div className="panel-memory-proposal-preview-row" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            )}
            <textarea
              className="panel-file-proposal-content"
              value={taskFileProposal.content}
              onChange={(event) => updateTaskFileProposal((proposal) => (
                proposal ? { ...proposal, content: event.target.value } : proposal
              ))}
              aria-label="任务文件内容"
            />
            <div className="panel-refresh-actions">
              <button className="btn sm ghost" onClick={() => updateTaskFileProposal(null)}>
                放弃
              </button>
              <button
                className={`btn sm primary${savingTaskFileProposal ? ' disabled' : ''}`}
                onClick={() => void confirmTaskFileWrite()}
                disabled={savingTaskFileProposal}
              >
                {savingTaskFileProposal ? '写入中…' : taskFileProposalConfirmLabel(taskFileProposal)}
              </button>
            </div>
          </div>
        )}

        {artifactProposal && (
          <div className="panel-file-proposal">
            <div className="panel-file-proposal-head">
              <strong>任务产物写入提案</strong>
              <span>来自 Agent 结构化意图，确认后保存</span>
            </div>
            <input
              className="panel-file-proposal-path"
              value={artifactProposal.title}
              onChange={(event) => updateArtifactProposal((proposal) => (
                proposal ? { ...proposal, title: event.target.value } : proposal
              ))}
              aria-label="任务产物标题"
            />
            <div className="panel-refresh-reason">{artifactProposal.summary}</div>
            <textarea
              className="panel-file-proposal-content"
              value={artifactProposal.content}
              onChange={(event) => updateArtifactProposal((proposal) => (
                proposal ? { ...proposal, content: event.target.value } : proposal
              ))}
              aria-label="任务产物内容"
            />
            <div className="panel-refresh-actions">
              <button className="btn sm ghost" onClick={() => updateArtifactProposal(null)}>
                放弃
              </button>
              <button
                className={`btn sm primary${savingArtifactProposal ? ' disabled' : ''}`}
                onClick={() => void confirmArtifactWrite()}
                disabled={savingArtifactProposal}
              >
                {savingArtifactProposal ? '保存中…' : '确认保存产物'}
              </button>
            </div>
          </div>
        )}

        {sourceContextProposal && (
          <div className="panel-file-proposal">
            <div className="panel-file-proposal-head">
              <strong>来源上下文写入提案</strong>
              <span>来自 Agent 结构化意图，确认后保存</span>
            </div>
            <div className="panel-refresh-reason">
              {sourceContextProposal.title}
              {sourceContextProposal.uri ? ` · ${sourceContextProposal.uri}` : ''}
            </div>
            <textarea
              className="panel-file-proposal-content"
              value={sourceContextProposal.note}
              onChange={(event) => updateSourceContextProposal((proposal) => (
                proposal ? { ...proposal, note: event.target.value } : proposal
              ))}
              aria-label="来源上下文说明"
            />
            <div className="panel-refresh-actions">
              <button className="btn sm ghost" onClick={() => updateSourceContextProposal(null)}>
                放弃
              </button>
              <button
                className={`btn sm primary${savingSourceContextProposal ? ' disabled' : ''}`}
                onClick={() => void confirmSourceContextWrite()}
                disabled={savingSourceContextProposal}
              >
                {savingSourceContextProposal ? '保存中…' : '确认保存来源'}
              </button>
            </div>
          </div>
        )}

        {structuredWritebackProposal && (
          <div className="panel-file-proposal">
            <div className="panel-file-proposal-head">
              <strong>结构化写回提案</strong>
              <span>来自 Agent 结构化意图，确认后执行</span>
            </div>
            <div className="panel-refresh-reason">
              {structuredWritebackProposal.title}
            </div>
            <textarea
              className="panel-file-proposal-content"
              value={structuredWritebackProposal.detail}
              readOnly
              aria-label="结构化写回说明"
            />
            <div className="panel-refresh-actions">
              <button className="btn sm ghost" onClick={() => updateStructuredWritebackProposal(null)}>
                放弃
              </button>
              <button
                className={`btn sm primary${savingStructuredWritebackProposal ? ' disabled' : ''}`}
                onClick={() => void confirmStructuredWriteback()}
                disabled={savingStructuredWritebackProposal}
              >
                {savingStructuredWritebackProposal ? '处理中…' : '确认执行'}
              </button>
            </div>
          </div>
        )}

        {agentCliLaunchNotice && (
          <div className="panel-agent-run-inline" aria-live="polite">
            <span className="panel-agent-run-pulse" />
            <div>
              <strong>正在启动任务 Agent</strong>
              <p>{agentCliLaunchNotice}</p>
            </div>
          </div>
        )}

        {activeTaskAgentCliRun && (
          <div className="panel-agent-run-inline" aria-live="polite">
            <span className="panel-agent-run-pulse" />
            <div>
              <strong>任务 Agent 正在执行</strong>
              <p>{activeTaskAgentCliRun.progress?.label ?? '正在准备任务上下文...'}</p>
              {activeTaskAgentCliRun.progress?.detail && (
                <p className="panel-agent-run-detail">{activeTaskAgentCliRun.progress.detail}</p>
              )}
              <button
                className={`btn sm ghost${activeTaskAgentCliRun.status === 'cancelling' ? ' disabled' : ''}`}
                onClick={() => void cancelActiveAgentCliRun()}
                disabled={activeTaskAgentCliRun.status === 'cancelling'}
              >
                {activeTaskAgentCliRun.status === 'cancelling' ? '取消中…' : '取消运行'}
              </button>
            </div>
          </div>
        )}

        {taskDecompositionDraft && (
          <div className="panel-file-proposal panel-decomposition-draft">
            <div className="panel-file-proposal-head">
              <strong>子任务草案</strong>
              <span>确认后创建为当前项目的子任务</span>
            </div>
            <div className="panel-decomposition-list">
              {taskDecompositionDraft.subtasks.map((subtask, index) => (
                <div className="panel-decomposition-item" key={`${subtask.title}-${index}`}>
                  <strong>{index + 1}. {subtask.title}</strong>
                  <span>{subtask.summary}</span>
                  <small>验收：{subtask.acceptanceCriteria}</small>
                  {subtask.dependency && <small>依赖：{subtask.dependency}</small>}
                </div>
              ))}
            </div>
            <div className="panel-refresh-reason">{taskDecompositionDraft.review}</div>
            <div className="panel-refresh-actions">
              <button className="btn sm ghost" onClick={() => setTaskDecompositionDraft(null)}>
                放弃
              </button>
              <button
                className={`btn sm primary${creatingDecompositionChildren ? ' disabled' : ''}`}
                onClick={() => void confirmTaskDecompositionDraft()}
                disabled={creatingDecompositionChildren}
              >
                {creatingDecompositionChildren ? '创建中…' : '确认创建子任务'}
              </button>
            </div>
          </div>
        )}

        {activeTaskId && phaseCloseoutSaved && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              {phaseCloseoutNotice ?? '阶段记录已保存，质量检查已记录，会话已刷新。'}
            </div>
          </div>
        )}

        {activeTaskId && pendingCapturedTaskId === activeTaskId && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              这是待确认任务，确认后才会进入 Tasks 主列表；放弃需要二次确认，放弃后会归档这条捕获记录。
            </div>
            <button
              className={`btn sm primary${confirmingCapturedTask ? ' disabled' : ''}`}
              onClick={() => void confirmCapturedTask()}
              disabled={confirmingCapturedTask || abandoningCapturedTask}
            >
              {confirmingCapturedTask ? '确认中…' : '确认加入 Tasks'}
            </button>
            <button
              className={`btn sm ghost${abandoningCapturedTask ? ' disabled' : ''}`}
              onClick={() => void abandonCapturedTask()}
              disabled={confirmingCapturedTask || abandoningCapturedTask}
            >
              {abandoningCapturedTask ? '放弃中…' : abandonConfirmOpen ? '确认放弃' : '放弃'}
            </button>
          </div>
        )}

        {/* Thinking indicator */}
        {thinking && (
          <div className="panel-thinking">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="panel-input-wrap">
        <textarea
          ref={textareaRef}
          className="panel-input"
          placeholder={activeTaskId ? `关于「${title ?? activeTaskId}」…` : '搜索、提问或捕获任务想法…'}
          value={input}
          rows={1}
          onChange={(e) => { setSessionInput(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
        />
        <div className="panel-input-foot">
          <span className="panel-runtime-chip">
            {footerRuntimeLabel}
          </span>
          <button
            className={`btn sm primary${!input.trim() || thinking ? ' disabled' : ''}`}
            onClick={() => void send()}
            disabled={!input.trim() || thinking}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Message bubble ─── */

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const parts = message.text.split(/(\*\*[^*]+\*\*|\n)/g);
  return (
    <div className={`msg${isUser ? ' msg-user' : ' msg-ai'}`}>
      {!isUser && (
        <div className="msg-avatar-ai">AI</div>
      )}
      <div className="msg-body">
        <p>
          {parts.map((part, index) => {
            if (part === '\n') return <br key={index} />;
            return part.startsWith('**') && part.endsWith('**')
              ? <strong key={index}>{part.slice(2, -2)}</strong>
              : part;
          })}
        </p>
        <span className="msg-ts">{message.ts}</span>
      </div>
    </div>
  );
}

/* ─── Mock reply generator ─── */

function generateReply(input: string, taskId: string | null): string {
  const lower = input.toLowerCase();
  if (lower.includes('状态') || lower.includes('情况')) {
    return taskId
      ? `当前任务处于正常推进中。根据最近的任务动态，上一次 Run 已完成主要步骤，等待你的进一步指令。\n\n建议下一步：确认输出方向后启动新 Run。`
      : `从全局来看，今日有 3 件高优先级事项待处理，其中 1 件已在 Running 状态。`;
  }
  if (lower.includes('风险') || lower.includes('问题')) {
    return `注意到以下潜在风险：\n\n1. 对方已等待超过 48 小时，回复优先级高\n2. 数据口径未确认，影响后续分析质量\n\n建议优先处理第 1 项。`;
  }
  if (lower.includes('下一步') || lower.includes('怎么')) {
    return taskId
      ? `建议下一步：\n\n1. 确认目标方向（5 分钟）\n2. 启动 Run，让 AI 完成初稿\n3. 审核输出后决策下一步行动`
      : `建议按 Tasks 默认排序处理：先解决 Escalate 任务，再处理 Unblock 项。`;
  }
  if (lower.includes('总结') || lower.includes('摘要')) {
    return `好的，我来整理一下当前任务的关键信息：\n\n**目标**：完成核心交付物\n**当前阻塞**：等待用户决策\n**下次行动**：拍板后可立即继续\n\n需要我展开某个部分吗？`;
  }
  return `明白了。${taskId ? '我会结合这个任务的上下文来帮你分析。' : '让我从全局视角来看这个问题。'}\n\n你希望我重点关注哪个方向？`;
}

/* ─── Icons ─── */

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="3" x2="11" y2="11" />
      <line x1="11" y1="3" x2="3" y2="11" />
    </svg>
  );
}

function IconTask({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" />
      <polyline points="4,7 6,9 10,5" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 7a5.5 5.5 0 1 0 1-3.2" />
      <polyline points="1.5,2 1.5,5 4.5,5" />
      <path d="M7 4.5v3l2 1.5" />
    </svg>
  );
}

function IconMaximize() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5,2 2,2 2,5" />
      <polyline points="9,2 12,2 12,5" />
      <polyline points="5,12 2,12 2,9" />
      <polyline points="9,12 12,12 12,9" />
    </svg>
  );
}

function IconMinimize() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,5 5,5 5,2" />
      <polyline points="12,5 9,5 9,2" />
      <polyline points="2,9 5,9 5,12" />
      <polyline points="12,9 9,9 9,12" />
    </svg>
  );
}
