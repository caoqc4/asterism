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

export type AgentExecutorLifecycleServiceAvailability = {
  status: 'dry_run_available';
  runtimeReady: false;
  modelExposure: 'hidden';
  automaticStartAllowed: false;
  queueWorkerAllowed: false;
  reason: string;
  summary: string;
};

export function evaluateAgentExecutorLifecycleServiceAvailability(): AgentExecutorLifecycleServiceAvailability {
  return {
    status: 'dry_run_available',
    runtimeReady: false,
    modelExposure: 'hidden',
    automaticStartAllowed: false,
    queueWorkerAllowed: false,
    reason:
      'Executor lifecycle service is available as a dry-run adapter boundary only; no real runtime is launched.',
    summary: [
      'Executor lifecycle service availability',
      'status=dry_run_available',
      'runtimeReady=no',
      'modelExposure=hidden',
      'automaticStart=no',
      'queueWorker=no',
    ].join(' / '),
  };
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
