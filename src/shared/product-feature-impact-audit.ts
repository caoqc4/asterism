import type { RuntimeEntrypointGate } from './runtime-entrypoint-coverage.js';
import type { TaskplaneWriteIntent } from './taskplane-write-intent.js';

export type ProductFeatureAuditPriority = 'p0' | 'p1' | 'p2';

export type ProductFeatureAuditStatus = 'covered' | 'partial' | 'deferred';

export type ProductFeatureMutationBoundary =
  | 'read'
  | 'execute'
  | 'propose'
  | 'persist'
  | 'clear'
  | 'configure';

export type ProductFeatureMovement =
  | 'ask'
  | 'research'
  | 'shape'
  | 'decompose'
  | 'execute'
  | 'verify'
  | 'persist'
  | 'handoff'
  | 'pause';

export type ProductRuntimeRuleSkillId =
  | 'goalpilot.task_router'
  | 'agent.execution_rules'
  | 'agent.output_contract'
  | 'task.memory_rules'
  | 'native.runtime_orchestration'
  | 'decision.writeback_orchestration';

export type ProductFeatureWriteIntentKind =
  | TaskplaneWriteIntent['type']
  | 'task_file.propose'
  | 'artifact.propose'
  | 'work_habit.propose'
  | 'none';

export type ProductFeatureRuntimeClosure = 'supported' | 'partial' | 'not_applicable' | 'missing';

export type ProductFeatureImpactAuditItem = {
  id: string;
  label: string;
  priority: ProductFeatureAuditPriority;
  status: ProductFeatureAuditStatus;
  boundaries: ProductFeatureMutationBoundary[];
  movements: ProductFeatureMovement[];
  ruleSkills: ProductRuntimeRuleSkillId[];
  writeIntents: ProductFeatureWriteIntentKind[];
  gates: RuntimeEntrypointGate[];
  cliOnlyClosure: ProductFeatureRuntimeClosure;
  futureApiClosure: ProductFeatureRuntimeClosure;
  evidence: string[];
  gaps: string[];
  nextActions: string[];
};

export type ProductFeatureImpactAuditIssue = {
  featureId: string;
  issue: string;
};

export const PRODUCT_FEATURE_IMPACT_AUDIT: ProductFeatureImpactAuditItem[] = [
  {
    id: 'right_panel_agent_run',
    label: 'Right-panel chat, run start, progress, and completion',
    priority: 'p0',
    status: 'partial',
    boundaries: ['execute', 'propose', 'persist'],
    movements: ['shape', 'execute', 'verify', 'persist', 'handoff'],
    ruleSkills: [
      'goalpilot.task_router',
      'agent.execution_rules',
      'agent.output_contract',
      'task.memory_rules',
      'decision.writeback_orchestration',
      'native.runtime_orchestration',
    ],
    writeIntents: [
      'task_record.create',
      'task_file.propose',
      'artifact.propose',
      'source_context.create',
      'decision.create',
      'subtask.propose',
      'task.update_next_step',
      'task.mark_blocked',
      'task.complete.propose',
    ],
    gates: [
      'runtime_action',
      'runtime_context_assembly',
      'context_readiness',
      'task_memory_coverage',
      'task_memory_guidance',
      'subtask_start',
      'pre_step',
      'post_step',
      'operator_confirmation',
    ],
    cliOnlyClosure: 'partial',
    futureApiClosure: 'partial',
    evidence: [
      'Agent CLI runs return runtime evidence and compact progress projection.',
      'Agent CLI runs record context.readiness.evaluate before native CLI execution and pass the verdict into the context bridge.',
      'Taskplane extracts Write Intent from runtime output before product writes.',
      'Shared writeback proposal builder normalizes runtime Write Intent into reusable product proposal surfaces.',
      'Shared writeback apply plans map confirmed proposals to service inputs and timeline evidence.',
      'Shared writeback dispatch applies plans through injected ports, so renderer and future service runtimes can share the same write boundary.',
      'Main-side writeback dispatch now asks shared TaskAdvancementOrchestrator for a persistence movement before applying validated Write Intent through service ports.',
      'Main-side writeback dispatch adapter wires shared dispatch to TaskService, DecisionService, TaskFileRepository, and ArtifactRepository ports.',
      'Right-panel source, structured, subtask, task-record, and task-memory confirmations invoke main-side writeback IPC when available, with renderer-port dispatch kept as a compatibility fallback.',
      'Right-panel proposals can confirm task records, task files, task artifacts, source contexts, decisions, next-step updates, blockers, completion proposals, and subtask drafts.',
      'Task Dynamics now builds a Run-detail writeback approval queue from the same shared proposal builder and dispatches confirmed non-subtask Write Intent or task-memory proposals through main-side writeback IPC outside the right panel.',
      'Native CLI artifact.propose Write Intent can now carry kind=patch, validate diff-like content, and save confirmed patch evidence through the main-side ArtifactRepository createPatchFromRun port.',
      'Confirmed run-backed patch artifacts can be normalized into imported_patch_artifact sandbox draft sources and previewed through the existing sandbox patch review planner before any workspace promotion Decision.',
      'Completed native runs and child-task advancement messages summarize Taskplane web research capture and native CLI capability-tagged web/search events.',
      'Pre-run web research trigger conditions ignore bare runtime names and generic current-task wording, so selecting Codex CLI or Claude Code does not itself request external research.',
      'Pre-run web research trigger conditions now recognize fresh external requests such as latest/current pricing, current API status, and recent release changes without treating current-task wording as research.',
      'Codex JSONL command_execution items are projected as shell_command run steps, so right-panel progress can show local command activity instead of only raw terminal output.',
      'Agent CLI stdout JSONL lines are now projected into Run steps while the native process is still running, with completion-time transcript parsing kept as a fallback.',
      'Completed native run chat summaries now mention local command or workspace activity as well as web research activity.',
      'Right-panel task chat now runs through shared PilotDecision and TaskAdvancementOrchestrator before Agent CLI launch, preserving operation mode, backendPlan, message priority, user-owned approval boundaries, and executor routing.',
      'Agent CLI run records preserve the trimmed Pilot decision snapshot as a Pilot 决策辅助计划 step for phase-2 auditability.',
      'Agent API chat invocations preserve the same trimmed Pilot decision snapshot in invocation provenance.',
      'Retained API Runtime / Agent API-like RunService runs now record context.readiness.evaluate before provider-visible execution resolves runtime config.',
      'Code Agent model-producer / future Agent API compatibility runs now record context.readiness.evaluate before model-producer execution, including blocked early exits.',
      'Shared AI Runtime invocation contract now includes an explicit skipped execution_run shape for deferred Agent API task execution, so API Runtime can be represented without silently starting provider-visible work.',
      'Run Goal Contract and Agent CLI context bridge now carry selected-runtime capability declarations into the native CLI prompt before execution.',
      'Run verification and memory proposals remain product-controlled.',
      'Post-step verification now treats native CLI capability=workspace_write steps as workspace write candidates that require reviewable promotion evidence instead of accepting ordinary command output as sufficient recovery evidence.',
      'Approved patch-promotion Decisions can call SandboxPatchPromotionApplyService when the sandbox patch promotion apply feature flag is enabled; the service preflights reviewed patch evidence, writes only matching workspace files, records applied/blocked promotion state, and updates run evidence.',
      'Run detail now includes sandbox patch promotion records, and the task file workspace projects applied, blocked, approved-but-unapplied, and missing-apply-record status next to reviewed patch artifacts.',
      'Decisions approval results now explain that approving a reviewed patch records the approval while real workspace writes still require the apply flag and a passing promotion preflight.',
      'Tasks file workspace exposes an explicit apply-to-workspace action for approved reviewed-patch promotions when enableSandboxPatchPromotionApply is enabled; the action confirms with the operator, calls main-side promotion apply IPC, records run evidence, and refreshes task/run state.',
      'Local agent acceptance includes a reviewed patch promotion apply smoke covering default approval no-write, feature-flagged apply success, and workspace-drift blocked recovery evidence.',
      'The packaged task-files smoke now seeds approved reviewed-patch promotions, enables the apply flag in a temporary workspace, drives both applied and blocked Tasks UI apply actions, and verifies workspace file content plus applied/blocked run evidence.',
    ],
    gaps: [
      'Write-enabled native runtime modes remain intentionally feature-flagged; broader recovery copy is still needed before workspace mutation can become a common happy path.',
    ],
    nextActions: [
      'Keep future workspace-write promotion on patch artifacts, ready task_file Write Intent, ready patch artifact Write Intent, or patch-review evidence surfaces before product-controlled persistence.',
    ],
  },
  {
    id: 'task_creation_and_project_decomposition',
    label: 'Task creation, project decomposition, and child task confirmation',
    priority: 'p0',
    status: 'partial',
    boundaries: ['propose', 'persist'],
    movements: ['shape', 'decompose', 'persist'],
    ruleSkills: [
      'goalpilot.task_router',
      'agent.execution_rules',
      'agent.output_contract',
      'decision.writeback_orchestration',
    ],
    writeIntents: ['subtask.propose'],
    gates: [
      'runtime_action',
      'runtime_context_assembly',
      'task_memory_guidance',
      'subtask_draft',
      'task_mutation',
      'pre_step',
      'post_step',
      'operator_confirmation',
    ],
    cliOnlyClosure: 'supported',
    futureApiClosure: 'partial',
    evidence: [
      'Project decomposition produces draft child tasks before durable subtasks.',
      'Project decomposition uses shared TaskAdvancementOrchestrator movement routing before requesting a reversible subtask draft.',
      'Selected native Agent CLI decomposition runs through the right-panel task-bound Agent CLI path, parses subtask.propose Write Intent from CLI output, and surfaces a confirmation card.',
      'Subtask draft validation blocks underspecified or tiny proposals before confirmation.',
      'Subtask draft confirmation is represented as a subtask.create_many writeback apply plan and dispatched through the main-side task service adapter.',
      'The retained Agent API decomposition confirmation path now builds an agent_api_decomposition subtask.create_many apply plan instead of writing child tasks directly from the renderer.',
      'Agent API task execution has a shared deferred execution_run invocation shape, so future API execution can join the same invocation contract before durable child creation or run execution is promoted.',
      'The main-side subtask apply path promotes the parent to a project, creates planned child tasks, stores child and parent completion criteria, stores matched dependencies, records the project timeline with childTaskIds and recordPath evidence, and writes an AI 项目拆解自检 task record when review context exists.',
    ],
    gaps: [
      'Future Agent API decomposition generation is still not the primary task-bound runtime path; if promoted, it should surface the same reversible proposal card before confirmation.',
    ],
    nextActions: [
      'When Agent API execution is promoted, keep its draft generation task-bound and feed confirmation through TaskplaneWritebackApplyPlan.',
    ],
  },
  {
    id: 'subtask_start_and_task_switch',
    label: 'Subtask start, task switch, and handoff',
    priority: 'p0',
    status: 'covered',
    boundaries: ['execute', 'persist', 'clear'],
    movements: ['handoff', 'execute', 'persist'],
    ruleSkills: [
      'goalpilot.task_router',
      'agent.execution_rules',
      'task.memory_rules',
      'agent.output_contract',
      'decision.writeback_orchestration',
    ],
    writeIntents: ['task_record.create', 'task.update_next_step'],
    gates: [
      'runtime_handoff',
      'task_memory_coverage',
      'task_memory_guidance',
      'subtask_start',
      'task_completion',
      'task_mutation',
      'pre_step',
      'post_step',
      'panel_event_allowlist',
    ],
    cliOnlyClosure: 'supported',
    futureApiClosure: 'supported',
    evidence: [
      'SubtaskStartEvaluation covers target boundary, blockers, decisions, handoff, context cleanliness, and context sufficiency.',
      'RuntimeHandoff is shared across task switch and context refresh flows.',
    ],
    gaps: [
      'Future explicit task-enter actions must keep using SubtaskStartEvaluation before execution.',
    ],
    nextActions: [
      'Keep task-enter paths registered in RuntimeEntrypointCoverage with subtask_start.',
    ],
  },
  {
    id: 'task_memory_and_context_clear',
    label: 'Task.md, Task Records, Source Context, and context clearing',
    priority: 'p0',
    status: 'partial',
    boundaries: ['persist', 'clear'],
    movements: ['persist', 'handoff', 'pause'],
    ruleSkills: [
      'goalpilot.task_router',
      'task.memory_rules',
      'agent.output_contract',
      'decision.writeback_orchestration',
    ],
    writeIntents: ['task_record.create', 'source_context.create', 'task_file.propose'],
    gates: [
      'task_memory_coverage',
      'task_memory_guidance',
      'runtime_handoff',
      'runtime_action',
      'task_mutation',
      'operator_confirmation',
    ],
    cliOnlyClosure: 'supported',
    futureApiClosure: 'supported',
    evidence: [
      'TaskMemoryCoverageEvaluation and AutoContextClearReadiness block unsafe context clearing.',
      'SourceContext creation carries source-quality metadata before persistence.',
      'Manual task-session refresh now asks shared TaskAdvancementOrchestrator for a context-refresh handoff movement before existing memory and clearing gates run.',
      'TaskMemoryWriteProposal now routes Task Record proposals through TaskRecordWorthinessEvaluation and suppresses generic pending-memory guidance before durable Task Records are proposed.',
    ],
    gaps: [
      'Future non-RightPanel task-memory confirmation surfaces must reuse TaskMemoryWriteApplyPlan and TaskRecordWorthinessEvaluation instead of rebuilding Task Record writes.',
    ],
    nextActions: [
      'Extend the same write-intent proposal/apply boundary to future task-memory surfaces as they appear.',
    ],
  },
  {
    id: 'decisions_checkpoints_completion',
    label: 'Decisions, checkpoints, blockers, and completion',
    priority: 'p0',
    status: 'partial',
    boundaries: ['propose', 'persist'],
    movements: ['pause', 'verify', 'persist', 'handoff'],
    ruleSkills: [
      'goalpilot.task_router',
      'agent.execution_rules',
      'agent.output_contract',
      'task.memory_rules',
      'decision.writeback_orchestration',
    ],
    writeIntents: ['decision.create', 'task.mark_blocked', 'task.complete.propose', 'task.update_next_step'],
    gates: [
      'decision_draft_boundary',
      'decision_write_boundary',
      'decision_action',
      'checkpoint_eligibility',
      'task_completion',
      'pre_step',
      'post_step',
      'operator_confirmation',
    ],
    cliOnlyClosure: 'partial',
    futureApiClosure: 'partial',
    evidence: [
      'Decision services and checkpoint recovery are registered as runtime entrypoints.',
      'Native CLI Write Intent can surface user-confirmed Decision, blocker, next-step, and completion proposal cards.',
      'Shared writeback dispatch applies high-risk plans through injected service ports.',
      'Main-side writeback dispatch adapter routes confirmed plans through task, decision, and task-file services.',
      'Right-panel confirmation calls the main-side writeback adapter before emitting task, decision, and brief refresh events.',
      'Task Dynamics can approve Run-detail structured Write Intent through the same TaskplaneWritebackApprovalItem queue and main-side writeback adapter.',
      'Completion verification is separate from model output.',
      'Right-panel phase closeout now asks shared TaskAdvancementOrchestrator for a local verification movement before memory, closeout, and handoff gates run.',
      'Task completion modal now asks shared TaskAdvancementOrchestrator for a local completion-check verification movement before passed, waiting, or override-completed outcomes are recorded.',
      'Tasks detail project verification now asks shared TaskAdvancementOrchestrator for a selected-task verification movement before rendering local project readiness evidence.',
    ],
    gaps: [
      'Future background scheduler decisions must still surface operator approval before invoking main-side writeback dispatch.',
    ],
    nextActions: [
      'Reuse the Task Dynamics writeback approval queue for any future non-panel runtime review surface.',
    ],
  },
  {
    id: 'task_files_artifacts_local_writes',
    label: 'Task files, artifacts, local writes, and sandbox promotion',
    priority: 'p0',
    status: 'partial',
    boundaries: ['propose', 'persist', 'execute'],
    movements: ['execute', 'verify', 'persist'],
    ruleSkills: [
      'goalpilot.task_router',
      'agent.execution_rules',
      'agent.output_contract',
      'decision.writeback_orchestration',
      'native.runtime_orchestration',
    ],
    writeIntents: ['task_file.propose', 'artifact.propose'],
    gates: [
      'runtime_action',
      'task_mutation',
      'pre_step',
      'post_step',
      'operator_confirmation',
    ],
    cliOnlyClosure: 'partial',
    futureApiClosure: 'partial',
    evidence: [
      'Sandboxed coding and patch promotion keep local writes behind review or confirmation boundaries.',
      'Native CLI task_file.propose Write Intent is parsed into the existing confirmed task-file proposal surface and main-side writeback apply plan.',
      'Native CLI artifact.propose Write Intent is parsed into a confirmed task artifact proposal and saved through the main-side ArtifactRepository port as run-backed evidence.',
      'Native CLI artifact.propose kind=patch is validated as reviewable diff evidence and routed to ArtifactRepository.createPatchFromRun after confirmation.',
      'Run-backed patch artifacts can now feed SandboxPatchReviewPlanningService as imported_patch_artifact sources, keeping workspace promotion behind sandbox review and Decision approval.',
      'Tasks file workspace now surfaces a confirmed patch artifact sandbox-review preview action through main-side IPC, returning changed files, checks, idempotency, and an explicit no-workspace-write guarantee.',
      'Tasks file workspace can run sandbox review from a confirmed patch artifact, creating a new audit Run, reviewed patch artifact, promotion checkpoint, and pending Decision without writing workspace files.',
      'Tasks file workspace projects patch-promotion checkpoint and Decision status next to reviewed patch artifacts, including the disabled-by-default workspace apply boundary.',
      'SandboxPatchPromotionApplyService can apply approved patch-promotion checkpoints when enableSandboxPatchPromotionApply is true, with preflight divergence checks, idempotency handling, and applied/blocked promotion records.',
      'Run detail carries sandboxPatchPromotions so Tasks file workspace can distinguish pending, approved-but-unapplied, missing-apply-record, applied, and blocked reviewed-patch promotions.',
      'Decisions approval feedback now calls out the apply flag plus promotion preflight boundary after a reviewed-patch approval, so operators are not led to assume approval always wrote workspace files.',
      'Tasks file workspace refreshes the selected task Run detail when a Decision changes, so reviewed-patch promotion notices can move from waiting approval to approved/no-write without a manual page refresh.',
      'Tasks file workspace can explicitly apply approved reviewed-patch promotions when enableSandboxPatchPromotionApply is true; the action stays behind operator confirmation, main-side IPC, promotion preflight, and applied/blocked run evidence.',
      'Local agent acceptance now runs the reviewed patch promotion apply smoke against built main-process modules, covering default no-write approval, feature-flagged apply success, and blocked workspace-drift recovery evidence without Docker or provider calls.',
      'Packaged task-files smoke now covers the explicit reviewed-patch apply UI path against a temporary workspace, including applied promotion state, touched-file run evidence, blocked workspace-drift state, and no-write recovery evidence.',
      'Blocked promotion notices now explicitly say that the workspace was not written and point operators back to Run evidence before re-reviewing or regenerating the patch.',
      'Native CLI workspace_write capability steps now require patch artifact, ready task_file Write Intent, ready patch artifact Write Intent, or patch-review promotion evidence during post-step verification.',
    ],
    gaps: [
      'Workspace-write promotion remains intentionally Decision-gated and disabled by default; the explicit apply action should stay outside the normal happy path until post-apply verification copy is clearer across UI surfaces.',
    ],
    nextActions: [
      'Improve post-apply verification copy across Tasks, Decisions, and Run detail surfaces.',
    ],
  },
  {
    id: 'capabilities_external_skills_mcp',
    label: 'External Access, Skills, MCP, browser tools, and runtime capability gates',
    priority: 'p0',
    status: 'partial',
    boundaries: ['configure', 'execute', 'persist'],
    movements: ['research', 'execute', 'persist'],
    ruleSkills: [
      'goalpilot.task_router',
      'agent.execution_rules',
      'agent.output_contract',
      'decision.writeback_orchestration',
      'native.runtime_orchestration',
    ],
    writeIntents: ['source_context.create', 'none'],
    gates: [
      'capability_probe_boundary',
      'runtime_context_assembly',
      'runtime_action',
      'product_config_boundary',
      'operator_confirmation',
    ],
    cliOnlyClosure: 'partial',
    futureApiClosure: 'partial',
    evidence: [
      'CapabilityRegistry keeps optional tools hidden until runtime gates expose model-visible tools.',
      'Skills page separates product runtime rules from optional user skills.',
      'Agent CLI runtime status now carries adapter-level native capability declarations for structured events, runtime-dependent web/search, workspace read/write boundaries, hooks, subagents, and product-controlled memory/clear/compact.',
      'Agent CLI status probes parse lightweight provider help output for structured-event, hook-event, and native agent/subagent signals when the installed CLI exposes them.',
      'Agent CLI status probes now combine top-level and execution help output to detect native web/search activation, resume support, compact/clear context affordances, plan/read-only affordances, Claude hook events, Claude agents, and native memory-loading signals.',
      'Agent CLI status probes also inspect the configured workspace for native guidance and lifecycle assets such as AGENTS.md, CLAUDE.md, .claude/settings hooks, and .claude/agents without executing the runtime.',
      'AI Runtime settings surfaces those declarations as per-runtime capability chips before execution, including native/search, hooks, subagents, memory, compact, clear, and write boundaries.',
      'Probed native compact/clear signals are promoted into adapter capability support while context reset still requires Taskplane preservation gates and persistent-session ownership before a runtime-native reset strategy can be selected.',
      'Run Goal Contract and Agent CLI context bridge pass selected-runtime capability declarations into native CLI prompts.',
      'Runtime-native goal audit runs now attach the shared native goal forwarding readiness summary, missing evidence, and closed boundary notes without executing the CLI.',
      'Native CLI provider events are projected into runtime-neutral capability progress states for web search, workspace reads/writes, command execution, MCP, and hooks.',
      'Native CLI capability-tagged web/search events and Taskplane web research bridge results are summarized in run progress or completion output.',
      'Fresh external research wording such as latest/current pricing or recent release changes is now covered by the pre-run web research trigger while local current-task wording remains excluded.',
    ],
    gaps: [
      'Runtime capability probes still need deeper provider-specific readiness checks for exact native web/search behavior, hook config semantics, and packaged CLI metadata as providers stabilize non-executing signals.',
    ],
    nextActions: [
      'Add optional runtime-specific metadata probes for provider-owned capability files and search readiness when stable non-executing locations are available.',
      'Keep native goal passthrough closed until command shape, progress/control evidence, and packaged smoke move from audit output into verified adapter evidence.',
    ],
  },
  {
    id: 'work_habits_settings_scheduled',
    label: 'Work Habits, settings, scheduled/routine/event-triggered work',
    priority: 'p1',
    status: 'partial',
    boundaries: ['configure', 'persist', 'execute'],
    movements: ['shape', 'execute', 'persist'],
    ruleSkills: [
      'goalpilot.task_router',
      'agent.execution_rules',
      'task.memory_rules',
      'decision.writeback_orchestration',
    ],
    writeIntents: ['work_habit.propose', 'task_record.create'],
    gates: [
      'preference_boundary',
      'product_config_boundary',
      'method_library_boundary',
      'runtime_context_assembly',
      'operator_confirmation',
      'post_step',
    ],
    cliOnlyClosure: 'partial',
    futureApiClosure: 'partial',
    evidence: [
      'Work habits are selected as applicable context and stay behind confirmation flows.',
      'Scheduled briefs use product-harness fallback when provider execution is unavailable.',
      'RuntimeEntrypointCoverage now classifies scheduler stale-run recovery as scheduler_maintenance behind the scheduler feature flag, with post-step Run evidence and no Agent CLI/API startup.',
      'AgentAutomationReadiness now keeps scheduled, event-triggered, and routine tasks diagnostic-only for automatic starts until a separate scheduled/event execution entrypoint exists, even when procedure, inputs, runtime, risk, and completion criteria are ready.',
    ],
    gaps: [
      'Routine/event-triggered Agent CLI task execution remains intentionally unimplemented; scheduled/event tasks can be diagnosed for readiness but cannot automatically start native runtimes.',
    ],
    nextActions: [
      'Design a separate scheduled/event execution entrypoint and confirmation model before allowing diagnostic-only readiness to become automatic native runtime execution.',
    ],
  },
  {
    id: 'smoke_tests_runtime_readiness_recovery',
    label: 'Smoke tests, packaged runtime, native CLI readiness, and recovery flows',
    priority: 'p1',
    status: 'partial',
    boundaries: ['execute', 'read'],
    movements: ['verify'],
    ruleSkills: [
      'goalpilot.task_router',
      'agent.execution_rules',
      'native.runtime_orchestration',
      'decision.writeback_orchestration',
    ],
    writeIntents: ['none'],
    gates: [
      'capability_probe_boundary',
      'runtime_action',
      'pre_step',
      'post_step',
    ],
    cliOnlyClosure: 'supported',
    futureApiClosure: 'partial',
    evidence: [
      'Codex CLI packaged smoke verifies account readiness, run completion, output capture, and fixture safety.',
      'The packaged Agent CLI live smoke harness now supports a default-skipped Claude Code mode through TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude, preserving the same isolated app data, temporary workspace, terminal-output, and no-workspace-change checks for future account-ready validation.',
    ],
    gaps: [
      'Claude real-account execution smoke has a manual opt-in packaged harness, but a passing run remains pending until account readiness is available.',
    ],
    nextActions: [
      'Run and record the Claude packaged live smoke once local account credentials are available.',
    ],
  },
];

export function findProductFeatureImpactAuditIssues(
  items: ProductFeatureImpactAuditItem[] = PRODUCT_FEATURE_IMPACT_AUDIT,
): ProductFeatureImpactAuditIssue[] {
  const issues: ProductFeatureImpactAuditIssue[] = [];
  const ids = new Set<string>();

  for (const item of items) {
    if (ids.has(item.id)) {
      issues.push({ featureId: item.id, issue: 'Duplicate audit item id.' });
    }
    ids.add(item.id);

    if (!item.ruleSkills.includes('goalpilot.task_router')) {
      issues.push({ featureId: item.id, issue: 'Feature audit item must include the GoalPilot router.' });
    }

    const hasWriteIntent = item.writeIntents.some((intent) => intent !== 'none');
    const crossesWriteBoundary = item.boundaries.some((boundary) => (
      boundary === 'execute' ||
      boundary === 'propose' ||
      boundary === 'persist' ||
      boundary === 'clear' ||
      boundary === 'configure'
    ));

    if (hasWriteIntent && !item.ruleSkills.includes('decision.writeback_orchestration')) {
      issues.push({
        featureId: item.id,
        issue: 'Feature audit item with Write Intent must include decision writeback orchestration.',
      });
    }

    if (crossesWriteBoundary && item.gates.length === 0) {
      issues.push({ featureId: item.id, issue: 'Feature audit item crossing a boundary must declare gates.' });
    }

    if (item.priority === 'p0' && item.cliOnlyClosure === 'missing') {
      issues.push({ featureId: item.id, issue: 'P0 feature audit item must not miss CLI-only closure.' });
    }

    if (item.priority === 'p0' && item.nextActions.length === 0) {
      issues.push({ featureId: item.id, issue: 'P0 feature audit item must declare next actions.' });
    }
  }

  return issues;
}
