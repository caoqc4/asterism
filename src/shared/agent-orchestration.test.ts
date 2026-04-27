import { describe, expect, it } from 'vitest';

import { summarizeAgentToolScaffoldFamilies } from './agent-tool-scaffold.js';
import {
  buildAgentExecutionOrchestrationSnapshot,
  buildCodeAgentOrchestrationRequest,
  buildOperatorStartedOrchestrationRequest,
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
});
