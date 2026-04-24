import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { CompletionCriteriaRepository } from './completion-criteria-repository.js';
import { TaskRepository } from './task-repository.js';

describe('CompletionCriteriaRepository integration', () => {
  let tempRoot = '';
  let taskRepository: TaskRepository;
  let completionCriteriaRepository: CompletionCriteriaRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-completion-criteria-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    taskRepository = new TaskRepository();
    completionCriteriaRepository = new CompletionCriteriaRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates, updates, satisfies, and reopens completion criteria', async () => {
    const task = await taskRepository.create({ title: 'Ship launch brief' });

    const created = await completionCriteriaRepository.create({
      taskId: task.id,
      text: 'Brief shared with stakeholders',
    });

    const updated = await completionCriteriaRepository.update({
      id: created.id,
      text: 'Launch brief shared with stakeholders',
    });

    const satisfied = await completionCriteriaRepository.satisfy(created.id);
    const reopened = await completionCriteriaRepository.reopen(created.id);
    const criteria = await completionCriteriaRepository.listForTask(task.id);

    expect(created.status).toBe('open');
    expect(updated.text).toBe('Launch brief shared with stakeholders');
    expect(satisfied.status).toBe('satisfied');
    expect(satisfied.satisfiedAt).toBeTruthy();
    expect(reopened.status).toBe('open');
    expect(reopened.satisfiedAt).toBeNull();
    expect(criteria).toHaveLength(1);
  });
});
