export type CrossTaskLearningSurface =
  | 'task_record'
  | 'work_habit_proposal'
  | 'process_template_proposal'
  | 'discussion_only';

export type CrossTaskLearningDecision = {
  surface: CrossTaskLearningSurface;
  requiresConfirmation: boolean;
  scope: 'task' | 'task_type' | 'project' | 'global' | null;
  reason: string;
  missing: string[];
};

const TASK_SPECIFIC_PATTERN = /这个任务|当前任务|本任务|本次任务|这批任务|当前这批|这个阶段|当前阶段|本阶段|这次|这里|刚刚|上面|this task|current task|for this one/i;
const GLOBAL_PATTERN = /以后|每次|总是|默认|所有任务|类似任务|下次|统一|习惯|偏好|规则|原则|规范|always|every time|by default|next time|similar tasks/i;
const PROCESS_PATTERN = /流程|步骤|SOP|模板|清单|先.*再|第一步|第二步|1\.|2\.|checklist|workflow|process|template/i;
const CORRECTION_PATTERN = /我提醒|纠正|更正|不是这样|应该是|应当|改成|以.*为准|correction|correct|instead/i;
const TEMPORARY_PATTERN = /想法|讨论|可能|也许|先聊|怎么看|brainstorm|maybe|what do you think/i;

export function evaluateCrossTaskLearningBoundary(text: string): CrossTaskLearningDecision {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return {
      surface: 'discussion_only',
      requiresConfirmation: false,
      scope: null,
      reason: '内容为空，不能沉淀为任务记忆或跨任务规则。',
      missing: ['明确的规则、纠正、流程或任务内记录'],
    };
  }

  const taskSpecific = TASK_SPECIFIC_PATTERN.test(normalized);
  const global = GLOBAL_PATTERN.test(normalized);
  const process = PROCESS_PATTERN.test(normalized);
  const correction = CORRECTION_PATTERN.test(normalized);

  if (taskSpecific && correction) {
    return {
      surface: 'task_record',
      requiresConfirmation: false,
      scope: 'task',
      reason: '这是当前任务内的纠正或恢复上下文，应写入任务记录，不应升级成全局习惯。',
      missing: [],
    };
  }

  if (taskSpecific) {
    return {
      surface: 'task_record',
      requiresConfirmation: false,
      scope: 'task',
      reason: '这包含当前任务指代，应先作为任务内上下文保存，不应直接升级成跨任务规则。',
      missing: [],
    };
  }

  if (global && process) {
    return {
      surface: 'process_template_proposal',
      requiresConfirmation: true,
      scope: 'task_type',
      reason: '这描述了可复用流程形状，应作为流程模板/SOP 提案，确认前不影响执行。',
      missing: [],
    };
  }

  if (global) {
    return {
      surface: 'work_habit_proposal',
      requiresConfirmation: true,
      scope: 'global',
      reason: '这描述了跨任务偏好或规则，应作为工作习惯提案，确认前不进入执行上下文。',
      missing: [],
    };
  }

  if (process && !TEMPORARY_PATTERN.test(normalized)) {
    return {
      surface: 'process_template_proposal',
      requiresConfirmation: true,
      scope: 'task_type',
      reason: '这像流程或步骤模板，但缺少跨任务适用范围，需确认后才可复用。',
      missing: ['确认适用任务类型或项目范围'],
    };
  }

  if (correction) {
    return {
      surface: 'task_record',
      requiresConfirmation: false,
      scope: 'task',
      reason: '这更像任务内事实、纠正或上下文，不应沉淀成跨任务规则。',
      missing: [],
    };
  }

  return {
    surface: 'discussion_only',
    requiresConfirmation: false,
    scope: null,
    reason: '这段内容还不足以成为任务记录、工作习惯或流程模板。',
    missing: ['明确适用范围和可复用规则'],
  };
}
