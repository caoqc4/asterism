import { describe, expect, it } from 'vitest';

import { buildDefaultAgentSandboxCommandPolicy } from '../../../shared/agent-sandbox-provider.js';
import { buildSandboxPatchReviewRunRequest } from './sandbox-patch-review-request.js';

describe('buildSandboxPatchReviewRunRequest', () => {
  it('builds a staged patch session request, check plan, and audit summary without executing anything', () => {
    const bundle = buildSandboxPatchReviewRunRequest({
      reason: 'Review the generated coding patch.',
      requestedScripts: ['test', 'build', 'lint', 'test'],
      runId: 'run_1',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(bundle.checkPlan.scripts).toEqual(['test', 'lint']);
    expect(bundle.audit).toEqual({
      acceptedScripts: ['test', 'lint'],
      idempotencyKey: 'sandbox-patch-review:run_1:task_1:test,lint',
      initiatedBy: 'internal_sandbox_patch_review',
      patchDraftSource: null,
      reason: 'Review the generated coding patch.',
      rejectedScripts: ['build'],
      requestedScripts: ['test', 'build', 'lint'],
      workspaceRoot: '/tmp/taskplane-workspace',
    });
    expect(bundle.request).toMatchObject({
      audit: bundle.audit,
      descriptorId: 'workspace.staged_patch',
      providerKind: 'local_container',
      runId: 'run_1',
      taskId: 'task_1',
      workspace: {
        mode: 'staged_write',
        mountPath: '/workspace',
        workspaceRoot: '/tmp/taskplane-workspace',
      },
      executionPolicy: {
        credentialPolicy: 'none',
        descriptorId: 'workspace.staged_patch',
        idempotencyKey: 'sandbox-patch-review:run_1:task_1:test,lint',
        networkPolicy: 'disabled',
        sessionKind: 'sandbox',
        workspaceRoot: '/tmp/taskplane-workspace',
      },
    });
    expect(bundle.summary).toBe(
      'descriptor=workspace.staged_patch / provider=local_container / workspace=staged_write / checks=test,lint / network=disabled / credentials=none / source=none / idempotency=sandbox-patch-review:run_1:task_1:test,lint / rejected=build',
    );
  });

  it('includes patch draft source identity in audit and idempotency when supplied', () => {
    const bundle = buildSandboxPatchReviewRunRequest({
      patchDraftSource: {
        sourceId: 'sandbox_session_1',
        sourceKind: 'sandbox_session',
      },
      requestedScripts: ['test'],
      runId: 'run_1',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(bundle.audit.patchDraftSource).toEqual({
      sourceId: 'sandbox_session_1',
      sourceKind: 'sandbox_session',
    });
    expect(bundle.audit.idempotencyKey).toBe(
      'sandbox-patch-review:sandbox_session:sandbox_session_1:run_1:task_1:test',
    );
    expect(bundle.summary).toContain('source=sandbox_session:sandbox_session_1');
    expect(bundle.request.executionPolicy.idempotencyKey).toBe(
      'sandbox-patch-review:sandbox_session:sandbox_session_1:run_1:task_1:test',
    );
  });

  it('fails closed when no requested script is allowlisted', () => {
    expect(() => buildSandboxPatchReviewRunRequest({
      commandPolicy: buildDefaultAgentSandboxCommandPolicy(),
      requestedScripts: ['build', 'verify'],
      runId: 'run_1',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    })).toThrow('Sandbox check plan requires at least one allowlisted script.');
  });

  it('requires a workspace root before constructing a sandbox request', () => {
    expect(() => buildSandboxPatchReviewRunRequest({
      requestedScripts: ['test'],
      runId: 'run_1',
      taskId: 'task_1',
      workspaceRoot: ' ',
    })).toThrow('Sandbox patch review request requires a workspace root.');
  });
});
