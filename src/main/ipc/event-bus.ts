import { BrowserWindow } from 'electron';

import type { AppEvent, AppEventType } from '../../shared/types/events.js';

const APP_EVENT_CHANNEL = 'app:event';

export function emitAppEvent(type: AppEventType, entityId?: string): void {
  const payload: AppEvent = {
    type,
    entityId,
    at: new Date().toISOString(),
  };

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(APP_EVENT_CHANNEL, payload);
  }
}

export { APP_EVENT_CHANNEL };
