import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { TaskService } from '../task/task-service.js';
import { AgentToolRegistry } from './agent-tool-registry.js';
import { RunService } from './run-service.js';

describe('RunService integration', () => {
  let tempRoot = '';
  let workspaceRoot = '';

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-run-service-');
    workspaceRoot = makeTempDir('taskplane-workspace-agent-');
    setDatabaseUserDataPathForTests(tempRoot);
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('runs an opted-in read-only workspace agent path through persisted run detail', async () => {
    fs.mkdirSync(path.join(workspaceRoot, 'docs'));
    fs.writeFileSync(
      path.join(workspaceRoot, 'docs', 'alpha.md'),
      'alpha workspace evidence\nnext line\n',
    );

    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const sourceContextRepository = new SourceContextRepository();
    const processTemplateRepository = new ProcessTemplateRepository();
    const taskProcessBindingRepository = new TaskProcessBindingRepository();
    const blockerRepository = new BlockerRepository();
    const taskDependencyRepository = new TaskDependencyRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const decisionRepository = new DecisionRepository();
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
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'local-alpha-model',
        apiKey: 'test-key',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue(JSON.stringify({
        finalOutput: 'Workspace alpha final note',
        steps: [
          {
            tool: 'workspace.search',
            input: { query: 'alpha workspace evidence', maxResults: 3 },
          },
          {
            tool: 'workspace.read_file',
            input: { path: 'docs/alpha.md' },
          },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Workspace alpha note',
              content: 'Workspace alpha final note',
            },
          },
        ],
      })),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No process template needed for workspace alpha test.',
      }),
    };
    const service = new RunService(
      runRepository,
      taskService,
      artifactRepository,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository,
      agentToolRegistry,
      runCheckpointRepository,
    );
    const task = await taskService.create({
      title: 'Workspace alpha agent path',
      summary: 'Validate local read-only workspace agent execution.',
    });

    const run = await service.trigger({
      taskId: task.id,
      type: 'agent',
      instructions: 'Use local workspace context before writing the note.',
      allowLocalWorkspaceRead: true,
    });
    const detail = await service.getDetail(run.id);
    const agentSessions = detail?.agentSessions ?? [];
    const steps = detail?.steps ?? [];
    const artifacts = await artifactRepository.listRecentForTask(task.id, 10);

    expect(run).toMatchObject({
      status: 'completed',
      output: 'Workspace alpha final note',
      outputSource: 'ai',
    });
    expect(detail).not.toBeNull();
    expect(agentSessions).toHaveLength(1);
    expect(agentSessions[0]).toMatchObject({
      status: 'completed',
      capabilities: expect.objectContaining({
        fileContext: true,
        structuredToolCalls: false,
      }),
    });
    expect(detail?.checkpoints).toEqual([]);
    expect(steps.some((step) =>
      step.kind === 'tool_result' &&
      step.output?.includes('docs/alpha.md: alpha workspace evidence')
    )).toBe(true);
    expect(steps.some((step) =>
      step.kind === 'tool_result' &&
      step.output?.includes('alpha workspace evidence')
    )).toBe(true);
    expect(steps.some((step) =>
      step.kind === 'decision' &&
      step.output?.includes('workspace.search [completed]')
    )).toBe(true);
    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          title: 'Workspace alpha note',
          content: 'Workspace alpha final note',
        }),
      ]),
    );
  });
});
