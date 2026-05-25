const RESEARCH_DECLINE_PATTERN = /不要联网|不要搜索|不需要调研|skip\s+(web|search|research)|no\s+(web|search|research)/i;
const EXTERNAL_RESEARCH_PATTERN = /教程|文档|资料|调研|案例|官方(?:文档)?|竞品|产品规划|市场|最新|版本|发布说明|变更日志|最佳实践|web\s*research|search|browse|documentation|docs?|best\s+practices|release\s+notes?|changelog/i;
const EXPLICIT_EXTERNAL_RESEARCH_PATTERN = /联网|网页|网址|链接|https?:\/\/|官方(?:文档)?|official\s+docs?|official\s+documentation|外部|市场|竞品|web\s*(research|search)|web[_-]search|browse|最新.*(API|文档|版本|规范)|best\s+practices|release\s+notes?|changelog|最佳实践/i;
const LOCAL_WORKSPACE_PATTERN = /本地|工作区|当前仓库|仓库|代码|文件|实现|local|workspace|repo(?:sitory)?\b/i;

export type RuntimeResearchIntent = {
  declined: boolean;
  externalResearchLikely: boolean;
  explicitExternalResearch: boolean;
  localWorkspaceOnly: boolean;
  localWorkspaceSignal: boolean;
  shouldUseExternalResearch: boolean;
};

export function evaluateRuntimeResearchIntent(text: string): RuntimeResearchIntent {
  const normalized = normalizeText(text);
  const declined = RESEARCH_DECLINE_PATTERN.test(normalized);
  const externalResearchLikely = EXTERNAL_RESEARCH_PATTERN.test(normalized);
  const explicitExternalResearch = EXPLICIT_EXTERNAL_RESEARCH_PATTERN.test(normalized);
  const localWorkspaceSignal = LOCAL_WORKSPACE_PATTERN.test(normalized);
  const localWorkspaceOnly = localWorkspaceSignal && !explicitExternalResearch;

  return {
    declined,
    externalResearchLikely,
    explicitExternalResearch,
    localWorkspaceOnly,
    localWorkspaceSignal,
    shouldUseExternalResearch: externalResearchLikely && !localWorkspaceOnly && !declined,
  };
}

export function buildRuntimeResearchIntentText(parts: string | Array<string | null | undefined>): string {
  if (typeof parts === 'string') return normalizeText(parts);
  return normalizeText(parts.filter((part): part is string => Boolean(part?.trim())).join(' '));
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
