import type {
  AgentRunRequest,
  AgentWorkingContext,
  AgentStepProposal,
  AgentToolName,
  AgentToolResult,
} from '../../../shared/types/agent-execution.js';
import { createResumeCheckpointPayload } from '../../../shared/types/run-checkpoint-payload.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { AgentToolRegistry } from './agent-tool-registry.js';

export type AgentRunLoopResult =
  | {
      status: 'completed';
      output: string;
      observations: AgentRunLoopObservation[];
    }
  | {
      status: 'failed';
      message: string;
      observations: AgentRunLoopObservation[];
    }
  | {
      status: 'paused';
      message: string;
      checkpointId: string;
      observations: AgentRunLoopObservation[];
    }
  | {
      status: 'needs_confirmation';
      message: string;
      checkpointId: string;
      observations: AgentRunLoopObservation[];
    };

export type AgentRunLoopObservation = {
  tool: AgentToolName;
  status: NonNullable<AgentToolResult['status']>;
  summary: string;
  output: string | null;
  error: string | null;
  checkpointId: string | null;
};

export type AgentRunLoopStep =
  | {
      kind: 'inspect_context';
      tool: Extract<AgentToolName, 'task.inspect_context'>;
      input: Record<string, never>;
    }
  | {
      kind: 'inspect_timeline';
      tool: Extract<AgentToolName, 'task.inspect_timeline'>;
      input: Record<string, never>;
    }
  | {
      kind: 'create_note';
      tool: Extract<AgentToolName, 'artifact.create_note'>;
      input: {
        title: string;
        content: string;
      };
    }
  | {
      kind: 'update_next_step';
      tool: Extract<AgentToolName, 'task.update_next_step'>;
      input: {
        nextStep: string;
      };
    }
  | {
      kind: 'create_completion_criterion';
      tool: Extract<AgentToolName, 'task.create_completion_criterion'>;
      input: {
        text: string;
      };
    }
  | {
      kind: 'create_source_context';
      tool: Extract<AgentToolName, 'source_context.create'>;
      input: {
        title: string;
        kind?: string;
        isKey?: boolean;
        uri?: string | null;
        content?: string | null;
        note?: string | null;
      };
    }
  | {
      kind: 'draft_decision';
      tool: Extract<AgentToolName, 'decision.draft'>;
      input: {
        note?: string | null;
      };
    }
  | {
      kind: 'workspace_search';
      tool: Extract<AgentToolName, 'workspace.search'>;
      input: {
        query: string;
        maxResults?: number;
      };
    }
  | {
      kind: 'workspace_read_file';
      tool: Extract<AgentToolName, 'workspace.read_file'>;
      input: {
        path: string;
      };
    };

type AgentRunLoopPlan = {
  source: 'model_proposal' | 'fallback';
  steps: AgentRunLoopStep[];
};

type AgentObservationPlannerDecision =
  | {
      action: 'continue';
      status: 'completed';
      title: '复核 agent 观察后继续执行';
      reason: string;
    }
  | {
      action: 'stop';
      status: 'skipped';
      title: '复核 agent 观察后暂停写入';
      reason: string;
    };

function buildInspectContextStep(): Extract<AgentRunLoopStep, { kind: 'inspect_context' }> {
  return {
    kind: 'inspect_context',
    tool: 'task.inspect_context',
    input: {},
  };
}

function buildInspectTimelineStep(): Extract<AgentRunLoopStep, { kind: 'inspect_timeline' }> {
  return {
    kind: 'inspect_timeline',
    tool: 'task.inspect_timeline',
    input: {},
  };
}

function parseWorkspaceSearchStep(
  input: Record<string, unknown> | undefined,
): Extract<AgentRunLoopStep, { kind: 'workspace_search' }> | null {
  const query = typeof input?.query === 'string' ? input.query.trim() : '';

  if (!query) {
    return null;
  }

  const maxResults = typeof input?.maxResults === 'number'
    ? Math.max(1, Math.floor(input.maxResults))
    : undefined;

  return {
    kind: 'workspace_search',
    tool: 'workspace.search',
    input: maxResults ? { query, maxResults } : { query },
  };
}

function parseWorkspaceReadFileStep(
  input: Record<string, unknown> | undefined,
): Extract<AgentRunLoopStep, { kind: 'workspace_read_file' }> | null {
  const filePath = typeof input?.path === 'string' ? input.path.trim() : '';

  if (!filePath) {
    return null;
  }

  return {
    kind: 'workspace_read_file',
    tool: 'workspace.read_file',
    input: { path: filePath },
  };
}

function parseTaskUpdateNextStep(
  input: Record<string, unknown> | undefined,
): Extract<AgentRunLoopStep, { kind: 'update_next_step' }> | null {
  const nextStep = typeof input?.nextStep === 'string' ? input.nextStep.trim() : '';

  return nextStep
    ? { kind: 'update_next_step', tool: 'task.update_next_step', input: { nextStep } }
    : null;
}

function parseTaskCreateCompletionCriterion(
  input: Record<string, unknown> | undefined,
): Extract<AgentRunLoopStep, { kind: 'create_completion_criterion' }> | null {
  const text = typeof input?.text === 'string' ? input.text.trim() : '';

  return text
    ? { kind: 'create_completion_criterion', tool: 'task.create_completion_criterion', input: { text } }
    : null;
}

function parseSourceContextCreate(
  input: Record<string, unknown> | undefined,
): Extract<AgentRunLoopStep, { kind: 'create_source_context' }> | null {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const kind = typeof input?.kind === 'string' ? input.kind.trim() : undefined;
  const note = typeof input?.note === 'string' ? input.note.trim() : null;
  const uri = typeof input?.uri === 'string' ? input.uri.trim() : null;
  const content = typeof input?.content === 'string' ? input.content.trim() : null;
  const isKey = typeof input?.isKey === 'boolean' ? input.isKey : undefined;

  return title
    ? {
        kind: 'create_source_context',
        tool: 'source_context.create',
        input: {
          title,
          ...(kind ? { kind } : {}),
          ...(isKey === undefined ? {} : { isKey }),
          uri,
          content,
          note,
        },
      }
    : null;
}

function parseDecisionDraft(
  input: Record<string, unknown> | undefined,
): Extract<AgentRunLoopStep, { kind: 'draft_decision' }> {
  const note = typeof input?.note === 'string' ? input.note.trim() : null;

  return {
    kind: 'draft_decision',
    tool: 'decision.draft',
    input: { note },
  };
}

function isMutationStep(step: AgentRunLoopStep): boolean {
  return (
    step.kind === 'create_note' ||
    step.kind === 'update_next_step' ||
    step.kind === 'create_completion_criterion' ||
    step.kind === 'create_source_context' ||
    step.kind === 'draft_decision'
  );
}

function isDomainMutationStep(step: AgentRunLoopStep): boolean {
  return (
    step.kind === 'update_next_step' ||
    step.kind === 'create_completion_criterion' ||
    step.kind === 'create_source_context' ||
    step.kind === 'draft_decision'
  );
}

function ensurePreWriteObservationSteps(steps: AgentRunLoopStep[]): AgentRunLoopStep[] {
  if (!steps.some(isMutationStep)) {
    return steps;
  }

  const readSteps = new Map<
    Extract<AgentRunLoopStep['kind'], 'inspect_context' | 'inspect_timeline'>,
    AgentRunLoopStep
  >();
  const writeSteps: AgentRunLoopStep[] = [];

  for (const step of steps) {
    if (step.kind === 'inspect_context' || step.kind === 'inspect_timeline') {
      readSteps.set(step.kind, step);
      continue;
    }

    writeSteps.push(step);
  }

  return [
    readSteps.get('inspect_context') ?? buildInspectContextStep(),
    readSteps.get('inspect_timeline') ?? buildInspectTimelineStep(),
    ...writeSteps,
  ];
}

function parseModelProposal(modelOutput: string): AgentStepProposal | null {
  try {
    const parsed = JSON.parse(modelOutput) as Partial<AgentStepProposal>;

    if (!Array.isArray(parsed.steps)) {
      return null;
    }

    return {
      finalOutput: typeof parsed.finalOutput === 'string' ? parsed.finalOutput : null,
      steps: parsed.steps
        .filter((step): step is AgentStepProposal['steps'][number] => (
          Boolean(step)
          && typeof step === 'object'
          && (step as { tool?: unknown }).tool !== undefined
        ))
        .map((step) => ({
          tool: step.tool,
          input: step.input && typeof step.input === 'object' ? step.input : undefined,
        })),
    };
  } catch {
    return null;
  }
}

function observationFromTool(tool: AgentToolName, result: AgentToolResult): AgentRunLoopObservation {
  return {
    tool,
    status: result.status ?? (result.success ? 'completed' : 'failed'),
    summary: result.summary,
    output: result.output ?? null,
    error: result.error ?? null,
    checkpointId: result.checkpointId ?? null,
  };
}

function failedFromTool(
  result: AgentToolResult,
  observations: AgentRunLoopObservation[],
): AgentRunLoopResult {
  return {
    status: 'failed',
    message: result.error ?? result.summary,
    observations,
  };
}

function formatObservationSummary(observations: AgentRunLoopObservation[]): string {
  if (!observations.length) {
    return '没有产生工具观察。';
  }

  return observations
    .map((observation, index) => {
      const suffix = observation.checkpointId
        ? `；checkpoint=${observation.checkpointId}`
        : observation.error
          ? `；error=${observation.error}`
          : '';

      return `${index + 1}. ${observation.tool} [${observation.status}] ${observation.summary}${suffix}`;
    })
    .join('\n');
}

function formatObservedToolList(observations: AgentRunLoopObservation[]): string {
  return observations
    .map((observation) => observation.tool)
    .join('、') || '无';
}

function evaluateObservationPlannerDecision(params: {
  context: AgentWorkingContext;
  observations: AgentRunLoopObservation[];
  nextTool: AgentToolName;
}): AgentObservationPlannerDecision {
  if (params.context.blockers.length) {
    return {
      action: 'stop',
      status: 'skipped',
      title: '复核 agent 观察后暂停写入',
      reason: `观察到任务仍有阻塞项：${params.context.blockers.map((item) => item.title).join('；')}。暂停执行 ${params.nextTool}，等待先解除阻塞。`,
    };
  }

  if (params.context.dependencies.length) {
    return {
      action: 'stop',
      status: 'skipped',
      title: '复核 agent 观察后暂停写入',
      reason: `观察到任务仍有未解除依赖：${params.context.dependencies.map((item) => item.title).join('；')}。暂停执行 ${params.nextTool}，等待先处理依赖。`,
    };
  }

  return {
    action: 'continue',
    status: 'completed',
    title: '复核 agent 观察后继续执行',
    reason: `已完成只读观察：${formatObservedToolList(params.observations)}。继续执行：${params.nextTool}。`,
  };
}

export class AgentRunLoop {
  constructor(
    private readonly agentToolRegistry: AgentToolRegistry,
    private readonly runStepRepository: RunStepRepository = new RunStepRepository(),
    private readonly runCheckpointRepository: RunCheckpointRepository = new RunCheckpointRepository(),
  ) {}

  extractStepProposal(modelOutput: string): AgentStepProposal | null {
    return parseModelProposal(modelOutput);
  }

  buildPlanFromProposal(params: {
    proposal: AgentStepProposal | null | undefined;
    modelOutput: string;
    policy?: AgentRunRequest['policy'];
    taskTitle: string;
  }): AgentRunLoopStep[] {
    const { modelOutput, policy, proposal, taskTitle } = params;

    if (!proposal?.steps.length) {
      return this.buildLocalNotePlan({ modelOutput, taskTitle });
    }

    const nextPlan: AgentRunLoopStep[] = [];

    for (const step of proposal.steps) {
      if (step.tool === 'task.inspect_context') {
        nextPlan.push(buildInspectContextStep());
        continue;
      }

      if (step.tool === 'task.inspect_timeline') {
        nextPlan.push(buildInspectTimelineStep());
        continue;
      }

      if (step.tool === 'workspace.search') {
        if (!policy?.allowLocalWorkspaceRead) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        const parsed = parseWorkspaceSearchStep(step.input);

        if (!parsed) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        nextPlan.push(parsed);
        continue;
      }

      if (step.tool === 'workspace.read_file') {
        if (!policy?.allowLocalWorkspaceRead) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        const parsed = parseWorkspaceReadFileStep(step.input);

        if (!parsed) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        nextPlan.push(parsed);
        continue;
      }

      if (step.tool === 'artifact.create_note') {
        const title = typeof step.input?.title === 'string' ? step.input.title.trim() : '';
        const content = typeof step.input?.content === 'string' ? step.input.content : '';

        if (!title || !content.trim()) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        nextPlan.push({
          kind: 'create_note',
          tool: 'artifact.create_note',
          input: {
            title,
            content,
          },
        });
        continue;
      }

      if (step.tool === 'task.update_next_step') {
        if (!policy?.allowTaskMutationTools) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        const parsed = parseTaskUpdateNextStep(step.input);

        if (!parsed) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        nextPlan.push(parsed);
        continue;
      }

      if (step.tool === 'task.create_completion_criterion') {
        if (!policy?.allowTaskMutationTools) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        const parsed = parseTaskCreateCompletionCriterion(step.input);

        if (!parsed) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        nextPlan.push(parsed);
        continue;
      }

      if (step.tool === 'source_context.create') {
        if (!policy?.allowTaskMutationTools) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        const parsed = parseSourceContextCreate(step.input);

        if (!parsed) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        nextPlan.push(parsed);
        continue;
      }

      if (step.tool === 'decision.draft') {
        if (!policy?.allowTaskMutationTools) {
          return this.buildLocalNotePlan({ modelOutput, taskTitle });
        }

        nextPlan.push(parseDecisionDraft(step.input));
        continue;
      }

      return this.buildLocalNotePlan({ modelOutput, taskTitle });
    }

    if (nextPlan.filter(isDomainMutationStep).length > 1) {
      return this.buildLocalNotePlan({ modelOutput, taskTitle });
    }

    if (!nextPlan.some(isMutationStep)) {
      return this.buildLocalNotePlan({ modelOutput, taskTitle });
    }

    return ensurePreWriteObservationSteps(nextPlan);
  }

  buildExecutionPlan(params: {
    proposal: AgentStepProposal | null | undefined;
    modelOutput: string;
    policy?: AgentRunRequest['policy'];
    taskTitle: string;
  }): AgentRunLoopPlan {
    const fallbackPlan = this.buildLocalNotePlan(params);

    if (!params.proposal?.steps.length) {
      return {
        source: 'fallback',
        steps: fallbackPlan,
      };
    }

    const proposalPlan = this.buildPlanFromProposal(params);

    return {
      source: JSON.stringify(proposalPlan) === JSON.stringify(fallbackPlan)
        ? 'fallback'
        : 'model_proposal',
      steps: proposalPlan,
    };
  }

  buildLocalNotePlan(params: {
    modelOutput: string;
    taskTitle: string;
  }): AgentRunLoopStep[] {
    const { modelOutput, taskTitle } = params;

    if (!modelOutput.trim()) {
      return [];
    }

    return [
      buildInspectContextStep(),
      buildInspectTimelineStep(),
      {
        kind: 'create_note',
        tool: 'artifact.create_note',
        input: {
          title: `${taskTitle} agent note`,
          content: modelOutput,
        },
      },
    ];
  }

  async recordObservationSummary(params: {
    runId: string;
    observations: AgentRunLoopObservation[];
  }): Promise<void> {
    if (!params.observations.length) {
      return;
    }

    await this.runStepRepository.create({
      runId: params.runId,
      kind: 'decision',
      status: params.observations.some((observation) => observation.status === 'failed')
        ? 'failed'
        : params.observations.some((observation) => observation.status === 'needs_confirmation')
          ? 'pending'
          : 'completed',
      title: '汇总 agent 工具观察',
      input: JSON.stringify(params.observations),
      output: formatObservationSummary(params.observations),
    });
  }

  async recordObservationPlannerDecision(params: {
    runId: string;
    observations: AgentRunLoopObservation[];
    nextTool: AgentToolName;
    decision: AgentObservationPlannerDecision;
  }): Promise<void> {
    await this.runStepRepository.create({
      runId: params.runId,
      kind: 'decision',
      status: params.decision.status,
      title: params.decision.title,
      input: JSON.stringify({
        observations: params.observations,
        nextTool: params.nextTool,
        action: params.decision.action,
      }),
      output: params.decision.reason,
    });
  }

  async recordResumeCheckpoint(params: {
    request: AgentRunRequest;
    observations: AgentRunLoopObservation[];
    nextTool: AgentToolName;
    nextInput: unknown;
    reason: string;
  }): Promise<string> {
    const step = await this.runStepRepository.create({
      runId: params.request.runId,
      kind: 'checkpoint',
      status: 'pending',
      title: '等待恢复 agent run',
      input: JSON.stringify({
        reason: params.reason,
        nextTool: params.nextTool,
        nextInput: params.nextInput,
      }),
      output: params.reason,
    });
    const checkpoint = await this.runCheckpointRepository.create({
      runId: params.request.runId,
      stepId: step.id,
      kind: 'resume',
      payload: JSON.stringify(createResumeCheckpointPayload({
        reason: params.reason,
        nextTool: params.nextTool,
        nextInput: params.nextInput,
        observations: params.observations,
        taskId: params.request.taskId,
      })),
    });

    return checkpoint.id;
  }

  async executeLocalNoteLoop(params: {
    request: AgentRunRequest;
    modelOutput: string;
    taskTitle: string;
    proposal?: AgentStepProposal | null;
  }): Promise<AgentRunLoopResult> {
    const { modelOutput, proposal, request, taskTitle } = params;
    const parsedProposal = proposal ?? this.extractStepProposal(modelOutput);
    const effectiveModelOutput = parsedProposal?.finalOutput ?? modelOutput;
    const trimmedOutput = effectiveModelOutput.trim();

    if (!trimmedOutput) {
      return {
        status: 'completed',
        output: effectiveModelOutput,
        observations: [],
      };
    }

    const executionPlan = this.buildExecutionPlan({
      proposal: parsedProposal,
      modelOutput: effectiveModelOutput,
      policy: request.policy,
      taskTitle,
    });

    await this.runStepRepository.create({
      runId: request.runId,
      kind: 'plan',
      status: 'completed',
      title: executionPlan.source === 'model_proposal'
        ? '采用模型提出的 agent 步骤计划'
        : '采用保守 fallback agent 步骤计划',
      input: parsedProposal ? JSON.stringify(parsedProposal) : null,
      output: executionPlan.steps.map((step, index) => `${index + 1}. ${step.tool}`).join('\n') || '无可执行步骤。',
    });

    const observations: AgentRunLoopObservation[] = [];
    let recordedPlannerDecision = false;

    for (const step of executionPlan.steps) {
      if (isMutationStep(step) && !recordedPlannerDecision) {
        const plannerDecision = evaluateObservationPlannerDecision({
          context: request.context,
          observations,
          nextTool: step.tool,
        });

        await this.recordObservationPlannerDecision({
          runId: request.runId,
          observations,
          nextTool: step.tool,
          decision: plannerDecision,
        });
        recordedPlannerDecision = true;

        if (plannerDecision.action === 'stop') {
          const checkpointId = await this.recordResumeCheckpoint({
            request,
            observations,
            nextTool: step.tool,
            nextInput: step.input,
            reason: plannerDecision.reason,
          });
          await this.recordObservationSummary({
            runId: request.runId,
            observations,
          });

          return {
            status: 'paused',
            message: plannerDecision.reason,
            checkpointId,
            observations,
          };
        }
      }

      const result = await this.agentToolRegistry.execute(
        step.tool,
        step.input,
        {
          runId: request.runId,
          taskId: request.taskId,
          workingContext: step.kind === 'inspect_context' || step.kind === 'inspect_timeline'
            ? request.context
            : undefined,
        },
        request.policy,
      );
      observations.push(observationFromTool(step.tool, result));

      if (result.status === 'needs_confirmation' && result.checkpointId) {
        await this.recordObservationSummary({
          runId: request.runId,
          observations,
        });

        return {
          status: 'needs_confirmation',
          message: result.summary,
          checkpointId: result.checkpointId,
          observations,
        };
      }

      if (!result.success) {
        await this.recordObservationSummary({
          runId: request.runId,
          observations,
        });

        return failedFromTool(result, observations);
      }
    }

    await this.recordObservationSummary({
      runId: request.runId,
      observations,
    });

    return {
      status: 'completed',
      output: effectiveModelOutput,
      observations,
    };
  }
}
