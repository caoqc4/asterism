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
      const workspaceStepExample = input.allowLocalWorkspaceRead
        ? [
            '    { "tool": "workspace.search", "input": { "query": "需要查找的关键词", "maxResults": 5 } },',
            '    { "tool": "workspace.read_file", "input": { "path": "相对工作区根目录的文件路径" } },',
          ]
        : [];
      const taskMutationStepExamples = input.allowTaskMutationTools
        ? [
            '    { "tool": "task.update_next_step", "input": { "nextStep": "新的下一步" } },',
            '    { "tool": "task.create_completion_criterion", "input": { "text": "新的完成标准" } },',
            '    { "tool": "task.review_completion_evidence" },',
            '    { "tool": "source_context.create", "input": { "title": "来源标题", "kind": "note", "note": "来源摘要" } },',
            '    { "tool": "decision.draft", "input": { "note": "需要拍板的问题" } },',
          ]
        : [];
      const allowedToolParts = [
        'task.inspect_context',
        'task.inspect_timeline',
        input.allowLocalWorkspaceRead ? 'workspace.search' : null,
        input.allowLocalWorkspaceRead ? 'workspace.read_file' : null,
        input.allowTaskMutationTools ? 'task.update_next_step' : null,
        input.allowTaskMutationTools ? 'task.create_completion_criterion' : null,
        input.allowTaskMutationTools ? 'task.review_completion_evidence' : null,
        input.allowTaskMutationTools ? 'source_context.create' : null,
        input.allowTaskMutationTools ? 'decision.draft' : null,
        'artifact.create_note',
      ].filter((item): item is string => Boolean(item));
      const workspaceGuidance = input.allowLocalWorkspaceRead
        ? [
            '- workspace.search 只能用于搜索本地工作区内的文本文件。',
            '- workspace.read_file 只能读取 workspace.search 找到或用户明确提到的相对路径。',
            '- 不允许请求写文件、打补丁、运行命令或访问工作区外路径。',
          ]
        : [
            '- 当前没有开启只读工作区上下文，不允许使用 workspace.search 或 workspace.read_file。',
          ];
      const taskMutationGuidance = input.allowTaskMutationTools
        ? [
            '- 可以使用任务内更新/证据工具来更新下一步、添加完成标准、审查完成证据、补充来源上下文或草拟 Decision。',
            '- 每次计划最多使用一个任务内更新/证据工具；decision.draft 只能草拟，不会创建正式 Decision。',
            '- task.review_completion_evidence 只能审查证据，不能满足完成标准，也不能把任务转为 completed。',
          ]
        : [
            '- 当前没有开启任务内更新/证据工具，不允许使用 task.update_next_step、task.create_completion_criterion、task.review_completion_evidence、source_context.create 或 decision.draft。',
          ];

      return [
        '请基于下面的任务信息，完成一轮受限本地 agent 推进。',
        '你必须只输出一个合法 JSON 对象，不要输出 Markdown，不要输出额外解释。',
        'JSON 格式：',
        '{',
        '  "finalOutput": "可保存为本地 note 产物的正文",',
        '  "steps": [',
        '    { "tool": "task.inspect_context" },',
        '    { "tool": "task.inspect_timeline" },',
        ...workspaceStepExample,
        ...taskMutationStepExamples,
        '    { "tool": "artifact.create_note", "input": { "title": "简短 note 标题", "content": "与 finalOutput 一致的正文" } }',
        '  ]',
        '}',
        '工具限制：',
        `- 只能使用 ${allowedToolParts.join('、')}。`,
        ...workspaceGuidance,
        ...taskMutationGuidance,
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
