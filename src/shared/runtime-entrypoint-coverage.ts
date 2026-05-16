export type RuntimeEntrypointKind =
  | 'provider_visible_execution'
  | 'hidden_local_execution'
  | 'execution_resume'
  | 'decision_resume'
  | 'decision_action'
  | 'task_capture'
  | 'task_state_transition'
  | 'durable_write'
  | 'context_transition';

export type RuntimeEntrypointGate =
  | 'runtime_action'
  | 'runtime_context_assembly'
  | 'task_memory_coverage'
  | 'task_memory_guidance'
  | 'runtime_handoff'
  | 'pre_step'
  | 'post_step'
  | 'subtask_start'
  | 'task_mutation'
  | 'task_completion'
  | 'decision_action'
  | 'checkpoint_eligibility'
  | 'panel_event_allowlist';

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

export const RUNTIME_ENTRYPOINT_COVERAGE: RuntimeEntrypointCoverage[] = [
  {
    id: 'run.trigger',
    owner: 'RunService.trigger',
    kind: 'provider_visible_execution',
    description: 'Ordinary text or Agent run execution for a task.',
    requiredGates: [
      'runtime_action',
      'runtime_context_assembly',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    coveredGates: [
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
      'runtime_action',
      'runtime_context_assembly',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    coveredGates: [
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
      'runtime_action',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    coveredGates: [
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
      'runtime_action',
      'runtime_handoff',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'checkpoint_eligibility',
    ],
    coveredGates: [
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
      'decision_action',
      'task_memory_guidance',
      'pre_step',
      'post_step',
      'subtask_start',
      'checkpoint_eligibility',
    ],
    coveredGates: [
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
      'runtime_action',
      'task_memory_guidance',
      'pre_step',
    ],
    coveredGates: [
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
      'runtime_action',
      'task_memory_coverage',
      'pre_step',
      'subtask_start',
    ],
    coveredGates: [
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
      'runtime_action',
      'task_completion',
      'pre_step',
    ],
    coveredGates: [
      'runtime_action',
      'task_completion',
      'pre_step',
    ],
  },
  {
    id: 'decision.action',
    owner: 'DecisionService.act / DecisionsPage',
    kind: 'decision_action',
    description: 'Approve, defer, or cancel a retained Decision without checkpoint resume.',
    requiredGates: [
      'decision_action',
      'task_memory_guidance',
      'pre_step',
      'post_step',
    ],
    coveredGates: [
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
      'task_mutation',
      'pre_step',
      'panel_event_allowlist',
    ],
    coveredGates: [
      'task_mutation',
      'pre_step',
      'panel_event_allowlist',
    ],
  },
  {
    id: 'project.decompositionConfirm',
    owner: 'TasksPage project decomposition confirmation',
    kind: 'durable_write',
    description: 'Confirm generated project children, dependencies, criteria, records, and parent updates.',
    requiredGates: [
      'task_mutation',
      'pre_step',
      'post_step',
      'subtask_start',
      'panel_event_allowlist',
    ],
    coveredGates: [
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
      'task_mutation',
      'pre_step',
      'post_step',
    ],
    coveredGates: [
      'task_mutation',
      'pre_step',
      'post_step',
    ],
  },
  {
    id: 'agent.toolDurableWrites',
    owner: 'AgentToolRegistry task/source/artifact tools',
    kind: 'durable_write',
    description: 'Agent tool writes for task records, Task.md guidance, source context, and artifacts.',
    requiredGates: [
      'task_mutation',
      'pre_step',
      'post_step',
    ],
    coveredGates: [
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
      'runtime_action',
      'runtime_handoff',
      'task_memory_coverage',
      'task_memory_guidance',
    ],
    coveredGates: [
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

export function runtimeEntrypointsByKind(
  kind: RuntimeEntrypointKind,
  entries: RuntimeEntrypointCoverage[] = RUNTIME_ENTRYPOINT_COVERAGE,
): RuntimeEntrypointCoverage[] {
  return entries.filter((entry) => entry.kind === kind);
}
