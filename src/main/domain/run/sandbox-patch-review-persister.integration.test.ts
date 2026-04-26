import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../../db/client.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { SandboxPatchPromotionRepository } from '../../db/repositories/sandbox-patch-promotion-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { makeTempDir } from '../../test-utils.js';
import { AgentCheckpointRecorder } from './agent-checkpoint-recorder.js';
import type { LocalContainerSandboxPatchReviewPreparation } from './local-container-sandbox-backend.js';
import { SandboxPatchReviewPersister } from './sandbox-patch-review-persister.js';

describe('SandboxPatchReviewPersister integration', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-sandbox-patch-review-persister-');
    setDatabaseUserDataPathForTests(tempRoot);
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('persists patch artifacts, run steps, checkpoints, and decisions through real repositories', async () => {
    const taskRepository = new TaskRepository();
    const artifactRepository = new ArtifactRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const sandboxPatchPromotionRepository = new SandboxPatchPromotionRepository();
    const decisionRepository = new DecisionRepository();
    const task = await taskRepository.create({ title: 'Persist sandbox patch review' });
    const checkpointRecorder = new AgentCheckpointRecorder(
      runCheckpointRepository,
      runStepRepository,
      decisionRepository,
      sandboxPatchPromotionRepository,
    );
    const persister = new SandboxPatchReviewPersister(
      artifactRepository,
      runStepRepository,
      checkpointRecorder,
    );
    const preparation: LocalContainerSandboxPatchReviewPreparation = {
      artifact: {
        commandLogs: [
          {
            outputPreview: 'lint ok',
            script: 'lint',
            status: 'passed',
          },
        ],
        diff: '--- a/notes.md\n+++ b/notes.md',
        files: ['notes.md'],
        kind: 'patch',
        riskSummary: 'Checks: lint: passed. Pending human review before workspace promotion.',
        summary: 'Reviewable sandbox patch',
      },
      audit: {
        acceptedScripts: ['lint'],
        idempotencyKey: 'sandbox-patch-review:sandbox_session:sandbox_session_1:run_1:task_1:lint',
        initiatedBy: 'internal_sandbox_patch_review',
        patchDraftSource: {
          sourceId: 'sandbox_session_1',
          sourceKind: 'sandbox_session',
        },
        reason: 'Review sandbox patch before promotion.',
        rejectedScripts: [],
        requestedScripts: ['lint'],
        workspaceRoot: '/tmp/taskplane-sandbox-workspace',
      },
      checkRun: {
        results: [
          {
            outputPreview: 'lint ok',
            script: 'lint',
            status: 'passed',
          },
        ],
        summary: 'lint: passed',
      },
      checkpoint: {
        consequence: 'Review required',
        kind: 'patch_promotion',
        policySnapshot: {
          descriptorId: 'workspace.staged_patch',
          sessionKind: 'sandbox',
          credentialPolicy: 'none',
          networkPolicy: 'disabled',
          timeoutMs: 120_000,
          outputLimitBytes: 64_000,
        },
        preview: '--- a/notes.md\n+++ b/notes.md',
        reason: 'Review sandbox patch.',
        resumeTarget: 'sandbox_1:promote',
      },
      handle: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'sandbox_1',
        providerKind: 'local_container',
        stagingRoot: '/tmp/taskplane-sandbox-1',
        workspaceMode: 'staged_write',
      },
      sessionSummary: 'sandbox=sandbox_1 / provider=local_container / patchArtifacts=supported',
    };

    const result = await persister.persist({
      decisionTitle: '确认提升 sandbox patch',
      preparation,
      runId: 'run_1',
      taskId: task.id,
    });

    const artifacts = await artifactRepository.listRecentForTask(task.id);
    const promotion = result.checkpoint
      ? await sandboxPatchPromotionRepository.findByCheckpointId(result.checkpoint.checkpointId)
      : null;
    const steps = await runStepRepository.listForRun('run_1');
    const checkpoints = await runCheckpointRepository.listForRun('run_1');
    const decisions = await decisionRepository.list();

    expect(result.artifact.kind).toBe('patch');
    expect(artifacts[0]?.id).toBe(result.artifact.id);
    expect(promotion).toMatchObject({
      artifactId: result.artifact.id,
      decisionId: result.checkpoint?.decisionId,
      expectedFiles: ['notes.md'],
      sourceId: 'sandbox_1',
      status: 'pending',
    });
    expect(JSON.parse(artifacts[0]?.content ?? '{}')).toMatchObject({
      artifact: {
        summary: 'Reviewable sandbox patch',
        files: ['notes.md'],
      },
      review: {
        audit: {
          patchDraftSource: {
            sourceId: 'sandbox_session_1',
            sourceKind: 'sandbox_session',
          },
        },
        sandboxSessionId: 'sandbox_1',
      },
    });
    expect(steps.map((step) => [step.kind, step.status, step.title])).toEqual([
      ['plan', 'completed', '准备 sandbox patch review'],
      ['tool_result', 'completed', 'sandbox targeted checks'],
      ['artifact', 'completed', '记录 sandbox patch artifact'],
      ['checkpoint', 'pending', '等待确认：sandbox patch promotion'],
    ]);
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({
      kind: 'patch_promotion',
      status: 'open',
    });
    expect(checkpoints[0]?.payload).toContain(`"artifactId":"${result.artifact.id}"`);
    expect(decisions[0]).toMatchObject({
      id: result.checkpoint?.decisionId,
      sourceId: checkpoints[0]?.id,
      sourceLabel: 'workspace.staged_patch',
      status: 'pending',
      title: '确认提升 sandbox patch',
    });
  });
});
