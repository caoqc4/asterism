import { describe, expect, it } from 'vitest';

import type { AiConfigStatus } from '@shared/types/settings';
import {
  formatAgentSessionCapabilitySummary,
  formatAgentSessionMetadataSummary,
  formatAgentSessionReplayReviewSummary,
  formatAgentSessionRestartSummary,
  formatAgentSessionToolFamiliesSummary,
  formatCodeAgentAutomaticStartPolicySummary,
  formatCodeAgentModelProducerOptInSummary,
  formatCodeAgentPreflightSummary,
  formatCodeAgentStartBlockedReason,
  formatExecutionRuntimeReadinessSummary,
  formatPreRunAgentCapabilitySummary,
  formatSandboxProducerLifecycleSummary,
} from './agentCapabilities';

function buildAiStatus(provider: AiConfigStatus['provider']): AiConfigStatus {
  return {
    configured: true,
    apiKeyStored: true,
    apiKeySource: 'env',
    provider,
    model: provider === 'replicate' ? 'openai/gpt-oss-20b' : 'claude-3-5-sonnet-latest',
    baseUrl: null,
    workspaceRoot: '/tmp/taskplane-workspace',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/tmp/config.json',
    featureFlags: {
      enableScheduler: false,
    },
  };
}

function buildReadyCodeAgentAiStatus(): AiConfigStatus {
  return {
    ...buildAiStatus('fal-openrouter'),
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

describe('agent capability formatting', () => {
  it('keeps automatic code-agent start disabled until policy signals exist', () => {
    expect(formatCodeAgentAutomaticStartPolicySummary()).toBe(
      'Automatic start：disabled / requires mature skill or process, complete inputs, allowed tools, risk policy, accepted evidence or explicit enablement, and runtime readiness / no scheduler or auto-run flag is persisted',
    );
  });

  it('surfaces whether the model-backed producer can be selected per run', () => {
    expect(formatCodeAgentModelProducerOptInSummary(buildAiStatus('fal-openrouter'))).toBe(
      'Model producer：disabled / manual preview uses the local diagnostic producer and does not call the provider',
    );
    expect(formatCodeAgentModelProducerOptInSummary({
      ...buildAiStatus('fal-openrouter'),
      codeAgentModelProducerEnabled: true,
    })).toBe(
      'Model producer：available by local env / provider calls require Use model producer, context files, and operator confirmation / sandbox preview and Decision promotion still apply',
    );
  });

  it('keeps the pre-run preview honest before a provider is configured', () => {
    expect(formatPreRunAgentCapabilitySummary(null, false)).toBe(
      'Agent 能力预览：provider not configured / text-only planning unavailable until AI config is ready / read-only workspace context disabled for this run / task update/evidence tools disabled for this run / structured tool calls unavailable until AI config is ready / sandbox coding lane disabled; workspace patch/commands unavailable',
    );
  });

  it('keeps the pre-run preview unavailable when provider defaults exist without an API key', () => {
    expect(formatPreRunAgentCapabilitySummary({
      ...buildAiStatus('anthropic'),
      configured: false,
      apiKeyStored: false,
      apiKeySource: null,
    }, false)).toBe(
      'Agent 能力预览：anthropic / claude-3-5-sonnet-latest / text-only planning unavailable until AI config is ready / read-only workspace context disabled for this run / task update/evidence tools disabled for this run / structured tool calls unavailable until AI config is ready / sandbox coding lane disabled; workspace patch/commands unavailable',
    );
  });

  it('previews local executor capabilities before an agent run', () => {
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('anthropic'), false)).toBe(
      'Agent 能力预览：anthropic / claude-3-5-sonnet-latest / text-only planning in the local executor / read-only workspace context disabled for this run / task update/evidence tools disabled for this run / structured tool calls disabled until provider-native flag is enabled / sandbox coding lane disabled; workspace patch/commands unavailable',
    );
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('anthropic'), true)).toContain(
      'read-only workspace context enabled for this run',
    );
  });

  it('names Replicate as text-only planning before an agent run', () => {
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('replicate'), true)).toBe(
      'Agent 能力预览：replicate / openai/gpt-oss-20b / text-only planning via Replicate / read-only workspace context enabled for this run / task update/evidence tools disabled for this run / structured tool calls unavailable on native Replicate text path / sandbox coding lane disabled; workspace patch/commands unavailable',
    );
  });

  it('names task update tool opt-in before an agent run', () => {
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('anthropic'), false, true)).toContain(
      'task update/evidence tools enabled for this run',
    );
  });

  it.each([
    'anthropic',
    'openai',
    'openai-compatible',
    'fal-openrouter',
  ] as const)('keeps %s routed through the local text-only executor preview', (provider) => {
    const summary = formatPreRunAgentCapabilitySummary(buildAiStatus(provider), false);

    expect(summary).toContain(`${provider} / claude-3-5-sonnet-latest`);
    expect(summary).toContain('text-only planning in the local executor');
    expect(summary).toContain('read-only workspace context disabled for this run');
    expect(summary).toContain('task update/evidence tools disabled for this run');
    expect(summary).toContain('structured tool calls disabled until provider-native flag is enabled');
    expect(summary).toContain('sandbox coding lane disabled; workspace patch/commands unavailable');
  });

  it('previews limited provider-native safe-read tool calls when the flag is enabled', () => {
    expect(formatPreRunAgentCapabilitySummary({
      ...buildAiStatus('openai-compatible'),
      featureFlags: {
        enableScheduler: false,
        enableProviderNativeToolCalls: true,
      },
    }, true)).toContain('structured tool calls enabled for provider safe-read tools');
  });

  it('previews the sandbox coding lane as gated when the rollout flag is enabled', () => {
    expect(formatPreRunAgentCapabilitySummary({
      ...buildAiStatus('anthropic'),
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
    }, true)).toContain('sandbox coding lane gate enabled; waiting for provider eligibility');
  });

  it('previews producer backend readiness when sandbox backend detection has run', () => {
    expect(formatPreRunAgentCapabilitySummary({
      ...buildAiStatus('anthropic'),
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      sandboxBackendStatus: {
        probe: {
          backendId: 'local-container',
          kind: 'local_container',
          reason: 'docker: command not found',
          status: 'unavailable',
        },
        profile: null,
        producerBackendReadiness: {
          blockedReasons: ['docker: command not found'],
          ready: false,
          summary: 'Sandboxed coding producer backend blocked: docker: command not found',
        },
        readiness: null,
        summary: 'backend=local-container / kind=local_container / available=no / reason=docker: command not found',
      },
    }, true)).toContain('Sandboxed coding producer backend blocked: docker: command not found');
  });

  it('summarizes execution runtime readiness before and after a manual probe', () => {
    expect(formatExecutionRuntimeReadinessSummary(null)).toBe(
      'ExecutionRuntime：未检查 / local_container / staged patch requires manual readiness check',
    );
    expect(formatExecutionRuntimeReadinessSummary(buildAiStatus('anthropic'), true)).toBe(
      'ExecutionRuntime：检查中 / 不启动 producer / 不修改工作区',
    );
    expect(formatExecutionRuntimeReadinessSummary({
      ...buildAiStatus('anthropic'),
      sandboxBackendStatus: {
        probe: {
          backendId: 'local-container',
          kind: 'local_container',
          reason: 'docker: command not found',
          status: 'unavailable',
        },
        profile: null,
        producerBackendReadiness: {
          blockedReasons: ['docker: command not found'],
          ready: false,
          summary: 'Sandboxed coding producer backend blocked: docker: command not found',
        },
        readiness: null,
        summary: 'backend=local-container / kind=local_container / available=no / reason=docker: command not found',
      },
    })).toBe(
      'ExecutionRuntime：blocked / Sandboxed coding producer backend blocked: docker: command not found',
    );
  });

  it('keeps code-agent start blocked until producer runtime readiness is ready', () => {
    const readyStatus = buildReadyCodeAgentAiStatus();

    expect(formatCodeAgentStartBlockedReason({
      aiStatus: null,
      lintCheckAvailable: true,
      lintCheck: true,
      operatorConfirmed: true,
      runPending: false,
      selectedContextFileCount: 1,
      testCheckAvailable: true,
      testCheck: true,
      useModelProducer: true,
    })).toBe('Start blocked：check Code Agent runtime readiness first.');

    expect(formatCodeAgentStartBlockedReason({
      aiStatus: readyStatus,
      lintCheckAvailable: true,
      lintCheck: true,
      operatorConfirmed: false,
      runPending: false,
      selectedContextFileCount: 1,
      testCheckAvailable: true,
      testCheck: true,
      useModelProducer: true,
    })).toBe('Start blocked：confirm Docker/Decision review before starting.');

    expect(formatCodeAgentStartBlockedReason({
      aiStatus: readyStatus,
      lintCheckAvailable: true,
      lintCheck: true,
      operatorConfirmed: true,
      runPending: false,
      selectedContextFileCount: 0,
      testCheckAvailable: true,
      testCheck: true,
      useModelProducer: true,
    })).toBe('Start blocked：select at least one context file before using model producer.');

    expect(formatCodeAgentStartBlockedReason({
      aiStatus: readyStatus,
      lintCheck: false,
      lintCheckAvailable: false,
      operatorConfirmed: true,
      runPending: false,
      selectedContextFileCount: 1,
      testCheck: false,
      testCheckAvailable: false,
      useModelProducer: false,
    })).toBe('Start blocked：no package.json test/lint scripts are available.');

    expect(formatCodeAgentStartBlockedReason({
      aiStatus: readyStatus,
      lintCheck: false,
      lintCheckAvailable: true,
      operatorConfirmed: true,
      runPending: false,
      selectedContextFileCount: 1,
      testCheck: false,
      testCheckAvailable: true,
      useModelProducer: false,
    })).toBe('Start blocked：select at least one available allowlisted check.');

    expect(formatCodeAgentStartBlockedReason({
      aiStatus: readyStatus,
      lintCheck: true,
      lintCheckAvailable: true,
      operatorConfirmed: true,
      runPending: false,
      selectedContextFileCount: 1,
      testCheck: false,
      testCheckAvailable: true,
      useModelProducer: true,
    })).toBeNull();
  });

  it('summarizes code-agent preflight state from the same start gates', () => {
    const readyStatus = buildReadyCodeAgentAiStatus();

    expect(formatCodeAgentPreflightSummary({
      aiStatus: null,
      lintCheck: true,
      lintCheckAvailable: true,
      operatorConfirmed: true,
      runPending: false,
      selectedContextFileCount: 1,
      testCheck: true,
      testCheckAvailable: true,
      useModelProducer: true,
    })).toBe(
      'Code Agent preflight：blocked / runtime=needs readiness check / checks=test,lint / producer=model-backed; context=1 / promotion=Decision required / next=check Code Agent runtime readiness first.',
    );

    expect(formatCodeAgentPreflightSummary({
      aiStatus: readyStatus,
      lintCheck: true,
      lintCheckAvailable: true,
      operatorConfirmed: true,
      runPending: false,
      selectedContextFileCount: 2,
      testCheck: false,
      testCheckAvailable: true,
      useModelProducer: true,
    })).toBe(
      'Code Agent preflight：ready / runtime=ready / checks=lint / producer=model-backed; context=2 / promotion=Decision required / next=start sandbox preview',
    );
  });

  it('formats provider-native agent session metadata for run detail', () => {
    expect(formatAgentSessionMetadataSummary({
      id: 'agent_session_1',
      runId: 'run_1',
      mode: 'agent',
      status: 'completed',
      capabilities: {
        structuredToolCalls: true,
        textOnlyPlanning: false,
        streaming: false,
        fileContext: false,
        taskMutationTools: false,
        longRunningSessions: false,
      },
      metadata: [
        'executor=provider_native_agent',
        'loop=provider_tool_call',
        'provider=openai-compatible',
        'model=relay-model',
        'adapter=provider_native_tool_call_adapter',
        'rawSummary=tool_calls=1',
        'providerCallIds=call_1',
        'stopReason=tool_calls',
      ].join('\n'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toBe(
      'Provider-native session / openai-compatible / relay-model / adapter=provider_native_tool_call_adapter / raw=tool_calls=1 / calls=call_1 / stop=tool_calls',
    );
  });

  it('formats local agent session metadata with disabled sandbox state', () => {
    expect(formatAgentSessionMetadataSummary({
      id: 'agent_session_1',
      runId: 'run_1',
      mode: 'agent',
      status: 'completed',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: true,
        taskMutationTools: true,
        longRunningSessions: false,
      },
      metadata: [
        'executor=local_agent',
        'loop=local_note',
        'sandboxCoding=disabled',
        'sandboxProvider=disabled',
        'sandboxPromotion=decision_required',
        'sandboxPatchReviewAdapter=disabled',
        'sandboxPatchReviewAdapterReason=Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
        'sandboxPatchReviewPlan=blocked',
        'sandboxPatchReviewPlanSummary=Sandbox patch review run plan blocked: Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
        'sandboxPatchReviewPlanReason=Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
      ].join('\n'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toBe(
      'executor=local_agent / loop=local_note / sandboxCoding=disabled / sandboxProvider=disabled / sandboxPromotion=decision_required / sandboxPatchReviewAdapter=disabled / sandboxPatchReviewAdapterReason=Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off. / sandboxPatchReviewPlan=blocked / sandboxPatchReviewPlanSummary=Sandbox patch review run plan blocked: Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off. / sandboxPatchReviewPlanReason=Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
    );
  });

  it('formats local agent session metadata with sandbox blocked reasons', () => {
    expect(formatAgentSessionMetadataSummary({
      id: 'agent_session_1',
      runId: 'run_1',
      mode: 'agent',
      status: 'completed',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: true,
        taskMutationTools: true,
        longRunningSessions: false,
      },
      metadata: [
        'executor=local_agent',
        'loop=local_note',
        'sandboxCoding=blocked',
        'sandboxProvider=not_ready',
        'sandboxPromotion=decision_required',
        'sandboxBlockedReasons=sandbox provider does not expose the required staged-write, targeted-check, patch-artifact capability set',
      ].join('\n'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toBe(
      'executor=local_agent / loop=local_note / sandboxCoding=blocked / sandboxProvider=not_ready / sandboxPromotion=decision_required / sandboxBlockedReasons=sandbox provider does not expose the required staged-write, targeted-check, patch-artifact capability set',
    );
  });

  it('formats sandboxed coding producer session metadata for run detail', () => {
    const session = {
      id: 'agent_session_1',
      runId: 'run_1',
      mode: 'agent',
      status: 'paused',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: false,
        streaming: false,
        fileContext: true,
        taskMutationTools: false,
        longRunningSessions: true,
      },
      metadata: [
        'executor=sandboxed_coding_producer',
        'loop=sandboxed_coding',
        'producerStatus=blocked',
        'sessionId=sandboxed_producer:source_1',
        'sourceId=source_1',
        'provider=openai-compatible',
        'commands=test,lint',
        'network=disabled',
        'promotion=decision_required',
        'backend=local-container',
        'blockedReasons=docker is unavailable',
        'summary=Backend probe blocked',
      ].join('\n'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as const;

    expect(formatAgentSessionMetadataSummary(session)).toBe(
      'Sandboxed coding producer / status=blocked / provider=openai-compatible / session=sandboxed_producer:source_1 / source=source_1 / backend=local-container / commands=test,lint / network=disabled / promotion=decision_required / blockedReasons=docker is unavailable / summary=Backend probe blocked',
    );
    expect(formatAgentSessionCapabilitySummary(session)).toBe(
      'sandboxed coding producer / status=blocked / backend=local-container / checks=test,lint / network=disabled / promotion=decision_required / read-only workspace input / staged patch output / Decision review required',
    );
    expect(formatAgentSessionToolFamiliesSummary(session)).toBe(
      'workspace=staged_patch_review / task=not_exposed / provider_tools=not_exposed / coding=sandboxed_producer / browser=not_exposed / computer_use=not_exposed / mcp=not_exposed / creator=not_exposed / restart=long_running_session_recorded',
    );
    expect(formatAgentSessionRestartSummary(session)).toBe(
      'restart=checkpoint_required / replay=resume_after_checkpoint',
    );
    expect(formatAgentSessionReplayReviewSummary(session, [
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        index: 2,
        kind: 'artifact',
        status: 'completed',
        title: 'Sandbox producer source ready',
      },
    ])).toBe(
      'Replay review：resume only through the open checkpoint / mode=manual_resume / session=agent_session_1 / status=paused / steps=1 / latest=artifact:completed:Sandbox producer source ready / autoReplay=no',
    );
    expect(formatSandboxProducerLifecycleSummary(session)).toBe(
      'AgentRunLifecycle：blocked / source=source_1 / checks=test,lint / policy=network=disabled, promotion=decision_required, workspace mutation requires approved Decision / blocked=docker is unavailable / next=fix runtime readiness, then start a new manual run',
    );
  });

  it('formats source-ready sandbox producer lifecycle with Decision-only promotion', () => {
    const session = {
      id: 'agent_session_1',
      runId: 'run_1',
      mode: 'agent',
      status: 'completed',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: false,
        streaming: false,
        fileContext: true,
        taskMutationTools: false,
        longRunningSessions: true,
      },
      metadata: [
        'executor=sandboxed_coding_producer',
        'producerStatus=source_ready',
        'sourceId=source_1',
        'commands=test,lint',
        'files=src/notes.md',
        'network=disabled',
        'promotion=decision_required',
      ].join('\n'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as const;

    expect(formatSandboxProducerLifecycleSummary(session)).toBe(
      'AgentRunLifecycle：source-ready / source=source_1 / files=src/notes.md / checks=test,lint / policy=network=disabled, promotion=decision_required, workspace mutation requires approved Decision / next=review patch-promotion Decision; workspace changes only after approval',
    );
  });
});
