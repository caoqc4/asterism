import { buildTaskTypeProfile, type TaskTypeProfile } from './taskAttributes';

export const SYSTEM_BRIEF_RECOMMENDATION_TASK_ID = 'taskplane.system.brief-recommendation';

export const SYSTEM_BRIEF_RECOMMENDATION_TASK_PROFILE: TaskTypeProfile = buildTaskTypeProfile(
  'routine',
  ['scheduled', 'event'],
  {
    owner: 'system',
    visibility: 'hidden',
  },
);

export type BriefRecommendationRecordType =
  | 'brief_recommendation.snapshot_created'
  | 'brief_recommendation.ai_advisor_requested'
  | 'brief_recommendation.order_adjusted';

export type BriefRecommendationRecord = {
  id: string;
  type: BriefRecommendationRecordType;
  createdAt: string;
  summary: string;
  systemTaskId: typeof SYSTEM_BRIEF_RECOMMENDATION_TASK_ID;
  profile: TaskTypeProfile;
  payload:
    | {
        recommendedTaskIds: string[];
        recommendedTaskTitles: string[];
        reasonCount: number;
        source: 'brief_open' | 'ai_advisor_request';
      }
    | {
        fromTaskId: string;
        toTaskId: string;
        orderedTaskIds: string[];
        orderedTaskTitles: string[];
      };
};

const STORAGE_KEY = 'taskplane.systemBrief.records.v1';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadRecords(): BriefRecommendationRecord[] {
  if (!canUseLocalStorage()) return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as BriefRecommendationRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords(records: BriefRecommendationRecord[]): void {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 100)));
}

export function recordBriefRecommendationOrderAdjustment(input: {
  fromTaskId: string;
  toTaskId: string;
  orderedTasks: Array<{ id: string; title: string }>;
}): BriefRecommendationRecord {
  const createdAt = new Date().toISOString();
  const record: BriefRecommendationRecord = {
    id: `brief_record_${Date.now()}`,
    type: 'brief_recommendation.order_adjusted',
    createdAt,
    summary: '用户调整了 Brief 今日建议顺序。',
    systemTaskId: SYSTEM_BRIEF_RECOMMENDATION_TASK_ID,
    profile: SYSTEM_BRIEF_RECOMMENDATION_TASK_PROFILE,
    payload: {
      fromTaskId: input.fromTaskId,
      toTaskId: input.toTaskId,
      orderedTaskIds: input.orderedTasks.map((task) => task.id),
      orderedTaskTitles: input.orderedTasks.map((task) => task.title),
    },
  };

  saveRecords([record, ...loadRecords()]);
  return record;
}

export function recordBriefRecommendationSnapshot(input: {
  recommendedTasks: Array<{ id: string; title: string }>;
  reasonCount: number;
  source: 'brief_open' | 'ai_advisor_request';
}): BriefRecommendationRecord {
  const createdAt = new Date().toISOString();
  const record: BriefRecommendationRecord = {
    id: `brief_snapshot_${Date.now()}`,
    type: input.source === 'ai_advisor_request'
      ? 'brief_recommendation.ai_advisor_requested'
      : 'brief_recommendation.snapshot_created',
    createdAt,
    summary: input.source === 'ai_advisor_request'
      ? '用户请求 AI 复核 Brief 今日排序。'
      : 'Brief 生成了一次任务建议快照。',
    systemTaskId: SYSTEM_BRIEF_RECOMMENDATION_TASK_ID,
    profile: SYSTEM_BRIEF_RECOMMENDATION_TASK_PROFILE,
    payload: {
      recommendedTaskIds: input.recommendedTasks.map((task) => task.id),
      recommendedTaskTitles: input.recommendedTasks.map((task) => task.title),
      reasonCount: input.reasonCount,
      source: input.source,
    },
  };

  saveRecords([record, ...loadRecords()]);
  return record;
}

export function loadBriefRecommendationRecords(): BriefRecommendationRecord[] {
  return loadRecords();
}
