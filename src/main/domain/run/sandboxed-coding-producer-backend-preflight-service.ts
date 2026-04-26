import type { AgentSandboxBackendProbe } from '../../../shared/agent-sandbox-provider.js';
import type { FeatureFlags } from '../../../shared/types/settings.js';
import { AgentSessionRepository } from '../../db/repositories/agent-session-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import {
  buildSandboxedCodingProducerBackendBlockedPreviewResult,
  buildSandboxedCodingProducerBackendConnectionPlan,
  buildSandboxedCodingProducerBackendLaunchEnvelope,
  evaluateSandboxedCodingProducerBackendConnectionGate,
  validateSandboxedCodingProducerBackendLaunchEnvelope,
  type SandboxedCodingProducerBackendConnectionPlan,
  type SandboxedCodingProducerBackendLaunchEnvelope,
} from './sandboxed-coding-producer-backend.js';
import {
  type NormalizedSandboxedCodingProducerRequest,
  type PreviewSandboxedCodingInjectedProducerRunResult,
  validateSandboxedCodingProducerRequest,
} from './sandboxed-coding-producer.js';
import {
  SandboxedCodingProducerPreviewPersister,
  summarizeSandboxedCodingProducerPreviewPersistence,
  type PersistSandboxedCodingProducerPreviewResult,
} from './sandboxed-coding-producer-persister.js';

export type RunSandboxedCodingProducerBackendPreflightResult =
  | {
      envelope: Extract<SandboxedCodingProducerBackendLaunchEnvelope, { status: 'ready' }>;
      plan: Extract<SandboxedCodingProducerBackendConnectionPlan, { status: 'ready' }>;
      status: 'ready';
      summary: string;
    }
  | {
      diagnostic: PreviewSandboxedCodingInjectedProducerRunResult | null;
      persistence?: PersistSandboxedCodingProducerPreviewResult;
      persistenceSummary?: string;
      plan: Extract<SandboxedCodingProducerBackendConnectionPlan, { status: 'blocked' }>;
      reason: string;
      status: 'blocked';
      summary: string;
    };

export class SandboxedCodingProducerBackendPreflightService {
  constructor(
    private readonly persister: SandboxedCodingProducerPreviewPersister = new SandboxedCodingProducerPreviewPersister(
      new AgentSessionRepository(),
      new RunStepRepository(),
    ),
  ) {}

  async run(params: {
    featureFlags: FeatureFlags;
    probe: AgentSandboxBackendProbe;
    producerSource?: 'local_diagnostic' | 'model_backed' | null;
    request: unknown;
  }): Promise<RunSandboxedCodingProducerBackendPreflightResult> {
    const gate = evaluateSandboxedCodingProducerBackendConnectionGate(params);
    const plan = buildSandboxedCodingProducerBackendConnectionPlan(gate);
    const envelope = buildSandboxedCodingProducerBackendLaunchEnvelope(gate);

    if (plan.status === 'ready' && envelope.status === 'ready') {
      const validation = validateSandboxedCodingProducerBackendLaunchEnvelope(envelope);
      if (validation.valid) {
        return {
          envelope: validation.envelope,
          plan,
          status: 'ready',
          summary: validation.summary,
        };
      }

      const blockedPlan = buildBlockedPlanFromValidation({
        blockedReasons: validation.blockedReasons,
        gateSummary: gate.summary,
      });
      return this.persistBlockedPreflight({
        plan: blockedPlan,
        producerSource: params.producerSource,
        request: params.request,
      });
    }

    const blockedPlan = plan.status === 'blocked'
      ? plan
      : buildBlockedPlanFromValidation({
        blockedReasons: envelope.status === 'blocked'
          ? envelope.blockedReasons
          : ['Sandboxed coding producer backend launch envelope is not ready.'],
        gateSummary: gate.summary,
      });

    return this.persistBlockedPreflight({
      plan: blockedPlan,
      producerSource: params.producerSource,
      request: params.request,
    });
  }

  private async persistBlockedPreflight(params: {
    plan: Extract<SandboxedCodingProducerBackendConnectionPlan, { status: 'blocked' }>;
    producerSource?: 'local_diagnostic' | 'model_backed' | null;
    request: unknown;
  }): Promise<Extract<RunSandboxedCodingProducerBackendPreflightResult, { status: 'blocked' }>> {
    const requestValidation = validateSandboxedCodingProducerRequest(params.request);
    const normalizedRequest = requestValidation.valid ? requestValidation.request : null;
    const runId = normalizedRequest?.runId ?? readString(params.request, 'runId');

    if (!runId) {
      return {
        diagnostic: null,
        plan: params.plan,
        reason: params.plan.blockedReasons.join(' ') || params.plan.summary,
        status: 'blocked',
        summary: `${params.plan.summary} / not persisted: missing run id`,
      };
    }

    const diagnostic = buildBlockedDiagnostic({
      plan: params.plan,
      producerSource: params.producerSource,
      request: normalizedRequest,
      runId,
    });
    const reason = params.plan.blockedReasons.join(' ') || params.plan.summary;
    const persistence = await this.persister.persist({
      result: diagnostic,
      runId,
    });

    return {
      diagnostic,
      persistence,
      persistenceSummary: summarizeSandboxedCodingProducerPreviewPersistence({
        result: diagnostic,
        stepCount: persistence.steps.length,
      }),
      plan: params.plan,
      reason,
      status: 'blocked',
      summary: params.plan.summary,
    };
  }
}

function buildBlockedDiagnostic(params: {
  plan: Extract<SandboxedCodingProducerBackendConnectionPlan, { status: 'blocked' }>;
  producerSource?: 'local_diagnostic' | 'model_backed' | null;
  request: NormalizedSandboxedCodingProducerRequest | null;
  runId: string;
}): PreviewSandboxedCodingInjectedProducerRunResult {
  return buildSandboxedCodingProducerBackendBlockedPreviewResult({
    commandScripts: params.request?.commandPolicy.allowedScripts,
    network: params.request?.executionPolicy.network,
    plan: params.plan,
    producerSource: params.producerSource,
    providerKind: params.request?.modelPolicy.providerKind,
    runId: params.runId,
    sourceId: params.request?.sourceId,
    workspaceRoot: params.request?.workspaceRoot,
  });
}

function buildBlockedPlanFromValidation(params: {
  blockedReasons: string[];
  gateSummary: string;
}): Extract<SandboxedCodingProducerBackendConnectionPlan, { status: 'blocked' }> {
  return {
    blockedReasons: params.blockedReasons,
    gateSummary: params.gateSummary,
    status: 'blocked',
    summary: `Sandboxed coding producer backend connection plan blocked: ${params.blockedReasons.join(' ')}`,
  };
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}
