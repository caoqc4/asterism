import { describe, expect, it } from 'vitest';

import type { AiConfigStatus } from '@shared/types/settings';
import {
  buildAgentSessionRecoveryIntentPresentation,
  buildAgentSessionReplayReviewPresentation,
  formatAgentSessionCapabilitySummary,
  formatAgentSessionMetadataSummary,
  formatAgentSessionRecoveryIntentSummary,
  formatAgentSessionRecoveryRunInstructions,
  formatAgentSessionReplayNextStepDraft,
  formatAgentSessionReplayReviewSummary,
  formatAgentSessionRestartSummary,
  formatAgentSessionToolFamiliesSummary,
  formatCodeAgentAutomaticStartPolicySummary,
  formatCodeAgentModelProducerOptInSummary,
  formatCodeAgentPreflightSummary,
  formatCodeAgentRerunIntent,
  formatCodeAgentReviewRecoverySummary,
  formatCodeAgentStartBlockedReason,
  formatExecutionRuntimeReadinessSummary,
  formatPreRunAgentCapabilitySummary,
  formatSandboxProducerLifecycleSummary,
  isCodeAgentPromotionDecision,
  isCodeAgentSandboxRun,
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
      'restart=checkpoint_expected / replay=verify_resume_checkpoint',
    );
    expect(formatAgentSessionReplayReviewSummary(session, [
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        index: 2,
        kind: 'artifact',
        status: 'completed',
        title: 'Sandbox producer source ready',
      },
    ], [{ kind: 'resume', status: 'open' }])).toBe(
      'Replay review：resume only through the recovery checkpoint / mode=manual_resume / session=agent_session_1 / status=paused / restartSafety=checkpoint_gated / steps=1 / openCheckpoints=1 / recoveryCheckpoints=1 / latest=artifact:completed:Sandbox producer source ready / autoReplay=no',
    );
    expect(buildAgentSessionReplayReviewPresentation(session, [
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        index: 2,
        kind: 'artifact',
        status: 'completed',
        title: 'Sandbox producer source ready',
      },
    ], [{ kind: 'resume', status: 'open' }])).toMatchObject({
      automaticReplayAllowed: false,
      mode: 'manual_resume',
      openCheckpointCount: 1,
      recoveryCheckpointCount: 1,
      restartSafety: 'checkpoint_gated',
      runId: 'run_1',
      sessionId: 'agent_session_1',
      status: 'paused',
    });
    expect(formatAgentSessionRecoveryIntentSummary(session, [
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        index: 2,
        kind: 'artifact',
        status: 'completed',
        title: 'Sandbox producer source ready',
      },
    ], [{ kind: 'resume', status: 'open' }])).toBe(
      'Recovery intent：manual checkpoint resume / session=agent_session_1 / status=paused / restartSafety=checkpoint_gated / openCheckpoints=1 / recoveryCheckpoints=1 / recoveryCheckpointRequired=yes / manualRunRequired=no / autoReplay=no',
    );
    expect(buildAgentSessionRecoveryIntentPresentation(session, [
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        index: 2,
        kind: 'artifact',
        status: 'completed',
        title: 'Sandbox producer source ready',
      },
    ], [{ kind: 'resume', status: 'open' }])).toMatchObject({
      action: 'manual_checkpoint_resume',
      automaticReplayAllowed: false,
      manualRunRequired: false,
      recoveryCheckpointCount: 1,
      recoveryCheckpointRequired: true,
      runId: 'run_1',
      resumeCheckpointRequired: true,
    });
    expect(formatSandboxProducerLifecycleSummary(session)).toBe(
      'AgentRunLifecycle：blocked / source=source_1 / checks=test,lint / policy=network=disabled, promotion=decision_required, workspace mutation requires approved Decision / blocked=docker is unavailable / next=fix runtime readiness, then start a new manual run',
    );
  });

  it('formats task next-step drafts from replay review mode', () => {
    const session = {
      id: 'agent_session_1',
      runId: 'run_1',
      mode: 'agent',
      status: 'needs_confirmation',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: true,
        taskMutationTools: false,
        longRunningSessions: true,
      },
      metadata: 'executor=local_agent',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as const;

    expect(formatAgentSessionReplayNextStepDraft({
      checkpoints: [{ kind: 'tool_permission', status: 'open' }],
      runType: 'agent',
      session,
      steps: [],
    })).toBe('处理最近一次 agent run 的 1 个 recovery checkpoint / Decision，再决定是否继续执行。');

    expect(formatAgentSessionReplayNextStepDraft({
      checkpoints: [{ kind: 'tool_permission', status: 'resolved' }],
      runType: 'agent',
      session,
      steps: [],
    })).toBe('复核最近一次 agent run 的暂停或确认原因；没有 recovery checkpoint 时，先查看执行证据再决定是否重跑。');
    expect(formatAgentSessionReplayNextStepDraft({
      checkpoints: [{ kind: 'patch_promotion', status: 'open' }],
      runType: 'agent',
      session: {
        ...session,
        status: 'paused',
      },
      steps: [],
    })).toBe('复核最近一次 agent run 的暂停或确认原因；当前有 1 个 open checkpoint，但没有适用于该 session 的 recovery checkpoint。');
    expect(formatAgentSessionReplayNextStepDraft({
      checkpoints: [{ kind: 'external_wait', status: 'open' }],
      runType: 'agent',
      session,
      steps: [],
    })).toBe('复核最近一次 agent run 的暂停或确认原因；当前有 1 个 open checkpoint，但没有适用于该 session 的 recovery checkpoint。');
    expect(formatAgentSessionRecoveryRunInstructions({
      checkpoints: [{ kind: 'tool_permission', status: 'resolved' }],
      runType: 'agent',
      session,
      steps: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          index: 1,
          kind: 'checkpoint',
          status: 'completed',
          title: 'Resolved checkpoint',
        },
      ],
    })).toBeNull();

    expect(formatAgentSessionReplayNextStepDraft({
      runType: 'agent',
      session: {
        ...session,
        status: 'failed',
      },
      steps: [],
    })).toBe('检查最近一次 agent run 的失败或取消证据，整理重试输入后再启动新的 run。');
    expect(formatAgentSessionRecoveryRunInstructions({
      runType: 'agent',
      session: {
        ...session,
        status: 'failed',
      },
      steps: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          index: 1,
          kind: 'tool_result',
          status: 'failed',
          title: '工具失败：workspace.read_file',
        },
      ],
    })).toBe(
      '基于最近一次 agent run 的证据准备新的手动 run。 来源：run=run_1 / session=agent_session_1。 最近步骤：工具失败：workspace.read_file（failed）。 恢复判断：Recovery intent：prepare new manual run / session=agent_session_1 / status=failed / restartSafety=new_run_required / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no 不要自动重放旧 session；先复核失败/取消/中断证据、补齐输入，再由用户手动启动。',
    );
    expect(formatAgentSessionRecoveryRunInstructions({
      runType: 'agent',
      session: {
        ...session,
        status: 'cancelled',
      },
      steps: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          index: 1,
          kind: 'final',
          status: 'failed',
          title: 'Agent session 已取消',
        },
      ],
    })).toBe(
      '基于最近一次 agent run 的证据准备新的手动 run。 来源：run=run_1 / session=agent_session_1。 最近步骤：Agent session 已取消（failed）。 恢复判断：Recovery intent：prepare new manual run / session=agent_session_1 / status=cancelled / restartSafety=new_run_required / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no 不要自动重放旧 session；先复核失败/取消/中断证据、补齐输入，再由用户手动启动。',
    );

    expect(formatAgentSessionReplayNextStepDraft({
      runType: 'agent',
      session: {
        ...session,
        status: 'running',
      },
      steps: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          index: 1,
          kind: 'plan',
          status: 'completed',
          title: 'Plan accepted',
        },
      ],
    })).toBe('确认最近一次 agent run 是否已中断；若没有活动执行器，先基于证据整理输入，再启动新的 run，不自动重放。');
    expect(formatAgentSessionRecoveryRunInstructions({
      runType: 'agent',
      session: {
        ...session,
        status: 'running',
      },
      steps: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          index: 1,
          kind: 'plan',
          status: 'completed',
          title: 'Plan accepted',
        },
      ],
    })).toBe(
      '基于最近一次 agent run 的证据准备新的手动 run。 来源：run=run_1 / session=agent_session_1。 最近步骤：Plan accepted（completed）。 恢复判断：Recovery intent：prepare new manual run / session=agent_session_1 / status=running / restartSafety=interrupted_or_stale / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no 不要自动重放旧 session；先复核失败/取消/中断证据、补齐输入，再由用户手动启动。',
    );

    expect(formatAgentSessionReplayNextStepDraft({
      runType: 'agent',
      session: {
        ...session,
        status: 'running',
      },
      steps: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          index: 1,
          kind: 'tool_call',
          status: 'running',
          title: 'Tool still running',
        },
      ],
    })).toBe('确认最近一次 agent run 是否仍有活动执行器；若无法确认，先查看最新步骤和证据，不自动重放。');
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

  it('formats Code Agent recovery summaries from run and Decision state', () => {
    expect(formatCodeAgentReviewRecoverySummary(null, {
      id: 'decision_1',
      status: 'pending',
      title: 'Review Code Agent preview',
    })).toBe(
      '已有待处理的 Code Agent staged patch promotion Decision；先复核 Run 证据、staged patch 和 promotion Decision。',
    );

    expect(formatCodeAgentReviewRecoverySummary({
      failureReason: null,
      output: 'Patch source ready',
      status: 'completed',
    }, null)).toBe(
      '最近一次 Code Agent sandbox preview 已完成，但当前任务没有待处理 promotion Decision；请先从 Run 证据判断是否需要重跑。',
    );

    expect(formatCodeAgentReviewRecoverySummary({
      failureReason: 'lint failed',
      output: 'Check failed',
      status: 'failed',
    }, null)).toBe('最近一次 Code Agent sandbox preview 失败：lint failed');

    expect(formatCodeAgentReviewRecoverySummary({
      failureReason: null,
      output: null,
      status: 'needs_confirmation',
    }, null)).toBe(
      '最近一次 Code Agent sandbox preview 正在等待 checkpoint / Decision 确认；先打开 Run 证据审查 staged patch / checkpoint，再决定是否续跑或重跑。',
    );

    expect(formatCodeAgentReviewRecoverySummary({
      failureReason: null,
      output: null,
      status: 'running',
    }, null)).toBe(
      '最近一次 Code Agent sandbox preview 记录显示 running；先查看 Run 证据和最新步骤，再判断是否等待、重跑或新建 run。',
    );
  });

  it('formats Code Agent rerun intent for task and run recovery surfaces', () => {
    expect(formatCodeAgentRerunIntent({
      decisionTitle: 'Review Code Agent preview for High risk task',
      taskTitle: 'High risk task',
    })).toBe(
      'Re-run the Code Agent staged patch review for High risk task. Review prior promotion Decision: Review Code Agent preview for High risk task.',
    );

    expect(formatCodeAgentRerunIntent({
      decisionTitle: '确认提升 sandbox patch',
      files: ['src/notes.md'],
      runId: 'run_sandbox_producer',
      workspaceStatus: 'workspace unchanged until Decision approval',
    })).toBe(
      'Re-run the Code Agent staged patch review for run run_sandbox_producer. Review affected files: src/notes.md. Compare against promotion Decision: 确认提升 sandbox patch. Prior workspace status: workspace unchanged until Decision approval.',
    );
  });

  it('detects Code Agent sandbox runs and promotion Decisions', () => {
    expect(isCodeAgentSandboxRun({
      failureReason: null,
      instructions: 'Code Agent manual sandbox producer preview.',
      output: null,
      type: 'agent',
    })).toBe(true);
    expect(isCodeAgentSandboxRun({
      failureReason: null,
      instructions: 'Regular agent run.',
      output: 'staged patch source ready',
      type: 'agent',
    })).toBe(true);
    expect(isCodeAgentSandboxRun({
      failureReason: 'sandboxed coding producer failed',
      instructions: null,
      output: null,
      type: 'agent',
    })).toBe(true);
    expect(isCodeAgentSandboxRun({
      failureReason: null,
      instructions: 'Regular summarize run.',
      output: 'staged patch source ready',
      type: 'summarize',
    })).toBe(false);

    expect(isCodeAgentPromotionDecision({
      sourceLabel: 'workspace.staged_patch',
      title: 'Manual title',
    })).toBe(true);
    expect(isCodeAgentPromotionDecision({
      sourceLabel: null,
      title: 'Review Code Agent preview for task',
    })).toBe(true);
    expect(isCodeAgentPromotionDecision({
      sourceLabel: 'workspace.write_patch',
      title: 'Confirm direct patch',
    })).toBe(false);
  });
});
