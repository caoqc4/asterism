import { describe, expect, it } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import { buildSandboxPatchDraftSourceFromPatchArtifact } from './sandbox-patch-artifact-source.js';

const patchArtifact: ArtifactRecord = {
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
};

describe('buildSandboxPatchDraftSourceFromPatchArtifact', () => {
  it('turns a run-backed patch artifact into an imported sandbox review source', () => {
    const result = buildSandboxPatchDraftSourceFromPatchArtifact({
      artifact: patchArtifact,
      requestedScripts: ['lint'],
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.source).toMatchObject({
        runId: 'run_1',
        sourceId: 'artifact_patch_1',
        sourceKind: 'imported_patch_artifact',
        taskId: 'task_1',
        workspaceRoot: '/tmp/taskplane-workspace',
      });
      expect(result.source.patchDraft).toMatchObject({
        files: ['src/app.ts'],
        summary: 'changes.patch',
      });
      expect(result.source.policySnapshot).toEqual({
        network: 'disabled',
        noCredentialPassthrough: true,
        promotion: 'decision_required',
      });
      expect(result.summary).toContain('importedArtifact=artifact_patch_1');
    }
  });

  it('also accepts sandbox review JSON artifacts as imported sources', () => {
    const result = buildSandboxPatchDraftSourceFromPatchArtifact({
      artifact: {
        ...patchArtifact,
        content: JSON.stringify({
          artifact: {
            diff: '--- a/notes.md\n+++ b/notes.md\n@@ -1 +1 @@\n-old\n+new',
            files: ['notes.md'],
            riskSummary: 'Low risk',
            summary: 'Update notes',
          },
        }),
      },
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.source.patchDraft).toMatchObject({
        files: ['notes.md'],
        riskSummary: 'Low risk',
        summary: 'Update notes',
      });
    }
  });

  it('blocks non-run or non-patch artifacts before sandbox planning', () => {
    const result = buildSandboxPatchDraftSourceFromPatchArtifact({
      artifact: {
        ...patchArtifact,
        kind: 'note',
        sourceType: 'manual',
      },
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(result).toMatchObject({
      valid: false,
      blockedReasons: expect.arrayContaining([
        'Imported patch artifact source requires a patch artifact.',
        'Imported patch artifact source requires a run-backed artifact.',
      ]),
    });
  });
});
