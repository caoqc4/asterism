import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { RunRepository } from './run-repository.js';
import { TaskRepository } from './task-repository.js';
import { AgentSessionRepository } from './agent-session-repository.js';

describe('AgentSessionRepository integration', () => {
  let tempRoot = '';
  let agentSessionRepository: AgentSessionRepository;
  let runRepository: RunRepository;
  let taskRepository: TaskRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-agent-session-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    agentSessionRepository = new AgentSessionRepository();
    runRepository = new RunRepository();
    taskRepository = new TaskRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates session metadata for a run', async () => {
    const task = await taskRepository.create({ title: 'Track agent session' });
    const run = await runRepository.create({ taskId: task.id, type: 'agent' });

    const created = await agentSessionRepository.create({
      runId: run.id,
      mode: 'agent',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: false,
        longRunningSessions: false,
      },
      metadata: 'local executor',
    });

    expect(created.runId).toBe(run.id);
    expect(created.status).toBe('running');
    expect(created.capabilities.textOnlyPlanning).toBe(true);
    expect(created.metadata).toBe('local executor');

    const updated = await agentSessionRepository.updateStatus(created.id, 'completed');

    expect(updated.status).toBe('completed');

    const sessions = await agentSessionRepository.listForRun(run.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe(created.id);
    expect(sessions[0]?.status).toBe('completed');
  });
});
