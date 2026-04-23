import { generateText } from 'ai';

import type {
  BriefProcessTemplateCandidate,
  HomeBriefData,
} from '../../shared/types/brief.js';
import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';
import { getLanguageModel } from './ai-client.js';

function formatTaskLine(title: string, state: string): string {
  return `- ${title} [${state}]`;
}

function formatTaskContext(nextStep: string | null, waitingReason: string | null, riskLabel: string): string {
  return [`next=${nextStep ?? '无'}`, `waiting=${waitingReason ?? '无'}`, `risk=${riskLabel}`].join(' | ');
}

function formatDecisionLine(title: string, status: string): string {
  return `- ${title} [${status}]`;
}

function formatRecommendedAction(label: string, reason: string, priority: string): string {
  return `- [${priority}] ${label} | ${reason}`;
}

function formatRecentActivityLine(
  sourceType: string,
  title: string,
  status: string,
  taskTitle: string,
): string {
  return `- ${sourceType}:${title} [${status}] | task=${taskTitle}`;
}

function formatTemplateLine(template: BriefProcessTemplateCandidate): string {
  return `- ${template.title} [${template.kind}] | tasks=${template.taskTitles.join(' / ')}`;
}

function formatResumePreviewLine(preview: HomeBriefData['recentTaskResumes'][number]): string {
  const parts = [
    `- ${preview.taskTitle}`,
    `state=${preview.currentState}`,
    `latest=${preview.latestChange.summary}`,
    `next=${preview.nextSuggestedMove}`,
  ];

  if (preview.keySource.title) {
    parts.push(`source=${preview.keySource.title}`);
  }

  if (preview.currentMethod.title) {
    parts.push(`method=${preview.currentMethod.title}`);
  }

  return parts.join(' | ');
}

export function buildFallbackBrief(
  homeData: HomeBriefData,
  kind: string,
  selectedTemplates: BriefProcessTemplateCandidate[] = [],
): string {
  const taskLines = homeData.recentTasks.length
    ? homeData.recentTasks
        .map(
          (task) =>
            `${formatTaskLine(task.title, task.state)}\n  ${formatTaskContext(
              task.nextStep,
              task.waitingReason,
              task.riskLevel === 'none'
                ? 'none'
                : `${task.riskLevel}${task.riskNote ? `:${task.riskNote}` : ''}`,
            )}`,
        )
        .join('\n')
    : '- 当前没有任务';
  const decisionLines = homeData.pendingDecisions.length
    ? homeData.pendingDecisions
        .map((decision) => formatDecisionLine(decision.title, decision.status))
        .join('\n')
    : '- 当前没有待拍板事项';
  const artifactLines = homeData.recentArtifacts.length
    ? homeData.recentArtifacts
        .map(
          (artifact) =>
            `- ${artifact.title} [${artifact.kind}] | source=${artifact.sourceType}:${artifact.sourceId}`,
        )
        .join('\n')
    : '- 当前没有最近产物';
  const activityLines = homeData.recentActivity.length
    ? homeData.recentActivity
        .map((event) =>
          formatRecentActivityLine(event.sourceType, event.title, event.status, event.taskTitle),
        )
        .join('\n')
    : '- 最近没有关键决策或执行动态';
  const sourceContextLines = homeData.recentSourceContexts.length
    ? homeData.recentSourceContexts
        .map(
          (item) =>
            `- ${item.title} [${item.kind}] | task=${item.taskTitle}${item.note ? ` | ${item.note}` : ''}`,
        )
        .join('\n')
    : '- 最近没有关键来源材料';
  const templateLines = selectedTemplates.length
    ? selectedTemplates.map((template) => formatTemplateLine(template)).join('\n')
    : '- 本次未额外参考方法模板';
  const resumePreviewLines = homeData.recentTaskResumes.length
    ? homeData.recentTaskResumes.map((preview) => formatResumePreviewLine(preview)).join('\n')
    : '- 当前没有可恢复的任务预览';

  return [
    `Taskplane Brief (${kind})`,
    '',
    `活跃任务：${homeData.activeTaskCount}`,
    `待决策：${homeData.pendingDecisionCount}`,
    `已完成：${homeData.completedTaskCount}`,
    `最近 Runs：${homeData.recentRunCount}`,
    `等待中任务：${homeData.waitingTaskCount}`,
    `高风险任务：${homeData.highRiskTaskCount}`,
    `缺少下一步：${homeData.missingNextStepTaskCount}`,
    '',
    '最近任务：',
    taskLines,
    '',
    '高风险任务：',
    homeData.highRiskTasks.length
      ? homeData.highRiskTasks
          .map((task) => formatTaskLine(task.title, `${task.state} / ${task.riskLevel}`))
          .join('\n')
      : '- 当前没有高风险任务',
    '',
    '等待中任务：',
    homeData.waitingTasks.length
      ? homeData.waitingTasks
          .map((task) => formatTaskLine(task.title, task.waitingReason ?? task.state))
          .join('\n')
      : '- 当前没有等待中任务',
    '',
    '推荐动作：',
    homeData.recommendedActions.length
      ? homeData.recommendedActions
          .map((action) =>
            formatRecommendedAction(action.label, action.reason, action.priority),
          )
          .join('\n')
      : '- 当前没有推荐动作',
    '',
    '任务恢复预览：',
    resumePreviewLines,
    '',
    '最近产物：',
    artifactLines,
    '',
    '最近动态：',
    activityLines,
    '',
    '关键来源材料：',
    sourceContextLines,
    '',
    '本次参考的方法模板：',
    templateLines,
    '',
    '待拍板事项：',
    decisionLines,
  ].join('\n');
}

function buildPrompt(
  homeData: HomeBriefData,
  kind: string,
  selectedTemplates: BriefProcessTemplateCandidate[],
): string {
  return [
    `请将以下任务控制台数据整理成一段适合知识工作者快速阅读的 brief。当前 brief 类型：${kind}。`,
    '输出要求：',
    '1. 先用一句话概括当前局势。',
    '2. 然后给 3 到 6 条重点，优先写任务、决策和执行动态。',
    '3. 如果当前没有明显风险，也要明确说明。',
    '4. 输出必须是人类可直接阅读的中文 brief，不要输出 JSON。',
    selectedTemplates.length
      ? '5. 请参考附带的方法模板组织摘要重点，但不要机械照抄模板原文。'
      : '5. 根据局势自然组织重点，不需要强行套模板。',
    '',
    `活跃任务数：${homeData.activeTaskCount}`,
    `待决策数：${homeData.pendingDecisionCount}`,
    `已完成任务数：${homeData.completedTaskCount}`,
    `最近 run 数：${homeData.recentRunCount}`,
    `等待中任务数：${homeData.waitingTaskCount}`,
    `高风险任务数：${homeData.highRiskTaskCount}`,
    `缺少下一步任务数：${homeData.missingNextStepTaskCount}`,
    '',
    '最近任务：',
    ...(homeData.recentTasks.length
      ? homeData.recentTasks.map(
          (task) =>
            `- ${task.title} | ${task.state} | ${task.summary ?? '无摘要'} | next=${task.nextStep ?? '无'} | waiting=${task.waitingReason ?? '无'} | risk=${
              task.riskLevel === 'none'
                ? 'none'
                : `${task.riskLevel}${task.riskNote ? `:${task.riskNote}` : ''}`
            }`,
        )
      : ['- 无']),
    '',
    '待决策事项：',
    ...(homeData.pendingDecisions.length
      ? homeData.pendingDecisions.map(
          (decision) => `- ${decision.title} | ${decision.status} | task=${decision.taskId}`,
        )
      : ['- 无']),
    '',
    '高风险任务：',
    ...(homeData.highRiskTasks.length
      ? homeData.highRiskTasks.map(
          (task) =>
            `- ${task.title} | ${task.state} | risk=${task.riskLevel}${task.riskNote ? `:${task.riskNote}` : ''}`,
        )
      : ['- 无']),
    '',
    '等待中任务：',
    ...(homeData.waitingTasks.length
      ? homeData.waitingTasks.map(
          (task) =>
            `- ${task.title} | ${task.state} | waiting=${task.waitingReason ?? '无'} | next=${task.nextStep ?? '无'}`,
        )
      : ['- 无']),
    '',
    '缺少下一步的任务：',
    ...(homeData.missingNextStepTasks.length
      ? homeData.missingNextStepTasks.map(
          (task) => `- ${task.title} | ${task.state} | summary=${task.summary ?? '无摘要'}`,
        )
      : ['- 无']),
    '',
    '推荐动作：',
    ...(homeData.recommendedActions.length
      ? homeData.recommendedActions.map((action) =>
          formatRecommendedAction(action.label, action.reason, action.priority),
        )
      : ['- 无']),
    '',
    '任务恢复预览：',
    ...(homeData.recentTaskResumes.length
      ? homeData.recentTaskResumes.map((preview) => formatResumePreviewLine(preview))
      : ['- 无']),
    '',
    '最近产物：',
    ...(homeData.recentArtifacts.length
      ? homeData.recentArtifacts.map(
          (artifact) =>
            `- ${artifact.title} | ${artifact.kind} | source=${artifact.sourceType}:${artifact.sourceId} | content=${artifact.content}`,
          )
      : ['- 无']),
    '',
    '最近动态：',
    ...(homeData.recentActivity.length
      ? homeData.recentActivity.map((event) =>
          formatRecentActivityLine(event.sourceType, event.title, event.status, event.taskTitle),
        )
      : ['- 无']),
    '',
    '关键来源材料：',
    ...(homeData.recentSourceContexts.length
      ? homeData.recentSourceContexts.map(
          (item) =>
            `- ${item.title} | ${item.kind} | task=${item.taskTitle}${item.note ? ` | note=${item.note}` : ''}${item.uri ? ` | uri=${item.uri}` : ''}`,
        )
      : ['- 无']),
    '',
    '本次可参考的方法模板：',
    ...(selectedTemplates.length
      ? selectedTemplates.map(
          (template) =>
            `- ${template.title} | ${template.kind} | tasks=${template.taskTitles.join(' / ')} | tags=${template.tags.join(', ') || 'none'} | summary=${template.summary ?? '暂无'} | content=${template.content}`,
        )
      : ['- 无']),
  ].join('\n');
}

export class BriefExecutor {
  async execute(
    homeData: HomeBriefData,
    kind: string,
    config: RuntimeAiConfig,
    options: {
      selectedTemplates?: BriefProcessTemplateCandidate[];
    } = {},
  ): Promise<string> {
    const selectedTemplates = options.selectedTemplates ?? [];
    const { text } = await generateText({
      model: getLanguageModel(config),
      prompt: buildPrompt(homeData, kind, selectedTemplates),
    });

    return text.trim();
  }
}
