import type { ArtifactRecord } from './artifact.js';
import type { BriefSnapshotRecord } from './brief-snapshot.js';
import type { SchedulerStatus } from './scheduler.js';
import type { DecisionRecord } from './decision.js';
import type { TaskRecord } from './task.js';

export type RecommendedAction = {
  id: string;
  label: string;
  reason: string;
  taskId: string | null;
  priority: 'high' | 'medium' | 'low';
};

export type HomeBriefData = {
  activeTaskCount: number;
  pendingDecisionCount: number;
  completedTaskCount: number;
  recentRunCount: number;
  waitingTaskCount: number;
  highRiskTaskCount: number;
  missingNextStepTaskCount: number;
  recentTasks: TaskRecord[];
  waitingTasks: TaskRecord[];
  highRiskTasks: TaskRecord[];
  missingNextStepTasks: TaskRecord[];
  pendingDecisions: DecisionRecord[];
  recommendedActions: RecommendedAction[];
  recentArtifacts: ArtifactRecord[];
  recentBriefSnapshots: BriefSnapshotRecord[];
  schedulerStatus: SchedulerStatus;
};
