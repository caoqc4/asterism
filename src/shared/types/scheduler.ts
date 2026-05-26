export type SchedulerStatus = {
  enabled: boolean;
  running: boolean;
  lastBriefAt: string | null;
  lastRunSweepAt: string | null;
  lastScheduledEventAgentSweepAt: string | null;
};
