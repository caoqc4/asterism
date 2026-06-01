import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../../db/client.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { SandboxPatchPromotionRepository } from '../../db/repositories/sandbox-patch-promotion-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { makeTempDir } from '../../test-utils.js';
import { buildDefaultAgentSandboxCommandPolicy } from '../../../shared/agent-sandbox-provider.js';
import { AgentCheckpointRecorder } from './agent-checkpoint-recorder.js';
import { LocalContainerSandboxProvider } from './local-container-sandbox-backend.js';
import { buildSandboxPatchReviewRunRequest } from './sandbox-patch-review-request.js';
import { SandboxPatchReviewPersister } from './sandbox-patch-review-persister.js';
import { SandboxPatchReviewRunAdapter } from './sandbox-patch-review-run-adapter.js';

describe('SandboxPatchReviewRunAdapter integration', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-sandbox-patch-review-adapter-');
    setDatabaseUserDataPathForTests(tempRoot);
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('runs the internal sandbox patch review path through real persistence repositories', async () => {
    const taskRepository = new TaskRepository();
    const artifactRepository = new ArtifactRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const sandboxPatchPromotionRepository = new SandboxPatchPromotionRepository();
    const decisionRepository = new DecisionRepository();
    const provider = new LocalContainerSandboxProvider();
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
    const adapter = new SandboxPatchReviewRunAdapter(
      provider,
      persister,
      runStepRepository,
    );
    const task = await taskRepository.create({ title: 'Run sandbox patch review adapter' });
    const workspaceRoot = makeTempDir('taskplane-sandbox-patch-review-workspace-');
    const commandPolicy = buildDefaultAgentSandboxCommandPolicy({ timeoutMs: 30_000 });
    const reviewRequest = buildSandboxPatchReviewRunRequest({
      commandPolicy,
      reason: 'Integration review of sandbox patch persistence.',
      requestedScripts: ['lint'],
      runId: 'run_1',
      taskId: task.id,
      workspaceRoot,
    });

    try {
      const result = await adapter.run({
        checkPlan: reviewRequest.checkPlan,
        decisionTitle: '确认提升 sandbox patch',
        featureFlags: {
          enableScheduler: false,
          enableSandboxCodingAgent: true,
        },
        patchDraft: {
          diff: '--- a/notes.md\n+++ b/notes.md',
          files: ['notes.md'],
          summary: 'Adapter reviewable sandbox patch',
        },
        request: reviewRequest.request,
        runner: vi.fn().mockResolvedValue({
          exitCode: 0,
          stderr: '',
          stdout: 'lint ok',
        }),
      });

      const steps = await runStepRepository.listForRun('run_1');
      const artifacts = await artifactRepository.listRecentForTask(task.id);
      const checkpoints = await runCheckpointRepository.listForRun('run_1');
      const promotion = checkpoints[0]
        ? await sandboxPatchPromotionRepository.findByCheckpointId(checkpoints[0].id)
        : null;
      const decisions = await decisionRepository.list();

      expect(result.status).toBe('persisted');
      expect(steps.map((step) => step.kind)).toEqual([
        'plan',
        'tool_result',
        'artifact',
        'plan',
        'checkpoint',
      ]);
      expect(steps[0]?.input).toContain('audit=internal_sandbox_patch_review');
      expect(steps[0]?.input).toContain('idempotency=sandbox-patch-review:run_1:');
      expect(artifacts[0]).toMatchObject({
        kind: 'patch',
        title: 'Adapter reviewable sandbox patch',
      });
      expect(steps.find((step) => step.title === '任务记忆建议')?.output).toBe(
        `- Task.md: important_file / reference=${artifacts[0]?.id}`,
      );
      expect(checkpoints[0]).toMatchObject({
        kind: 'patch_promotion',
        status: 'open',
      });
      expect(promotion).toMatchObject({
        checkpointId: checkpoints[0]?.id,
        expectedFiles: ['notes.md'],
        status: 'pending',
      });
      expect(decisions[0]).toMatchObject({
        sourceLabel: 'workspace.staged_patch',
        status: 'pending',
        title: '确认提升 sandbox patch',
      });
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
