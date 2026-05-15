import type { AgentWorkingContext } from './types/agent-execution.js';
import type { RuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';
import { evaluateSelectedFileRelevance, type SelectedFileRelevanceReason } from './selected-file-relevance.js';
import { evaluateSourceFreshness, type SourceFreshnessDecision, type SourceFreshnessReason } from './source-freshness-evaluator.js';
import type { SourceContextRole, SourceContextStatus } from './types/source-context.js';
import type { TaskState } from './types/task.js';

export type RuntimeContextManifestItemKind =
  | 'task_state'
  | 'selected_file'
  | 'source_context'
  | 'artifact'
  | 'task_file'
  | 'process_template'
  | 'timeline'
  | 'work_habit'
  | 'capability';

export type RuntimeContextManifestItem = {
  contentIncluded: boolean;
  id: string;
  inclusionDecision?: SourceFreshnessDecision | null;
  inclusionReason?: SourceFreshnessReason | SelectedFileRelevanceReason | null;
  kind: RuntimeContextManifestItemKind;
  label: string;
  note?: string | null;
};

export type RuntimeContextSnapshotMode =
  | 'global'
  | 'task'
  | 'task_file';

export type RuntimeContextSnapshot = {
  activeSurface: 'global' | 'task';
  mode: RuntimeContextSnapshotMode;
  taskId: string | null;
  taskTitle: string | null;
  selectedFilePath: string | null;
  selectedFileKind: string | null;
  conversationMode: 'global' | 'task_bound';
  isTaskBound: boolean;
  summary: string;
};

export type RuntimeContextManifest = {
  activeSurface: 'global' | 'task';
  items: RuntimeContextManifestItem[];
  summary: string;
  userFacingSummary: string;
};

export type RuntimeContextAssemblyRequirementKind =
  | 'product_principles'
  | 'task_state'
  | 'task_md'
  | 'task_records'
  | 'selected_file'
  | 'structured_signals'
  | 'work_habits';

export type RuntimeContextAssemblyRequirementStatus =
  | 'included'
  | 'missing'
  | 'optional'
  | 'not_applicable';

export type RuntimeContextAssemblyRequirement = {
  kind: RuntimeContextAssemblyRequirementKind;
  status: RuntimeContextAssemblyRequirementStatus;
  reason: string;
};

export type RuntimeContextAssemblyPolicy = {
  activeSurface: 'global' | 'task';
  canExecuteTaskWork: boolean;
  requirements: RuntimeContextAssemblyRequirement[];
  missingRequired: RuntimeContextAssemblyRequirementKind[];
  summary: string;
};

type RuntimeContextManifestTask = {
  id: string;
  title: string;
  state?: TaskState | null;
  summary?: string | null;
};

type RuntimeContextSelectedFile = {
  path: string;
  kind?: string | null;
  contentPreview?: string | null;
};

type RuntimeContextTaskFile = {
  path: string;
  kind?: string | null;
  contentPreview?: string | null;
};

type RuntimeContextSourceContext = {
  capturedAt?: string | null;
  contentPreview?: string | null;
  createdAt?: string | null;
  id: string;
  isKey?: boolean;
  kind?: string | null;
  note?: string | null;
  runId?: string | null;
  selected?: boolean;
  sourceRole?: SourceContextRole | null;
  status?: SourceContextStatus | string | null;
  title: string;
  updatedAt?: string | null;
};

export function buildRuntimeContextSnapshot(params: {
  selectedFile?: RuntimeContextSelectedFile | null;
  task?: RuntimeContextManifestTask | null;
}): RuntimeContextSnapshot {
  const task = params.task ?? null;
  const selectedFile = params.selectedFile ?? null;
  const activeSurface = task ? 'task' : 'global';
  const mode: RuntimeContextSnapshotMode = task
    ? selectedFile?.path
      ? 'task_file'
      : 'task'
    : 'global';
  const summary = task
    ? selectedFile?.path
      ? `任务上下文：${task.title} / 文件：${selectedFile.path}`
      : `任务上下文：${task.title}`
    : '全局上下文';

  return {
    activeSurface,
    mode,
    taskId: task?.id ?? null,
    taskTitle: task?.title ?? null,
    selectedFilePath: selectedFile?.path ?? null,
    selectedFileKind: selectedFile?.kind ?? null,
    conversationMode: task ? 'task_bound' : 'global',
    isTaskBound: Boolean(task),
    summary,
  };
}

export function buildRuntimeContextManifest(params: {
  applicableWorkHabits?: string[];
  capabilities?: RuntimeCapabilitySnapshot | null;
  currentRunId?: string | null;
  selectedFile?: RuntimeContextSelectedFile | null;
  sourceContexts?: RuntimeContextSourceContext[];
  task?: RuntimeContextManifestTask | null;
  taskFiles?: RuntimeContextTaskFile[];
  workingContext?: AgentWorkingContext | null;
}): RuntimeContextManifest {
  const workingContext = params.workingContext ?? null;
  const task = params.task ?? (
    workingContext
      ? {
          id: workingContext.task.id,
          title: workingContext.task.title,
          state: workingContext.task.state,
          summary: workingContext.task.summary,
        }
      : null
  );
  const items: RuntimeContextManifestItem[] = [];

  if (task) {
    items.push({
      contentIncluded: true,
      id: task.id,
      kind: 'task_state',
      label: task.title,
      note: task.state ? `state=${task.state}` : null,
    });
  }

  if (params.selectedFile?.path) {
    const relevance = evaluateSelectedFileRelevance(params.selectedFile);
    items.push({
      contentIncluded: Boolean(params.selectedFile.contentPreview) && relevance.decision !== 'exclude',
      id: params.selectedFile.path,
      inclusionDecision: relevance.decision === 'include' ? 'include' : relevance.decision === 'exclude' ? 'exclude' : 'caution',
      inclusionReason: relevance.reason,
      kind: 'selected_file',
      label: params.selectedFile.path,
      note: [params.selectedFile.kind ?? null, relevance.reason].filter(Boolean).join(' / '),
    });
  }

  if (workingContext) {
    items.push(
      ...workingContext.sources.map((source) => {
        const freshness = evaluateSourceFreshness({
          capturedAt: source.capturedAt,
          createdAt: source.createdAt,
          currentRunId: params.currentRunId,
          isKey: source.isKey,
          runId: source.runId,
          selected: source.selected,
          sourceRole: source.sourceRole,
          status: source.status,
          title: source.title,
          updatedAt: source.updatedAt,
        });
        return {
          contentIncluded: Boolean(source.contentPreview) && freshness.decision !== 'exclude',
          id: source.id ?? source.title,
          inclusionDecision: freshness.decision,
          inclusionReason: freshness.reason,
          kind: 'source_context' as const,
          label: source.title,
          note: [source.isKey ? 'key' : source.kind, freshness.reason].filter(Boolean).join(' / '),
        };
      }),
      ...workingContext.artifacts.map((artifact) => ({
        contentIncluded: Boolean(artifact.contentPreview),
        id: artifact.title,
        kind: 'artifact' as const,
        label: artifact.title,
        note: artifact.kind,
      })),
      ...workingContext.taskFiles.map((file) => ({
        contentIncluded: Boolean(file.contentPreview),
        id: file.path,
        kind: 'task_file' as const,
        label: file.path,
        note: file.kind,
      })),
      ...workingContext.processTemplates.map((template) => ({
        contentIncluded: Boolean(template.summary),
        id: template.id,
        kind: 'process_template' as const,
        label: template.title,
        note: template.kind,
      })),
      ...workingContext.recentTimeline.map((event) => ({
        contentIncluded: true,
        id: `${event.type}:${event.createdAt}`,
        kind: 'timeline' as const,
        label: event.summary,
        note: event.priorityGroup ?? event.objectFamily ?? null,
      })),
    );
  }

  if (!workingContext && params.sourceContexts?.length) {
    items.push(
      ...params.sourceContexts.map((source) => {
        const freshness = evaluateSourceFreshness({
          capturedAt: source.capturedAt,
          createdAt: source.createdAt,
          currentRunId: params.currentRunId,
          isKey: source.isKey,
          runId: source.runId,
          selected: source.selected,
          sourceRole: source.sourceRole,
          status: source.status,
          title: source.title,
          updatedAt: source.updatedAt,
        });
        return {
          contentIncluded: Boolean(source.contentPreview) && freshness.decision !== 'exclude',
          id: source.id,
          inclusionDecision: freshness.decision,
          inclusionReason: freshness.reason,
          kind: 'source_context' as const,
          label: source.title,
          note: [source.isKey ? 'key' : source.kind ?? null, freshness.reason].filter(Boolean).join(' / '),
        };
      }),
    );
  }

  if (!workingContext && params.taskFiles?.length) {
    items.push(
      ...params.taskFiles.map((file) => ({
        contentIncluded: Boolean(file.contentPreview),
        id: file.path,
        kind: 'task_file' as const,
        label: file.path,
        note: file.kind ?? null,
      })),
    );
  }

  for (const habit of params.applicableWorkHabits ?? []) {
    const label = habit.trim();
    if (!label) continue;
    items.push({
      contentIncluded: true,
      id: label,
      kind: 'work_habit',
      label,
    });
  }

  if (params.capabilities) {
    items.push({
      contentIncluded: true,
      id: 'runtime_capabilities',
      kind: 'capability',
      label: 'Runtime capabilities',
      note: params.capabilities.summary,
    });
  }

  const activeSurface = task ? 'task' : 'global';
  return {
    activeSurface,
    items,
    summary: formatRuntimeContextManifestSummary({ activeSurface, items, task }),
    userFacingSummary: formatRuntimeContextManifestUserSummary({ activeSurface, items, task }),
  };
}

export function buildRuntimeContextAssemblyPolicy(params: {
  manifest: RuntimeContextManifest;
  productPrinciplesIncluded?: boolean;
}): RuntimeContextAssemblyPolicy {
  const items = params.manifest.items;
  const has = (kind: RuntimeContextManifestItemKind, predicate?: (item: RuntimeContextManifestItem) => boolean) =>
    items.some((item) => item.kind === kind && (!predicate || predicate(item)));
  const taskBound = params.manifest.activeSurface === 'task';
  const productPrinciplesIncluded = params.productPrinciplesIncluded !== false;
  const requirements: RuntimeContextAssemblyRequirement[] = [
    {
      kind: 'product_principles',
      status: productPrinciplesIncluded ? 'included' : 'missing',
      reason: productPrinciplesIncluded
        ? '已包含产品级 Agent 执行原则。'
        : '缺少产品级 Agent 执行原则，不能开始任务执行。',
    },
    {
      kind: 'task_state',
      status: taskBound && has('task_state') ? 'included' : taskBound ? 'missing' : 'not_applicable',
      reason: taskBound
        ? has('task_state')
          ? '已包含结构化任务状态。'
          : '任务上下文缺少结构化任务状态。'
        : '全局上下文不绑定具体任务。',
    },
    {
      kind: 'task_md',
      status: taskBound
        ? has('task_file', (item) => item.label === 'Task.md' || item.id === 'Task.md')
          ? 'included'
          : 'missing'
        : 'not_applicable',
      reason: taskBound
        ? has('task_file', (item) => item.label === 'Task.md' || item.id === 'Task.md')
          ? '已包含 Task.md 主恢复文件。'
          : '任务执行前应读取或创建 Task.md 主恢复文件。'
        : '全局上下文不读取任务恢复文件。',
    },
    {
      kind: 'task_records',
      status: taskBound
        ? has('task_file', (item) => item.label.startsWith('Task Records/') || item.id.startsWith('Task Records/'))
          ? 'included'
          : 'optional'
        : 'not_applicable',
      reason: taskBound
        ? has('task_file', (item) => item.label.startsWith('Task Records/') || item.id.startsWith('Task Records/'))
          ? '已包含相关 Task Records。'
          : '没有相关 Task Records；仅在任务含糊、长期运行、刚清理或明确引用历史时必需。'
        : '全局上下文不读取任务记录。',
    },
    {
      kind: 'selected_file',
      status: has('selected_file') ? 'included' : taskBound ? 'optional' : 'not_applicable',
      reason: has('selected_file')
        ? '已包含当前选中文件上下文。'
        : taskBound
          ? '未选择文件；只有文件相关问题才必需。'
          : '全局上下文没有选中文件要求。',
    },
    {
      kind: 'structured_signals',
      status: taskBound && (
        has('source_context') ||
        has('artifact') ||
        has('timeline') ||
        has('process_template')
      ) ? 'included' : taskBound ? 'optional' : 'not_applicable',
      reason: taskBound
        ? has('source_context') || has('artifact') || has('timeline') || has('process_template')
          ? '已包含来源、产物、时间线或流程模板等结构化信号。'
          : '当前没有结构化信号；执行复杂或有风险任务前应补充相关上下文。'
        : '全局上下文不要求任务结构化信号。',
    },
    {
      kind: 'work_habits',
      status: has('work_habit') ? 'included' : 'optional',
      reason: has('work_habit')
        ? '已包含适用工作习惯。'
        : '没有匹配的工作习惯；可以继续，但不应假装已应用用户偏好。',
    },
  ];
  const missingRequired = requirements
    .filter((item) => item.status === 'missing')
    .map((item) => item.kind);

  return {
    activeSurface: params.manifest.activeSurface,
    canExecuteTaskWork: missingRequired.length === 0,
    requirements,
    missingRequired,
    summary: formatRuntimeContextAssemblyPolicySummary(missingRequired),
  };
}

export function formatRuntimeContextManifestForStep(manifest: RuntimeContextManifest): string {
  return [
    manifest.summary,
    ...manifest.items.map((item) => [
      `${item.kind}:${item.id}:${item.label}:content=${item.contentIncluded ? 'yes' : 'no'}`,
      item.inclusionDecision ? `include=${item.inclusionDecision}` : null,
      item.inclusionReason ? `reason=${item.inclusionReason}` : null,
      item.note ? `note=${item.note}` : null,
    ].filter(Boolean).join(':')),
  ].join('\n');
}

function formatRuntimeContextManifestSummary(params: {
  activeSurface: RuntimeContextManifest['activeSurface'];
  items: RuntimeContextManifestItem[];
  task: RuntimeContextManifestTask | null;
}): string {
  const count = (kind: RuntimeContextManifestItemKind) =>
    params.items.filter((item) => item.kind === kind).length;

  return [
    'Runtime context manifest',
    `surface=${params.activeSurface}`,
    params.task ? `task=${params.task.title}` : null,
    `items=${params.items.length}`,
    `sources=${count('source_context')}`,
    `artifacts=${count('artifact')}`,
    `files=${count('task_file') + count('selected_file')}`,
    `timeline=${count('timeline')}`,
    `habits=${count('work_habit')}`,
    count('capability') ? `capabilities=${count('capability')}` : null,
  ].filter(Boolean).join(' / ');
}

function formatRuntimeContextAssemblyPolicySummary(
  missingRequired: RuntimeContextAssemblyRequirementKind[],
): string {
  if (missingRequired.length === 0) {
    return 'Runtime context assembly ready.';
  }
  return `Runtime context assembly missing required inputs: ${missingRequired.join(',')}.`;
}

function formatRuntimeContextManifestUserSummary(params: {
  activeSurface: RuntimeContextManifest['activeSurface'];
  items: RuntimeContextManifestItem[];
  task: RuntimeContextManifestTask | null;
}): string {
  if (params.activeSurface === 'global') {
    return '全局上下文：不会读取具体任务文件；可以捕获新任务或讨论方向。';
  }
  const count = (kind: RuntimeContextManifestItemKind) =>
    params.items.filter((item) => item.kind === kind).length;
  const parts = [
    '任务状态',
    count('selected_file') ? '当前选中文件' : null,
    count('source_context') ? `${count('source_context')} 个来源` : null,
    count('artifact') ? `${count('artifact')} 个产物` : null,
    count('timeline') ? '最近记录' : null,
    count('work_habit') ? '适用工作习惯' : null,
    count('capability') ? '运行能力状态' : null,
  ].filter(Boolean);

  return `当前会读取：${parts.join('、')}。`;
}
