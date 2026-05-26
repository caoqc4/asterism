const RESEARCH_DECLINE_PATTERN = /(?:不要|不用|无需|别|不需要)(?:联网|搜索|调研|查网页|查资料)|skip\s+(web|search|research)|no\s+(web|search|research)|without\s+(web|search|research)/i;
const FRESH_EXTERNAL_SIGNAL_PATTERN = /latest\s+(?:api|docs?|documentation|version|release|news|status|pricing|prices?|policy|law|regulation|changes?|updates?)|up[-\s]?to[-\s]?date\s+(?:api|docs?|documentation|version|release|pricing|prices?|policy|law|regulation)|today(?:'s)?\s+(?:api|docs?|documentation|version|release|news|status|pricing|prices?|policy|law|regulation)|current\s+(?:api\s+(?:status|docs?|documentation|version|changes?|releases?)|docs?|documentation|version|release|news|status|pricing|prices?|policy|law|regulation)|recent\s+(?:changes?|updates?|releases?|news|pricing|prices?|changelog)|今天.*(?:价格|定价|新闻|发布|版本|状态)|当前(?:最新)?(?:API(?:状态|文档|版本|变化|变更)|文档|版本|价格|定价|政策|法规|状态)|(?:目前|现在)(?:的)?(?:API(?:状态|文档|版本|变化|变更|限制)|文档|版本|价格|定价|政策|法规|状态|限制)|近期(?:发布|版本|变更|新闻|价格|定价|更新)|最近(?:发布|版本|变更|新闻|价格|定价|更新)/i;
const FRESH_TIME_SIGNAL_PATTERN = /latest|up[-\s]?to[-\s]?date|today(?:'s)?|current|recent|最新|今天|当前|目前|现在|近期|最近/i;
const EXTERNAL_FRESH_SUBJECT_PATTERN = /docs?|documentation|official\s+docs?|official\s+documentation|version|release|news|status|pricing|prices?|policy|law|regulation|limits?|rate\s+limits?|changes?|updates?|changelog|官方(?:文档)?|文档|模型|版本|发布|新闻|价格|定价|政策|法规|限制|变更|变化|更新/i;
const EXTERNAL_RESEARCH_PATTERN = /教程|文档|资料|调研|案例|官方(?:文档)?|竞品|产品规划|市场|最新|版本|发布说明|变更日志|最佳实践|价格|定价|web\s*research|search|browse|documentation|docs?|pricing|prices?|best\s+practices|release\s+notes?|changelog/i;
const EXPLICIT_EXTERNAL_RESEARCH_PATTERN = /联网|网页|网址|链接|https?:\/\/|官方(?:文档)?|official\s+docs?|official\s+documentation|外部|市场|竞品|web\s*(research|search)|web[_-]search|browse|最新.*(API|文档|版本|规范|价格|定价)|best\s+practices|release\s+notes?|changelog|pricing|prices?|最佳实践/i;
const LOCAL_WORKSPACE_PATTERN = /本地|工作区|当前仓库|仓库|代码|文件|实现|local|workspace|repo(?:sitory)?\b/i;

export type RuntimeResearchIntent = {
  declined: boolean;
  externalResearchLikely: boolean;
  explicitExternalResearch: boolean;
  freshExternalSignal: boolean;
  localWorkspaceOnly: boolean;
  localWorkspaceSignal: boolean;
  shouldUseExternalResearch: boolean;
};

export function evaluateRuntimeResearchIntent(text: string): RuntimeResearchIntent {
  const normalized = normalizeText(text);
  const declined = RESEARCH_DECLINE_PATTERN.test(normalized);
  const freshExternalSignal = FRESH_EXTERNAL_SIGNAL_PATTERN.test(normalized) || (
    FRESH_TIME_SIGNAL_PATTERN.test(normalized) &&
    EXTERNAL_FRESH_SUBJECT_PATTERN.test(normalized)
  );
  const externalResearchLikely = EXTERNAL_RESEARCH_PATTERN.test(normalized) || freshExternalSignal;
  const explicitExternalResearch = EXPLICIT_EXTERNAL_RESEARCH_PATTERN.test(normalized) || freshExternalSignal;
  const localWorkspaceSignal = LOCAL_WORKSPACE_PATTERN.test(normalized);
  const localWorkspaceOnly = localWorkspaceSignal && !explicitExternalResearch;

  return {
    declined,
    externalResearchLikely,
    explicitExternalResearch,
    freshExternalSignal,
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
