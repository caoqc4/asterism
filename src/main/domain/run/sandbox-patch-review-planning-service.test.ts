import { describe, expect, it } from 'vitest';

import { SandboxPatchReviewPlanningService } from './sandbox-patch-review-planning-service.js';

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
});
