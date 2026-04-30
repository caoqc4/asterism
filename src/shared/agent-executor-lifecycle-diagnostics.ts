export type AgentExecutorLifecycleServiceAvailability = {
  status: 'dry_run_available';
  runtimeReady: false;
  modelExposure: 'hidden';
  automaticStartAllowed: false;
  queueWorkerAllowed: false;
  blockedReasons: string[];
  nextAction: string;
  reason: string;
  summary: string;
};

export type AgentExecutorLifecycleAvailabilityPresentation = {
  status: string;
  runtime: string;
  exposure: string;
  blocked: string;
  nextAction: string;
  summary: string;
};

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
      `blocked=${availability.blockedReasons.length ? availability.blockedReasons.join('; ') : 'none'}`,
      `next=${availability.nextAction}`,
    ].join(' / '),
  };
}
