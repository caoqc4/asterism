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

export type PilotCoordinatorDecision = {
  role: 'pilot';
  advancement: TaskAdvancementEvaluation;
  backend: PilotDecisionBackend;
  backendReason: string;
  confidence: PilotConfidence;
  executor: PilotExecutor;
  executorReason: string;
  gates: RuntimeEntrypointGate[];
  messagePriority: PilotMessagePriority;
  movement: TaskAdvancementMovement;
  priorityLane: PriorityLane | null;
  reason: string;
  requiredRules: string[];
  shouldStartExecutor: boolean;
};

export type PilotCoordinatorInput = {
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

const ALWAYS_REQUIRED_RULES = ['goalpilot.task_router', 'pilot.coordinator'];

export function evaluatePilotCoordinator(input: PilotCoordinatorInput): PilotCoordinatorDecision {
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
  const needsModelJudgment = shouldUseModelAssistedPilot({
    advancement,
    input,
    messagePriority,
    priorityLane,
  });
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
  const confidence = confidenceForBackend(backend, needsModelJudgment, messagePriority);

  return {
    role: 'pilot',
    advancement,
    backend,
    backendReason: backendReason(backend, needsModelJudgment),
    confidence,
    executor,
    executorReason: executorReason(executor, advancement, messagePriority),
    gates: advancement.requiredGates,
    messagePriority,
    movement: advancement.movement,
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

function shouldUseModelAssistedPilot(params: {
  advancement: TaskAdvancementEvaluation;
  input: PilotCoordinatorInput;
  messagePriority: PilotMessagePriority;
  priorityLane: PriorityLane | null;
}): boolean {
  if ((params.input.multiTaskCandidateCount ?? 0) > 1) return true;
  if (params.messagePriority === 'steer') return true;
  if (params.advancement.route === 'blocked' && Boolean(params.input.runtime?.agentCliReady || params.input.runtime?.apiRuntimeReady)) {
    return true;
  }
  if (!params.priorityLane && params.input.hasTaskContext) return true;
  return false;
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
