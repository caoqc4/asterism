import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyUserDataPathOverride,
  getPackagedRendererIndexPath,
  getUserDataOverrideFromEnv,
} from './runtime-paths.js';

describe('runtime paths', () => {
  it('resolves the packaged renderer from the app path instead of cwd', () => {
    expect(getPackagedRendererIndexPath('/Applications/Taskplane.app/Contents/Resources/app.asar')).toBe(
      '/Applications/Taskplane.app/Contents/Resources/app.asar/dist/index.html',
    );
  });

  it('ignores blank TASKPLANE_USER_DATA_DIR values', () => {
    expect(getUserDataOverrideFromEnv({ TASKPLANE_USER_DATA_DIR: '   ' })).toBeNull();
  });

  it('applies TASKPLANE_USER_DATA_DIR to Electron userData before startup', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-user-data-'));
    const userDataPath = path.join(tempRoot, 'isolated');
    const calls: Array<{ name: string; value: string }> = [];

    const appliedPath = applyUserDataPathOverride(
      {
        getAppPath: () => '/unused',
        setPath: (name, value) => {
          calls.push({ name, value });
        },
      },
      { TASKPLANE_USER_DATA_DIR: userDataPath },
    );

    expect(appliedPath).toBe(userDataPath);
    expect(fs.existsSync(userDataPath)).toBe(true);
    expect(calls).toEqual([{ name: 'userData', value: userDataPath }]);
  });
});
