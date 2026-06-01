import { describe, expect, it } from 'vitest';

import { validateSandboxPatchDraftSource } from './sandbox-patch-draft-source.js';

const validSource = {
  evidence: {
    commandSummaries: ['npm test passed'],
    modelSummary: 'Implemented a small notes change.',
    observations: ['Read notes.md'],
  },
  patchDraft: {
    diff: '--- a/notes.md\n+++ b/notes.md',
    files: ['notes.md', ' src/app.ts ', 'notes.md'],
    riskSummary: 'Low risk.',
    summary: 'Update notes',
  },
  policySnapshot: {
    network: 'disabled',
    noCredentialPassthrough: true,
    promotion: 'decision_required',
  },
  requestedScripts: ['lint', 'test', 'lint'],
  runId: 'run_1',
  sourceId: 'sandbox_session_1',
  sourceKind: 'sandbox_session',
  taskId: 'task_1',
  workspaceRoot: '/tmp/taskplane-workspace',
};

describe('validateSandboxPatchDraftSource', () => {
  it('accepts and normalizes a sandbox session patch draft source', () => {
    const validation = validateSandboxPatchDraftSource(validSource);

    expect(validation.valid).toBe(true);

    if (validation.valid) {
      expect(validation.source.patchDraft.files).toEqual(['notes.md', 'src/app.ts']);
      expect(validation.source.patchDraft.riskSummary).toBe('Low risk.');
      expect(validation.source.requestedScripts).toEqual(['lint', 'test']);
      expect(validation.summary).toContain('source=sandbox_session:sandbox_session_1');
      expect(validation.summary).toContain('promotion=decision_required');
    }
  });

  it('rejects ordinary local-note and provider-native payload source kinds', () => {
    for (const sourceKind of [
      'local_note',
      'provider_native_payload',
      'host_process_workspace_patch',
    ]) {
      const validation = validateSandboxPatchDraftSource({
        ...validSource,
        sourceKind,
      });

      expect(validation.valid).toBe(false);

      if (!validation.valid) {
        expect(validation.blockedReasons).toContain(
          'Sandbox patch draft source kind is not accepted.',
        );
      }
    }
  });

  it('rejects absolute and path-traversal changed files', () => {
    const validation = validateSandboxPatchDraftSource({
      ...validSource,
      patchDraft: {
        ...validSource.patchDraft,
        files: ['/tmp/secrets.txt', 'C:\\tmp\\secrets.txt', '../outside.md'],
      },
    });

    expect(validation.valid).toBe(false);

    if (!validation.valid) {
      expect(validation.blockedReasons).toContain(
        'Sandbox patch draft source changed files must stay inside the workspace.',
      );
    }
  });

  it('rejects non-Decision promotion and credential passthrough policy', () => {
    const validation = validateSandboxPatchDraftSource({
      ...validSource,
      policySnapshot: {
        network: 'disabled',
        noCredentialPassthrough: false,
        promotion: 'auto_apply',
      },
    });

    expect(validation.valid).toBe(false);

    if (!validation.valid) {
      expect(validation.blockedReasons).toEqual(expect.arrayContaining([
        'Sandbox patch draft source policy forbids credential passthrough.',
        'Sandbox patch draft source policy requires Decision promotion.',
      ]));
    }
  });

  it('rejects non-allowlisted checks before a source can feed planning', () => {
    const validation = validateSandboxPatchDraftSource({
      ...validSource,
      requestedScripts: ['test', 'build'],
    });

    expect(validation.valid).toBe(false);

    if (!validation.valid) {
      expect(validation.blockedReasons).toContain(
        'Sandbox patch draft source requested checks must be allowlisted.',
      );
    }
  });
});
