import { describe, expect, it } from 'vitest';

import {
  buildAgentExecutionOrchestrationSnapshot,
  evaluateSkillInformedAutomationReadiness,
} from '@shared/agent-orchestration';
import { buildDryRunAgentExecutorLifecycleAvailability } from '@shared/agent-executor-lifecycle-diagnostics';
import type { AiConfigStatus } from '@shared/types/settings';
import type { TaskDetail } from '@shared/types/task';
import {
  buildExecutorLifecycleDiagnosticLines,
  buildReadOnlyOrchestrationPresentation,
} from './agentOrchestrationPresentation';

function buildReadyAiStatus(): AiConfigStatus {
  return {
    configured: true,
    apiKeyStored: true,
    apiKeySource: 'env',
    provider: 'fal-openrouter',
    model: 'google/gemini-2.5-flash',
    baseUrl: null,
    workspaceRoot: '/tmp/taskplane-workspace',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/tmp/taskplane-config.json',
    featureFlags: {
      enableScheduler: false,
      enableSandboxCodingAgent: true,
    },
    sandboxBackendStatus: {
      probe: {
        backendId: 'local-container',
        environmentPolicy: 'empty',
        isolation: 'container',
        kind: 'local_container',
        networkMode: 'disabled',
        status: 'available',
        supportsOutputLimits: true,
        supportsPatchArtifacts: true,
        supportsStagedWrites: true,
        supportsStructuredCommands: true,
        supportsTargetedCommands: true,
        supportsWorkspaceMount: true,
      },
      profile: {
        credentialPassthrough: false,
        environmentPolicy: 'empty',
        id: 'local-container',
        isolation: 'container',
        kind: 'local_container',
        networkMode: 'disabled',
        supportsOutputLimits: true,
        supportsPatchArtifacts: true,
        supportsStagedWrites: true,
        supportsStructuredCommands: true,
        supportsTargetedCommands: true,
        supportsWorkspaceMount: true,
      },
      producerBackendReadiness: {
        blockedReasons: [],
        ready: true,
        summary: 'Sandboxed coding producer backend ready: local-container',
      },
      readiness: {
        blockedReasons: [],
        ready: true,
        summary: 'Sandbox backend ready: local-container.',
      },
      summary: 'Sandbox backend ready: local-container.',
    },
  };
}

function buildTaskDetail(): TaskDetail {
  return {
    activeBlocker: null,
    activeDependency: null,
    activeWaitingItem: null,
    artifacts: [],
    availableProcessTemplates: [],
    completionCriteria: [
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'criterion-1',
        text: 'Patch preview evidence is reviewed.',
        satisfiedAt: null,
        status: 'open',
        taskId: 'task-1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        verificationResponsibility: null,
        verificationResponsibilityLabel: null,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'task-1',
    nextStep: 'Run the bounded Code Agent preview.',
    processTemplates: [
      {
        archivedAt: null,
        bindingId: 'binding-1',
        bindingNote: null,
        bindingStatus: 'active',
        bindingUpdatedAt: '2026-01-01T00:00:00.000Z',
        boundAt: '2026-01-01T00:00:00.000Z',
        content: 'Use the bounded Code Agent preview process.',
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'process-1',
        kind: 'skill',
        removedAt: null,
        status: 'active',
        summary: null,
        tags: [],
        taskId: 'task-1',
        title: 'Code Agent patch preview',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    resumeCard: {
      completionStatus: {
        open: 1,
        satisfied: 0,
        summary: '1 open criterion',
        total: 1,
      },
      currentBlocker: {
        blockerId: null,
        detail: null,
        title: 'No active blocker',
      },
      currentMethod: {
        detail: null,
        selectionReason: null,
        templateId: 'process-1',
        title: 'Code Agent patch preview',
      },
      currentState: 'running',
      keySource: {
        detail: 'Use the local sandbox producer only.',
        priorityReason: null,
        sourceContextId: 'source-1',
        title: 'Boundary',
      },
      latestChange: {
        action: {
          label: null,
          targetId: null,
          targetType: null,
        },
        summary: 'Task is ready for bounded preview.',
      },
      nextSuggestedMove: 'Run the bounded Code Agent preview.',
      summary: 'Bounded execution preview task.',
    },
    riskLevel: 'medium',
    riskNote: null,
    sourceContexts: [
      {
        archivedAt: null,
        content: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'source-1',
        isKey: true,
        kind: 'note',
        note: 'Use the local sandbox producer only.',
        status: 'active',
        taskId: 'task-1',
        title: 'Boundary',
        updatedAt: '2026-01-01T00:00:00.000Z',
        uri: null,
      },
    ],
    state: 'running',
    summary: 'Bounded execution preview task.',
    timeline: [],
    title: 'Preview agent orchestration',
    updatedAt: '2026-01-01T00:00:00.000Z',
    waitingReason: null,
  };
}

describe('agent orchestration presentation', () => {
  it('builds a shared read-only presentation for the manual sandbox producer', () => {
    const snapshot = buildAgentExecutionOrchestrationSnapshot(buildReadyAiStatus());
    const presentation = buildReadOnlyOrchestrationPresentation({ snapshot });

    expect(presentation.runtime).toContain('ExecutionRuntime：local_sandbox / status=ready');
    expect(presentation.profile).toBe(
      'AgentProfile：manual_sandbox_producer / role=code_agent_preview / tools=workspace_coding,task_domain / automation=disabled',
    );
    expect(presentation.lifecycle).toBe(
      'AgentRunLifecycle：drafted / start=manual_or_operator_started / queue=no / claim=no / scheduler=no / autoStart=no',
    );
    expect(presentation.hiddenToolFamilies).toBe(
      'Hidden tool families / families=browser_playwright,mcp,skill,computer_use,creator_connector / modelVisible=no',
    );
    expect(presentation.executorLifecycle).toBeNull();
    expect(presentation.summary).toBe(
      'runtime=ready / profile=manual_sandbox_producer / lifecycle=drafted / hidden=browser_playwright,mcp,skill,computer_use,creator_connector / modelVisibleHiddenTools=no / automation=disabled / autoStart=no',
    );
  });

  it('can include executor lifecycle diagnostics without changing orchestration summary', () => {
    const snapshot = buildAgentExecutionOrchestrationSnapshot(buildReadyAiStatus());
    const presentation = buildReadOnlyOrchestrationPresentation({
      executorLifecycleAvailability: buildDryRunAgentExecutorLifecycleAvailability(),
      snapshot,
    });

    expect(presentation.executorLifecycle).toEqual(expect.objectContaining({
      controlRequests: 'controlRequests=heartbeat,interrupt,cancel / controlMode=dry_run_planned',
      exposure: 'modelExposure=hidden / modelVisibleTools=no',
      runtime: 'runtimeReady=no / queueWorker=no / automaticStart=no',
      settleResults: 'settleResults=completed,failed,paused / settleMode=dry_run_planned',
      status: 'Executor lifecycle / status=dry_run_available',
      unsupportedControlRequests: 'unsupportedControlRequests=none',
    }));
    expect(presentation.summary).toBe(
      'runtime=ready / profile=manual_sandbox_producer / lifecycle=drafted / hidden=browser_playwright,mcp,skill,computer_use,creator_connector / modelVisibleHiddenTools=no / automation=disabled / autoStart=no',
    );
  });

  it('formats executor lifecycle diagnostics as stable renderer lines', () => {
    const snapshot = buildAgentExecutionOrchestrationSnapshot(buildReadyAiStatus());
    const presentation = buildReadOnlyOrchestrationPresentation({
      executorLifecycleAvailability: buildDryRunAgentExecutorLifecycleAvailability(),
      snapshot,
    });

    expect(buildExecutorLifecycleDiagnosticLines(presentation.executorLifecycle)).toEqual([
      'Executor lifecycle：Executor lifecycle / status=dry_run_available',
      'runtimeReady=no / queueWorker=no / automaticStart=no',
      'controlRequests=heartbeat,interrupt,cancel / controlMode=dry_run_planned',
      'unsupportedControlRequests=none',
      'settleResults=completed,failed,paused / settleMode=dry_run_planned',
      'modelExposure=hidden / modelVisibleTools=no',
      'blocked=No real executor runtime is connected.; Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.; Model-visible tool exposure remains hidden.',
      'next=Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
    ]);
    expect(buildExecutorLifecycleDiagnosticLines(null)).toEqual([]);
  });

  it('formats partial executor lifecycle control support without inventing missing controls', () => {
    const snapshot = buildAgentExecutionOrchestrationSnapshot(buildReadyAiStatus());
    const presentation = buildReadOnlyOrchestrationPresentation({
      executorLifecycleAvailability: buildDryRunAgentExecutorLifecycleAvailability({
        controlSupport: {
          cancel: false,
        },
      }),
      snapshot,
    });

    expect(buildExecutorLifecycleDiagnosticLines(presentation.executorLifecycle)).toContain(
      'controlRequests=heartbeat,interrupt / controlMode=dry_run_planned',
    );
    expect(buildExecutorLifecycleDiagnosticLines(presentation.executorLifecycle)).toContain(
      'unsupportedControlRequests=cancel',
    );
    expect(buildExecutorLifecycleDiagnosticLines(presentation.executorLifecycle)).toContain(
      'settleResults=completed,failed,paused / settleMode=dry_run_planned',
    );
    expect(buildExecutorLifecycleDiagnosticLines(presentation.executorLifecycle)).not.toContain(
      'controlRequests=heartbeat,interrupt,cancel / controlMode=dry_run_planned',
    );
  });

  it('surfaces automation readiness without granting automatic start', () => {
    const snapshot = buildAgentExecutionOrchestrationSnapshot(buildReadyAiStatus());
    const automationReadiness = evaluateSkillInformedAutomationReadiness({
      snapshot,
      task: buildTaskDetail(),
    });
    const presentation = buildReadOnlyOrchestrationPresentation({
      automationReadiness,
      snapshot,
    });

    expect(automationReadiness.state).toBe('eligible');
    expect(automationReadiness.automaticStartAllowed).toBe(false);
    expect(presentation.automationReadiness).toBe(
      'Automation readiness：eligible / evidence=procedure=present,inputs=present,runtime=ready,risk=medium,openCompletionCriterion=present / blocked=none / autoStart=no',
    );
    expect(presentation.summary).toContain('automation=eligible / autoStart=no');
  });

  it('keeps hidden families empty when every reserved family is already model-visible', () => {
    const snapshot = buildAgentExecutionOrchestrationSnapshot({
      ...buildReadyAiStatus(),
      toolScaffoldSummaries: [
        buildToolFamilySummary('browser_playwright', ['browser.open']),
        buildToolFamilySummary('mcp', ['mcp.call']),
        buildToolFamilySummary('skill', ['skill.run']),
        buildToolFamilySummary('computer_use', ['computer.click']),
        buildToolFamilySummary('creator_connector', ['creator.publish']),
      ],
    });
    const presentation = buildReadOnlyOrchestrationPresentation({ snapshot });

    expect(presentation.hiddenToolFamilies).toBe(
      'Hidden tool families / families=none / modelVisible=no',
    );
    expect(presentation.summary).toContain('hidden=none / modelVisibleHiddenTools=no');
  });
});

function buildToolFamilySummary(
  family: NonNullable<AiConfigStatus['toolScaffoldSummaries']>[number]['family'],
  modelVisibleIds: string[],
): NonNullable<AiConfigStatus['toolScaffoldSummaries']>[number] {
  return {
    checkpointRequiredIds: [],
    connectorPolicyRecords: [],
    credentialGatedIds: [],
    descriptorIds: modelVisibleIds,
    family,
    implementedCount: modelVisibleIds.length,
    localVerificationEvidence: [],
    localVerificationRequiredIds: [],
    modelVisibleIds,
    providerNativeExposedIds: modelVisibleIds,
    reservedCount: 0,
    summary: `${family} visible`,
    textPromptExposedIds: modelVisibleIds,
  };
}
