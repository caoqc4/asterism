import fs from 'node:fs';
import path from 'node:path';

type ElectronAppPathApi = {
  getAppPath(): string;
  setPath(name: 'userData', value: string): void;
};

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
