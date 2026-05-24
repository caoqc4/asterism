import type { RuntimeContextAssemblyPolicy } from './runtime-context.js';
import {
  evaluateRuntimeContextReadiness,
  type RuntimeContextReadinessEvaluation,
} from './runtime-context-readiness.js';
import {
  evaluateRuntimeIntake,
  type RuntimeIntakeEvaluation,
} from './runtime-intake-evaluator.js';
import type { RuntimeEntrypointGate } from './runtime-entrypoint-coverage.js';
import type { TaskDetail } from './types/task.js';

export type TaskAdvancementEntrypoint =
  | 'child_advance'
  | 'context_refresh'
  | 'phase_closeout'
  | 'project_decompose'
  | 'task_completion_check'
  | 'right_panel_chat';

export type TaskAdvancementMovement =
  | 'ask'
  | 'decompose'
  | 'execute'
  | 'handoff'
  | 'pause'
  | 'persist'
  | 'research'
  | 'shape'
  | 'verify';

export type TaskAdvancementPromptMode =
  | 'child_task_advance'
  | 'context_refresh'
  | 'decomposition_draft'
  | 'plain_user';

export type TaskAdvancementRoute =
  | 'agent_cli'
  | 'api_runtime'
  | 'blocked'
  | 'local_rule'
  | 'proposal_only';

export type TaskAdvancementRuntimeAvailability = {
  agentCliReady?: boolean;
  apiRuntimeReady?: boolean;
};

export type TaskAdvancementTask = Partial<Pick<
  TaskDetail,
  | 'activeBlocker'
  | 'activeWaitingItem'
  | 'childTaskIds'
  | 'completionCriteria'
  | 'nextStep'
  | 'parentTaskId'
  | 'riskLevel'
  | 'riskNote'
  | 'sourceContexts'
  | 'state'
  | 'summary'
  | 'title'
>>;

export type TaskAdvancementEvaluation = {
  confirmationRequired: boolean;
  contextReadiness: RuntimeContextReadinessEvaluation | null;
  entrypoint: TaskAdvancementEntrypoint;
  intake: RuntimeIntakeEvaluation | null;
  movement: TaskAdvancementMovement;
  promptMode: TaskAdvancementPromptMode;
  reason: string;
  requiredGates: RuntimeEntrypointGate[];
  route: TaskAdvancementRoute;
  shouldStartRuntime: boolean;
  userMessage: string;
};

export function evaluateTaskAdvancement(params: {
  contextAssembly?: RuntimeContextAssemblyPolicy | null;
  entrypoint: TaskAdvancementEntrypoint;
  hasTaskContext?: boolean;
  isChildTask?: boolean;
  prompt: string;
  runtime?: TaskAdvancementRuntimeAvailability;
  task?: TaskAdvancementTask | null;
}): TaskAdvancementEvaluation {
  const prompt = normalizeText(params.prompt);
  const hasTaskContext = Boolean(params.hasTaskContext || params.task);
  const runtime = params.runtime ?? {};
  const shouldDraftDecomposition = Boolean(
    params.entrypoint === 'project_decompose'
    || isExplicitDecompositionRequest(prompt),
  );

  if (shouldDraftDecomposition) {
    return buildEvaluation({
      confirmationRequired: true,
      contextReadiness: null,
      entrypoint: params.entrypoint,
      intake: null,
      movement: 'decompose',
      promptMode: 'decomposition_draft',
      reason: 'The task is broad enough to benefit from a reversible subtask draft before durable child creation.',
      requiredGates: [
        'simplicity_check',
        'runtime_context_assembly',
        'task_memory_guidance',
        'subtask_draft',
      ],
      route: selectRuntimeRoute(runtime),
      userMessage: '当前更适合先生成子任务草案；确认后再写入结构化子任务。',
    });
  }

  if (params.entrypoint === 'context_refresh' && hasTaskContext) {
    return buildEvaluation({
      confirmationRequired: true,
      contextReadiness: null,
      entrypoint: params.entrypoint,
      intake: null,
      movement: 'handoff',
      promptMode: 'context_refresh',
      reason: 'Context refresh is a Taskplane handoff movement: preserve recovery-worthy memory before clearing the working conversation.',
      requiredGates: [
        'simplicity_check',
        'runtime_context_assembly',
        'runtime_handoff',
        'task_memory_coverage',
        'task_memory_guidance',
      ],
      route: 'local_rule',
      userMessage: '先整理归档可恢复上下文，确认后再清理当前任务会话。',
    });
  }

  if (params.entrypoint === 'phase_closeout' && hasTaskContext) {
    return buildEvaluation({
      confirmationRequired: true,
      contextReadiness: null,
      entrypoint: params.entrypoint,
      intake: null,
      movement: 'verify',
      promptMode: 'plain_user',
      reason: 'Phase closeout must verify produced work, preserve recovery notes, and decide the next handoff without claiming full task completion by default.',
      requiredGates: [
        'simplicity_check',
        'runtime_handoff',
        'task_memory_coverage',
        'task_memory_guidance',
        'task_completion',
        'pre_step',
        'post_step',
      ],
      route: 'local_rule',
      userMessage: '先做阶段质量检查并保存收尾记录，再决定是否交接到下一项任务。',
    });
  }

  if (params.entrypoint === 'task_completion_check' && hasTaskContext) {
    return buildEvaluation({
      confirmationRequired: true,
      contextReadiness: null,
      entrypoint: params.entrypoint,
      intake: null,
      movement: 'verify',
      promptMode: 'plain_user',
      reason: 'Task completion is a verification movement: check criteria, run evidence, memory coverage, project children, and user override before closing.',
      requiredGates: [
        'simplicity_check',
        'task_completion',
        'task_memory_coverage',
        'task_memory_guidance',
        'pre_step',
        'post_step',
        'operator_confirmation',
      ],
      route: 'local_rule',
      userMessage: '先完成验收检查；如有风险，由用户确认等待或覆盖完成。',
    });
  }

  if (!hasTaskContext) {
    const intake = evaluateRuntimeIntake({
      hasTaskContext: false,
      source: 'global_chat',
      text: prompt,
    });
    return buildEvaluation({
      confirmationRequired: intake.requiresConfirmation,
      contextReadiness: null,
      entrypoint: params.entrypoint,
      intake,
      movement: movementForIntake(intake),
      promptMode: params.entrypoint === 'context_refresh' ? 'context_refresh' : 'plain_user',
      reason: intake.reason,
      requiredGates: ['simplicity_check', 'runtime_context_assembly'],
      route: intake.allowed ? 'proposal_only' : 'local_rule',
      userMessage: intake.reason,
    });
  }

  if (!params.task) {
    return buildEvaluation({
      confirmationRequired: false,
      contextReadiness: null,
      entrypoint: params.entrypoint,
      intake: null,
      movement: params.isChildTask ? 'shape' : 'execute',
      promptMode: params.isChildTask ? 'child_task_advance' : 'plain_user',
      reason: 'Task detail is not loaded, so Taskplane should preserve the existing task run path instead of inventing a new one.',
      requiredGates: runtimeExecutionGates(),
      route: selectRuntimeRoute(runtime),
      userMessage: '任务详情仍在加载中；先沿当前任务运行路径继续。',
    });
  }

  const contextReadiness = evaluateRuntimeContextReadiness({
    contextAssembly: params.contextAssembly,
    prompt,
    task: readinessTaskFrom(params.task),
  });

  const route = routeForReadiness(contextReadiness, runtime);
  const movement = movementForReadiness(contextReadiness, Boolean(params.isChildTask));
  const promptMode = params.entrypoint === 'context_refresh'
    ? 'context_refresh'
    : params.isChildTask
      ? 'child_task_advance'
      : 'plain_user';

  return buildEvaluation({
    confirmationRequired: contextReadiness.shouldAskUser,
    contextReadiness,
    entrypoint: params.entrypoint,
    intake: null,
    movement,
    promptMode,
    reason: contextReadiness.reasons[0] ?? contextReadiness.summary,
    requiredGates: gatesForMovement(movement, route),
    route,
    userMessage: userMessageForReadiness(contextReadiness),
  });
}

function buildEvaluation(input: Omit<TaskAdvancementEvaluation, 'shouldStartRuntime'>): TaskAdvancementEvaluation {
  return {
    ...input,
    requiredGates: uniqueGates(input.requiredGates),
    shouldStartRuntime: (input.route === 'agent_cli' || input.route === 'api_runtime')
      && input.movement !== 'ask'
      && input.movement !== 'pause',
  };
}

function gatesForMovement(
  movement: TaskAdvancementMovement,
  route: TaskAdvancementRoute,
): RuntimeEntrypointGate[] {
  if (movement === 'ask' || movement === 'pause') {
    return ['simplicity_check', 'runtime_context_assembly', 'context_readiness'];
  }
  if (movement === 'decompose') {
    return ['simplicity_check', 'runtime_context_assembly', 'task_memory_guidance', 'subtask_draft'];
  }
  if (route === 'agent_cli' || route === 'api_runtime') {
    return runtimeExecutionGates();
  }
  return ['simplicity_check', 'runtime_context_assembly', 'context_readiness'];
}

function runtimeExecutionGates(): RuntimeEntrypointGate[] {
  return [
    'simplicity_check',
    'runtime_action',
    'runtime_context_assembly',
    'context_readiness',
    'task_memory_coverage',
    'task_memory_guidance',
    'pre_step',
    'subtask_start',
    'post_step',
  ];
}

function isExplicitDecompositionRequest(value: string): boolean {
  return /拆解|拆细|分解|拆成|子任务|前后端|前端|后端|模块|里程碑|decompos|break\s*down|split/i.test(value);
}

function movementForIntake(intake: RuntimeIntakeEvaluation): TaskAdvancementMovement {
  switch (intake.outcome) {
    case 'create_task':
      return 'shape';
    case 'create_task_record':
    case 'propose_task_file':
    case 'propose_work_habit':
      return 'persist';
    case 'surface_decision':
      return 'ask';
    case 'continue_discussion':
    default:
      return 'shape';
  }
}

function movementForReadiness(
  readiness: RuntimeContextReadinessEvaluation,
  isChildTask: boolean,
): TaskAdvancementMovement {
  switch (readiness.decision) {
    case 'ask_user':
      return 'ask';
    case 'blocked':
      return 'pause';
    case 'plan_first':
      return isChildTask ? 'shape' : 'execute';
    case 'self_research':
      return 'research';
    case 'ready':
    default:
      return 'execute';
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function readinessTaskFrom(task: TaskAdvancementTask) {
  return {
    activeBlocker: task.activeBlocker ?? null,
    activeWaitingItem: task.activeWaitingItem ?? null,
    completionCriteria: task.completionCriteria ?? [],
    nextStep: task.nextStep ?? null,
    parentTaskId: task.parentTaskId ?? null,
    riskLevel: task.riskLevel ?? 'none',
    riskNote: task.riskNote ?? null,
    sourceContexts: task.sourceContexts ?? [],
    state: task.state ?? 'planned',
    summary: task.summary ?? '',
    title: task.title ?? '',
  };
}

function routeForReadiness(
  readiness: RuntimeContextReadinessEvaluation,
  runtime: TaskAdvancementRuntimeAvailability,
): TaskAdvancementRoute {
  if (readiness.shouldAskUser) return 'local_rule';
  if (readiness.decision === 'blocked') return 'blocked';
  return selectRuntimeRoute(runtime);
}

function selectRuntimeRoute(runtime: TaskAdvancementRuntimeAvailability): TaskAdvancementRoute {
  if (runtime.agentCliReady) return 'agent_cli';
  if (runtime.apiRuntimeReady) return 'api_runtime';
  return 'blocked';
}

function uniqueGates(gates: RuntimeEntrypointGate[]): RuntimeEntrypointGate[] {
  return Array.from(new Set(gates));
}

function userMessageForReadiness(readiness: RuntimeContextReadinessEvaluation): string {
  switch (readiness.decision) {
    case 'ask_user':
      return '这个点需要你先拍板，我不会直接启动任务 Agent；确认后再继续。';
    case 'blocked':
      return readiness.summary;
    case 'plan_first':
      return '上下文已足够，先做只读梳理和执行计划，再进入具体改动。';
    case 'self_research':
      return '上下文已足够先推进；缺口可以通过资料检索、来源或运行时工具补齐，不需要继续追问。';
    case 'ready':
    default:
      return '上下文已足够，可以开始执行。';
  }
}
