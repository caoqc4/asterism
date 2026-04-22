import type { BriefSnapshotRecord } from './brief-snapshot.js';
import type { SchedulerStatus } from './scheduler.js';
import type { DecisionRecord } from './decision.js';
import type { TaskRecord } from './task.js';

export type HomeBriefData = {
  activeTaskCount: number;
  pendingDecisionCount: number;
  completedTaskCount: number;
  recentRunCount: number;
  recentTasks: TaskRecord[];
  pendingDecisions: DecisionRecord[];
  recentBriefSnapshots: BriefSnapshotRecord[];
  schedulerStatus: SchedulerStatus;
};
