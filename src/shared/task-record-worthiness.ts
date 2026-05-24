export type TaskRecordWorthinessReason =
  | 'handoff'
  | 'phase_closeout'
  | 'user_correction'
  | 'option_comparison'
  | 'decision_rationale'
  | 'failure_review'
  | 'context_clear_archive'
  | 'external_signal'
  | 'durable_state_change'
  | 'generic_or_minor'
  | 'duplicate'
  | 'empty';

export type TaskRecordWorthinessEvaluation = {
  shouldCreateTaskRecord: boolean;
  reason: TaskRecordWorthinessReason;
  confidence: 'high' | 'medium' | 'low';
  requiresTaskContext: boolean;
  summary: string;
  missing: string[];
};

const MIN_MEANINGFUL_LENGTH = 8;

const DUPLICATE_PATTERN = /重复|已记录|已经记录|不用再记|duplicate|already recorded/i;
const HANDOFF_PATTERN = /交接|handoff|接下来|下一任务|切换到|handover/i;
const PHASE_CLOSEOUT_PATTERN = /阶段.*(收尾|总结|完成|结束)|收尾|closeout|milestone|里程碑/i;
const USER_CORRECTION_PATTERN = /不是这样|纠正|更正|我提醒|应该是|不要.*这样|下次不要|correction|correct/i;
const OPTION_COMPARISON_PATTERN = /方案|选项|对比|取舍|为什么选择|为什么不|备选|trade[- ]?off|option/i;
const DECISION_RATIONALE_PATTERN = /决策|拍板|批准|拒绝|暂缓|原因|依据|rationale|decision|approved|rejected/i;
const FAILURE_REVIEW_PATTERN = /失败|报错|原因分析|复盘|回滚|阻塞原因|postmortem|failure|failed|rollback/i;
const CONTEXT_CLEAR_PATTERN = /上下文.*(清理|刷新|压缩|归档)|会话.*(清理|刷新|归档)|context.*(clear|refresh|archive)/i;
const EXTERNAL_SIGNAL_PATTERN = /外部|邮件|日历|slack|github|linear|webhook|信号|external/i;
const DURABLE_STATE_CHANGE_PATTERN = /状态|范围|目标|进度|约束|风险|依赖|完成标准|验收|Task\.md|artifact|产物|run objective|completion condition|verification|verifier|next action|runtime mode|acceptance criteria/i;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function evaluateTaskRecordWorthiness(params: {
  text?: string | null;
  hasTaskContext?: boolean;
  isDuplicate?: boolean;
  producedDurableChange?: boolean;
  reasonHint?: TaskRecordWorthinessReason | null;
}): TaskRecordWorthinessEvaluation {
  const text = normalizeText(params.text ?? '');
  const hasTaskContext = Boolean(params.hasTaskContext);

  if (!text || text.length < MIN_MEANINGFUL_LENGTH) {
    return result({
      shouldCreateTaskRecord: false,
      reason: 'empty',
      confidence: 'high',
      text,
      hasTaskContext,
      missing: ['需要具体的恢复内容、结论、风险或下一步。'],
    });
  }

  if (params.isDuplicate || DUPLICATE_PATTERN.test(text)) {
    return result({
      shouldCreateTaskRecord: false,
      reason: 'duplicate',
      confidence: 'high',
      text,
      hasTaskContext,
      missing: [],
    });
  }

  const hinted = params.reasonHint && params.reasonHint !== 'generic_or_minor' && params.reasonHint !== 'duplicate' && params.reasonHint !== 'empty'
    ? params.reasonHint
    : null;
  const reason = hinted
    ?? firstMatchingReason(text)
    ?? (params.producedDurableChange || DURABLE_STATE_CHANGE_PATTERN.test(text) ? 'durable_state_change' : null);

  if (!reason) {
    return result({
      shouldCreateTaskRecord: false,
      reason: 'generic_or_minor',
      confidence: 'medium',
      text,
      hasTaskContext,
      missing: ['缺少明确交接、阶段结论、纠正、决策依据、失败复盘或外部信号。'],
    });
  }

  return result({
    shouldCreateTaskRecord: hasTaskContext,
    reason,
    confidence: hinted ? 'high' : 'medium',
    text,
    hasTaskContext,
    missing: hasTaskContext ? [] : ['需要绑定任务上下文。'],
  });
}

function firstMatchingReason(text: string): TaskRecordWorthinessReason | null {
  if (USER_CORRECTION_PATTERN.test(text)) return 'user_correction';
  if (PHASE_CLOSEOUT_PATTERN.test(text)) return 'phase_closeout';
  if (HANDOFF_PATTERN.test(text)) return 'handoff';
  if (FAILURE_REVIEW_PATTERN.test(text)) return 'failure_review';
  if (OPTION_COMPARISON_PATTERN.test(text)) return 'option_comparison';
  if (DECISION_RATIONALE_PATTERN.test(text)) return 'decision_rationale';
  if (CONTEXT_CLEAR_PATTERN.test(text)) return 'context_clear_archive';
  if (EXTERNAL_SIGNAL_PATTERN.test(text)) return 'external_signal';
  return null;
}

function result(params: {
  confidence: TaskRecordWorthinessEvaluation['confidence'];
  hasTaskContext: boolean;
  missing: string[];
  reason: TaskRecordWorthinessReason;
  shouldCreateTaskRecord: boolean;
  text: string;
}): TaskRecordWorthinessEvaluation {
  const taskBoundReasonNeedsContext = !['duplicate', 'empty', 'generic_or_minor'].includes(params.reason);
  return {
    shouldCreateTaskRecord: params.shouldCreateTaskRecord,
    reason: params.reason,
    confidence: params.confidence,
    requiresTaskContext: !params.hasTaskContext && taskBoundReasonNeedsContext,
    summary: params.text ? params.text.slice(0, 120) : '',
    missing: params.missing,
  };
}
