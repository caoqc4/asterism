import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import type {
  AgentExecutorLifecycleControlInput,
  AgentExecutorLifecycleObserveInput,
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
    }
  | {
      action: 'update_session_status';
      sessionId: string;
      status: AgentSessionRecord['status'];
      summary: string;
    };

export type AgentExecutorLifecycleStatusUpdater = {
  updateStatus(id: string, status: AgentSessionRecord['status']): Promise<AgentSessionRecord>;
};

export type AgentExecutorLifecycleSettlementApplyResult =
  | {
      applied: false;
      summary: string;
    }
  | {
      applied: true;
      session: AgentSessionRecord;
      summary: string;
    };

export type AgentExecutorLifecycleSettlementDiagnostic = {
  action: AgentExecutorLifecycleSettlementPlan['action'];
  autoReplay: false;
  sessionId: string;
  status: AgentSessionRecord['status'] | null;
  summary: string;
};

export type AgentExecutorLifecyclePlannedObservation = AgentExecutorLifecycleObservation & {
  settlementDiagnostic: AgentExecutorLifecycleSettlementDiagnostic;
  settlementPlan: AgentExecutorLifecycleSettlementPlan;
};

export function planAgentExecutorLifecycleSettlement(params: {
  sessionId: string;
  observation: Pick<AgentExecutorLifecycleObservation, 'projectedStatus' | 'terminalEventRecorded'>;
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
  };
}

export async function applyAgentExecutorLifecycleSettlementPlan(params: {
  plan: AgentExecutorLifecycleSettlementPlan;
  statusUpdater: AgentExecutorLifecycleStatusUpdater;
}): Promise<AgentExecutorLifecycleSettlementApplyResult> {
  if (params.plan.action === 'no_status_change') {
    return {
      applied: false,
      summary: [
        params.plan.summary,
        'applied=no',
      ].join(' / '),
    };
  }

  const session = await params.statusUpdater.updateStatus(params.plan.sessionId, params.plan.status);

  return {
    applied: true,
    session,
    summary: [
      params.plan.summary,
      'applied=yes',
    ].join(' / '),
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

  async observe(input: Omit<AgentExecutorLifecycleObserveInput, 'onEvent'>): Promise<AgentExecutorLifecycleObservation> {
    let recordedStep: RunStepRecord | null = null;
    const observed = await this.adapter.observe({
      ...input,
      onEvent: async (event) => {
        recordedStep = await this.recorder.record(event);
      },
    });

    return {
      projectedStatus: observed.projectedStatus,
      recordedStep,
      terminalEventRecorded: this.recorder.hasTerminalEvent(),
      terminalSessionStatus: this.recorder.getTerminalSessionStatus(),
    };
  }

  async controlAndPlan(
    input: Omit<AgentExecutorLifecycleControlInput, 'onEvent'>,
  ): Promise<AgentExecutorLifecyclePlannedObservation> {
    let recordedStep: RunStepRecord | null = null;
    const observed = await this.adapter.control({
      ...input,
      onEvent: async (event) => {
        recordedStep = await this.recorder.record(event);
      },
    });
    const observation = {
      projectedStatus: observed.projectedStatus,
      recordedStep,
      terminalEventRecorded: this.recorder.hasTerminalEvent(),
      terminalSessionStatus: this.recorder.getTerminalSessionStatus(),
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
