import {
  evaluateTaskMdUpdateNeed,
  type TaskMdUpdateNeedEvaluation,
  type TaskMdUpdateNeedReason,
} from './task-md-update-need.js';
import {
  evaluateTaskRecordWorthiness,
  type TaskRecordWorthinessEvaluation,
  type TaskRecordWorthinessReason,
} from './task-record-worthiness.js';

export type RuntimeRecoveryGuidanceItem =
  | {
      target: 'task_md';
      message: string;
      evaluation: TaskMdUpdateNeedEvaluation;
    }
  | {
      target: 'task_record';
      message: string;
      evaluation: TaskRecordWorthinessEvaluation;
    };

export type RuntimeRecoveryGuidance = {
  items: RuntimeRecoveryGuidanceItem[];
  messages: string[];
};

export function buildRuntimeRecoveryGuidance(params: {
  text: string;
  hasTaskContext: boolean;
  importantFilePath?: string | null;
  producedDurableChange?: boolean;
  taskMdReasonHint?: TaskMdUpdateNeedReason | null;
  taskRecordReasonHint?: TaskRecordWorthinessReason | null;
  includeTaskRecord?: boolean;
}): RuntimeRecoveryGuidance {
  const items: RuntimeRecoveryGuidanceItem[] = [];
  const taskMdUpdate = evaluateTaskMdUpdateNeed({
    changeText: params.text,
    hasTaskContext: params.hasTaskContext,
    importantFilePath: params.importantFilePath,
    producedDurableChange: params.producedDurableChange,
    reasonHint: params.taskMdReasonHint,
  });

  if (taskMdUpdate.shouldUpdateTaskMd) {
    items.push({
      target: 'task_md',
      message: `Task.md update recommended: ${taskMdUpdate.reason}`,
      evaluation: taskMdUpdate,
    });
  }

  if (params.includeTaskRecord) {
    const taskRecord = evaluateTaskRecordWorthiness({
      text: params.text,
      hasTaskContext: params.hasTaskContext,
      producedDurableChange: params.producedDurableChange,
      reasonHint: params.taskRecordReasonHint,
    });

    if (taskRecord.shouldCreateTaskRecord) {
      items.push({
        target: 'task_record',
        message: `Task Record may be useful: ${taskRecord.reason}`,
        evaluation: taskRecord,
      });
    }
  }

  return {
    items,
    messages: items.map((item) => item.message),
  };
}
