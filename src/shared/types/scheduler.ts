export type SchedulerStatus = {
  enabled: boolean;
  running: boolean;
  lastBriefAt: string | null;
  lastRunSweepAt: string | null;
  lastRunSweepSummary: string | null;
  lastScheduledEventAgentSweepAt: string | null;
  lastScheduledEventAgentSweepSummary: string | null;
  scheduledEventAgentSweepJobConnected: boolean;
};
