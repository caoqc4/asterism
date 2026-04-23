import type { ArtifactRecord } from './artifact.js';
import type {
  AppliedProcessTemplateRecord,
  ProcessTemplateRecord,
} from './process-template.js';
import type { SourceContextRecord } from './source-context.js';
import type { WaitingItemRecord } from './waiting-item.js';

export type TaskState =
  | 'captured'
  | 'triaged'
  | 'planned'
  | 'running'
  | 'waiting_external'
  | 'completed'
  | 'archived';

export type TaskRiskLevel = 'none' | 'low' | 'medium' | 'high';

export type TaskRecord = {
  id: string;
  title: string;
  summary: string | null;
  state: TaskState;
  nextStep: string | null;
  waitingReason: string | null;
  activeWaitingItem?: WaitingItemRecord | null;
  riskLevel: TaskRiskLevel;
  riskNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskResumeCardRecord = {
  summary: string;
  currentState: string;
  latestChange: string;
  latestChangeAction: {
    label: string | null;
    targetType: 'decision' | 'run' | 'source_context' | null;
    targetId: string | null;
  };
  keySource: {
    sourceContextId: string | null;
    title: string;
    detail: string | null;
  };
  currentMethod: {
    templateId: string | null;
    title: string;
    detail: string | null;
    selectionReason: string | null;
  };
  nextSuggestedMove: string;
};

export type TaskDetailBase = TaskRecord & {
  artifacts: ArtifactRecord[];
  sourceContexts: SourceContextRecord[];
  processTemplates: AppliedProcessTemplateRecord[];
  availableProcessTemplates: ProcessTemplateRecord[];
  timeline: TimelineEventRecord[];
};

export type TaskDetail = TaskDetailBase & {
  resumeCard: TaskResumeCardRecord;
};

export type TimelineEventRecord = {
  id: string;
  taskId: string;
  type: string;
  payload: string | null;
  createdAt: string;
};

export type CreateTaskInput = {
  title: string;
  summary?: string;
};

export type UpdateTaskInput = {
  id: string;
  title?: string;
  summary?: string | null;
  nextStep?: string | null;
  waitingReason?: string | null;
  riskLevel?: TaskRiskLevel;
  riskNote?: string | null;
};

export type TransitionTaskInput = {
  id: string;
  nextState: TaskState;
  waitingReason?: string | null;
};
