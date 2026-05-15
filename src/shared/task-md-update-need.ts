export type TaskMdUpdateNeedReason =
  | 'goal_or_scope'
  | 'current_progress'
  | 'decision'
  | 'constraint_or_blocker'
  | 'open_question'
  | 'next_step'
  | 'important_file'
  | 'durable_state_change'
  | 'not_needed'
  | 'empty';

export type TaskMdUpdateNeedEvaluation = {
  shouldUpdateTaskMd: boolean;
  reason: TaskMdUpdateNeedReason;
  confidence: 'high' | 'medium' | 'low';
  requiresTaskContext: boolean;
  summary: string;
  missing: string[];
};

const MIN_MEANINGFUL_LENGTH = 4;

const GOAL_SCOPE_PATTERN = /目标|范围|需求边界|scope|goal|requirement/i;
const PROGRESS_PATTERN = /进度|完成了|已经|当前状态|实现了|推进到|progress|done|completed/i;
const DECISION_PATTERN = /决策|拍板|批准|拒绝|暂缓|选择|取舍|decision|approved|rejected|chosen/i;
const CONSTRAINT_BLOCKER_PATTERN = /约束|阻塞|依赖|风险|限制|constraint|blocker|dependency|risk/i;
const OPEN_QUESTION_PATTERN = /待确认|待明确|问题|是否|要不要|open question|unclear|unknown/i;
const NEXT_STEP_PATTERN = /下一步|接下来|后续|继续|next step|follow[- ]?up/i;
const IMPORTANT_FILE_PATTERN = /重要文件|引用|产物|输出|报告|文档|artifact|file|Task\.md|\.md|\.ts|\.tsx/i;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function evaluateTaskMdUpdateNeed(params: {
  changeText?: string | null;
  existingTaskMdContent?: string | null;
  hasTaskContext?: boolean;
  importantFilePath?: string | null;
  producedDurableChange?: boolean;
  reasonHint?: TaskMdUpdateNeedReason | null;
}): TaskMdUpdateNeedEvaluation {
  const text = normalizeText([
    params.changeText ?? '',
    params.importantFilePath ? `important file: ${params.importantFilePath}` : '',
  ].filter(Boolean).join(' '));
  const hasTaskContext = Boolean(params.hasTaskContext);

  if (!text || text.length < MIN_MEANINGFUL_LENGTH) {
    return result({
      shouldUpdateTaskMd: false,
      reason: 'empty',
      confidence: 'high',
      hasTaskContext,
      text,
      missing: ['需要具体的任务状态变化或重要文件引用。'],
    });
  }

  if (params.importantFilePath && params.existingTaskMdContent?.includes(params.importantFilePath)) {
    return result({
      shouldUpdateTaskMd: false,
      reason: 'not_needed',
      confidence: 'high',
      hasTaskContext,
      text,
      missing: [],
    });
  }

  const hinted = params.reasonHint && params.reasonHint !== 'not_needed' && params.reasonHint !== 'empty'
    ? params.reasonHint
    : null;
  const reason = hinted
    ?? firstMatchingReason(text)
    ?? (params.producedDurableChange ? 'durable_state_change' : null);

  if (!reason) {
    return result({
      shouldUpdateTaskMd: false,
      reason: 'not_needed',
      confidence: 'medium',
      hasTaskContext,
      text,
      missing: ['没有触发目标、进度、决策、约束、开放问题、下一步或重要文件引用更新。'],
    });
  }

  return result({
    shouldUpdateTaskMd: hasTaskContext,
    reason,
    confidence: hinted ? 'high' : 'medium',
    hasTaskContext,
    text,
    missing: hasTaskContext ? [] : ['需要绑定任务上下文。'],
  });
}

function firstMatchingReason(text: string): TaskMdUpdateNeedReason | null {
  if (GOAL_SCOPE_PATTERN.test(text)) return 'goal_or_scope';
  if (PROGRESS_PATTERN.test(text)) return 'current_progress';
  if (DECISION_PATTERN.test(text)) return 'decision';
  if (CONSTRAINT_BLOCKER_PATTERN.test(text)) return 'constraint_or_blocker';
  if (OPEN_QUESTION_PATTERN.test(text)) return 'open_question';
  if (NEXT_STEP_PATTERN.test(text)) return 'next_step';
  if (IMPORTANT_FILE_PATTERN.test(text)) return 'important_file';
  return null;
}

function result(params: {
  confidence: TaskMdUpdateNeedEvaluation['confidence'];
  hasTaskContext: boolean;
  missing: string[];
  reason: TaskMdUpdateNeedReason;
  shouldUpdateTaskMd: boolean;
  text: string;
}): TaskMdUpdateNeedEvaluation {
  const taskBoundReasonNeedsContext = !['empty', 'not_needed'].includes(params.reason);
  return {
    shouldUpdateTaskMd: params.shouldUpdateTaskMd,
    reason: params.reason,
    confidence: params.confidence,
    requiresTaskContext: !params.hasTaskContext && taskBoundReasonNeedsContext,
    summary: params.text.slice(0, 120),
    missing: params.missing,
  };
}
