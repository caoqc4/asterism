import type {
  AgentRunRequest,
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

function failedFromTool(result: AgentToolResult): AgentRunLoopResult {
  return {
    status: 'failed',
    message: result.error ?? result.summary,
  };
}

export class AgentRunLoop {
  constructor(private readonly agentToolRegistry: AgentToolRegistry) {}

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

    const inspectResult = await this.agentToolRegistry.execute(
      'task.inspect_context',
      {},
      {
        runId: request.runId,
        taskId: request.taskId,
        workingContext: request.context,
      },
      request.policy,
    );

    if (!inspectResult.success) {
      return failedFromTool(inspectResult);
    }

    const writeResult = await this.agentToolRegistry.execute(
      'artifact.create_note',
      {
        title: `${taskTitle} agent note`,
        content: modelOutput,
      },
      {
        runId: request.runId,
        taskId: request.taskId,
      },
      request.policy,
    );

    if (writeResult.status === 'needs_confirmation' && writeResult.checkpointId) {
      return {
        status: 'needs_confirmation',
        message: writeResult.summary,
        checkpointId: writeResult.checkpointId,
      };
    }

    if (!writeResult.success) {
      return failedFromTool(writeResult);
    }

    return {
      status: 'completed',
      output: modelOutput,
    };
  }
}
