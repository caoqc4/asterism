import { createRequire } from 'node:module';

declare global {
  // eslint-disable-next-line no-var
  var __TASKPLANE_ELECTRON__: typeof import('electron') | undefined;
}

const require = createRequire(import.meta.url);
const electron = globalThis.__TASKPLANE_ELECTRON__ ?? (require('electron') as typeof import('electron'));

export const { app, BrowserWindow, contextBridge, ipcMain, ipcRenderer } = electron;
export type { IpcRendererEvent } from 'electron';
