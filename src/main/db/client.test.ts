import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase, initDatabase, setDatabaseUserDataPathForTests } from './client.js';
import { makeTempDir } from '../test-utils.js';

const tempRoot = makeTempDir('taskplane-db-env-test-');

describe('database client', () => {
  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    delete process.env.TASKPLANE_USER_DATA_DIR;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('uses TASKPLANE_USER_DATA_DIR before falling back to Electron userData', () => {
    process.env.TASKPLANE_USER_DATA_DIR = tempRoot;

    initDatabase();

    expect(fs.existsSync(path.join(tempRoot, 'taskplane.db'))).toBe(true);
  });

  it('uses the configured legacy Taskplane userData path for the default database file', () => {
    const legacyUserDataPath = path.join(tempRoot, 'Taskplane');
    setDatabaseUserDataPathForTests(legacyUserDataPath);

    initDatabase();

    expect(fs.existsSync(path.join(legacyUserDataPath, 'taskplane.db'))).toBe(true);
  });
});
