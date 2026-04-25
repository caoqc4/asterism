import type {
  AgentRunRequest,
  AgentSessionResult,
} from '../../../shared/types/agent-execution.js';
import type { AgentRunLoop } from './agent-run-loop.js';

export type AgentLocalNoteSessionInput = {
  request: AgentRunRequest;
  modelOutput: string;
  taskTitle: string;
};

export interface AgentExecutor {
  executeLocalNoteSession(input: AgentLocalNoteSessionInput): Promise<AgentSessionResult>;
}

export class LocalAgentExecutor implements AgentExecutor {
  constructor(private readonly agentRunLoop: AgentRunLoop) {}

  async executeLocalNoteSession(input: AgentLocalNoteSessionInput): Promise<AgentSessionResult> {
    const result = await this.agentRunLoop.executeLocalNoteLoop(input);

    if (result.status === 'failed') {
      return {
        status: 'failed',
        failureKind: 'tool',
        message: result.message,
      };
    }

    if (result.status === 'paused') {
      return {
        status: 'paused',
        checkpointId: result.checkpointId,
        message: result.message,
      };
    }

    if (result.status === 'needs_confirmation') {
      return {
        status: 'needs_confirmation',
        checkpointId: result.checkpointId,
        message: result.message,
      };
    }

    return {
      status: 'completed',
      output: result.output,
    };
  }
}
