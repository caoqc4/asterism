import { describe, expect, it } from 'vitest';

import type { DecisionRecord } from './types/decision.js';
import type { RunDetailRecord } from './types/run.js';
import type { SandboxPatchPromotionRecord } from './types/sandbox-patch-promotion.js';
import { createPatchPromotionCheckpointPayload } from './types/run-checkpoint-payload.js';
import { projectSandboxPatchPromotionViews } from './sandbox-patch-promotion-view.js';

const now = '2026-01-01T00:00:00.000Z';

function buildDecision(partial: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: partial.id ?? 'decision_patch_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? '确认提升 sandbox patch',
    status: partial.status ?? 'pending',
    scope: partial.scope ?? 'task',
    kind: partial.kind ?? 'risk_approval',
    sourceType: partial.sourceType ?? 'agent_checkpoint',
    sourceId: partial.sourceId ?? 'run_checkpoint_patch_1',
    sourceLabel: partial.sourceLabel ?? 'workspace.staged_patch',
    context: partial.context ?? null,
    options: partial.options ?? [],
    recommendation: partial.recommendation ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildRunDetail(partial: Partial<RunDetailRecord> = {}): RunDetailRecord {
  return {
    id: partial.id ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    type: partial.type ?? 'agent',
    status: partial.status ?? 'completed',
    instructions: partial.instructions ?? 'Run sandbox review.',
    output: partial.output ?? null,
    outputSource: partial.outputSource ?? null,
    failureReason: partial.failureReason ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    sandboxPatchPromotions: partial.sandboxPatchPromotions ?? [],
    checkpoints: partial.checkpoints ?? [
      {
        id: 'run_checkpoint_patch_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'patch_promotion',
        status: 'open',
        payload: JSON.stringify(createPatchPromotionCheckpointPayload({
          artifactId: 'artifact_patch_review_1',
          artifactSummary: 'Review patch.',
          decisionId: 'decision_patch_1',
          decisionTitle: '确认提升 sandbox patch',
          descriptorId: 'workspace.staged_patch',
          expectedFiles: ['notes.md'],
          patchDigest: 'sha256:abc',
          policySnapshot: {
            credentialPolicy: 'none',
            descriptorId: 'workspace.staged_patch',
            networkPolicy: 'disabled',
            outputLimitBytes: 1000,
            sessionKind: 'sandbox',
            timeoutMs: 1000,
          },
          sessionId: 'sandbox_1',
        })),
        createdAt: now,
        resolvedAt: null,
      },
    ],
  };
}

function buildPromotion(partial: Partial<SandboxPatchPromotionRecord> = {}): SandboxPatchPromotionRecord {
  return {
    id: partial.id ?? 'sandbox_patch_promotion_1',
    checkpointId: partial.checkpointId ?? 'run_checkpoint_patch_1',
    runId: partial.runId ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    artifactId: partial.artifactId ?? 'artifact_patch_review_1',
    sourceId: partial.sourceId ?? 'sandbox_1',
    decisionId: partial.decisionId ?? 'decision_patch_1',
    patchDigest: partial.patchDigest ?? 'sha256:abc',
    expectedFiles: partial.expectedFiles ?? ['notes.md'],
    status: partial.status ?? 'pending',
    auditSummary: partial.auditSummary ?? null,
    blockedReasons: partial.blockedReasons ?? [],
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    appliedAt: partial.appliedAt ?? null,
  };
}

describe('projectSandboxPatchPromotionViews', () => {
  it('projects a pending promotion decision for a reviewed patch artifact', () => {
    const [view] = projectSandboxPatchPromotionViews({
      decisions: [buildDecision()],
      runDetails: [buildRunDetail()],
    });

    expect(view).toMatchObject({
      artifactId: 'artifact_patch_review_1',
      checkpointId: 'run_checkpoint_patch_1',
      decisionId: 'decision_patch_1',
      decisionStatus: 'pending',
      label: '等待 promotion 拍板',
      tone: 'pending',
    });
    expect(view?.detail).toContain('审批前不会写入工作区');
    expect(view?.detail).toContain('应用 reviewed patch');
    expect(view?.detail).toContain('promotion apply 预检');
    expect(view?.detail).toContain('notes.md');
  });

  it('shows a bounded affected-file preview for multi-file promotions', () => {
    const [view] = projectSandboxPatchPromotionViews({
      decisions: [buildDecision()],
      runDetails: [buildRunDetail({
        checkpoints: [
          {
            ...buildRunDetail().checkpoints![0]!,
            payload: JSON.stringify(createPatchPromotionCheckpointPayload({
              artifactId: 'artifact_patch_review_1',
              artifactSummary: 'Review patch.',
              decisionId: 'decision_patch_1',
              decisionTitle: '确认提升 sandbox patch',
              descriptorId: 'workspace.staged_patch',
              expectedFiles: ['src/app.ts', 'src/view.tsx', 'docs/notes.md', 'package.json'],
              patchDigest: 'sha256:abc',
              policySnapshot: {
                credentialPolicy: 'none',
                descriptorId: 'workspace.staged_patch',
                networkPolicy: 'disabled',
                outputLimitBytes: 1000,
                sessionKind: 'sandbox',
                timeoutMs: 1000,
              },
              sessionId: 'sandbox_1',
            })),
          },
        ],
      })],
    });

    expect(view?.detail).toContain('涉及 4 个文件：src/app.ts, src/view.tsx, docs/notes.md 等，另 1 个');
  });

  it('keeps approved promotions visible as controlled workspace application', () => {
    const [view] = projectSandboxPatchPromotionViews({
      decisions: [buildDecision({ status: 'approved' })],
      runDetails: [buildRunDetail({
        checkpoints: [
          {
            ...buildRunDetail().checkpoints![0]!,
            status: 'resolved',
            resolvedAt: now,
          },
        ],
      })],
    });

    expect(view).toMatchObject({
      decisionStatus: 'approved',
      label: 'promotion 已审批',
      tone: 'completed',
    });
    expect(view?.detail).toContain('功能开关');
  });

  it('projects applied promotion records after workspace apply succeeds', () => {
    const [view] = projectSandboxPatchPromotionViews({
      decisions: [buildDecision({ status: 'approved' })],
      runDetails: [buildRunDetail({
        checkpoints: [
          {
            ...buildRunDetail().checkpoints![0]!,
            status: 'resolved',
            resolvedAt: now,
          },
        ],
        sandboxPatchPromotions: [buildPromotion({
          appliedAt: '2026-01-01T00:02:00.000Z',
          status: 'applied',
        })],
      })],
    });

    expect(view).toMatchObject({
      label: 'promotion 已应用',
      promotionStatus: 'applied',
      tone: 'completed',
    });
    expect(view?.detail).toContain('已通过 promotion apply 服务写入工作区');
  });

  it('projects blocked promotion records after workspace apply preflight fails', () => {
    const [view] = projectSandboxPatchPromotionViews({
      decisions: [buildDecision({ status: 'approved' })],
      runDetails: [buildRunDetail({
        sandboxPatchPromotions: [buildPromotion({
          blockedReasons: ['Patch promotion workspace content does not match reviewed base: notes.md'],
          status: 'blocked',
        })],
      })],
    });

    expect(view).toMatchObject({
      label: 'promotion apply 被阻塞',
      promotionStatus: 'blocked',
      tone: 'blocked',
    });
    expect(view?.detail).toContain('workspace content does not match reviewed base');
  });
});
