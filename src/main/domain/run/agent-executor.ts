import type {
  AgentRuntimeCapabilities,
  AgentRunRequest,
  AgentSessionEvent,
  AgentSessionRecord,
  AgentSessionResult,
  ProviderToolCallPlan,
} from '../../../shared/types/agent-execution.js';
import {
  mapExecutorLifecycleControlRequestToSignal,
  mapExecutorLifecycleSignalToRuntimeEvent,
  projectExecutorLifecycleSignalSessionStatus,
  type AgentExecutorLifecycleControlRequest,
  type AgentExecutorLifecycleSignal,
  type AgentExecutorSessionHandle,
} from '../../../shared/agent-executor-lifecycle.js';
import type { AgentRunLoopEventSink, AgentRunLoopResult } from './agent-run-loop.js';
import type { AgentRunLoop } from './agent-run-loop.js';

export type AgentLocalNoteSessionInput = {
  request: AgentRunRequest;
  modelOutput: string;
  taskTitle: string;
  onEvent?: AgentRunLoopEventSink | null;
  recordPlanRunStep?: boolean;
};

export type AgentProviderNativeSessionInput = AgentLocalNoteSessionInput & {
  providerPlan: ProviderToolCallPlan;
};

export interface AgentExecutor {
  executeLocalNoteSession(input: AgentLocalNoteSessionInput): Promise<AgentSessionResult>;
  executeProviderNativeSession(input: AgentProviderNativeSessionInput): Promise<AgentSessionResult>;
}

export type AgentExecutorLifecycleStartInput = {
  runId: string;
  agentSessionId: string;
  runtimeId: string;
  profileId: string;
  capabilities: AgentRuntimeCapabilities;
  nowIso?: string | null;
};

export type AgentExecutorLifecycleObserveInput = {
  handle: AgentExecutorSessionHandle;
  signal: AgentExecutorLifecycleSignal;
  onEvent?: ((event: AgentSessionEvent) => Promise<void> | void) | null;
};

export type AgentExecutorLifecycleControlInput = {
  handle: AgentExecutorSessionHandle;
  request: AgentExecutorLifecycleControlRequest;
  onEvent?: ((event: AgentSessionEvent) => Promise<void> | void) | null;
};

export interface AgentExecutorLifecycleAdapter {
  startSession(input: AgentExecutorLifecycleStartInput): Promise<AgentExecutorSessionHandle>;
  control(input: AgentExecutorLifecycleControlInput): Promise<{
    event: AgentSessionEvent;
    projectedStatus: AgentSessionRecord['status'] | null;
  }>;
  observe(input: AgentExecutorLifecycleObserveInput): Promise<{
    event: AgentSessionEvent;
    projectedStatus: AgentSessionRecord['status'] | null;
  }>;
}

export class LocalAgentExecutor implements AgentExecutor {
  constructor(private readonly agentRunLoop: AgentRunLoop) {}

  async executeLocalNoteSession(input: AgentLocalNoteSessionInput): Promise<AgentSessionResult> {
    const result = await this.agentRunLoop.executeLocalNoteLoop(input);
    return toAgentSessionResult(result);
  }

  async executeProviderNativeSession(input: AgentProviderNativeSessionInput): Promise<AgentSessionResult> {
    const result = await this.agentRunLoop.executeLocalNoteLoop({
      onEvent: input.onEvent,
      request: input.request,
      modelOutput: input.modelOutput,
      proposal: input.providerPlan.proposal,
      proposalSource: 'provider_tool_call',
      recordPlanRunStep: input.recordPlanRunStep,
      taskTitle: input.taskTitle,
    });

    return toAgentSessionResult(result);
  }
}

export class DryRunAgentExecutorLifecycleAdapter implements AgentExecutorLifecycleAdapter {
  async startSession(input: AgentExecutorLifecycleStartInput): Promise<AgentExecutorSessionHandle> {
    return {
      executorSessionId: `dry-run:${input.agentSessionId}`,
      runId: input.runId,
      agentSessionId: input.agentSessionId,
      runtimeId: input.runtimeId,
      profileId: input.profileId,
      startedAt: input.nowIso ?? new Date().toISOString(),
      capabilities: input.capabilities,
      control: {
        heartbeat: true,
        interrupt: true,
        cancel: true,
      },
    };
  }

  async observe(input: AgentExecutorLifecycleObserveInput): Promise<{
    event: AgentSessionEvent;
    projectedStatus: AgentSessionRecord['status'] | null;
  }> {
    const event = mapExecutorLifecycleSignalToRuntimeEvent({
      handle: input.handle,
      signal: input.signal,
    });

    await input.onEvent?.(event);

    return {
      event,
      projectedStatus: projectExecutorLifecycleSignalSessionStatus({
        handle: input.handle,
        signal: input.signal,
      }),
    };
  }

  async control(input: AgentExecutorLifecycleControlInput): Promise<{
    event: AgentSessionEvent;
    projectedStatus: AgentSessionRecord['status'] | null;
  }> {
    return this.observe({
      handle: input.handle,
      onEvent: input.onEvent,
      signal: mapExecutorLifecycleControlRequestToSignal(input.request),
    });
  }
}

function toAgentSessionResult(result: AgentRunLoopResult): AgentSessionResult {
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
