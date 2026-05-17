import type {
  BriefProcessTemplateCandidate,
  HomeBriefData,
  PriorityLane,
} from '../../shared/types/brief.js';
import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';
import { generateRuntimeText } from './text-generation.js';

function formatTaskLine(title: string, state: string): string {
  return `- ${title} [${state}]`;
}

function isClarifyState(state: string): boolean {
  return state === 'captured' || state === 'triaged';
}

function formatTaskContext(
  state: string,
  nextStep: string | null,
  waitingReason: string | null,
  blockerTitle: string | null,
  riskLabel: string,
): string {
  const parts = [
    `next=${nextStep ?? '无'}`,
    `waiting=${waitingReason ?? '无'}`,
    `blocker=${blockerTitle ?? '无'}`,
    `risk=${riskLabel}`,
  ];

  if (isClarifyState(state)) {
    parts.push('clarify=先整理任务，再决定是否拍板或执行');
  }

  return parts.join(' | ');
}

function formatDecisionLine(title: string, status: string): string {
  return `- ${title} [${status}]`;
}

function formatRecommendedAction(
  label: string,
  reason: string,
  priority: string,
  responsibilitySummary?: string | null,
): string {
  return `- [${priority}] ${label} | ${reason}${
    responsibilitySummary ? ` | responsibility=${responsibilitySummary}` : ''
  }`;
}

function formatBriefAttentionLine(
  item: NonNullable<HomeBriefData['briefAttention']>['items'][number],
): string {
  return `- ${item.actionId} | lane=${item.lane} | task=${item.taskId ?? 'none'} | reason=${item.reason}`;
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

const LANE_LABELS: Record<PriorityLane, string> = {
  escalate_now: '立即升级',
  unblock_or_decide: '先解阻塞/拍板',
  continue_or_review: '继续推进/复核',
  clarify: '先补清晰度',
  steady: '稳态推进',
};

const LANE_ORDER: PriorityLane[] = [
  'escalate_now',
  'unblock_or_decide',
  'continue_or_review',
  'clarify',
  'steady',
];

function formatLaneSection<T>(
  items: T[],
  getLane: (item: T) => PriorityLane | undefined,
  formatItem: (item: T) => string,
): string[] {
  const grouped = new Map<PriorityLane, string[]>();

  for (const item of items) {
    const lane = getLane(item) ?? 'steady';
    const bucket = grouped.get(lane) ?? [];
    bucket.push(formatItem(item));
    grouped.set(lane, bucket);
  }

  return LANE_ORDER.flatMap((lane) => {
    const entries = grouped.get(lane);

    if (!entries?.length) {
      return [];
    }

    return [`${LANE_LABELS[lane]}：`, ...entries, ''];
  }).filter((line, index, all) => !(line === '' && index === all.length - 1));
}

function formatResumePreviewLine(preview: HomeBriefData['recentTaskResumes'][number]): string {
  const parts = [
    `- ${preview.taskTitle}`,
    `state=${preview.currentState}`,
    `latest=${preview.latestChange.summary}`,
    `next=${preview.nextSuggestedMove}`,
  ];

  if (preview.lane === 'clarify' && /状态：(captured|triaged)/.test(preview.currentState)) {
    parts.push('clarify=整理任务');
  }

  if (preview.keySource.title) {
    parts.push(`source=${preview.keySource.title}`);
  }

  if (preview.currentBlocker?.title) {
    parts.push(`blocker=${preview.currentBlocker.title}`);
  }

  if (preview.currentBlocker?.priorityReason) {
    parts.push(`blocker_reason=${preview.currentBlocker.priorityReason}`);
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
              task.state,
              task.nextStep,
              task.waitingReason,
              task.activeBlocker?.title ?? null,
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
    : '- 最近没有来源材料更新';
  const templateLines = selectedTemplates.length
    ? selectedTemplates.map((template) => formatTemplateLine(template)).join('\n')
    : '- 本次未额外参考方法模板';
  const resumePreviewLines = homeData.recentTaskResumes.length
    ? homeData.recentTaskResumes.map((preview) => formatResumePreviewLine(preview)).join('\n')
    : '- 当前没有可恢复的任务预览';
  const recommendedActionLines = homeData.recommendedActions.length
    ? formatLaneSection(
        homeData.recommendedActions,
        (action) => action.lane,
        (action) =>
          formatRecommendedAction(
            action.label,
            action.reason,
            action.priority,
            action.responsibilitySummary,
          ),
      ).join('\n')
    : '- 当前没有推荐动作';
  const attentionLines = homeData.briefAttention?.items.length
    ? [
        `- ${homeData.briefAttention.summary}`,
        `- display=${homeData.briefAttention.displayedCount}/${homeData.briefAttention.totalCount} limit=${homeData.briefAttention.displayLimit ?? 'none'} truncated=${homeData.briefAttention.truncated ? 'yes' : 'no'}`,
        ...homeData.briefAttention.items.map(formatBriefAttentionLine),
      ].join('\n')
    : '- 当前没有独立注意力投影';
  const activityLaneLines = homeData.recentActivity.length
    ? formatLaneSection(
        homeData.recentActivity,
        (event) => event.lane,
        (event) =>
          formatRecentActivityLine(event.sourceType, event.title, event.status, event.taskTitle),
      ).join('\n')
    : '- 最近没有关键决策或执行动态';

  return [
    `Taskplane Brief (${kind})`,
    '',
    `当前优先级语义：${homeData.priorityHeadline ?? '未识别'}`,
    `${homeData.priorityLede ?? '当前以常规任务恢复为主。'}`,
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
    recommendedActionLines,
    '',
    'Brief 注意力边界：',
    attentionLines,
    '',
    '任务恢复预览：',
    resumePreviewLines,
    '',
    '最近产物：',
    artifactLines,
    '',
    '最近动态：',
    activityLaneLines,
    '',
    '最近来源材料（关键优先）：',
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
    '2. 然后按优先级语义分段写 3 到 6 条重点，优先写“立即升级”“先解阻塞/拍板”，再写“继续推进/复核”与“先补清晰度”。',
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
    `当前优先级语义：${homeData.priorityHeadline ?? '未识别'}`,
    `语义说明：${homeData.priorityLede ?? '当前以常规任务恢复为主。'}`,
    '',
    '最近任务：',
    ...(homeData.recentTasks.length
      ? homeData.recentTasks.map(
          (task) =>
            `- ${task.title} | ${task.state} | ${task.summary ?? '无摘要'} | next=${task.nextStep ?? '无'} | waiting=${task.waitingReason ?? '无'} | blocker=${task.activeBlocker?.title ?? '无'} | risk=${
              task.riskLevel === 'none'
                ? 'none'
                : `${task.riskLevel}${task.riskNote ? `:${task.riskNote}` : ''}`
            }${isClarifyState(task.state) ? ' | clarify=先整理任务，再决定是否拍板或执行' : ''}`,
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
            `- ${task.title} | ${task.state} | waiting=${task.waitingReason ?? '无'} | blocker=${task.activeBlocker?.title ?? '无'} | next=${task.nextStep ?? '无'}`,
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
      ? formatLaneSection(
          homeData.recommendedActions,
          (action) => action.lane,
          (action) =>
            formatRecommendedAction(
              action.label,
              action.reason,
              action.priority,
              action.responsibilitySummary,
            ),
        )
      : ['- 无']),
    '',
    'Brief 注意力边界：',
    ...(homeData.briefAttention?.items.length
      ? [
          homeData.briefAttention.summary,
          `display=${homeData.briefAttention.displayedCount}/${homeData.briefAttention.totalCount} limit=${homeData.briefAttention.displayLimit ?? 'none'} truncated=${homeData.briefAttention.truncated ? 'yes' : 'no'}`,
          ...homeData.briefAttention.items.map(formatBriefAttentionLine),
        ]
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
      ? formatLaneSection(
          homeData.recentActivity,
          (event) => event.lane,
          (event) =>
            formatRecentActivityLine(event.sourceType, event.title, event.status, event.taskTitle),
        )
      : ['- 无']),
    '',
    '最近来源材料（关键优先）：',
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
    return generateRuntimeText(config, buildPrompt(homeData, kind, selectedTemplates));
  }
}
