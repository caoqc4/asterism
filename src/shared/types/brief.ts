import type { ArtifactRecord } from './artifact.js';
import type { BriefSnapshotRecord } from './brief-snapshot.js';
import type { ProcessTemplateKind } from './process-template.js';
import type { SchedulerStatus } from './scheduler.js';
import type { DecisionRecord } from './decision.js';
import type { TaskRecord, TaskRiskLevel } from './task.js';

export type RecommendedActionIntent = {
  type:
    | 'open_task'
    | 'focus_next_step'
    | 'focus_waiting_follow_up'
    | 'focus_risk_review'
    | 'continue_from_artifact'
    | 'focus_source_context';
  focusArea?: 'detail' | 'quick-actions';
  prefillNextStep?: string | null;
  prefillRunInstructions?: string | null;
  prefillRiskLevel?: TaskRiskLevel | null;
  prefillRiskNote?: string | null;
  sourceContextId?: string | null;
};

export type RecommendedAction = {
  id: string;
  label: string;
  reason: string;
  taskId: string | null;
  priority: 'high' | 'medium' | 'low';
  intent?: RecommendedActionIntent;
};

export type HomeActivityRecord = {
  id: string;
  sourceType: 'decision' | 'run';
  sourceId: string;
  taskId: string;
  taskTitle: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type HomeSourceContextRecord = {
  id: string;
  taskId: string;
  taskTitle: string;
  title: string;
  kind: string;
  uri: string | null;
  note: string | null;
  updatedAt: string;
};

export type BriefProcessTemplateCandidate = {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  kind: ProcessTemplateKind;
  tags: string[];
  taskIds: string[];
  taskTitles: string[];
  notes: string[];
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
  recentSourceContexts: HomeSourceContextRecord[];
  recentActivity: HomeActivityRecord[];
  recentBriefSnapshots: BriefSnapshotRecord[];
  schedulerStatus: SchedulerStatus;
  processTemplateCandidates?: BriefProcessTemplateCandidate[];
};
