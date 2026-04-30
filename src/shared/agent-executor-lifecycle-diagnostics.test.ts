import { describe, expect, it } from 'vitest';

import {
  buildAgentExecutorLifecycleAvailabilityPresentation,
  type AgentExecutorLifecycleServiceAvailability,
} from './agent-executor-lifecycle-diagnostics.js';

function buildAvailability(): AgentExecutorLifecycleServiceAvailability {
  return {
    status: 'dry_run_available',
    runtimeReady: false,
    modelExposure: 'hidden',
    automaticStartAllowed: false,
    queueWorkerAllowed: false,
    blockedReasons: [
      'No real executor runtime is connected.',
      'Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.',
      'Model-visible tool exposure remains hidden.',
    ],
    nextAction: 'Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
    reason:
      'Executor lifecycle service is available as a dry-run adapter boundary only; no real runtime is launched.',
    summary: 'Executor lifecycle service availability / status=dry_run_available',
  };
}

describe('agent executor lifecycle diagnostics', () => {
  it('builds read-only presentation copy without implying runtime readiness', () => {
    expect(buildAgentExecutorLifecycleAvailabilityPresentation(buildAvailability())).toEqual({
      status: 'Executor lifecycle / status=dry_run_available',
      runtime: 'runtimeReady=no / queueWorker=no / automaticStart=no',
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
        'blocked=No real executor runtime is connected.; Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.; Model-visible tool exposure remains hidden.',
        'next=Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
      ].join(' / '),
    });
  });
});
