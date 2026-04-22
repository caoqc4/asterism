import { generateText } from 'ai';

import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';
import type { CreateRunInput } from '../../shared/types/run.js';
import type { TaskDetail } from '../../shared/types/task.js';
import { getLanguageModel } from './ai-client.js';

function buildPrompt(task: TaskDetail, input: CreateRunInput): string {
  const summary = task.summary ? `任务摘要：${task.summary}` : '任务摘要：暂无';
  const extra = input.instructions?.trim() ? `附加要求：${input.instructions.trim()}` : '附加要求：无';

  if (input.type === 'draft') {
    return [
      '请基于下面的任务信息，产出一份可直接继续编辑的工作草稿。',
      '输出要求：',
      '1. 直接给出草稿正文，不要额外解释模型如何思考。',
      '2. 如果上下文不足，请先基于现有信息给出合理的初稿。',
      `任务标题：${task.title}`,
      summary,
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
    extra,
  ].join('\n');
}

export class TextExecutor {
  async execute(task: TaskDetail, input: CreateRunInput, config: RuntimeAiConfig): Promise<string> {
    const { text } = await generateText({
      model: getLanguageModel(config),
      prompt: buildPrompt(task, input),
    });

    return text.trim();
  }
}
