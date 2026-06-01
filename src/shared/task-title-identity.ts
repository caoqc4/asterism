export type TaskTitleIdentity = {
  normalizedTitle: string;
  actionCategory: string | null;
  objectKey: string | null;
};

const ACTION_PATTERNS: Array<{ category: string; pattern: RegExp }> = [
  { category: 'analysis', pattern: /需求|分析|梳理|调研|拆解/ },
  { category: 'design', pattern: /设计|体验|交互|原型|方案/ },
  { category: 'development', pattern: /开发|实现|编码|接入|搭建/ },
  { category: 'test', pattern: /测试|验证|验收|回归|质检/ },
  { category: 'release', pattern: /上线|发布|部署|发版/ },
  { category: 'optimize', pattern: /优化|改进|调整|修复/ },
  { category: 'review', pattern: /评审|检查|复核|审查/ },
];

const TITLE_FILLER_PATTERN = /(一个|一种|一项|相关|当前|整体|完整|具体|任务|工作|项目|流程|阶段|下一步|后续|继续|推进|处理|完成|微信)/g;
const ACTION_WORD_PATTERN = /(需求|分析|梳理|调研|拆解|设计|体验|交互|原型|方案|开发|实现|编码|接入|搭建|测试|验证|验收|回归|质检|上线|发布|部署|发版|优化|改进|调整|修复|评审|检查|复核|审查)/g;

export function normalizeTaskTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[：:，,。.、\s_-]+/g, '');
}

export function taskTitleSimilarity(a: string, b: string): number {
  const left = new Set(Array.from(a));
  const right = new Set(Array.from(b));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / new Set([...left, ...right]).size;
}

export function taskTitleIdentity(value: string): TaskTitleIdentity {
  const normalizedTitle = normalizeTaskTitle(value);
  const actionCategory = ACTION_PATTERNS.find((item) => item.pattern.test(normalizedTitle))?.category ?? null;
  const objectKey = normalizedTitle
    .replace(TITLE_FILLER_PATTERN, '')
    .replace(ACTION_WORD_PATTERN, '')
    .trim() || null;

  return {
    normalizedTitle,
    actionCategory,
    objectKey,
  };
}

export function isLikelyDuplicateTaskTitle(a: string, b: string): boolean {
  const left = taskTitleIdentity(a);
  const right = taskTitleIdentity(b);
  if (left.normalizedTitle === right.normalizedTitle) return true;
  if (Math.min(left.normalizedTitle.length, right.normalizedTitle.length) < 4) return false;
  if (taskTitleSimilarity(left.normalizedTitle, right.normalizedTitle) >= 0.9) return true;
  return hasSameActionObjectIdentity(left, right);
}

function hasSameActionObjectIdentity(left: TaskTitleIdentity, right: TaskTitleIdentity): boolean {
  if (!left.actionCategory || left.actionCategory !== right.actionCategory) return false;
  if (!left.objectKey || !right.objectKey) return false;
  if (Math.min(left.objectKey.length, right.objectKey.length) < 2) return false;
  if (left.objectKey === right.objectKey) return true;
  if (left.objectKey.includes(right.objectKey) || right.objectKey.includes(left.objectKey)) return true;
  return taskTitleSimilarity(left.objectKey, right.objectKey) >= 0.75;
}
