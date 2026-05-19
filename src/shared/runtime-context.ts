import type { AgentWorkingContext } from './types/agent-execution.js';
import type { CapabilityRegistryEntry } from './capability-registry.js';
import type { RuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';
import { evaluateSelectedFileRelevance, type SelectedFileRelevanceReason } from './selected-file-relevance.js';
import {
  evaluateSourceFreshness,
  type SourceFreshnessDecision,
  type SourceFreshnessEvaluation,
  type SourceFreshnessReason,
} from './source-freshness-evaluator.js';
import {
  evaluateSourceMaterialQuality,
  type SourceMaterialQualityEvaluation,
  type SourceMaterialQualityReason,
} from './source-material-quality-evaluator.js';
import { retrieveTaskExecutionMemory, type TaskMemoryRetrievalResult } from './task-memory-retrieval.js';
import { isTaskMdPath, isTaskRecordPath } from './task-memory-path.js';
import type {
  SourceContextCredibility,
  SourceContextKind,
  SourceContextRole,
  SourceContextStatus,
} from './types/source-context.js';
import type { DecisionKind, DecisionScope } from './types/decision.js';
import type { TaskRiskLevel, TaskState } from './types/task.js';

export type RuntimeContextManifestItemKind =
  | 'task_state'
  | 'selected_file'
  | 'decision'
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
  inclusionReason?: SourceFreshnessReason | SourceMaterialQualityReason | SelectedFileRelevanceReason | null;
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
  memoryRetrieval?: RuntimeContextMemoryRetrievalSummary | null;
  summary: string;
  userFacingSummary: string;
};

export type RuntimeContextMemoryRetrievalSummary = {
  totalCount: number;
  includedCount: number;
  cautionCount: number;
  excludedCount: number;
  topResults: RuntimeContextMemoryRetrievalItem[];
};

export type RuntimeContextMemoryRetrievalItem = {
  id: string;
  kind: TaskMemoryRetrievalResult['entity']['entityType'];
  decision: TaskMemoryRetrievalResult['decision'];
  reasons: string[];
  score: number;
  title: string;
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
  nextStep?: string | null;
  riskLevel?: TaskRiskLevel | null;
  riskNote?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
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
  id?: string | null;
  taskId?: string | null;
  name?: string | null;
  updatedAt?: string | null;
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
  credibility?: SourceContextCredibility | null;
  isDuplicate?: boolean;
  containsSensitiveData?: boolean;
  title: string;
  updatedAt?: string | null;
  uri?: string | null;
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

function combineSourceInclusion(
  freshnessDecision: SourceFreshnessDecision,
  qualityDecision: SourceFreshnessDecision,
): SourceFreshnessDecision {
  if (freshnessDecision === 'exclude' || qualityDecision === 'exclude') return 'exclude';
  if (freshnessDecision === 'caution' || qualityDecision === 'caution') return 'caution';
  return 'include';
}

function sourceInclusionReason(
  freshness: SourceFreshnessEvaluation,
  quality: SourceMaterialQualityEvaluation,
): SourceFreshnessReason | SourceMaterialQualityReason {
  if (freshness.decision === 'exclude') return freshness.reason;
  if (quality.decision !== 'include') return quality.reason;
  return freshness.reason;
}

export function buildRuntimeContextManifest(params: {
  applicableWorkHabits?: string[];
  capabilities?: RuntimeCapabilitySnapshot | null;
  capabilityRegistry?: CapabilityRegistryEntry[] | null;
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
        const quality = evaluateSourceMaterialQuality({
          content: source.contentPreview,
          isKey: source.isKey,
          kind: source.kind,
          note: source.note,
          selected: source.selected,
          sourceRole: source.sourceRole,
          status: source.status,
          title: source.title,
          uri: source.uri,
          credibility: source.credibility,
          isDuplicate: source.isDuplicate,
          containsSensitiveData: source.containsSensitiveData,
        });
        const inclusionDecision = combineSourceInclusion(freshness.decision, quality.decision);
        const inclusionReason = sourceInclusionReason(freshness, quality);
        return {
          contentIncluded: Boolean(source.contentPreview) && inclusionDecision !== 'exclude',
          id: source.id ?? source.title,
          inclusionDecision,
          inclusionReason,
          kind: 'source_context' as const,
          label: source.title,
          note: [source.isKey ? 'key' : source.kind, freshness.reason, quality.reason].filter(Boolean).join(' / '),
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
      ...(workingContext.decisions ?? []).map((decision) => ({
        contentIncluded: Boolean(decision.contextPreview || decision.recommendationLabel || decision.recommendationReason),
        id: decision.id,
        kind: 'decision' as const,
        label: decision.title,
        note: [decision.status, decision.kind, decision.sourceLabel].filter(Boolean).join(' / '),
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
        const quality = evaluateSourceMaterialQuality({
          content: source.contentPreview,
          isKey: source.isKey,
          kind: source.kind,
          note: source.note,
          selected: source.selected,
          sourceRole: source.sourceRole,
          status: source.status,
          title: source.title,
          uri: source.uri,
          credibility: source.credibility,
          isDuplicate: source.isDuplicate,
          containsSensitiveData: source.containsSensitiveData,
        });
        const inclusionDecision = combineSourceInclusion(freshness.decision, quality.decision);
        const inclusionReason = sourceInclusionReason(freshness, quality);
        return {
          contentIncluded: Boolean(source.contentPreview) && inclusionDecision !== 'exclude',
          id: source.id,
          inclusionDecision,
          inclusionReason,
          kind: 'source_context' as const,
          label: source.title,
          note: [source.isKey ? 'key' : source.kind ?? null, freshness.reason, quality.reason].filter(Boolean).join(' / '),
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

  const memoryRetrieval = task
    ? summarizeRuntimeContextMemoryRetrieval(retrieveTaskExecutionMemory({
        currentTask: {
          id: task.id,
          title: task.title,
          summary: task.summary ?? null,
          state: task.state ?? 'captured',
          nextStep: task.nextStep ?? workingContext?.task.nextStep ?? null,
          waitingReason: null,
          riskLevel: task.riskLevel ?? workingContext?.task.riskLevel ?? 'none',
          riskNote: task.riskNote ?? workingContext?.task.riskNote ?? null,
          parentTaskId: null,
          childTaskIds: [],
          createdAt: task.createdAt ?? '',
          updatedAt: task.updatedAt ?? '',
        },
        artifacts: workingContext?.artifacts.map((artifact, index) => ({
          id: `artifact:${artifact.title}:${index}`,
          taskId: task.id,
          title: artifact.title,
          kind: artifact.kind === 'patch' || artifact.kind === 'browser_evidence' || artifact.kind === 'run_output'
            ? artifact.kind
            : 'note',
          sourceType: artifact.sourceType === 'manual' ? 'manual' : 'run',
          sourceId: artifact.title,
          content: artifact.contentPreview ?? '',
          createdAt: artifact.updatedAt,
          updatedAt: artifact.updatedAt,
        })) ?? [],
        blockers: workingContext?.blockers.map((blocker, index) => ({
          id: `blocker:${index}`,
          taskId: task.id,
          title: blocker.title,
          kind: 'other',
          detail: blocker.detail,
          owner: blocker.owner,
          responsibility: null,
          responsibilityLabel: null,
          sourceContextId: null,
          status: 'active',
          createdAt: '',
          updatedAt: '',
          resolvedAt: null,
        })) ?? [],
        dependencies: workingContext?.dependencies.map((dependency, index) => ({
          id: `dependency:${index}`,
          taskId: task.id,
          blockedByTaskId: dependency.title,
          blockedByTaskTitle: dependency.title,
          reason: dependency.detail,
          status: 'active',
          createdAt: '',
          updatedAt: '',
          resolvedAt: null,
        })) ?? [],
        decisions: (workingContext?.decisions ?? []).map((decision) => ({
          id: decision.id,
          taskId: task.id,
          title: decision.title,
          status: decision.status === 'approved'
            ? 'approved'
            : decision.status === 'deferred'
              ? 'deferred'
              : decision.status === 'cancelled'
                ? 'cancelled'
                : 'pending',
          scope: runtimeDecisionScope(decision.scope),
          kind: runtimeDecisionKind(decision.kind),
          sourceType: null,
          sourceId: null,
          sourceLabel: decision.sourceLabel,
          context: {
            whyNow: decision.contextPreview,
            impact: null,
            ifDeferred: null,
          },
          options: [],
          recommendation: decision.recommendationLabel || decision.recommendationReason
            ? {
                label: decision.recommendationLabel ?? decision.title,
                reason: decision.recommendationReason,
              }
            : null,
          createdAt: decision.updatedAt,
          updatedAt: decision.updatedAt,
        })) ?? [],
        processTemplates: workingContext?.processTemplates.map((template) => ({
          id: template.id,
          bindingId: template.id,
          taskId: task.id,
          title: template.title,
          summary: template.summary,
          content: template.summary ?? '',
          kind: template.kind === 'skill' || template.kind === 'workflow' || template.kind === 'sop' || template.kind === 'checklist'
            ? template.kind
            : 'workflow',
          tags: [],
          status: 'active',
          createdAt: '',
          updatedAt: '',
          archivedAt: null,
          bindingStatus: 'active',
          bindingNote: null,
          boundAt: '',
          bindingUpdatedAt: '',
          removedAt: null,
        })) ?? [],
        sourceContexts: runtimeSourceContextsForRetrieval({ taskId: task.id, workingContext, sourceContexts: params.sourceContexts }),
        taskFiles: runtimeTaskFilesForRetrieval({ taskId: task.id, workingContext, taskFiles: params.taskFiles }),
        timeline: workingContext?.recentTimeline.map((event, index) => ({
          id: `timeline:${event.type}:${event.createdAt}:${index}`,
          taskId: task.id,
          type: event.type,
          payload: event.summary,
          createdAt: event.createdAt,
        })) ?? [],
        workHabits: runtimeWorkHabitsForRetrieval(params.applicableWorkHabits ?? []),
        currentRunId: params.currentRunId,
        selectedFileIds: params.selectedFile?.path ? [params.selectedFile.path] : [],
      }))
    : null;

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
      note: [
        params.capabilities.summary,
        `selectedRuntime=${params.capabilities.executionRuntime.label}`,
        `runtimeKind=${params.capabilities.executionRuntime.kind}`,
        `runtimeExecutable=${params.capabilities.executionRuntime.executable ? 'yes' : 'no'}`,
        `runtimeReason=${params.capabilities.executionRuntime.reason}`,
      ].join(' / '),
    });
  }
  items.push(...capabilityBridgeItems(params.capabilityRegistry ?? []));

  const activeSurface = task ? 'task' : 'global';
  return {
    activeSurface,
    items,
    memoryRetrieval,
    summary: formatRuntimeContextManifestSummary({ activeSurface, items, task }),
    userFacingSummary: formatRuntimeContextManifestUserSummary({ activeSurface, items, task }),
  };
}

function capabilityBridgeItems(registry: CapabilityRegistryEntry[]): RuntimeContextManifestItem[] {
  const families: Array<CapabilityRegistryEntry['family']> = ['external_access', 'skill', 'mcp'];
  return families.flatMap((family) => {
    const entries = registry.filter((entry) => entry.family === family);
    if (!entries.length) return [];
    const availableCount = entries.filter((entry) => entry.status === 'available').length;
    const configuredCount = entries.filter((entry) => entry.configured).length;
    const modelVisibleCount = entries.filter((entry) => entry.visibility === 'model_visible').length;
    const policyGatedCount = entries.filter((entry) => entry.visibility === 'policy_gated').length;
    const blockedCount = entries.filter((entry) => entry.status !== 'available').length;
    const primary = entries[0]!;
    return [{
      contentIncluded: true,
      id: `capability:${family}`,
      kind: 'capability' as const,
      label: capabilityBridgeLabel(family),
      note: [
        `family=${family}`,
        `status=${primary.status}`,
        `configured=${configuredCount}`,
        `available=${availableCount}`,
        `blocked=${blockedCount}`,
        `modelVisible=${modelVisibleCount}`,
        `policyGated=${policyGatedCount}`,
        `access=${primary.access}`,
        `approval=${primary.requiresApproval ? 'required' : 'not_required'}`,
        `gate=${primary.requiredGate}`,
        primary.summary,
        primary.missingReason ? `missing=${primary.missingReason}` : null,
      ].filter(Boolean).join(' / '),
    }];
  });
}

function capabilityBridgeLabel(family: CapabilityRegistryEntry['family']): string {
  if (family === 'external_access') return 'External Access context bridge';
  if (family === 'skill') return 'Skills context bridge';
  if (family === 'mcp') return 'MCP context bridge';
  return 'Capability context bridge';
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
        ? has('task_file', (item) => isTaskMdPath(item.label) || isTaskMdPath(item.id))
          ? 'included'
          : 'missing'
        : 'not_applicable',
      reason: taskBound
        ? has('task_file', (item) => isTaskMdPath(item.label) || isTaskMdPath(item.id))
          ? '已包含 Task.md 主恢复文件。'
          : '任务执行前应读取或创建 Task.md 主恢复文件。'
        : '全局上下文不读取任务恢复文件。',
    },
    {
      kind: 'task_records',
      status: taskBound
        ? has('task_file', (item) => isTaskRecordPath(item.label) || isTaskRecordPath(item.id))
          ? 'included'
          : 'optional'
        : 'not_applicable',
      reason: taskBound
        ? has('task_file', (item) => isTaskRecordPath(item.label) || isTaskRecordPath(item.id))
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
        has('decision') ||
        has('source_context') ||
        has('artifact') ||
        has('timeline') ||
        has('process_template')
      ) ? 'included' : taskBound ? 'optional' : 'not_applicable',
      reason: taskBound
        ? has('decision') || has('source_context') || has('artifact') || has('timeline') || has('process_template')
          ? '已包含决策、来源、产物、时间线或流程模板等结构化信号。'
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
    manifest.memoryRetrieval
      ? `memory_retrieval:total=${manifest.memoryRetrieval.totalCount}:included=${manifest.memoryRetrieval.includedCount}:caution=${manifest.memoryRetrieval.cautionCount}:excluded=${manifest.memoryRetrieval.excludedCount}:top=${manifest.memoryRetrieval.topResults.map((item) => `${item.kind}/${item.id}/${item.decision}/${item.reasons.join('+')}`).join('|')}`
      : null,
    ...manifest.items.map((item) => [
      `${item.kind}:${item.id}:${item.label}:content=${item.contentIncluded ? 'yes' : 'no'}`,
      item.inclusionDecision ? `include=${item.inclusionDecision}` : null,
      item.inclusionReason ? `reason=${item.inclusionReason}` : null,
      item.note ? `note=${item.note}` : null,
    ].filter(Boolean).join(':')),
  ].filter(Boolean).join('\n');
}

function summarizeRuntimeContextMemoryRetrieval(
  results: TaskMemoryRetrievalResult[],
): RuntimeContextMemoryRetrievalSummary {
  return {
    totalCount: results.length,
    includedCount: results.filter((result) => result.decision === 'include').length,
    cautionCount: results.filter((result) => result.decision === 'caution').length,
    excludedCount: results.filter((result) => result.decision === 'exclude').length,
    topResults: results.slice(0, 8).map((result) => ({
      id: result.entity.id,
      kind: result.entity.entityType,
      decision: result.decision,
      reasons: result.reasons,
      score: result.score,
      title: result.entity.title,
    })),
  };
}

function runtimeTaskFilesForRetrieval(params: {
  taskId: string;
  workingContext: AgentWorkingContext | null;
  taskFiles?: RuntimeContextTaskFile[];
}) {
  const files = params.workingContext?.taskFiles ?? params.taskFiles ?? [];
  return files.map((file, index) => ({
    id: ('id' in file ? file.id : null) ?? file.path ?? `task_file:${index}`,
    taskId: ('taskId' in file ? file.taskId : null) ?? params.taskId,
    name: ('name' in file ? file.name : null) ?? file.path.split('/').pop() ?? file.path,
    path: file.path,
    kind: file.kind === 'folder' ? 'folder' as const : 'file' as const,
    content: file.contentPreview ?? '',
    createdAt: file.updatedAt ?? '',
    updatedAt: file.updatedAt ?? '',
  }));
}

function runtimeSourceContextsForRetrieval(params: {
  taskId: string;
  workingContext: AgentWorkingContext | null;
  sourceContexts?: RuntimeContextSourceContext[];
}) {
  const sources = params.workingContext?.sources ?? params.sourceContexts ?? [];
  return sources.map((source, index) => ({
    id: source.id ?? `source:${source.title}:${index}`,
    taskId: params.taskId,
    title: source.title,
    kind: runtimeSourceContextKind(source.kind),
    isKey: Boolean(source.isKey),
    uri: source.uri ?? null,
    content: source.contentPreview ?? null,
    note: source.note ?? null,
    status: source.status === 'archived' ? 'archived' as const : 'active' as const,
    capturedAt: source.capturedAt ?? undefined,
    runId: source.runId ?? null,
    batchId: null,
    sourceRole: source.sourceRole ?? undefined,
    credibility: source.credibility ?? null,
    isDuplicate: source.isDuplicate,
    containsSensitiveData: source.containsSensitiveData,
    createdAt: source.createdAt ?? '',
    updatedAt: source.updatedAt ?? '',
    archivedAt: source.status === 'archived' ? source.updatedAt ?? null : null,
  }));
}

function runtimeSourceContextKind(kind: string | null | undefined): SourceContextKind {
  if (
    kind === 'link' ||
    kind === 'doc' ||
    kind === 'issue' ||
    kind === 'pr' ||
    kind === 'website_list' ||
    kind === 'note'
  ) {
    return kind;
  }
  return 'note';
}

function runtimeDecisionScope(scope: string): DecisionScope {
  if (
    scope === 'task' ||
    scope === 'run' ||
    scope === 'agent' ||
    scope === 'external_access' ||
    scope === 'workspace' ||
    scope === 'system' ||
    scope === 'global'
  ) {
    return scope;
  }
  return 'task';
}

function runtimeDecisionKind(kind: string): DecisionKind {
  if (
    kind === 'direction_choice' ||
    kind === 'risk_approval' ||
    kind === 'external_write' ||
    kind === 'agent_resume' ||
    kind === 'completion_acceptance' ||
    kind === 'information_request' ||
    kind === 'policy_change'
  ) {
    return kind;
  }
  return 'direction_choice';
}

function runtimeWorkHabitsForRetrieval(habits: string[]) {
  return habits
    .map((habit) => habit.trim())
    .filter(Boolean)
    .map((habit, index) => ({
      id: `work_habit:${index}`,
      rule: habit,
      source: 'manual' as const,
      scope: 'global' as const,
      scopeLabel: 'global',
      status: 'confirmed' as const,
      examples: '',
      createdAt: '',
      lastAppliedAt: null,
      applicationCount: 0,
    }));
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
    count('decision') ? `decisions=${count('decision')}` : null,
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
    count('decision') ? `${count('decision')} 个判断事项` : null,
    count('selected_file') ? '当前选中文件' : null,
    count('source_context') ? `${count('source_context')} 个来源` : null,
    count('artifact') ? `${count('artifact')} 个产物` : null,
    count('timeline') ? '最近记录' : null,
    count('work_habit') ? '适用工作习惯' : null,
    count('capability') ? '运行能力状态' : null,
  ].filter(Boolean);

  return `当前会读取：${parts.join('、')}。`;
}
