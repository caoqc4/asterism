import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { CompletionCriteriaRepository } from '../../db/repositories/completion-criteria-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../../db/client.js';
import { makeTempDir } from '../../test-utils.js';
import { TaskService } from '../task/task-service.js';
import { AgentToolRegistry } from './agent-tool-registry.js';

describe('AgentToolRegistry integration', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-agent-tool-registry-');
    setDatabaseUserDataPathForTests(tempRoot);
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('updates a task next step through TaskService and records task timeline evidence', async () => {
    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const runStepRepository = new RunStepRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
    );
    const registry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      undefined,
      null,
      undefined,
      taskService,
    );
    const task = await taskService.create({
      title: 'Agent next step integration',
    });

    const result = await registry.execute(
      'task.update_next_step',
      { nextStep: 'Review owner feedback and update the draft' },
      { runId: 'run_integration_1', taskId: task.id },
    );
    const detail = await taskService.getDetail(task.id);
    const steps = await runStepRepository.listForRun('run_integration_1');

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      output: 'Review owner feedback and update the draft',
    });
    expect(detail?.nextStep).toBe('Review owner feedback and update the draft');
    expect(detail?.timeline.some((event) =>
      event.type === 'task.next_step_changed' &&
      event.payload.includes('Review owner feedback and update the draft')
    )).toBe(true);
    expect(steps.some((step) =>
      step.kind === 'tool_result' &&
      step.status === 'completed' &&
      step.output === 'Review owner feedback and update the draft'
    )).toBe(true);
  });

  it('creates a completion criterion through TaskService and records task timeline evidence', async () => {
    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const runStepRepository = new RunStepRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
      artifactRepository,
      null,
      null,
      null,
      null,
      null,
      completionCriteriaRepository,
    );
    const registry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      undefined,
      null,
      undefined,
      taskService,
    );
    const task = await taskService.create({
      title: 'Agent completion criterion integration',
    });

    const result = await registry.execute(
      'task.create_completion_criterion',
      { text: 'Final draft has owner approval' },
      { runId: 'run_integration_2', taskId: task.id },
    );
    const detail = await taskService.getDetail(task.id);
    const steps = await runStepRepository.listForRun('run_integration_2');

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      output: 'Final draft has owner approval',
    });
    expect(detail?.completionCriteria).toEqual([
      expect.objectContaining({
        text: 'Final draft has owner approval',
        status: 'open',
      }),
    ]);
    expect(detail?.timeline.some((event) =>
      event.type === 'completion_criteria.created' &&
      event.payload.includes('Final draft has owner approval')
    )).toBe(true);
    expect(steps.some((step) =>
      step.kind === 'tool_result' &&
      step.status === 'completed' &&
      step.output === 'Final draft has owner approval'
    )).toBe(true);
  });
});
