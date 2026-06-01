import { describe, expect, it } from 'vitest';

import { SandboxPatchReviewPlanningService } from './sandbox-patch-review-planning-service.js';

const validSource = {
  evidence: {
    commandSummaries: ['npm test passed'],
    observations: ['Prepared staged patch'],
  },
  patchDraft: {
    diff: '--- a/notes.md\n+++ b/notes.md',
    files: ['notes.md'],
    summary: 'Review notes patch',
  },
  policySnapshot: {
    network: 'disabled',
    noCredentialPassthrough: true,
    promotion: 'decision_required',
  },
  requestedScripts: ['lint'],
  runId: 'run_1',
  sourceId: 'sandbox_session_1',
  sourceKind: 'sandbox_session',
  taskId: 'task_1',
  workspaceRoot: '/tmp/taskplane-workspace',
};

describe('SandboxPatchReviewPlanningService', () => {
  it('previews a ready sandbox patch review plan without requiring execution dependencies', () => {
    const service = new SandboxPatchReviewPlanningService();
    const plan = service.preview({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      patchDraft: {
        diff: '--- a/notes.md\n+++ b/notes.md',
        files: ['notes.md'],
        summary: 'Review notes patch',
      },
      requestedScripts: ['lint'],
      runId: 'run_1',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(plan.status).toBe('ready');

    if (plan.status === 'ready') {
      expect(plan.requestBundle.audit.idempotencyKey).toBe(
        'sandbox-patch-review:run_1:task_1:lint',
      );
      expect(plan.summary).toContain('Sandbox patch review run plan ready');
    }
  });

  it('previews a blocked plan without constructing adapter or runner state', () => {
    const service = new SandboxPatchReviewPlanningService();

    expect(service.preview({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
      },
      patchDraft: {
        diff: '--- a/notes.md\n+++ b/notes.md',
        files: ['notes.md'],
        summary: 'Review notes patch',
      },
      requestedScripts: ['lint'],
      runId: 'run_1',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    })).toMatchObject({
      status: 'blocked',
      reason: expect.stringContaining('feature flag is off'),
    });
  });

  it('keeps local-note diagnostics blocked even when the sandbox flag is enabled', () => {
    const service = new SandboxPatchReviewPlanningService();

    expect(service.previewLocalNoteDiagnostic({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      runId: 'run_1',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    })).toEqual({
      status: 'blocked',
      reason: 'Sandbox patch review run plan requires a patch summary.',
      summary: 'Sandbox patch review run plan blocked: Sandbox patch review run plan requires a patch summary.',
    });
  });

  it('previews a ready sandbox patch review plan from a validated source', () => {
    const service = new SandboxPatchReviewPlanningService();
    const plan = service.previewFromSource({
      decisionTitle: '确认提升 sandbox source patch',
      expectedWorkspaceRoot: '/tmp/taskplane-workspace',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      source: validSource,
    });

    expect(plan.status).toBe('ready');

    if (plan.status === 'ready') {
      expect(plan.decisionTitle).toBe('确认提升 sandbox source patch');
      expect(plan.requestBundle.audit.idempotencyKey).toBe(
        'sandbox-patch-review:sandbox_session:sandbox_session_1:run_1:task_1:lint',
      );
      expect(plan.requestBundle.audit.patchDraftSource).toEqual({
        sourceId: 'sandbox_session_1',
        sourceKind: 'sandbox_session',
      });
      expect(plan.summary).toContain('source=sandbox_session:sandbox_session_1');
    }
  });

  it('blocks invalid source kinds before planning', () => {
    const service = new SandboxPatchReviewPlanningService();

    expect(service.previewFromSource({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      source: {
        ...validSource,
        sourceKind: 'local_note',
      },
    })).toMatchObject({
      status: 'blocked',
      reason: expect.stringContaining('source kind is not accepted'),
    });
  });

  it('blocks sources targeting a different selected workspace', () => {
    const service = new SandboxPatchReviewPlanningService();

    expect(service.previewFromSource({
      expectedWorkspaceRoot: '/tmp/other-workspace',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      source: validSource,
    })).toEqual({
      status: 'blocked',
      reason: 'Sandbox patch draft source workspace does not match the selected workspace.',
      summary: 'Sandbox patch review run plan blocked: Sandbox patch draft source workspace does not match the selected workspace.',
    });
  });

  it('previews a sandbox review plan from a confirmed patch artifact', () => {
    const service = new SandboxPatchReviewPlanningService();
    const plan = service.previewFromPatchArtifact({
      artifact: {
        content: [
          'diff --git a/src/app.ts b/src/app.ts',
          '--- a/src/app.ts',
          '+++ b/src/app.ts',
          '@@ -1 +1 @@',
          '-old',
          '+new',
        ].join('\n'),
        createdAt: '2026-05-25T00:00:00.000Z',
        id: 'artifact_patch_1',
        kind: 'patch',
        sourceId: 'run_1',
        sourceType: 'run',
        taskId: 'task_1',
        title: 'changes.patch',
        updatedAt: '2026-05-25T00:00:00.000Z',
      },
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      requestedScripts: ['lint'],
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(plan.status).toBe('ready');

    if (plan.status === 'ready') {
      expect(plan.decisionTitle).toBe('确认提升 patch artifact：changes.patch');
      expect(plan.requestBundle.audit.idempotencyKey).toBe(
        'sandbox-patch-review:imported_patch_artifact:artifact_patch_1:run_1:task_1:lint',
      );
      expect(plan.requestBundle.audit.patchDraftSource).toEqual({
        sourceId: 'artifact_patch_1',
        sourceKind: 'imported_patch_artifact',
      });
      expect(plan.summary).toContain('importedArtifact=artifact_patch_1');
    }
  });
});
