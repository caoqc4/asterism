import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyCompatibleUserDataPath,
  applyUserDataPathOverride,
  getDefaultUserDataPathForAppName,
  getLegacyUserDataPathForAppData,
  getPackagedRendererIndexPath,
  getUserDataOverrideFromEnv,
} from './runtime-paths.js';

describe('runtime paths', () => {
  it('resolves the packaged renderer from the app path instead of cwd', () => {
    expect(getPackagedRendererIndexPath('/Applications/Asterism.app/Contents/Resources/app.asar')).toBe(
      '/Applications/Asterism.app/Contents/Resources/app.asar/dist/index.html',
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
        getName: () => 'Asterism',
        getPath: () => tempRoot,
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

  it('derives default and legacy userData paths without reading Electron userData', () => {
    expect(getDefaultUserDataPathForAppName('/Users/example/Library/Application Support', 'Asterism')).toBe(
      '/Users/example/Library/Application Support/Asterism',
    );
    expect(getLegacyUserDataPathForAppData('/Users/example/Library/Application Support')).toBe(
      '/Users/example/Library/Application Support/Taskplane',
    );
  });

  it('keeps the legacy Taskplane userData directory when Electron defaults to Asterism', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asterism-user-data-'));
    const appDataPath = path.join(tempRoot, 'Application Support');
    const defaultPath = path.join(appDataPath, 'Asterism');
    const legacyPath = path.join(appDataPath, 'Taskplane');
    const calls: Array<{ name: string; value: string }> = [];

    const result = applyCompatibleUserDataPath(
      {
        getAppPath: () => '/unused',
        getName: () => 'Asterism',
        getPath: () => appDataPath,
        setPath: (name, value) => {
          calls.push({ name, value });
        },
      },
      {},
    );

    expect(result).toEqual({
      source: 'legacy-compatible',
      path: legacyPath,
      defaultPath,
    });
    expect(fs.existsSync(legacyPath)).toBe(true);
    expect(fs.existsSync(defaultPath)).toBe(false);
    expect(calls).toEqual([{ name: 'userData', value: legacyPath }]);
  });

  it('does not query Electron userData while applying legacy compatibility', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asterism-user-data-query-'));
    const appDataPath = path.join(tempRoot, 'Application Support');
    const legacyPath = path.join(tempRoot, 'Taskplane');
    const calls: Array<{ name: string; value: string }> = [];

    applyCompatibleUserDataPath(
      {
        getAppPath: () => '/unused',
        getName: () => 'Asterism',
        getPath: (name) => {
          expect(name).toBe('appData');
          return appDataPath;
        },
        setPath: (name, value) => {
          calls.push({ name, value });
        },
      },
      {},
    );

    expect(calls).toEqual([{ name: 'userData', value: path.join(appDataPath, 'Taskplane') }]);
  });

  it('leaves a default Taskplane userData path unchanged', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-user-data-'));
    const appDataPath = path.join(tempRoot, 'Application Support');
    const defaultPath = path.join(appDataPath, 'Taskplane');
    const calls: Array<{ name: string; value: string }> = [];

    const result = applyCompatibleUserDataPath(
      {
        getAppPath: () => '/unused',
        getName: () => 'Taskplane',
        getPath: () => appDataPath,
        setPath: (name, value) => {
          calls.push({ name, value });
        },
      },
      {},
    );

    expect(result).toEqual({
      source: 'default',
      path: defaultPath,
      defaultPath,
    });
    expect(fs.existsSync(defaultPath)).toBe(true);
    expect(calls).toEqual([]);
  });
});
