import type { MemorySurfaceWritePolicy } from './memory-surface-policy.js';
import type { RuntimeSurfaceKind } from './runtime-surface-routing.js';

export type MemorySurfaceWriteEntrypointOwner =
  | 'TasksPage'
  | 'RightPanel'
  | 'TaskService'
  | 'DecisionService'
  | 'AgentToolRegistry'
  | 'RunService'
  | 'ArtifactWriter'
  | 'WorkHabitService';

export type MemorySurfaceWriteEntrypointKind =
  | 'renderer_file_action'
  | 'renderer_memory_action'
  | 'renderer_artifact_action'
  | 'service_boundary'
  | 'agent_tool'
  | 'run_output'
  | 'evidence_writer'
  | 'decision_boundary'
  | 'preference_boundary';

export type MemorySurfaceGuard =
  | 'runtime_surface_routing'
  | 'canonical_write_validation'
  | 'task_mutation'
  | 'pre_step'
  | 'post_step'
  | 'task_md_update_need'
  | 'task_record_worthiness'
  | 'task_memory_write_apply_plan'
  | 'reserved_task_memory_path_block'
  | 'source_quality_metadata'
  | 'artifact_writer'
  | 'decision_action'
  | 'work_habit_proposal'
  | 'run_step_recovery_guidance'
  | 'simplicity_check';

export type MemorySurfaceWriteEntrypoint = {
  id: string;
  owner: MemorySurfaceWriteEntrypointOwner;
  kind: MemorySurfaceWriteEntrypointKind;
  ipcChannels?: string[];
  surfaces: RuntimeSurfaceKind[];
  writePolicies: MemorySurfaceWritePolicy[];
  guards: MemorySurfaceGuard[];
  note: string;
};

export const MEMORY_SURFACE_WRITE_ENTRYPOINTS: MemorySurfaceWriteEntrypoint[] = [
  {
    id: 'tasks.task_md.direct_save',
    owner: 'TasksPage',
    kind: 'renderer_memory_action',
    surfaces: ['task_state'],
    writePolicies: ['dedicated_evaluator'],
    guards: ['task_md_update_need', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Direct Task.md edits keep the primary recovery memory behind TaskMdUpdateNeedEvaluation.',
  },
  {
    id: 'tasks.task_record.manual_create',
    owner: 'TasksPage',
    kind: 'renderer_memory_action',
    surfaces: ['task_record'],
    writePolicies: ['dedicated_evaluator'],
    guards: ['task_record_worthiness', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Manual Task Record creation must prove recovery value before writing under Task Records.',
  },
  {
    id: 'tasks.task_file.create_update_delete',
    owner: 'TasksPage',
    kind: 'renderer_file_action',
    surfaces: ['task_file'],
    writePolicies: ['ordinary_file_writer'],
    guards: ['canonical_write_validation', 'reserved_task_memory_path_block', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Ordinary file actions cannot create reserved Task.md or Task Records memory paths.',
  },
  {
    id: 'tasks.source_context.create_update_archive',
    owner: 'TasksPage',
    kind: 'renderer_file_action',
    surfaces: ['source_material', 'ai_output'],
    writePolicies: ['explicit_source_capture', 'generated_output_writer'],
    guards: ['runtime_surface_routing', 'canonical_write_validation', 'source_quality_metadata', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Source-context actions use explicit source roles and quality metadata when known.',
  },
  {
    id: 'tasks.artifact.create_update_delete',
    owner: 'TasksPage',
    kind: 'renderer_artifact_action',
    surfaces: ['artifact'],
    writePolicies: ['artifact_writer'],
    guards: ['canonical_write_validation', 'artifact_writer', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Artifacts require explicit artifact creation or artifact metadata; paths alone are not enough.',
  },
  {
    id: 'right_panel.context_refresh_record',
    owner: 'RightPanel',
    kind: 'renderer_memory_action',
    surfaces: ['task_record'],
    writePolicies: ['dedicated_evaluator'],
    guards: ['task_record_worthiness', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Context refresh writes only record-worthy handoff or archive content.',
  },
  {
    id: 'right_panel.phase_closeout_record',
    owner: 'RightPanel',
    kind: 'renderer_memory_action',
    surfaces: ['task_record'],
    writePolicies: ['dedicated_evaluator'],
    guards: ['task_record_worthiness', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Phase closeout writes recovery records before clearing or handing off context.',
  },
  {
    id: 'right_panel.task_md_reference',
    owner: 'RightPanel',
    kind: 'renderer_memory_action',
    surfaces: ['task_state'],
    writePolicies: ['dedicated_evaluator'],
    guards: ['task_md_update_need', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Important file references update Task.md only through the dedicated Task.md evaluator.',
  },
  {
    id: 'right_panel.task_memory_write_proposal',
    owner: 'RightPanel',
    kind: 'renderer_memory_action',
    surfaces: ['task_state', 'task_record'],
    writePolicies: ['dedicated_evaluator'],
    guards: ['task_memory_write_apply_plan', 'task_md_update_need', 'task_record_worthiness', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Pending task-memory guidance is applied through the shared write proposal plan after confirmation.',
  },
  {
    id: 'right_panel.task_file_proposal',
    owner: 'RightPanel',
    kind: 'renderer_file_action',
    surfaces: ['task_file'],
    writePolicies: ['ordinary_file_writer'],
    guards: ['runtime_surface_routing', 'canonical_write_validation', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Task file proposals use routing before writing ordinary task files.',
  },
  {
    id: 'task_service.task_file_boundary',
    owner: 'TaskService',
    kind: 'service_boundary',
    ipcChannels: [
      'taskFile:create',
      'taskFile:delete',
      'taskFile:update',
    ],
    surfaces: ['task_state', 'task_record', 'task_file'],
    writePolicies: ['dedicated_evaluator', 'ordinary_file_writer'],
    guards: ['runtime_surface_routing', 'canonical_write_validation', 'task_mutation', 'reserved_task_memory_path_block', 'simplicity_check'],
    note: 'Main-process task-file writes remain guarded even when renderer callers already checked the action.',
  },
  {
    id: 'task_service.source_context_boundary',
    owner: 'TaskService',
    kind: 'service_boundary',
    ipcChannels: [
      'sourceContext:archive',
      'sourceContext:create',
      'sourceContext:update',
    ],
    surfaces: ['source_material', 'ai_output'],
    writePolicies: ['explicit_source_capture', 'generated_output_writer'],
    guards: ['runtime_surface_routing', 'canonical_write_validation', 'source_quality_metadata', 'task_mutation', 'simplicity_check'],
    note: 'Source-context persistence keeps explicit source roles and quality metadata at the service boundary.',
  },
  {
    id: 'task_service.manual_artifact_boundary',
    owner: 'TaskService',
    kind: 'service_boundary',
    ipcChannels: [
      'artifact:createManual',
      'artifact:delete',
      'artifact:update',
    ],
    surfaces: ['artifact'],
    writePolicies: ['artifact_writer'],
    guards: ['canonical_write_validation', 'artifact_writer', 'task_mutation', 'simplicity_check'],
    note: 'Manual artifact persistence cannot be reached through ordinary task-file classification.',
  },
  {
    id: 'agent_tool.source_context_create',
    owner: 'AgentToolRegistry',
    kind: 'agent_tool',
    surfaces: ['source_material', 'ai_output'],
    writePolicies: ['explicit_source_capture', 'generated_output_writer'],
    guards: ['runtime_surface_routing', 'canonical_write_validation', 'source_quality_metadata', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Agent-created source contexts must declare source role and quality signals instead of relying on title guesses.',
  },
  {
    id: 'agent_tool.artifact_create_note',
    owner: 'AgentToolRegistry',
    kind: 'agent_tool',
    surfaces: ['artifact'],
    writePolicies: ['artifact_writer'],
    guards: ['canonical_write_validation', 'artifact_writer', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Agent artifact notes write to the artifact surface and only recommend Task.md references through guidance.',
  },
  {
    id: 'run.output_artifact',
    owner: 'RunService',
    kind: 'run_output',
    surfaces: ['artifact', 'run_step'],
    writePolicies: ['artifact_writer', 'run_step_writer'],
    guards: ['canonical_write_validation', 'artifact_writer', 'run_step_recovery_guidance', 'post_step', 'simplicity_check'],
    note: 'Run output stores the generated output artifact and records recovery guidance as run-step memory.',
  },
  {
    id: 'evidence.sandbox_or_browser_artifact',
    owner: 'ArtifactWriter',
    kind: 'evidence_writer',
    surfaces: ['artifact', 'run_step'],
    writePolicies: ['artifact_writer', 'run_step_writer'],
    guards: ['canonical_write_validation', 'artifact_writer', 'run_step_recovery_guidance', 'post_step', 'simplicity_check'],
    note: 'Patch and browser evidence persist as artifacts, with recovery guidance kept as auditable run-step memory.',
  },
  {
    id: 'decision.service.create_or_act',
    owner: 'DecisionService',
    kind: 'decision_boundary',
    ipcChannels: [
      'decision:act',
      'decision:create',
    ],
    surfaces: ['decision'],
    writePolicies: ['decision_service'],
    guards: ['canonical_write_validation', 'decision_action', 'pre_step', 'post_step', 'simplicity_check'],
    note: 'Decision creation and actions stay in the judgment boundary instead of being folded into task files.',
  },
  {
    id: 'work_habit.service.proposal',
    owner: 'WorkHabitService',
    kind: 'preference_boundary',
    ipcChannels: [
      'workHabit:createManual',
      'workHabit:delete',
      'workHabit:importLegacy',
      'workHabit:propose',
      'workHabit:recordApplications',
      'workHabit:recordCompletionOverride',
      'workHabit:recordSopTemplate',
      'workHabit:resolveConflict',
      'workHabit:update',
    ],
    surfaces: ['work_habit'],
    writePolicies: ['work_habit_proposal'],
    guards: ['work_habit_proposal', 'canonical_write_validation', 'simplicity_check'],
    note: 'Cross-task rules are proposed and confirmed separately from single-task memory.',
  },
];

export function memorySurfaceWriteEntrypoints(): MemorySurfaceWriteEntrypoint[] {
  return MEMORY_SURFACE_WRITE_ENTRYPOINTS.map((entrypoint) => ({
    ...entrypoint,
    ipcChannels: entrypoint.ipcChannels ? [...entrypoint.ipcChannels] : undefined,
    surfaces: [...entrypoint.surfaces],
    writePolicies: [...entrypoint.writePolicies],
    guards: [...entrypoint.guards],
  }));
}
