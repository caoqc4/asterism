import { generateObject } from 'ai';
import { z } from 'zod';

import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
import type { DraftDecisionInput } from '../../../shared/types/decision.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import { deriveTaskDetailPriorityLane, getPriorityLanePromptGuidance } from '../../../shared/working-context/priority-lanes.js';
import type { RuntimeAiConfig } from '../../keychain/ai-config-service.js';
import { getLanguageModel } from '../../executors/ai-client.js';

const selectionSchema = z.object({
  shouldUse: z.boolean(),
  selectedTemplateIds: z.array(z.string()).max(2),
  reason: z.string(),
});

export type DecisionProcessTemplateSelectionResult = {
  shouldUse: boolean;
  selectedTemplates: AppliedProcessTemplateRecord[];
  reason: string;
};

function selectPromptKeySources(task: TaskDetail) {
  return task.sourceContexts
    .filter((item) => item.status === 'active' && item.isKey)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
}

function buildSelectionPrompt(
  task: TaskDetail,
  input: DraftDecisionInput,
  templates: AppliedProcessTemplateRecord[],
): string {
  const lane = deriveTaskDetailPriorityLane(task);
  const keySources = selectPromptKeySources(task);
  const sources = keySources.length
    ? `关键来源材料：\n${keySources
        .map((item) => `- ${item.title} [${item.kind}]${item.note ? ` | ${item.note}` : ''}`)
        .join('\n')}`
    : '关键来源材料：暂无';
  const artifacts = task.artifacts.length
    ? `最近产物：\n${task.artifacts
        .slice(0, 3)
        .map((item) => `- ${item.title} [${item.kind}]`)
        .join('\n')}`
    : '最近产物：暂无';
  const templateLines = templates
    .map(
      (item) =>
        `- id=${item.id} | title=${item.title} | kind=${item.kind} | tags=${item.tags.join(', ') || 'none'} | summary=${item.summary ?? '暂无'} | note=${item.bindingNote ?? '暂无'}`,
    )
    .join('\n');

  return [
    '你在做一次 Decision draft 前的 skill/template 选择。',
    '目标：判断这次决策请求草拟是否应该调用已挂载的方法模板；如果应该，最多选 2 个最相关模板。',
    '选择原则：',
    '1. 只有当模板能明显改善这次决策请求的组织方式、判断视角或表达质量时才选择。',
    '2. 不要因为任务挂了模板就默认全部调用。',
    '3. 优先选择最贴近当前 next step、等待/风险状态、来源材料和最近产物的模板。',
    '4. 如果没有明显相关模板，就 shouldUse=false。',
    `任务标题：${task.title}`,
    `任务摘要：${task.summary ?? '暂无'}`,
    `当前状态：${task.state}`,
    `当前 next step：${task.nextStep ?? '暂无'}`,
    `等待原因：${task.waitingReason ?? '暂无'}`,
    getPriorityLanePromptGuidance(lane),
    `风险：${
      task.riskLevel === 'none'
        ? '当前未标记明显风险'
        : `${task.riskLevel}${task.riskNote ? ` - ${task.riskNote}` : ''}`
    }`,
    `用户补充说明：${input.note?.trim() || '无'}`,
    sources,
    artifacts,
    '候选模板：',
    templateLines,
    '返回结构化结果。',
  ].join('\n');
}

export class DecisionProcessTemplateSelector {
  async select(
    task: TaskDetail,
    input: DraftDecisionInput,
    config: RuntimeAiConfig,
  ): Promise<DecisionProcessTemplateSelectionResult> {
    const templates = task.processTemplates.filter((item) => item.bindingStatus === 'active');

    if (templates.length === 0) {
      return {
        shouldUse: false,
        selectedTemplates: [],
        reason: '当前任务未挂载任何 process template。',
      };
    }

    const { object } = await generateObject({
      model: getLanguageModel(config),
      schema: selectionSchema,
      prompt: buildSelectionPrompt(task, input, templates),
    });

    const selectedTemplates = templates.filter((item) =>
      object.selectedTemplateIds.includes(item.id),
    );

    return {
      shouldUse: object.shouldUse && selectedTemplates.length > 0,
      selectedTemplates,
      reason: object.reason.trim(),
    };
  }
}
