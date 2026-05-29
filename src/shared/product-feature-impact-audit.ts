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
      'Right-panel completed-run summaries also surface persisted source_context_ids or the Source Context batch id for captured web research, so saved sources are traceable from the chat summary back to durable evidence.',
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
      'Code Agent model-producer live and preview smokes default to skipReason=opt_in_required with provider=not-called, docker=not-started, and workspace=unchanged; explicitly enabled runs with incomplete provider config report skipReason=config_missing without provider, Docker, or workspace effects.',
      'Shared AI Runtime invocation contract now includes an explicit skipped execution_run shape for deferred Agent API task execution, with promotionReady=no, promotionRequirements=0/11, requiredGates=0/9, promotionMissingRequirements=..., executionRunMissingRequirements=..., and missingGates=... summary evidence; Agent API capability diagnostics also label execution_run as deferred so API Runtime can be represented without silently starting provider-visible work.',
      'Deferred Agent API execution_run invocations now carry the future provider-visible execution required gates, including runtime context assembly, context_readiness, task-memory guidance, subtask_start, and post_step, as structured metadata rather than text-only rationale.',
      'Deferred Agent API execution_run invocations now also carry structured promotion requirements for selected-runtime contract, target-task identity, provider-visible preflight, runtime context manifest, context readiness, task-memory guidance, Run Goal Contract, Write Intent extraction, reviewed-patch apply boundary, post-step verification, and Run evidence persistence.',
      'evaluateAgentApiExecutionPromotionReadiness now keeps Agent API execution promotion closed until every structured requirement and future provider-visible execution gate has matching service evidence.',
      'evaluateAgentApiExecutionPromotionReadinessFromEvidence now derives Agent API execution promotion readiness from structured service evidence for selected-runtime contract, target-task identity, provider-visible preflight, context manifest, context readiness step, task-memory guidance, Run Goal Contract, Write Intent extraction, reviewed-patch apply boundary, post-step verification, Run evidence persistence, and runtime gates, requires persisted post-run Run evidence task identity to match targetTaskId before target_task_identity and run_evidence_persistence can stay ready, requires run_evidence_persistence to carry a terminal run status before terminal evidence can stay ready, requires selected_runtime_contract to carry same-run and target-task identity evidence instead of only mode/layer/phase, requires runtime_context_manifest to carry the target task identity through contextManifestTaskId or a matching task=... manifest summary before context assembly can stay ready, requires context_readiness_step to carry target-task identity evidence instead of only ready/status step ids, treats task_memory_guidance as ready when there is no pending guidance or when completed guidance exists, while still requiring target-task identity evidence instead of only ready/count flags, requires run_goal_contract to carry persisted same-run and target-task identity evidence instead of only objective text and condition counts, requires provider_visible_preflight to carry configured provider identity plus same-run and target-task identity evidence and now also explicit no-startup-probe evidence instead of only providerConfigured=true, requires write_intent_extraction to include exactly one artifact.propose and exactly one task_file.propose with persisted same-run and target-task identity evidence and no duplicate, missing, or non-proposal write actions before future API execution can satisfy the reviewable writeback boundary, requires reviewed_patch_apply_boundary to carry applied patch promotion status plus same-run and target-task identity evidence, requires post_step_verification to carry same-run and target-task identity evidence, ties runtime_context_assembly, context_readiness, task_memory_guidance, pre_step, and post_step gates to their matching service-evidence chains instead of accepting naked booleans, and now appends targetTask, runEvidenceTask, targetTaskEvidenceChain, runEvidenceTaskEvidenceChain, selectedRuntimeRun, selectedRuntimeRunEvidenceChain, selectedRuntimeTask, selectedRuntimeTaskEvidenceChain, providerPreflightStatus, providerConfigured, configuredProvider, providerStartupProbe, providerPreflightRun, providerPreflightRunEvidenceChain, providerPreflightTask, providerPreflightTaskEvidenceChain, runId, writeIntentRun, writeIntentRunEvidenceChain, writeIntentTask, writeIntentTaskEvidenceChain, writeIntentExtraction, writeIntentActionIdentityChain, writeIntentActionBoundary, contextStep, contextStepTask, contextStepTaskEvidenceChain, contextManifest, contextManifestTask, contextManifestEvidenceChain, contextReadinessGateEvidenceChain, runtimeContextAssemblyGateEvidenceChain, taskMemoryGuidance, taskMemoryGuidanceCount, taskMemoryGuidanceTask, taskMemoryGuidanceTaskEvidenceChain, runGoalConditions, taskMemoryGuidanceGateEvidenceChain, runGoalRun, runGoalRunEvidenceChain, runGoalTask, runGoalTaskEvidenceChain, preStepGateEvidenceChain, writeIntentActions, reviewedPatchApplyBoundary, reviewedPatchExplicitApply, patchPromotionPreflight, patchPromotionStatus, patchPromotionRun, patchPromotionRunEvidenceChain, patchPromotionTask, patchPromotionTaskEvidenceChain, postStepRun, postStepRunEvidenceChain, postStepTask, postStepTaskEvidenceChain, postStepVerifier, postStepGateEvidenceChain, terminalRunStatus, terminalRunStatusEvidenceChain, terminalEvidence, runtimeMode, and invocationLayer identity chips so future promotion no longer depends on hand-filled requirement arrays or opaque counts.',
      'evaluateAgentApiExecutionPromotionReadinessForInvocation now keeps Agent API execution promotion closed for invocation-declared requirement/gate arrays, including completed invocation metadata, so future promotion depends on evaluateAgentApiExecutionPromotionReadinessFromEvidence service chains instead of runtime self-reporting.',
      'Retained API Runtime / Agent API-like RunService runs now persist an Agent API execution promotion readiness Run step from real service evidence before provider-visible execution, recording selected-runtime contract, target-task identity, provider-visible preflight run/task identity, context manifest, context readiness, simplicity_check, runtime_action, pre-step, and subtask-start gates while keeping missing Write Intent extraction, reviewed-patch apply boundary, post-step verification, and terminal Run evidence explicit.',
      'Completed retained API Runtime / Agent API-like RunService runs now persist a post-run Agent API execution promotion readiness Run step after terminal verification, adding post-step verification and terminal Run evidence persistence to the same service-evidence evaluator while keeping Write Intent extraction and reviewed-patch apply boundary closed unless real proposals and reviewed patch evidence exist.',
      'Failed retained API Runtime / Agent API-like RunService runs now also persist a post-run Agent API execution promotion readiness Run step after terminal verification, treating failureReason as reviewable terminal evidence when output is absent while still requiring terminalRunStatus=failed and target-task identity.',
      'Post-run Agent API execution promotion readiness now reads same-run sandbox patch promotion records through SandboxPatchPromotionRepository.listForRun and satisfies the reviewed-patch apply boundary only when real applied promotion evidence exists and belongs to the same run and target task; pending patch promotion evidence remains missing until explicit apply completes.',
      'Post-run Agent API execution promotion readiness now has regression coverage proving parsed TASKPLANE_WRITE_INTENTS artifact.propose plus task_file.propose output and same-run patch promotion evidence satisfy Write Intent extraction and reviewed-patch apply requirements without hand-filled readiness.',
      'Agent API capability registry diagnostics now derive deferred execution_run promotion requirements and missing lists through evaluateAgentApiExecutionPromotionReadinessFromEvidence, keeping settings and safety reports aligned with service-evidence readiness instead of a separate hand-filled list.',
      'Agent API capability registry diagnostics now derive deferred execution_run key gates from the future provider-visible execution contract, so settings and safety reports expose context, task-memory, subtask-start, and post-step boundaries without parsing invocation text.',
      'The Agent API promotion readiness smoke now runs the shared deferred execution_run invocation, evaluateAgentApiExecutionPromotionReadiness, and evaluateAgentApiExecutionPromotionReadinessFromEvidence paths as a read-only build-gated harness, proving deferred=0/11 requirements and 0/9 gates, partial=5/11 requirements and 3/9 gates, service-evidence=3/11 requirements and 7/9 gates with providerConfigured=ready, configuredProvider=openai, providerStartupProbe=not_called, taskMemoryGuidance=ready, taskMemoryGuidanceCount=0, runGoalConditions=1, preStepGateEvidenceChain=missing, targetTaskEvidenceChain=missing, selectedRuntimeRunEvidenceChain=missing, providerPreflightRunEvidenceChain=missing, and providerPreflightTaskEvidenceChain=ready evidence until persisted same-run Run evidence exists, postRunNoWriteback=9/11 requirements and 9/9 gates with terminal Run evidence plus post-step evidence but write_intent_extraction and reviewed_patch_apply_boundary still missing, and synthetic-ready=11/11 requirements and 9/9 gates without provider calls or workspace writes.',
      'The opt-in Agent API execution preflight smoke verifies provider-visible text-call readiness through the shared provider mapping while defaulting to skipReason=opt_in_required, provider=not-called, executionRun=deferred, promotionReady=no, promotionRequirements=0/11, requiredGates=0/9, promotionMissingRequirements=..., executionRunMissingRequirements=..., executionRunMissingGates=..., missingGates=..., and workspace=unchanged; enabled runs with incomplete provider config report skipReason=config_missing without calling the provider.',
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
      'Promote future Agent API execution only by replacing the deferred invocation after the read-only promotion readiness smoke, evaluateAgentApiExecutionPromotionReadiness, and evaluateAgentApiExecutionPromotionReadinessFromEvidence all report ready from real service evidence for every requirement and gate.',
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
      'The subtask create-many apply plan readiness smoke now runs buildSubtaskCreateManyWritebackApplyPlan as a read-only build-gated harness with stale-build detection, proving both agent_cli_decomposition and agent_api_decomposition sources produce subtask.create_many plans with parentTaskId, subtaskCount, panel.project_decomposed timeline evidence, confirmationBoundary=operator_confirmed_subtask_create_many, and draftOnlyBeforeConfirmation=true without provider calls, writeback dispatch, subtask creation, or workspace writes.',
      'evaluateAgentApiDecompositionPromotionReadiness now keeps future Agent API decomposition promotion closed unless the draft has a selected-runtime contract, parent-task identity, a reversible proposal card, an agent_api_decomposition subtask.create_many apply plan, an operator-confirmed create-many boundary, and draft-only timeline evidence.',
      'evaluateAgentApiDecompositionPromotionReadinessFromEvidence now derives Agent API decomposition promotion readiness from structured service evidence for selected-runtime contract, parent-task identity, reversible proposal card, subtask.create_many apply plan, agent_api_decomposition source, operator confirmation boundary, and draft-only timeline evidence, keeps selected-runtime contract missing unless the service selectedRuntimeContract matches the apply-plan timeline runtimeContract and carries the same evidenceRunId plus parentTaskId as the apply plan, keeps parent-task identity missing when the service parentTaskId is absent or does not match the apply-plan parentTaskId, keeps agent_api_decomposition_source missing when apply-plan input source and timeline source diverge, keeps draft_only_timeline_evidence missing when apply-plan evidenceRunId and timeline evidenceRunId diverge or when both run identities are absent, keeps the subtask.create_many apply-plan requirement missing unless the apply plan has at least one concrete subtask title, and keeps the reversible proposal card missing when its proposalId, parentTaskId, subtask count, subtask title identity, or subtask-title uniqueness does not match the same apply-plan evidence chain, now also requiring subtask-title completeness so blank titles cannot be filtered out of identity evidence and near-duplicate subtask titles cannot satisfy duplicate-free promotion readiness.',
      'Agent API decomposition promotion readiness now returns satisfied and missing requirement lists plus promotionReady, requirements=x/7, promotionRequirements=x/7, missingRequirements=..., promotionMissingRequirements=..., proposalId, expectedProposalId, proposalIdEvidenceChain, proposalParentTask, proposalTaskEvidenceChain, proposalSubtaskCount, applyPlanSubtaskCount, proposalSubtaskEvidenceChain, proposalSubtaskTitles, applyPlanSubtaskTitles, proposalSubtaskUniqueChain, proposalSubtaskIdentityChain, proposalSubtaskTitleEvidenceChain, applyPlanSubtaskTitleEvidenceChain, parentTask, applyPlanParentTask, parentTaskEvidenceChain, subtaskCount, evidenceRunId, timelineEvidenceRunId, sourceEvidenceChain, evidenceRunIdChain, confirmationBoundary, draftOnlyBeforeConfirmation, runtimeMode, invocationLayer, selectedRuntimeEvidenceRunId, selectedRuntimeEvidenceRunChain, selectedRuntimeParentTask, selectedRuntimeParentTaskEvidenceChain, timelineRuntimeMode, timelineInvocationLayer, timelineInvocationPhase, timelineRuntimeEvidenceRunId, timelineRuntimeParentTask, and selectedRuntimeEvidenceChain summary evidence, matching the execution promotion readiness style without opening the deferred path.',
      'Subtask create-many apply plans now preserve explicit decomposition timeline runtimeContract evidence without inferring evidenceRunId or parentTaskId from apply-plan inputs; Agent API decomposition draft generation passes those identities at the callsite, and evaluateAgentApiDecompositionPromotionReadinessFromEvidence keeps selected_runtime_contract missing when timeline runtime identity fields are absent or stitched from another run/task.',
      'Agent API capability registry diagnostics now derive decomposition promotion requirements and missing lists through evaluateAgentApiDecompositionPromotionReadinessFromEvidence, so capability, settings, and safety-report surfaces share the same evidence-based promotion contract as decomposition smoke coverage.',
      'Tasks project decomposition confirmation now calls evaluateAgentApiDecompositionPromotionReadinessFromEvidence with the decomposition_draft invocation, reversible proposal card, agent_api_decomposition subtask.create_many apply plan, operator confirmation boundary, and draft-only timeline evidence before dispatching TaskplaneWritebackApplyPlan.',
      'Agent API project decomposition confirmation now persists the selected runtime contract into the subtask.create_many panel.project_decomposed timeline payload, so durable decomposition evidence carries invocationLayer=api_runtime, phase=decomposition_draft, runtimeMode=api, and runtime label after operator confirmation.',
      'Agent API project decomposition drafts now return a task-scoped, response-hashed evidenceRunId plus promotionReadiness with promotionReady, requirement counts, missing requirements, selected runtime contract, proposal-card, and agent_api_decomposition apply-plan evidence before the operator confirms child creation.',
      'Agent API project decomposition draft generation and renderer confirmation now pass the task-scoped evidenceRunId and parentTaskId into selectedRuntimeContract before evaluating promotion readiness, so selectedRuntimeEvidenceRunChain and selectedRuntimeParentTaskEvidenceChain can become ready from real draft evidence instead of only mode/layer/phase metadata.',
      'Right-panel AI decomposition draft readiness now projects promotionReadiness identity chips for proposalId, expectedProposalId, proposalIdEvidenceChain, proposalParentTask, proposalTaskEvidenceChain, proposalSubtaskCount, applyPlanSubtaskCount, proposalSubtaskEvidenceChain, proposalSubtaskTitles, applyPlanSubtaskTitles, proposalSubtaskUniqueChain, proposalSubtaskIdentityChain, parentTask, applyPlanParentTask, parentTaskEvidenceChain, subtaskCount, evidenceRunId, timelineEvidenceRunId, sourceEvidenceChain, evidenceRunIdChain, confirmationBoundary, draftOnlyBeforeConfirmation, runtimeMode, invocationLayer, selectedRuntimeEvidenceRunId, selectedRuntimeEvidenceRunChain, selectedRuntimeParentTask, selectedRuntimeParentTaskEvidenceChain, timelineRuntimeMode, timelineInvocationLayer, timelineInvocationPhase, timelineRuntimeEvidenceRunId, timelineRuntimeParentTask, and selectedRuntimeEvidenceChain, so the operator can inspect the reversible proposal boundary, proposal-id chain, subtask-count chain, subtask-title uniqueness, subtask-title identity chain, parent-task evidence chain, selected-runtime evidence chain, source chain, and evidence-run chain before creating child tasks.',
      'The Agent API decomposition promotion readiness smoke now runs evaluateAgentApiDecompositionPromotionReadiness and evaluateAgentApiDecompositionPromotionReadinessFromEvidence as a read-only build-gated harness, proving blocked=0/7 requirements, partial=6/7 requirements with agent_api_decomposition_source missing, service-evidence=6/7 requirements with proposalId, expectedProposalId, proposalIdEvidenceChain, proposalParentTask, proposalTaskEvidenceChain, proposalSubtaskCount, applyPlanSubtaskCount, proposalSubtaskEvidenceChain, proposalSubtaskTitles, applyPlanSubtaskTitles, proposalSubtaskUniqueChain, proposalSubtaskIdentityChain, parentTask, applyPlanParentTask, parentTaskEvidenceChain, subtaskCount, evidenceRunId, timelineEvidenceRunId, sourceEvidenceChain, evidenceRunIdChain, confirmationBoundary, draftOnlyBeforeConfirmation, runtimeMode, invocationLayer, selectedRuntimeEvidenceRunId, selectedRuntimeEvidenceRunChain, selectedRuntimeParentTask, selectedRuntimeParentTaskEvidenceChain, timelineRuntimeMode, timelineInvocationLayer, timelineInvocationPhase, timelineRuntimeEvidenceRunId, timelineRuntimeParentTask, and selectedRuntimeEvidenceChain identity evidence plus agent_api_decomposition_source missing, and synthetic-ready=7/7 requirements without provider calls, subtask creation, or workspace writes.',
      'Agent API task execution has a shared deferred execution_run invocation shape, so future API execution can join the same invocation contract before durable child creation or run execution is promoted.',
      'The main-side subtask apply path promotes the parent to a project, creates planned child tasks, stores child and parent completion criteria, stores matched dependencies, records the project timeline with childTaskIds and recordPath evidence, and writes an AI 项目拆解自检 task record when review context exists.',
    ],
    gaps: [
      'Future Agent API decomposition generation is still not the primary task-bound runtime path; if promoted, it should prove the selected-runtime contract and parent-task identity, then surface the same reversible proposal card before confirmation.',
    ],
    nextActions: [
      'When Agent API decomposition is promoted, require the read-only subtask create-many apply plan readiness smoke, the read-only decomposition promotion readiness smoke, evaluateAgentApiDecompositionPromotionReadiness, and evaluateAgentApiDecompositionPromotionReadinessFromEvidence to pass from real reversible proposal and apply-plan evidence before feeding confirmation through TaskplaneWritebackApplyPlan.',
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
      'planSchedulerDecisionProposal now models the scheduler/background Decision proposal boundary as approval-item-only: it requires target-task identity, the Task Dynamics writeback approval queue, plus concrete operator confirmation, completed local recovery evidence with matching target-task identity, or active target-scoped Standing Approval, while keeping decisionPersistenceAllowed=false, writebackDispatchAllowed=false, and schedulerTriggerAllowed=false.',
      'planSchedulerDecisionProposalFromEvidence now derives scheduler/background Decision proposal readiness from structured service evidence for approval-queue connectivity, target-task identity, concrete operator confirmation, completed local recovery evidence with explicit recovered-run identity plus matching recovered-run task identity, and target-scoped Standing Approval while still keeping Decision persistence, writeback dispatch, and scheduler triggers closed.',
      'Scheduler/background Decision proposal plans now return satisfied and missing requirement lists plus proposalReady, requirements=x/3, proposalRequirements=x/3, proposalSatisfiedRequirements=..., approvalQueueSurface, localRecoveryRunId, localRecoveryTask, localRecoveryCompleted, localRecoveryTaskMatched, operatorId, standingApprovalPolicyId, standingApprovalScopeTask, standingApprovalActive, standingApprovalScopeMatched, missingRequirements=..., and proposalMissingRequirements=... summary evidence without opening Decision persistence, writeback dispatch, or scheduler triggers.',
      'CapabilityRegistry now includes scheduler/background Decision proposal readiness in the runtime.scheduler summary through planSchedulerDecisionProposalFromEvidence, so ConfigurationSafetyReport surfaces the approval queue, target-task, authorization source, standing-approval policy identity, no-persistence, no-writeback, and no-trigger boundary in settings diagnostics.',
      'Settings configuration safety rows now render runtime.scheduler evidence chips for proposalReady, proposalRequirements, proposalSatisfiedRequirements, proposalMissingRequirements, missingRequirements, approvalQueueSurface, authorization, operatorId, localRecoveryRunId, localRecoveryTask, localRecoveryCompleted, localRecoveryTaskMatched, standingApprovalPolicyId, standingApprovalScopeTask, standingApprovalActive, standingApprovalScopeMatched, decisionPersistenceAllowed, writebackDispatchAllowed, schedulerTriggerAllowed, triggerPlanReady, runtimeStartAllowed, runtimeStartReady, runtimeStartRequirements, runtimeStartSatisfiedRequirements, runtimeStartMissingRequirements, schedulerTriggerServiceConnected, and selectedRuntimeIdentity, so operators can inspect scheduler Decision proposal gaps, authorization evidence, local-recovery identity, closed persistence/writeback/trigger gates, and scheduled/event runtime-start state without parsing the full diagnostic summary.',
      'The scheduler Decision proposal readiness smoke now runs planSchedulerDecisionProposal and planSchedulerDecisionProposalFromEvidence as a read-only build-gated harness, proving blocked=0/3 requirements, operator-confirmed=3/3 requirements with operatorId evidence, local-recovery=3/3 requirements with localRecoveryRunId, localRecoveryTask, and localRecoveryTaskMatched=yes evidence, standing-approval=3/3 requirements with standingApprovalPolicyId, standingApprovalScopeTask, and standingApprovalScopeMatched=yes evidence, scope-mismatch=2/3 requirements with authorization missing, and service-evidence=2/3 requirements with approvalQueueSurface=task_dynamics plus authorization missing when Standing Approval scope does not match the target task, while keeping decisionPersistenceAllowed=false, writebackDispatchAllowed=false, and schedulerTriggerAllowed=false without provider calls, Decision persistence, writeback dispatch, scheduler triggers, or workspace writes.',
      'Task Dynamics now accepts panel.scheduler_decision_proposed timeline events as scheduler/background Decision proposal sources, rechecks planSchedulerDecisionProposalFromEvidence with approvalQueueSurface=task_dynamics, target-task identity, and operator confirmation, explicit recovered-run identity plus task-matched completed local recovery evidence, or target-scoped Standing Approval, then converts only ready proposals into the existing TaskplaneWritebackApprovalItem queue and decision.create apply plan after operator confirmation.',
      'Task Dynamics scheduler Decision proposal consumption now revalidates timeline payload shape before approval queue creation, requiring normalized nonblank title, rationale, duplicate-free option labels, and a proposed outcome that canonicalizes to one of the options, so malformed or legacy panel.scheduler_decision_proposed events cannot bypass the SchedulerService producer validation.',
      'Task Dynamics scheduler Decision approval items now use evidenceRunId plus normalized title as the approval identity, so repeated panel.scheduler_decision_proposed timeline events for the same run evidence collapse into one operator confirmation card instead of duplicating approval queue work.',
      'Task Dynamics scheduler Decision approval plans now preserve evidence source semantics: proposals with evidenceRunId remain sourceType=run, while no-Run scheduler proposals such as run-limit or scheduler sweep policy reviews become sourceType=system instead of pretending to be Run-backed Decisions.',
      'Task Dynamics system-sourced scheduler Decision approval items now use target task plus normalized title as their approval identity when evidenceRunId is absent, so repeated no-Run policy-review timeline events also collapse into one operator confirmation card.',
      'Task Dynamics system-sourced scheduler Decision approval plans now use that same stable target-task-plus-title identity as the durable Decision sourceId, so a no-Run scheduler proposal already persisted as a Decision suppresses later duplicate timeline proposals after refresh.',
      'SchedulerService.proposeSchedulerDecision now provides the non-panel producer entrypoint for scheduler/background Decision proposals: it reuses planSchedulerDecisionProposalFromEvidence, requires Task Dynamics timeline evidence, target-task identity, concrete operator confirmation, explicit recovered-run identity plus task-matched completed local recovery evidence, or target-scoped Standing Approval, records panel.scheduler_decision_proposed only when ready, and keeps durable Decision creation behind the Task Dynamics approval queue.',
      'SchedulerService.proposeSchedulerDecision now also requires a concrete title, rationale, at least one nonblank duplicate-free option list, and a nonblank proposed outcome that matches one of the options before recording panel.scheduler_decision_proposed; title, rationale, options, and proposed outcome are whitespace-normalized for identity and timeline evidence, so scheduler/background Decision proposals entering Task Dynamics remain actionable proposal cards instead of narrative-only events, repeated choices, whitespace/case-equivalent duplicate choices, or recommendations for unavailable actions.',
      'SchedulerService same-day scheduler Decision proposal dedupe now trusts only target-scoped proposal history whose timeline event taskId and payload targetTaskId both match the candidate task, and normalizes proposal titles before matching, so whitespace-varied duplicate history still suppresses same-day duplicate recovery proposals while stale title-only or cross-task proposal records cannot suppress a fresh evidence-backed proposal.',
      'Scheduled/event Agent failed terminal runs now route a deduplicated failure-review policy through SchedulerService.proposeSchedulerDecision, recording at most one target-scoped panel.scheduler_decision_proposed recovery Decision proposal per task per UTC day with run failure evidence, Standing Approval authorization, and failureDecisionProposals summary evidence while still requiring Task Dynamics confirmation before durable Decision creation.',
      'Scheduled/event Agent failed terminal runs without reviewable output or failureReason now make the missing terminal failure evidence explicit in the recovery Decision proposal options and rationale, so operators can choose to record missing failure evidence instead of seeing only a generic failed-run recovery card.',
      'Scheduled/event Agent daily run-limit blocks now route a deduplicated run-limit review policy through SchedulerService.proposeSchedulerDecision, recording one target-scoped panel.scheduler_decision_proposed limit Decision proposal per task per UTC day with run-limit sweep evidence and runLimitDecisionProposals summary evidence while preserving the no-start, approval-required boundary.',
      'Operator-started scheduled/event Agent triggers now reuse scheduler runtime-start blocked review policies for daily Standing Approval run-limit caps, automation-readiness gaps, and missing/invalid run-limit accounting evidence, recording target-scoped approval-required Decision proposals instead of returning silent blocked runs.',
      'Scheduled/event Agent invalid run-limit accounting evidence now routes a deduplicated run-count evidence review policy through SchedulerService.proposeSchedulerDecision when a target task has Standing Approval but runtimeStartMissingRequirements includes run_limit_count because the persisted count is missing or invalid, recording runLimitAccountingDecisionProposals summary evidence without starting a Run.',
      'Scheduled/event Agent automation-readiness blocks now route a deduplicated readiness-review policy through SchedulerService.proposeSchedulerDecision when a target task has Standing Approval but missing automation readiness evidence, recording readinessDecisionProposals summary evidence while preserving the no-start, approval-required boundary.',
      'Scheduled/event Agent trigger-port sweep failures now route a deduplicated sweep-failure review policy through SchedulerService.proposeSchedulerDecision when the failed sweep has target-task identity, trigger-plan evidence, and Standing Approval authorization, recording sweepFailureDecisionProposals summary evidence without a Run record or durable Decision write.',
      'Scheduled/event Agent task-source sweep failures now explicitly record taskSourceFailureDecisionProposals=not_required_no_target_task when no target-task identity or trigger-plan evidence exists, preserving the no-generic-Decision boundary instead of creating an unowned scheduler Decision.',
      'Scheduled/event Agent timeline evidence write failures after a Run starts now route a deduplicated timeline-failure review policy through SchedulerService.proposeSchedulerDecision with the started Run id, target-task identity, trigger-plan evidence, Standing Approval authorization, and timelineFailureDecisionProposals summary evidence while preserving pending terminal Run evidence for recovery; operator-started timeline failures return blocked recovery evidence instead of throwing to IPC.',
      'Scheduled/event Agent Run target-task mismatches now block target timeline evidence and route a deduplicated run-identity review policy through SchedulerService.proposeSchedulerDecision with the started Run id, expected target task, returned run task, Standing Approval authorization, and runIdentityDecisionProposals summary evidence before any durable Decision creation; operator-started runs return blocked recovery evidence instead of throwing to IPC.',
      'Scheduled/event Agent completed runs without reviewable output or failureReason now route a deduplicated terminal-evidence review policy through SchedulerService.proposeSchedulerDecision with the completed Run id, target-task identity, Standing Approval authorization, and terminalEvidenceDecisionProposals summary evidence, while failed terminal runs continue to use the existing failure-review policy to avoid duplicate recovery Decisions.',
      'Scheduled/event Agent duplicate task-source candidates now skip duplicate runtime starts in the same sweep and route a deduplicated duplicate-candidate review policy through SchedulerService.proposeSchedulerDecision with target-task identity, Standing Approval authorization, duplicateCandidateTaskIds, and duplicateCandidateDecisionProposals summary evidence; each proposal rationale receives only the duplicate IDs for its own target task even when multiple tasks duplicate in the same sweep.',
      'Scheduled/event Agent sweep summaries now also include task-id evidence for run-limit, run-limit accounting, readiness, and duplicate-candidate scheduler Decision proposals, so multi-task background coordination remains traceable without opening each timeline event.',
      'Scheduler stale-run recovery now routes each recovered run through SchedulerService.proposeSchedulerDecision with local_recovery authorization only when the recovered run task matches the target task and Task Dynamics timeline evidence is connected, recording staleRunRecoveryDecisionProposals summary evidence while still marking the stale run failed locally and keeping durable Decision creation behind approval.',
      'Operator-started scheduled/event Agent trigger-port failures now return blocked recovery evidence instead of throwing to IPC, route a Standing Approval authorized sweep-failure Decision proposal through SchedulerService.proposeSchedulerDecision, preserve triggerRunEvidenceStatus=not_started, and keep durable Decision creation behind Task Dynamics approval.',
      'Future scheduler/background Decision drafts also remain without IPC or scheduler triggers until that same operator-confirmation or standing-approval model exists.',
      'Completion verification is separate from model output.',
      'Right-panel phase closeout now asks shared TaskAdvancementOrchestrator for a local verification movement before memory, closeout, and handoff gates run.',
      'Task completion modal now asks shared TaskAdvancementOrchestrator for a local completion-check verification movement before passed, waiting, or override-completed outcomes are recorded.',
      'Tasks detail project verification now asks shared TaskAdvancementOrchestrator for a selected-task verification movement before rendering local project readiness evidence.',
    ],
    gaps: [
      'Future background scheduler decisions now have a SchedulerService proposal producer, Task Dynamics approval queue path, deduplicated failed-run recovery policy, deduplicated daily run-limit review policy, deduplicated run-limit accounting evidence review policy, deduplicated automation-readiness review policy, deduplicated sweep-failure trigger review policy, no-target task-source failure policy, deduplicated timeline-failure review policy, deduplicated run-identity review policy, terminal-evidence review policy, duplicate-candidate review policy, and stale-run recovery policy; broader scheduler review policies still need to decide when other run/sweep evidence deserves a Decision proposal.',
    ],
    nextActions: [
      'Add any remaining scheduled/event review policies through SchedulerService.proposeSchedulerDecision only when real run/sweep evidence justifies a Decision proposal, keep them deduplicated where repeated cron evidence is expected, and keep durable Decision creation behind the Task Dynamics TaskplaneWritebackApprovalItem confirmation and main-side writeback dispatch boundary.',
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
      'Sandbox patch promotion readiness now returns satisfied and missing requirement lists plus requirements=x/12 and missingRequirements=... summary evidence before any workspace apply service can run.',
      'The sandbox patch promotion readiness smoke now runs evaluateSandboxPatchPromotionReadiness as a read-only build-gated harness with stale-build detection, proving review-only checkpoints stay missing_apply_metadata at 10/12 requirements, complete safe apply metadata reaches ready at 12/12 requirements with deduplicated expected files, unsafe expected files stay blocked, and resolved checkpoints stay already_resolved without provider calls, workspace apply, or workspace writes.',
      'Native CLI workspace_write capability steps now require patch artifact, ready task_file Write Intent, ready patch artifact Write Intent, or patch-review promotion evidence during post-step verification.',
      'Terminal Run verification now carries same-run artifacts and checkpoints into post-step self-checks when repository evidence is available, so run-backed patch artifacts and patch-promotion checkpoints can satisfy workspace_write promotion evidence instead of being invisible to terminal verification.',
      'evaluateRuntimePatchPromotionRoutingReadiness now keeps future API/runtime-generated patch promotion blocked unless the path includes a selected-runtime contract, target-task identity, same-run patch artifact, promotion Decision, promotion preflight, explicit operator apply, and post-apply Run evidence.',
      'evaluateRuntimePatchPromotionRoutingReadinessFromEvidence now derives runtime patch promotion routing readiness from structured service evidence for selected-runtime contract, target-task identity, patch artifact, promotion Decision, promotion preflight, artifact evidence chain, checkpoint evidence chain, explicit operator apply, same-run evidence chain, and post-apply Run evidence.',
      'Runtime patch promotion routing now treats target-task identity as an evidence chain: targetTaskId, patchArtifact.taskId, promotionDecision.taskId, promotionPreflight.taskId, and postApplyRunEvidence.taskId must all match before future runtime patch promotion can be ready; promotion preflight must carry the same run id and target task before promotion_preflight can be ready, and post-apply Run evidence itself must carry the same run id and target task before post_apply_run_evidence can be ready.',
      'Runtime patch promotion routing now also treats the promotion Decision checkpoint and promotion preflight checkpoint as one checkpointEvidenceChain, so future runtime patch promotion cannot stitch an approved Decision to a different preflight result.',
      'Runtime patch promotion routing now also treats the patch artifact, promotion Decision artifact, and promotion preflight artifact as one artifactEvidenceChain, so future runtime patch promotion cannot stitch an approved Decision or ready preflight to a different patch artifact.',
      'Runtime patch promotion routing now requires the approved promotion Decision artifact to match the reviewed patch artifact, and also requires the Decision run id and target task to match before promotion_decision can be ready, so a Decision for a different artifact, run, or task cannot appear as a satisfied promotion Decision while other routing gates block.',
      'Runtime patch promotion routing now treats explicit operator apply as an operatorApplyEvidenceChain: operator confirmation must carry the same target task, same run, and same checkpoint as the reviewed patch artifact, promotion Decision, and promotion preflight before explicit_operator_apply can be ready.',
      'Runtime patch promotion routing now treats expected patch files and post-apply touched files as one touchedFileEvidenceChain, so future runtime patch promotion cannot satisfy post_apply_run_evidence with a nonempty but mismatched file list.',
      'Runtime patch promotion routing now also treats expected patch files and post-apply touched files as one filePathSafetyChain, so future runtime patch promotion cannot satisfy patch artifact or post-apply evidence with unsafe workspace paths, including Windows drive absolute paths, current-directory path aliases, and blank path entries, even when the file sets match.',
      'Runtime patch promotion routing now requires expected file evidence to be safe and duplicate-free before patchArtifact can be ready, also requires patch artifact target-task identity for patchArtifact readiness, requires expected and touched file evidence to be duplicate-free, safe, and nonblank before touchedFileEvidenceChain can be ready, and SandboxPatchPromotionApplyService blocks duplicate patch file entries before writing workspace files while also blocking unsafe Windows-drive/current-directory path aliases.',
      'SandboxPatchPromotionApplyService now also blocks unsafe or duplicate expected-file promotion metadata and malformed reviewed patch diffs before writing workspace files, recording blocked promotion evidence plus runtime patch promotion routing readiness instead of throwing out of the operator-facing apply path.',
      'Runtime patch promotion routing and SandboxPatchPromotionApplyService now normalize workspace-relative path separators before duplicate checks, touched-file matching, and workspace writes, so equivalent slash/backslash paths cannot satisfy duplicate-free evidence as separate files, cannot write a separate backslash-named file on POSIX, and can still match safely when the file identity is genuinely the same.',
      'Runtime patch promotion routing now requires selectedRuntimeContract to carry the same run id and target task id as the reviewed patch artifact before selected_runtime_contract can be ready, so future API/runtime patch promotion cannot be promoted from mode/layer/phase metadata alone.',
      'Runtime patch promotion routing tests now explicitly prove selectedRuntimeContract stays missing when the selected runtime run id or target task identity diverges from the reviewed patch evidence chain, even if every patch artifact, Decision, preflight, explicit apply, and post-apply evidence record is otherwise complete.',
      'Runtime patch promotion readiness now returns satisfied and missing requirement lists plus promotionReady, requirements=x/8, promotionRequirements=x/8, promotionSatisfiedRequirements=..., missingRequirements=..., promotionMissingRequirements=..., selectedRuntimeRun, selectedRuntimeRunEvidenceChain, selectedRuntimeTask, selectedRuntimeTaskEvidenceChain, targetTaskEvidenceChain, decisionArtifactEvidenceChain, artifactEvidenceChain, checkpointEvidenceChain, operatorId, patchRunId, decisionRunId, preflightRunId, postApplyRunId, sameRunId, expectedFileCount, expectedFiles, expectedFileEvidenceChain, touchedFileCount, touchedFiles, filePathSafetyChain, and touchedFileEvidenceChain summary evidence, matching the Agent API promotion readiness style without opening direct workspace writes.',
      'ConfigurationSafetyReport now exposes runtime patch promotion routing readiness as the sandbox.patch_promotion diagnostic summary, so settings and safety-report surfaces show the selected-runtime, target-task, same-run artifact, Decision, preflight, explicit apply, and post-apply evidence gaps before any future runtime patch route can be promoted.',
      'Settings configuration safety rows now render sandbox.patch_promotion evidence chips for promotionReady, promotionRequirements, promotionSatisfiedRequirements, promotionMissingRequirements, missingRequirements, selectedRuntimeContract, selectedRuntimeRun, selectedRuntimeRunEvidenceChain, selectedRuntimeTask, selectedRuntimeTaskEvidenceChain, targetTaskIdentity, targetTaskEvidenceChain, checkpointEvidenceChain, sameRunEvidenceChain, explicitOperatorApply, postApplyRunEvidence, operatorId, operatorApplyTask, operatorApplyRun, operatorApplyCheckpoint, operatorApplyEvidenceChain, patchArtifactId, decisionArtifactId, preflightArtifactId, decisionArtifactEvidenceChain, artifactEvidenceChain, promotionDecisionId, promotionCheckpointId, preflightCheckpointId, patchArtifactTask, promotionDecisionTask, promotionPreflightTask, postApplyTask, patchRunId, decisionRunId, preflightRunId, postApplyRunId, sameRunId, expectedFileCount, expectedFiles, expectedFileEvidenceChain, touchedFileCount, touchedFiles, filePathSafetyChain, and touchedFileEvidenceChain so operators can review patch promotion routing gaps and identity without parsing the full diagnostic summary.',
      'The runtime patch promotion routing readiness smoke now runs evaluateRuntimePatchPromotionRoutingReadiness and evaluateRuntimePatchPromotionRoutingReadinessFromEvidence as a read-only build-gated harness with stale-build detection, proving blocked=2/8 requirements, same-run-blocked=7/8 requirements with same_run_evidence_chain missing, service-evidence=3/8 requirements with selectedRuntimeRunEvidenceChain=missing, selectedRuntimeTaskEvidenceChain=missing, patchArtifactId, decisionArtifactId, preflightArtifactId, decisionArtifactEvidenceChain, artifactEvidenceChain, promotionDecisionId, patchArtifactTask, promotionDecisionTask, promotionPreflightTask, targetTaskEvidenceChain, checkpointEvidenceChain, patchRunId, decisionRunId, preflightRunId, sameRunId, expectedFileCount, expectedFiles, expectedFileEvidenceChain, touchedFileCount, filePathSafetyChain, and touchedFileEvidenceChain identity evidence plus selected_runtime_contract, target_task_identity, explicit_operator_apply, same_run_evidence_chain, and post_apply_run_evidence missing, and synthetic-ready=8/8 requirements without provider calls, workspace apply, or workspace writes.',
      'SandboxPatchPromotionApplyService now appends evaluateRuntimePatchPromotionRoutingReadinessFromEvidence output to applied and already-applied audit summaries after explicit operator apply, so real workspace apply evidence records target-task identity across patch artifact, promotion Decision, preflight, and post-apply evidence; same-run patch artifact; approved promotion Decision; ready preflight; explicit operator apply with same task/run/checkpoint evidence; same-run evidence chain; post-apply Run evidence; and the remaining selected-runtime-contract gap only when first-party run-step evidence is unavailable.',
      'SandboxPatchPromotionApplyService now resolves selectedRuntimeContract from first-party RunStep evidence before writing apply audit summaries: Agent CLI runtime=codex/claude steps become selected_runtime execution_run evidence, Agent API promotion readiness steps become api_runtime execution_run evidence only when selectedRuntimeRun and selectedRuntimeTask match the promotion run/task, and the resolver is wired through bootstrap instead of accepting renderer-supplied runtime identity.',
      'DecisionService now passes explicit local_operator confirmation evidence into SandboxPatchPromotionApplyService when an approved patch-promotion Decision triggers workspace apply, so Decision-driven apply and explicit IPC apply both satisfy the operatorApplyEvidenceChain instead of leaving explicit_operator_apply missing.',
      'SandboxPatchPromotionApplyService now also appends runtime patch promotion routing readiness when preflight reports an already_applied promotion before re-entering the file-application path, keeping idempotent apply responses aligned with applied audit evidence.',
      'SandboxPatchPromotionApplyService now appends runtime patch promotion routing readiness when a ready preflight is blocked by workspace drift or validation failure, so blocked apply evidence preserves the reviewed patch artifact, approved Decision, ready preflight, explicit operator apply, and missing post-apply evidence without writing workspace files.',
    ],
    gaps: [
      'Future API/runtime-generated patch promotion still needs to prove the selected-runtime contract, target-task identity, and reuse the reviewed-patch apply workflow and same-run evidence chain; direct workspace-write runtime modes remain intentionally separate from the common run path.',
    ],
    nextActions: [
      'Keep explicit apply as the product-controlled mutation path and require the read-only sandbox patch promotion readiness smoke, the read-only runtime patch promotion routing smoke, evaluateRuntimePatchPromotionRoutingReadiness, and evaluateRuntimePatchPromotionRoutingReadinessFromEvidence before routing future runtime writes into selected-runtime, target-task, same-run patch artifacts, promotion Decisions, promotion preflight, explicit apply, and post-apply Run evidence.',
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
      'Agent API Runtime capability summaries now expose executionRunPromotionReady=no, executionRunPromotionRequirements=0/11, executionRunGateRequirements=0/9, executionRunPromotionSatisfiedRequirements=none, executionRunMissingRequirements=..., executionRunPromotionMissingRequirements=..., executionRunPromotionSatisfiedGates=none, executionRunPromotionMissingGates=..., executionRunMissingGates=..., decompositionPromotionReady=no, decompositionPromotionRequirements=0/7, decompositionPromotionSatisfiedRequirements=none, decompositionMissingRequirements=..., decompositionPromotionMissingRequirements=..., providerToolReadiness=not_declared, providerToolStatus=blocked|not_declared|declared, selectedApiRuntime, providerConfigured, configuredProvider, providerOwnedMetadata, providerMetadataMatchesSelected, explicitToolDeclaration, explicitToolDeclarationPackage, explicitToolDeclarationPackageMatchesMetadata, declaredWebSearchToolCount, declaredWebSearchTools, trustedWebSearchToolCount, trustedWebSearchTools, and startupProbe=never, so provider tool/search readiness is not implied by provider configuration, generic unknown-provider metadata, mismatched provider metadata, mismatched declaration package identity, unrelated function tools, runtime-probe-only tools, or startup calls.',
      'AI Runtime settings now render Agent API execution_run readiness chips from the shared capability summary, making promotion ready state, promotion count, gate requirement count, missing requirement count, missing requirement list, promotion satisfied requirement list, promotion missing requirement list, promotion satisfied gate list, promotion missing gate list, key gate count, key gate list, missing gate count, and missing gate list visible without parsing the diagnostic text.',
      'AI Runtime settings now render Agent API decomposition readiness chips from the shared capability summary, making promotion ready state, promotion count, missing requirement count, missing requirement list, promotion satisfied requirement list, and promotion missing requirement list visible without parsing the diagnostic text.',
      'AI Runtime settings now render Agent API provider tool readiness, providerToolStatus, providerToolRequirements, providerToolMissingRequirements, selectedApiRuntime, providerConfigured, configuredProvider, startupProbe, providerOwnedMetadata, providerMetadataMatchesSelected, providerMetadataOwner, providerMetadataPackage, explicitToolDeclaration, explicitToolDeclarationSource, explicitToolDeclarationPackage, explicitToolDeclarationPackageMatchesMetadata, declaredToolCount, declaredWebSearchToolCount, declaredWebSearchTools, trustedWebSearchToolCount, and trustedWebSearchTools chips from the shared capability summary, so providerToolReadiness=not_declared and providerToolStatus=blocked|not_declared are visible without implying provider-native web/search/tool support.',
      'evaluateAgentApiProviderToolReadinessFromEvidence now derives Agent API provider tool readiness from structured service evidence for selected API Runtime, configured provider identity, provider configuration, no-startup-probe policy, matching provider-owned metadata, and exact provider-owned web/search/browse tool declarations whose package identity matches the same provider-owned metadata, and now requires providerConfigured=true to carry a configuredProvider identity before satisfying provider_configured while requiring unknown-provider metadata to identify the configured provider by exact owner, package scope, package basename, or package basename prefix rather than a loose substring match, requiring known OpenAI/Anthropic provider metadata to use provider package scope, exact package basename, or owner-only metadata with no contradictory package instead of third-party package-name prefixes or third-party packages that merely claim a known-provider owner, and requiring provider-owned web/search tool declarations to be exact names, web-prefixed declarations, or colon/dot provider-namespaced web_search/web_fetch declarations whose namespace matches the configured provider rather than arbitrary tool names that merely contain web/search/browse/browser words, so provider configuration alone, anonymous provider configuration, generic unknown-provider metadata, mismatched provider metadata, known-provider third-party prefix package names, known-provider owner metadata from third-party package identities, loose provider-name substring package matches, mismatched tool-declaration package identity, colon or dot provider-namespace mismatches, unrelated provider-owned function tools, generic bare search tools, generic file_search/database_search declarations, task_browser/vendor:browse-style helper declarations, and web_search_cache-style helper declarations stay providerToolReadiness=not_declared.',
      'CapabilityRegistry now derives Agent API Runtime providerToolReadiness, providerToolStatus, providerToolRequirements, and providerToolMissingRequirements through evaluateAgentApiProviderToolReadinessFromEvidence plus no-start local provider package metadata for @ai-sdk/openai and @ai-sdk/anthropic instead of hard-coded provider tool/search readiness strings, and keeps selected Agent API Runtime disabled when provider identity is missing even if a generic configured flag is true.',
      'Agent API provider tool readiness summaries now expose selectedApiRuntime, providerConfigured, configuredProvider, providerOwnedMetadata, providerMetadataMatchesSelected, providerMetadataOwner, providerMetadataPackage, explicitToolDeclaration, explicitToolDeclarationSource, explicitToolDeclarationPackage, explicitToolDeclarationPackageMatchesMetadata, declaredToolCount, declaredWebSearchToolCount, declaredWebSearchTools, trustedWebSearchToolCount, and trustedWebSearchTools after trimming plus case-insensitive and separator-normalized deduplication, so settings and smokes can distinguish runtime selection, configured provider identity, provider configuration, matching provider-owned package declarations, matching tool-declaration package identity, raw web/search-specific declarations, and trusted provider-owned web/search declarations from runtime-probe-only tool discovery without overstating duplicate tool evidence or colon/dot provider namespace aliases.',
      'The Agent API provider tool readiness smoke now reads the shared Agent API Runtime capability row and evaluateAgentApiProviderToolReadinessFromEvidence as a read-only build-gated harness, proving providerToolReadiness=not_declared, providerToolStatus=not_declared, providerToolRequirements=4/5, providerToolMissingRequirements=explicit_tool_declaration, configuredProvider=openai, providerMetadataMatchesSelected=yes, providerMetadataPackage=@ai-sdk/openai, explicitToolDeclarationPackage=@ai-sdk/openai, explicitToolDeclarationPackageMatchesMetadata=yes, declaredWebSearchToolCount=0, declaredWebSearchTools=none, trustedWebSearchToolCount=0, trustedWebSearchTools=none, service-evidence=4/5 requirements with explicit_tool_declaration missing, generic-helper service evidence remains genericHelperProviderToolStatus=not_declared with genericHelperDeclaredWebSearchToolCount=0 and genericHelperTrustedWebSearchToolCount=0 for browser.search/search.web_fetch/task_browser/vendor:browse/web_search_cache-style helpers, startupProbe=never, executionRun=deferred, runtimeExecutable=no, provider=not-called, network=not-called, and workspace=unchanged even when API Runtime is selected and provider configuration is present.',
      'AI Runtime settings surfaces those declarations as per-runtime capability chips before execution, including visible native search, hook, and subagent readiness labels plus memory, compact, clear, and write boundaries.',
      'Probed native compact/clear signals are promoted into adapter capability support while context reset still requires Taskplane preservation gates and persistent-session ownership before a runtime-native reset strategy can be selected.',
      'Run Goal Contract and Agent CLI context bridge pass selected-runtime capability declarations into native CLI prompts.',
      'Runtime-native goal audit runs now attach the shared native goal forwarding readiness summary, nativeGoalReady, requirements=x/8, missingEvidence=..., and closed boundary notes without executing the CLI.',
      'Native goal forwarding readiness now requires the selected adapter to declare native goal capability before any future explicit passthrough candidate can be ready.',
      'Right-panel runtime-native goal requests now show the native goal forwarding readiness summary and missing evidence in the operator response and panel timeline payload.',
      'Native-goal discovery default output now reports taskplaneGoalLoop=available, nativeGoalForwarding=audit-only, passthrough=closed, status=skip, skipReason=opt_in_required, and continueWith=taskplane_goal_loop, so a closed runtime-native goal path is not confused with blocked Taskplane task advancement.',
      'The native goal forwarding readiness smoke now runs the shared readiness gate as a read-only build-gated harness, proving unsupported adapter evidence stays audit_only with nativeGoalReady=no, requirements=3/8, and adapter capability missing, reported native-goal capability still stays audit_only with nativeGoalReady=no, requirements=4/8, command shape, progress evidence, control boundary, and packaged smoke missing, and only synthetic complete evidence becomes ready_to_open_passthrough with nativeGoalReady=yes and requirements=8/8 without CLI calls, provider calls, or workspace writes.',
      'Provider-native and Gmail connector preflights now report skipReason=config_missing when configuration is incomplete, before any provider, Gmail, task-memory, or workspace effect is allowed.',
      'Native CLI provider events are projected into runtime-neutral capability progress states for web search, workspace reads/writes, command execution, MCP, and hooks.',
      'Native CLI capability-tagged web/search events and Taskplane web research bridge results are summarized in run progress or completion output.',
      'Agent CLI web research preparation fallback copy now uses the selected runtime native web/search readiness, so skipped bridge steps distinguish verified/runtime-dependent native search from unverified native search instead of implying a hidden fallback.',
      'Fresh external research wording such as latest/current pricing or recent release changes is now covered by the pre-run web research trigger while local current-task wording remains excluded.',
      'Agent CLI web research preparation now records the Source Context batch id and persisted source_context_ids in the Run step output, and renderer progress surfaces those evidence ids when research is captured.',
      'A default-skipped manual Agent CLI native web/search smoke now provides an opt-in live evidence path for exact runtime search behavior while reporting cli=not-called, network=not-called, and workspace=unchanged by default.',
      'Codex CLI 0.125.0 passed the opt-in native web/search smoke on 2026-05-27 with auth=ready, workspace=unchanged, phrase=matched, network=called, and status=passed; the smoke records that --search is a top-level Codex option before exec.',
    ],
    gaps: [
      'Future API and optional non-Codex provider compatibility still need deeper provider-specific readiness checks for exact native web/search behavior beyond auth-gated no-start help-output, workspace-metadata, provider-owned package metadata checks, Agent API no-start provider tool/search non-declaration, and the now-recorded Codex opt-in live smoke evidence; this no longer blocks the Codex-verified CLI-first capability path.',
    ],
    nextActions: [
      'Keep adding static readiness probes only when providers expose stable non-executing metadata; use evaluateAgentApiProviderToolReadinessFromEvidence and the read-only Agent API provider tool readiness smoke to prevent provider configuration from implying native tool/search support, and record non-Codex provider live smoke opportunistically when local account support is available, not as a CLI-first blocker.',
      'Keep native goal passthrough closed until the read-only native goal forwarding readiness smoke and adapter evidence both prove command shape, progress/control evidence, and packaged smoke.',
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
    cliOnlyClosure: 'supported',
    futureApiClosure: 'partial',
    evidence: [
      'Work habits are selected as applicable context and stay behind confirmation flows.',
      'Scheduled briefs use product-harness fallback when provider execution is unavailable.',
      'RuntimeEntrypointCoverage now classifies scheduler stale-run recovery as scheduler_maintenance behind the scheduler feature flag, with post-step Run evidence and no Agent CLI/API startup.',
      'RuntimeEntrypointCoverage now registers automation readiness as a diagnostic-only entrypoint with runtime-context assembly but no runtime_action/pre_step/post_step execution gates.',
      'RuntimeEntrypointCoverage now registers scheduled/event/routine Agent execution as a separate gated provider-visible execution contract with scheduler configuration, confirmation, standing approval, context readiness, task-memory, subtask_start, post-step gates, and explicit operator IPC before any background scheduler trigger can exist.',
      'AgentAutomationReadiness now keeps scheduled, event-triggered, and routine tasks diagnostic-only for automatic starts until a separate scheduled/event execution entrypoint exists, even when procedure, inputs, runtime, risk, and completion criteria are ready.',
      'AgentAutomationReadiness now returns satisfied and missing requirement lists plus automationReady, requirements=x/9, missingRequirements=..., and automationMissingRequirements=... summary evidence; default scheduled/event diagnostics show scheduled_event_entrypoint missing, while connected trigger-service plans can satisfy it before runtime-start gates proceed.',
      'Read-only orchestration diagnostics now expose the automatic-start boundary, distinguishing manual/operator-started readiness from scheduled/event tasks that require a separate execution entrypoint.',
      'AgentAutomationReadiness now projects an autonomy ladder level and next authorized-action level, so ready tasks surface L1 proposal capability and the standing-approval requirement for future L2 limited autonomous action instead of flattening all automation into disabled.',
      'RuntimeEntrypointCoverage now models standing_approval as an explicit deferred gate for scheduled/event autonomous execution and scheduler/background Decision drafts.',
      'AgentStandingApprovalPolicy and evaluateStandingApprovalForAutomation now provide a narrow shared policy surface for L2 limited autonomous action, checking active status, expiry, task scope, lane, runtime, risk ceiling, daily run limit, visible reason, and existing automation readiness before any future scheduler trigger can use it; the evaluation now returns satisfied and missing requirement lists plus standingApprovalReady, requirements=x/13, missingRequirements=..., and standingApprovalMissingRequirements=... summary evidence.',
      'buildStandingApprovalConfirmationDraft now creates a confirmation-only L2 authorization draft with policy, evaluation, scope summary, and explicit schedulerTriggerAllowed=false / workspaceWriteAllowed=false boundaries; it only tolerates the known scheduled/event entrypoint blocker and blocks other automation readiness gaps.',
      'TasksPage Task Dynamics now exposes the Standing Approval draft for scheduled/event/routine tasks as an operator card, making the L2 authorization shape visible while keeping scheduler triggers and workspace writes unavailable.',
      'Standing Approval Task Dynamics cards now surface readiness evidence chips for standingApprovalReady, schedulerTriggerAllowed=false, and workspaceWriteAllowed=false, so operators can see the authorization boundary without parsing the detail string.',
      'TasksPage can now confirm the Standing Approval draft into a panel.standing_approval_confirmed Task Dynamics event through the existing TaskService timeline mutation guard, while still leaving schedulerTriggerAllowed=false and workspaceWriteAllowed=false.',
      'Work Habits now explain the boundary between learned execution context and L2 autonomous authorization: confirmed habits can enter applicable task context, while scheduled/event/routine autonomous starts require the Tasks Standing Approval card and Work Habits do not directly start scheduler jobs or write the workspace.',
      'Settings confirmation threshold now clarifies that lower-confirmation behavior does not bypass Standing Approval, workspace writes, external connectors, paid actions, or release/deploy hard confirmations; it only adjusts interruption frequency for low-risk conversation and suggestions.',
      'planScheduledEventAgentTrigger now acts as the shared scheduled/event trigger planner: it consumes confirmed Standing Approval Task Dynamics records, re-checks runtime readiness, task readiness, policy expiry/scope/risk, task automation class, and returns runtimeStartAllowed=true only when a dedicated trigger service is connected and daily run-limit count evidence is present.',
      'planScheduledEventAgentTriggerFromEvidence now derives scheduled/event trigger readiness from structured service evidence for the selected task, confirmed Standing Approval timeline record, scheduler trigger service connection, and daily run-limit accounting before runtimeStartAllowed can become true.',
      'planScheduledEventAgentTriggerFromEvidence now ignores service-provided Standing Approval records unless schedulerTriggerAllowed=false and workspaceWriteAllowed=false are both explicit before synthesizing timeline planning evidence, so unsafe future API-backed scheduled starts cannot promote from a widened write or scheduler boundary.',
      'Scheduled/event trigger plans now expose runtimeStartSatisfiedRequirements=... and runtimeStartMissingRequirements=... plus runtimeStartReady and runtimeStartRequirements=x/4 summary evidence for trigger_plan_ready, scheduler_trigger_service, selected_runtime_identity, and run_limit_count.',
      'CapabilityRegistry now includes scheduled/event trigger runtime-start readiness in the runtime.scheduler summary through planScheduledEventAgentTriggerFromEvidence, so ConfigurationSafetyReport shows trigger-plan, scheduler-trigger-service, and run-limit-count gaps before scheduler automation can start a run.',
      'The scheduled/event trigger readiness smoke now runs planScheduledEventAgentTrigger and planScheduledEventAgentTriggerFromEvidence as a read-only build-gated harness with stale-build detection, proving no-service plans stay runtimeStartAllowed=false with runtimeStartRequirements=2/4, connected trigger service without run-limit counting stays blocked, service-evidence=2/4 runtime-start requirements with run_limit_count missing, daily-cap-reached plans stay blocked by run-limit evidence, and only trigger-plan-ready + scheduler-trigger-service + selected-runtime-identity + run-limit-count evidence reaches runtimeStartRequirements=4/4 without provider calls, Docker, or workspace writes.',
      'SchedulerService.diagnoseScheduledEventAgentTriggers and triggerScheduledEventAgentRun now build scheduled/event trigger plans through planScheduledEventAgentTriggerFromEvidence, so no-start diagnostics and real trigger attempts share the same service-evidence contract for AI status, target task, scheduler trigger service connection, and daily run-limit accounting.',
      'Scheduled/event trigger planning now accepts explicit daily run-limit accounting input and blocks ready plans when Standing Approval maxRunsPerDay has been reached, while still keeping runtimeStartAllowed=false.',
      'RunRepository.countCreatedSinceByTask now gives SchedulerService a real no-start daily run-count source for scheduled/event diagnostics, so run-limit blocking can be based on persisted same-day Run records instead of caller-supplied test data.',
      'Scheduled/event trigger plans now carry the trigger Run evidence contract for context readiness, target-task identity, task-memory coverage, task-memory guidance, subtask_start, run-limit count, and post-step evidence.',
      'SchedulerService.triggerScheduledEventAgentRun now provides a narrow main-side trigger-service connection: it requires an injected Code Agent trigger port, reuses Standing Approval and persisted same-day run-limit checks, starts only ready plans with schedulerTriggerServiceConnected=true, and emits a bounded model-producer Code Agent run request with operatorConfirmed=true, default test/lint checks filtered by workspace availability, target task id, task-memory guidance including first open completion criterion and first source title, automation readiness evidence including scheduledEventEntrypoint=available, Standing Approval policy id and scope, runtime-start requirement evidence, run-limit evidence, post-step terminal-evidence guidance, and explicit workspaceWriteAllowed=false proposal-only boundary.',
      'Task Dynamics now exposes a confirmed Standing Approval "启动一次" operator action backed by scheduler:triggerScheduledEventAgentRun IPC, so scheduled/event tasks can start one bounded Agent run without enabling a background scheduler job.',
      'The Standing Approval "启动一次" operator feedback now includes the required trigger evidence items, run-limit usage, and proposal-mode write boundary immediately after a run starts, matching the deeper Task Dynamics timeline evidence without requiring the operator to open event detail first.',
      'SchedulerService.triggerScheduledEventAgentRun now returns terminalRunEvidenceStatus and triggerRunEvidenceStatus for the single-run operator action, so Task Dynamics can distinguish started-but-pending terminal Run evidence from completed/failed terminal evidence and show whether trigger evidence is waiting for terminal review.',
      'Scheduled/event Agent terminal trigger evidence now requires a terminal run status plus reviewable output or failureReason before terminalRunEvidenceStatus becomes present, so completed/failed runs without inspectable evidence remain pending_terminal_run_evidence instead of being treated as ready for terminal review.',
      'SchedulerService.triggerScheduledEventAgentRun now records panel.scheduled_event_agent_triggered timeline evidence after a run starts, preserving run id, run status/outputSource/failureReason, terminalRunEvidenceStatus, triggerRunEvidenceStatus, target task id, Standing Approval policy id, automation readiness summary plus satisfied/missing requirements, run-limit state, runtime-start satisfied/missing requirements, schedulerTriggerServiceConnected, runtimeStartAllowed, workspaceWriteAllowed=false, and required trigger evidence in Task Dynamics.',
      'Scheduled/event Agent trigger evidence now preserves triggerKind=manual|cron in both the bounded Code Agent run request and panel.scheduled_event_agent_triggered timeline payload, so live soak can distinguish operator-started runs from background scheduler starts without adding a second automation path.',
      'The Standing Approval operator action feedback now surfaces run.failureReason when the scheduled/event Agent run reaches a failed terminal state, so the operator can see failure evidence immediately without opening the timeline detail.',
      'SchedulerService.triggerScheduledEventAgentRun now blocks even operator-confirmed scheduled/event starts when the Task Dynamics timeline evidence port is not connected, keeping L2 Agent action evidence mandatory before any Code Agent run can start.',
      'scheduler:triggerScheduledEventAgentRun now emits run.changed, task.changed, and brief.changed after a started scheduled/event Agent run, and also refreshes run plus target/returned task surfaces when a blocked operator-started run preserves recovery evidence such as a run-identity mismatch.',
      'RuntimeEventRecord now formats panel.scheduled_event_agent_triggered payloads into readable Task Dynamics detail with run id, target task id, trigger plan summary, run status, failure reason when present, terminal Run evidence status, trigger evidence status, required trigger evidence items, automation-readiness gate status, runtime-start gate status, localized trigger kind labels for 自动巡检 and 手动启动, Standing Approval policy id, run-limit usage, and workspace proposal-mode write boundary.',
      'SchedulerService.runScheduledEventAgentTriggerSweep wires the same trigger service into a 15-minute background scheduler job only when the Code Agent trigger port, Task Dynamics timeline port, and scheduled/event task-source port are all connected; SchedulerStatus now exposes scheduledEventAgentSweepJobConnected before first run evidence plus lastScheduledEventAgentSweepSummary for completed and skipped sweeps, and the sweep reuses persisted run-limit counts and the shared planner before starting any run.',
      'SchedulerService tests now drive the registered */15 scheduled/event Agent cron callback and prove it starts the same bounded Code Agent run path with triggerKind=cron, operatorConfirmed=true, target task identity, timeline evidence, and workspaceWriteAllowed=false.',
      'SchedulerService tests now exercise consecutive */15 scheduled/event Agent cron ticks against persisted same-day run counts, proving the second tick is blocked with started=0, blocked=1, triggerRunEvidenceStatus=not_started, and no second Code Agent trigger when the Standing Approval daily cap is reached.',
      'SchedulerService.runScheduledEventAgentTriggerSweep now converts task-source, planning, trigger-port, and timeline failures into a persisted sweep_failed summary with checked task evidence, sanitized error evidence, and a released in-flight guard, so background cron failures remain operator-visible and recoverable instead of becoming unhandled scheduler promises; timeline-recording failures after a run starts also preserve startedRunIds, terminalRunEvidenceMissingRunIds, triggerRunEvidenceRequired, and triggerRunEvidenceStatus=pending_terminal_run_evidence without counting the started run as blocked.',
      'SchedulerService tests now prove task-source failures before candidate loading persist sweep_failed with checked=0, checkedTaskIds=none, no Code Agent trigger, no timeline evidence, and recovery on the next sweep after the in-flight guard is released.',
      'SchedulerService.runScheduledEventAgentTriggerSweep now publishes a sweep result listener after completed, skipped, and failed sweep summaries, and bootstrap wires it to brief.changed so automatic-sweep health chips refresh even when no Agent run starts.',
      'The scheduled/event Agent sweep smoke now proves sweepListenerEvidence=passed, disconnectedSweepListenerEvidence=passed, inFlightSweepListenerEvidence=passed, failedSweepListenerEvidence=passed, and timelineFailedDecisionProposalEvidence=recorded, so the Brief refresh listener path and timeline-failure Decision proposal path have acceptance coverage for completed, ports_not_connected, in_flight, and sweep_failed outcomes.',
      'Overlapping scheduled/event Agent sweeps now return skipReason=in_flight with triggerRunEvidenceStatus=not_started and do not start a second Code Agent run while the first sweep is still resolving candidates.',
      'Blocked scheduled/event Agent sweeps now expose missingPorts=run_port,timeline_port,task_source_port summary evidence instead of hiding automatic-start blockers behind a generic skipped status.',
      'SchedulerService.runScheduledEventAgentTriggerSweep now deduplicates scheduled/event task candidates before runtime start, keeps raw checkedTaskIds as sweep evidence, and routes duplicate task-source evidence to a scheduler Decision proposal instead of spending Standing Approval capacity on repeated candidates.',
      'Scheduled/event Agent sweep results now expose skipReason, checkedTaskIds, startedRunIds, blockedReasons, blockedTaskSummaries, runFailureReasons, automationMissingRequirements, automationSatisfiedRequirements, runtimeStartMissingRequirements, terminalRunEvidenceMissingRunIds, triggerRunEvidenceRequired, and triggerRunEvidenceStatus at the top level, so background automation summaries preserve completed/skipped cause, which tasks were evaluated, which run started, terminal failure reasons, which task was blocked by which reason, which automation-readiness requirements are satisfied or missing, which runtime-start requirements remain missing, which started runs still lack terminal Run evidence, which trigger evidence is required, and whether trigger evidence is still waiting for terminal review without parsing nested summaries.',
      'Brief now surfaces schedulerStatus.lastScheduledEventAgentSweepAt, lastScheduledEventAgentSweepSummary, and scheduledEventAgentSweepJobConnected as automatic-sweep status chips when the scheduler is enabled, so scheduled/event automation health is visible from the operator home surface instead of only service logs or acceptance output; skipped ports_not_connected and in_flight sweeps also update lastScheduledEventAgentSweepAt so no-run outcomes still carry time evidence.',
      'Brief automatic-sweep chips now derive the visible label from lastScheduledEventAgentSweepSummary before the timestamp, so completed sweeps show 已运行, waiting_for_first_tick stays 已接线, ports_not_connected shows 未接线, in_flight shows 运行中, and sweep_failed shows 异常 instead of treating every timestamped skipped sweep as a completed run.',
      'Brief ports_not_connected automatic-sweep chips now include a missing port count parsed from missingPorts, so operators can see the recovery scope without opening the tooltip.',
      'Brief automatic-sweep chips now parse automationMissingRequirements and show 准备缺 N only when automation readiness is missing, keeping satisfied readiness quiet while making blocked background automation actionable from the home surface.',
      'Brief completed automatic-sweep chips now show 限额 when blockedReasons reports the scheduled/event daily run limit, so normal L2 protection is visible without opening the tooltip.',
      'Brief automatic-sweep chips now parse terminalRunEvidenceMissingRunIds and show 终态缺 N only when started runs still lack terminal Run evidence, so pending post-step review is visible without opening the tooltip.',
      'Brief completed automatic-sweep chips now include checked, started, blocked, run-failure count, and trigger Run evidence labels parsed from lastScheduledEventAgentSweepSummary, so operators can see the last sweep scope, whether it started work or hit blocked tasks, whether terminal runs failed, and whether trigger evidence is waiting for terminal Run evidence or ready for review without opening the tooltip.',
      'Brief failed automatic-sweep chips now parse startedRunIds and triggerRunEvidenceStatus, so timeline-failure sweeps that already started a run show 启动 N and 证据待终态 instead of only 异常 and checked count.',
      'SchedulerService.runScheduledEventAgentTriggerSweep now records completed sweep time from the triggering now value, matching skipped sweep time evidence and keeping scheduler status deterministic for cron/manual trigger review.',
      'The scheduled/event Agent sweep smoke now proves missingTimelineEvidenceGate=blocked, missingTimelineStatus=blocked, missingTimelineTriggerRunEvidenceStatus=not_started, and missingTimelineTriggerCalls=0 when an operator-confirmed trigger has a Code Agent trigger port but no Task Dynamics timeline evidence port.',
      'The scheduled/event Agent sweep smoke now proves durableRunLimitCountEvidence=passed with runLimitCountSince=2026-05-26T00:00:00.000Z and checked task ids, so acceptance coverage verifies the sweep reads persisted same-day Run counts through the UTC day window before applying Standing Approval limits.',
      'A manual scheduled/event Agent background live preflight now reports backgroundLiveRun=deferred, requiredEvidence=scheduler_job_connected,standing_approval,context_readiness,task_memory_guidance,subtask_start,task_source_port,code_agent_trigger_port,timeline_evidence,durable_run_limit_counting,terminal_run_evidence,post_step_gates, and provider=not-called/workspace=unchanged by default; when scheduler, sandbox Code Agent, model producer, provider config, API key, and workspace root gates are configured it reports status=ready and backgroundLiveRun=ready_to_attempt without calling the provider, giving operators a repeatable gate check before live background-triggered execution.',
      'A manual scheduled/event Agent background live smoke is now packaged behind TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_SMOKE=true; by default it reports status=skip, backgroundLiveRun=not-started, provider=not-called, docker=not-started, and workspace=unchanged, and when explicitly enabled it reuses SchedulerService.runScheduledEventAgentTriggerSweep("cron") with a scheduled/routine fixture, durable run-limit counting, Task Dynamics timeline evidence, and the Code Agent model-producer trigger port for one provider-backed background sweep.',
      'Opt-in scheduled/event Agent background live smoke passed locally on 2026-05-27 with fal-openrouter / google/gemini-2.5-flash: status=passed, backgroundLiveRun=attempted, sweepStatus=completed, triggerRunEvidenceStatus=ready_for_terminal_review, startedRunIds=run_scheduled_event_background_live_smoke, timelineEvents=1, runLimitCountSince=2026-05-27T00:00:00.000Z, provider=called, stagedFiles=.taskplane/scheduled-event-agent-background-live-smoke.md, docker=not-started, and workspace=unchanged.',
      'A manual scheduled/event Agent packaged background soak is now packaged behind TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_PACKAGED_BACKGROUND_SOAK=true; by default it reports status=skip, packagedApp=not-launched, backgroundLiveRun=not-started, provider=not-called, docker=not-started, and workspace=unchanged, and when explicitly enabled it checks macOS, the packaged app executable, provider gates, API runtime mode, and workspace root before launching the persistent app boundary.',
      'The scheduled/event Agent packaged background soak harness now launches the packaged app with isolated userData and workspace roots, seeds a scheduled/routine task with completion criteria, source context, SOP binding, and Standing Approval timeline evidence, triggers scheduler:triggerScheduledEventAgentRun through the preload IPC, waits for terminal persisted Run evidence, verifies context-readiness, accepted Code Agent check evidence, provider-visible context, trigger timeline evidence, post-step Decision/artifact evidence, and confirms the workspace fixture remains unchanged.',
      'Opt-in scheduled/event Agent packaged background soak passed locally on 2026-05-27 after npm run dist:mac:dir with fal-openrouter / google/gemini-2.5-flash and Docker Desktop: status=passed, packagedApp=launched, backgroundLiveRun=attempted, triggerStatus=started, triggerRunEvidenceStatus=ready_for_terminal_review, terminalRunEvidenceStatus=present, runStatus=completed, runSteps=15, timelineEvents=6, decisions=1, artifacts=1, provider=called, docker=attempted_by_packaged_code_agent, and workspace=unchanged.',
      'The scheduled/event Agent sweep smoke now exercises the built main SchedulerService sweep path without provider calls or Docker, proving checked=2 duplicate candidates, checkedTaskIdsEvidence=passed, started=1, blocked=1 by duplicate candidate skip before runtime start, duplicateCandidateDecision=proposed, skipReason=none, startedRunIds evidence, blockedReasons evidence, blockedTaskSummaryEvidence=passed, runFailureReasons evidence, automationMissingRequirements evidence, automationSatisfiedRequirements evidence, runtimeStartRequirements=passed, terminalRunEvidenceMissingRunIds evidence, triggerRunEvidenceRequired evidence, triggerRunEvidenceStatus=pending_terminal_run_evidence, manualSweepSummary evidence, terminalSweepSummary evidence, cronSweepSummary evidence, disconnectedSkipReason=ports_not_connected, disconnectedTriggerRunEvidenceStatus=not_started, inFlightSkipReason=in_flight, inFlightTriggerRunEvidenceStatus=not_started, failedSkipReason=sweep_failed, failedTriggerRunEvidenceStatus=not_started, failedSweepSummaryEvidence=recorded, failedSweepRecoveryEvidence=passed, timelineFailedStartedRunEvidence=recorded, timelineFailedNotBlockedEvidence=passed, timelineFailedTriggerRunEvidence=recorded, timelineFailedSweepSummaryEvidence=recorded, timelineFailedDecisionProposalEvidence=recorded, runIdentityFailedStartedRunEvidence=recorded, runIdentityFailedDecisionProposalEvidence=recorded, sourceFailedSkipReason=sweep_failed, sourceFailedTriggerRunEvidenceStatus=not_started, sourceFailedSweepSummaryEvidence=recorded, sourceFailedSweepRecoveryEvidence=passed, readinessBlockedDecisionProposalEvidence=recorded, readinessBlockedNoTriggerEvidence=passed, runLimitAccountingDecisionProposalEvidence=recorded, invalidRunLimitNoTriggerEvidence=passed, cronSoakRunLimitEvidence=passed, cronSoakAutomationReadinessEvidence=passed, cronSoakNoSecondTriggerEvidence=passed, completedSweepTimeEvidence=recorded, skippedSweepTimeEvidence=recorded, boundedRunTargetTask=passed, boundedRunTaskMemoryGuidance=passed, boundedRunAutomationReadiness=passed, boundedRunFirstCriterion=passed, boundedRunFirstSource=passed, boundedRunPostStepGuidance=passed, boundedRunWorkspaceWriteBoundary=passed, boundedRunStandingApprovalScope=passed, terminalTriggerRunEvidenceStatus=ready_for_terminal_review, cronTriggerRunEvidenceStatus=ready_for_terminal_review, manualTriggerKind=manual, terminalTriggerKind=manual, cronTriggerKind=cron, startupSweepJobConnected=yes, triggerRunEvidence=passed, sweepAutomationReadinessEvidence=passed, terminalTriggerRunEvidence=passed, cronTriggerRunEvidence=passed, cronRunFailureReasonEvidence=passed, failedRunDecisionDedupeEvidence=passed, triggerKindEvidence=passed, boundedRunTargetTaskEvidence=passed, boundedRunTaskMemoryEvidence=passed, boundedRunAutomationReadinessEvidence=passed, boundedRunFirstCriterionEvidence=passed, boundedRunFirstSourceEvidence=passed, boundedRunPostStepEvidence=passed, boundedRunWorkspaceBoundaryEvidence=passed, boundedRunStandingApprovalScopeEvidence=passed, runLimitEvidence=passed, targetTaskId timeline evidence, timelineEvidence=recorded, terminalTimelineEvidence=recorded, cronTimelineEvidence=recorded, timelineWorkspaceBoundary=recorded, terminalTimelineWorkspaceBoundary=recorded, cronTimelineWorkspaceBoundary=recorded, startupSweepJobEvidence=recorded, sweepSummaryEvidence=recorded, disconnectedSweepSummaryEvidence=recorded, inFlightSweepSummaryEvidence=recorded, runStatusEvidence=recorded, terminalRunStatusEvidence=recorded, cronRunStatusEvidence=recorded, workspace=unchanged, provider=not-called, and docker=not-started.',
      'Local scheduled/event Agent sweep acceptance on 2026-05-28 passed through npm run accept:scheduled-event-agent-sweep-smoke with status=completed, checked=2, started=1, blocked=1, duplicateCandidateDecision=proposed, triggerRunEvidenceStatus=pending_terminal_run_evidence, terminalTriggerRunEvidenceStatus=ready_for_terminal_review, cronTriggerRunEvidenceStatus=ready_for_terminal_review, cronRunFailureReasonEvidence=passed, failedRunDecisionDedupeEvidence=passed, durableRunLimitCountEvidence=passed, cronSoakRunLimitEvidence=passed, cronSoakNoSecondTriggerEvidence=passed, startupSweepJobConnected=yes, sweepSummaryEvidence=recorded, sweepListenerEvidence=passed, disconnectedSweepSummaryEvidence=recorded, disconnectedSweepListenerEvidence=passed, inFlightSweepSummaryEvidence=recorded, inFlightSweepListenerEvidence=passed, failedSweepSummaryEvidence=recorded, failedSweepListenerEvidence=passed, failedSweepRecoveryEvidence=passed, timelineFailedStartedRunEvidence=recorded, timelineFailedNotBlockedEvidence=passed, timelineFailedTriggerRunEvidence=recorded, timelineFailedSweepSummaryEvidence=recorded, timelineFailedDecisionProposalEvidence=recorded, runIdentityFailedStartedRunEvidence=recorded, runIdentityFailedDecisionProposalEvidence=recorded, sourceFailedSweepSummaryEvidence=recorded, sourceFailedSweepRecoveryEvidence=passed, readinessBlockedDecisionProposalEvidence=recorded, readinessBlockedNoTriggerEvidence=passed, runLimitAccountingDecisionProposalEvidence=recorded, invalidRunLimitNoTriggerEvidence=passed, skippedSweepTimeEvidence=recorded, triggerKindEvidence=passed, boundedRunTargetTaskEvidence=passed, boundedRunTaskMemoryEvidence=passed, boundedRunFirstCriterionEvidence=passed, boundedRunFirstSourceEvidence=passed, boundedRunPostStepEvidence=passed, boundedRunWorkspaceBoundaryEvidence=passed, boundedRunStandingApprovalScopeEvidence=passed, timelineWorkspaceBoundary=recorded, terminalTimelineWorkspaceBoundary=recorded, cronTimelineWorkspaceBoundary=recorded, startupSweepJobEvidence=recorded, terminalRunEvidenceMissingRunIds=run_scheduled_event_sweep_smoke, workspace=unchanged, provider=not-called, and docker=not-started.',
    ],
    gaps: [
      'Future API-provider scheduled/event execution and broader habit automation remain partial; the CLI-first packaged scheduled/event Agent path is now supported with persistent-app soak evidence.',
    ],
    nextActions: [
      'Keep scheduled/event execution on the supported CLI-first packaged path; promote any future API-backed scheduled execution only after planScheduledEventAgentTriggerFromEvidence, the read-only scheduled/event trigger readiness smoke, selected-runtime evidence, standing-approval, run-limit, terminal-evidence, and workspace-boundary gates all pass.',
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
      'The manual Agent CLI native web/search smoke is default-skipped and reports skipReason=opt_in_required, cli=not-called, network=not-called, and workspace=unchanged unless explicitly enabled for one live native search request.',
      'The Codex native web/search smoke passed locally on 2026-05-27 with codex-cli 0.125.0, auth=ready, workspace=unchanged, phrase=matched, network=called, and status=passed.',
      'Scheduler stale-run recovery now records lastRunSweepSummary with checked count, recovered count, recoveredRunIds, recovery failureReason, and agentRuntimeStarted=no, and Brief surfaces that recovery summary as a run-recovery status chip with the full summary in the title, so startup and maintenance recovery evidence is operator-visible beyond a timestamp without starting Agent CLI/API runtimes.',
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
