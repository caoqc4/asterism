import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { ProcessTemplateRepository } from './process-template-repository.js';
import { TaskProcessBindingRepository } from './task-process-binding-repository.js';
import { TaskRepository } from './task-repository.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-task-process-binding-repo-'));
}

describe('TaskProcessBindingRepository integration', () => {
  let tempRoot = '';
  let taskRepository: TaskRepository;
  let processTemplateRepository: ProcessTemplateRepository;
  let repository: TaskProcessBindingRepository;

  beforeEach(() => {
    tempRoot = makeTempDir();
    setDatabaseUserDataPathForTests(tempRoot);
    taskRepository = new TaskRepository();
    processTemplateRepository = new ProcessTemplateRepository();
    repository = new TaskProcessBindingRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('applies and removes active process template bindings for a task', async () => {
    const task = await taskRepository.create({ title: 'Apply workflow' });
    const template = await processTemplateRepository.create({
      title: 'Outreach workflow',
      content: '1. Review sources\n2. Draft outreach',
      kind: 'workflow',
      tags: ['outreach'],
    });

    const applied = await repository.apply({
      taskId: task.id,
      templateId: template.id,
    });
    const activeBeforeRemove = await repository.listActiveForTask(task.id);
    const removed = await repository.remove(applied.binding.bindingId);
    const activeAfterRemove = await repository.listActiveForTask(task.id);

    expect(applied.action).toBe('created');
    expect(activeBeforeRemove).toHaveLength(1);
    expect(activeBeforeRemove[0]?.id).toBe(template.id);
    expect(removed.bindingStatus).toBe('removed');
    expect(removed.removedAt).toBeTruthy();
    expect(activeAfterRemove).toHaveLength(0);
  });
});
