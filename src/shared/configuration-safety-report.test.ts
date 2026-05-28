import { describe, expect, it } from 'vitest';

import { buildCapabilityRegistry } from './capability-registry.js';
import { buildConfigurationSafetyReport } from './configuration-safety-report.js';
import { buildRuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';
import type { AiConfigStatus } from './types/settings.js';

describe('configuration safety report', () => {
  it('summarizes safe configuration state without exposing secret values', () => {
    const status = withRegistry(aiStatus());
    const report = buildConfigurationSafetyReport(status);

    expect(report.secretExposureSafe).toBe(true);
    expect(report.surfaces.find((surface) => surface.id === 'model.api_key')).toMatchObject({
      state: 'configured',
      reason: 'API key source is env; secret value is not exposed.',
      startupProbePolicy: 'never',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'workspace.root')).toMatchObject({
      state: 'configured',
      requiresApproval: true,
      startupProbePolicy: 'safe_read_only',
    });
  });

  it('keeps costly or mutating capabilities approval-bound', () => {
    const status = withRegistry(aiStatus({
      featureFlags: {
        enableScheduler: true,
        enableSandboxCodingAgent: true,
        enableSandboxPatchPromotionApply: true,
        enableSelfCheck: true,
      },
    }));
    const report = buildConfigurationSafetyReport(status);

    expect(report.surfaces.find((surface) => surface.id === 'runtime.scheduler')).toMatchObject({
      state: 'approval_required',
      reason: expect.stringContaining('Scheduler Decision proposal contract / status=blocked / proposalReady=no / requirements=0/3'),
      diagnosticSummary: expect.stringContaining('decisionPersistenceAllowed=false / writebackDispatchAllowed=false / schedulerTriggerAllowed=false'),
      requiresApproval: true,
      startupProbePolicy: 'never',
    });
    expect(report.surfaces.find((surface) => surface.id === 'runtime.scheduler')?.diagnosticSummary)
      .toContain('Scheduled/event trigger plan / status=blocked / triggerPlanReady=no / runtimeStartAllowed=false / runtimeStartReady=no');
    expect(report.surfaces.find((surface) => surface.id === 'runtime.scheduler')?.diagnosticSummary)
      .toContain('runtimeStartMissingRequirements=trigger_plan_ready,run_limit_count');
    expect(report.surfaces.find((surface) => surface.id === 'sandbox.patch_promotion')).toMatchObject({
      state: 'approval_required',
      reason: 'Sandbox patch promotion apply is enabled for explicit operator actions only; a ready workspace.staged_patch Decision still writes only after reviewed patch evidence, operator confirmation, and promotion preflight.',
      diagnosticSummary: expect.stringContaining('Runtime patch promotion routing readiness / ready=no / promotionReady=no / requirements=0/8'),
      requiresApproval: true,
      startupProbePolicy: 'manual_only',
    });
    expect(report.surfaces.find((surface) => surface.id === 'sandbox.patch_promotion')?.diagnosticSummary)
      .toContain('operatorId=missing / patchRunId=missing / decisionRunId=missing / preflightRunId=missing / postApplyRunId=missing / sameRunId=missing / touchedFileCount=0 / touchedFiles=none');
  });

  it('explains blocked missing or disabled configuration', () => {
    const status = withRegistry(aiStatus({
      configured: false,
      apiKeySource: null,
      provider: null,
      model: null,
      workspaceRoot: null,
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
        enableSandboxPatchPromotionApply: false,
        enableSelfCheck: false,
      },
    }));
    const report = buildConfigurationSafetyReport(status);

    expect(report.surfaces.find((surface) => surface.id === 'model.provider')).toMatchObject({
      state: 'missing',
      reason: 'Model provider or model is missing.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'runtime.scheduler')).toMatchObject({
      state: 'disabled_by_flag',
      diagnosticSummary: expect.stringContaining('Scheduler Decision proposal contract / status=blocked / proposalReady=no / requirements=0/3'),
    });
    expect(report.surfaces.find((surface) => surface.id === 'runtime.scheduler')?.diagnosticSummary)
      .toContain('runtimeStartMissingRequirements=trigger_plan_ready,scheduler_trigger_service,run_limit_count');
    expect(report.surfaces.find((surface) => surface.id === 'sandbox.patch_promotion')).toMatchObject({
      state: 'disabled_by_flag',
      reason: 'Sandbox patch promotion apply is disabled by feature flag; approvals remain preflight/no-write only and apply-to-workspace actions stay hidden.',
      diagnosticSummary: expect.stringContaining('Runtime patch promotion routing readiness / ready=no / promotionReady=no / requirements=0/8'),
    });
    expect(report.blockedReasons).toEqual(expect.arrayContaining([
      'model.provider: Model provider or model is missing.',
      'model.api_key: API key is missing.',
      'workspace.root: Workspace root is missing.',
    ]));
  });

  it('keeps live external probes manual-only by default', () => {
    const report = buildConfigurationSafetyReport(withRegistry(aiStatus()));

    expect(report.surfaces.find((surface) => surface.id === 'external_access.connectors')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'agent_cli.runtimes')).toMatchObject({
      startupProbePolicy: 'safe_read_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'agent_api.runtime')).toMatchObject({
      startupProbePolicy: 'never',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'browser.operator')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'sandbox.coding_agent')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
  });

  it('preserves capability summaries as diagnostic details without replacing the safety reason', () => {
    const report = buildConfigurationSafetyReport({
      ...aiStatus(),
      capabilityRegistry: buildCapabilityRegistry({
        snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus({ runtimeMode: 'codex' }) }),
        productSurfaces: {
          agentCli: { detectedCount: 0, readyCount: 0, manualRunCount: 0, readyManualRunCount: 0, runningCount: 0, errorCount: 0, catalogueCount: 2 },
        },
      }),
    });

    expect(report.surfaces.find((surface) => surface.id === 'agent_cli.runtimes')).toMatchObject({
      reason: 'No supported Agent CLI runtime is detected.',
      diagnosticSummary: 'detected=0 / ready=0 / manualRun=0 / readyManualRun=0 / running=0 / errors=0 / selected=Codex CLI / catalogue=2',
    });
  });

  it('distinguishes product-policy disabled surfaces from feature-flag disabled surfaces', () => {
    const base = aiStatus({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
        enableSandboxPatchPromotionApply: false,
        enableSelfCheck: true,
      },
    });
    const report = buildConfigurationSafetyReport({
      ...base,
      capabilityRegistry: buildCapabilityRegistry({
        snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: base }),
        productSurfaces: {
          externalAccess: { connectedCount: 0, pendingCount: 0, errorCount: 0, catalogueCount: 1 },
          skills: { enabledCount: 0, readyCount: 0, needsConfigCount: 0, catalogueCount: 1 },
          mcp: { connectedServerCount: 0, toolCount: 0, errorCount: 0, catalogueCount: 1 },
          agentCli: { detectedCount: 0, readyCount: 0, manualRunCount: 0, readyManualRunCount: 0, runningCount: 0, errorCount: 0, catalogueCount: 2 },
        },
      }),
    });

    expect(report.surfaces.find((surface) => surface.id === 'runtime.scheduler')).toMatchObject({
      state: 'disabled_by_flag',
    });
    expect(report.surfaces.find((surface) => surface.id === 'external_access.connectors')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No external access connector is connected.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No ready skill is enabled.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No connected MCP server exposes tools.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'agent_cli.runtimes')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No supported Agent CLI runtime is detected.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'agent_api.runtime')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'Agent API Runtime is a peer AI invocation runtime; supported provider-backed phases require selecting API Runtime and configuring a provider key. Full task execution_run remains deferred behind Taskplane harness gates.',
    });
  });

  it('shows selected Agent API Runtime as approval-required for supported phases', () => {
    const report = buildConfigurationSafetyReport(withRegistry(aiStatus({ runtimeMode: 'api' })));

    expect(report.surfaces.find((surface) => surface.id === 'agent_api.runtime')).toMatchObject({
      state: 'approval_required',
      reason: 'executionKind=api / status=partial / supportedPhases=chat,decomposition,decision,scheduled_brief / executionRun=deferred / executionRunPromotionReady=no / executionRunPromotionRequirements=0/11 / executionRunGateRequirements=0/9 / executionRunMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight,runtime_context_manifest,context_readiness_step,task_memory_guidance,run_goal_contract,write_intent_extraction,reviewed_patch_apply_boundary,post_step_verification,run_evidence_persistence / executionRunPromotionMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight,runtime_context_manifest,context_readiness_step,task_memory_guidance,run_goal_contract,write_intent_extraction,reviewed_patch_apply_boundary,post_step_verification,run_evidence_persistence / executionRunPromotionMissingGates=simplicity_check,runtime_action,runtime_context_assembly,context_readiness,task_memory_coverage,task_memory_guidance,pre_step,subtask_start,post_step / executionRunKeyGates=runtime_context_assembly,context_readiness,task_memory_coverage,task_memory_guidance,pre_step,subtask_start,post_step / executionRunMissingGates=runtime_context_assembly,context_readiness,task_memory_coverage,task_memory_guidance,pre_step,subtask_start,post_step / decompositionPromotionReady=no / decompositionPromotionRequirements=0/7 / decompositionMissingRequirements=selected_runtime_contract,parent_task_identity,reversible_proposal_card,subtask_create_many_apply_plan,agent_api_decomposition_source,operator_confirmation_boundary,draft_only_timeline_evidence / decompositionPromotionMissingRequirements=selected_runtime_contract,parent_task_identity,reversible_proposal_card,subtask_create_many_apply_plan,agent_api_decomposition_source,operator_confirmation_boundary,draft_only_timeline_evidence / providerToolReadiness=not_declared / providerToolStatus=not_declared / providerToolRequirements=3/5 / providerToolMissingRequirements=provider_owned_metadata,explicit_tool_declaration / providerMetadataOwner=missing / providerMetadataPackage=missing / explicitToolDeclarationSource=missing / declaredToolCount=0 / startupProbe=never / selected=true / provider=configured',
      requiresApproval: true,
      startupProbePolicy: 'never',
    });
  });

  it('treats pending or errored External Access connectors as missing configuration, not disabled flags', () => {
    const base = aiStatus();
    const report = buildConfigurationSafetyReport({
      ...base,
      capabilityRegistry: buildCapabilityRegistry({
        snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: base }),
        productSurfaces: {
          externalAccess: { connectedCount: 0, pendingCount: 1, errorCount: 1 },
        },
      }),
    });

    expect(report.surfaces.find((surface) => surface.id === 'external_access.connectors')).toMatchObject({
      state: 'missing',
      reason: 'External access connector authorization is pending or has errors.',
      startupProbePolicy: 'manual_only',
    });
  });

  it('redacts accidental secret-looking values from safety reasons', () => {
    const report = buildConfigurationSafetyReport({
      ...aiStatus(),
      capabilityRegistry: [
        {
          id: 'external_access.connectors',
          family: 'external_access',
          label: 'External Access',
          status: 'unconfigured',
          configured: false,
          summary: 'Gmail token=secret-token-1 is missing',
          missingReason: 'Gmail accessToken=short-lived-token; apiKey=raw-key; Authorization Bearer abc.def',
          visibility: 'hidden',
          access: 'read_only',
          requiresApproval: true,
          requiredGate: 'capability_probe',
        },
      ],
    });
    const reason = report.surfaces.find((surface) => surface.id === 'external_access.connectors')?.reason ?? '';

    expect(reason).toContain('accessToken=[redacted]');
    expect(reason).toContain('apiKey=[redacted]');
    expect(reason).toContain('Bearer [redacted]');
    expect(reason).not.toContain('short-lived-token');
    expect(reason).not.toContain('raw-key');
    expect(report.blockedReasons.join('\n')).not.toContain('abc.def');
  });

  it('keeps Skills and MCP safety states aligned with capability registry rows', () => {
    const base = aiStatus();
    const status = {
      ...base,
      capabilityRegistry: buildCapabilityRegistry({
        snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: base }),
        productSurfaces: {
          skills: { enabledCount: 2, readyCount: 1, modelVisibleCount: 1, needsConfigCount: 1, catalogueCount: 1 },
          mcp: { connectedServerCount: 1, toolCount: 3, modelVisibleToolCount: 2, errorCount: 0, catalogueCount: 1 },
          agentCli: { detectedCount: 1, readyCount: 1, manualRunCount: 1, readyManualRunCount: 1, runningCount: 0, errorCount: 0, catalogueCount: 2 },
        },
      }),
    };
    const report = buildConfigurationSafetyReport(status);

    expect(report.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'agent_cli.runtimes')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
      startupProbePolicy: 'safe_read_only',
      exposesSecretValue: false,
    });
  });

  it('does not treat ready Skills or connected MCP tools as usable until model-visible exposure is gated in', () => {
    const base = aiStatus();
    const status = {
      ...base,
      capabilityRegistry: buildCapabilityRegistry({
        snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: base }),
        productSurfaces: {
          skills: { enabledCount: 1, readyCount: 1, modelVisibleCount: 0, needsConfigCount: 0, catalogueCount: 1 },
          mcp: { connectedServerCount: 1, toolCount: 3, modelVisibleToolCount: 0, errorCount: 0, catalogueCount: 1 },
        },
      }),
    };
    const report = buildConfigurationSafetyReport(status);

    expect(report.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      state: 'missing',
      reason: 'Ready skills are not exposed through the runtime tool gate.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      state: 'missing',
      reason: 'Connected MCP tools are not exposed through the runtime tool gate.',
    });
  });
});

function withRegistry(status: AiConfigStatus): AiConfigStatus {
  return {
    ...status,
    capabilityRegistry: buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: status }),
    }),
  };
}

function aiStatus(partial: Partial<AiConfigStatus> = {}): AiConfigStatus {
  return {
    configured: true,
    apiKeyStored: true,
    apiKeySource: 'env',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    baseUrl: null,
    workspaceRoot: '/repo',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/config.json',
    codeAgentModelProducerEnabled: true,
    codeAgentWorkspaceChecks: {
      lint: { available: true, reason: 'ok' },
      test: { available: true, reason: 'ok' },
    },
    featureFlags: {
      enableScheduler: false,
      enableSandboxCodingAgent: false,
      enableSandboxPatchPromotionApply: false,
      enableSelfCheck: true,
    },
    toolScaffoldSummaries: [],
    ...partial,
  };
}
