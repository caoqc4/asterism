import {
  buildExecutorLifecycleControlSupport,
  listSupportedExecutorLifecycleControlRequests,
  type AgentExecutorLifecycleControlRequestType,
  type AgentExecutorSessionHandle,
} from './agent-executor-lifecycle.js';

export type AgentExecutorLifecycleServiceAvailability = {
  status: 'dry_run_available';
  runtimeReady: false;
  modelExposure: 'hidden';
  automaticStartAllowed: false;
  queueWorkerAllowed: false;
  supportedControlRequests: AgentExecutorLifecycleControlRequestType[];
  blockedReasons: string[];
  nextAction: string;
  reason: string;
  summary: string;
};

export type AgentExecutorLifecycleAvailabilityPresentation = {
  status: string;
  runtime: string;
  controlRequests: string;
  exposure: string;
  blocked: string;
  nextAction: string;
  summary: string;
};

export function buildDryRunAgentExecutorLifecycleAvailability(params: {
  controlSupport?: Partial<AgentExecutorSessionHandle['control']>;
} = {}): AgentExecutorLifecycleServiceAvailability {
  const blockedReasons = [
    'No real executor runtime is connected.',
    'Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.',
    'Model-visible tool exposure remains hidden.',
  ];
  const nextAction = 'Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.';
  const supportedControlRequests = listSupportedExecutorLifecycleControlRequests(
    buildExecutorLifecycleControlSupport(params.controlSupport),
  );

  return {
    status: 'dry_run_available',
    runtimeReady: false,
    modelExposure: 'hidden',
    automaticStartAllowed: false,
    queueWorkerAllowed: false,
    supportedControlRequests,
    blockedReasons,
    nextAction,
    reason:
      'Executor lifecycle service is available as a dry-run adapter boundary only; no real runtime is launched.',
    summary: [
      'Executor lifecycle service availability',
      'status=dry_run_available',
      'runtimeReady=no',
      'modelExposure=hidden',
      'automaticStart=no',
      'queueWorker=no',
      `controlRequests=${supportedControlRequests.join(',') || 'none'}`,
      `blocked=${blockedReasons.join('; ')}`,
      `next=${nextAction}`,
    ].join(' / '),
  };
}

export function buildAgentExecutorLifecycleAvailabilityPresentation(
  availability: AgentExecutorLifecycleServiceAvailability,
): AgentExecutorLifecycleAvailabilityPresentation {
  return {
    status: [
      'Executor lifecycle',
      `status=${availability.status}`,
    ].join(' / '),
    runtime: [
      `runtimeReady=${availability.runtimeReady ? 'yes' : 'no'}`,
      `queueWorker=${availability.queueWorkerAllowed ? 'yes' : 'no'}`,
      `automaticStart=${availability.automaticStartAllowed ? 'yes' : 'no'}`,
    ].join(' / '),
    controlRequests: [
      `controlRequests=${availability.supportedControlRequests.join(',') || 'none'}`,
      'controlMode=dry_run_planned',
    ].join(' / '),
    exposure: [
      `modelExposure=${availability.modelExposure}`,
      'modelVisibleTools=no',
    ].join(' / '),
    blocked: availability.blockedReasons.length
      ? `blocked=${availability.blockedReasons.join('; ')}`
      : 'blocked=none',
    nextAction: `next=${availability.nextAction}`,
    summary: [
      'Executor lifecycle diagnostics',
      `status=${availability.status}`,
      `runtimeReady=${availability.runtimeReady ? 'yes' : 'no'}`,
      `modelExposure=${availability.modelExposure}`,
      `automaticStart=${availability.automaticStartAllowed ? 'yes' : 'no'}`,
      `queueWorker=${availability.queueWorkerAllowed ? 'yes' : 'no'}`,
      `controlRequests=${availability.supportedControlRequests.join(',') || 'none'}`,
      `blocked=${availability.blockedReasons.length ? availability.blockedReasons.join('; ') : 'none'}`,
      `next=${availability.nextAction}`,
    ].join(' / '),
  };
}
