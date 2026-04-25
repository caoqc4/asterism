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
import { SourceContextRepository } from '../../db/repositories/source-context-repository.js';
import { TaskDependencyRepository } from '../../db/repositories/task-dependency-repository.js';
import { TaskProcessBindingRepository } from '../../db/repositories/task-process-binding-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../../db/client.js';
import { makeTempDir } from '../../test-utils.js';
import { AgentToolRegistry } from '../run/agent-tool-registry.js';
import { TaskService } from '../task/task-service.js';
import { DecisionService } from './decision-service.js';

describe('DecisionService integration', () => {
  let tempRoot = '';
  let workspaceRoot = '';

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

  it('approves a workspace patch checkpoint and applies it inside the workspace root', async () => {
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
    const decisionService = new DecisionService(
      decisionRepository,
      taskService,
      {} as never,
      undefined,
      runCheckpointRepository,
      runStepRepository,
      runRepository,
      agentToolRegistry,
    );
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

    await decisionService.act({
      id: decision!.id,
      action: 'approve',
    });

    const [checkpoint] = await runCheckpointRepository.listForRun(run.id);
    const runDetail = await runRepository.getDetail(run.id);
    const steps = await runStepRepository.listForRun(run.id);

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
});
