import type {
  AgentRunRequest,
  AgentSessionResult,
  ProviderToolCallPlan,
} from '../../../shared/types/agent-execution.js';
import type { AgentRunLoop } from './agent-run-loop.js';

export type AgentLocalNoteSessionInput = {
  request: AgentRunRequest;
  modelOutput: string;
  taskTitle: string;
};

export type AgentProviderNativeSessionInput = AgentLocalNoteSessionInput & {
  providerPlan: ProviderToolCallPlan;
};

export interface AgentExecutor {
  executeLocalNoteSession(input: AgentLocalNoteSessionInput): Promise<AgentSessionResult>;
  executeProviderNativeSession(input: AgentProviderNativeSessionInput): Promise<AgentSessionResult>;
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

  async executeProviderNativeSession(input: AgentProviderNativeSessionInput): Promise<AgentSessionResult> {
    const result = await this.agentRunLoop.executeLocalNoteLoop({
      request: input.request,
      modelOutput: input.modelOutput,
      proposal: input.providerPlan.proposal,
      taskTitle: input.taskTitle,
    });

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
