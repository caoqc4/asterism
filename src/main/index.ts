import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyUserDataPathOverride, getPackagedRendererIndexPath } from './bootstrap/runtime-paths.js';
import { initServices } from './bootstrap/services.js';
import { registerIpcHandlers } from './ipc/handlers.js';
import { closeDatabase } from './db/client.js';
import { app, BrowserWindow } from './electron.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;

applyUserDataPathOverride(app);

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#f4f1e8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(getPackagedRendererIndexPath(app.getAppPath()));
  }
}

app.whenReady().then(() => {
  initServices();
  void initServices().schedulerService.start();
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  initServices().schedulerService.stop();
  closeDatabase();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
