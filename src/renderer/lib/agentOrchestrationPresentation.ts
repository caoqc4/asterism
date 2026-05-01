import type {
  AgentAutomationReadinessEvaluation,
  AgentExecutionOrchestrationSnapshot,
} from '@shared/agent-orchestration';
import {
  buildAgentExecutorLifecycleAvailabilityPresentation,
  type AgentExecutorLifecycleAvailabilityPresentation,
  type AgentExecutorLifecycleServiceAvailability,
} from '@shared/agent-executor-lifecycle-diagnostics';

export type ReadOnlyOrchestrationPresentation = {
  runtime: string;
  profile: string;
  lifecycle: string;
  hiddenToolFamilies: string;
  executorLifecycle: AgentExecutorLifecycleAvailabilityPresentation | null;
  automationReadiness: string | null;
  summary: string;
};

export function buildExecutorLifecycleDiagnosticLines(
  executorLifecycle: AgentExecutorLifecycleAvailabilityPresentation | null,
): string[] {
  if (!executorLifecycle) {
    return [];
  }

  return [
    `Executor lifecycle：${executorLifecycle.status}`,
    executorLifecycle.runtime,
    executorLifecycle.authority,
    executorLifecycle.controlRequests,
    executorLifecycle.unsupportedControlRequests,
    executorLifecycle.settleResults,
    executorLifecycle.exposure,
    executorLifecycle.blocked,
    executorLifecycle.nextAction,
  ];
}

export function buildReadOnlyOrchestrationPresentation(params: {
  automationReadiness?: AgentAutomationReadinessEvaluation | null;
  executorLifecycleAvailability?: AgentExecutorLifecycleServiceAvailability | null;
  snapshot: AgentExecutionOrchestrationSnapshot;
}): ReadOnlyOrchestrationPresentation {
  const { automationReadiness = null, executorLifecycleAvailability = null, snapshot } = params;
  const hiddenFamilies = snapshot.hiddenFamilies.length
    ? snapshot.hiddenFamilies.join(',')
    : 'none';
  const executorLifecycle = executorLifecycleAvailability
    ? buildAgentExecutorLifecycleAvailabilityPresentation(executorLifecycleAvailability)
    : null;

  return {
    runtime: [
      `ExecutionRuntime：${snapshot.runtime.id}`,
      `status=${snapshot.runtime.status}`,
      `kind=${snapshot.runtime.kind}`,
      `tools=${snapshot.runtime.capabilityFamilies.join(',') || 'none'}`,
      snapshot.runtime.policySummary,
      snapshot.runtime.readinessSummary,
    ].join(' / '),
    profile: [
      `AgentProfile：${snapshot.profile.id}`,
      `role=${snapshot.profile.role}`,
      `tools=${snapshot.profile.allowedToolFamilies.join(',') || 'none'}`,
      `automation=${snapshot.profile.automationReadiness}`,
    ].join(' / '),
    lifecycle: [
      `AgentRunLifecycle：${snapshot.lifecycle.currentStage}`,
      `start=${snapshot.lifecycle.startMode}`,
      `queue=${snapshot.lifecycle.queueEnabled ? 'yes' : 'no'}`,
      `claim=${snapshot.lifecycle.claimEnabled ? 'yes' : 'no'}`,
      `scheduler=${snapshot.lifecycle.schedulerEnabled ? 'yes' : 'no'}`,
      `autoStart=${snapshot.lifecycle.automaticStartEnabled ? 'yes' : 'no'}`,
    ].join(' / '),
    hiddenToolFamilies: [
      'Hidden tool families',
      `families=${hiddenFamilies}`,
      'modelVisible=no',
    ].join(' / '),
    executorLifecycle,
    automationReadiness: automationReadiness
      ? [
          `Automation readiness：${automationReadiness.state}`,
          `evidence=${automationReadiness.evidence.length ? automationReadiness.evidence.join(',') : 'none'}`,
          `blocked=${automationReadiness.blockedReasons.length ? automationReadiness.blockedReasons.join('; ') : 'none'}`,
          `autoStart=${automationReadiness.automaticStartAllowed ? 'yes' : 'no'}`,
        ].join(' / ')
      : null,
    summary: [
      `runtime=${snapshot.runtime.status}`,
      `profile=${snapshot.profile.id}`,
      `lifecycle=${snapshot.lifecycle.currentStage}`,
      `hidden=${hiddenFamilies}`,
      'modelVisibleHiddenTools=no',
      `automation=${automationReadiness?.state ?? snapshot.profile.automationReadiness}`,
      `autoStart=${snapshot.lifecycle.automaticStartEnabled || automationReadiness?.automaticStartAllowed ? 'yes' : 'no'}`,
    ].join(' / '),
  };
}
