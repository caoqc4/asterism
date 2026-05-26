export type RuntimeEntrypointKind =
  | 'provider_visible_execution'
  | 'provider_visible_planning'
  | 'provider_visible_assistance'
  | 'hidden_local_execution'
  | 'local_execution_control'
  | 'verification_harness'
  | 'product_configuration'
  | 'preference_memory'
  | 'method_library'
  | 'scheduler_maintenance'
  | 'capability_probe'
  | 'runtime_audit'
  | 'execution_resume'
  | 'decision_resume'
  | 'decision_draft'
  | 'decision_write'
  | 'decision_action'
  | 'automation_diagnostic'
  | 'task_capture'
  | 'task_type_review'
  | 'task_state_transition'
  | 'task_to_task_handoff'
  | 'phase_closeout_handoff'
  | 'durable_write'
  | 'context_transition';

export type RuntimeEntrypointGate =
  | 'simplicity_check'
  | 'runtime_selection'
  | 'runtime_action'
  | 'runtime_context_assembly'
  | 'context_readiness'
  | 'task_memory_coverage'
  | 'task_memory_guidance'
  | 'runtime_handoff'
  | 'standing_approval'
  | 'operator_confirmation'
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
  local_execution_control: [
    'simplicity_check',
    'operator_confirmation',
  ],
  verification_harness: [
    'simplicity_check',
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
  scheduler_maintenance: [
    'simplicity_check',
    'product_config_boundary',
    'post_step',
  ],
  capability_probe: [
    'simplicity_check',
    'capability_probe_boundary',
  ],
  runtime_audit: [
    'simplicity_check',
    'operator_confirmation',
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
  automation_diagnostic: [
    'simplicity_check',
    'runtime_context_assembly',
  ],
  task_capture: [
    'simplicity_check',
    'runtime_action',
    'task_memory_guidance',
    'pre_step',
  ],
  task_type_review: [
    'simplicity_check',
    'task_memory_guidance',
  ],
  task_state_transition: [
    'simplicity_check',
    'runtime_action',
    'pre_step',
  ],
  task_to_task_handoff: [
    'simplicity_check',
    'task_completion',
    'task_memory_coverage',
    'subtask_start',
    'task_mutation',
    'pre_step',
    'post_step',
    'panel_event_allowlist',
  ],
  phase_closeout_handoff: [
    'simplicity_check',
    'runtime_action',
    'runtime_handoff',
    'task_memory_coverage',
    'task_memory_guidance',
    'task_completion',
    'subtask_start',
    'task_mutation',
    'pre_step',
    'post_step',
    'panel_event_allowlist',
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
    notes: 'Global assistance includes product principles. Task-bound assistance must load persisted task detail before model exposure and stays read-only. API Runtime chat responses carry global_assistant or task_assistant invocation provenance, and the IPC handler rejects selected Agent CLI modes instead of silently switching runtimes.',
  },
  {
    id: 'brief.scheduledSnapshot',
    owner: 'SchedulerService.generateScheduledBrief',
    kind: 'provider_visible_assistance',
    description: 'Scheduled Brief snapshot generation through the API Runtime path, with local product-harness brief generation when provider execution is unavailable.',
    requiredGates: [
      'simplicity_check',
      'runtime_context_assembly',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_context_assembly',
    ],
    notes: 'HomeBriefService builds the bounded Brief context projection before provider exposure; BriefProcessTemplateSelector and BriefExecutor use the resolved API Runtime config only when API Runtime is selected for scheduled brief generation. Selected Agent CLI modes skip API config resolution and write a local product-harness brief snapshot with fallbackReason, not a hidden Agent CLI fallback or cross-runtime provider call.',
  },
  {
    id: 'scheduler.staleRunRecovery',
    owner: 'SchedulerService.reconcileStaleRuns',
    kind: 'scheduler_maintenance',
    description: 'Background scheduler maintenance that marks stale incomplete Runs failed after the local recovery window.',
    requiredGates: [
      'simplicity_check',
      'product_config_boundary',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'product_config_boundary',
      'post_step',
    ],
    notes: 'This is product-harness maintenance behind the scheduler feature flag: it does not start an Agent CLI/API runtime, does not assemble provider-visible context, and writes terminal Run evidence only for already-incomplete Runs that exceed the recovery window.',
  },
  {
    id: 'automation.readinessDiagnostic',
    owner: 'AgentAutomationReadiness.evaluate',
    kind: 'automation_diagnostic',
    description: 'Read-only automation readiness diagnostic for manual/operator-started tasks and scheduled/event/routine task classes.',
    requiredGates: [
      'simplicity_check',
      'runtime_context_assembly',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_context_assembly',
    ],
    notes: 'This diagnostic scores procedure, inputs, selected-runtime readiness, risk, blockers, dependencies, completion criteria, and the current autonomy ladder level. It may identify L1 proposal eligibility, but automaticStartAllowed remains false. Scheduled, event-triggered, and routine tasks are labeled separate_scheduled_event_entrypoint_required and cannot use this diagnostic as a hidden Agent CLI/API execution entrypoint until a standing approval policy is present.',
  },
  {
    id: 'automation.scheduledEventAgentRun.future',
    owner: 'SchedulerService.triggerScheduledEventAgentRun',
    kind: 'provider_visible_execution',
    description: 'Scheduled/event/routine Agent execution entrypoint for bounded automatic starts after standing approval and trigger-service connection.',
    ipcChannels: ['scheduler:triggerScheduledEventAgentRun'],
    requiredGates: [
      'simplicity_check',
      'product_config_boundary',
      'operator_confirmation',
      'standing_approval',
      'runtime_action',
      'runtime_context_assembly',
      'context_readiness',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'product_config_boundary',
      'operator_confirmation',
      'standing_approval',
      'runtime_action',
      'runtime_context_assembly',
      'context_readiness',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    notes: 'SchedulerService.triggerScheduledEventAgentRun now provides a narrow main-side trigger-service connection through an injected Code Agent run port after standing approval, run-limit counting, task class, and runtime readiness pass. It is exposed through explicit operator IPC scheduler:triggerScheduledEventAgentRun and a 15-minute scheduler sweep that only loads scheduled/event/routine task candidates from a dedicated task-source port; readiness diagnostics do not start Agent CLI/API runtimes, and broader automatic starts must keep scheduler configuration, context readiness, task-memory gates, target-task checks, trigger timeline evidence, and terminal run evidence before widening runtime coverage.',
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
      'context_readiness',
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
      'context_readiness',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    notes: 'Current retained RunService path is a provider-visible API Runtime / Agent API-like execution surface: RunService records context.readiness.evaluate before RunOrchestrator resolves RuntimeAiConfig, only after the IPC boundary confirms API Runtime is selected, may expose provider-native tool schemas only behind feature flags, and may fall back to a conservative local agent plan inside the same run. It is not the first-version Agent CLI entrypoint and must not be used as an implicit fallback when a selected Agent CLI runtime is unavailable.',
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
      'context_readiness',
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
      'context_readiness',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    notes: 'Code Agent model-producer mode is retained compatibility evidence for the future Agent API adapter: CodeAgentRunService records context.readiness.evaluate before model-producer/API-like execution, must stay gated as provider-visible execution with shared context manifests, blocks selected Agent CLI modes before resolving API config, and must not be exposed as auxiliary provider assistance or an implicit fallback for selected Agent CLI runtimes.',
  },
  {
    id: 'artifact.runSandboxPatchReview',
    owner: 'PatchArtifactSandboxReviewRunService.run',
    kind: 'hidden_local_execution',
    description: 'Run local-container sandbox review from a confirmed patch artifact, then create patch evidence and a promotion Decision without applying workspace files.',
    ipcChannels: ['artifact:runSandboxPatchReview'],
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'task_memory_coverage',
      'task_memory_guidance',
      'operator_confirmation',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'task_memory_coverage',
      'task_memory_guidance',
      'operator_confirmation',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    notes: 'Patch artifact sandbox review is a product-controlled local execution path: it starts from an already confirmed run-backed patch artifact, creates a new audit Run, mounts the workspace read-only, applies the patch only inside the disposable sandbox workdir, persists review artifacts and checkpoint evidence, and leaves actual workspace mutation behind the existing promotion Decision approval/apply gate.',
  },
  {
    id: 'sandboxPatchPromotion.apply',
    owner: 'IPC sandboxPatchPromotion:apply / SandboxPatchPromotionApplyService.apply',
    kind: 'local_execution_control',
    description: 'Explicitly apply an approved reviewed-patch promotion to the real workspace when the apply feature flag is enabled.',
    ipcChannels: ['sandboxPatchPromotion:apply'],
    requiredGates: [
      'simplicity_check',
      'operator_confirmation',
      'decision_action',
      'checkpoint_eligibility',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'operator_confirmation',
      'decision_action',
      'checkpoint_eligibility',
      'post_step',
    ],
    notes: 'This is an explicit operator action, not a runtime fallback: IPC requires operatorConfirmed and enableSandboxPatchPromotionApply, SandboxPatchPromotionPreflightService revalidates approved reviewed-patch promotion metadata and workspace divergence, and the handler records applied or blocked Run evidence before refreshing task/run state.',
  },
  {
    id: 'run.triggerAgentCli',
    owner: 'AgentCliRunService.trigger',
    kind: 'provider_visible_execution',
    description: 'Task-bound Agent CLI execution through the user-authenticated official CLI.',
    ipcChannels: ['run:triggerAgentCli'],
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_context_assembly',
      'context_readiness',
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
      'context_readiness',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    notes: 'Auth remains inside the official CLI; Taskplane gates context assembly, records context.readiness.evaluate before invoking the native runtime, and records run evidence. Selected Agent CLI decomposition drafts also travel through this task-bound entrypoint: the right panel allows decomposition_draft prompts, extracts subtask.propose Write Intent from native output, and keeps durable child creation behind operator confirmation.',
  },
  {
    id: 'run.triggerAgentApi.future',
    owner: 'Future AgentApiRunService.trigger',
    kind: 'provider_visible_execution',
    description: 'Deferred peer Agent API execution runtime once it becomes selectable and executable.',
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_context_assembly',
      'context_readiness',
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
      'context_readiness',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ],
    notes: 'Deferred contract only: Agent API is a future peer execution runtime, not auxiliary provider assistance. When implemented, it must reuse the same Taskplane harness, context manifest, context readiness, task-memory guidance, Run Goal Contract, Write Intent extraction, reviewed-patch apply boundary, subtask_start, post-step verification, and Run evidence persistence as Agent CLI before exposing any IPC channel.',
  },
  {
    id: 'run.cancelAgentCli',
    owner: 'AgentCliRunService.cancel',
    kind: 'local_execution_control',
    description: 'Operator-confirmed cancellation request for an active Agent CLI subprocess.',
    ipcChannels: ['run:cancelAgentCli'],
    requiredGates: [
      'simplicity_check',
      'operator_confirmation',
    ],
    coveredGates: [
      'simplicity_check',
      'operator_confirmation',
    ],
    notes: 'Cancellation does not start new work or expose model tools; it requires an explicit operator-confirmed run id, interrupts an already-gated local Agent CLI run, and terminal evidence is recorded through the trigger path.',
  },
  {
    id: 'run.recordRuntimeNativeGoalRequest',
    owner: 'AgentCliRunService.recordNativeGoalRequest',
    kind: 'runtime_audit',
    description: 'Audit-only record for explicit runtime-native goal requests that are not forwarded to the CLI.',
    ipcChannels: ['run:recordRuntimeNativeGoalRequest'],
    requiredGates: [
      'simplicity_check',
      'operator_confirmation',
    ],
    coveredGates: [
      'simplicity_check',
      'operator_confirmation',
    ],
    notes: 'This creates system-output audit evidence only; runtime-native goal passthrough remains closed and no CLI command is executed. Opening a future passthrough entrypoint requires the native goal forwarding readiness gate to prove adapter capability, command shape, state reflection, progress evidence, cancellation/timeout control, memory boundary, Taskplane source-of-truth boundary, and packaged fake-runtime smoke.',
  },
  {
    id: 'run.acceptanceVerification',
    owner: 'AgentCliRunService / RunVerificationService',
    kind: 'verification_harness',
    description: 'Evaluate terminal run evidence against the Taskplane Run Goal Contract and persist verifier/run verification evidence without starting new work.',
    requiredGates: [
      'simplicity_check',
      'post_step',
    ],
    coveredGates: [
      'simplicity_check',
      'post_step',
    ],
    notes: 'The current lightweight verifier is local, deterministic, and recorded as verification_assist product-harness provenance; a future API verifier subagent may augment this entrypoint in shadow/assist mode only, using the same persisted Run Goal Contract, terminal output, task memory guidance, and post-step evidence. Assist-mode promotion requires persisted lightweight and ai_verifier run-level records that can be projected into shadow samples and pass the API verifier shadow readiness thresholds.',
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
      'runtime_selection',
      'runtime_action',
      'runtime_handoff',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'checkpoint_eligibility',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_selection',
      'runtime_action',
      'runtime_handoff',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'checkpoint_eligibility',
    ],
    notes: 'IPC rejects selected Agent CLI modes before resuming this retained API Runtime checkpoint path, so paused runs cannot silently continue through another runtime.',
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
    notes: 'Decision approval only resumes execution when DecisionService finds an open checkpoint linked to that Decision. Resume is limited to validated tool_permission, browser-controlled, or patch-promotion checkpoints, rechecks target task readiness and pending task-memory guidance, and does not turn ordinary Decision approval into arbitrary tool execution.',
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
    notes: 'Drafting requires an existing task, selected/skipped process-template annotations now pass task_mutation, provider-backed drafts are wrapped as decision_draft API-runtime invocations only when API Runtime is selected, selected Agent CLI modes stay local product_harness/skipped instead of silently switching runtimes, and Decision persistence remains behind decision.create.',
  },
  {
    id: 'decision.schedulerDraft.future',
    owner: 'Future ScheduledDecisionProposalService.draft',
    kind: 'decision_draft',
    description: 'Deferred scheduler/background Decision proposal path before any automatic Decision persistence is allowed.',
    requiredGates: [
      'simplicity_check',
      'product_config_boundary',
      'operator_confirmation',
      'standing_approval',
      'runtime_context_assembly',
      'task_memory_guidance',
      'task_mutation',
      'pre_step',
      'decision_draft_boundary',
    ],
    coveredGates: [
      'simplicity_check',
      'product_config_boundary',
      'operator_confirmation',
      'standing_approval',
      'runtime_context_assembly',
      'task_memory_guidance',
      'task_mutation',
      'pre_step',
      'decision_draft_boundary',
    ],
    notes: 'Deferred contract only: scheduler/background decision work may draft an approval item through planSchedulerDecisionProposal, but cannot persist a Decision, invoke main-side writeback, or expose IPC/scheduler triggers without operator confirmation or standing approval. The proposal plan keeps decisionPersistenceAllowed=false, writebackDispatchAllowed=false, and schedulerTriggerAllowed=false; durable Decision creation remains behind decision.create or TaskplaneWritebackApprovalItem dispatch through the main-side writeback boundary.',
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
    notes: 'RightPanel task capture uses local inferTaskTypeProfile before task:create, so project-like software/build titles are created as project work without a hidden AI call. Any later AI type review must remain a separate proposal and confirmation boundary.',
  },
  {
    id: 'task.typeReview',
    owner: 'RightPanel task type review proposal',
    kind: 'task_type_review',
    description: 'Generate a structured task-type review proposal before any user-confirmed task metadata write.',
    requiredGates: [
      'simplicity_check',
      'task_memory_guidance',
    ],
    coveredGates: [
      'simplicity_check',
      'task_memory_guidance',
    ],
    notes: 'Current implementation uses local structured type rules and then writes through task.metadataUpdate only after user confirmation. This is the first-version task-type review contract; future Agent CLI or Agent API task_type_review invocations must keep this proposal/confirmation split and declare selected-runtime or API-runtime provenance before adding IPC.',
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
    id: 'task.completionHandoff',
    owner: 'TasksPage completion handoff',
    kind: 'task_to_task_handoff',
    description: 'After a task completion check, write completion/received handoff records and enter the next existing child task only after subtask_start passes.',
    ipcChannels: ['task:transition', 'taskFile:create', 'task:recordTimelineEvent', 'ai:chat'],
    requiredGates: [
      'simplicity_check',
      'task_completion',
      'task_memory_coverage',
      'subtask_start',
      'task_mutation',
      'pre_step',
      'post_step',
      'panel_event_allowlist',
    ],
    coveredGates: [
      'simplicity_check',
      'task_completion',
      'task_memory_coverage',
      'subtask_start',
      'task_mutation',
      'pre_step',
      'post_step',
      'panel_event_allowlist',
    ],
    notes: 'TaskService owns the completed-state transition and task_completion memory coverage; TasksPage evaluates the target child with subtask_start before writing handoff records, timeline replay events, and opening the next task context.',
  },
  {
    id: 'rightPanel.phaseCloseoutHandoff',
    owner: 'RightPanel phase closeout',
    kind: 'phase_closeout_handoff',
    description: 'Archive phase context, record closeout evidence, run task-closeout/handoff checks, and optionally enter the next existing task.',
    ipcChannels: ['taskFile:create', 'task:recordCompletionCheck', 'task:transition'],
    requiredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_handoff',
      'task_memory_coverage',
      'task_memory_guidance',
      'task_completion',
      'subtask_start',
      'task_mutation',
      'pre_step',
      'post_step',
      'panel_event_allowlist',
    ],
    coveredGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_handoff',
      'task_memory_coverage',
      'task_memory_guidance',
      'task_completion',
      'subtask_start',
      'task_mutation',
      'pre_step',
      'post_step',
      'panel_event_allowlist',
    ],
    notes: 'Phase closeout is not task completion by itself: task_closeout verification decides whether to refresh, pause, or hand off; subtask_start applies only when RuntimeHandoff chooses an existing next task.',
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
    id: 'task.goalControl',
    owner: 'RightPanel / TaskService product-owned /goal',
    kind: 'durable_write',
    description: 'Set, pause, resume, or clear a Taskplane-owned Task Goal and optional completion conditions without invoking an execution runtime.',
    ipcChannels: ['task:update', 'completionCriteria:create', 'task:recordTimelineEvent'],
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
    notes: 'Product /goal is Taskplane harness state: it writes task nextStep, completion criteria, and panel.task_goal_* timeline events through guarded task mutation boundaries. It is independent of whether Agent CLI or future Agent API is selected for execution.',
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
    notes: 'Draft generation reads task state, key sources, recent timeline, work habits, and Agent principles, wraps the result as a decomposition_draft API-runtime invocation for the retained API path, then validates both existing children and proposed child drafts before returning JSON. The IPC handler rejects selected Agent CLI modes instead of silently switching runtimes. Selected Agent CLI decomposition uses run.triggerAgentCli plus right-panel subtask.propose Write Intent extraction and confirmation, not this IPC channel. Neither path directly creates child tasks; durable creation remains behind project.decompositionConfirm.',
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
      'subtask_draft',
      'panel_event_allowlist',
    ],
    coveredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'post_step',
      'subtask_draft',
      'panel_event_allowlist',
    ],
    notes: 'Confirmation is product-harness durable write through TaskplaneWritebackApplyPlan: it rechecks proposed child drafts before creating real child tasks, child and parent criteria, dependencies, parent updates, project timeline evidence with child ids and record path, and task records. It does not depend on which AI runtime produced the draft. Starting or entering a child task remains a separate subtask_start boundary.',
  },
  {
    id: 'taskplane.writebackApply',
    owner: 'TaskplaneWritebackDispatchService.dispatch',
    kind: 'durable_write',
    description: 'Apply a confirmed Taskplane Write Intent through main-process service ports.',
    ipcChannels: ['taskplaneWriteback:apply'],
    requiredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'post_step',
      'panel_event_allowlist',
    ],
    coveredGates: [
      'simplicity_check',
      'task_mutation',
      'pre_step',
      'post_step',
      'panel_event_allowlist',
    ],
    notes: 'Shared Write Intent application is a product-harness durable write, not a hidden runtime call. The IPC handler verifies the target task, dispatch rechecks the writeback movement and target ids, and concrete writes still flow through TaskService, DecisionService, or TaskFileRepository ports with panel timeline allowlist events.',
  },
  {
    id: 'task.structuredStateWrites',
    owner: 'TaskService structured state resource handlers',
    kind: 'durable_write',
    description: 'Create, update, resolve, satisfy, or reopen structured task-state resources such as blockers, completion criteria, and dependencies.',
    ipcChannels: [
      'blocker:create',
      'blocker:resolve',
      'blocker:update',
      'completionCriteria:create',
      'completionCriteria:reopen',
      'completionCriteria:satisfy',
      'completionCriteria:update',
      'taskDependency:create',
      'taskDependency:resolve',
      'taskDependency:update',
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
    notes: 'Structured state resource writes are task memory updates, not task-file or artifact writes. They share the same service/IPC mutation minimum while remaining distinct from file/source/artifact surfaces.',
  },
  {
    id: 'task.fileAndArtifactWrites',
    owner: 'TasksPage / RightPanel / IPC taskFile/artifact/source handlers',
    kind: 'durable_write',
    description: 'Create, update, move, archive, or delete task-bound files, source contexts, artifacts, and process bindings.',
    ipcChannels: [
      'artifact:createManual',
      'artifact:delete',
      'artifact:update',
      'processTemplate:apply',
      'processTemplate:remove',
      'sourceContext:archive',
      'sourceContext:create',
      'sourceContext:update',
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
    notes: 'This is the service/IPC minimum for task-bound file, source, artifact, and process-binding writes. Process template apply/remove writes timeline events with binding action and note context. Renderer panel flows and Agent tool writes may add post_step verification when they have durable-change recovery context.',
  },
  {
    id: 'externalAccess.sourceIngestionPreview',
    owner: 'ExternalAccessSourceIngestionService.preview',
    kind: 'capability_probe',
    description: 'Task-bound External Access evidence preview before any source-context write.',
    ipcChannels: ['externalAccess:sourceIngestionPreview'],
    requiredGates: [
      'simplicity_check',
      'capability_probe_boundary',
    ],
    coveredGates: [
      'simplicity_check',
      'capability_probe_boundary',
    ],
    notes: 'Preview may ask connected adapters for task-bound evidence but must not write task memory or emit task-change events.',
  },
  {
    id: 'externalAccess.sourceIngestionCommit',
    owner: 'ExternalAccessSourceIngestionService.commit',
    kind: 'durable_write',
    description: 'Confirmed External Access evidence ingestion into task-bound Source Context memory.',
    ipcChannels: ['externalAccess:sourceIngestionCommit'],
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
    id: 'settings.agentCliLoginProbe',
    owner: 'IPC settings:openAgentCliLogin / settings:openAgentCliInstall',
    kind: 'capability_probe',
    description: 'Open a prepared official Agent CLI install or login command in the local terminal without storing credentials or starting a run.',
    ipcChannels: ['settings:openAgentCliLogin', 'settings:openAgentCliInstall'],
    requiredGates: [
      'simplicity_check',
      'capability_probe_boundary',
    ],
    coveredGates: [
      'simplicity_check',
      'capability_probe_boundary',
    ],
    notes: 'This launches only the official CLI install or login command. Account authorization remains with the official CLI/web flow, and Taskplane stores no CLI account credential.',
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
    notes: 'Applying or removing a process template binding on a task remains a task mutation; this entrypoint covers library-level template writes only. Library writes normalize template fields and reject blank required values or invalid kinds before persistence.',
  },
  {
    id: 'agent.toolDurableWrites',
    owner: 'AgentToolRegistry task/source/artifact tools',
    kind: 'durable_write',
    description: 'Agent tool writes for task metadata, completion criteria, source context, artifacts, and memory guidance.',
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
    notes: 'Provider-native tool schemas never expose local write, command, next-step, source-context, or artifact-write tools directly. The decision.draft tool returns a draft/proposal only; Decision persistence remains behind decision.create. Durable AgentToolRegistry writes still execute only inside an already-gated run, require task_mutation/pre-step checks, emit post-step verification and task-memory guidance, and create tool-permission checkpoints for high-risk or explicitly confirmed local command/file-write tools.',
  },
  {
    id: 'context.refreshOrLeave',
    owner: 'RightPanel / RuntimeHandoff',
    kind: 'context_transition',
    description: 'Refresh the current task chat through preservation gates, leave task context, or start a global conversation.',
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
    notes: 'RuntimeHandoff consumes AutoContextClearReadiness and blocks clearing when recoverable discussion, pending task-memory guidance, Decisions, blockers, or short-term reasoning still need preservation.',
  },
  {
    id: 'context.taskSwitch',
    owner: 'RightPanel / RuntimeHandoff',
    kind: 'context_transition',
    description: 'Switch the right-panel task context from one task to another without completing either task.',
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
    notes: 'Task switching checks task_switch memory coverage and pending TaskMemoryGuidanceState before leaving the previous task; it does not use subtask_start unless another handoff boundary is actually entering work.',
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
