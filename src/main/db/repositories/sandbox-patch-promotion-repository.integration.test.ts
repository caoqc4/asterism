import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { SandboxPatchPromotionRepository } from './sandbox-patch-promotion-repository.js';

describe('SandboxPatchPromotionRepository integration', () => {
  let tempRoot = '';
  let repository: SandboxPatchPromotionRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-sandbox-patch-promotion-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    repository = new SandboxPatchPromotionRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates a pending durable promotion record and returns it idempotently by checkpoint', async () => {
    const created = await repository.createPending({
      artifactId: 'artifact_1',
      auditSummary: 'Ready to promote src/app.ts',
      checkpointId: 'run_checkpoint_1',
      decisionId: 'decision_1',
      expectedFiles: ['src/app.ts', 'docs/notes.md', 'src/app.ts'],
      patchDigest: 'sha256:abc123',
      runId: 'run_1',
      sourceId: 'sandbox_source_1',
      taskId: 'task_1',
    });
    const repeated = await repository.createPending({
      artifactId: 'artifact_other',
      checkpointId: 'run_checkpoint_1',
      decisionId: 'decision_other',
      expectedFiles: ['other.ts'],
      patchDigest: 'sha256:other',
      runId: 'run_other',
      sourceId: 'sandbox_source_other',
      taskId: 'task_other',
    });
    const byCheckpoint = await repository.findByCheckpointId('run_checkpoint_1');
    const byDigest = await repository.findBySourceDigest('sandbox_source_1', 'sha256:abc123');

    expect(created).toMatchObject({
      artifactId: 'artifact_1',
      auditSummary: 'Ready to promote src/app.ts',
      blockedReasons: [],
      checkpointId: 'run_checkpoint_1',
      decisionId: 'decision_1',
      expectedFiles: ['src/app.ts', 'docs/notes.md'],
      patchDigest: 'sha256:abc123',
      sourceId: 'sandbox_source_1',
      status: 'pending',
    });
    expect(repeated.id).toBe(created.id);
    expect(byCheckpoint?.id).toBe(created.id);
    expect(byDigest?.id).toBe(created.id);
  });

  it('marks promotions as applied or blocked with durable audit state', async () => {
    const created = await repository.createPending({
      artifactId: 'artifact_1',
      checkpointId: 'run_checkpoint_1',
      decisionId: 'decision_1',
      expectedFiles: ['src/app.ts'],
      patchDigest: 'sha256:abc123',
      runId: 'run_1',
      sourceId: 'sandbox_source_1',
      taskId: 'task_1',
    });

    const blocked = await repository.markBlocked(created.id, [
      'workspace base changed',
      'workspace base changed',
      'missing target file',
    ], 'Blocked before writing files');
    const applied = await repository.markApplied(created.id, 'Applied src/app.ts');

    expect(blocked).toMatchObject({
      auditSummary: 'Blocked before writing files',
      blockedReasons: ['workspace base changed', 'missing target file'],
      status: 'blocked',
    });
    expect(applied).toMatchObject({
      appliedAt: expect.any(String),
      auditSummary: 'Applied src/app.ts',
      status: 'applied',
    });
  });
});
