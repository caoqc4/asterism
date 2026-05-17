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
  | 'decision_draft'
  | 'decision_write'
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
  | 'decision_draft_boundary'
  | 'decision_write_boundary'
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
  ipcChannels?: string[];
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
  decision_draft: [
    'simplicity_check',
    'runtime_context_assembly',
    'task_memory_guidance',
    'task_mutation',
    'pre_step',
    'decision_draft_boundary',
  ],
  decision_write: [
    'simplicity_check',
    'decision_write_boundary',
    'pre_step',
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
    ipcChannels: ['ai:chat'],
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
    ipcChannels: ['run:trigger'],
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
    ipcChannels: ['run:triggerCodeAgent'],
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
    ipcChannels: ['run:triggerOperatorStarted'],
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
    ipcChannels: ['run:continuePaused'],
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
    ipcChannels: ['decision:act'],
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
    id: 'decision.draft',
    owner: 'DecisionService.draft',
    kind: 'decision_draft',
    description: 'Generate a task-bound Decision draft, optionally with provider-visible process-template assistance.',
    ipcChannels: ['decision:draft'],
    requiredGates: [
      'simplicity_check',
      'runtime_context_assembly',
      'task_memory_guidance',
      'task_mutation',
      'pre_step',
      'decision_draft_boundary',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_context_assembly',
      'task_memory_guidance',
      'task_mutation',
      'pre_step',
      'decision_draft_boundary',
    ],
    notes: 'Drafting requires an existing task, selected/skipped process-template annotations now pass task_mutation, and Decision persistence remains behind decision.create.',
  },
  {
    id: 'decision.create',
    owner: 'DecisionService.create',
    kind: 'decision_write',
    description: 'Persist a new Decision in the judgment center without approving or executing it.',
    ipcChannels: ['decision:create'],
    requiredGates: [
      'simplicity_check',
      'decision_write_boundary',
      'pre_step',
    ],
    coveredGates: [
      'simplicity_check',
      'decision_write_boundary',
      'pre_step',
    ],
    notes: 'Task-scoped Decisions require an existing task; global Decisions remain allowed when their normalized scope is not task-bound.',
  },
  {
    id: 'task.capture',
    owner: 'TasksPage / RightPanel task capture',
    kind: 'task_capture',
    description: 'Create a retained task from explicit user input or confirmed panel capture.',
    ipcChannels: ['task:create'],
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
    ipcChannels: ['task:transition'],
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
    id: 'task.stateTransition',
    owner: 'TaskService.transition / transitionIfAllowed',
    kind: 'task_state_transition',
    description: 'Move a task through ordinary planned, waiting, or archived state transitions.',
    ipcChannels: ['task:transition'],
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'pre_step',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'pre_step',
    ],
    notes: 'Waiting transitions require a waiting reason; running and completed transitions are registered separately because they add target-readiness or completion/project verification.',
  },
  {
    id: 'task.completionTransition',
    owner: 'TaskService.transition / transitionIfAllowed',
    kind: 'task_state_transition',
    description: 'Move a task into completed state.',
    ipcChannels: ['task:transition'],
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
    ipcChannels: ['decision:act'],
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
    ipcChannels: ['task:recordTimelineEvent'],
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
    id: 'task.completionCheckRecord',
    owner: 'TaskService.recordCompletionCheck',
    kind: 'durable_write',
    description: 'Append a retained task completion-check event that can serve as task-memory evidence.',
    ipcChannels: ['task:recordCompletionCheck'],
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
    notes: 'Completion-check records are durable audit events and can count toward task completion memory coverage; completion state transition remains a separate task_completion gate.',
  },
  {
    id: 'project.decompositionDraft',
    owner: 'IPC ai:decomposeProject',
    kind: 'provider_visible_planning',
    description: 'Generate a provider-visible project decomposition draft without creating child tasks.',
    ipcChannels: ['ai:decomposeProject'],
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
    ipcChannels: [
      'artifact:createManual',
      'artifact:delete',
      'artifact:update',
      'blocker:create',
      'blocker:resolve',
      'blocker:update',
      'completionCriteria:create',
      'completionCriteria:reopen',
      'completionCriteria:satisfy',
      'completionCriteria:update',
      'processTemplate:apply',
      'processTemplate:remove',
      'sourceContext:archive',
      'sourceContext:create',
      'sourceContext:update',
      'taskDependency:create',
      'taskDependency:resolve',
      'taskDependency:update',
      'taskFile:create',
      'taskFile:delete',
      'taskFile:update',
    ],
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
    notes: 'This is the service/IPC minimum for task-bound durable resource writes. Renderer panel flows and Agent tool writes may add post_step verification when they have durable-change recovery context.',
  },
  {
    id: 'externalAccess.sourceIngestionCommit',
    owner: 'ExternalAccessSourceIngestionService.commit',
    kind: 'durable_write',
    description: 'Confirmed External Access evidence ingestion into task-bound Source Context memory.',
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
    notes: 'Connectors only produce ConnectorSourceIngestionPlan previews. Confirmed commits reuse TaskService.createSourceContext so task existence, mutation boundary, canonical source metadata, and timeline recording stay centralized.',
  },
  {
    id: 'task.metadataUpdate',
    owner: 'TaskService.update',
    kind: 'durable_write',
    description: 'Update retained task metadata such as title, summary, risk, hierarchy fields, or next-step state outside task transitions.',
    ipcChannels: ['task:update'],
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
    notes: 'Task creation, state transitions, hierarchy maintenance, and file/artifact writes remain separate entrypoints because they add different runtime responsibilities.',
  },
  {
    id: 'task.hierarchyMaintenance',
    owner: 'TaskService.applySafeHierarchyRepairs / applyHierarchyManualResolution',
    kind: 'durable_write',
    description: 'Repair or manually resolve persisted parent/child task hierarchy inconsistencies.',
    ipcChannels: [
      'task:applyHierarchyManualResolution',
      'task:applySafeHierarchyRepairs',
    ],
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
    ipcChannels: ['settings:setAiConfig'],
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
    ipcChannels: ['settings:probeSandboxBackend'],
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
    id: 'externalAccess.gmailOAuthCredential',
    owner: 'IPC externalAccess:gmailOAuthConnect / externalAccess:gmailOAuthDisconnect',
    kind: 'product_configuration',
    description: 'Connect or disconnect Gmail OAuth credentials through explicit External Access configuration actions.',
    ipcChannels: [
      'externalAccess:gmailOAuthConnect',
      'externalAccess:gmailOAuthDisconnect',
    ],
    requiredGates: [
      'simplicity_check',
      'product_config_boundary',
    ],
    coveredGates: [
      'simplicity_check',
      'product_config_boundary',
    ],
    notes: 'Both actions require explicit confirmation. Connect opens the system browser and waits for a loopback callback before storing a refresh token; disconnect revokes when possible and always clears the local refresh token.',
  },
  {
    id: 'workHabit.preferenceMemory',
    owner: 'WorkHabitService',
    kind: 'preference_memory',
    description: 'Create, propose, update, resolve, delete, import, or apply cross-task Work Habit memory.',
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
    ipcChannels: [
      'processTemplate:archive',
      'processTemplate:create',
      'processTemplate:update',
    ],
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
