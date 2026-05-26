import type { RuntimeContextAssemblyPolicy } from './runtime-context.js';
import {
  buildRuntimeResearchIntentText,
  evaluateRuntimeResearchIntent,
} from './runtime-research-intent.js';
import type { SourceContextRecord } from './types/source-context.js';
import type { TaskDetail } from './types/task.js';

export type RuntimeContextReadinessDecision =
  | 'ask_user'
  | 'blocked'
  | 'plan_first'
  | 'ready'
  | 'self_research';

export type RuntimeContextReadinessMovement =
  | 'ask'
  | 'execute'
  | 'pause'
  | 'plan'
  | 'research';

export type RuntimeContextReadinessMode =
  | 'manual_decision'
  | 'native_plan'
  | 'native_research'
  | 'read_only_execute'
  | 'runtime_blocked';

export type RuntimeContextReadinessEvaluation = {
  decision: RuntimeContextReadinessDecision;
  missing: string[];
  movement: RuntimeContextReadinessMovement;
  reasons: string[];
  recommendedMode: RuntimeContextReadinessMode;
  shouldAskUser: boolean;
  shouldSelfResearch: boolean;
  shouldUsePlanMode: boolean;
  summary: string;
};

type RuntimeContextReadinessTask = Pick<
  TaskDetail,
  | 'activeBlocker'
  | 'activeWaitingItem'
  | 'completionCriteria'
  | 'nextStep'
  | 'parentTaskId'
  | 'riskLevel'
  | 'riskNote'
  | 'sourceContexts'
  | 'state'
  | 'summary'
  | 'title'
>;

const CONCRETE_DELIVERABLE_PATTERN = /网站|教程|文档|页面|产品|功能|组件|报告|草稿|方案|实现|修复|优化|review|implement|build|draft|design/i;
const CODE_OR_REPO_ACTION_PATTERN = /代码|仓库|实现|修复|重构|接入|接口|API|测试|lint|build|commit|push|deploy|refactor|bug|repo/i;
const USER_DECISION_PATTERN = /拍板|批准|审批|是否允许|要不要|选哪个|是否.*(上线|发布|部署)|直接.*(上线|发布|部署)|(上线|发布|部署).*生产环境|删除|付费|收费|凭证|密钥|API\s*key|生产环境|force\s*push|push\s+main/i;
const WEAK_START_PATTERN = /^(开始|继续|推进|执行|go|start|continue|run)$/i;
const FRESH_SOURCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SOURCE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function evaluateRuntimeContextReadiness(params: {
  contextAssembly?: RuntimeContextAssemblyPolicy | null;
  now?: Date | string;
  prompt: string;
  task: RuntimeContextReadinessTask;
}): RuntimeContextReadinessEvaluation {
  const prompt = normalizeText(params.prompt);
  const taskText = buildRuntimeResearchIntentText([
    params.task.title,
    params.task.summary,
    params.task.nextStep,
    params.task.riskNote,
    prompt,
  ].filter(Boolean).join(' '));

  if (params.contextAssembly && !params.contextAssembly.canExecuteTaskWork) {
    return buildReadiness({
      decision: 'blocked',
      missing: params.contextAssembly.missingRequired,
      movement: 'pause',
      reasons: [params.contextAssembly.summary],
      recommendedMode: 'runtime_blocked',
    });
  }

  if (params.task.activeBlocker || params.task.activeWaitingItem || params.task.state === 'waiting_external') {
    return buildReadiness({
      decision: 'ask_user',
      missing: ['unblock_condition'],
      movement: 'ask',
      reasons: ['Task is blocked or waiting, so execution needs an unblock signal first.'],
      recommendedMode: 'manual_decision',
    });
  }

  if (USER_DECISION_PATTERN.test(prompt)) {
    return buildReadiness({
      decision: 'ask_user',
      missing: ['user_owned_boundary'],
      movement: 'ask',
      reasons: ['The user request names a decision, approval, external side effect, credential, or irreversible boundary.'],
      recommendedMode: 'manual_decision',
    });
  }

  const hasTaskBoundary = Boolean(params.task.title?.trim() && (params.task.summary?.trim() || params.task.nextStep?.trim()));
  const promptHasSignal = prompt.length >= 8 || CONCRETE_DELIVERABLE_PATTERN.test(prompt);
  if (!hasTaskBoundary && (!promptHasSignal || WEAK_START_PATTERN.test(prompt))) {
    return buildReadiness({
      decision: 'ask_user',
      missing: ['goal_or_deliverable'],
      movement: 'ask',
      reasons: ['The task and prompt do not yet identify a concrete goal, deliverable, or next movement.'],
      recommendedMode: 'manual_decision',
    });
  }

  const usableSources = params.task.sourceContexts.filter(isUsableSourceContext);
  const researchIntent = evaluateRuntimeResearchIntent(taskText);
  const hasFreshSource = usableSources.some((source) => isFreshSourceContext(source, resolveNowMs(params.now)));
  const missingResearchEvidence = usableSources.length === 0
    ? 'source_evidence'
    : 'fresh_source_evidence';
  if (
    researchIntent.shouldUseExternalResearch &&
    (usableSources.length === 0 || (researchIntent.freshExternalSignal && !hasFreshSource))
  ) {
    return buildReadiness({
      decision: 'self_research',
      missing: [missingResearchEvidence],
      movement: 'research',
      reasons: ['The next step depends on public, current, official, or example-based information that can be researched before asking the user.'],
      recommendedMode: 'native_research',
    });
  }

  const hasCriteria = params.task.completionCriteria.length > 0;
  const isHighRisk = params.task.riskLevel === 'medium' || params.task.riskLevel === 'high';
  if (CODE_OR_REPO_ACTION_PATTERN.test(taskText) && (isHighRisk || !hasCriteria || /实现|修改|重构|接入|deploy|push|refactor|implement/i.test(prompt))) {
    return buildReadiness({
      decision: 'plan_first',
      missing: hasCriteria ? [] : ['acceptance_or_verification_plan'],
      movement: 'plan',
      reasons: ['This resembles code or repository work that benefits from read-only exploration and an approval-ready plan before writes.'],
      recommendedMode: 'native_plan',
    });
  }

  return buildReadiness({
    decision: 'ready',
    missing: [],
    movement: 'execute',
    reasons: ['The goal, owner task, and next reversible movement are clear enough to proceed.'],
    recommendedMode: 'read_only_execute',
  });
}

export function formatRuntimeContextReadinessForStep(
  evaluation: RuntimeContextReadinessEvaluation,
): string {
  return [
    `decision=${evaluation.decision}`,
    `movement=${evaluation.movement}`,
    `recommendedMode=${evaluation.recommendedMode}`,
    `askUser=${evaluation.shouldAskUser ? 'yes' : 'no'}`,
    `selfResearch=${evaluation.shouldSelfResearch ? 'yes' : 'no'}`,
    `planFirst=${evaluation.shouldUsePlanMode ? 'yes' : 'no'}`,
    evaluation.missing.length ? `missing=${evaluation.missing.join(',')}` : 'missing=none',
    `reasons=${evaluation.reasons.join(' | ')}`,
    `summary=${evaluation.summary}`,
  ].join('\n');
}

function buildReadiness(params: {
  decision: RuntimeContextReadinessDecision;
  missing: string[];
  movement: RuntimeContextReadinessMovement;
  reasons: string[];
  recommendedMode: RuntimeContextReadinessMode;
}): RuntimeContextReadinessEvaluation {
  return {
    ...params,
    shouldAskUser: params.decision === 'ask_user',
    shouldSelfResearch: params.decision === 'self_research',
    shouldUsePlanMode: params.decision === 'plan_first',
    summary: [
      `Context readiness: ${params.decision}.`,
      `Next movement: ${params.movement}.`,
      params.reasons[0],
    ].filter(Boolean).join(' '),
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isUsableSourceContext(source: SourceContextRecord): boolean {
  return source.status === 'active'
    && !source.isDuplicate
    && !source.containsSensitiveData
    && source.credibility !== 'low'
    && Boolean(source.isKey || source.content?.trim() || source.uri?.trim());
}

function isFreshSourceContext(source: SourceContextRecord, nowMs: number): boolean {
  const capturedAt = Date.parse(source.capturedAt ?? source.updatedAt ?? source.createdAt);
  return Number.isFinite(capturedAt)
    && capturedAt <= nowMs + SOURCE_CLOCK_SKEW_MS
    && nowMs - capturedAt <= FRESH_SOURCE_MAX_AGE_MS;
}

function resolveNowMs(now: Date | string | undefined): number {
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'string') {
    const parsed = Date.parse(now);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}
