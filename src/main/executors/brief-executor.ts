import { generateText } from 'ai';

import type { HomeBriefData } from '../../shared/types/brief.js';
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

export function buildFallbackBrief(homeData: HomeBriefData, kind: string): string {
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
    '待拍板事项：',
    decisionLines,
  ].join('\n');
}

function buildPrompt(homeData: HomeBriefData, kind: string): string {
  return [
    `请将以下任务控制台数据整理成一段适合知识工作者快速阅读的 brief。当前 brief 类型：${kind}。`,
    '输出要求：',
    '1. 先用一句话概括当前局势。',
    '2. 然后给 3 到 6 条重点，优先写任务、决策和执行动态。',
    '3. 如果当前没有明显风险，也要明确说明。',
    '4. 输出必须是人类可直接阅读的中文 brief，不要输出 JSON。',
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
  ].join('\n');
}

export class BriefExecutor {
  async execute(homeData: HomeBriefData, kind: string, config: RuntimeAiConfig): Promise<string> {
    const { text } = await generateText({
      model: getLanguageModel(config),
      prompt: buildPrompt(homeData, kind),
    });

    return text.trim();
  }
}
