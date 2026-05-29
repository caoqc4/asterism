import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { RunCheckpointRecord, RunStepRecord } from '../../../shared/types/run.js';
import type { SandboxPatchPromotionRecord } from '../../../shared/types/sandbox-patch-promotion.js';
import { makeTempDir } from '../../test-utils.js';
import {
  inferRuntimePatchPromotionProviderConfigurationFromRunSteps,
  inferRuntimePatchPromotionSelectedRuntimeContractFromRunSteps,
  SandboxPatchPromotionApplyService,
} from './sandbox-patch-promotion-apply-service.js';

function buildPromotion(partial: Partial<SandboxPatchPromotionRecord> = {}): SandboxPatchPromotionRecord {
  return {
    id: partial.id ?? 'sandbox_patch_promotion_1',
    checkpointId: partial.checkpointId ?? 'run_checkpoint_1',
    runId: partial.runId ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    artifactId: partial.artifactId ?? 'artifact_1',
    sourceId: partial.sourceId ?? 'sandbox_source_1',
    decisionId: partial.decisionId ?? 'decision_1',
    patchDigest: partial.patchDigest ?? 'sha256:patch_digest',
    expectedFiles: partial.expectedFiles ?? ['notes.md'],
    status: partial.status ?? 'pending',
    auditSummary: partial.auditSummary ?? null,
    blockedReasons: partial.blockedReasons ?? [],
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    appliedAt: partial.appliedAt ?? null,
  };
}

function buildCheckpoint(partial: Partial<RunCheckpointRecord> = {}): RunCheckpointRecord {
  return {
    id: partial.id ?? 'run_checkpoint_1',
    runId: partial.runId ?? 'run_1',
    stepId: partial.stepId ?? 'run_step_1',
    kind: partial.kind ?? 'patch_promotion',
    status: partial.status ?? 'open',
    payload: partial.payload ?? '{}',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildStep(partial: Partial<RunStepRecord> = {}): RunStepRecord {
  return {
    id: partial.id ?? 'run_step_1',
    runId: partial.runId ?? 'run_1',
    index: partial.index ?? 0,
    kind: partial.kind ?? 'plan',
    status: partial.status ?? 'completed',
    title: partial.title ?? 'Agent CLI run accepted',
    input: partial.input ?? null,
    output: partial.output ?? null,
    error: partial.error ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildArtifact(diff: string, partial: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: partial.id ?? 'artifact_1',
    taskId: partial.taskId ?? 'task_1',
    sourceType: partial.sourceType ?? 'run',
    sourceId: partial.sourceId ?? 'run_1',
    kind: partial.kind ?? 'patch',
    title: partial.title ?? 'Reviewable sandbox patch',
    content: partial.content ?? JSON.stringify({
      artifact: {
        commandLogs: [],
        diff,
        files: ['notes.md'],
        kind: 'patch',
        riskSummary: 'Pending review.',
        summary: 'Reviewable sandbox patch',
      },
      review: {
        audit: null,
        sandboxSessionId: 'sandbox_source_1',
        sessionSummary: 'sandbox=sandbox_source_1',
      },
    }),
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildService(params: {
  artifact: ArtifactRecord;
  promotion?: SandboxPatchPromotionRecord;
  selectedRuntime?: 'api' | 'api_without_provider_configuration' | 'codex' | 'none';
  workspaceRoot: string;
}) {
  const promotion = params.promotion ?? buildPromotion();
  const markApplied = vi.fn().mockImplementation(
    async (_id: string, auditSummary: string) => ({
      ...promotion,
      appliedAt: '2026-01-01T00:01:00.000Z',
      auditSummary,
      status: 'applied',
    }),
  );
  const markBlocked = vi.fn().mockImplementation(
    async (_id: string, blockedReasons: string[], auditSummary: string) => ({
      ...promotion,
      auditSummary,
      blockedReasons,
      status: 'blocked',
    }),
  );
  const service = new SandboxPatchPromotionApplyService(
    {
      preflight: vi.fn().mockResolvedValue({
        artifact: params.artifact,
        checkpoint: buildCheckpoint(),
        promotion,
        status: 'ready',
        summary: 'Sandbox patch promotion preflight: ready',
      }),
    },
    { markApplied, markBlocked },
    () => params.workspaceRoot,
    params.selectedRuntime === 'codex'
      ? async (runId, taskId) => ({
          invocationLayer: 'selected_runtime',
          phase: 'execution_run',
          runId,
          runtimeMode: 'codex',
          taskId,
        })
      : params.selectedRuntime === 'api' || params.selectedRuntime === 'api_without_provider_configuration'
        ? async (runId, taskId) => ({
            invocationLayer: 'api_runtime',
            phase: 'execution_run',
            provider: 'openai',
            runId,
            runtimeMode: 'api',
            taskId,
          })
        : null,
    params.selectedRuntime === 'api'
      ? async () => ({
          configuredProvider: 'openai',
          providerConfigured: true,
        })
      : null,
  );

  return { markApplied, markBlocked, service };
}

describe('SandboxPatchPromotionApplyService', () => {
  it('blocks workspace apply before preflight when explicit operator confirmation is missing', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-unconfirmed-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const preflight = vi.fn().mockResolvedValue({
        artifact: buildArtifact(diff),
        checkpoint: buildCheckpoint(),
        promotion: buildPromotion(),
        status: 'ready',
        summary: 'Sandbox patch promotion preflight: ready',
      });
      const markApplied = vi.fn();
      const markBlocked = vi.fn();
      const service = new SandboxPatchPromotionApplyService(
        { preflight },
        { markApplied, markBlocked },
        () => tempRoot,
      );

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: false,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: ['Sandbox patch promotion apply requires explicit operator confirmation.'],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(result.auditSummary).toContain('explicit operator confirmation is required');
      expect(preflight).not.toHaveBeenCalled();
      expect(markApplied).not.toHaveBeenCalled();
      expect(markBlocked).not.toHaveBeenCalled();
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks workspace apply before preflight when the operator identity is missing', async () => {
    const preflight = vi.fn();
    const markApplied = vi.fn();
    const markBlocked = vi.fn();
    const service = new SandboxPatchPromotionApplyService(
      { preflight },
      { markApplied, markBlocked },
      () => '/tmp/unused',
    );

    await expect(service.apply('run_checkpoint_1', {
      operatorConfirmed: true,
      operatorId: '   ',
    })).resolves.toMatchObject({
      blockedReasons: ['Sandbox patch promotion apply requires explicit operator confirmation.'],
      status: 'blocked',
      touchedFiles: [],
    });
    expect(preflight).not.toHaveBeenCalled();
    expect(markApplied).not.toHaveBeenCalled();
    expect(markBlocked).not.toHaveBeenCalled();
  });

  it('applies a reviewed sandbox patch and marks the promotion applied', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-apply-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const { markApplied, service } = buildService({
        artifact: buildArtifact(diff),
        selectedRuntime: 'codex',
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        status: 'applied',
        touchedFiles: ['notes.md'],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('beta\n');
      expect(markApplied).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        expect.stringContaining('Sandbox patch promotion applied / checkpoint=run_checkpoint_1 / files=notes.md'),
      );
      expect(markApplied.mock.calls[0]?.[1]).toContain('expectedFileCount=1');
      expect(markApplied.mock.calls[0]?.[1]).toContain('touchedFileCount=1');
      expect(markApplied.mock.calls[0]?.[1]).toContain('filesMatched=yes');
      expect(markApplied.mock.calls[0]?.[1]).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
      expect(markApplied.mock.calls[0]?.[1]).toContain('promotionRequirements=8/8');
      expect(markApplied.mock.calls[0]?.[1]).toContain('selectedRuntimeContract=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('selectedRuntimeRun=run_1');
      expect(markApplied.mock.calls[0]?.[1]).toContain('selectedRuntimeTask=task_1');
      expect(markApplied.mock.calls[0]?.[1]).toContain('explicitOperatorApply=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('sameRunEvidenceChain=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('postApplyRunEvidence=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('promotionMissingRequirements=none');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks reviewed patch workspace apply when selected-runtime evidence is missing', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-missing-runtime-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const { markApplied, markBlocked, service } = buildService({
        artifact: buildArtifact(diff),
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: [
          'Patch promotion apply requires complete runtime patch promotion routing evidence before workspace files can be written.',
        ],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
      expect(markApplied).not.toHaveBeenCalled();
      expect(markBlocked).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        [
          'Patch promotion apply requires complete runtime patch promotion routing evidence before workspace files can be written.',
        ],
        expect.stringContaining('Sandbox patch promotion apply blocked: Patch promotion apply requires complete runtime patch promotion routing evidence before workspace files can be written.'),
      );
      expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionRequirements=6/8');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('selectedRuntimeContract=missing');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('sameRunEvidenceChain=missing');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('postApplyRunEvidence=ready');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionMissingRequirements=selected_runtime_contract,same_run_evidence_chain');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks API reviewed patch workspace apply when provider configuration evidence is missing', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-missing-api-provider-config-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const { markApplied, markBlocked, service } = buildService({
        artifact: buildArtifact(diff),
        selectedRuntime: 'api_without_provider_configuration',
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: [
          'Patch promotion apply requires complete runtime patch promotion routing evidence before workspace files can be written.',
        ],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
      expect(markApplied).not.toHaveBeenCalled();
      expect(markBlocked).toHaveBeenCalled();
      expect(markBlocked.mock.calls[0]?.[2]).toContain('selectedRuntimeProvider=openai');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('providerConfigured=missing');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('configuredProviderEvidenceChain=missing');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('selectedRuntimeProviderEvidenceChain=missing');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionMissingRequirements=selected_runtime_contract,same_run_evidence_chain');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('applies API reviewed patch workspace apply when runtime and provider evidence match', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-api-apply-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const { markApplied, service } = buildService({
        artifact: buildArtifact(diff),
        selectedRuntime: 'api',
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        status: 'applied',
        touchedFiles: ['notes.md'],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('beta\n');
      expect(markApplied.mock.calls[0]?.[1]).toContain('providerConfigured=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('configuredProvider=openai');
      expect(markApplied.mock.calls[0]?.[1]).toContain('configuredProviderEvidenceChain=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('selectedRuntimeProviderEvidenceChain=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('promotionRequirements=8/8');
      expect(markApplied.mock.calls[0]?.[1]).toContain('promotionMissingRequirements=none');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('infers selected runtime contract from first-party run step evidence', () => {
    const cliSteps: RunStepRecord[] = [
      buildStep({
        output: [
          'runtime=codex',
          'sandbox=read-only',
        ].join('\n'),
      }),
    ];
    expect(inferRuntimePatchPromotionSelectedRuntimeContractFromRunSteps({
      runId: 'run_1',
      steps: cliSteps,
      taskId: 'task_1',
    })).toMatchObject({
      invocationLayer: 'selected_runtime',
      phase: 'execution_run',
      runId: 'run_1',
      runtimeMode: 'codex',
      taskId: 'task_1',
    });

    const apiSteps: RunStepRecord[] = [
      buildStep({
        runId: 'run_api_1',
        output: [
          'Agent API execution promotion readiness',
          'selectedRuntimeContract=ready',
          'runtimeMode=api',
          'invocationLayer=api_runtime',
          'selectedRuntimeRun=run_api_1',
          'selectedRuntimeTask=task_api_1',
          'selectedRuntimeProvider=openai',
          'selectedRuntimeProviderEvidenceChain=ready',
        ].join(' / '),
      }),
    ];
    expect(inferRuntimePatchPromotionSelectedRuntimeContractFromRunSteps({
      runId: 'run_api_1',
      steps: apiSteps,
      taskId: 'task_api_1',
    })).toMatchObject({
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      provider: 'openai',
      runId: 'run_api_1',
      runtimeMode: 'api',
      taskId: 'task_api_1',
    });
    expect(inferRuntimePatchPromotionSelectedRuntimeContractFromRunSteps({
      runId: 'run_api_1',
      steps: apiSteps,
      taskId: 'task_other',
    })).toBeNull();

    expect(inferRuntimePatchPromotionSelectedRuntimeContractFromRunSteps({
      runId: 'run_api_1',
      steps: [
        buildStep({
          runId: 'run_api_1',
          output: [
            'Agent API execution promotion readiness',
            'selectedRuntimeContract=ready',
            'runtimeMode=api',
            'invocationLayer=api_runtime',
            'selectedRuntimeRun=run_api_1',
            'selectedRuntimeTask=task_api_1',
            'selectedRuntimeProvider=missing',
            'selectedRuntimeProviderEvidenceChain=missing',
          ].join(' / '),
        }),
      ],
      taskId: 'task_api_1',
    })).toBeNull();

    expect(inferRuntimePatchPromotionSelectedRuntimeContractFromRunSteps({
      runId: 'run_1',
      steps: [
        buildStep({
          output: 'runtime=codex',
          runId: 'run_other',
        }),
      ],
      taskId: 'task_1',
    })).toBeNull();

    expect(inferRuntimePatchPromotionSelectedRuntimeContractFromRunSteps({
      runId: 'run_1',
      steps: [
        buildStep({
          output: 'runtime=codex',
          status: 'running',
        }),
      ],
      taskId: 'task_1',
    })).toBeNull();
  });

  it('infers API provider configuration only from matching provider evidence chains', () => {
    const readyStep = buildStep({
      runId: 'run_api_1',
      output: [
        'Agent API execution promotion readiness',
        'selectedRuntimeContract=ready',
        'runtimeMode=api',
        'invocationLayer=api_runtime',
        'selectedRuntimeRun=run_api_1',
        'selectedRuntimeTask=task_api_1',
        'selectedRuntimeProvider=openai',
        'selectedRuntimeProviderEvidenceChain=ready',
        'providerConfigured=ready',
        'configuredProvider=openai',
        'configuredProviderEvidenceChain=ready',
      ].join(' / '),
    });

    expect(inferRuntimePatchPromotionProviderConfigurationFromRunSteps({
      runId: 'run_api_1',
      steps: [readyStep],
      taskId: 'task_api_1',
    })).toEqual({
      configuredProvider: 'openai',
      providerConfigured: true,
    });

    const stitchedProviderStep = buildStep({
      runId: 'run_api_1',
      output: [
        'Agent API execution promotion readiness',
        'selectedRuntimeContract=ready',
        'runtimeMode=api',
        'invocationLayer=api_runtime',
        'selectedRuntimeRun=run_api_1',
        'selectedRuntimeTask=task_api_1',
        'selectedRuntimeProvider=openai',
        'selectedRuntimeProviderEvidenceChain=ready',
        'providerConfigured=ready',
        'configuredProvider=anthropic',
        'configuredProviderEvidenceChain=ready',
      ].join(' / '),
    });

    expect(inferRuntimePatchPromotionProviderConfigurationFromRunSteps({
      runId: 'run_api_1',
      steps: [stitchedProviderStep],
      taskId: 'task_api_1',
    })).toBeNull();

    expect(inferRuntimePatchPromotionProviderConfigurationFromRunSteps({
      runId: 'run_api_1',
      steps: [
        buildStep({
          runId: 'run_api_1',
          output: [
            'Agent API execution promotion readiness',
            'selectedRuntimeContract=ready',
            'runtimeMode=api',
            'invocationLayer=api_runtime',
            'selectedRuntimeRun=run_api_1',
            'selectedRuntimeTask=task_api_1',
            'selectedRuntimeProvider=openai',
            'selectedRuntimeProviderEvidenceChain=ready',
            'providerConfigured=missing',
            'configuredProvider=openai',
            'configuredProviderEvidenceChain=missing',
          ].join(' / '),
        }),
      ],
      taskId: 'task_api_1',
    })).toBeNull();
  });

  it('blocks without partial writes when a workspace base file diverges', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-diverge-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'first.md'), 'alpha\n');
      fs.writeFileSync(path.join(tempRoot, 'second.md'), 'changed\n');
      const diff = [
        '--- a/first.md',
        '+++ b/first.md',
        '@@',
        '-alpha',
        '+beta',
        '--- a/second.md',
        '+++ b/second.md',
        '@@',
        '-gamma',
        '+delta',
      ].join('\n');
      const promotion = buildPromotion({ expectedFiles: ['first.md', 'second.md'] });
      const { markBlocked, service } = buildService({
        artifact: buildArtifact(diff),
        promotion,
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: ['Patch promotion workspace content does not match reviewed base: second.md'],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'first.md'), 'utf8')).toBe('alpha\n');
      expect(fs.readFileSync(path.join(tempRoot, 'second.md'), 'utf8')).toBe('changed\n');
      expect(markBlocked).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        ['Patch promotion workspace content does not match reviewed base: second.md'],
        expect.stringContaining('Sandbox patch promotion apply blocked: Patch promotion workspace content does not match reviewed base: second.md'),
      );
      expect(markBlocked.mock.calls[0]?.[2]).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionSatisfiedRequirements=patch_artifact,promotion_decision,promotion_preflight,explicit_operator_apply');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionMissingRequirements=selected_runtime_contract,target_task_identity,same_run_evidence_chain,post_apply_run_evidence');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('postApplyRunEvidence=missing');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('marks durable promotion records blocked when preflight fails before workspace validation', async () => {
    const promotion = buildPromotion();
    const markBlocked = vi.fn().mockImplementation(
      async (_id: string, blockedReasons: string[], auditSummary: string) => ({
        ...promotion,
        auditSummary,
        blockedReasons,
        status: 'blocked',
      }),
    );
    const service = new SandboxPatchPromotionApplyService(
      {
        preflight: vi.fn().mockResolvedValue({
          blockedReasons: ['Patch promotion artifact digest does not match promotion record.'],
          promotion,
          status: 'blocked',
          summary: 'Sandbox patch promotion preflight blocked: Patch promotion artifact digest does not match promotion record.',
        }),
      },
      {
        markApplied: vi.fn(),
        markBlocked,
      },
      () => '/tmp/unused',
      async (runId, taskId) => ({
        invocationLayer: 'selected_runtime',
        phase: 'execution_run',
        runId,
        runtimeMode: 'codex',
        taskId,
      }),
    );

    const result = await service.apply('run_checkpoint_1', {
      operatorConfirmed: true,
      operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
    });

    expect(result).toMatchObject({
      blockedReasons: ['Patch promotion artifact digest does not match promotion record.'],
      status: 'blocked',
      touchedFiles: [],
    });
    expect(markBlocked).toHaveBeenCalledWith(
      'sandbox_patch_promotion_1',
      ['Patch promotion artifact digest does not match promotion record.'],
      expect.stringContaining('Sandbox patch promotion apply blocked: Patch promotion artifact digest does not match promotion record.'),
    );
    expect(markBlocked.mock.calls[0]?.[2]).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
    expect(markBlocked.mock.calls[0]?.[2]).toContain('selectedRuntimeContract=ready');
    expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionPreflight=missing');
    expect(markBlocked.mock.calls[0]?.[2]).toContain('explicitOperatorApply=ready');
    expect(markBlocked.mock.calls[0]?.[2]).toContain('postApplyRunEvidence=missing');
    expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionMissingRequirements=target_task_identity,promotion_preflight,same_run_evidence_chain,post_apply_run_evidence');
  });

  it('blocks duplicate patch file entries before writing workspace files', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-duplicate-file-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-beta',
        '+gamma',
      ].join('\n');
      const { markBlocked, service } = buildService({
        artifact: buildArtifact(diff),
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: [
          'Patch promotion touched duplicate file: notes.md',
        ],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
      expect(markBlocked).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        [
          'Patch promotion touched duplicate file: notes.md',
        ],
        expect.stringContaining('Sandbox patch promotion apply blocked: Patch promotion touched duplicate file: notes.md'),
      );
      expect(markBlocked.mock.calls[0]?.[2]).toContain('touchedFileEvidenceChain=missing');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks unsafe patch file aliases before writing workspace files', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-unsafe-file-');

    try {
      fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, 'src', 'app.ts'), 'alpha\n');
      const diff = [
        '--- a/src/./app.ts',
        '+++ b/src/./app.ts',
        '@@',
        '-alpha',
        '+beta',
        '--- /dev/null',
        '+++ b/C:\\secrets\\token.txt',
        '@@',
        '+token',
      ].join('\n');
      const promotion = buildPromotion({ expectedFiles: ['src/./app.ts', 'C:\\secrets\\token.txt'] });
      const { markBlocked, service } = buildService({
        artifact: buildArtifact(diff),
        promotion,
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: [
          'Patch promotion expected unsafe file: src/./app.ts',
          'Patch promotion expected unsafe file: C:/secrets/token.txt',
          'Patch promotion touched unsafe file: src/./app.ts',
          'Patch promotion touched unsafe file: C:/secrets/token.txt',
        ],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'src', 'app.ts'), 'utf8')).toBe('alpha\n');
      expect(fs.existsSync(path.join(tempRoot, 'C:', 'secrets', 'token.txt'))).toBe(false);
      expect(markBlocked).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        [
          'Patch promotion expected unsafe file: src/./app.ts',
          'Patch promotion expected unsafe file: C:/secrets/token.txt',
          'Patch promotion touched unsafe file: src/./app.ts',
          'Patch promotion touched unsafe file: C:/secrets/token.txt',
        ],
        expect.stringContaining('Sandbox patch promotion apply blocked: Patch promotion expected unsafe file: src/./app.ts Patch promotion expected unsafe file: C:/secrets/token.txt Patch promotion touched unsafe file: src/./app.ts Patch promotion touched unsafe file: C:/secrets/token.txt'),
      );
      expect(markBlocked.mock.calls[0]?.[2]).toContain('filePathSafetyChain=missing');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks symlink-backed workspace patch targets before writing files', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-symlink-file-');
    const outsideRoot = makeTempDir('taskplane-sandbox-promotion-symlink-outside-');

    try {
      fs.writeFileSync(path.join(outsideRoot, 'outside.md'), 'alpha\n');
      fs.symlinkSync(path.join(outsideRoot, 'outside.md'), path.join(tempRoot, 'notes.md'));
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const { markBlocked, service } = buildService({
        artifact: buildArtifact(diff),
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: [
          'Patch promotion workspace path uses symlink: notes.md',
        ],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(outsideRoot, 'outside.md'), 'utf8')).toBe('alpha\n');
      expect(markBlocked).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        [
          'Patch promotion workspace path uses symlink: notes.md',
        ],
        expect.stringContaining('Sandbox patch promotion apply blocked: Patch promotion workspace path uses symlink: notes.md'),
      );
      expect(markBlocked.mock.calls[0]?.[2]).toContain('postApplyRunEvidence=missing');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('blocks unsafe or duplicate expected patch files before writing workspace files', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-expected-file-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const promotion = buildPromotion({ expectedFiles: ['notes.md', 'notes.md', '.env.local'] });
      const { markBlocked, service } = buildService({
        artifact: buildArtifact(diff),
        promotion,
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: [
          'Patch promotion expected duplicate file: notes.md',
          'Patch promotion expected unsafe file: .env.local',
          'Patch promotion touched files do not match expected files.',
        ],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
      expect(markBlocked).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        [
          'Patch promotion expected duplicate file: notes.md',
          'Patch promotion expected unsafe file: .env.local',
          'Patch promotion touched files do not match expected files.',
        ],
        expect.stringContaining('Sandbox patch promotion apply blocked: Patch promotion expected duplicate file: notes.md Patch promotion expected unsafe file: .env.local Patch promotion touched files do not match expected files.'),
      );
      expect(markBlocked.mock.calls[0]?.[2]).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('expectedFileEvidenceChain=missing');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('postApplyRunEvidence=missing');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('normalizes slash and backslash aliases before applying reviewed patches', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-path-alias-');

    try {
      fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, 'src', 'app.ts'), 'alpha\n');
      const diff = [
        '--- a/src\\app.ts',
        '+++ b/src\\app.ts',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const promotion = buildPromotion({ expectedFiles: ['src/app.ts'] });
      const { markApplied, service } = buildService({
        artifact: buildArtifact(diff),
        promotion,
        selectedRuntime: 'codex',
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        status: 'applied',
        touchedFiles: ['src/app.ts'],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'src', 'app.ts'), 'utf8')).toBe('beta\n');
      expect(fs.existsSync(path.join(tempRoot, 'src\\app.ts'))).toBe(false);
      expect(markApplied.mock.calls[0]?.[1]).toContain('files=src/app.ts');
      expect(markApplied.mock.calls[0]?.[1]).toContain('touchedFiles=src/app.ts');
      expect(markApplied.mock.calls[0]?.[1]).toContain('filePathSafetyChain=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('touchedFileEvidenceChain=ready');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks expected file aliases that duplicate after path normalization', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-expected-alias-');

    try {
      fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, 'src', 'app.ts'), 'alpha\n');
      const diff = [
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const promotion = buildPromotion({ expectedFiles: ['src/app.ts', 'src\\app.ts'] });
      const { markBlocked, service } = buildService({
        artifact: buildArtifact(diff),
        promotion,
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: [
          'Patch promotion expected duplicate file: src/app.ts',
        ],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'src', 'app.ts'), 'utf8')).toBe('alpha\n');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('expectedFiles=src/app.ts,src/app.ts');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('expectedFileEvidenceChain=missing');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks repeated-separator expected file aliases before workspace writes', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-repeated-separator-');

    try {
      fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, 'src', 'app.ts'), 'alpha\n');
      const diff = [
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const promotion = buildPromotion({ expectedFiles: ['src/app.ts', 'src//app.ts'] });
      const { markBlocked, service } = buildService({
        artifact: buildArtifact(diff),
        promotion,
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: [
          'Patch promotion expected duplicate file: src/app.ts',
        ],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'src', 'app.ts'), 'utf8')).toBe('alpha\n');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('expectedFiles=src/app.ts,src/app.ts');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('expectedFileEvidenceChain=missing');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks malformed reviewed patch diffs instead of throwing out of apply', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-malformed-diff-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const { markBlocked, service } = buildService({
        artifact: buildArtifact('--- a/notes.md\n@@\n-alpha\n+beta'),
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: ['Sandbox patch promotion diff is not in the supported review format.'],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
      expect(markBlocked).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        ['Sandbox patch promotion diff is not in the supported review format.'],
        expect.stringContaining('Sandbox patch promotion apply blocked: Sandbox patch promotion diff is not in the supported review format.'),
      );
      expect(markBlocked.mock.calls[0]?.[2]).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionSatisfiedRequirements=patch_artifact,promotion_decision,promotion_preflight,explicit_operator_apply');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionMissingRequirements=selected_runtime_contract,target_task_identity,same_run_evidence_chain,post_apply_run_evidence');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('records routing readiness evidence when reviewed patch artifact JSON is invalid', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-invalid-json-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const { markBlocked, service } = buildService({
        artifact: buildArtifact('', {
          content: '{"artifact":',
        }),
        selectedRuntime: 'codex',
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        blockedReasons: ['Patch promotion artifact content is not valid sandbox patch review JSON.'],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
      expect(markBlocked).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        ['Patch promotion artifact content is not valid sandbox patch review JSON.'],
        expect.stringContaining('Sandbox patch promotion apply blocked: Patch promotion artifact content is not valid sandbox patch review JSON.'),
      );
      expect(markBlocked.mock.calls[0]?.[2]).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('selectedRuntimeContract=ready');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionPreflight=ready');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('explicitOperatorApply=ready');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('postApplyRunEvidence=missing');
      expect(markBlocked.mock.calls[0]?.[2]).toContain('promotionMissingRequirements=target_task_identity,same_run_evidence_chain,post_apply_run_evidence');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('treats already-promoted workspace content as idempotently applied', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-idempotent-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'beta\n');
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const { markApplied, service } = buildService({
        artifact: buildArtifact(diff),
        selectedRuntime: 'codex',
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
      });

      expect(result).toMatchObject({
        status: 'already_applied',
        touchedFiles: ['notes.md'],
      });
      expect(markApplied).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        expect.stringContaining('Sandbox patch promotion already applied / checkpoint=run_checkpoint_1 / files=notes.md'),
      );
      expect(markApplied.mock.calls[0]?.[1]).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
      expect(markApplied.mock.calls[0]?.[1]).toContain('promotionRequirements=8/8');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns routing readiness evidence when preflight reports an already applied promotion', async () => {
    const promotion = buildPromotion({ status: 'applied' });
    const service = new SandboxPatchPromotionApplyService(
      {
        preflight: vi.fn().mockResolvedValue({
          promotion,
          status: 'already_applied',
          summary: 'Sandbox patch promotion preflight: already_applied / checkpoint=run_checkpoint_1',
        }),
      },
      {
        markApplied: vi.fn(),
        markBlocked: vi.fn(),
      },
      () => '/tmp/unused',
    );

    const result = await service.apply('run_checkpoint_1', {
      operatorConfirmed: true,
      operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
    });

    expect(result).toMatchObject({
      status: 'already_applied',
      touchedFiles: ['notes.md'],
    });
    expect(result.auditSummary).toContain('Sandbox patch promotion already applied / checkpoint=run_checkpoint_1 / files=notes.md');
    expect(result.auditSummary).toContain('expectedFileCount=1');
    expect(result.auditSummary).toContain('touchedFileCount=1');
    expect(result.auditSummary).toContain('filesMatched=yes');
    expect(result.auditSummary).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
    expect(result.auditSummary).toContain('promotionRequirements=6/8');
    expect(result.auditSummary).toContain('explicitOperatorApply=ready');
    expect(result.auditSummary).toContain('sameRunEvidenceChain=missing');
    expect(result.auditSummary).toContain('postApplyRunEvidence=ready');
    expect(result.auditSummary).toContain('promotionMissingRequirements=selected_runtime_contract,same_run_evidence_chain');
  });

  it('keeps already applied promotion evidence fully ready when same-run runtime contract is available', async () => {
    const promotion = buildPromotion({ status: 'applied' });
    const service = new SandboxPatchPromotionApplyService(
      {
        preflight: vi.fn().mockResolvedValue({
          promotion,
          status: 'already_applied',
          summary: 'Sandbox patch promotion preflight: already_applied / checkpoint=run_checkpoint_1',
        }),
      },
      {
        markApplied: vi.fn(),
        markBlocked: vi.fn(),
      },
      () => '/tmp/unused',
      async (runId, taskId) => ({
        invocationLayer: 'selected_runtime',
        phase: 'execution_run',
        runId,
        runtimeMode: 'codex',
        taskId,
      }),
    );

    const result = await service.apply('run_checkpoint_1', {
      operatorConfirmed: true,
      operatorId: 'local_operator',
        operatorSurface: 'ipc_explicit_apply',
    });

    expect(result).toMatchObject({
      status: 'already_applied',
      touchedFiles: ['notes.md'],
    });
    expect(result.auditSummary).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
    expect(result.auditSummary).toContain('promotionRequirements=8/8');
    expect(result.auditSummary).toContain('selectedRuntimeContract=ready');
    expect(result.auditSummary).toContain('selectedRuntimeRun=run_1');
    expect(result.auditSummary).toContain('selectedRuntimeTask=task_1');
    expect(result.auditSummary).toContain('targetTaskEvidenceChain=ready');
    expect(result.auditSummary).toContain('operatorApplyEvidenceChain=ready');
    expect(result.auditSummary).toContain('sameRunEvidenceChain=ready');
    expect(result.auditSummary).toContain('postApplyFilesMatched=yes');
    expect(result.auditSummary).toContain('promotionMissingRequirements=none');
  });
});
