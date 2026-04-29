import type {
  AgentExecutorLifecycleObserveInput,
  AgentExecutorLifecycleStartInput,
} from './agent-executor.js';
import {
  AgentExecutorLifecycleMonitor,
  applyAgentExecutorLifecycleSettlementPlan,
  type AgentExecutorLifecycleSettlementPlan,
  type AgentExecutorLifecycleStatusUpdater,
} from './agent-executor-lifecycle-monitor.js';

export class AgentExecutorLifecycleService {
  constructor(
    private readonly monitor: AgentExecutorLifecycleMonitor,
    private readonly statusUpdater: AgentExecutorLifecycleStatusUpdater,
  ) {}

  startSession(input: AgentExecutorLifecycleStartInput) {
    return this.monitor.startSession(input);
  }

  observeAndPlan(input: Omit<AgentExecutorLifecycleObserveInput, 'onEvent'>) {
    return this.monitor.observeAndPlan(input);
  }

  applySettlementPlan(plan: AgentExecutorLifecycleSettlementPlan) {
    return applyAgentExecutorLifecycleSettlementPlan({
      plan,
      statusUpdater: this.statusUpdater,
    });
  }
}
