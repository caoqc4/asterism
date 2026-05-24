import type { RuntimeContextAssemblyPolicy } from './runtime-context.js';
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
const EXTERNAL_RESEARCH_PATTERN = /最新|官方文档|联网|搜索|调研|竞品|资料|案例|市场|Codex|Claude|Agent\s*初学者|web|search|browse|docs?/i;
const USER_DECISION_PATTERN = /拍板|批准|审批|是否允许|要不要|选哪个|是否.*(上线|发布|部署)|直接.*(上线|发布|部署)|(上线|发布|部署).*生产环境|删除|付费|收费|凭证|密钥|API\s*key|生产环境|force\s*push|push\s+main/i;
const WEAK_START_PATTERN = /^(开始|继续|推进|执行|go|start|continue|run)$/i;

export function evaluateRuntimeContextReadiness(params: {
  contextAssembly?: RuntimeContextAssemblyPolicy | null;
  prompt: string;
  task: RuntimeContextReadinessTask;
}): RuntimeContextReadinessEvaluation {
  const prompt = normalizeText(params.prompt);
  const taskText = normalizeText([
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

  const sourceCount = params.task.sourceContexts.filter((source) => (
    source.status === 'active'
    && !source.isDuplicate
    && !source.containsSensitiveData
    && (source.isKey || source.content?.trim() || source.uri?.trim())
  )).length;
  if (EXTERNAL_RESEARCH_PATTERN.test(taskText) && sourceCount === 0) {
    return buildReadiness({
      decision: 'self_research',
      missing: ['source_evidence'],
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
