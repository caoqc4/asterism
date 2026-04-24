import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, initDatabase, setDatabaseUserDataPathForTests } from '../client.js';
import { briefSnapshots } from '../schema.js';
import { makeTempDir } from './repository-test-utils.js';
import { BriefSnapshotRepository } from './brief-snapshot-repository.js';

describe('BriefSnapshotRepository integration', () => {
  let tempRoot = '';
  let repository: BriefSnapshotRepository;

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-brief-repo-');
    setDatabaseUserDataPathForTests(tempRoot);
    repository = new BriefSnapshotRepository();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates an AI brief snapshot with no fallback reason', async () => {
    const created = await repository.create(
      'home',
      'Today: focus on the launch review and unblock the waiting task.',
      'ai',
    );

    expect(created.kind).toBe('home');
    expect(created.source).toBe('ai');
    expect(created.fallbackReason).toBeNull();

    const recent = await repository.listRecent(5);

    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe(created.id);
    expect(recent[0]?.payload).toContain('launch review');
  });

  it('persists fallback snapshots with a fallback reason', async () => {
    const created = await repository.create(
      'startup',
      'Fallback brief: check high-risk task and follow up waiting work.',
      'fallback',
      'Missing API key',
    );

    expect(created.source).toBe('fallback');
    expect(created.fallbackReason).toBe('Missing API key');

    const recent = await repository.listRecent(5);

    expect(recent[0]?.fallbackReason).toBe('Missing API key');
    expect(recent[0]?.payload).toContain('Fallback brief');
  });

  it('returns recent snapshots ordered by createdAt descending and respects the limit', async () => {
    const first = await repository.create('home', 'Older snapshot', 'fallback', 'First fallback');
    const second = await repository.create('hourly', 'Middle snapshot', 'ai');
    const third = await repository.create('startup', 'Newest snapshot', 'fallback', 'Latest fallback');

    const db = initDatabase();
    await db
      .update(briefSnapshots)
      .set({ createdAt: '2026-01-01T00:00:00.000Z' })
      .where(eq(briefSnapshots.id, first.id));
    await db
      .update(briefSnapshots)
      .set({ createdAt: '2026-01-02T00:00:00.000Z' })
      .where(eq(briefSnapshots.id, second.id));
    await db
      .update(briefSnapshots)
      .set({ createdAt: '2026-01-03T00:00:00.000Z' })
      .where(eq(briefSnapshots.id, third.id));

    const recent = await repository.listRecent(2);

    expect(recent).toHaveLength(2);
    expect(recent.map((snapshot) => snapshot.id)).toEqual([third.id, second.id]);
  });
});
