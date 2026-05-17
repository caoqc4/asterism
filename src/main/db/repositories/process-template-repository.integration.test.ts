import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { ProcessTemplateRepository } from './process-template-repository.js';

describe('ProcessTemplateRepository integration', () => {
  let tempRoot = '';
  let repository: ProcessTemplateRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-process-template-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    repository = new ProcessTemplateRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates, updates, and archives process templates', async () => {
    const created = await repository.create({
      title: 'Outreach skill',
      summary: 'Use the outreach workflow',
      content: '1. Review sources\n2. Draft outreach',
      kind: 'skill',
      tags: ['outreach', 'review'],
    });

    const updated = await repository.update({
      id: created.id,
      summary: 'Updated summary',
      tags: ['outreach'],
    });

    const activeBeforeArchive = await repository.listActive();
    const archived = await repository.archive(created.id);
    const activeAfterArchive = await repository.listActive();

    expect(created.status).toBe('active');
    expect(created.tags).toEqual(['outreach', 'review']);
    expect(updated.summary).toBe('Updated summary');
    expect(updated.tags).toEqual(['outreach']);
    expect(activeBeforeArchive).toHaveLength(1);
    expect(archived.status).toBe('archived');
    expect(activeAfterArchive).toHaveLength(0);
  });

  it('rejects non-canonical process template write fields', async () => {
    await expect(repository.create({
      title: 'Outreach skill',
      content: '1. Review sources',
      kind: 'skill',
      legacyTemplateFolder: 'SOPs/',
    } as Parameters<ProcessTemplateRepository['create']>[0])).rejects.toThrow(/legacyTemplateFolder/);

    await expect(repository.update({
      id: 'process_template_1',
      title: 'Updated',
      bindingId: 'task_binding_1',
    } as Parameters<ProcessTemplateRepository['update']>[0])).rejects.toThrow(/bindingId/);
  });
});
