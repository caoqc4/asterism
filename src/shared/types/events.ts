export type AppEventType =
  | 'task.changed'
  | 'decision.changed'
  | 'run.changed'
  | 'brief.changed'
  | 'businessLine.changed'
  | 'settings.changed';

export type AppEvent = {
  type: AppEventType;
  entityId?: string;
  at: string;
};
