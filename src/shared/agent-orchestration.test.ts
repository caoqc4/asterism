import { describe, expect, it } from 'vitest';

import { summarizeAgentToolScaffoldFamilies } from './agent-tool-scaffold.js';
import {
  buildAgentExecutionOrchestrationSnapshot,
  buildCodeAgentOrchestrationRequest,
  buildOperatorStartedOrchestrationRequest,
  buildStandingApprovalConfirmationDraft,
  evaluateStandingApprovalForAutomation,
  evaluateSkillInformedAutomationReadiness,
  planMatrixRuntimeBoundary,
  planScheduledEventAgentTrigger,
  planScheduledEventAgentTriggerFromEvidence,
  projectAgentRunLifecycle,
  validateAgentExecutionOrchestrationRequest,
} from './agent-orchestration.js';
import { buildDefaultOperatorStartedRunRequest } from './types/operator-started-run.js';
import type { AiConfigStatus } from './types/settings.js';

describe('agent orchestration snapshot', () => {
  it('keeps orchestration read-only before runtime probing', () => {
    const snapshot = buildAgentExecutionOrchestrationSnapshot({
      featureFlags: {
        enableScheduler: false,
      },
      sandboxBackendStatus: null,
      toolScaffoldSummaries: summarizeAgentToolScaffoldFamilies({
        policy: {
          allowLocalWorkspaceRead: false,
          allowTaskMutationTools: false,
        },
      }),
      workspaceRoot: null,
    });

    expect(snapshot.runtime).toMatchObject({
      id: 'local_sandbox',
      status: 'not_checked',
    });
    expect(snapshot.profile).toMatchObject({
      id: 'manual_sandbox_producer',
      automationReadiness: 'disabled',
    });
    expect(snapshot.lifecycle).toMatchObject({
      automaticStartEnabled: false,
      currentStage: 'drafted',
      queueEnabled: false,
    });
    expect(snapshot.hiddenFamilies).toEqual([
      'browser_playwright',
      'mcp',
      'skill',
      'computer_use',
      'creator_connector',
    ]);
    expect(snapshot.summary).toBe(
      'Orchestration snapshot / runtime=not_checked / profile=manual_sandbox_producer / lifecycle=drafted / queue=no / autoStart=no / hidden=browser_playwright,mcp,skill,computer_use,creator_connector',
    );
  });

  it('derives local sandbox runtime readiness without enabling automatic starts', () => {
    const aiStatus = {
      featureFlags: {
        enableScheduler: true,
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
        readiness: {
          blockedReasons: [],
          ready: true,
          summary: 'Sandbox backend ready: local-container.',
        },
        producerBackendReadiness: {
          blockedReasons: [],
          ready: true,
          summary: 'Sandboxed coding producer backend ready.',
        },
        summary: 'Sandbox backend ready: local-container.',
      },
      toolScaffoldSummaries: summarizeAgentToolScaffoldFamilies({
        policy: {
          allowLocalWorkspaceRead: false,
          allowTaskMutationTools: false,
        },
      }),
      workspaceRoot: '/tmp/workspace',
    } satisfies Pick<AiConfigStatus, 'featureFlags' | 'sandboxBackendStatus' | 'toolScaffoldSummaries' | 'workspaceRoot'>;

    const snapshot = buildAgentExecutionOrchestrationSnapshot(aiStatus);

    expect(snapshot.runtime.status).toBe('ready');
    expect(snapshot.runtime.readinessSummary).toBe('Sandboxed coding producer backend ready.');
    expect(snapshot.runtime.policySummary).toBe(
      'workspace=configured, network=disabled, credentials=none, workspaceMutation=decision_required',
    );
    expect(snapshot.lifecycle.summary).toBe(
      'lifecycle=drafted / start=manual_or_operator_started / queue=no / claim=no / scheduler=configured_for_briefs_only / autoStart=no',
    );
    expect(snapshot.lifecycle.automaticStartEnabled).toBe(false);
  });

  it('wraps manual code-agent preview input in an orchestration request', () => {
    const request = buildCodeAgentOrchestrationRequest({
      contextFiles: ['src/app.ts', 'docs/notes.md'],
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged patch for review.',
      requestedChecks: ['test', 'lint', 'test'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(request).toMatchObject({
      automaticStartAllowed: false,
      lane: 'coding',
      profileId: 'manual_sandbox_producer',
      providerCallAllowed: true,
      runtimeId: 'local_sandbox',
      schedulerAllowed: false,
      source: {
        contextFileCount: 2,
        kind: 'code_agent_preview',
        requestedChecks: ['test', 'lint'],
        useModelProducer: true,
      },
      startMode: 'manual',
    });
    expect(validateAgentExecutionOrchestrationRequest(request)).toMatchObject({
      summary:
        'Orchestration request / lane=coding / source=code_agent_preview / profile=manual_sandbox_producer / runtime=local_sandbox / start=manual / providerCall=explicit_opt_in / queue=no / autoStart=no',
      valid: true,
    });
  });

  it('blocks code-agent orchestration when required inputs are missing', () => {
    const request = buildCodeAgentOrchestrationRequest({
      contextFiles: [],
      operatorConfirmed: false,
      patchIntent: '',
      requestedChecks: [],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(validateAgentExecutionOrchestrationRequest(request)).toMatchObject({
      blockedReasons: expect.arrayContaining([
        'Orchestration request is missing required inputs: patch_intent, requested_checks, operator_confirmation, context_files.',
      ]),
      valid: false,
    });
  });

  it('wraps operator-started browser evidence without enabling queue or auto-start', () => {
    const validation = buildOperatorStartedOrchestrationRequest(
      buildDefaultOperatorStartedRunRequest({
        kind: 'browser_evidence_smoke',
        reason: 'Capture local page evidence.',
        taskId: 'task_1',
      }),
    );

    expect(validation).toMatchObject({
      request: {
        automaticStartAllowed: false,
        lane: 'browser_evidence',
        profileId: 'operator_browser_evidence',
        providerCallAllowed: false,
        runtimeId: 'browser_session',
        schedulerAllowed: false,
        source: {
          descriptorId: 'browser.readonly_evidence',
          kind: 'operator_started_run',
          operatorKind: 'browser_evidence_smoke',
        },
        startMode: 'operator_started',
      },
      summary:
        'Orchestration request / lane=browser_evidence / source=browser_evidence_smoke / start=operator_started / providerCall=no / queue=no / autoStart=no',
      valid: true,
    });
  });

  it('wraps operator-started browser controlled local QA without enabling queue or auto-start', () => {
    const validation = buildOperatorStartedOrchestrationRequest(
      buildDefaultOperatorStartedRunRequest({
        kind: 'browser_controlled_local_qa',
        reason: 'Run controlled local QA.',
        taskId: 'task_1',
      }),
    );

    expect(validation).toMatchObject({
      request: {
        automaticStartAllowed: false,
        lane: 'browser_evidence',
        profileId: 'operator_browser_evidence',
        providerCallAllowed: false,
        runtimeId: 'browser_session',
        schedulerAllowed: false,
        source: {
          descriptorId: 'browser.controlled_interaction',
          kind: 'operator_started_run',
          operatorKind: 'browser_controlled_local_qa',
        },
        startMode: 'operator_started',
      },
      summary:
        'Orchestration request / lane=browser_evidence / source=browser_controlled_local_qa / start=operator_started / providerCall=no / queue=no / autoStart=no',
      valid: true,
    });
  });

  it('rejects policy-auto orchestration until automation readiness is accepted', () => {
    const request = buildCodeAgentOrchestrationRequest({
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged patch for review.',
      requestedChecks: ['test'],
      taskId: 'task_1',
    });

    expect(validateAgentExecutionOrchestrationRequest({
      ...request,
      automaticStartAllowed: true,
      schedulerAllowed: true,
      startMode: 'policy_auto',
    })).toMatchObject({
      blockedReasons: expect.arrayContaining([
        'Orchestration request cannot use policy_auto until automation readiness is accepted.',
        'Orchestration request must not allow scheduler starts.',
        'Orchestration request must not allow automatic starts.',
      ]),
      valid: false,
    });
  });

  it('projects run status into lifecycle vocabulary without queue workers', () => {
    expect(projectAgentRunLifecycle({
      runStatus: 'pending',
      startMode: 'operator_started',
    })).toMatchObject({
      automaticStartEnabled: false,
      claimEnabled: false,
      currentStage: 'queued',
      queueEnabled: false,
      summary:
        'AgentRunLifecycleProjection / stage=queued / runStatus=pending / start=operator_started / queue=no / claim=no / autoStart=no',
    });

    expect(projectAgentRunLifecycle({
      runStatus: 'needs_confirmation',
      startMode: 'manual',
    }).currentStage).toBe('needs_confirmation');
    expect(projectAgentRunLifecycle({
      runStatus: 'paused',
      startMode: 'manual',
    }).currentStage).toBe('paused');
    expect(projectAgentRunLifecycle({
      runStatus: 'completed',
      startMode: 'manual',
    }).currentStage).toBe('completed');
    expect(projectAgentRunLifecycle({
      runStatus: 'failed',
      startMode: 'manual',
    }).currentStage).toBe('failed');
  });

  it('marks mature low-risk workflows eligible without allowing automatic start', () => {
    const snapshot = buildAgentExecutionOrchestrationSnapshot({
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
        readiness: {
          blockedReasons: [],
          ready: true,
          summary: 'Sandbox backend ready.',
        },
        producerBackendReadiness: {
          blockedReasons: [],
          ready: true,
          summary: 'Producer ready.',
        },
        summary: 'Sandbox backend ready.',
      },
      toolScaffoldSummaries: [],
      workspaceRoot: '/tmp/workspace',
    });

    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot,
      task: {
        activeBlocker: null,
        activeDependency: null,
        activeWaitingItem: null,
        completionCriteria: [
          {
            id: 'criterion_1',
            taskId: 'task_1',
            text: 'Patch is reviewable',
            verificationResponsibility: null,
            verificationResponsibilityLabel: null,
            status: 'open',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            satisfiedAt: null,
          },
        ],
        nextStep: 'Prepare the next staged patch.',
        processTemplates: [
          {
            id: 'template_1',
            bindingId: 'binding_1',
            taskId: 'task_1',
            title: 'Patch review workflow',
            summary: null,
            content: 'Prepare, test, and review a staged patch.',
            kind: 'skill',
            tags: [],
            status: 'active',
            bindingStatus: 'active',
            bindingNote: null,
            boundAt: '2026-01-01T00:00:00.000Z',
            bindingUpdatedAt: '2026-01-01T00:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            archivedAt: null,
            removedAt: null,
          },
        ],
        riskLevel: 'low',
        sourceContexts: [],
        state: 'planned',
        summary: 'Known low-risk patch workflow.',
        waitingReason: null,
      },
    });

    expect(readiness).toMatchObject({
      automaticStartAllowed: false,
      autonomyLevel: 'L1_proposal',
      blockedReasons: [],
      evidence: [
        'procedure=present',
        'inputs=present',
        'runtime=ready',
        'risk=low',
        'openCompletionCriterion=present',
      ],
      missingRequirements: [],
      nextAutonomyLevel: 'L2_limited_authorized_action',
      satisfiedRequirements: [
        'procedure',
        'inputs',
        'runtime',
        'risk',
        'waiting_clear',
        'blocker_clear',
        'dependency_clear',
        'open_completion_criterion',
        'scheduled_event_entrypoint',
      ],
      standingApprovalRequired: true,
      state: 'eligible',
    });
    expect(readiness.summary).toContain('requirements=9/9');
    expect(readiness.summary).toContain('automationReady=yes');
    expect(readiness.summary).toContain('autonomy=L1_proposal');
    expect(readiness.summary).toContain('next=L2_limited_authorized_action');
    expect(readiness.summary).toContain('missingRequirements=none');
    expect(readiness.summary).toContain('automationMissingRequirements=none');
    expect(readiness.summary).toContain('autoStart=no');
    expect(readiness.summary).toContain('standingApproval=required_for_auto_action');
  });

  it('keeps risky or under-specified tasks diagnostic-only', () => {
    const snapshot = buildAgentExecutionOrchestrationSnapshot({
      featureFlags: {
        enableScheduler: false,
      },
      sandboxBackendStatus: null,
      toolScaffoldSummaries: [],
      workspaceRoot: null,
    });

    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot,
      task: {
        activeBlocker: {
          id: 'blocker_1',
          taskId: 'task_1',
          title: 'Needs legal review',
          kind: 'approval',
          detail: null,
          owner: null,
          responsibility: null,
          responsibilityLabel: null,
          sourceContextId: null,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          resolvedAt: null,
        },
        activeDependency: null,
        activeWaitingItem: null,
        completionCriteria: [],
        nextStep: null,
        processTemplates: [],
        riskLevel: 'high',
        sourceContexts: [],
        state: 'running',
        summary: null,
        waitingReason: null,
      },
    });

    expect(readiness).toMatchObject({
      automaticStartAllowed: false,
      autonomyLevel: 'L0_diagnostic',
      blockedReasons: expect.arrayContaining([
        'No applied skill or process template is attached to this task.',
        'Task needs a clear next step plus summary or source context before automation readiness.',
        'Runtime is not ready: not_checked.',
        'High-risk tasks require manual Decision or operator-started review before execution.',
        'Task has an active blocker.',
        'Task needs at least one open completion criterion to bound execution.',
      ]),
      missingRequirements: expect.arrayContaining([
        'procedure',
        'inputs',
        'runtime',
        'risk',
        'blocker_clear',
        'open_completion_criterion',
      ]),
      nextAutonomyLevel: 'L1_proposal',
      standingApprovalRequired: false,
      state: 'blocked',
    });
    expect(readiness.summary).toContain('requirements=3/9');
    expect(readiness.summary).toContain('automationReady=no');
    expect(readiness.summary).toContain('missingRequirements=');
    expect(readiness.summary).toContain('automationMissingRequirements=');
    expect(readiness.summary).toContain('procedure');
    expect(readiness.summary).toContain('runtime');
  });

  it('keeps scheduled/event/routine task carriers at proposal autonomy until a business-line loop has standing approval', () => {
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task: matureAutomationTask({
        taskFacets: ['scheduled', 'event'],
        taskType: 'routine',
      }),
    });

    expect(readiness).toMatchObject({
      automaticStartAllowed: false,
      automaticStartBoundary: 'separate_scheduled_event_entrypoint_required',
      autonomyLevel: 'L1_proposal',
      blockedReasons: expect.arrayContaining([
        'Scheduled, event-triggered, and routine tasks need a policy-gated scheduled/event execution entrypoint before automatic native runtime start.',
      ]),
      evidence: expect.arrayContaining([
        'procedure=present',
        'runtime=ready',
        'taskAutomationClass=routine,scheduled,event',
      ]),
      missingRequirements: ['scheduled_event_entrypoint'],
      nextAutonomyLevel: 'L2_limited_authorized_action',
      satisfiedRequirements: [
        'procedure',
        'inputs',
        'runtime',
        'risk',
        'waiting_clear',
        'blocker_clear',
        'dependency_clear',
        'open_completion_criterion',
      ],
      standingApprovalRequired: true,
      state: 'diagnostic_only',
    });
    expect(readiness.summary).toContain('requirements=8/9');
    expect(readiness.summary).toContain('automationReady=no');
    expect(readiness.summary).toContain('missingRequirements=scheduled_event_entrypoint');
    expect(readiness.summary).toContain('automationMissingRequirements=scheduled_event_entrypoint');
    expect(readiness.summary).toContain('autonomy=L1_proposal');
    expect(readiness.summary).toContain('standingApproval=required_for_auto_action');
    expect(readiness.summary).toContain('autoStart=no');
    expect(readiness.summary).toContain('boundary=separate_scheduled_event_entrypoint_required');
  });

  it('accepts a narrow standing approval policy for L2 limited autonomous action', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled', 'event'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });

    const approval = evaluateStandingApprovalForAutomation({
      lane: 'coding',
      now: '2026-05-26T10:00:00.000Z',
      policy: {
        id: 'approval_1',
        allowedAutonomyLevel: 'L2_limited_authorized_action',
        allowedLanes: ['coding'],
        allowedRuntimeIds: ['local_sandbox'],
        createdAt: '2026-05-26T09:00:00.000Z',
        expiresAt: '2026-05-27T09:00:00.000Z',
        maxRunsPerDay: 3,
        reason: 'Allow routine patch preparation to advance without repeated prompts.',
        riskCeiling: 'medium',
        status: 'active',
        taskFacets: ['scheduled', 'event'],
        taskId: 'task_1',
        taskTypes: ['routine'],
      },
      readiness,
      runtimeId: 'local_sandbox',
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled', 'event'],
        taskType: 'routine',
      },
    });

    expect(approval).toMatchObject({
      accepted: true,
      authorizedAutonomyLevel: 'L2_limited_authorized_action',
      blockedReasons: [],
      missingRequirements: [],
      satisfiedRequirements: [
        'policy_present',
        'policy_active',
        'visible_reason',
        'valid_unexpired_window',
        'l2_authorization',
        'lane_allowed',
        'runtime_allowed',
        'task_scope',
        'task_type_scope',
        'task_facet_scope',
        'risk_ceiling',
        'run_limit_policy',
        'automation_readiness',
      ],
      evidence: expect.arrayContaining([
        'policy=approval_1',
        'policyStatus=active',
        'authorized=L2_limited_authorized_action',
        'lane=coding',
        'runtime=local_sandbox',
        'taskType=routine',
        'taskFacets=scheduled,event',
        'risk=low',
        'readiness=diagnostic_only',
      ]),
    });
    expect(approval.summary).toContain('accepted=yes');
    expect(approval.summary).toContain('standingApprovalReady=yes');
    expect(approval.summary).toContain('requirements=13/13');
    expect(approval.summary).toContain('missingRequirements=none');
    expect(approval.summary).toContain('standingApprovalMissingRequirements=none');
    expect(approval.summary).toContain('authorized=L2_limited_authorized_action');
  });

  it('blocks standing approval when scope, expiry, risk, or readiness are not acceptable', () => {
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task: matureAutomationTask({
        activeBlocker: {
          id: 'blocker_1',
          taskId: 'task_1',
          title: 'Needs review',
          kind: 'approval',
          detail: null,
          owner: null,
          responsibility: null,
          responsibilityLabel: null,
          sourceContextId: null,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          resolvedAt: null,
        },
      }),
    });

    const approval = evaluateStandingApprovalForAutomation({
      lane: 'coding',
      now: '2026-05-26T10:00:00.000Z',
      policy: {
        id: 'approval_2',
        allowedAutonomyLevel: 'L2_limited_authorized_action',
        allowedLanes: ['browser_evidence'],
        allowedRuntimeIds: ['browser_session'],
        createdAt: '2026-05-25T09:00:00.000Z',
        expiresAt: '2026-05-26T09:00:00.000Z',
        maxRunsPerDay: 0,
        reason: '',
        riskCeiling: 'low',
        status: 'paused',
        taskId: 'other_task',
        taskTypes: ['routine'],
      },
      readiness,
      runtimeId: 'local_sandbox',
      task: {
        id: 'task_1',
        riskLevel: 'medium',
        taskFacets: [],
        taskType: 'simple',
      },
    });

    expect(approval).toMatchObject({
      accepted: false,
      authorizedAutonomyLevel: null,
      blockedReasons: expect.arrayContaining([
        'Standing Approval policy is not active: paused.',
        'Standing Approval policy requires a visible reason.',
        'Standing Approval policy has expired.',
        'Standing Approval policy does not allow lane coding.',
        'Standing Approval policy does not allow runtime local_sandbox.',
        'Standing Approval policy is scoped to a different task.',
        'Standing Approval policy does not allow task type simple.',
        'Standing Approval policy risk ceiling low does not allow medium risk.',
        'Standing Approval policy requires maxRunsPerDay between 1 and 24.',
      ]),
      missingRequirements: expect.arrayContaining([
        'policy_active',
        'visible_reason',
        'valid_unexpired_window',
        'lane_allowed',
        'runtime_allowed',
        'task_scope',
        'task_type_scope',
        'risk_ceiling',
        'run_limit_policy',
        'automation_readiness',
      ]),
    });
    expect(approval.summary).toContain('accepted=no');
    expect(approval.summary).toContain('standingApprovalReady=no');
    expect(approval.summary).toContain('requirements=3/13');
    expect(approval.summary).toContain('missingRequirements=');
    expect(approval.summary).toContain('standingApprovalMissingRequirements=');
    expect(approval.summary).toContain('policy_active');
    expect(approval.summary).toContain('automation_readiness');
  });

  it('blocks standing approval when timestamp evidence is invalid', () => {
    const task = matureAutomationTask();
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });

    const approval = evaluateStandingApprovalForAutomation({
      lane: 'coding',
      now: 'not-a-date',
      policy: {
        id: 'approval_invalid_time',
        allowedAutonomyLevel: 'L2_limited_authorized_action',
        allowedLanes: ['coding'],
        allowedRuntimeIds: ['local_sandbox'],
        createdAt: '2026-05-26T09:00:00.000Z',
        expiresAt: 'also-not-a-date',
        maxRunsPerDay: 1,
        reason: 'Allow one bounded autonomous preparation run.',
        riskCeiling: 'low',
        status: 'active',
      },
      readiness,
      runtimeId: 'local_sandbox',
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: [],
        taskType: 'simple',
      },
    });

    expect(approval).toMatchObject({
      accepted: false,
      blockedReasons: expect.arrayContaining([
        'Standing Approval policy requires valid ISO timestamps.',
      ]),
      missingRequirements: expect.arrayContaining(['valid_unexpired_window']),
    });
    expect(approval.evidence).not.toContain('policyExpiry=future');
  });

  it('builds a confirmation-only standing approval draft without scheduler or workspace writes', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });

    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled'],
        taskType: 'routine',
      },
    });

    expect(draft).toMatchObject({
      confirmationRequired: true,
      schedulerTriggerAllowed: false,
      status: 'ready',
      workspaceWriteAllowed: false,
      evaluation: {
        accepted: true,
        authorizedAutonomyLevel: 'L2_limited_authorized_action',
      },
      policy: {
        allowedAutonomyLevel: 'L2_limited_authorized_action',
        allowedLanes: ['coding'],
        allowedRuntimeIds: ['local_sandbox'],
        expiresAt: '2026-05-27T10:00:00.000Z',
        maxRunsPerDay: 3,
        riskCeiling: 'low',
        status: 'active',
        taskFacets: ['scheduled'],
        taskId: 'task_1',
        taskTypes: ['routine'],
      },
    });
    expect(draft.detail).toContain('schedulerTriggerAllowed=false');
    expect(draft.detail).toContain('workspaceWriteAllowed=false');
    expect(draft.summary).toContain('confirmationRequired=yes');
  });

  it('blocks the standing approval draft when readiness is blocked', () => {
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task: matureAutomationTask({
        completionCriteria: [],
      }),
    });

    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: [],
        taskType: 'simple',
      },
    });

    expect(draft).toMatchObject({
      confirmationRequired: true,
      schedulerTriggerAllowed: false,
      status: 'blocked',
      workspaceWriteAllowed: false,
      evaluation: {
        accepted: false,
        authorizedAutonomyLevel: null,
        blockedReasons: expect.arrayContaining([
          'Automation readiness is blocked.',
          'Automation readiness blocker: Task needs at least one open completion criterion to bound execution.',
        ]),
      },
    });
    expect(draft.title).toContain('暂不可授权');
  });

  it('plans a scheduled/event trigger from confirmed standing approval without starting runtime', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });
    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled'],
        taskType: 'routine',
      },
    });

    const plan = planScheduledEventAgentTrigger({
      aiStatus: readyAutomationAiStatus(),
      now: new Date('2026-05-26T11:00:00.000Z'),
      task: {
        ...task,
        businessLineId: 'bl_1',
        id: 'task_1',
        timeline: [{
          id: 'timeline_approval',
          taskId: 'task_1',
          type: 'panel.standing_approval_confirmed',
          payload: JSON.stringify({
            policy: draft.policy,
            schedulerTriggerAllowed: false,
            workspaceWriteAllowed: false,
          }),
          createdAt: '2026-05-26T10:01:00.000Z',
        }],
      },
    });

    expect(plan).toMatchObject({
      status: 'ready',
      triggerPlanReady: true,
      runtimeStartAllowed: false,
      schedulerTriggerServiceConnected: false,
      runtimeStartMissingRequirements: [
        'scheduler_trigger_service',
        'run_limit_count',
      ],
      runtimeStartSatisfiedRequirements: [
        'trigger_plan_ready',
        'selected_runtime_identity',
      ],
      triggerRunEvidenceRequired: [
        'context_readiness',
        'target_task_identity',
        'task_memory_coverage',
        'task_memory_guidance',
        'subtask_start',
        'business_line_loop',
        'run_limit_count',
        'post_step',
      ],
      businessLineLoop: {
        businessLineId: 'bl_1',
        carrierTaskId: 'task_1',
        missingRequirements: ['run_limit'],
        reviewBoundary: 'post_step_review_required',
      },
      policy: {
        id: 'standing_approval:task_1:coding:local_sandbox',
      },
      standingApproval: {
        accepted: true,
      },
    });
    expect(plan.summary).toContain('runtimeStartAllowed=false');
    expect(plan.summary).toContain('runtimeStartReady=no');
    expect(plan.summary).toContain('runtimeStartRequirements=2/4');
    expect(plan.summary).toContain('runtimeStartSatisfiedRequirements=trigger_plan_ready,selected_runtime_identity');
    expect(plan.summary).toContain('runtimeStartMissingRequirements=scheduler_trigger_service,run_limit_count');
    expect(plan.summary).toContain('schedulerTriggerServiceConnected=false');
    expect(plan.summary).toContain('selectedRuntimeIdentity=local_sandbox');
    expect(plan.summary).toContain('triggerRunEvidence=context_readiness,target_task_identity,task_memory_coverage,task_memory_guidance,subtask_start,business_line_loop,run_limit_count,post_step');
    expect(plan.summary).toContain('businessLineLoopOwner=bl_1');
    expect(plan.evidence).toContain('targetTask=task_1');
    expect(plan.evidence).toContain('businessLine=bl_1');
    expect(plan.summary).toContain('runLimit=not_counted/3');
  });

  it('allows scheduled/event runtime start only when the dedicated trigger service is connected', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });
    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled'],
        taskType: 'routine',
      },
    });

    const plan = planScheduledEventAgentTrigger({
      aiStatus: readyAutomationAiStatus(),
      now: new Date('2026-05-26T11:00:00.000Z'),
      runLimit: {
        runsStartedToday: 0,
      },
      schedulerTriggerServiceConnected: true,
      task: {
        ...task,
        businessLineId: 'bl_1',
        id: 'task_1',
        timeline: [{
          id: 'timeline_approval',
          taskId: 'task_1',
          type: 'panel.standing_approval_confirmed',
          payload: JSON.stringify({
            policy: draft.policy,
            schedulerTriggerAllowed: false,
            workspaceWriteAllowed: false,
          }),
          createdAt: '2026-05-26T10:01:00.000Z',
        }],
      },
    });

    expect(plan).toMatchObject({
      status: 'ready',
      triggerPlanReady: true,
      runtimeStartAllowed: true,
      schedulerTriggerServiceConnected: true,
      readiness: {
        state: 'eligible',
        missingRequirements: [],
        satisfiedRequirements: [
          'procedure',
          'inputs',
          'runtime',
          'risk',
          'waiting_clear',
          'blocker_clear',
          'dependency_clear',
          'open_completion_criterion',
          'scheduled_event_entrypoint',
        ],
      },
      runtimeStartMissingRequirements: [],
      runtimeStartSatisfiedRequirements: [
        'trigger_plan_ready',
        'scheduler_trigger_service',
        'selected_runtime_identity',
        'run_limit_count',
      ],
    });
    expect(plan.readiness.evidence).toContain('scheduledEventEntrypoint=available');
    expect(plan.readiness.summary).toContain('requirements=9/9');
    expect(plan.readiness.summary).toContain('missingRequirements=none');
    expect(plan.summary).toContain('runtimeStartAllowed=true');
    expect(plan.summary).toContain('runtimeStartReady=yes');
    expect(plan.summary).toContain('runtimeStartRequirements=4/4');
    expect(plan.summary).toContain('runtimeStartSatisfiedRequirements=trigger_plan_ready,scheduler_trigger_service,selected_runtime_identity,run_limit_count');
    expect(plan.summary).toContain('runtimeStartMissingRequirements=none');
    expect(plan.summary).toContain('schedulerTriggerServiceConnected=true');
    expect(plan.summary).toContain('selectedRuntimeIdentity=local_sandbox');
    expect(plan.summary).toContain('schedulerLoopCliFirstSupported=true');
    expect(plan.summary).toContain('schedulerLoopApiDeferred=false');
  });

  it('keeps selected Agent API scheduler execution deferred behind scheduler-loop runtime gates', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });
    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled'],
        taskType: 'routine',
      },
    });

    const plan = planScheduledEventAgentTrigger({
      aiStatus: readyAutomationAiStatus({
        apiKeyStored: true,
        configured: true,
        runtimeMode: 'api',
      }),
      now: new Date('2026-05-26T11:00:00.000Z'),
      runLimit: {
        runsStartedToday: 0,
      },
      schedulerTriggerServiceConnected: true,
      task: {
        ...task,
        businessLineId: 'bl_1',
        id: 'task_1',
        timeline: [{
          id: 'timeline_approval',
          taskId: 'task_1',
          type: 'panel.standing_approval_confirmed',
          payload: JSON.stringify({
            policy: draft.policy,
            schedulerTriggerAllowed: false,
            workspaceWriteAllowed: false,
          }),
          createdAt: '2026-05-26T10:01:00.000Z',
        }],
      },
    });

    expect(plan).toMatchObject({
      status: 'blocked',
      runtimeStartAllowed: false,
      schedulerLoopGateway: {
        apiSchedulerDeferred: true,
        cliFirstSupported: false,
        executionRuntime: 'human',
        selectedAgentScheme: 'agent_api',
      },
      runtimeStartMissingRequirements: [
        'trigger_plan_ready',
        'selected_runtime_identity',
      ],
    });
    expect(plan.blockedReasons).toContain('Future Agent API scheduler execution remains deferred until the Agent API scheduler runtime gates are promoted.');
    expect(plan.summary).toContain('schedulerLoopSelectedScheme=agent_api');
    expect(plan.summary).toContain('schedulerLoopExecutionRuntime=human');
    expect(plan.summary).toContain('schedulerLoopApiDeferred=true');
    expect(plan.summary).toContain('selectedRuntimeIdentity=missing');
  });

  it('records selected CLI scheduler-loop gateway evidence when CLI readiness is available', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });
    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled'],
        taskType: 'routine',
      },
    });

    const plan = planScheduledEventAgentTrigger({
      aiStatus: readyAutomationAiStatus({
        agentCliRuntimeStatus: {
          catalogueCount: 1,
          detectedCount: 1,
          errorCount: 0,
          manualRunCount: 1,
          readyCount: 1,
          readyManualRunCount: 1,
          runningCount: 0,
          runtimes: [{
            authState: 'ready',
            command: 'codex',
            executionSupport: 'manual_run',
            id: 'codex',
            installed: true,
            label: 'Codex CLI',
            missingReason: null,
            version: 'codex 1.0.0',
            workload: 'idle',
          }],
          updatedAt: '2026-05-26T10:00:00.000Z',
        },
        runtimeMode: 'codex',
      }),
      now: new Date('2026-05-26T11:00:00.000Z'),
      runLimit: {
        runsStartedToday: 0,
      },
      schedulerTriggerServiceConnected: true,
      task: {
        ...task,
        businessLineId: 'bl_1',
        id: 'task_1',
        timeline: [{
          id: 'timeline_approval',
          taskId: 'task_1',
          type: 'panel.standing_approval_confirmed',
          payload: JSON.stringify({
            policy: draft.policy,
            schedulerTriggerAllowed: false,
            workspaceWriteAllowed: false,
          }),
          createdAt: '2026-05-26T10:01:00.000Z',
        }],
      },
    });

    expect(plan).toMatchObject({
      status: 'ready',
      runtimeStartAllowed: true,
      schedulerLoopGateway: {
        apiSchedulerDeferred: false,
        cliFirstSupported: true,
        executionRuntime: 'codex_cli',
        selectedAgentScheme: 'codex',
      },
    });
    expect(plan.summary).toContain('schedulerLoopSelectedScheme=codex');
    expect(plan.summary).toContain('schedulerLoopExecutionRuntime=codex_cli');
    expect(plan.summary).toContain('schedulerLoopCliFirstSupported=true');
    expect(plan.summary).toContain('schedulerLoopApiDeferred=false');
  });

  it('blocks scheduled/event runtime start when trigger service lacks run-limit accounting', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });
    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled'],
        taskType: 'routine',
      },
    });

    const plan = planScheduledEventAgentTrigger({
      aiStatus: readyAutomationAiStatus(),
      now: new Date('2026-05-26T11:00:00.000Z'),
      schedulerTriggerServiceConnected: true,
      task: {
        ...task,
        id: 'task_1',
        timeline: [{
          id: 'timeline_approval',
          taskId: 'task_1',
          type: 'panel.standing_approval_confirmed',
          payload: JSON.stringify({
            policy: draft.policy,
            schedulerTriggerAllowed: false,
            workspaceWriteAllowed: false,
          }),
          createdAt: '2026-05-26T10:01:00.000Z',
        }],
      },
    });

    expect(plan).toMatchObject({
      status: 'blocked',
      triggerPlanReady: false,
      runtimeStartAllowed: false,
      schedulerTriggerServiceConnected: true,
      runtimeStartMissingRequirements: [
        'trigger_plan_ready',
        'run_limit_count',
      ],
      runtimeStartSatisfiedRequirements: [
        'scheduler_trigger_service',
        'selected_runtime_identity',
      ],
      blockedReasons: expect.arrayContaining([
        'Scheduled/event trigger runtime start requires daily run-limit accounting.',
      ]),
    });
    expect(plan.summary).toContain('runtimeStartRequirements=2/4');
    expect(plan.summary).toContain('runtimeStartMissingRequirements=trigger_plan_ready,run_limit_count');
  });

  it('blocks scheduled/event runtime start when the selected runtime is outside Standing Approval scope', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });
    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled'],
        taskType: 'routine',
      },
    });

    const plan = planScheduledEventAgentTrigger({
      aiStatus: readyAutomationAiStatus(),
      now: new Date('2026-05-26T11:00:00.000Z'),
      runLimit: {
        runsStartedToday: 0,
      },
      runtimeId: 'agent_api_runtime',
      schedulerTriggerServiceConnected: true,
      task: {
        ...task,
        id: 'task_1',
        timeline: [{
          id: 'timeline_approval',
          taskId: 'task_1',
          type: 'panel.standing_approval_confirmed',
          payload: JSON.stringify({
            policy: draft.policy,
            schedulerTriggerAllowed: false,
            workspaceWriteAllowed: false,
          }),
          createdAt: '2026-05-26T10:01:00.000Z',
        }],
      },
    });

    expect(plan).toMatchObject({
      status: 'blocked',
      runtimeStartAllowed: false,
      policy: null,
      runtimeStartMissingRequirements: [
        'trigger_plan_ready',
        'selected_runtime_identity',
        'run_limit_count',
      ],
      runtimeStartSatisfiedRequirements: [
        'scheduler_trigger_service',
      ],
    });
    expect(plan.summary).toContain('selectedRuntimeIdentity=missing');
  });

  it('blocks scheduled/event trigger planning when daily run limit is reached', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });
    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled'],
        taskType: 'routine',
      },
    });

    const plan = planScheduledEventAgentTrigger({
      aiStatus: readyAutomationAiStatus(),
      now: new Date('2026-05-26T11:00:00.000Z'),
      runLimit: {
        runsStartedToday: 3,
      },
      task: {
        ...task,
        id: 'task_1',
        timeline: [{
          id: 'timeline_approval',
          taskId: 'task_1',
          type: 'panel.standing_approval_confirmed',
          payload: JSON.stringify({
            policy: draft.policy,
            schedulerTriggerAllowed: false,
            workspaceWriteAllowed: false,
          }),
          createdAt: '2026-05-26T10:01:00.000Z',
        }],
      },
    });

    expect(plan).toMatchObject({
      status: 'blocked',
      triggerPlanReady: false,
      runLimit: {
        maxRunsPerDay: 3,
        runsStartedToday: 3,
      },
      runtimeStartMissingRequirements: [
        'trigger_plan_ready',
        'scheduler_trigger_service',
      ],
      runtimeStartSatisfiedRequirements: [
        'selected_runtime_identity',
        'run_limit_count',
      ],
      blockedReasons: expect.arrayContaining([
        'Scheduled/event trigger daily run limit reached: 3/3.',
      ]),
    });
    expect(plan.summary).toContain('runtimeStartMissingRequirements=trigger_plan_ready,scheduler_trigger_service');
  });

  it('blocks scheduled/event trigger planning without confirmed standing approval or task automation class', () => {
    const task = matureAutomationTask({
      taskFacets: [],
      taskType: 'simple',
    });

    const plan = planScheduledEventAgentTrigger({
      aiStatus: readyAutomationAiStatus(),
      now: new Date('2026-05-26T11:00:00.000Z'),
      task: {
        ...task,
        id: 'task_1',
        timeline: [],
      },
    });

    expect(plan).toMatchObject({
      status: 'blocked',
      triggerPlanReady: false,
      runtimeStartAllowed: false,
      schedulerTriggerServiceConnected: false,
      policy: null,
      runtimeStartMissingRequirements: [
        'trigger_plan_ready',
        'scheduler_trigger_service',
        'selected_runtime_identity',
        'run_limit_count',
      ],
      blockedReasons: expect.arrayContaining([
        'Standing Approval policy is missing.',
        'Scheduled/event trigger planner only handles scheduled, event, or routine tasks.',
      ]),
    });
    expect(plan.summary).toContain('runtimeStartMissingRequirements=trigger_plan_ready,scheduler_trigger_service,selected_runtime_identity,run_limit_count');
  });

  it('derives scheduled/event trigger readiness from structured service evidence', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });
    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled'],
        taskType: 'routine',
      },
    });
    const taskWithIdentity = {
      ...task,
      businessLineId: 'bl_1',
      id: 'task_1',
      timeline: [],
    };

    const missingRunLimit = planScheduledEventAgentTriggerFromEvidence({
      aiStatus: readyAutomationAiStatus(),
      now: new Date('2026-05-26T11:00:00.000Z'),
      runLimit: {
        runsStartedToday: 0,
        status: 'missing',
      },
      schedulerTriggerService: {
        connected: true,
      },
      standingApprovalRecord: {
        createdAt: '2026-05-26T10:01:00.000Z',
        id: 'timeline_approval',
        policy: draft.policy,
        schedulerTriggerAllowed: false,
        workspaceWriteAllowed: false,
      },
      task: taskWithIdentity,
    });

    expect(missingRunLimit).toMatchObject({
      status: 'blocked',
      runtimeStartAllowed: false,
      schedulerTriggerServiceConnected: true,
      runtimeStartSatisfiedRequirements: ['scheduler_trigger_service', 'selected_runtime_identity'],
      runtimeStartMissingRequirements: [
        'trigger_plan_ready',
        'run_limit_count',
      ],
      blockedReasons: expect.arrayContaining([
        'Scheduled/event trigger runtime start requires daily run-limit accounting.',
      ]),
    });
    expect(missingRunLimit.summary).toContain('runtimeStartRequirements=2/4');
    expect(missingRunLimit.summary).toContain('runtimeStartSatisfiedRequirements=scheduler_trigger_service,selected_runtime_identity');

    const ready = planScheduledEventAgentTriggerFromEvidence({
      aiStatus: readyAutomationAiStatus(),
      now: new Date('2026-05-26T11:00:00.000Z'),
      runLimit: {
        runsStartedToday: 0,
        status: 'present',
      },
      schedulerTriggerService: {
        connected: true,
      },
      standingApprovalRecord: {
        createdAt: '2026-05-26T10:01:00.000Z',
        id: 'timeline_approval',
        policy: draft.policy,
        schedulerTriggerAllowed: false,
        workspaceWriteAllowed: false,
      },
      task: taskWithIdentity,
    });

    expect(ready).toMatchObject({
      status: 'ready',
      runtimeStartAllowed: true,
      schedulerTriggerServiceConnected: true,
      runtimeStartMissingRequirements: [],
      runtimeStartSatisfiedRequirements: [
        'trigger_plan_ready',
        'scheduler_trigger_service',
        'selected_runtime_identity',
        'run_limit_count',
      ],
      businessLineLoop: {
        status: 'ready',
        businessLineId: 'bl_1',
        carrierTaskId: 'task_1',
        satisfiedRequirements: [
          'business_line',
          'carrier_task',
          'runtime',
          'standing_approval',
          'run_limit',
          'review_boundary',
        ],
      },
    });
    expect(ready.evidence).toContain('targetTask=task_1');
    expect(ready.evidence).toContain('businessLine=bl_1');
    expect(ready.evidence).toContain('runLimit=0/3');
    expect(ready.summary).toContain('runtimeStartRequirements=4/4');
    expect(ready.summary).toContain('runtimeStartSatisfiedRequirements=trigger_plan_ready,scheduler_trigger_service,selected_runtime_identity,run_limit_count');
  });

  it('rejects scheduled/event service evidence with unsafe Standing Approval write boundaries', () => {
    const task = matureAutomationTask({
      taskFacets: ['scheduled'],
      taskType: 'routine',
    });
    const readiness = evaluateSkillInformedAutomationReadiness({
      snapshot: readyAutomationSnapshot(),
      task,
    });
    const draft = buildStandingApprovalConfirmationDraft({
      now: new Date('2026-05-26T10:00:00.000Z'),
      readiness,
      task: {
        id: 'task_1',
        riskLevel: 'low',
        taskFacets: ['scheduled'],
        taskType: 'routine',
      },
    });

    const unsafeBoundary = planScheduledEventAgentTriggerFromEvidence({
      aiStatus: readyAutomationAiStatus(),
      now: new Date('2026-05-26T11:00:00.000Z'),
      runLimit: {
        runsStartedToday: 0,
        status: 'present',
      },
      schedulerTriggerService: {
        connected: true,
      },
      standingApprovalRecord: {
        createdAt: '2026-05-26T10:01:00.000Z',
        id: 'timeline_approval',
        policy: draft.policy,
        schedulerTriggerAllowed: true,
        workspaceWriteAllowed: true,
      } as unknown as Parameters<typeof planScheduledEventAgentTriggerFromEvidence>[0]['standingApprovalRecord'],
      task: {
        id: 'task_1',
        ...task,
        timeline: [],
      },
    });

    expect(unsafeBoundary).toMatchObject({
      status: 'blocked',
      runtimeStartAllowed: false,
      runtimeStartMissingRequirements: [
        'trigger_plan_ready',
        'selected_runtime_identity',
        'run_limit_count',
      ],
    });
    expect(unsafeBoundary.blockedReasons).toContain('Standing Approval policy is missing.');
    expect(unsafeBoundary.summary).toContain('schedulerTriggerServiceConnected=true');
    expect(unsafeBoundary.summary).toContain('runtimeStartSatisfiedRequirements=scheduler_trigger_service');
    expect(unsafeBoundary.summary).not.toContain('standingApprovalReady=yes');
  });

  it('represents wanman matrix runtime as a future executor backend below Pilot for a scoped business line mission', () => {
    const plan = planMatrixRuntimeBoundary({
      allowedFileScopes: ['docs/brief.md', 'src/shared/**', 'src/shared/**'],
      allowedMcpServers: ['source-context'],
      allowedTools: ['read_file', 'search_workspace'],
      businessLineId: 'bl_growth',
      carrierTaskId: 'task_next_action',
      contextManifestRefs: ['context-manifest:run_1'],
      evidenceReturnChannels: ['runtime_events', 'artifact_references', 'write_intent_summary'],
      missionId: 'mission_matrix_review',
      objective: 'Review candidate context and return evidence for Pilot.',
      requestedWriteIntentTypes: ['source_context.create', 'business_record.create', 'decision.create'],
    });

    expect(plan).toMatchObject({
      status: 'ready',
      decisionBackend: 'wanman_matrix',
      executionRuntime: 'wanman_matrix',
      role: 'future_runtime_backend_below_pilot',
      productCoordinator: false,
      productionInvocationAllowed: false,
      scopedMission: {
        businessLineId: 'bl_growth',
        carrierTaskId: 'task_next_action',
        missionId: 'mission_matrix_review',
      },
      contextManifest: {
        required: true,
        references: ['context-manifest:run_1'],
        status: 'present',
      },
      allowedSurface: {
        tools: {
          ids: ['read_file', 'search_workspace'],
          status: 'scoped',
        },
        files: {
          scopes: ['docs/brief.md', 'src/shared/**'],
          status: 'scoped',
        },
        mcp: {
          serverIds: ['source-context'],
          status: 'scoped',
        },
        globalSurfaceAllowed: false,
      },
      evidenceReturn: {
        required: true,
        channels: ['runtime_events', 'artifact_references', 'write_intent_summary'],
        writeIntentEvidenceRequired: true,
      },
      writeBoundary: {
        mode: 'write_intent_only',
        allowedWriteIntentTypes: ['source_context.create', 'business_record.create', 'decision.create'],
        directBusinessRecordAllowed: false,
        directDecisionAllowed: false,
        directSopRevisionAllowed: false,
        directCompletionAllowed: false,
        productWriteGateRequired: true,
      },
      missingRequirements: [],
    });
    expect(plan.satisfiedRequirements).toEqual([
      'scoped_mission',
      'context_manifest',
      'tool_surface',
      'file_surface',
      'mcp_surface',
      'evidence_return',
      'write_intent_boundary',
      'product_control_plane',
      'production_invocation_closed',
    ]);
    expect(plan.evidence).toContain('matrixRuntime=wanman_matrix');
    expect(plan.evidence).toContain('productCoordinator=false');
    expect(plan.evidence).toContain('productionInvocationAllowed=false');
    expect(plan.evidence).toContain('scopedMission=business_line_task_mission');
    expect(plan.evidence).toContain('contextManifest=present');
    expect(plan.evidence).toContain('toolSurface=scoped');
    expect(plan.evidence).toContain('fileSurface=scoped');
    expect(plan.evidence).toContain('mcpSurface=scoped');
    expect(plan.evidence).toContain('writeBoundary=write_intent_only');
    expect(plan.evidence).toContain('directBusinessRecord=false');
    expect(plan.evidence).toContain('directDecision=false');
    expect(plan.evidence).toContain('directSop=false');
    expect(plan.evidence).toContain('directCompletion=false');
    expect(plan.summary).toContain('runtimeExecutable=no');
    expect(plan.summary).toContain('role=future_runtime_backend_below_pilot');
  });

  it('blocks wanman matrix runtime executor readiness when a business line mission lacks manifest, surface, evidence, or Write Intent boundary', () => {
    const plan = planMatrixRuntimeBoundary({
      businessLineId: 'bl_growth',
      carrierTaskId: 'task_next_action',
      missionId: 'mission_matrix_review',
      objective: 'Review candidate context and return evidence for Pilot.',
    });

    expect(plan.status).toBe('blocked');
    expect(plan.productCoordinator).toBe(false);
    expect(plan.productionInvocationAllowed).toBe(false);
    expect(plan.missingRequirements).toEqual([
      'context_manifest',
      'tool_surface',
      'file_surface',
      'mcp_surface',
      'evidence_return',
      'write_intent_boundary',
    ]);
    expect(plan.blockedReasons).toContain('Wanman matrix runtime missions require an explicit context manifest.');
    expect(plan.blockedReasons).toContain('Wanman matrix runtime missions require an explicit scoped tool surface, even when empty.');
    expect(plan.blockedReasons).toContain('Wanman matrix runtime missions require an explicit scoped file surface, even when empty.');
    expect(plan.blockedReasons).toContain('Wanman matrix runtime missions require an explicit scoped MCP surface, even when empty.');
    expect(plan.blockedReasons).toContain('Wanman matrix runtime missions must declare evidence return channels.');
    expect(plan.blockedReasons).toContain('Wanman matrix runtime missions must declare the Write Intent-only boundary, even when no writes are expected.');
    expect(plan.summary).toContain('runtime=wanman_matrix');
    expect(plan.summary).toContain('contextManifest=required:missing');
    expect(plan.summary).toContain('toolSurface=missing');
    expect(plan.summary).toContain('fileSurface=missing');
    expect(plan.summary).toContain('mcpSurface=missing');
    expect(plan.summary).toContain('evidenceReturn=missing');
    expect(plan.summary).toContain('writeBoundary=write_intent_only');
    expect(plan.summary).toContain('directBusinessRecord=false');
    expect(plan.summary).toContain('directDecision=false');
    expect(plan.summary).toContain('directSop=false');
    expect(plan.summary).toContain('directCompletion=false');
  });
});

function readyAutomationAiStatus(
  overrides: Partial<Pick<
    AiConfigStatus,
    'agentCliRuntimeStatus' | 'apiKeyStored' | 'configured' | 'runtimeMode'
  >> = {},
): Pick<AiConfigStatus, 'featureFlags' | 'sandboxBackendStatus' | 'toolScaffoldSummaries' | 'workspaceRoot'>
  & Partial<Pick<AiConfigStatus, 'agentCliRuntimeStatus' | 'apiKeyStored' | 'configured' | 'runtimeMode'>> {
  return {
    featureFlags: {
      enableScheduler: true,
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
      readiness: {
        blockedReasons: [],
        ready: true,
        summary: 'Sandbox backend ready.',
      },
      producerBackendReadiness: {
        blockedReasons: [],
        ready: true,
        summary: 'Producer ready.',
      },
      summary: 'Sandbox backend ready.',
    },
    toolScaffoldSummaries: [],
    workspaceRoot: '/tmp/workspace',
    ...overrides,
  };
}

function readyAutomationSnapshot() {
  return buildAgentExecutionOrchestrationSnapshot(readyAutomationAiStatus());
}

function matureAutomationTask(
  overrides: Partial<Parameters<typeof evaluateSkillInformedAutomationReadiness>[0]['task']> = {},
): Parameters<typeof evaluateSkillInformedAutomationReadiness>[0]['task'] {
  return {
    activeBlocker: null,
    activeDependency: null,
    activeWaitingItem: null,
    completionCriteria: [
      {
        id: 'criterion_1',
        taskId: 'task_1',
        text: 'Patch is reviewable',
        verificationResponsibility: null,
        verificationResponsibilityLabel: null,
        status: 'open',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        satisfiedAt: null,
      },
    ],
    nextStep: 'Prepare the next staged patch.',
    processTemplates: [
      {
        id: 'template_1',
        bindingId: 'binding_1',
        taskId: 'task_1',
        title: 'Patch review workflow',
        summary: null,
        content: 'Prepare, test, and review a staged patch.',
        kind: 'skill',
        tags: [],
        status: 'active',
        bindingStatus: 'active',
        bindingNote: null,
        boundAt: '2026-01-01T00:00:00.000Z',
        bindingUpdatedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
        removedAt: null,
      },
    ],
    riskLevel: 'low',
    sourceContexts: [],
    state: 'planned',
    summary: 'Known low-risk patch workflow.',
    waitingReason: null,
    ...overrides,
  };
}
