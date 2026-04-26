import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { BlockerRepository } from '../../db/repositories/blocker-repository.js';
import { CompletionCriteriaRepository } from '../../db/repositories/completion-criteria-repository.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { ProcessTemplateRepository } from '../../db/repositories/process-template-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { SandboxPatchPromotionRepository } from '../../db/repositories/sandbox-patch-promotion-repository.js';
import { SourceContextRepository } from '../../db/repositories/source-context-repository.js';
import { TaskDependencyRepository } from '../../db/repositories/task-dependency-repository.js';
import { TaskProcessBindingRepository } from '../../db/repositories/task-process-binding-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../../db/client.js';
import { makeTempDir } from '../../test-utils.js';
import { buildDefaultAgentToolExecutionPolicy } from '../../../shared/agent-tool-scaffold.js';
import { createPatchPromotionCheckpointPayload } from '../../../shared/types/run-checkpoint-payload.js';
import { AgentToolRegistry } from '../run/agent-tool-registry.js';
import { SandboxPatchPromotionApplyService } from '../run/sandbox-patch-promotion-apply-service.js';
import { SandboxPatchPromotionPreflightService } from '../run/sandbox-patch-promotion-preflight-service.js';
import { buildSandboxPatchDigest } from '../run/sandbox-patch-review-persister.js';
import { TaskService } from '../task/task-service.js';
import { DecisionService } from './decision-service.js';

describe('DecisionService integration', () => {
  let tempRoot = '';
  let workspaceRoot = '';

  function createLocalServices(options: { enableSandboxPatchPromotionApply?: boolean } = {}) {
    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const sourceContextRepository = new SourceContextRepository();
    const processTemplateRepository = new ProcessTemplateRepository();
    const taskProcessBindingRepository = new TaskProcessBindingRepository();
    const blockerRepository = new BlockerRepository();
    const taskDependencyRepository = new TaskDependencyRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const decisionRepository = new DecisionRepository();
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const sandboxPatchPromotionRepository = new SandboxPatchPromotionRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
      artifactRepository,
      sourceContextRepository,
      processTemplateRepository,
      taskProcessBindingRepository,
      blockerRepository,
      taskDependencyRepository,
      completionCriteriaRepository,
    );
    const agentToolRegistry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      runCheckpointRepository,
      decisionRepository,
      () => workspaceRoot,
    );
    const sandboxPatchPromotionPreflightService = new SandboxPatchPromotionPreflightService(
      sandboxPatchPromotionRepository,
      runCheckpointRepository,
      artifactRepository,
    );
    const sandboxPatchPromotionApplyService = new SandboxPatchPromotionApplyService(
      sandboxPatchPromotionPreflightService,
      sandboxPatchPromotionRepository,
      () => workspaceRoot,
    );
    const decisionService = new DecisionService(
      decisionRepository,
      taskService,
      {} as never,
      undefined,
      runCheckpointRepository,
      runStepRepository,
      runRepository,
      agentToolRegistry,
      sandboxPatchPromotionPreflightService,
      sandboxPatchPromotionApplyService,
      () => Boolean(options.enableSandboxPatchPromotionApply),
    );

    return {
      agentToolRegistry,
      artifactRepository,
      decisionRepository,
      decisionService,
      runCheckpointRepository,
      runRepository,
      runStepRepository,
      sandboxPatchPromotionRepository,
      taskService,
    };
  }

  async function createWorkspacePatchCheckpoint() {
    const {
      agentToolRegistry,
      decisionRepository,
      runRepository,
      taskService,
    } = createLocalServices();
    const workspaceFile = path.join(workspaceRoot, 'notes.md');
    fs.writeFileSync(workspaceFile, 'alpha\n');
    const task = await taskService.create({
      title: 'Approve workspace patch',
    });
    const run = await runRepository.create({
      taskId: task.id,
      type: 'agent',
      instructions: 'Apply a local patch after confirmation.',
    });

    const checkpointResult = await agentToolRegistry.execute(
      'workspace.write_patch',
      {
        summary: 'Update workspace note',
        expectedFiles: ['notes.md'],
        patch: [
          '*** Begin Patch',
          '*** Update File: notes.md',
          '@@',
          '-alpha',
          '+beta',
          '*** End Patch',
        ].join('\n'),
      },
      {
        runId: run.id,
        taskId: task.id,
      },
      {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalWorkspaceRead: false,
        allowLocalFileWrite: true,
        confirmationRequiredRisks: ['local_write'],
      },
    );
    const [decision] = await decisionRepository.list();

    expect(checkpointResult.status).toBe('needs_confirmation');
    expect(decision).toEqual(expect.objectContaining({
      sourceType: 'agent_checkpoint',
      sourceLabel: 'workspace.write_patch',
      status: 'pending',
    }));
    expect(fs.readFileSync(workspaceFile, 'utf8')).toBe('alpha\n');

    return {
      decisionId: decision!.id,
      runId: run.id,
      workspaceFile,
    };
  }

  async function createSandboxPatchPromotionCheckpoint() {
    const {
      artifactRepository,
      decisionRepository,
      runCheckpointRepository,
      runRepository,
      sandboxPatchPromotionRepository,
      taskService,
    } = createLocalServices();
    const workspaceFile = path.join(workspaceRoot, 'notes.md');
    const patchDiff = [
      '--- a/notes.md',
      '+++ b/notes.md',
      '@@',
      '-alpha',
      '+beta',
    ].join('\n');
    fs.writeFileSync(workspaceFile, 'alpha\n');
    const task = await taskService.create({
      title: 'Approve sandbox patch promotion',
    });
    const run = await runRepository.create({
      taskId: task.id,
      type: 'agent',
      instructions: 'Promote a reviewed sandbox patch after confirmation.',
    });
    const artifact = await artifactRepository.createPatchFromRun({
      taskId: task.id,
      runId: run.id,
      title: 'Reviewable sandbox patch',
      content: JSON.stringify({
        artifact: {
          commandLogs: [],
          diff: patchDiff,
          files: ['notes.md'],
          kind: 'patch',
          riskSummary: 'Pending review.',
          summary: 'Reviewable sandbox patch',
        },
        review: {
          audit: null,
          sandboxSessionId: 'sandbox_source_1',
          sessionSummary: 'sandbox=sandbox_source_1',
        },
      }),
    });
    const checkpoint = await runCheckpointRepository.create({
      runId: run.id,
      kind: 'patch_promotion',
      payload: JSON.stringify(createPatchPromotionCheckpointPayload({
        artifactId: artifact.id,
        artifactSummary: artifact.title,
        decisionId: null,
        decisionTitle: '确认提升 sandbox patch',
        descriptorId: 'workspace.staged_patch',
        expectedFiles: ['notes.md'],
        patchDigest: buildSandboxPatchDigest(patchDiff),
        policySnapshot: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
        preview: patchDiff,
        sessionId: 'sandbox_source_1',
      })),
    });
    const decision = await decisionRepository.create({
      taskId: task.id,
      title: '确认提升 sandbox patch',
      sourceType: 'agent_checkpoint',
      sourceId: checkpoint.id,
      sourceLabel: 'workspace.staged_patch',
    });
    await runCheckpointRepository.updatePayload(
      checkpoint.id,
      JSON.stringify(createPatchPromotionCheckpointPayload({
        artifactId: artifact.id,
        artifactSummary: artifact.title,
        decisionId: decision.id,
        decisionTitle: decision.title,
        descriptorId: 'workspace.staged_patch',
        expectedFiles: ['notes.md'],
        patchDigest: buildSandboxPatchDigest(patchDiff),
        policySnapshot: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
        preview: patchDiff,
        sessionId: 'sandbox_source_1',
      })),
    );
    await sandboxPatchPromotionRepository.createPending({
      artifactId: artifact.id,
      auditSummary: artifact.title,
      checkpointId: checkpoint.id,
      decisionId: decision.id,
      expectedFiles: ['notes.md'],
      patchDigest: buildSandboxPatchDigest(patchDiff),
      runId: run.id,
      sourceId: 'sandbox_source_1',
      taskId: task.id,
    });

    expect(fs.readFileSync(workspaceFile, 'utf8')).toBe('alpha\n');

    return {
      checkpointId: checkpoint.id,
      decisionId: decision.id,
      runId: run.id,
      workspaceFile,
    };
  }

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-decision-service-');
    workspaceRoot = makeTempDir('taskplane-decision-workspace-');
    setDatabaseUserDataPathForTests(tempRoot);
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('approves a workspace patch checkpoint after service restart and applies it inside the workspace root', async () => {
    const { decisionId, runId, workspaceFile } = await createWorkspacePatchCheckpoint();
    closeDatabase();
    const {
      decisionService,
      runCheckpointRepository,
      runRepository,
      runStepRepository,
    } = createLocalServices();

    await decisionService.act({
      id: decisionId,
      action: 'approve',
    });

    const [checkpoint] = await runCheckpointRepository.listForRun(runId);
    const runDetail = await runRepository.getDetail(runId);
    const steps = await runStepRepository.listForRun(runId);

    expect(fs.readFileSync(workspaceFile, 'utf8')).toBe('beta\n');
    expect(checkpoint?.status).toBe('resolved');
    expect(runDetail).toEqual(expect.objectContaining({
      status: 'completed',
      outputSource: 'system',
    }));
    expect(steps.some((step) =>
      step.kind === 'checkpoint' &&
      step.status === 'completed' &&
      step.output?.includes('已应用工作区 patch：notes.md')
    )).toBe(true);
  });

  it('keeps sandbox patch promotion approval no-write by default after service restart', async () => {
    const { decisionId, runId, workspaceFile } = await createSandboxPatchPromotionCheckpoint();
    closeDatabase();
    const {
      decisionService,
      runCheckpointRepository,
      runRepository,
      runStepRepository,
      sandboxPatchPromotionRepository,
    } = createLocalServices();

    await decisionService.act({
      id: decisionId,
      action: 'approve',
    });

    const [checkpoint] = await runCheckpointRepository.listForRun(runId);
    const promotion = await sandboxPatchPromotionRepository.findByCheckpointId(checkpoint!.id);
    const runDetail = await runRepository.getDetail(runId);
    const steps = await runStepRepository.listForRun(runId);

    expect(fs.readFileSync(workspaceFile, 'utf8')).toBe('alpha\n');
    expect(checkpoint?.status).toBe('resolved');
    expect(promotion?.status).toBe('pending');
    expect(runDetail?.status).toBe('running');
    expect(steps.some((step) =>
      step.kind === 'checkpoint' &&
      step.status === 'completed' &&
      step.output?.includes('Workspace file application is still deferred; no workspace files were written.')
    )).toBe(true);
  });

  it('applies sandbox patch promotion approval when the apply flag is enabled after service restart', async () => {
    const { decisionId, runId, workspaceFile } = await createSandboxPatchPromotionCheckpoint();
    closeDatabase();
    const {
      decisionService,
      runCheckpointRepository,
      runRepository,
      runStepRepository,
      sandboxPatchPromotionRepository,
    } = createLocalServices({ enableSandboxPatchPromotionApply: true });

    await decisionService.act({
      id: decisionId,
      action: 'approve',
    });

    const [checkpoint] = await runCheckpointRepository.listForRun(runId);
    const promotion = await sandboxPatchPromotionRepository.findByCheckpointId(checkpoint!.id);
    const runDetail = await runRepository.getDetail(runId);
    const steps = await runStepRepository.listForRun(runId);

    expect(fs.readFileSync(workspaceFile, 'utf8')).toBe('beta\n');
    expect(checkpoint?.status).toBe('resolved');
    expect(promotion?.status).toBe('applied');
    expect(runDetail).toEqual(expect.objectContaining({
      status: 'completed',
      output: expect.stringContaining('Sandbox patch promotion applied'),
      outputSource: 'system',
    }));
    expect(steps.some((step) =>
      step.kind === 'checkpoint' &&
      step.status === 'completed' &&
      step.output?.includes('Touched files: notes.md')
    )).toBe(true);
  });

  it.each([
    {
      action: 'defer' as const,
      expectedOutput: '关联 Decision 已延后：确认本地写入：workspace.write_patch',
      expectedStepOutput: '关联 Decision 已延后，本次 checkpoint 不再继续执行。',
    },
    {
      action: 'cancel' as const,
      expectedOutput: '关联 Decision 已取消：确认本地写入：workspace.write_patch',
      expectedStepOutput: '关联 Decision 已取消，本次 checkpoint 不再继续执行。',
    },
  ])('settles a $action checkpoint decision as non-resumable after service restart', async ({
    action,
    expectedOutput,
    expectedStepOutput,
  }) => {
    const { decisionId, runId, workspaceFile } = await createWorkspacePatchCheckpoint();
    closeDatabase();
    const {
      decisionService,
      runCheckpointRepository,
      runRepository,
      runStepRepository,
    } = createLocalServices();

    await decisionService.act({
      id: decisionId,
      action,
    });

    const [checkpoint] = await runCheckpointRepository.listForRun(runId);
    const runDetail = await runRepository.getDetail(runId);
    const steps = await runStepRepository.listForRun(runId);

    expect(fs.readFileSync(workspaceFile, 'utf8')).toBe('alpha\n');
    expect(checkpoint?.status).toBe('cancelled');
    expect(runDetail).toEqual(expect.objectContaining({
      status: 'failed',
      output: expectedOutput,
      failureReason: expectedOutput,
      outputSource: 'system',
    }));
    expect(steps.some((step) =>
      step.kind === 'checkpoint' &&
      step.status === 'skipped' &&
      step.output === expectedStepOutput
    )).toBe(true);
  });
});
