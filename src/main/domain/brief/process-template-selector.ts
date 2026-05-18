import { generateObject } from 'ai';
import { z } from 'zod';

import { normalizeProcessTemplateSelection } from '../../../shared/process-template-selection.js';
import type { BriefProcessTemplateCandidate, HomeBriefData } from '../../../shared/types/brief.js';
import { getPriorityLanePromptGuidance } from '../../../shared/working-context/priority-lanes.js';
import type { RuntimeAiConfig } from '../../keychain/ai-config-service.js';
import { getLanguageModel } from '../../executors/ai-client.js';

const selectionSchema = z.object({
  shouldUse: z.boolean(),
  selectedTemplateIds: z.array(z.string()).max(2),
  reason: z.string(),
});

export type BriefProcessTemplateSelectionResult = {
  shouldUse: boolean;
  selectedTemplates: BriefProcessTemplateCandidate[];
  reason: string;
};

function buildSelectionPrompt(
  homeData: HomeBriefData,
  kind: string,
  templates: BriefProcessTemplateCandidate[],
): string {
  const lane = homeData.priorityLane ?? 'steady';
  const focusTaskLines = homeData.briefFocusTasks?.length
    ? homeData.briefFocusTasks
        .map((task) =>
          `${task.title} [lane=${task.lane}${task.status ? ` status=${task.status}` : ''}] (${task.whyNow})`,
        )
        .join(' | ')
    : '无';
  const templateLines = templates
    .map(
      (item) =>
        `- id=${item.id} | title=${item.title} | kind=${item.kind} | tags=${item.tags.join(', ') || 'none'} | tasks=${item.taskTitles.join(' / ')} | summary=${item.summary ?? '暂无'} | notes=${item.notes.join(' / ') || '暂无'}`,
    )
    .join('\n');

  return [
    '你在为一次任务控制台 brief 选择应该参考的方法模板（skills / workflows / SOPs）。',
    '目标：判断这次 brief 是否应该参考已挂载的方法模板，以帮助组织局势、强调优先级、压缩重点。',
    '选择原则：',
    '1. 只有当模板能明显改善这次 brief 的组织视角、重点排序或表达方式时才选择。',
    '2. 不要因为任务挂了模板就默认全部调用。',
    '3. 优先选择和当前等待、风险、最近动态、最近产物最相关的模板。',
    '4. 如果没有明显相关模板，就 shouldUse=false。',
    `Brief 类型：${kind}`,
    `活跃任务数：${homeData.activeTaskCount}`,
    `待决策数：${homeData.pendingDecisionCount}`,
    `等待中任务数：${homeData.waitingTaskCount}`,
    `高风险任务数：${homeData.highRiskTaskCount}`,
    `缺少下一步任务数：${homeData.missingNextStepTaskCount}`,
    getPriorityLanePromptGuidance(lane),
    `最近动态：${homeData.recentActivity
      .map((event) => `${event.sourceType}:${event.title}[${event.status}]`)
      .join(' | ') || '无'}`,
    `Brief 焦点任务：${focusTaskLines}`,
    `推荐动作：${homeData.recommendedActions
      .map((action) => `${action.label} (${action.reason})`)
      .join(' | ') || '无'}`,
    '候选模板：',
    templateLines,
    '返回结构化结果。',
  ].join('\n');
}

export class BriefProcessTemplateSelector {
  async select(
    homeData: HomeBriefData,
    kind: string,
    config: RuntimeAiConfig,
  ): Promise<BriefProcessTemplateSelectionResult> {
    const templates = homeData.processTemplateCandidates ?? [];

    if (templates.length === 0) {
      return {
        shouldUse: false,
        selectedTemplates: [],
        reason: '当前活跃任务未提供可用于 brief 的 process templates。',
      };
    }

    const { object } = await generateObject({
      model: getLanguageModel(config),
      schema: selectionSchema,
      prompt: buildSelectionPrompt(homeData, kind, templates),
    });

    return normalizeProcessTemplateSelection({
      candidates: templates,
      shouldUse: object.shouldUse,
      selectedTemplateIds: object.selectedTemplateIds,
      reason: object.reason,
    });
  }
}
