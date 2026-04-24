import type {
  AgentRunRequest,
  AgentStepProposal,
  AgentToolName,
  AgentToolResult,
} from '../../../shared/types/agent-execution.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { AgentToolRegistry } from './agent-tool-registry.js';

export type AgentRunLoopResult =
  | {
      status: 'completed';
      output: string;
    }
  | {
      status: 'failed';
      message: string;
    }
  | {
      status: 'needs_confirmation';
      message: string;
      checkpointId: string;
    };

export type AgentRunLoopStep =
  | {
      kind: 'inspect_context';
      tool: Extract<AgentToolName, 'task.inspect_context'>;
      input: Record<string, never>;
    }
  | {
      kind: 'create_note';
      tool: Extract<AgentToolName, 'artifact.create_note'>;
      input: {
        title: string;
        content: string;
      };
    };

type AgentRunLoopPlan = {
  source: 'model_proposal' | 'fallback';
  steps: AgentRunLoopStep[];
};

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

function failedFromTool(result: AgentToolResult): AgentRunLoopResult {
  return {
    status: 'failed',
    message: result.error ?? result.summary,
  };
}

export class AgentRunLoop {
  constructor(
    private readonly agentToolRegistry: AgentToolRegistry,
    private readonly runStepRepository: RunStepRepository = new RunStepRepository(),
  ) {}

  extractStepProposal(modelOutput: string): AgentStepProposal | null {
    return parseModelProposal(modelOutput);
  }

  buildPlanFromProposal(params: {
    proposal: AgentStepProposal | null | undefined;
    modelOutput: string;
    taskTitle: string;
  }): AgentRunLoopStep[] {
    const { modelOutput, proposal, taskTitle } = params;

    if (!proposal?.steps.length) {
      return this.buildLocalNotePlan({ modelOutput, taskTitle });
    }

    const nextPlan: AgentRunLoopStep[] = [];

    for (const step of proposal.steps) {
      if (step.tool === 'task.inspect_context') {
        nextPlan.push({
          kind: 'inspect_context',
          tool: 'task.inspect_context',
          input: {},
        });
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

      return this.buildLocalNotePlan({ modelOutput, taskTitle });
    }

    if (!nextPlan.some((step) => step.kind === 'create_note')) {
      return this.buildLocalNotePlan({ modelOutput, taskTitle });
    }

    return nextPlan;
  }

  buildExecutionPlan(params: {
    proposal: AgentStepProposal | null | undefined;
    modelOutput: string;
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
      {
        kind: 'inspect_context',
        tool: 'task.inspect_context',
        input: {},
      },
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
      };
    }

    const executionPlan = this.buildExecutionPlan({
      proposal: parsedProposal,
      modelOutput: effectiveModelOutput,
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

    for (const step of executionPlan.steps) {
      const result = await this.agentToolRegistry.execute(
        step.tool,
        step.input,
        {
          runId: request.runId,
          taskId: request.taskId,
          workingContext: step.kind === 'inspect_context' ? request.context : undefined,
        },
        request.policy,
      );

      if (result.status === 'needs_confirmation' && result.checkpointId) {
        return {
          status: 'needs_confirmation',
          message: result.summary,
          checkpointId: result.checkpointId,
        };
      }

      if (!result.success) {
        return failedFromTool(result);
      }
    }

    return {
      status: 'completed',
      output: effectiveModelOutput,
    };
  }
}
