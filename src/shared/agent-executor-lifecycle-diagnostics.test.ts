import { describe, expect, it } from 'vitest';

import {
  buildAgentExecutorLifecycleAvailabilityPresentation,
  buildDryRunAgentExecutorLifecycleAvailability,
  type AgentExecutorLifecycleServiceAvailability,
} from './agent-executor-lifecycle-diagnostics.js';

function buildAvailability(): AgentExecutorLifecycleServiceAvailability {
  return {
    status: 'dry_run_available',
    runtimeReady: false,
    modelExposure: 'hidden',
    automaticStartAllowed: false,
    queueWorkerAllowed: false,
    supportedControlRequests: ['heartbeat', 'interrupt', 'cancel'],
    blockedReasons: [
      'No real executor runtime is connected.',
      'Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.',
      'Model-visible tool exposure remains hidden.',
    ],
    nextAction: 'Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
    reason:
      'Executor lifecycle service is available as a dry-run adapter boundary only; no real runtime is launched.',
    summary: [
      'Executor lifecycle service availability',
      'status=dry_run_available',
      'runtimeReady=no',
      'modelExposure=hidden',
      'automaticStart=no',
      'queueWorker=no',
      'controlRequests=heartbeat,interrupt,cancel',
      'blocked=No real executor runtime is connected.; Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.; Model-visible tool exposure remains hidden.',
      'next=Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
    ].join(' / '),
  };
}

describe('agent executor lifecycle diagnostics', () => {
  it('builds the shared dry-run availability baseline', () => {
    expect(buildDryRunAgentExecutorLifecycleAvailability()).toEqual(buildAvailability());
  });

  it('can describe partial dry-run control support without implying runtime readiness', () => {
    const availability = buildDryRunAgentExecutorLifecycleAvailability({
      controlSupport: {
        cancel: false,
      },
    });

    expect(availability.supportedControlRequests).toEqual(['heartbeat', 'interrupt']);
    expect(availability.summary).toContain('controlRequests=heartbeat,interrupt');
    expect(buildAgentExecutorLifecycleAvailabilityPresentation(availability)).toMatchObject({
      controlRequests: 'controlRequests=heartbeat,interrupt / controlMode=dry_run_planned',
      runtime: 'runtimeReady=no / queueWorker=no / automaticStart=no',
    });
  });

  it('builds read-only presentation copy without implying runtime readiness', () => {
    expect(buildAgentExecutorLifecycleAvailabilityPresentation(buildAvailability())).toEqual({
      status: 'Executor lifecycle / status=dry_run_available',
      runtime: 'runtimeReady=no / queueWorker=no / automaticStart=no',
      controlRequests: 'controlRequests=heartbeat,interrupt,cancel / controlMode=dry_run_planned',
      exposure: 'modelExposure=hidden / modelVisibleTools=no',
      blocked: [
        'blocked=No real executor runtime is connected.',
        'Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.',
        'Model-visible tool exposure remains hidden.',
      ].join('; '),
      nextAction:
        'next=Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
      summary: [
        'Executor lifecycle diagnostics',
        'status=dry_run_available',
        'runtimeReady=no',
        'modelExposure=hidden',
        'automaticStart=no',
        'queueWorker=no',
        'controlRequests=heartbeat,interrupt,cancel',
        'blocked=No real executor runtime is connected.; Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.; Model-visible tool exposure remains hidden.',
        'next=Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
      ].join(' / '),
    });
  });
});
