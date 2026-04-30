import {
  buildDryRunAgentExecutorLifecycleAvailability,
  type AgentExecutorLifecycleServiceAvailability,
} from '../../../shared/agent-executor-lifecycle-diagnostics.js';
import type { AgentExecutorSessionHandle } from '../../../shared/agent-executor-lifecycle.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { AgentSessionEventRecorder } from './agent-session-event-recorder.js';
import { AgentSessionStore } from './agent-session-store.js';
import { DryRunAgentExecutorLifecycleAdapter, type AgentExecutorLifecycleAdapter } from './agent-executor.js';
import { AgentExecutorLifecycleMonitor } from './agent-executor-lifecycle-monitor.js';
import { AgentExecutorLifecycleService } from './agent-executor-lifecycle-service.js';

export type AgentExecutorLifecycleServiceFactoryDependencies = {
  adapter?: AgentExecutorLifecycleAdapter;
  agentSessionStore?: AgentSessionStore;
  runStepRepository?: RunStepRepository;
};

export type AgentExecutorLifecycleServiceAvailabilityParams = {
  controlSupport?: Partial<AgentExecutorSessionHandle['control']>;
};

export function evaluateAgentExecutorLifecycleServiceAvailability(
  params: AgentExecutorLifecycleServiceAvailabilityParams = {},
): AgentExecutorLifecycleServiceAvailability {
  return buildDryRunAgentExecutorLifecycleAvailability({
    controlSupport: params.controlSupport,
  });
}

export function createAgentExecutorLifecycleService(
  dependencies: AgentExecutorLifecycleServiceFactoryDependencies = {},
): AgentExecutorLifecycleService {
  const runStepRepository = dependencies.runStepRepository ?? new RunStepRepository();
  const agentSessionStore = dependencies.agentSessionStore ?? new AgentSessionStore();
  const adapter = dependencies.adapter ?? new DryRunAgentExecutorLifecycleAdapter();

  return new AgentExecutorLifecycleService(
    new AgentExecutorLifecycleMonitor(
      adapter,
      new AgentSessionEventRecorder(runStepRepository),
    ),
    agentSessionStore,
  );
}
