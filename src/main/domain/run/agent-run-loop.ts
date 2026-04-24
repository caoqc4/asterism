import type {
  AgentRunRequest,
  AgentToolName,
  AgentToolResult,
} from '../../../shared/types/agent-execution.js';
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

function failedFromTool(result: AgentToolResult): AgentRunLoopResult {
  return {
    status: 'failed',
    message: result.error ?? result.summary,
  };
}

export class AgentRunLoop {
  constructor(private readonly agentToolRegistry: AgentToolRegistry) {}

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
  }): Promise<AgentRunLoopResult> {
    const { modelOutput, request, taskTitle } = params;
    const trimmedOutput = modelOutput.trim();

    if (!trimmedOutput) {
      return {
        status: 'completed',
        output: modelOutput,
      };
    }

    for (const step of this.buildLocalNotePlan({ modelOutput, taskTitle })) {
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
      output: modelOutput,
    };
  }
}
