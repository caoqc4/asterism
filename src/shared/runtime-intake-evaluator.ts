export type RuntimeIntakeOutcome =
  | 'create_task'
  | 'create_task_record'
  | 'propose_task_file'
  | 'surface_decision'
  | 'propose_work_habit'
  | 'continue_discussion';

export type RuntimeIntakeConfidence =
  | 'high'
  | 'medium'
  | 'low';

export type RuntimeIntakeSurface =
  | 'task'
  | 'task_record'
  | 'task_file'
  | 'decision'
  | 'work_habit'
  | 'discussion';

export type RuntimeIntakeSource =
  | 'global_chat'
  | 'task_chat'
  | 'file_chat';

export type RuntimeIntakeEvaluation = {
  outcome: RuntimeIntakeOutcome;
  allowed: boolean;
  confidence: RuntimeIntakeConfidence;
  title: string | null;
  summary: string;
  reason: string;
  requiresConfirmation: boolean;
  suggestedSurface: RuntimeIntakeSurface;
  missing: string[];
};

const MAX_TITLE_LENGTH = 42;
const MIN_ACTIONABLE_LENGTH = 4;

const EXPLICIT_TASK_PATTERN = /新任务|创建任务|捕获为任务|加到任务|加入任务|作为任务|后续任务|follow[- ]?up task|create (a )?task|add (a )?task/i;
const ACTIONABLE_PATTERN = /需要|帮我|请|做|实现|修复|检查|评估|设计|准备|整理|跟进|安排|推进|优化|调整|开始|继续|完成|build|fix|review|evaluate|design|prepare|implement/i;
const DISCUSSION_PATTERN = /怎么看|怎么想|聊聊|讨论一下|想法|思路|是否合理|可以吗|what do you think|brainstorm/i;
const RECORD_PATTERN = /记录|交接|阶段|收尾|复盘|质量检查|上下文|清理|刷新|回顾|刚刚|之前|结论|问题原因|失败|阻塞原因|handoff|closeout|retro|postmortem/i;
const DECISION_PATTERN = /待拍板|拍板|决策|批准|审批|确认|是否|要不要|选哪个|选择|风险|验收|能不能|是否允许|approve|approval|decision|decide|choose/i;
const STRONG_DECISION_PATTERN = /待拍板|拍板|决策|批准|审批|要不要|选哪个|选择|风险|验收|是否允许|approve|approval|decision|decide|choose/i;
const WORK_HABIT_PATTERN = /以后|每次|总是|默认|习惯|偏好|规则|原则|规范|不要再|统一|所有任务|类似任务|下次|work habit|preference/i;
const TASK_FILE_PATTERN = /写成文档|生成文件|保存为|写入文件|生成.*Markdown|生成.*md|报告|草稿|提案|导出|file proposal|markdown file|write .*file/i;
const FOLLOW_UP_TASK_PATTERN = /后续任务|下一项任务|下一任务|follow[- ]?up task|successor task/i;
const TASK_CORRECTION_PATTERN = /我提醒|纠正|更正|不是这样|应该是|应当|改成|以.*为准|correction|correct/i;
const EXPLICIT_APPROVAL_PATTERN = /待拍板|拍板|批准|审批|要不要|选哪个|是否允许|approve|approval|decide|choose/i;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function titleFromText(text: string): string | null {
  const firstLine = text.split('\n').find((line) => line.trim())?.trim();
  if (!firstLine) return null;
  return firstLine.length > MAX_TITLE_LENGTH ? `${firstLine.slice(0, MAX_TITLE_LENGTH)}…` : firstLine;
}

export function isRuntimeFollowUpTaskProposal(text: string): boolean {
  return FOLLOW_UP_TASK_PATTERN.test(normalizeText(text));
}

function buildEvaluation(input: Omit<RuntimeIntakeEvaluation, 'summary'> & { text: string }): RuntimeIntakeEvaluation {
  return {
    ...input,
    summary: normalizeText(input.text),
  };
}

export function evaluateRuntimeIntake(params: {
  text: string;
  hasTaskContext?: boolean;
  source?: RuntimeIntakeSource;
}): RuntimeIntakeEvaluation {
  const text = params.text.trim();
  const normalized = normalizeText(text);
  const hasTaskContext = Boolean(params.hasTaskContext) || params.source === 'task_chat' || params.source === 'file_chat';
  const title = titleFromText(text);

  if (!normalized || normalized.length < MIN_ACTIONABLE_LENGTH) {
    return buildEvaluation({
      text,
      outcome: 'continue_discussion',
      allowed: false,
      confidence: 'high',
      title: null,
      reason: '输入内容太短，还不足以形成可执行事项。',
      requiresConfirmation: false,
      suggestedSurface: 'discussion',
      missing: ['明确目标或下一步行动'],
    });
  }

  if (WORK_HABIT_PATTERN.test(normalized)) {
    return buildEvaluation({
      text,
      outcome: 'propose_work_habit',
      allowed: false,
      confidence: 'medium',
      title,
      reason: '这更像跨任务工作习惯或执行偏好，应走工作习惯确认，而不是直接创建任务。',
      requiresConfirmation: true,
      suggestedSurface: 'work_habit',
      missing: [],
    });
  }

  if (
    hasTaskContext
    && TASK_CORRECTION_PATTERN.test(normalized)
    && !EXPLICIT_TASK_PATTERN.test(normalized)
    && !EXPLICIT_APPROVAL_PATTERN.test(normalized)
  ) {
    return buildEvaluation({
      text,
      outcome: 'create_task_record',
      allowed: false,
      confidence: 'medium',
      title,
      reason: '这更像当前任务内的纠正或恢复性上下文，应写入任务记录，而不是升级为拍板或新建任务。',
      requiresConfirmation: false,
      suggestedSurface: 'task_record',
      missing: [],
    });
  }

  if (
    DECISION_PATTERN.test(normalized)
    && !EXPLICIT_TASK_PATTERN.test(normalized)
    && (STRONG_DECISION_PATTERN.test(normalized) || !DISCUSSION_PATTERN.test(normalized))
  ) {
    return buildEvaluation({
      text,
      outcome: 'surface_decision',
      allowed: false,
      confidence: 'medium',
      title,
      reason: '这更像需要用户判断的事项，应进入待决策/拍板流程，而不是直接创建任务。',
      requiresConfirmation: true,
      suggestedSurface: 'decision',
      missing: [],
    });
  }

  if (TASK_FILE_PATTERN.test(normalized) && hasTaskContext && !EXPLICIT_TASK_PATTERN.test(normalized)) {
    return buildEvaluation({
      text,
      outcome: 'propose_task_file',
      allowed: false,
      confidence: 'medium',
      title,
      reason: '这更像当前任务下的文件或输出写入请求，应先生成文件提案。',
      requiresConfirmation: true,
      suggestedSurface: 'task_file',
      missing: [],
    });
  }

  if (hasTaskContext && RECORD_PATTERN.test(normalized) && !EXPLICIT_TASK_PATTERN.test(normalized)) {
    return buildEvaluation({
      text,
      outcome: 'create_task_record',
      allowed: false,
      confidence: 'medium',
      title,
      reason: '这更像当前任务的记录、交接或阶段信息，应写入任务记录，而不是新建任务。',
      requiresConfirmation: false,
      suggestedSurface: 'task_record',
      missing: [],
    });
  }

  if (EXPLICIT_TASK_PATTERN.test(normalized)) {
    return buildEvaluation({
      text,
      outcome: 'create_task',
      allowed: true,
      confidence: 'high',
      title,
      reason: '用户明确表达了创建或捕获任务的意图。',
      requiresConfirmation: true,
      suggestedSurface: 'task',
      missing: [],
    });
  }

  if (!hasTaskContext && ACTIONABLE_PATTERN.test(normalized) && !DISCUSSION_PATTERN.test(normalized)) {
    return buildEvaluation({
      text,
      outcome: 'create_task',
      allowed: true,
      confidence: 'medium',
      title,
      reason: '全局输入包含可执行动作，可以先捕获为待确认任务。',
      requiresConfirmation: true,
      suggestedSurface: 'task',
      missing: [],
    });
  }

  return buildEvaluation({
    text,
    outcome: 'continue_discussion',
    allowed: false,
    confidence: 'low',
    title,
    reason: hasTaskContext
      ? '这更像当前任务内的继续讨论，暂不应自动创建新任务。'
      : '这段内容还不足以判断为可执行新任务。',
    requiresConfirmation: false,
    suggestedSurface: 'discussion',
    missing: ['明确目标、交付物或下一步行动'],
  });
}
