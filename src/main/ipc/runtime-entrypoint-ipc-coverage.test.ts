import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { RUNTIME_ENTRYPOINT_COVERAGE } from '../../shared/runtime-entrypoint-coverage.js';

describe('runtime entrypoint IPC coverage', () => {
  it('keeps retained IPC handlers either registered or explicitly read-only', () => {
    const handlersSource = fs.readFileSync(new URL('./handlers.ts', import.meta.url), 'utf8');
    const handledChannels = [...handlersSource.matchAll(/ipcMain\.handle\((PING_CHANNEL|'([^']+)')/g)]
      .map((match) => match[2] ?? match[1])
      .sort();
    const registeredChannels = RUNTIME_ENTRYPOINT_COVERAGE
      .flatMap((entry) => entry.ipcChannels ?? []);
    const readOnlyChannels = [
      'PING_CHANNEL',
      'brief:getHomeData',
      'decision:list',
      'decision:listJudgments',
      'run:getDetail',
      'run:list',
      'settings:getAiConfigStatus',
      'task:getDetail',
      'task:getHierarchyConsistency',
      'task:getHierarchyManualReviewPolicy',
      'task:list',
      'taskFile:list',
      'workHabit:getSnapshot',
    ];

    expect(handledChannels).toEqual([...new Set([
      ...registeredChannels,
      ...readOnlyChannels,
    ])].sort());
  });
});
