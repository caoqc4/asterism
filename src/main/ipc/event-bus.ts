import type { AppEvent, AppEventType } from '../../shared/types/events.js';
import { APP_EVENT_CHANNEL } from '../../shared/events/channel.js';
import { BrowserWindow } from '../electron.js';

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
