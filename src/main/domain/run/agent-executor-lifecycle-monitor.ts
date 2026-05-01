import type { AgentSessionEvent, AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import type {
  AgentExecutorLifecycleControlInput,
  AgentExecutorLifecycleObserveInput,
  AgentExecutorLifecycleSettleInput,
  AgentExecutorLifecycleStartInput,
  AgentExecutorLifecycleAdapter,
} from './agent-executor.js';
import { AgentSessionEventRecorder } from './agent-session-event-recorder.js';

export type AgentExecutorLifecycleObservation = {
  projectedStatus: AgentSessionRecord['status'] | null;
  recordedStep: RunStepRecord | null;
  terminalEventRecorded: boolean;
  terminalSessionStatus: AgentSessionRecord['status'] | null;
};

export type AgentExecutorLifecycleSettlementPlan =
  | {
      action: 'no_status_change';
      sessionId: string;
      summary: string;
      terminalEventRecorded: boolean;
      terminalSessionStatus: AgentSessionRecord['status'] | null;
    }
  | {
      action: 'update_session_status';
      sessionId: string;
      status: AgentSessionRecord['status'];
      summary: string;
      terminalEventRecorded: boolean;
      terminalSessionStatus: AgentSessionRecord['status'] | null;
    };

export type AgentExecutorLifecycleStatusUpdater = {
  updateStatus(id: string, status: AgentSessionRecord['status']): Promise<AgentSessionRecord>;
};

export type AgentExecutorLifecycleSettlementApplyResult =
  | {
      action: 'no_status_change';
      applied: false;
      autoReplay: false;
      sessionId: string;
      status: null;
      summary: string;
      terminalEventRecorded: boolean;
      terminalSessionStatus: AgentSessionRecord['status'] | null;
    }
  | {
      action: 'update_session_status';
      applied: true;
      autoReplay: false;
      session: AgentSessionRecord;
      sessionId: string;
      status: AgentSessionRecord['status'];
      summary: string;
      terminalEventRecorded: boolean;
      terminalSessionStatus: AgentSessionRecord['status'] | null;
    };

export type AgentExecutorLifecycleSettlementDiagnostic = {
  action: AgentExecutorLifecycleSettlementPlan['action'];
  autoReplay: false;
  sessionId: string;
  status: AgentSessionRecord['status'] | null;
  summary: string;
  terminalEventRecorded: boolean;
  terminalSessionStatus: AgentSessionRecord['status'] | null;
};

export type AgentExecutorLifecyclePlannedObservation = AgentExecutorLifecycleObservation & {
  settlementDiagnostic: AgentExecutorLifecycleSettlementDiagnostic;
  settlementPlan: AgentExecutorLifecycleSettlementPlan;
};

export function planAgentExecutorLifecycleSettlement(params: {
  sessionId: string;
  observation: Pick<
    AgentExecutorLifecycleObservation,
    'projectedStatus' | 'terminalEventRecorded' | 'terminalSessionStatus'
  >;
}): AgentExecutorLifecycleSettlementPlan {
  if (!params.observation.projectedStatus) {
    return {
      action: 'no_status_change',
      sessionId: params.sessionId,
      summary: [
        'Executor lifecycle settlement',
        `session=${params.sessionId}`,
        'action=no_status_change',
        'reason=no_projected_status',
        'autoReplay=no',
      ].join(' / '),
      terminalEventRecorded: params.observation.terminalEventRecorded,
      terminalSessionStatus: params.observation.terminalSessionStatus,
    };
  }

  return {
    action: 'update_session_status',
    sessionId: params.sessionId,
    status: params.observation.projectedStatus,
    summary: [
      'Executor lifecycle settlement',
      `session=${params.sessionId}`,
      `status=${params.observation.projectedStatus}`,
      `terminalEvent=${params.observation.terminalEventRecorded ? 'yes' : 'no'}`,
      'action=update_session_status',
      'autoReplay=no',
    ].join(' / '),
    terminalEventRecorded: params.observation.terminalEventRecorded,
    terminalSessionStatus: params.observation.terminalSessionStatus,
  };
}

export function buildAgentExecutorLifecycleSettlementDiagnostic(
  plan: AgentExecutorLifecycleSettlementPlan,
): AgentExecutorLifecycleSettlementDiagnostic {
  return {
    action: plan.action,
    autoReplay: false,
    sessionId: plan.sessionId,
    status: plan.action === 'update_session_status' ? plan.status : null,
    summary: plan.summary,
    terminalEventRecorded: plan.terminalEventRecorded,
    terminalSessionStatus: plan.terminalSessionStatus,
  };
}

export async function applyAgentExecutorLifecycleSettlementPlan(params: {
  plan: AgentExecutorLifecycleSettlementPlan;
  statusUpdater: AgentExecutorLifecycleStatusUpdater;
}): Promise<AgentExecutorLifecycleSettlementApplyResult> {
  if (params.plan.action === 'no_status_change') {
    return {
      action: 'no_status_change',
      applied: false,
      autoReplay: false,
      sessionId: params.plan.sessionId,
      status: null,
      summary: [
        params.plan.summary,
        'applied=no',
      ].join(' / '),
      terminalEventRecorded: params.plan.terminalEventRecorded,
      terminalSessionStatus: params.plan.terminalSessionStatus,
    };
  }

  const session = await params.statusUpdater.updateStatus(params.plan.sessionId, params.plan.status);

  return {
    action: 'update_session_status',
    applied: true,
    autoReplay: false,
    session,
    sessionId: params.plan.sessionId,
    status: params.plan.status,
    summary: [
      params.plan.summary,
      'applied=yes',
    ].join(' / '),
    terminalEventRecorded: params.plan.terminalEventRecorded,
    terminalSessionStatus: params.plan.terminalSessionStatus,
  };
}

export class AgentExecutorLifecycleMonitor {
  constructor(
    private readonly adapter: AgentExecutorLifecycleAdapter,
    private readonly recorder: AgentSessionEventRecorder,
  ) {}

  async startSession(input: AgentExecutorLifecycleStartInput) {
    return this.adapter.startSession(input);
  }

  private buildPlannedObservation(params: {
    handle: AgentExecutorLifecycleObserveInput['handle'];
    observation: AgentExecutorLifecycleObservation;
  }): AgentExecutorLifecyclePlannedObservation {
    const settlementPlan = planAgentExecutorLifecycleSettlement({
      sessionId: params.handle.agentSessionId,
      observation: params.observation,
    });

    return {
      ...params.observation,
      settlementDiagnostic: buildAgentExecutorLifecycleSettlementDiagnostic(settlementPlan),
      settlementPlan,
    };
  }

  private async recordScopedEvent(
    event: AgentSessionEvent,
    handle: AgentExecutorLifecycleObserveInput['handle'],
  ): Promise<RunStepRecord | null> {
    return this.recorder.record({
      ...event,
      sessionId: handle.agentSessionId,
    });
  }

  async observe(input: Omit<AgentExecutorLifecycleObserveInput, 'onEvent'>): Promise<AgentExecutorLifecycleObservation> {
    let recordedStep: RunStepRecord | null = null;
    const observed = await this.adapter.observe({
      ...input,
      onEvent: async (event) => {
        recordedStep = await this.recordScopedEvent(event, input.handle);
      },
    });

    return {
      projectedStatus: observed.projectedStatus,
      recordedStep,
      terminalEventRecorded: this.recorder.hasTerminalEvent(input.handle.agentSessionId),
      terminalSessionStatus: this.recorder.getTerminalSessionStatus(input.handle.agentSessionId),
    };
  }

  async controlAndPlan(
    input: Omit<AgentExecutorLifecycleControlInput, 'onEvent'>,
  ): Promise<AgentExecutorLifecyclePlannedObservation> {
    let recordedStep: RunStepRecord | null = null;
    const observed = await this.adapter.control({
      ...input,
      onEvent: async (event) => {
        recordedStep = await this.recordScopedEvent(event, input.handle);
      },
    });
    const observation = {
      projectedStatus: observed.projectedStatus,
      recordedStep,
      terminalEventRecorded: this.recorder.hasTerminalEvent(input.handle.agentSessionId),
      terminalSessionStatus: this.recorder.getTerminalSessionStatus(input.handle.agentSessionId),
    };

    return this.buildPlannedObservation({
      handle: input.handle,
      observation,
    });
  }

  async settleAndPlan(
    input: Omit<AgentExecutorLifecycleSettleInput, 'onEvent'>,
  ): Promise<AgentExecutorLifecyclePlannedObservation> {
    let recordedStep: RunStepRecord | null = null;
    const observed = await this.adapter.settle({
      ...input,
      onEvent: async (event) => {
        recordedStep = await this.recordScopedEvent(event, input.handle);
      },
    });
    const observation = {
      projectedStatus: observed.projectedStatus,
      recordedStep,
      terminalEventRecorded: this.recorder.hasTerminalEvent(input.handle.agentSessionId),
      terminalSessionStatus: this.recorder.getTerminalSessionStatus(input.handle.agentSessionId),
    };

    return this.buildPlannedObservation({
      handle: input.handle,
      observation,
    });
  }

  async observeAndPlan(
    input: Omit<AgentExecutorLifecycleObserveInput, 'onEvent'>,
  ): Promise<AgentExecutorLifecyclePlannedObservation> {
    const observation = await this.observe(input);

    return this.buildPlannedObservation({
      handle: input.handle,
      observation,
    });
  }
}
