import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { RunRepository } from './run-repository.js';
import { RunVerificationRepository } from './run-verification-repository.js';
import { TaskRepository } from './task-repository.js';

describe('RunVerificationRepository integration', () => {
  let tempRoot = '';
  let runRepository: RunRepository;
  let taskRepository: TaskRepository;
  let verificationRepository: RunVerificationRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-run-verification-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    runRepository = new RunRepository();
    taskRepository = new TaskRepository();
    verificationRepository = new RunVerificationRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('upserts lightweight verification records for a run target', async () => {
    const task = await taskRepository.create({ title: 'Verify run evidence' });
    const run = await runRepository.create({ taskId: task.id, type: 'draft' });

    const created = await verificationRepository.upsert({
      runId: run.id,
      targetType: 'run',
      targetId: run.id,
      tone: 'warn',
      label: 'Run 需补验证',
      detail: 'Run 已完成，但缺少可复核输出。',
      source: 'lightweight_rule_engine',
    });
    const updated = await verificationRepository.upsert({
      runId: run.id,
      targetType: 'run',
      targetId: run.id,
      tone: 'pass',
      label: 'Run 验证通过',
      detail: '执行结果已有输出或步骤证据，可进入人工审查。',
      source: 'lightweight_rule_engine',
    });
    const records = await verificationRepository.listForRun(run.id);

    expect(updated.id).toBe(created.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: created.id,
      runId: run.id,
      targetType: 'run',
      targetId: run.id,
      tone: 'pass',
      source: 'lightweight_rule_engine',
    });
  });
});
