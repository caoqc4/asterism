import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { makeTempDir } from '../../test-utils.js';
import { ArtifactRepository } from './artifact-repository.js';
import { TaskRepository } from './task-repository.js';

describe('ArtifactRepository integration', () => {
  let tempRoot = '';
  let taskRepository: TaskRepository;
  let artifactRepository: ArtifactRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-artifact-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    taskRepository = new TaskRepository();
    artifactRepository = new ArtifactRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates a run output artifact and lists it back for the task', async () => {
    const task = await taskRepository.create({ title: 'Draft follow-up response' });

    const artifact = await artifactRepository.createFromRun({
      taskId: task.id,
      runId: 'run_1',
      runType: 'draft',
      content: 'Drafted follow-up response body.',
    });

    const recentArtifacts = await artifactRepository.listRecentForTask(task.id);
    const foundArtifact = await artifactRepository.findById(artifact.id);
    const missingArtifact = await artifactRepository.findById('artifact_missing');
    const detail = await taskRepository.getDetail(task.id);

    expect(artifact.kind).toBe('run_output');
    expect(artifact.sourceType).toBe('run');
    expect(foundArtifact?.id).toBe(artifact.id);
    expect(foundArtifact?.content).toBe('Drafted follow-up response body.');
    expect(missingArtifact).toBeNull();
    expect(recentArtifacts).toHaveLength(1);
    expect(recentArtifacts[0]?.title).toBe('draft output');
    expect(recentArtifacts[0]?.content).toBe('Drafted follow-up response body.');
    expect(detail?.timeline.map((event) => event.type)).toContain('artifact.created');
  });

  it('creates a note artifact from an agent tool run', async () => {
    const task = await taskRepository.create({ title: 'Capture agent note' });

    const artifact = await artifactRepository.createNoteFromRun({
      taskId: task.id,
      runId: 'run_1',
      title: 'Agent note',
      content: 'A local note created by an internal agent tool.',
    });

    const recentArtifacts = await artifactRepository.listRecentForTask(task.id);
    const detail = await taskRepository.getDetail(task.id);

    expect(artifact.kind).toBe('note');
    expect(artifact.sourceType).toBe('run');
    expect(recentArtifacts[0]?.title).toBe('Agent note');
    expect(recentArtifacts[0]?.content).toBe('A local note created by an internal agent tool.');
    expect(detail?.timeline.map((event) => event.type)).toContain('artifact.created');
  });

  it('creates a patch artifact from a sandbox run', async () => {
    const task = await taskRepository.create({ title: 'Review sandbox patch' });

    const artifact = await artifactRepository.createPatchFromRun({
      taskId: task.id,
      runId: 'run_1',
      title: 'Sandbox patch',
      content: '--- a/notes.md\n+++ b/notes.md',
    });

    const recentArtifacts = await artifactRepository.listRecentForTask(task.id);
    const detail = await taskRepository.getDetail(task.id);

    expect(artifact.kind).toBe('patch');
    expect(artifact.sourceType).toBe('run');
    expect(recentArtifacts[0]?.title).toBe('Sandbox patch');
    expect(recentArtifacts[0]?.content).toBe('--- a/notes.md\n+++ b/notes.md');
    expect(detail?.timeline.map((event) => event.type)).toContain('artifact.created');
  });
});
