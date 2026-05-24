import type {
  TaskAdvancementEntrypoint,
  TaskAdvancementEvaluation,
  TaskAdvancementMovement,
  TaskAdvancementRuntimeAvailability,
  TaskAdvancementTask,
  TaskAdvancementRoute,
} from './task-advancement-orchestrator.js';
import { evaluateTaskAdvancement } from './task-advancement-orchestrator.js';
import type { RuntimeEntrypointGate } from './runtime-entrypoint-coverage.js';
import type { PriorityLane } from './types/brief.js';
import { comparePriorityLanes } from './working-context/priority-lanes.js';

export type PilotDecisionBackend =
  | 'rules'
  | 'agent_api'
  | 'codex_cli'
  | 'claude_cli'
  | 'wanman_matrix'
  | 'human_review';

export type PilotExecutor =
  | 'local_rule'
  | 'human'
  | 'agent_api'
  | 'codex_cli'
  | 'claude_cli'
  | 'wanman_matrix';

export type PilotMessagePriority = 'follow_up' | 'steer' | 'escalate';

export type PilotConfidence = 'rule' | 'model_assisted' | 'needs_review';

export type PilotOperationMode =
  | 'product_control_layer'
  | 'bounded_decision_backend'
  | 'persistent_ai_pilot_reserved';

export type PilotDecisionBackendTrigger =
  | 'ambiguous_blocked_state'
  | 'missing_priority_lane'
  | 'multi_task_priority'
  | 'user_steer';

export type PilotDecisionBackendPlan = {
  backend: PilotDecisionBackend;
  maxTurns: 1;
  outputContract: 'pilot_decision_summary';
  reason: string;
  status: 'not_needed' | 'requested' | 'fallback_to_rules' | 'human_review';
  triggers: PilotDecisionBackendTrigger[];
};

export type PilotDecision = {
  role: 'pilot';
  advancement: TaskAdvancementEvaluation;
  backend: PilotDecisionBackend;
  backendReason: string;
  backendPlan: PilotDecisionBackendPlan;
  confidence: PilotConfidence;
  executor: PilotExecutor;
  executorReason: string;
  gates: RuntimeEntrypointGate[];
  messagePriority: PilotMessagePriority;
  movement: TaskAdvancementMovement;
  operationMode: PilotOperationMode;
  priorityLane: PriorityLane | null;
  reason: string;
  requiredRules: string[];
  shouldStartExecutor: boolean;
};

export type PilotDecisionInput = {
  availableDecisionBackends?: PilotDecisionBackend[];
  contextAssembly?: Parameters<typeof evaluateTaskAdvancement>[0]['contextAssembly'];
  entrypoint: TaskAdvancementEntrypoint;
  hasTaskContext?: boolean;
  isChildTask?: boolean;
  multiTaskCandidateCount?: number;
  preferredExecutor?: PilotExecutor;
  priorityLane?: PriorityLane | null;
  prompt: string;
  runtime?: TaskAdvancementRuntimeAvailability;
  selectedCliRuntime?: 'codex' | 'claude' | null;
  task?: TaskAdvancementTask | null;
};

const ALWAYS_REQUIRED_RULES = ['goalpilot.task_router', 'pilot.decision_contract'];
const PILOT_DECISION_OUTPUT_CONTRACT: PilotDecisionBackendPlan['outputContract'] = 'pilot_decision_summary';

export function evaluatePilotDecision(input: PilotDecisionInput): PilotDecision {
  const advancement = evaluateTaskAdvancement({
    contextAssembly: input.contextAssembly,
    entrypoint: input.entrypoint,
    hasTaskContext: input.hasTaskContext,
    isChildTask: input.isChildTask,
    prompt: input.prompt,
    runtime: input.runtime,
    task: input.task,
  });
  const priorityLane = input.priorityLane ?? derivePilotPriorityLane(input.task);
  const messagePriority = classifyPilotMessagePriority({
    prompt: input.prompt,
    priorityLane,
    task: input.task,
  });
  const backendTriggers = decisionBackendTriggersForPilot({
    advancement,
    input,
    messagePriority,
    priorityLane,
  });
  const needsModelJudgment = backendTriggers.length > 0;
  const backend = selectPilotDecisionBackend({
    availableBackends: input.availableDecisionBackends,
    needsModelJudgment,
    runtime: input.runtime,
    selectedCliRuntime: input.selectedCliRuntime,
  });
  const executor = selectPilotExecutor({
    advancement,
    messagePriority,
    preferredExecutor: input.preferredExecutor,
    route: advancement.route,
    selectedCliRuntime: input.selectedCliRuntime,
  });
  const backendPlan = buildPilotDecisionBackendPlan({
    backend,
    needsModelJudgment,
    triggers: backendTriggers,
  });
  const confidence = confidenceForBackend(backend, needsModelJudgment, messagePriority);

  return {
    role: 'pilot',
    advancement,
    backend,
    backendReason: backendReason(backend, needsModelJudgment),
    backendPlan,
    confidence,
    executor,
    executorReason: executorReason(executor, advancement, messagePriority),
    gates: advancement.requiredGates,
    messagePriority,
    movement: advancement.movement,
    operationMode: operationModeForBackend(backend),
    priorityLane,
    reason: buildPilotReason(advancement, messagePriority, priorityLane),
    requiredRules: requiredRulesForPilot(advancement, priorityLane, input.multiTaskCandidateCount ?? 0),
    shouldStartExecutor: advancement.shouldStartRuntime && executor !== 'human' && executor !== 'local_rule',
  };
}

export function classifyPilotMessagePriority(params: {
  prompt: string;
  priorityLane?: PriorityLane | null;
  task?: TaskAdvancementTask | null;
}): PilotMessagePriority {
  const text = normalizeText(params.prompt);

  if (looksLikeEscalation(text)) {
    return 'escalate';
  }

  if (looksLikeSteer(text)) {
    return 'steer';
  }

  return 'follow_up';
}

export function shouldRunBoundedPilotDecisionBackend(decision: Pick<PilotDecision, 'backendPlan'>): boolean {
  return decision.backendPlan.status === 'requested';
}

export function formatPilotDecisionBackendPlanForStep(plan: PilotDecisionBackendPlan): string {
  return [
    `status=${plan.status}`,
    `backend=${plan.backend}`,
    `outputContract=${plan.outputContract}`,
    `maxTurns=${plan.maxTurns}`,
    plan.triggers.length ? `triggers=${plan.triggers.join(',')}` : 'triggers=none',
    `reason=${plan.reason}`,
  ].join('\n');
}

export function buildBoundedPilotDecisionPrompt(params: {
  decision: PilotDecision;
  task?: TaskAdvancementTask | null;
  userText: string;
}): string {
  if (!shouldRunBoundedPilotDecisionBackend(params.decision)) {
    return params.userText;
  }

  const taskLines = [
    params.task?.title ? `Title: ${params.task.title}` : null,
    params.task?.summary ? `Summary: ${params.task.summary}` : null,
    params.task?.nextStep ? `Next step: ${params.task.nextStep}` : null,
    params.task?.riskLevel ? `Risk: ${params.task.riskLevel}${params.task.riskNote ? ` (${params.task.riskNote})` : ''}` : null,
    params.task?.activeBlocker ? `Blocker: ${params.task.activeBlocker.title}` : null,
    params.task?.activeWaitingItem ? `Waiting: ${params.task.activeWaitingItem.reason}` : null,
  ].filter((line): line is string => Boolean(line));

  return [
    'Taskplane Pilot phase-2 bounded decision pass.',
    [
      'Decide the next route before acting.',
      'Prefer proceeding with the next reversible step when context is enough.',
      'Use research/inspection for public or source-derived gaps before asking the user.',
      'Ask only when the missing answer is user-owned, approval-bound, or irreversible.',
      'Do not mutate Taskplane state directly; return any durable change as a proposal/evidence.',
    ].join(' '),
    [
      `Pilot movement: ${params.decision.movement}`,
      `Pilot route: ${params.decision.advancement.route}`,
      `Executor: ${params.decision.executor}`,
      `Message priority: ${params.decision.messagePriority}`,
      `Priority lane: ${params.decision.priorityLane ?? 'none'}`,
      `Triggers: ${params.decision.backendPlan.triggers.join(', ')}`,
    ].join('\n'),
    taskLines.length ? `Task context:\n${taskLines.join('\n')}` : null,
    `User message:\n${params.userText}`,
  ].filter((part): part is string => Boolean(part)).join('\n\n');
}

export function selectPilotDecisionBackend(params: {
  availableBackends?: PilotDecisionBackend[];
  needsModelJudgment: boolean;
  runtime?: TaskAdvancementRuntimeAvailability;
  selectedCliRuntime?: 'codex' | 'claude' | null;
}): PilotDecisionBackend {
  if (!params.needsModelJudgment) {
    return 'rules';
  }

  const available = new Set<PilotDecisionBackend>(params.availableBackends ?? inferredBackends(params));
  const preferredCli = params.selectedCliRuntime === 'claude' ? 'claude_cli' : 'codex_cli';

  for (const candidate of ['agent_api', preferredCli, 'codex_cli', 'claude_cli', 'wanman_matrix', 'human_review'] as const) {
    if (available.has(candidate)) {
      return candidate;
    }
  }

  return available.has('rules') ? 'rules' : 'human_review';
}

function inferredBackends(params: {
  runtime?: TaskAdvancementRuntimeAvailability;
  selectedCliRuntime?: 'codex' | 'claude' | null;
}): PilotDecisionBackend[] {
  const backends: PilotDecisionBackend[] = ['rules'];
  if (params.runtime?.apiRuntimeReady) backends.push('agent_api');
  if (params.runtime?.agentCliReady) backends.push(params.selectedCliRuntime === 'claude' ? 'claude_cli' : 'codex_cli');
  backends.push('human_review');
  return backends;
}

function derivePilotPriorityLane(task?: TaskAdvancementTask | null): PriorityLane | null {
  if (!task) return null;
  if (task.riskLevel === 'high') return 'escalate_now';
  if (task.activeBlocker) return 'unblock_or_decide';
  if (task.activeWaitingItem || task.state === 'waiting_external' || !task.nextStep?.trim()) return 'clarify';
  if (task.sourceContexts?.length) return 'continue_or_review';
  return 'steady';
}

function decisionBackendTriggersForPilot(params: {
  advancement: TaskAdvancementEvaluation;
  input: PilotDecisionInput;
  messagePriority: PilotMessagePriority;
  priorityLane: PriorityLane | null;
}): PilotDecisionBackendTrigger[] {
  const triggers = new Set<PilotDecisionBackendTrigger>();
  if ((params.input.multiTaskCandidateCount ?? 0) > 1) triggers.add('multi_task_priority');
  if (params.messagePriority === 'steer') triggers.add('user_steer');
  if (
    params.advancement.route === 'blocked'
    && Boolean(params.input.runtime?.agentCliReady || params.input.runtime?.apiRuntimeReady)
  ) {
    triggers.add('ambiguous_blocked_state');
  }
  if (!params.priorityLane && params.input.hasTaskContext) triggers.add('missing_priority_lane');
  return [...triggers];
}

function selectPilotExecutor(params: {
  advancement: TaskAdvancementEvaluation;
  messagePriority: PilotMessagePriority;
  preferredExecutor?: PilotExecutor;
  route: TaskAdvancementRoute;
  selectedCliRuntime?: 'codex' | 'claude' | null;
}): PilotExecutor {
  if (params.messagePriority === 'escalate' || params.advancement.movement === 'ask') {
    return 'human';
  }

  if (params.preferredExecutor && params.preferredExecutor !== 'human') {
    return params.preferredExecutor;
  }

  switch (params.route) {
    case 'agent_cli':
      return params.selectedCliRuntime === 'claude' ? 'claude_cli' : 'codex_cli';
    case 'api_runtime':
      return 'agent_api';
    default:
      return 'local_rule';
  }
}

function requiredRulesForPilot(
  advancement: TaskAdvancementEvaluation,
  priorityLane: PriorityLane | null,
  multiTaskCandidateCount: number,
): string[] {
  const rules = new Set(ALWAYS_REQUIRED_RULES);

  if (priorityLane || multiTaskCandidateCount > 1) {
    rules.add('priority.attention_routing');
  }
  if (advancement.movement === 'handoff') {
    rules.add('context.transition_policy');
    rules.add('task.memory_rules');
  }
  if (advancement.movement === 'persist' || advancement.movement === 'verify') {
    rules.add('decision.writeback_orchestration');
    rules.add('task.memory_rules');
  }
  if (advancement.shouldStartRuntime) {
    rules.add('agent.execution_rules');
    rules.add('native.runtime_orchestration');
  }

  return [...rules];
}

function confidenceForBackend(
  backend: PilotDecisionBackend,
  needsModelJudgment: boolean,
  messagePriority: PilotMessagePriority,
): PilotConfidence {
  if (backend === 'human_review') return 'needs_review';
  if (backend !== 'rules') return 'model_assisted';
  if (needsModelJudgment || messagePriority === 'steer') return 'needs_review';
  return 'rule';
}

function buildPilotDecisionBackendPlan(params: {
  backend: PilotDecisionBackend;
  needsModelJudgment: boolean;
  triggers: PilotDecisionBackendTrigger[];
}): PilotDecisionBackendPlan {
  if (!params.needsModelJudgment) {
    return {
      backend: 'rules',
      maxTurns: 1,
      outputContract: PILOT_DECISION_OUTPUT_CONTRACT,
      reason: 'Deterministic Pilot rules are enough; no bounded model judgment is needed.',
      status: 'not_needed',
      triggers: [],
    };
  }

  if (params.backend === 'human_review') {
    return {
      backend: params.backend,
      maxTurns: 1,
      outputContract: PILOT_DECISION_OUTPUT_CONTRACT,
      reason: 'The missing decision belongs to the user or an explicit review lane.',
      status: 'human_review',
      triggers: params.triggers,
    };
  }

  if (params.backend === 'rules') {
    return {
      backend: params.backend,
      maxTurns: 1,
      outputContract: PILOT_DECISION_OUTPUT_CONTRACT,
      reason: 'A bounded model decision would help, but no usable backend is available; stay conservative.',
      status: 'fallback_to_rules',
      triggers: params.triggers,
    };
  }

  return {
    backend: params.backend,
    maxTurns: 1,
    outputContract: PILOT_DECISION_OUTPUT_CONTRACT,
    reason: 'A short model-assisted Pilot judgment may resolve ambiguous routing before execution.',
    status: 'requested',
    triggers: params.triggers,
  };
}

function operationModeForBackend(backend: PilotDecisionBackend): PilotOperationMode {
  if (backend === 'rules' || backend === 'human_review') {
    return 'product_control_layer';
  }
  return 'bounded_decision_backend';
}

function backendReason(backend: PilotDecisionBackend, needsModelJudgment: boolean): string {
  if (backend === 'rules') {
    return needsModelJudgment
      ? 'No model decision backend is available, so Pilot falls back to deterministic rules.'
      : 'Deterministic Pilot rules are sufficient for this event.';
  }
  if (backend === 'human_review') return 'The decision is user-owned or requires human review.';
  return `Pilot can use ${backend} as the available DecisionBackend for ambiguous coordination.`;
}

function executorReason(
  executor: PilotExecutor,
  advancement: TaskAdvancementEvaluation,
  messagePriority: PilotMessagePriority,
): string {
  if (executor === 'human') return 'The message requires user confirmation, approval, or escalation.';
  if (executor === 'local_rule') return 'The movement stays inside Taskplane local rules and gates.';
  if (messagePriority === 'steer') return `The executor may continue only after Pilot applies the steer event.`;
  return `The selected executor follows the ${advancement.route} route.`;
}

function buildPilotReason(
  advancement: TaskAdvancementEvaluation,
  messagePriority: PilotMessagePriority,
  priorityLane: PriorityLane | null,
): string {
  const lane = priorityLane ? ` Priority lane: ${priorityLane}.` : '';
  return `Pilot selected ${advancement.movement} via ${advancement.route}; message priority is ${messagePriority}.${lane} ${advancement.reason}`;
}

function looksLikeSteer(text: string): boolean {
  return /(停一下|暂停|取消|先别|不要继续|不是这个意思|不对|方向错|改成|改为|换个方向|stop|cancel|pause|wrong direction|instead)/i.test(text);
}

function looksLikeEscalation(text: string): boolean {
  return /(生产环境|生产库|生产数据|线上环境|部署|正式上线|正式发布|push|合并|删除|付款|支付|账单|凭证|密钥|token|secret|权限|授权|审批|拍板|高风险|prod|deploy|release|delete|credential|legal approval|security approval|approval)/i.test(text);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function highestPriorityLane(lanes: Array<PriorityLane | null | undefined>): PriorityLane | null {
  return lanes
    .filter((lane): lane is PriorityLane => Boolean(lane))
    .sort(comparePriorityLanes)[0] ?? null;
}
