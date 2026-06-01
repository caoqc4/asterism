import type {
  AgentRuntimeCapabilities,
  AgentSessionEvent,
  AgentSessionRecord,
} from './types/agent-execution.js';
import { projectAgentRuntimeEventSessionStatus } from './agent-runtime-events.js';

export type AgentExecutorSessionHandle = {
  executorSessionId: string;
  runId: string;
  agentSessionId: string;
  runtimeId: string;
  profileId: string;
  startedAt: string;
  capabilities: AgentRuntimeCapabilities;
  control: {
    heartbeat: boolean;
    interrupt: boolean;
    cancel: boolean;
  };
};

export type AgentExecutorLifecycleSignal =
  | {
      type: 'heartbeat';
      summary: string;
      observedAt?: string | null;
    }
  | {
      type: 'interrupted';
      reason: string;
      observedAt?: string | null;
    }
  | {
      type: 'cancelled';
      reason: string;
      observedAt?: string | null;
    }
  | {
      type: 'settled';
      status: 'completed';
      output: string;
      observedAt?: string | null;
    }
  | {
      type: 'settled';
      status: 'failed';
      failureKind: string;
      message: string;
      observedAt?: string | null;
    }
  | {
      type: 'settled';
      status: 'paused';
      checkpointId: string;
      message: string;
      observedAt?: string | null;
    };

export type AgentExecutorLifecycleSettleResult =
  | {
      status: 'completed';
      output: string;
      observedAt?: string | null;
    }
  | {
      status: 'failed';
      failureKind: string;
      message: string;
      observedAt?: string | null;
    }
  | {
      status: 'paused';
      checkpointId: string;
      message: string;
      observedAt?: string | null;
    };

export type AgentExecutorLifecycleSettleStatus = AgentExecutorLifecycleSettleResult['status'];

export type AgentExecutorLifecycleControlRequest =
  | {
      type: 'heartbeat';
      summary: string;
      observedAt?: string | null;
    }
  | {
      type: 'interrupt';
      reason: string;
      observedAt?: string | null;
    }
  | {
      type: 'cancel';
      reason: string;
      observedAt?: string | null;
    };

export type AgentExecutorLifecycleControlRequestType = AgentExecutorLifecycleControlRequest['type'];

export const AGENT_EXECUTOR_LIFECYCLE_CONTROL_REQUEST_TYPES: readonly AgentExecutorLifecycleControlRequestType[] = [
  'heartbeat',
  'interrupt',
  'cancel',
];

export const AGENT_EXECUTOR_LIFECYCLE_SETTLE_STATUSES: readonly AgentExecutorLifecycleSettleStatus[] = [
  'completed',
  'failed',
  'paused',
];

export class UnsupportedExecutorLifecycleControlRequestError extends Error {
  readonly code = 'unsupported_executor_lifecycle_control_request';
  readonly requestType: AgentExecutorLifecycleControlRequestType;

  constructor(requestType: AgentExecutorLifecycleControlRequestType) {
    super(`Executor lifecycle control request ${requestType} is not supported by this handle.`);
    this.name = 'UnsupportedExecutorLifecycleControlRequestError';
    this.requestType = requestType;
  }
}

export type ExecutorLifecycleControlErrorDiagnostic = {
  code: UnsupportedExecutorLifecycleControlRequestError['code'];
  requestType: AgentExecutorLifecycleControlRequestType;
  message: string;
  summary: string;
};

export function isUnsupportedExecutorLifecycleControlRequestError(
  error: unknown,
): error is UnsupportedExecutorLifecycleControlRequestError {
  return error instanceof UnsupportedExecutorLifecycleControlRequestError;
}

export function buildExecutorLifecycleControlErrorDiagnostic(
  error: unknown,
): ExecutorLifecycleControlErrorDiagnostic | null {
  if (!isUnsupportedExecutorLifecycleControlRequestError(error)) {
    return null;
  }

  const summary = [
    `code=${error.code}`,
    `request=${error.requestType}`,
    `message=${error.message}`,
  ].join(' / ');

  return {
    code: error.code,
    requestType: error.requestType,
    message: error.message,
    summary,
  };
}

export function formatExecutorLifecycleControlError(error: unknown): string | null {
  return buildExecutorLifecycleControlErrorDiagnostic(error)?.summary ?? null;
}

export function buildExecutorLifecycleControlSupport(
  supported: Partial<Record<AgentExecutorLifecycleControlRequestType, boolean>> = {},
): AgentExecutorSessionHandle['control'] {
  return {
    heartbeat: supported.heartbeat ?? true,
    interrupt: supported.interrupt ?? true,
    cancel: supported.cancel ?? true,
  };
}

export function listSupportedExecutorLifecycleControlRequests(
  control: AgentExecutorSessionHandle['control'],
): AgentExecutorLifecycleControlRequestType[] {
  return AGENT_EXECUTOR_LIFECYCLE_CONTROL_REQUEST_TYPES.filter((request) => control[request]);
}

export function listUnsupportedExecutorLifecycleControlRequests(
  control: AgentExecutorSessionHandle['control'],
): AgentExecutorLifecycleControlRequestType[] {
  return AGENT_EXECUTOR_LIFECYCLE_CONTROL_REQUEST_TYPES.filter((request) => !control[request]);
}

export function getExecutorLifecycleControlKey(
  request: AgentExecutorLifecycleControlRequest,
): keyof AgentExecutorSessionHandle['control'] {
  switch (request.type) {
    case 'heartbeat':
      return 'heartbeat';
    case 'interrupt':
      return 'interrupt';
    case 'cancel':
      return 'cancel';
  }
}

export function isExecutorLifecycleControlSupported(params: {
  handle: AgentExecutorSessionHandle;
  request: AgentExecutorLifecycleControlRequest;
}): boolean {
  return params.handle.control[getExecutorLifecycleControlKey(params.request)];
}

export function assertExecutorLifecycleControlSupported(params: {
  handle: AgentExecutorSessionHandle;
  request: AgentExecutorLifecycleControlRequest;
}): void {
  const controlKey = getExecutorLifecycleControlKey(params.request);

  if (!isExecutorLifecycleControlSupported(params)) {
    throw new UnsupportedExecutorLifecycleControlRequestError(controlKey);
  }
}

export function mapExecutorLifecycleControlRequestToSignal(
  request: AgentExecutorLifecycleControlRequest,
): AgentExecutorLifecycleSignal {
  switch (request.type) {
    case 'heartbeat':
      return {
        type: 'heartbeat',
        summary: request.summary,
        observedAt: request.observedAt,
      };
    case 'interrupt':
      return {
        type: 'interrupted',
        reason: request.reason,
        observedAt: request.observedAt,
      };
    case 'cancel':
      return {
        type: 'cancelled',
        reason: request.reason,
        observedAt: request.observedAt,
      };
  }
}

export function mapExecutorLifecycleSettleResultToSignal(
  result: AgentExecutorLifecycleSettleResult,
): AgentExecutorLifecycleSignal {
  return {
    type: 'settled',
    ...result,
  };
}

export function mapExecutorLifecycleSignalToRuntimeEvent(params: {
  handle: AgentExecutorSessionHandle;
  signal: AgentExecutorLifecycleSignal;
}): AgentSessionEvent {
  const base = {
    runId: params.handle.runId,
    sessionId: params.handle.agentSessionId,
    createdAt: params.signal.observedAt ?? null,
  };

  switch (params.signal.type) {
    case 'heartbeat':
      return {
        ...base,
        type: 'session.heartbeat',
        summary: params.signal.summary,
      };
    case 'interrupted':
      return {
        ...base,
        type: 'session.interrupted',
        reason: params.signal.reason,
      };
    case 'cancelled':
      return {
        ...base,
        type: 'session.cancelled',
        reason: params.signal.reason,
      };
    case 'settled':
      if (params.signal.status === 'completed') {
        return {
          ...base,
          type: 'session.completed',
          output: params.signal.output,
        };
      }

      if (params.signal.status === 'failed') {
        return {
          ...base,
          type: 'session.failed',
          failureKind: params.signal.failureKind,
          message: params.signal.message,
        };
      }

      return {
        ...base,
        type: 'session.paused',
        checkpointId: params.signal.checkpointId,
        message: params.signal.message,
      };
  }
}

export function projectExecutorLifecycleSignalSessionStatus(params: {
  handle: AgentExecutorSessionHandle;
  signal: AgentExecutorLifecycleSignal;
}): AgentSessionRecord['status'] | null {
  return projectAgentRuntimeEventSessionStatus(mapExecutorLifecycleSignalToRuntimeEvent(params));
}
