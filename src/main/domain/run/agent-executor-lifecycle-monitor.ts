import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import type {
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

export class AgentExecutorLifecycleMonitor {
  constructor(
    private readonly adapter: AgentExecutorLifecycleAdapter,
    private readonly recorder: AgentSessionEventRecorder,
  ) {}

  async startSession(input: AgentExecutorLifecycleStartInput) {
    return this.adapter.startSession(input);
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
}
