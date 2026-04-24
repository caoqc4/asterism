import type { AppliedProcessTemplateRecord } from '../../shared/types/process-template.js';
import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';
import type { CreateRunInput } from '../../shared/types/run.js';
import type { TaskDetail } from '../../shared/types/task.js';
import { generateRuntimeText } from './text-generation.js';
import { deriveTaskDetailPriorityLane, getPriorityLanePromptGuidance } from '../../shared/working-context/priority-lanes.js';

type ExecuteOptions = {
  selectedTemplates?: AppliedProcessTemplateRecord[];
};

function buildPrompt(
  task: TaskDetail,
  input: CreateRunInput,
  options: ExecuteOptions = {},
): string {
  const lane = deriveTaskDetailPriorityLane(task);
  const summary = task.summary ? `任务摘要：${task.summary}` : '任务摘要：暂无';
  const extra = input.instructions?.trim() ? `附加要求：${input.instructions.trim()}` : '附加要求：无';
  const nextStep = task.nextStep ? `建议下一步：${task.nextStep}` : '建议下一步：暂无';
  const waitingReason = task.waitingReason ? `等待原因：${task.waitingReason}` : '等待原因：暂无';
  const risk =
    task.riskLevel === 'none'
      ? '风险：当前未标记明显风险'
      : `风险：${task.riskLevel}${task.riskNote ? ` - ${task.riskNote}` : ''}`;
  const processContext = options.selectedTemplates?.length
    ? [
        '执行时参考以下方法模板：',
        ...options.selectedTemplates.map(
          (item) =>
            `- ${item.title} [${item.kind}]${item.summary ? ` | ${item.summary}` : ''}\n${item.content}`,
        ),
      ].join('\n')
    : '执行时参考以下方法模板：暂无';

  if (input.type === 'draft' || input.type === 'agent') {
    if (input.type === 'agent') {
      return [
        '请基于下面的任务信息，完成一轮受限本地 agent 推进。',
        '你必须只输出一个合法 JSON 对象，不要输出 Markdown，不要输出额外解释。',
        'JSON 格式：',
        '{',
        '  "finalOutput": "可保存为本地 note 产物的正文",',
        '  "steps": [',
        '    { "tool": "task.inspect_context" },',
        '    { "tool": "artifact.create_note", "input": { "title": "简短 note 标题", "content": "与 finalOutput 一致的正文" } }',
        '  ]',
        '}',
        '工具限制：',
        '- 只能使用 task.inspect_context 和 artifact.create_note。',
        '- artifact.create_note.input.title 必须简短明确。',
        '- artifact.create_note.input.content 必须与 finalOutput 保持一致。',
        '如果上下文不足，仍然基于现有信息给出合理的 finalOutput。',
        `任务标题：${task.title}`,
        summary,
        nextStep,
        waitingReason,
        getPriorityLanePromptGuidance(lane),
        risk,
        processContext,
        extra,
      ].join('\n');
    }

    return [
      '请基于下面的任务信息，产出一份可直接继续编辑的工作草稿。',
      '输出要求：',
      '1. 直接给出草稿正文，不要额外解释模型如何思考。',
      '2. 如果上下文不足，请先基于现有信息给出合理的初稿。',
      `任务标题：${task.title}`,
      summary,
      nextStep,
      waitingReason,
      getPriorityLanePromptGuidance(lane),
      risk,
      processContext,
      extra,
    ].join('\n');
  }

  return [
    '请基于下面的任务信息，产出一份简洁明确的工作摘要。',
    '输出要求：',
    '1. 先给一句总体判断。',
    '2. 再给 3 到 5 条要点。',
    '3. 如果存在下一步建议，请单独列出。',
    `任务标题：${task.title}`,
    summary,
    nextStep,
    waitingReason,
    getPriorityLanePromptGuidance(lane),
    risk,
    processContext,
    extra,
  ].join('\n');
}

export class TextExecutor {
  async execute(
    task: TaskDetail,
    input: CreateRunInput,
    config: RuntimeAiConfig,
    options: ExecuteOptions = {},
  ): Promise<string> {
    return generateRuntimeText(config, buildPrompt(task, input, options));
  }
}
