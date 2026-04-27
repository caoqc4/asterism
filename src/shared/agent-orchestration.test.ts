import { describe, expect, it } from 'vitest';

import { summarizeAgentToolScaffoldFamilies } from './agent-tool-scaffold.js';
import { buildAgentExecutionOrchestrationSnapshot } from './agent-orchestration.js';
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
});
