export type RuntimeEntrypointKind =
  | 'provider_visible_execution'
  | 'provider_visible_planning'
  | 'provider_visible_assistance'
  | 'hidden_local_execution'
  | 'product_configuration'
  | 'preference_memory'
  | 'method_library'
  | 'capability_probe'
  | 'execution_resume'
  | 'decision_resume'
  | 'decision_action'
  | 'task_capture'
  | 'task_state_transition'
  | 'durable_write'
  | 'context_transition';

export type RuntimeEntrypointGate =
  | 'simplicity_check'
  | 'runtime_action'
  | 'runtime_context_assembly'
  | 'task_memory_coverage'
  | 'task_memory_guidance'
  | 'runtime_handoff'
  | 'pre_step'
  | 'post_step'
  | 'subtask_start'
  | 'subtask_draft'
  | 'task_mutation'
  | 'task_completion'
  | 'project_verification'
  | 'decision_action'
  | 'checkpoint_eligibility'
  | 'panel_event_allowlist'
  | 'product_config_boundary'
  | 'preference_boundary'
  | 'method_library_boundary'
  | 'capability_probe_boundary';

export type RuntimeEntrypointCoverage = {
  id: string;
  owner: string;
  kind: RuntimeEntrypointKind;
  description: string;
  requiredGates: RuntimeEntrypointGate[];
  coveredGates: RuntimeEntrypointGate[];
  notes?: string;
};

export type RuntimeEntrypointCoverageIssue = {
  entrypointId: string;
  missingGates: RuntimeEntrypointGate[];
};

export type RuntimeEntrypointPolicyIssue = {
  entrypointId: string;
  kind: RuntimeEntrypointKind;
  missingRequiredGates: RuntimeEntrypointGate[];
};

export const RUNTIME_ENTRYPOINT_REQUIRED_GATES_BY_KIND: Record<
  RuntimeEntrypointKind,
  RuntimeEntrypointGate[]
> = {
  provider_visible_execution: [
    'simplicity_check',
    'runtime_action',
    'runtime_context_assembly',
    'task_memory_coverage',
    'task_memory_guidance',
    'pre_step',
    'subtask_start',
    'post_step',
  ],
  provider_visible_planning: [
    'simplicity_check',
    'runtime_context_assembly',
    'task_memory_guidance',
    'subtask_draft',
  ],
  provider_visible_assistance: [
    'simplicity_check',
    'runtime_context_assembly',
  ],
  hidden_local_execution: [
    'simplicity_check',
    'runtime_action',
    'task_memory_coverage',
    'task_memory_guidance',
    'pre_step',
    'subtask_start',
    'post_step',
  ],
  product_configuration: [
    'simplicity_check',
    'product_config_boundary',
  ],
  preference_memory: [
    'simplicity_check',
    'preference_boundary',
  ],
  method_library: [
    'simplicity_check',
    'method_library_boundary',
  ],
  capability_probe: [
    'simplicity_check',
    'capability_probe_boundary',
  ],
  execution_resume: [
    'simplicity_check',
    'runtime_action',
    'runtime_handoff',
    'task_memory_guidance',
    'pre_step',
    'subtask_start',
    'checkpoint_eligibility',
  ],
  decision_resume: [
    'simplicity_check',
    'decision_action',
    'task_memory_guidance',
    'pre_step',
    'post_step',
    'subtask_start',
    'checkpoint_eligibility',
  ],
  decision_action: [
    'simplicity_check',
    'decision_action',
    'task_memory_guidance',
    'pre_step',
    'post_step',
  ],
  task_capture: [
    'simplicity_check',
    'runtime_action',
    'task_memory_guidance',
    'pre_step',
  ],
  task_state_transition: [
    'simplicity_check',
    'runtime_action',
    'pre_step',
  ],
  durable_write: [
    'simplicity_check',
    'task_mutation',
    'pre_step',
  ],
  context_transition: [
    'simplicity_check',
    'runtime_action',
    'runtime_handoff',
    'task_memory_coverage',
    'task_memory_guidance',
  ],
};

export const RUNTIME_ENTRYPOINT_COVERAGE: RuntimeEntrypointCoverage[] = [
  {
    id: 'ai.taskChat',
    owner: 'IPC ai:chat',
    kind: 'provider_visible_assistance',
    description: 'Provider-visible read-only task or global chat assistance.',
    requiredGates: [
      'simplicity_check',
      'runtime_context_assembly',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_context_assembly',
    ],
    notes: 'Global assistance includes product principles. Task-bound assistance must load persisted task detail before model exposure and stays read-only.',
  },
  {
    id: 'run.trigger',
    owner: 'RunService.trigger',
    kind: 'provider_visible_execution',
    description: 'Ordinary text or Agent run execution for a task.',
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_context_assembly',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_context_assembly',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
  },
  {
    id: 'run.triggerCodeAgent',
    owner: 'CodeAgentRunService.trigger',
    kind: 'provider_visible_execution',
    description: 'Code Agent execution, including model-producer mode when enabled.',
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_context_assembly',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_context_assembly',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
  },
  {
    id: 'run.triggerOperatorStarted',
    owner: 'OperatorStartedRunService.trigger',
    kind: 'hidden_local_execution',
    description: 'Operator-started local/browser QA run that records evidence without provider-visible model context.',
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    notes: 'No runtime_context_assembly gate is required while providerCall=no and modelExposure=hidden.',
  },
  {
    id: 'run.continuePaused',
    owner: 'RunService.continuePausedRun',
    kind: 'execution_resume',
    description: 'Resume a paused run from a checkpoint.',
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_handoff',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'checkpoint_eligibility',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_handoff',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'checkpoint_eligibility',
    ],
  },
  {
    id: 'decision.approvedCheckpointResume',
    owner: 'DecisionService.act',
    kind: 'decision_resume',
    description: 'Approve a checkpoint Decision and resume paused tool, browser, or patch-promotion execution.',
    requiredGates: [
      'simplicity_check',
      'decision_action',
      'task_memory_guidance',
      'pre_step',
      'post_step',
      'subtask_start',
      'checkpoint_eligibility',
    ],
    coveredGates: [
      'simplicity_check',
      'decision_action',
      'task_memory_guidance',
      'pre_step',
      'post_step',
      'subtask_start',
      'checkpoint_eligibility',
    ],
  },
  {
    id: 'task.capture',
    owner: 'TasksPage / RightPanel task capture',
    kind: 'task_capture',
    description: 'Create a retained task from explicit user input or confirmed panel capture.',
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'task_memory_guidance',
      'pre_step',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'task_memory_guidance',
      'pre_step',
    ],
  },
  {
    id: 'task.transitionToRunning',
    owner: 'TaskService.transition / transitionIfAllowed',
    kind: 'task_state_transition',
    description: 'Move a task into running state outside a RunService-created execution.',
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'task_memory_coverage',
      'pre_step',
      'subtask_start',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'task_memory_coverage',
      'pre_step',
      'subtask_start',
    ],
  },
  {
    id: 'task.completionTransition',
    owner: 'TaskService.transition / transitionIfAllowed',
    kind: 'task_state_transition',
    description: 'Move a task into completed state.',
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'task_completion',
      'project_verification',
      'pre_step',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'task_completion',
      'project_verification',
      'pre_step',
    ],
  },
  {
    id: 'decision.action',
    owner: 'DecisionService.act / DecisionsPage',
    kind: 'decision_action',
    description: 'Approve, defer, or cancel a retained Decision without checkpoint resume.',
    requiredGates: [
      'simplicity_check',
      'decision_action',
      'task_memory_guidance',
      'pre_step',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'decision_action',
      'task_memory_guidance',
      'pre_step',
      'post_step',
    ],
  },
  {
    id: 'panel.timelineEventWrite',
    owner: 'TaskService.recordTimelineEvent',
    kind: 'durable_write',
    description: 'Append retained panel.* task dynamic events for audit/replay.',
    requiredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'panel_event_allowlist',
    ],
    coveredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'panel_event_allowlist',
    ],
  },
  {
    id: 'project.decompositionDraft',
    owner: 'IPC ai:decomposeProject',
    kind: 'provider_visible_planning',
    description: 'Generate a provider-visible project decomposition draft without creating child tasks.',
    requiredGates: [
      'simplicity_check',
      'runtime_context_assembly',
      'task_memory_guidance',
      'subtask_draft',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_context_assembly',
      'task_memory_guidance',
      'subtask_draft',
    ],
    notes: 'Draft generation reads task state, key sources, recent timeline, work habits, and Agent principles, then validates both existing children and proposed child drafts before returning JSON. Durable creation remains behind project.decompositionConfirm.',
  },
  {
    id: 'project.decompositionConfirm',
    owner: 'TasksPage project decomposition confirmation',
    kind: 'durable_write',
    description: 'Confirm generated project children, dependencies, criteria, records, and parent updates.',
    requiredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'post_step',
      'subtask_start',
      'panel_event_allowlist',
    ],
    coveredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'post_step',
      'subtask_start',
      'panel_event_allowlist',
    ],
  },
  {
    id: 'task.fileAndArtifactWrites',
    owner: 'TasksPage / RightPanel / IPC taskFile/artifact/source handlers',
    kind: 'durable_write',
    description: 'Create, update, move, archive, or delete task-bound files, source contexts, artifacts, criteria, blockers, dependencies, and process bindings.',
    requiredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'post_step',
    ],
  },
  {
    id: 'task.hierarchyMaintenance',
    owner: 'TaskService.applySafeHierarchyRepairs / applyHierarchyManualResolution',
    kind: 'durable_write',
    description: 'Repair or manually resolve persisted parent/child task hierarchy inconsistencies.',
    requiredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
    ],
    coveredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
    ],
    notes: 'Read-only hierarchy diagnostics are exempt; only safe repair and explicit manual resolution writers are registered here.',
  },
  {
    id: 'settings.aiRuntimeConfig',
    owner: 'IPC settings:setAiConfig / AiConfigService.setConfig',
    kind: 'product_configuration',
    description: 'Persist AI provider/model/feature-flag configuration and start or stop scheduler behavior.',
    requiredGates: [
      'simplicity_check',
      'product_config_boundary',
    ],
    coveredGates: [
      'simplicity_check',
      'product_config_boundary',
    ],
    notes: 'Read-only status and sandbox probes are exempt. The write path is explicit settings IPC and emits settings.changed after the config and scheduler state settle.',
  },
  {
    id: 'settings.sandboxBackendProbe',
    owner: 'IPC settings:probeSandboxBackend',
    kind: 'capability_probe',
    description: 'Probe local sandbox backend readiness without starting task execution or mutating task state.',
    requiredGates: [
      'simplicity_check',
      'capability_probe_boundary',
    ],
    coveredGates: [
      'simplicity_check',
      'capability_probe_boundary',
    ],
    notes: 'The probe returns backend status and producer readiness through explicit settings IPC; it does not start runs, mutate tasks, or persist scheduler decisions.',
  },
  {
    id: 'workHabit.preferenceMemory',
    owner: 'WorkHabitService',
    kind: 'preference_memory',
    description: 'Create, propose, update, resolve, delete, import, or apply cross-task Work Habit memory.',
    requiredGates: [
      'simplicity_check',
      'preference_boundary',
    ],
    coveredGates: [
      'simplicity_check',
      'preference_boundary',
    ],
    notes: 'Work Habit rules keep proposals pending by default, normalize candidate routing, preserve the local privacy boundary, and stay separate from task files.',
  },
  {
    id: 'processTemplate.libraryWrites',
    owner: 'TaskService process template library methods',
    kind: 'method_library',
    description: 'Create, update, or archive reusable process templates that can influence future runs and decisions.',
    requiredGates: [
      'simplicity_check',
      'method_library_boundary',
    ],
    coveredGates: [
      'simplicity_check',
      'method_library_boundary',
    ],
    notes: 'Applying or removing a process template binding on a task remains a task mutation; this entrypoint covers library-level template writes only.',
  },
  {
    id: 'agent.toolDurableWrites',
    owner: 'AgentToolRegistry task/source/artifact tools',
    kind: 'durable_write',
    description: 'Agent tool writes for task records, Task.md guidance, source context, and artifacts.',
    requiredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'post_step',
    ],
  },
  {
    id: 'context.clearOrSwitch',
    owner: 'RightPanel / RuntimeHandoff',
    kind: 'context_transition',
    description: 'Refresh, clear, leave, or switch task chat context.',
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_handoff',
      'task_memory_coverage',
      'task_memory_guidance',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_handoff',
      'task_memory_coverage',
      'task_memory_guidance',
    ],
  },
];

export function findRuntimeEntrypointCoverageIssues(
  entries: RuntimeEntrypointCoverage[] = RUNTIME_ENTRYPOINT_COVERAGE,
): RuntimeEntrypointCoverageIssue[] {
  return entries
    .map((entry) => ({
      entrypointId: entry.id,
      missingGates: entry.requiredGates.filter((gate) => !entry.coveredGates.includes(gate)),
    }))
    .filter((issue) => issue.missingGates.length > 0);
}

export function requiredRuntimeEntrypointGatesForKind(
  kind: RuntimeEntrypointKind,
): RuntimeEntrypointGate[] {
  return RUNTIME_ENTRYPOINT_REQUIRED_GATES_BY_KIND[kind];
}

export function findRuntimeEntrypointPolicyIssues(
  entries: RuntimeEntrypointCoverage[] = RUNTIME_ENTRYPOINT_COVERAGE,
): RuntimeEntrypointPolicyIssue[] {
  return entries
    .map((entry) => {
      const baseline = requiredRuntimeEntrypointGatesForKind(entry.kind);
      return {
        entrypointId: entry.id,
        kind: entry.kind,
        missingRequiredGates: baseline.filter((gate) => !entry.requiredGates.includes(gate)),
      };
    })
    .filter((issue) => issue.missingRequiredGates.length > 0);
}

export function runtimeEntrypointsByKind(
  kind: RuntimeEntrypointKind,
  entries: RuntimeEntrypointCoverage[] = RUNTIME_ENTRYPOINT_COVERAGE,
): RuntimeEntrypointCoverage[] {
  return entries.filter((entry) => entry.kind === kind);
}
