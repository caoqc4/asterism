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

const DEFERRED_COMPLETION_SIGNALS = [
  /\b(?:deferred|diagnostic-only|unimplemented|not yet|pending until)\b/i,
  /future (?:agent api|api|provider-visible|scheduled|background|execution|workspace-write)/i,
];

function isClosedRuntimeClosure(closure: ProductFeatureRuntimeClosure): boolean {
  return closure === 'supported' || closure === 'not_applicable';
}

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
    cliOnlyClosure: 'supported',
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
      'Right-panel progress and completion summaries include the Taskplane web research query when Source Context is captured, so operators can connect saved sources back to the triggering research request.',
      'Pre-run web research trigger conditions ignore bare runtime names and generic current-task wording, so selecting Codex CLI or Claude Code does not itself request external research.',
      'Pre-run web research trigger conditions now recognize fresh external requests such as latest/current pricing, current API status, and recent release changes without treating current-task wording as research.',
      'The non-live Agent CLI web research bridge smoke exercises fresh/current trigger detection, mocked OpenAI web_search output, Source Context persistence, the preparation Run step, and renderer progress mapping without calling external networks.',
      'Context readiness now requires non-low-credibility fresh Source Context evidence for latest/current external requests, rejects stale, future-dated, or low-credibility source evidence, and still honors explicit no-research opt-outs before self_research routing.',
      'Codex JSONL command_execution items are projected as shell_command run steps, so right-panel progress can show local command activity instead of only raw terminal output.',
      'Agent CLI stdout JSONL lines are now projected into Run steps while the native process is still running, with completion-time transcript parsing kept as a fallback.',
      'Right-panel Agent CLI progress now distinguishes native workspace_write capability events as no-direct-write reviewable write candidates that require patch artifact, ready task_file Write Intent, ready patch artifact Write Intent, or patch-review/promotion evidence instead of presenting them as ordinary workspace activity.',
      'Completed native run chat summaries now mention local command or workspace activity as well as web research activity, while workspace_write steps are prioritized as no-direct-write reviewable write candidates instead of ordinary local activity even when web activity is also present.',
      'Right-panel task chat now runs through shared PilotDecision and TaskAdvancementOrchestrator before Agent CLI launch, preserving operation mode, backendPlan, message priority, user-owned approval boundaries, and executor routing.',
      'Agent CLI run records preserve the trimmed Pilot decision snapshot as a Pilot 决策辅助计划 step for phase-2 auditability.',
      'Agent API chat invocations preserve the same trimmed Pilot decision snapshot in invocation provenance.',
      'Retained API Runtime / Agent API-like RunService runs now record context.readiness.evaluate before provider-visible execution resolves runtime config.',
      'Code Agent model-producer / future Agent API compatibility runs now record context.readiness.evaluate before model-producer execution, including blocked early exits.',
      'Shared AI Runtime invocation contract now includes an explicit skipped execution_run shape for deferred Agent API task execution, with promotionReady=no, promotionRequirements=0/11, and requiredGates=0/9 summary evidence; Agent API capability diagnostics also label execution_run as deferred so API Runtime can be represented without silently starting provider-visible work.',
      'Deferred Agent API execution_run invocations now carry the future provider-visible execution required gates, including runtime context assembly, context_readiness, task-memory guidance, subtask_start, and post_step, as structured metadata rather than text-only rationale.',
      'Deferred Agent API execution_run invocations now also carry structured promotion requirements for selected-runtime contract, target-task identity, provider-visible preflight, runtime context manifest, context readiness, task-memory guidance, Run Goal Contract, Write Intent extraction, reviewed-patch apply boundary, post-step verification, and Run evidence persistence.',
      'evaluateAgentApiExecutionPromotionReadiness now keeps Agent API execution promotion closed until every structured requirement and future provider-visible execution gate has matching service evidence.',
      'evaluateAgentApiExecutionPromotionReadinessForInvocation now derives the same closed promotion readiness directly from deferred Agent API execution_run invocation evidence.',
      'Agent API capability registry diagnostics now derive deferred execution_run key gates from the future provider-visible execution contract, so settings and safety reports expose context, task-memory, subtask-start, and post-step boundaries without parsing invocation text.',
      'The opt-in Agent API execution preflight smoke verifies provider-visible text-call readiness through the shared provider mapping while defaulting to provider=not-called, executionRun=deferred, promotionReady=no, promotionRequirements=0/11, requiredGates=0/9, and workspace=unchanged.',
      'Local Agent API execution preflight evidence on 2026-05-26 passed with fal-openrouter / google/gemini-2.5-flash, provider=called, phrase=matched, workspace=unchanged, and status=passed.',
      'Run Goal Contract and Agent CLI context bridge now carry selected-runtime capability declarations into the native CLI prompt before execution.',
      'Run verification and memory proposals remain product-controlled.',
      'Post-step verification now treats native CLI capability=workspace_write steps as workspace write candidates that require reviewable promotion evidence instead of accepting ordinary command output as sufficient recovery evidence.',
      'Approved patch-promotion Decisions can call SandboxPatchPromotionApplyService when the sandbox patch promotion apply feature flag is enabled; the service preflights reviewed patch evidence, writes only matching workspace files, records applied/blocked promotion state, and updates run evidence.',
      'Run detail now includes sandbox patch promotion records, and the task file workspace projects applied, blocked, approved-but-unapplied, and missing-apply-record status next to reviewed patch artifacts.',
      'Decisions approval results now explain that approving a reviewed patch records the approval while real workspace writes still require the apply flag and a passing promotion preflight.',
      'Tasks file workspace exposes explicit notice and file context-menu apply-to-workspace actions for approved reviewed-patch promotions when enableSandboxPatchPromotionApply is enabled; the action confirms with the operator, calls main-side promotion apply IPC, records run evidence, and refreshes task/run state.',
      'Local agent acceptance includes a reviewed patch promotion apply smoke covering default approval no-write, feature-flagged apply success, and workspace-drift blocked recovery evidence.',
      'The packaged task-files smoke now seeds approved reviewed-patch promotions, enables the apply flag in a temporary workspace, drives both applied and blocked Tasks UI apply actions, and verifies workspace file content plus applied/blocked run evidence.',
    ],
    gaps: [
      'Future Agent API execution remains deferred; native CLI workspace-write mode stays separate from the common run path because selected-runtime contract and reviewed-patch apply already own the operator-facing workspace mutation boundary.',
    ],
    nextActions: [
      'Promote future Agent API execution only by replacing the deferred invocation after evaluateAgentApiExecutionPromotionReadiness reports ready with matching service evidence for every requirement and gate.',
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
      'Subtask create-many writeback timeline evidence now records that decomposition output was draft-only before operator confirmation.',
      'The retained Agent API decomposition confirmation path now builds an agent_api_decomposition subtask.create_many apply plan instead of writing child tasks directly from the renderer.',
      'evaluateAgentApiDecompositionPromotionReadiness now keeps future Agent API decomposition promotion closed unless the draft has a selected-runtime contract, parent-task identity, a reversible proposal card, an agent_api_decomposition subtask.create_many apply plan, an operator-confirmed create-many boundary, and draft-only timeline evidence.',
      'Agent API decomposition promotion readiness now returns satisfied and missing requirement lists plus requirements=x/7 and missingRequirements=... summary evidence, matching the execution promotion readiness style without opening the deferred path.',
      'Agent API task execution has a shared deferred execution_run invocation shape, so future API execution can join the same invocation contract before durable child creation or run execution is promoted.',
      'The main-side subtask apply path promotes the parent to a project, creates planned child tasks, stores child and parent completion criteria, stores matched dependencies, records the project timeline with childTaskIds and recordPath evidence, and writes an AI 项目拆解自检 task record when review context exists.',
    ],
    gaps: [
      'Future Agent API decomposition generation is still not the primary task-bound runtime path; if promoted, it should prove the selected-runtime contract and parent-task identity, then surface the same reversible proposal card before confirmation.',
    ],
    nextActions: [
      'When Agent API decomposition is promoted, require evaluateAgentApiDecompositionPromotionReadiness to pass before feeding confirmation through TaskplaneWritebackApplyPlan.',
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
    status: 'covered',
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
      'Task Dynamics now surfaces run-detail task-memory proposals through the same TaskMemoryWriteApplyPlan-backed approval queue and main-side writeback IPC outside the right panel.',
      'MemorySurfaceWriteCoverage registers retained task-memory proposal confirmation entrypoints for RightPanel and Task Dynamics, requiring TaskMemoryWriteApplyPlan, TaskMdUpdateNeedEvaluation, TaskRecordWorthinessEvaluation, pre-step, post-step, and simplicity guards.',
      'MemorySurfaceWriteCoverage binds retained task-memory write IPC channels to the same surface coverage matrix, so covered memory-write paths declare their surfaces, policies, guards, and service boundary before they count as retained behavior.',
    ],
    gaps: [
      'Future retained task-memory confirmation surfaces must be added to MemorySurfaceWriteCoverage before they count as covered behavior.',
    ],
    nextActions: [
      'Keep future task-memory proposal surfaces registered in MemorySurfaceWriteCoverage and routed through TaskMemoryWriteApplyPlan plus main-side writeback dispatch.',
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
    cliOnlyClosure: 'supported',
    futureApiClosure: 'partial',
    evidence: [
      'Decision services and checkpoint recovery are registered as runtime entrypoints.',
      'Native CLI Write Intent can surface user-confirmed Decision, blocker, next-step, and completion proposal cards.',
      'Shared writeback dispatch applies high-risk plans through injected service ports.',
      'Main-side writeback dispatch adapter routes confirmed plans through task, decision, and task-file services.',
      'Right-panel confirmation calls the main-side writeback adapter before emitting task, decision, and brief refresh events.',
      'Task Dynamics can approve Run-detail structured Write Intent through the same TaskplaneWritebackApprovalItem queue and main-side writeback adapter.',
      'DecisionService.draft is registered as a task-bound decision_draft entrypoint: API-runtime drafts run only when API Runtime is selected, selected Agent CLI modes stay product_harness/skipped, and Decision persistence remains behind decision.create.',
      'Approved checkpoint Decision resume is limited to open tool_permission, browser-controlled, or patch-promotion checkpoints, rechecks target-task readiness and pending task-memory guidance, and cannot turn ordinary Decision approval into arbitrary tool execution.',
      'Decision actions in DecisionService and DecisionsPage pass through decision_action, task-memory guidance, pre-step, and post-step gates before approve, defer, or cancel effects are recorded.',
      'RuntimeEntrypointCoverage now registers future scheduler/background Decisions as proposal-only decision_draft work that cannot persist Decisions or invoke writeback without operator confirmation or standing approval.',
      'planSchedulerDecisionProposal now models the scheduler/background Decision proposal boundary as approval-item-only: it requires target-task identity, the Task Dynamics writeback approval queue, plus operator confirmation or active Standing Approval, while keeping decisionPersistenceAllowed=false, writebackDispatchAllowed=false, and schedulerTriggerAllowed=false.',
      'Scheduler/background Decision proposal plans now return satisfied and missing requirement lists plus requirements=x/3 and missingRequirements=... summary evidence without opening Decision persistence, writeback dispatch, or scheduler triggers.',
      'Future scheduler/background Decision drafts also remain without IPC or scheduler triggers until that same operator-confirmation or standing-approval model exists.',
      'Completion verification is separate from model output.',
      'Right-panel phase closeout now asks shared TaskAdvancementOrchestrator for a local verification movement before memory, closeout, and handoff gates run.',
      'Task completion modal now asks shared TaskAdvancementOrchestrator for a local completion-check verification movement before passed, waiting, or override-completed outcomes are recorded.',
      'Tasks detail project verification now asks shared TaskAdvancementOrchestrator for a selected-task verification movement before rendering local project readiness evidence.',
    ],
    gaps: [
      'Future background scheduler decisions have a deferred proposal-only contract; wiring it still requires an operator confirmation or standing-approval model before main-side writeback dispatch.',
    ],
    nextActions: [
      'Reuse planSchedulerDecisionProposal and the Task Dynamics writeback approval queue for any future non-panel runtime review surface before enabling writeback dispatch or scheduler triggers.',
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
    cliOnlyClosure: 'supported',
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
      'When enableSandboxPatchPromotionApply is false, approved-but-unapplied reviewed-patch notices now explicitly state that the approval is still no-write, the apply flag is closed, Run evidence must be re-reviewed, and no apply-to-workspace action is available.',
      'Approved-but-unapplied reviewed-patch notices show a disabled apply-to-workspace action when the apply flag is closed, making the default no-write boundary visible without exposing a mutation path.',
      'ConfigurationSafetyReport now describes sandbox patch promotion apply as an explicit operator action that still requires reviewed patch evidence, operator confirmation, and promotion preflight, and says disabled apply keeps apply-to-workspace actions hidden.',
      'Local agent acceptance now runs the reviewed patch promotion apply smoke against built main-process modules, covering default no-write approval, feature-flagged apply success, and blocked workspace-drift recovery evidence without Docker or provider calls.',
      'Packaged task-files smoke now covers the explicit reviewed-patch apply UI path against a temporary workspace, including applied promotion state, touched-file run evidence, blocked workspace-drift state, and no-write recovery evidence.',
      'Blocked promotion notices now explicitly say that the workspace was not written and point operators back to Run evidence before re-reviewing or regenerating the patch.',
      'Applied promotion notices now point operators back to Run evidence to review touched files and post-apply verification results.',
      'Tasks file workspace apply guidance now states that only reviewed patch files passing promotion preflight are written, drift blocks apply, and Run evidence must be reviewed after completion.',
      'Sandbox patch promotion readiness now returns satisfied and missing requirement lists plus requirements=x/12 summary evidence before any workspace apply service can run.',
      'Native CLI workspace_write capability steps now require patch artifact, ready task_file Write Intent, ready patch artifact Write Intent, or patch-review promotion evidence during post-step verification.',
      'Terminal Run verification now carries same-run artifacts and checkpoints into post-step self-checks when repository evidence is available, so run-backed patch artifacts and patch-promotion checkpoints can satisfy workspace_write promotion evidence instead of being invisible to terminal verification.',
      'evaluateRuntimePatchPromotionRoutingReadiness now keeps future API/runtime-generated patch promotion blocked unless the path includes a selected-runtime contract, target-task identity, same-run patch artifact, promotion Decision, promotion preflight, explicit operator apply, and post-apply Run evidence.',
      'Runtime patch promotion readiness now returns satisfied and missing requirement lists plus requirements=x/8 and missingRequirements=... summary evidence, matching the Agent API promotion readiness style without opening direct workspace writes.',
    ],
    gaps: [
      'Future API/runtime-generated patch promotion still needs to prove the selected-runtime contract, target-task identity, and reuse the reviewed-patch apply workflow and same-run evidence chain; direct workspace-write runtime modes remain intentionally separate from the common run path.',
    ],
    nextActions: [
      'Keep explicit apply as the product-controlled mutation path and require evaluateRuntimePatchPromotionRoutingReadiness before routing future runtime writes into selected-runtime, target-task, same-run patch artifacts, promotion Decisions, promotion preflight, explicit apply, and post-apply Run evidence.',
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
    cliOnlyClosure: 'supported',
    futureApiClosure: 'partial',
    evidence: [
      'CapabilityRegistry keeps optional tools hidden until runtime gates expose model-visible tools.',
      'Skills page separates product runtime rules from optional user skills.',
      'Agent CLI runtime status now carries adapter-level native capability declarations for structured events, runtime-dependent web/search, workspace read/write boundaries, hooks, subagents, and product-controlled memory/clear/compact.',
      'Agent CLI status probes parse lightweight provider help output for structured-event, hook-event, and native agent/subagent signals when the installed CLI exposes them.',
      'Agent CLI status probes now combine top-level and execution help output to detect native web/search activation, resume support, compact/clear context affordances, plan/read-only affordances, Claude hook events, Claude agents, and native memory-loading signals.',
      'Agent CLI status probes also inspect the configured workspace for native guidance and lifecycle assets such as AGENTS.md, CLAUDE.md, .claude/settings hooks, and .claude/agents without executing the runtime.',
      'Claude workspace hook metadata probes now require non-empty configured hook commands or hook entries, so empty .claude/settings hook placeholders no longer count as hook readiness.',
      'Claude workspace subagent metadata probes now require usable .claude/agents/*.md files with headings or metadata, so placeholder directories, empty files, or placeholder-only files no longer count as subagent readiness.',
      'Agent CLI workspace metadata probes now read explicit web/search declarations from .codex/config.* and .claude/settings*.json without executing the runtime, and Claude subagent readiness now requires usable agent markdown with a heading or metadata rather than placeholder-only files.',
      'Agent CLI package metadata probes now read explicit provider-owned package.json capability/tool declarations when the executable resolves inside a Codex/OpenAI or Claude/Anthropic package, while ignoring arbitrary wrapper packages.',
      'Agent CLI status now auth-gates native web/search capability promotion, so help/workspace/package metadata cannot make an installed-but-not-logged-in runtime appear search-ready.',
      'CapabilityRegistry now summarizes detected Agent CLI native web/search readiness counts, distinguishing runtime-dependent search support from unverified installed runtimes.',
      'CapabilityRegistry now carries selected Agent CLI native web/search readiness separately from aggregate runtime counts, and downgrades selected native search to unverified when the selected runtime still needs login.',
      'AI Runtime settings now reuse CapabilitySafetyStrip for agent_cli.runtimes, showing shared runtime status, safe-read-only probe policy, and execution boundary before native CLI launch.',
      'AI Runtime settings also reuse CapabilitySafetyStrip for agent_api.runtime, showing provider-backed phase availability, non-startup probe policy, and deferred execution_run boundary.',
      'Agent API Runtime capability summaries now expose executionRunPromotionRequirements=0/11, providerToolReadiness=not_declared, and startupProbe=never, so provider tool/search readiness is not implied by provider configuration or checked through startup calls.',
      'AI Runtime settings surfaces those declarations as per-runtime capability chips before execution, including visible native search, hook, and subagent readiness labels plus memory, compact, clear, and write boundaries.',
      'Probed native compact/clear signals are promoted into adapter capability support while context reset still requires Taskplane preservation gates and persistent-session ownership before a runtime-native reset strategy can be selected.',
      'Run Goal Contract and Agent CLI context bridge pass selected-runtime capability declarations into native CLI prompts.',
      'Runtime-native goal audit runs now attach the shared native goal forwarding readiness summary, missing evidence, and closed boundary notes without executing the CLI.',
      'Native goal forwarding readiness now requires the selected adapter to declare native goal capability before any future explicit passthrough candidate can be ready.',
      'Right-panel runtime-native goal requests now show the native goal forwarding readiness summary and missing evidence in the operator response and panel timeline payload.',
      'Native-goal discovery default output now reports taskplaneGoalLoop=available, nativeGoalForwarding=audit-only, passthrough=closed, and continueWith=taskplane_goal_loop, so a closed runtime-native goal path is not confused with blocked Taskplane task advancement.',
      'Native CLI provider events are projected into runtime-neutral capability progress states for web search, workspace reads/writes, command execution, MCP, and hooks.',
      'Native CLI capability-tagged web/search events and Taskplane web research bridge results are summarized in run progress or completion output.',
      'Agent CLI web research preparation fallback copy now uses the selected runtime native web/search readiness, so skipped bridge steps distinguish verified/runtime-dependent native search from unverified native search instead of implying a hidden fallback.',
      'Fresh external research wording such as latest/current pricing or recent release changes is now covered by the pre-run web research trigger while local current-task wording remains excluded.',
      'A default-skipped manual Agent CLI native web/search smoke now provides an opt-in live evidence path for exact runtime search behavior while reporting cli=not-called, network=not-called, and workspace=unchanged by default.',
      'Codex CLI 0.125.0 passed the opt-in native web/search smoke on 2026-05-27 with auth=ready, workspace=unchanged, phrase=matched, network=called, and status=passed; the smoke records that --search is a top-level Codex option before exec.',
    ],
    gaps: [
      'Future API and optional non-Codex provider compatibility still need deeper provider-specific readiness checks for exact native web/search behavior beyond auth-gated no-start help-output, workspace-metadata, provider-owned package metadata checks, Agent API no-start provider tool/search non-declaration, and the now-recorded Codex opt-in live smoke evidence; this no longer blocks the Codex-verified CLI-first capability path.',
    ],
    nextActions: [
      'Keep adding static readiness probes only when providers expose stable non-executing metadata; record non-Codex provider live smoke opportunistically when local account support is available, not as a CLI-first blocker.',
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
      'RuntimeEntrypointCoverage now registers automation readiness as a diagnostic-only entrypoint with runtime-context assembly but no runtime_action/pre_step/post_step execution gates.',
      'RuntimeEntrypointCoverage now registers scheduled/event/routine Agent execution as a separate gated provider-visible execution contract with scheduler configuration, confirmation, standing approval, context readiness, task-memory, subtask_start, post-step gates, and explicit operator IPC before any background scheduler trigger can exist.',
      'AgentAutomationReadiness now keeps scheduled, event-triggered, and routine tasks diagnostic-only for automatic starts until a separate scheduled/event execution entrypoint exists, even when procedure, inputs, runtime, risk, and completion criteria are ready.',
      'AgentAutomationReadiness now returns satisfied and missing requirement lists plus requirements=x/9 summary evidence, so mature scheduled/event tasks can show that only scheduled_event_entrypoint remains missing.',
      'Read-only orchestration diagnostics now expose the automatic-start boundary, distinguishing manual/operator-started readiness from scheduled/event tasks that require a separate execution entrypoint.',
      'AgentAutomationReadiness now projects an autonomy ladder level and next authorized-action level, so ready tasks surface L1 proposal capability and the standing-approval requirement for future L2 limited autonomous action instead of flattening all automation into disabled.',
      'RuntimeEntrypointCoverage now models standing_approval as an explicit deferred gate for scheduled/event autonomous execution and scheduler/background Decision drafts.',
      'AgentStandingApprovalPolicy and evaluateStandingApprovalForAutomation now provide a narrow shared policy surface for L2 limited autonomous action, checking active status, expiry, task scope, lane, runtime, risk ceiling, daily run limit, visible reason, and existing automation readiness before any future scheduler trigger can use it; the evaluation now returns satisfied and missing requirement lists plus requirements=x/13 summary evidence.',
      'buildStandingApprovalConfirmationDraft now creates a confirmation-only L2 authorization draft with policy, evaluation, scope summary, and explicit schedulerTriggerAllowed=false / workspaceWriteAllowed=false boundaries; it only tolerates the known scheduled/event entrypoint blocker and blocks other automation readiness gaps.',
      'TasksPage Task Dynamics now exposes the Standing Approval draft for scheduled/event/routine tasks as an operator card, making the L2 authorization shape visible while keeping scheduler triggers and workspace writes unavailable.',
      'TasksPage can now confirm the Standing Approval draft into a panel.standing_approval_confirmed Task Dynamics event through the existing TaskService timeline mutation guard, while still leaving schedulerTriggerAllowed=false and workspaceWriteAllowed=false.',
      'planScheduledEventAgentTrigger now acts as the shared scheduled/event trigger planner: it consumes confirmed Standing Approval Task Dynamics records, re-checks runtime readiness, task readiness, policy expiry/scope/risk, task automation class, and returns runtimeStartAllowed=true only when a dedicated trigger service is connected and daily run-limit count evidence is present.',
      'Scheduled/event trigger plans now expose runtimeStartSatisfiedRequirements and runtimeStartMissingRequirements plus runtimeStartRequirements=x/3 summary evidence for trigger_plan_ready, scheduler_trigger_service, and run_limit_count.',
      'SchedulerService.diagnoseScheduledEventAgentTriggers now wires that planner to a no-start scheduler diagnostic entrypoint: it reads selected-runtime readiness through AI config status, returns ready/blocked scheduled-event plans, and does not resolve runtime config, schedule a trigger job, or start native runtimes.',
      'Scheduled/event trigger planning now accepts explicit daily run-limit accounting input and blocks ready plans when Standing Approval maxRunsPerDay has been reached, while still keeping runtimeStartAllowed=false.',
      'RunRepository.countCreatedSinceByTask now gives SchedulerService a real no-start daily run-count source for scheduled/event diagnostics, so run-limit blocking can be based on persisted same-day Run records instead of caller-supplied test data.',
      'Scheduled/event trigger plans now carry the trigger Run evidence contract for context readiness, target-task identity, task-memory coverage, task-memory guidance, subtask_start, run-limit count, and post-step evidence.',
      'SchedulerService.triggerScheduledEventAgentRun now provides a narrow main-side trigger-service connection: it requires an injected Code Agent trigger port, reuses Standing Approval and persisted same-day run-limit checks, starts only ready plans with schedulerTriggerServiceConnected=true, and emits a bounded model-producer Code Agent run request with operatorConfirmed=true plus Standing Approval policy id, runtime-start requirement evidence, and run-limit evidence.',
      'Task Dynamics now exposes a confirmed Standing Approval "启动一次" operator action backed by scheduler:triggerScheduledEventAgentRun IPC, so scheduled/event tasks can start one bounded Agent run without enabling a background scheduler job.',
      'SchedulerService.triggerScheduledEventAgentRun now records panel.scheduled_event_agent_triggered timeline evidence after a run starts, preserving run id, run status/outputSource/failureReason, target task id, Standing Approval policy id, run-limit state, runtime-start satisfied/missing requirements, schedulerTriggerServiceConnected, runtimeStartAllowed, and required trigger evidence in Task Dynamics.',
      'SchedulerService.runScheduledEventAgentTriggerSweep wires the same trigger service into a 15-minute background scheduler job only when the Code Agent trigger port, Task Dynamics timeline port, and scheduled/event task-source port are all connected; the sweep reuses persisted run-limit counts and the shared planner before starting any run.',
      'Blocked scheduled/event Agent sweeps now expose missingPorts=run_port,timeline_port,task_source_port summary evidence instead of hiding automatic-start blockers behind a generic skipped status.',
      'SchedulerService.runScheduledEventAgentTriggerSweep now increments the in-sweep run-limit count after each started run, so duplicate candidates in one sweep cannot exceed the Standing Approval daily cap.',
      'The scheduled/event Agent sweep smoke now exercises the built main SchedulerService sweep path without provider calls or Docker, proving checked=2 duplicate candidates, started=1, blocked=1 by in-sweep run-limit counting, triggerRunEvidence=passed, runLimitEvidence=passed, runtimeStartRequirements=passed, targetTaskId timeline evidence, timelineEvidence=recorded, runStatusEvidence=recorded, workspace=unchanged, provider=not-called, and docker=not-started.',
    ],
    gaps: [
      'Routine/event-triggered Agent task execution now has a narrow trigger-service connection, explicit operator IPC, Task Dynamics launch action, trigger timeline evidence, background scheduler job wiring, and a local sweep smoke, but it still needs broader runtime coverage and live soak evidence before it can count as complete L2 automatic native runtime start.',
    ],
    nextActions: [
      'Broaden scheduled/event runtime coverage only after live background-triggered execution proves context readiness, task-memory, subtask_start, durable run-limit counting, terminal Run evidence, and post-step gates across the selected native runtime path.',
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
      'Default-skipped packaged Agent CLI live smoke output now states accountReadiness=not-checked and manualEvidence=not-recorded, so skipped Codex/Claude runs cannot be mistaken for account-ready acceptance evidence.',
      'The non-live smoke:agent-cli-web-research bridge smoke locks fresh/current trigger detection, mocked OpenAI web_search output, Source Context persistence, preparation Run progress, and renderer progress mapping without external network or provider calls.',
      'The manual Agent CLI native web/search smoke is default-skipped and reports cli=not-called, network=not-called, and workspace=unchanged unless explicitly enabled for one live native search request.',
      'The Codex native web/search smoke passed locally on 2026-05-27 with codex-cli 0.125.0, auth=ready, workspace=unchanged, phrase=matched, network=called, and status=passed.',
      'Claude Code 2.1.144 stream-json execution now uses --verbose in smoke harnesses; a 2026-05-26 focused probe reached provider execution and returned 401 authentication_failed while preserving workspace safety.',
      'Claude live smoke is tracked as optional secondary adapter compatibility evidence; it must not block Codex CLI, Agent API, scheduled/event, or writeback acceptance progress.',
    ],
    gaps: [
      'Optional Claude real-account execution smoke has a manual opt-in packaged harness, but a passing run remains pending until account readiness is available; this is not a mainline product-completion blocker while Codex CLI live evidence exists.',
    ],
    nextActions: [
      'Continue non-Claude runtime and recovery coverage first; run Claude packaged live smoke only opportunistically when local account credentials are available.',
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

    if (item.status !== 'covered' && item.gaps.length === 0) {
      issues.push({ featureId: item.id, issue: 'Uncovered feature audit item must declare current gaps.' });
    }

    if (item.priority === 'p0' && item.nextActions.length === 0) {
      issues.push({ featureId: item.id, issue: 'P0 feature audit item must declare next actions.' });
    }

    if (item.status !== 'covered' && item.priority !== 'p0' && item.nextActions.length === 0) {
      issues.push({ featureId: item.id, issue: 'Uncovered feature audit item must declare next actions.' });
    }

    if (
      item.status === 'covered' &&
      item.evidence.some((evidence) => (
        DEFERRED_COMPLETION_SIGNALS.some((signal) => signal.test(evidence))
      ))
    ) {
      issues.push({
        featureId: item.id,
        issue: 'Covered feature audit item must not use deferred or future-only evidence as completion proof.',
      });
    }

    if (
      item.status === 'covered' &&
      (!isClosedRuntimeClosure(item.cliOnlyClosure) || !isClosedRuntimeClosure(item.futureApiClosure))
    ) {
      issues.push({
        featureId: item.id,
        issue: 'Covered feature audit item must not have partial or missing runtime closure.',
      });
    }
  }

  return issues;
}
