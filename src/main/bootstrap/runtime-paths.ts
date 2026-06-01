import fs from 'node:fs';
import path from 'node:path';

type ElectronAppPathApi = {
  getAppPath(): string;
  getName(): string;
  getPath(name: 'appData'): string;
  setPath(name: 'userData', value: string): void;
};

export const LEGACY_USER_DATA_DIR_NAME = 'Taskplane';

export function getPackagedRendererIndexPath(appPath: string): string {
  return path.join(appPath, 'dist', 'index.html');
}

export function getUserDataOverrideFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.TASKPLANE_USER_DATA_DIR?.trim();
  return value ? value : null;
}

export function applyUserDataPathOverride(
  app: ElectronAppPathApi,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const userDataPath = getUserDataOverrideFromEnv(env);

  if (!userDataPath) {
    return null;
  }

  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
  return userDataPath;
}

export function getDefaultUserDataPathForAppName(appDataPath: string, appName: string): string {
  return path.join(appDataPath, appName);
}

export function getLegacyUserDataPathForAppData(appDataPath: string): string {
  return path.join(appDataPath, LEGACY_USER_DATA_DIR_NAME);
}

export type UserDataPathApplication =
  | {
      source: 'env';
      path: string;
      defaultPath: null;
    }
  | {
      source: 'default' | 'legacy-compatible';
      path: string;
      defaultPath: string;
    };

export function applyCompatibleUserDataPath(
  app: ElectronAppPathApi,
  env: NodeJS.ProcessEnv = process.env,
): UserDataPathApplication {
  const overridePath = applyUserDataPathOverride(app, env);

  if (overridePath) {
    return {
      source: 'env',
      path: overridePath,
      defaultPath: null,
    };
  }

  const appDataPath = app.getPath('appData');
  const defaultPath = getDefaultUserDataPathForAppName(appDataPath, app.getName());
  const compatiblePath = getLegacyUserDataPathForAppData(appDataPath);
  fs.mkdirSync(compatiblePath, { recursive: true });

  if (compatiblePath !== defaultPath) {
    app.setPath('userData', compatiblePath);
    return {
      source: 'legacy-compatible',
      path: compatiblePath,
      defaultPath,
    };
  }

  return {
    source: 'default',
    path: compatiblePath,
    defaultPath,
  };
}
