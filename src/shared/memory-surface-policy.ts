import type {
  RuntimeFileSurfaceKind,
  RuntimeSurfaceCandidate,
  RuntimeSurfaceDecision,
  RuntimeSurfaceKind,
} from './runtime-surface-routing.js';
import { classifyRuntimeFileSurface } from './runtime-surface-routing.js';

export type MemorySurfaceCategory =
  | 'recovery_memory'
  | 'evidence_source'
  | 'generated_output'
  | 'user_artifact'
  | 'supporting_file'
  | 'decision_boundary'
  | 'execution_event'
  | 'cross_task_rule'
  | 'discussion_only';

export type MemorySurfaceWritePolicy =
  | 'dedicated_evaluator'
  | 'explicit_source_capture'
  | 'artifact_writer'
  | 'ordinary_file_writer'
  | 'decision_service'
  | 'run_step_writer'
  | 'work_habit_proposal'
  | 'do_not_persist';

export type MemorySurfaceReusePolicy =
  | 'read_for_task_resume'
  | 'read_as_evidence_with_quality_gate'
  | 'read_as_generated_context'
  | 'read_as_output_reference'
  | 'read_when_selected_or_relevant'
  | 'block_until_resolved'
  | 'read_for_execution_replay'
  | 'read_when_applicable'
  | 'do_not_reuse';

export type MemorySurfacePolicy = {
  surface: RuntimeSurfaceKind;
  fileClass: RuntimeFileSurfaceKind | null;
  category: MemorySurfaceCategory;
  writePolicy: MemorySurfaceWritePolicy;
  reusePolicy: MemorySurfaceReusePolicy;
  requiresTaskContext: boolean;
  requiresExplicitCreation: boolean;
  requiresQualityMetadata: boolean;
  label: string;
  reason: string;
};

const SURFACE_POLICY: Record<RuntimeSurfaceKind, Omit<MemorySurfacePolicy, 'fileClass' | 'surface'>> = {
  task_state: {
    category: 'recovery_memory',
    writePolicy: 'dedicated_evaluator',
    reusePolicy: 'read_for_task_resume',
    requiresTaskContext: true,
    requiresExplicitCreation: true,
    requiresQualityMetadata: false,
    label: '任务说明',
    reason: 'Task.md 是当前任务恢复、目标、进度和下一步的主记忆面。',
  },
  task_record: {
    category: 'recovery_memory',
    writePolicy: 'dedicated_evaluator',
    reusePolicy: 'read_for_task_resume',
    requiresTaskContext: true,
    requiresExplicitCreation: true,
    requiresQualityMetadata: false,
    label: '任务记录',
    reason: 'Task Records 只保存有恢复价值的交接、阶段结论、纠正、决策依据或失败复盘。',
  },
  source_material: {
    category: 'evidence_source',
    writePolicy: 'explicit_source_capture',
    reusePolicy: 'read_as_evidence_with_quality_gate',
    requiresTaskContext: true,
    requiresExplicitCreation: true,
    requiresQualityMetadata: true,
    label: '来源材料',
    reason: '来源材料是外部或用户提供的证据，读取前需要时效、可信度、重复和敏感信息判断。',
  },
  ai_output: {
    category: 'generated_output',
    writePolicy: 'explicit_source_capture',
    reusePolicy: 'read_as_generated_context',
    requiresTaskContext: true,
    requiresExplicitCreation: true,
    requiresQualityMetadata: false,
    label: 'AI 产出',
    reason: 'AI 产出可以作为生成上下文或恢复线索，但不是外部来源证据。',
  },
  artifact: {
    category: 'user_artifact',
    writePolicy: 'artifact_writer',
    reusePolicy: 'read_as_output_reference',
    requiresTaskContext: true,
    requiresExplicitCreation: true,
    requiresQualityMetadata: false,
    label: '产物',
    reason: '产物是任务执行输出，必须由 artifact 写入路径或显式 artifact 元数据创建。',
  },
  task_file: {
    category: 'supporting_file',
    writePolicy: 'ordinary_file_writer',
    reusePolicy: 'read_when_selected_or_relevant',
    requiresTaskContext: true,
    requiresExplicitCreation: false,
    requiresQualityMetadata: false,
    label: '任务文件',
    reason: '普通任务文件是支持材料，不因路径或标题自动升级为来源、产物或任务记录。',
  },
  decision: {
    category: 'decision_boundary',
    writePolicy: 'decision_service',
    reusePolicy: 'block_until_resolved',
    requiresTaskContext: false,
    requiresExplicitCreation: true,
    requiresQualityMetadata: false,
    label: '待拍板',
    reason: 'Decision 表示用户判断边界，AI 不能通过任务记忆或上下文清理绕过。',
  },
  run_step: {
    category: 'execution_event',
    writePolicy: 'run_step_writer',
    reusePolicy: 'read_for_execution_replay',
    requiresTaskContext: true,
    requiresExplicitCreation: true,
    requiresQualityMetadata: false,
    label: '执行事件',
    reason: 'Run step 是执行审计与恢复事件，不应写入 Task.md 或普通文件替代。',
  },
  work_habit: {
    category: 'cross_task_rule',
    writePolicy: 'work_habit_proposal',
    reusePolicy: 'read_when_applicable',
    requiresTaskContext: false,
    requiresExplicitCreation: true,
    requiresQualityMetadata: false,
    label: '工作习惯',
    reason: 'Work Habit 是跨任务规则或偏好，必须走提议确认，不能从单次任务事实直接沉淀。',
  },
  discussion: {
    category: 'discussion_only',
    writePolicy: 'do_not_persist',
    reusePolicy: 'do_not_reuse',
    requiresTaskContext: false,
    requiresExplicitCreation: false,
    requiresQualityMetadata: false,
    label: '讨论',
    reason: '探索性或泛化不足的信息保留在对话中，直到出现明确持久化边界。',
  },
};

export function policyForRuntimeSurface(
  surface: RuntimeSurfaceKind,
  fileClass: RuntimeFileSurfaceKind | null = null,
): MemorySurfacePolicy {
  return {
    surface,
    fileClass,
    ...SURFACE_POLICY[surface],
  };
}

export function classifyMemorySurfaceCandidate(
  candidate: RuntimeSurfaceCandidate,
): MemorySurfacePolicy & { runtimeSurface: RuntimeSurfaceDecision } {
  const runtimeSurface = classifyRuntimeFileSurface(candidate);
  return {
    ...policyForRuntimeSurface(runtimeSurface.surface, runtimeSurface.fileClass),
    runtimeSurface,
  };
}

export function memorySurfacePolicies(): MemorySurfacePolicy[] {
  return (Object.keys(SURFACE_POLICY) as RuntimeSurfaceKind[])
    .map((surface) => policyForRuntimeSurface(surface));
}
