import { describe, expect, it } from 'vitest';

import { buildSandboxPatchReviewRunPlan } from './sandbox-patch-review-run-plan.js';

describe('buildSandboxPatchReviewRunPlan', () => {
  it('stays blocked while the sandbox coding-agent flag is disabled', () => {
    const plan = buildSandboxPatchReviewRunPlan({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
      },
      patchDraft: {
        diff: '--- a/notes.md\n+++ b/notes.md',
        files: ['notes.md'],
        summary: 'Update notes',
      },
      requestedScripts: ['test'],
      runId: 'run_1',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(plan).toMatchObject({
      status: 'blocked',
      reason: expect.stringContaining('feature flag is off'),
    });
  });

  it('builds a ready non-executing plan with request audit and normalized patch draft', () => {
    const plan = buildSandboxPatchReviewRunPlan({
      decisionTitle: '确认提升内部 sandbox patch',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      patchDraft: {
        diff: ' --- a/notes.md\n+++ b/notes.md ',
        files: ['notes.md', ' notes.md ', 'src/app.ts'],
        riskSummary: 'Low risk internal patch.',
        summary: ' Update notes ',
      },
      requestedScripts: ['test', 'build', 'lint'],
      runId: 'run_1',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(plan.status).toBe('ready');

    if (plan.status === 'ready') {
      expect(plan.decisionTitle).toBe('确认提升内部 sandbox patch');
      expect(plan.patchDraft).toEqual({
        diff: '--- a/notes.md\n+++ b/notes.md',
        files: ['notes.md', 'src/app.ts'],
        riskSummary: 'Low risk internal patch.',
        summary: 'Update notes',
      });
      expect(plan.requestBundle.audit).toMatchObject({
        acceptedScripts: ['test', 'lint'],
        rejectedScripts: ['build'],
        reason: 'Review sandbox patch before workspace promotion: Update notes',
      });
      expect(plan.summary).toContain('Sandbox patch review run plan ready');
      expect(plan.summary).toContain('decision=确认提升内部 sandbox patch');
    }
  });

  it('blocks malformed patch drafts before request construction', () => {
    const plan = buildSandboxPatchReviewRunPlan({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      patchDraft: {
        diff: '',
        files: ['notes.md'],
        summary: 'Missing diff',
      },
      requestedScripts: ['test'],
      runId: 'run_1',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(plan).toEqual({
      status: 'blocked',
      reason: 'Sandbox patch review run plan requires a diff preview.',
      summary: 'Sandbox patch review run plan blocked: Sandbox patch review run plan requires a diff preview.',
    });
  });
});
