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
