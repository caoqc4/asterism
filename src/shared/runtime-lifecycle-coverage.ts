export type RuntimeLifecycleCoverageStatus =
  | 'implemented'
  | 'partial'
  | 'missing';

export type RuntimeLifecycleCoveragePriority =
  | 'p0'
  | 'p1'
  | 'p2';

export type RuntimeLifecycleCoverageItem = {
  phase: string;
  status: RuntimeLifecycleCoverageStatus;
  priority: RuntimeLifecycleCoveragePriority;
  scope: 'product_runtime' | 'agent_runtime' | 'ui_runtime' | 'data_runtime';
  coveredBy: string[];
  outOfAgentPrinciplesScope: string[];
  gaps: string[];
  nextImplementation: string[];
};

export const RUNTIME_LIFECYCLE_COVERAGE: RuntimeLifecycleCoverageItem[] = [
  {
    phase: 'task_intake_and_capture',
    status: 'partial',
    priority: 'p0',
    scope: 'product_runtime',
    coveredBy: [
      'RightPanel can capture a global discussion into a pending task.',
      'TasksPage explicit task creation passes through the shared task_capture pre-step guard before persistence.',
      'Project decomposition creates draft child tasks before real subtasks.',
      'runtime-action-evaluator includes task_capture.',
      'runtime-intake-evaluator routes candidate input to task, Task Record, task file, Decision, Work Habit, or discussion before capture.',
      'runtime-task-capture-evaluator blocks duplicate open-task captures and generic title-only task candidates before persistence.',
      'runtime-task-capture-evaluator also blocks generic phase-template task titles, generic phase-template child titles, and child titles that only repeat the parent.',
      'TasksPage explicit task creation and RightPanel conversation capture pass task candidates through the shared capture evaluator.',
      'TasksPage explicit task creation passes the same summary used by the capture evaluator into TaskService.create.',
      'TaskService.create enforces the same task-capture evaluator at the service boundary before repository persistence.',
      'TaskService.update reuses the same evaluator when title or parent scope changes, preventing duplicate siblings during project moves.',
    ],
    outOfAgentPrinciplesScope: [
      'Product-level intake must decide whether the user is creating work, browsing existing work, asking for status, or discussing direction.',
      'The UI must distinguish capture, draft, confirm, and enter-task states.',
    ],
    gaps: [
      'RightPanel capture uses shared intake routing and TasksPage explicit creation uses the shared task_capture guard, but some retained creation entry points are not fully covered by intake yet.',
      'Service-level guards now block duplicate open-task captures, generic title-only candidates, generic phase-template titles, generic child phase-template titles, and child titles that repeat the parent; broader semantic duplicate detection remains limited to normalized titles.',
    ],
    nextImplementation: [
      'Route remaining creation entry points through shared intake checks.',
      'Extend duplicate detection beyond exact normalized titles when enough semantic context is available.',
    ],
  },
  {
    phase: 'context_entry_and_binding',
    status: 'partial',
    priority: 'p0',
    scope: 'ui_runtime',
    coveredBy: [
      'RightPanel tracks active task context and selected task context.',
      'RuntimeContextSnapshot exists and is rendered from the active task plus selected file state.',
      'runtime-action-evaluator handles context_switch and context_clear.',
      'RuntimeHandoff evaluates task switch, refresh, leave-context, and global conversation transitions.',
      'RightPanel separates refresh, manual refresh, leave task context, and new conversation.',
      'RightPanel confirmed and dismissed task context switches now persist panel.* timeline events for audit projection.',
    ],
    outOfAgentPrinciplesScope: [
      'Product runtime must synchronize selected task, active panel task, selected file, and input context.',
      'The UI must prevent double-selected navigation state and stale prompt context.',
    ],
    gaps: [
      'RuntimeContextSnapshot exists, but RightPanel still keeps activeTaskId, pendingSwitch, selected file, and input state as separate React state values instead of one reducer/store.',
    ],
    nextImplementation: [
      'Move RightPanel context state transitions behind a small reducer backed by RuntimeContextSnapshot.',
    ],
  },
  {
    phase: 'context_assembly',
    status: 'partial',
    priority: 'p0',
    scope: 'agent_runtime',
    coveredBy: [
      'buildAgentWorkingContext assembles task state and structured context, including source metadata needed for freshness evaluation.',
      'buildRuntimeContextManifest projects task state, selected files, sources, artifacts, task files, timeline, and work habits.',
      'buildRuntimeContextAssemblyPolicy evaluates required read-order inputs such as product principles, task state, and Task.md.',
      'RuntimeCapabilitySnapshot summarizes model, workspace checks, feature flags, and tool scaffold state, and RuntimeContextManifest can include it as a capability context item.',
      'pre_step runtime verification can consume RuntimeCapabilitySnapshot when an execution explicitly requires model execution or workspace verification.',
      'RunService run_start passes RuntimeCapabilitySnapshot for model execution checks, and CodeAgentRunService passes it for model/workspace capability checks.',
      'RunService, CodeAgentRunService, and OperatorStartedRunService pass run_start through TaskMemoryCoverageEvaluation before execution.',
      'RunService, CodeAgentRunService, and OperatorStartedRunService block run_start when prior task-memory guidance is still pending.',
      'SourceFreshnessEvaluation classifies source materials as include, caution, or exclude, and RuntimeContextManifest can attach inclusion decisions and reasons to source context items.',
      'SourceMaterialQualityEvaluation classifies traceability, credibility, duplication, and sensitivity; RuntimeContextManifest combines it with freshness before including source context content.',
      'AgentWorkingContext retains source uri metadata so source-quality traceability checks can use original source locations when available.',
      'SelectedFileRelevanceEvaluation classifies selected files as include, caution, or exclude, and RuntimeContextManifest can attach selected-file relevance reasons.',
      'RuntimeContextAssemblyGate distinguishes provider-visible task execution from hidden non-model runtime entries.',
      'RunOrchestrator blocks model execution when runtime context assembly is missing required inputs.',
      'CodeAgentRunService blocks model-producer execution when required task recovery context is missing and passes selected source-context metadata into RuntimeContextManifest before execution.',
      'OperatorStartedRunService records that browser evidence and local QA entries do not require provider-visible context assembly only when providerCall=no and modelExposure=hidden.',
      'Code Agent has provider-visible context manifest logic.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must explain why context was included or excluded, not only what Agent should read.',
      'Runtime must handle UI visibility, model visibility, and durable context separately.',
    ],
    gaps: [
      'Source freshness, source quality, and selected-file relevance are now represented as first-class inclusion reasons, ordinary Run working context and Code Agent model-producer runs pass source metadata, but future provider-visible entry points must also pass full context metadata.',
    ],
    nextImplementation: [
      'Require any future provider-visible execution entry point to pass full source and selected-file metadata into RuntimeContextManifest before model/provider execution.',
    ],
  },
  {
    phase: 'priority_and_attention',
    status: 'partial',
    priority: 'p1',
    scope: 'product_runtime',
    coveredBy: [
      'Brief and Tasks use shared priority recommendation ranking for priority lists.',
      'Brief is documented as an attention summary rather than complete project management.',
      'PriorityAttentionProjection now centralizes shared ordering plus optional display limits, so Tasks can consume the full ordered queue while Brief consumes the same order as a capped summary.',
    ],
    outOfAgentPrinciplesScope: [
      'Brief and priority queue design are product attention mechanics, not Agent execution rules.',
      'Sorting must reconcile actionable priority, blockers, waiting state, dates, and recent intent.',
    ],
    gaps: [
      'Priority ranking has a shared projection with display-limit metadata, but traceable user-facing ranking reasons are still limited to each recommendation reason.',
      'Brief vs Tasks ordering and display-limit behavior has shared coverage tests; broader end-to-end page projection tests can still be added when UI work resumes.',
    ],
    nextImplementation: [
      'Keep attention projection data-only unless UI work is explicitly requested.',
    ],
  },
  {
    phase: 'execution_start_and_step_loop',
    status: 'partial',
    priority: 'p0',
    scope: 'agent_runtime',
    coveredBy: [
      'RunService, CodeAgentRunService, and OperatorStartedRunService pass through run_start evaluation.',
      'RunService, CodeAgentRunService, and OperatorStartedRunService now pass run_start through pre_step verification before creating/executing work.',
      'RunService, CodeAgentRunService, and OperatorStartedRunService run subtask_start target-readiness checks before creating ordinary, Code Agent, or operator-started runs.',
      'RunService paused-run continuation validates resume checkpoint eligibility before rechecking target-task readiness with subtask_start.',
      'TaskService guards direct transitions into running with the same subtask_start target-readiness check.',
      'Runs and run steps store plan, model, tool, checkpoint, failure, and final events.',
      'AgentToolRegistry gates risky commands and writes.',
      'runtime-verification has first-pass pre_step and post_step modes for action permission, pending decisions, required context, and durable-change recovery notes.',
      'Run verification persistence now writes step verifications through post_step verification.',
      'runtime-step-effect-evaluator infers durable step changes and recovery-note presence before post_step verification.',
      'RunService checks completed Run output artifact writes with post_step durable-change verification before persisting generated output.',
      'Sandbox patch review and browser evidence persisters check artifact writes with post_step durable-change verification before persisting generated evidence artifacts.',
      'RightPanel phase closeout now passes through pre_step before saving and post_step before quality-check handoff.',
      'RightPanel task file proposal confirmation now passes through pre_step and post_step verification.',
      'TaskService transition and transitionIfAllowed guard task_state_transition at the service boundary.',
      'TaskService completion transitions require task_completion memory coverage, including passed or overridden completion-check evidence.',
      'Task completion coverage ignores Run and completion-check evidence older than the latest completion-criteria update.',
      'TaskService direct and guarded waiting transitions require a waiting reason before writing waiting_external state.',
      'TaskService task updates, task-bound source contexts, blockers, completion criteria, dependencies, and process-template bindings guard task_mutation at the service boundary.',
      'TaskService source-context archive/update, blocker update/resolve, dependency resolve, and process-template removal now read the owning task and guard task_mutation before repository writes.',
      'Tasks and Brief task state transitions now use shared renderer runtime guards backed by pre_step verification.',
      'Tasks special mutation paths for Task.md sync, risk updates, project moves, and project parent updates now use shared mutation guards.',
      'Tasks file actions for create, rename, move, delete, source key toggles, source archive, and artifact creation now use durable panel action guards.',
      'Main IPC task-file and manual-artifact write boundaries guard task_mutation before repository writes.',
      'Tasks file content saves for Task.md/Task Records, task files, sources, and artifacts now use durable panel action guards plus post-step completion checks.',
      'Tasks project decomposition confirmation now guards child task creation, child planning transitions, dependency creation, parent updates, task records, and completion criteria writes.',
      'TaskService completion criteria creation and updates now reject empty, generic, or duplicate open completion criteria before persistence.',
      'TaskService dependency creation and updates now reject self-dependencies before persistence.',
      'TaskService blocker creation and updates now reject untitled blockers before persistence.',
      'AgentToolRegistry task/source/artifact durable tools now use pre_step and post_step runtime verification.',
      'RightPanel session refresh, phase closeout, and Task.md reference writes now guard their internal source/task-record persistence.',
      'RightPanel task capture, captured-task confirmation, and captured-task abandonment now use runtime verification guards.',
      'RightPanel task-context follow-up task capture now passes explicit follow-up proposals through task closeout evaluation before creating a new task.',
      'TasksPage file/source/artifact actions and project decomposition confirmation now persist panel.* timeline events for RuntimeEventRecord audit projection.',
      'TasksPage project membership changes and completion handoffs now persist panel.* timeline events for task-to-task replay.',
      'TaskService recordTimelineEvent now guards panel.* task dynamic writes with task_mutation before appending timeline events.',
      'RuntimeEntrypointCoverage keeps retained execution, resume, context-transition, task-capture, task-transition, project-decomposition, decision-action, agent-tool, and durable-write entrypoints explicit with required runtime gates.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must decide whether execution is panel-lightweight, Run-backed, Code Agent, operator-started browser QA, or future scheduled/event execution.',
    ],
    gaps: [
      'Runtime guards now cover the current retained execution and durable-write surfaces; future scheduled/event execution, new provider-visible tools, or new panel write paths must explicitly opt into the same pre_step, post_step, and subtask_start gates.',
      'RuntimeEntrypointCoverage is a regression registry, not dynamic enforcement; future runtime entrypoints must be added to the registry and wired to the listed gates.',
      'RuntimeEventRecord projection and replay grouping are consumed in Tasks task dynamics; future Run-side and retained activity surfaces must reuse the same projection.',
      'Legacy WorkbenchPage remains retired; new runtime behavior must stay within TasksPage, RightPanel, Runs, Activity, or Decisions surfaces.',
    ],
    nextImplementation: [
      'Require future task-dynamic surfaces to consume RuntimeEventRecord and groupRuntimeEventsForReplay rather than raw timeline-only data.',
      'Keep legacy WorkbenchPage retired; new runtime behavior must land in retained TasksPage, RightPanel, Runs, Activity, or Decisions surfaces.',
    ],
  },
  {
    phase: 'information_routing_and_memory',
    status: 'partial',
    priority: 'p0',
    scope: 'data_runtime',
    coveredBy: [
      'runtime-surface-routing classifies files, source materials, AI output, artifacts, decisions, work habits, and run steps.',
      'Task file, source context, artifact, Decision, and Work Habit creation paths use shared normalization.',
      'Tasks file projections keep ordinary task files separate from artifacts while preserving Task.md, Task Records, AI output, source material, and artifact classes.',
      'Tasks source-context file projections use shared source-context routing before deciding whether a source appears as Task Record, AI output, or source material.',
      'TaskRecordWorthinessEvaluation centralizes when handoff, closeout, correction, option rationale, failure review, context archive, external signal, or durable state changes deserve Task Records.',
      'RightPanel context-refresh and phase-closeout Task Record writes now pass through TaskRecordWorthinessEvaluation before creating files.',
      'TaskMdUpdateNeedEvaluation centralizes when Task.md should be updated for recovery fields and important file references.',
      'RightPanel Task.md important-file reference writes now pass through TaskMdUpdateNeedEvaluation before creating or updating Task.md.',
      'TasksPage direct Task.md saves now pass through TaskMdUpdateNeedEvaluation before persisting the primary recovery file.',
      'TasksPage manual Task Record creation now passes through TaskRecordWorthinessEvaluation before creating Task Records files.',
      'RuntimeRecoveryGuidance centralizes structured Task.md and Task Record recovery recommendations, while preserving legacy guidance messages.',
      'AgentToolRegistry durable tool results now expose structured recoveryGuidanceItems plus legacy recoveryGuidance messages from RuntimeRecoveryGuidance without silently mutating Task.md.',
      'AgentToolRegistry source-context writes use TaskRecordWorthinessEvaluation before recommending Task Record guidance, so raw source capture does not automatically become a task record.',
      'AgentToolRegistry persists recoveryGuidanceItems as a separate Run Step so task-memory recommendations remain auditable without silently mutating Task.md or Task Records.',
      'TaskMemoryGuidanceState distinguishes persisted task-memory guidance from completed Task.md or Task Record writes, so automatic context clearing can treat unresolved guidance as pending memory work.',
      'TaskMemoryGuidanceState tracks pending Task.md and Task Record guidance per target, so newer guidance for one memory surface does not hide unresolved guidance for another.',
      'TaskMemoryGuidanceState reads structured guidance targets from Run Step input before falling back to human-readable guidance text.',
      'TaskMemoryWriteProposal projects pending guidance into minimal confirmed-write proposals for Task.md or Task Records without performing automatic writes.',
      'Run start pre-step verification consumes pending TaskMemoryGuidanceState, so new execution cannot bypass unresolved task-memory writes.',
      'TaskMemoryCoverageEvaluation maps the Task Memory Spec outcomes to runtime checks and is now consumed by context-clear, task-start, run-start, task-switch, task-completion modal, and RightPanel phase-closeout paths.',
      'AutoContextClearReadiness wraps TaskMemoryCoverageEvaluation into safe_to_clear, needs_memory_write, needs_user_decision, keep_context, and not_applicable outcomes without introducing a hard message-count rule.',
      'RuntimeHandoff task-switch also consumes pending TaskMemoryGuidanceState through AutoContextClearReadiness before leaving the previous task context.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime owns durable data model boundaries and UI labels for files, records, sources, and generated output.',
    ],
    gaps: [
      'TaskMdUpdateNeedEvaluation covers RightPanel references, TasksPage Task.md saves, and AgentToolRegistry durable tool guidance through RuntimeRecoveryGuidance; remaining retained durable state changes should consume it through TasksPage, RightPanel, Runs, or Decisions.',
      'Output-reference propagation to Task.md or Task Records is now recommended by tool guidance and can be classified as pending guidance, but it is not automatically persisted.',
      'TaskMemoryCoverageEvaluation is wired to current lifecycle boundaries; future task lifecycle boundaries must opt into the same evaluator instead of adding direct state changes.',
    ],
    nextImplementation: [
      'Add a confirmed writer for persisted AgentToolRegistry recoveryGuidance through retained TasksPage/RightPanel flows.',
      'Keep new lifecycle boundaries routed through TaskMemoryCoverageEvaluation before adding direct state changes.',
      'Keep automatic context clearing as runtime readiness data until a retained UI or scheduler explicitly consumes it.',
    ],
  },
  {
    phase: 'decision_and_confirmation',
    status: 'partial',
    priority: 'p0',
    scope: 'product_runtime',
    coveredBy: [
      'Decision model supports scope, kind, context, options, recommendation, sourceType, and sourceId.',
      'Checkpointed risky tools create Decisions and resume only after approval.',
      'Decision actions pass through runtime-action-evaluator at the service boundary and in the Decisions page.',
      'decision-effect-evaluator summarizes pending, approved, deferred, and cancelled decisions for verification consumers.',
      'Approved checkpoint Decisions recheck target-task readiness with subtask_start before resuming tool, browser, or patch-promotion execution.',
      'Decisions page approve/defer/cancel actions use shared decision action guards backed by pre_step and post_step verification.',
      'DecisionJudgmentProjection centralizes decision category, urgency, task signal, options, recommendation, impact, reversibility, and sorting semantics for the Decisions page.',
      'Decisions page action results now summarize approved, deferred, and cancelled effects using decision-effect-evaluator.',
    ],
    outOfAgentPrinciplesScope: [
      'The Decisions page must behave like a judgment center, not only a list of task statuses.',
      'Approvals must explain effect after approval, rejection, defer, or cancel.',
    ],
    gaps: [
      'Decision judgment-center UI is incomplete.',
      'Decision effects are summarized after actions, but richer effect grouping across multiple related decisions is still future work.',
    ],
    nextImplementation: [
      'Group decision action effects by task/source when multiple related decisions are handled together.',
    ],
  },
  {
    phase: 'verification_and_closeout',
    status: 'partial',
    priority: 'p0',
    scope: 'agent_runtime',
    coveredBy: [
      'runtime-verification covers run, run_step, pre_step, post_step, subtask_start, task_closeout, project, and context_clear.',
      'Task completion modal, project completion checks, RightPanel phase closeout, and Run verification persistence consume runtime-verification.',
      'Project detail surfaces display project verification next to the child task structure.',
      'Project verification includes artifact/source evidence counts and Decision effect summaries.',
      'RightPanel phase closeout also checks TaskMemoryCoverageEvaluation after writing the phase record and before refreshing or handing off.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must verify not only Agent completion, but user-triggered state changes, project progress, and UI context transitions.',
    ],
    gaps: [
      'Project verification is wired into completion and structure views; future project-level state transitions must consume the same verification before adding new completion paths.',
      'Pre-step and post-step verification cover current Run, generated artifact, panel durable action, and tool durable-write paths; future execution surfaces must opt in rather than adding direct writes.',
    ],
    nextImplementation: [
      'Keep verification gates as a required boundary for any future execution service or panel durable action.',
    ],
  },
  {
    phase: 'pause_resume_and_handoff',
    status: 'partial',
    priority: 'p0',
    scope: 'product_runtime',
    coveredBy: [
      'Context clearing requires specific handoff signals.',
      'Run resume passes through runtime action evaluation and pending TaskMemoryGuidanceState checks before checkpoint execution.',
      'Approved Decision checkpoint resume passes through pending TaskMemoryGuidanceState checks before checkpoint execution.',
      'Task-bound Decision actions preflight task memory annotation before changing Decision status, so decision effects do not bypass task memory writes.',
      'Phase closeout writes Task Records and can hand off to existing child tasks.',
      'Phase closeout requires TaskMemoryCoverageEvaluation and pending TaskMemoryGuidanceState checks to pass before chat refresh or next-task handoff.',
      'Phase closeout keeps unresolved blocker, dependency, user-confirmation, and follow-up-confirmation outcomes from clearing task chat even after a phase record is written.',
      'Task closeout evaluation can hand off to existing successors when no child task is available, and new follow-up proposals require evidence plus confirmation instead of automatic creation.',
      'runtime-handoff now provides a shared RuntimeHandoff and RuntimeResumePlan evaluator for context refresh, task switching, phase closeout, and run resume planning.',
      'RuntimeHandoff context refresh, leave-context, and global-conversation paths consume AutoContextClearReadiness before clearing task chat.',
      'Task switch handoff consumes TaskMemoryCoverageEvaluation before leaving the previous task context.',
      'RuntimeResumePlan can include a subtask_start gate when phase closeout hands off to a child or successor task and target context is provided.',
      'RuntimeHandoffPreview now turns handoff plus archive snapshot data into reusable manual-refresh preview text instead of leaving the archive preview assembled only in RightPanel.',
      'RightPanel context refresh, manual refresh, global conversation reset, leave-task-context, task switch confirmation, and phase-closeout handoff now consume RuntimeHandoff results.',
      'RunService paused-run continuation now consumes RuntimeHandoff and RuntimeResumePlan before checkpoint resume execution.',
      'SubagentHandoffEvaluation now models subagent scope, inherited-principles, confirmation-boundary, and handoff-completeness checks before future subagent results can be integrated.',
      'runtime-event-record now projects persisted timeline events, Runs, Run steps, Task Records, Decisions without timeline coverage, and runtime resume projections into a shared RuntimeEventRecord audit stream.',
      'Activity/audit projection is modeled by RuntimeEventRecord; Tasks activity consumes it and retained Run-side views should follow it.',
      'RuntimeEventRecord now has replay-oriented grouping for handoff, project structure changes, execution recovery, Decisions, durable records, source context, and task state changes.',
      'RunDetailRecord now carries optional runtimeEvents and runtimeReplayGroups from RunService.getDetail without requiring UI layout changes.',
      'Tasks task dynamics now consumes replay grouping as a compact key-context layer before the flat event timeline.',
      'RightPanel context refresh, context switch confirmation/dismissal, phase closeout, and task file proposal writes now persist panel.* timeline events for RuntimeEventRecord audit projection.',
      'RuntimeEventRecord preserves relatedTaskId for task-to-task completion handoff and accepted context-switch events, and replay groups retain relatedTaskIds for task A to task B recovery.',
      'RuntimeHandoff is shared across RightPanel context clear, manual refresh preview, phase closeout, task switch flows, RunService checkpoint resume, and RuntimeEventRecord projection.',
      'Successor-task handoff outside parent-child hierarchy has closeout and replay metadata.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must distinguish pause, refresh, leave context, switch task, resume paused run, and start new global conversation.',
    ],
    gaps: [
      'Subagent handoff has a shared evaluator, but it is not wired to a product delegation entry point because that surface is not active yet.',
      'Follow-up proposal gating exists in the shared closeout evaluator and RightPanel task-context capture consumes it; other retained creation entry points still need the same boundary when they create follow-up tasks from task context.',
      'Replay grouping is consumed by Tasks task dynamics, but Run detail and broader retained activity surfaces do not yet render the grouped replay layer.',
    ],
    nextImplementation: [
      'Wire retained follow-up task proposal entry points into the shared closeout evaluator.',
    ],
  },
  {
    phase: 'project_and_hierarchy_runtime',
    status: 'partial',
    priority: 'p1',
    scope: 'data_runtime',
    coveredBy: [
      'Task data model now has taskType, taskFacets, parentTaskId, and childTaskIds.',
      'Task hierarchy helpers keep parent/child views and priority recommendations from duplicating children into top-level lists.',
      'TaskService.create and TaskService.update keep child parentTaskId and parent childTaskIds in sync at the service boundary, including parent-side child list updates.',
      'TaskService blocks child creation, child moves, and parent child-list writes unless the parent is an open top-level project task.',
      'TaskHierarchyConsistencyEvaluation can diagnose historical hierarchy mismatches before a repair flow mutates old records, and TaskService exposes the diagnostics through IPC.',
      'TaskHierarchyRepairPlan can turn diagnostics into non-mutating safe repair actions or manual-review items before any confirmed maintenance writer exists.',
      'TaskService.applySafeHierarchyRepairs applies only revalidated safe TaskHierarchyRepairPlan actions through the service/IPC boundary and leaves manual-review items untouched.',
      'TaskHierarchyManualReviewPolicy explains conflicting parentage, missing records, self references, and duplicate references before any human-confirmed resolution UI exists.',
      'TaskService.applyHierarchyManualResolution accepts explicit manual hierarchy resolutions for unique parentage, missing references, self references, and duplicate child references without adding UI.',
      'TaskService safe hierarchy repairs and manual hierarchy resolutions pass task structure writes through task_mutation guards before repository updates.',
      'Renderer task hierarchy projection now treats persisted taskType, taskFacets, parentTaskId, and childTaskIds as authoritative and uses local task attributes only for genuinely missing legacy fields.',
      'Legacy title-pattern phase follow-up inference no longer runs when a task explicitly has no parent, and TasksPage no longer mutates local hierarchy attributes during list loading.',
      'Brief focus projection, RightPanel closeout checks, and task completion modal checks now use the same persisted-field hierarchy authority instead of reading local task attributes directly.',
      'runtime-subtask-evaluator blocks duplicate, generic, parent-overlapping, or underspecified project child drafts before creation.',
      'Project decomposition generation and confirmation both consult runtime-subtask-evaluator, so existing children block another decomposition round before a new draft appears.',
      'Project decomposition generation now detects existing children from the full task list, including children linked only by parentTaskId.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must keep directory views, priority lists, detail pages, and project progress consistent.',
    ],
    gaps: [
      'Some task structure still relies on renderer-local attributes.',
      'Project progress and child ordering are closer to data-authoritative, but legacy local attributes still need migration cleanup and manual-review hierarchy resolution still needs a user-facing confirmation surface.',
      'Subtask draft evaluation is enforced for project decomposition generation and confirmation, but not yet every future child-task creation path.',
    ],
    nextImplementation: [
      'Finish Package F data model migration cleanup.',
      'Add a user-facing confirmation surface for TaskHierarchyManualReviewPolicy items when UI work is allowed.',
    ],
  },
  {
    phase: 'activity_timeline_and_audit',
    status: 'partial',
    priority: 'p1',
    scope: 'data_runtime',
    coveredBy: [
      'Activity records, run steps, completion checks, Decisions, and Task Records all exist as durable audit surfaces.',
      'runtime-event-record projects timeline events, Runs, Run steps, Task Records, Decisions without timeline coverage, and runtime resume projections into one audit stream.',
      'RuntimeEventRecord is the shared task dynamics/audit projection; Tasks task dynamics consumes it, and Run-side surfaces should follow it.',
      'groupRuntimeEventsForReplay creates shared replay-oriented stories, and Tasks task dynamics renders those groups before the flat timeline.',
      'Task A to task B handoff replay is covered by relatedTaskId/relatedTaskIds projection tests.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must decide what belongs in timeline vs run step vs Task Record, and how users audit changes later.',
    ],
    gaps: [
      'RuntimeEventRecord covers timeline, run, run step, task record, decision, resume projection, RightPanel events, and core TasksPage file/source/artifact/project/handoff events; Tasks task dynamics consumes it and Run detail now exposes Run-side projection data.',
      'Replay grouping is rendered in Tasks task dynamics, while Run detail and broader retained activity surfaces still need grouped replay presentation.',
    ],
    nextImplementation: [
      'Reuse the grouped replay layer in Run detail when Run-side runtime views are resumed.',
    ],
  },
  {
    phase: 'capabilities_and_external_access',
    status: 'partial',
    priority: 'p1',
    scope: 'product_runtime',
    coveredBy: [
      'External access, MCP, skills, model, settings, and work habits are separate navigation capabilities.',
      'Risky local command/write tools use confirmation checkpoints.',
      'RuntimeCapabilitySnapshot captures model availability, workspace verification checks, feature flags, and tool scaffold exposure for runtime consumers.',
    ],
    outOfAgentPrinciplesScope: [
      'Capability availability, connector status, model settings, and external access policy are product runtime concerns.',
    ],
    gaps: [
      'Capability state can now be represented in runtime context assembly and pre_step verification, but retained execution entry points still need to pass snapshots consistently.',
    ],
    nextImplementation: [
      'Pass RuntimeCapabilitySnapshot from retained execution entry points where model, external access, workspace checks, or tool exposure changes execution permission.',
    ],
  },
];

export function summarizeRuntimeLifecycleCoverage(): Record<RuntimeLifecycleCoverageStatus, number> {
  return RUNTIME_LIFECYCLE_COVERAGE.reduce<Record<RuntimeLifecycleCoverageStatus, number>>((summary, item) => {
    summary[item.status] += 1;
    return summary;
  }, {
    implemented: 0,
    partial: 0,
    missing: 0,
  });
}
