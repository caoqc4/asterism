export type AgentPrinciplesComplianceStatus =
  | 'implemented'
  | 'partial'
  | 'missing';

export type AgentPrinciplesCompliancePriority =
  | 'p0'
  | 'p1'
  | 'p2';

export type AgentPrinciplesComplianceItem = {
  section: string;
  status: AgentPrinciplesComplianceStatus;
  priority: AgentPrinciplesCompliancePriority;
  implementedBy: string[];
  gaps: string[];
  nextVerification: string[];
};

export const AGENT_PRINCIPLES_COMPLIANCE: AgentPrinciplesComplianceItem[] = [
  {
    section: 'First Principles And Simplicity',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'Task creation and update paths use runtime-task-capture-evaluator to block duplicates, generic title-only candidates, generic phase templates, and child titles that merely repeat the parent.',
      'Project decomposition uses runtime-subtask-evaluator before generation and confirmed child creation to avoid duplicate or underspecified subtasks.',
      'Task hierarchy projection treats persisted taskType, taskFacets, parentTaskId, and childTaskIds as authoritative over stale renderer-local attributes.',
      'Legacy title-pattern phase follow-up inference is limited to records without a parent field, and Tasks no longer mutates local hierarchy attributes during list loading.',
      'TaskHierarchyConsistencyEvaluation, TaskHierarchyRepairPlan, and manual resolution commands separate diagnostics, safe repair, and explicit human confirmation instead of silently guessing structure.',
      'No default Artifacts/ folder is required; output folders are created only when useful for the task.',
      'RuntimeTaskCaptureEvaluation blocks generic phase-template task titles even when a faulty flow tries to create them as top-level tasks.',
    ],
    gaps: [
      'Some retained runtime and renderer branches still need review for title-pattern inference, implicit task creation, or local fallback state that can override structured records.',
      'Not every execution path has an explicit simplicity check before creating new files, records, decisions, prompts, or follow-up tasks.',
    ],
    nextVerification: [
      'Add regression tests for no implicit hierarchy mutation, no generic follow-up task creation, and no local fallback override when structured record fields are present.',
      'Review remaining creation and persistence paths for unnecessary categories, files, records, or confirmation steps.',
    ],
  },
  {
    section: 'Required Read Order',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'TASKPLANE_AGENT_PRINCIPLES is injected into chat, decomposition, and working context flows.',
      'buildAgentWorkingContext and buildRuntimeContextManifest project task state, sources with freshness metadata, artifacts, files, timeline, and work habits.',
      'RuntimeCapabilitySnapshot can be included in RuntimeContextManifest so model, workspace, flags, and tool scaffold state become explicit context assembly inputs.',
      'RunService and CodeAgentRunService pass RuntimeCapabilitySnapshot into run_start pre-step verification for model/workspace capability checks.',
      'RunService, CodeAgentRunService, and OperatorStartedRunService pass run_start through TaskMemoryCoverageEvaluation before execution.',
      'SourceFreshnessEvaluation classifies source materials as include, caution, or exclude, and RuntimeContextManifest can carry source inclusion decisions and reasons.',
      'SelectedFileRelevanceEvaluation classifies selected files as include, caution, or exclude, and RuntimeContextManifest can carry selected-file relevance reasons.',
      'buildRuntimeContextAssemblyPolicy evaluates product principles, task state, Task.md, Task Records, selected file, structured signals, and work habits against the required read order.',
      'RuntimeContextAssemblyGate requires read-order assembly for provider-visible task execution and explicitly exempts hidden non-model entries.',
      'RunOrchestrator blocks ordinary model execution when required runtime context inputs are missing.',
      'CodeAgentRunService blocks model-producer execution when required task recovery context is missing and passes selected source-context metadata into RuntimeContextManifest.',
      'OperatorStartedRunService keeps browser evidence and local QA outside provider-visible context assembly only while providerCall=no and modelExposure=hidden.',
    ],
    gaps: [
      'The shared read-order evaluator is enforced for ordinary model Runs and Code Agent model-producer runs; future provider-visible execution boundaries must use the same gate.',
      'Source freshness and selected-file relevance reasons are represented in the manifest, ordinary Run working context and Code Agent model-producer runs pass source metadata, but future provider-visible entry points still need to pass full source/file metadata consistently.',
    ],
    nextVerification: [
      'Keep tests that task-bound execution manifests include product principles, task state, Task.md when present, and relevant Task Records.',
      'Require any future provider-visible execution boundary to use RuntimeContextAssemblyGate and pass full source/file metadata.',
    ],
  },
  {
    section: 'Information Routing Protocol',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'runtime-surface-routing classifies Task.md, Task Records, source materials, AI output, artifacts, decisions, work habits, run steps, and discussion-only candidates.',
      'Artifact classification requires an explicit artifact surface or artifact kind; ordinary task files are not promoted to artifacts by an Artifacts/ path alone.',
      'Decision, source context, artifact, task file, and work habit creation paths consume shared routing normalization.',
      'Tasks source-context projections consume shared source-context routing instead of maintaining renderer-local Task Record keywords.',
      'TaskRecordWorthinessEvaluation centralizes Task Record-worthy recovery contexts such as handoff, closeout, user correction, option rationale, failure review, context archive, external signal, and durable state change.',
      'RightPanel context-refresh and phase-closeout Task Record writes consume TaskRecordWorthinessEvaluation before persistence.',
      'TaskMdUpdateNeedEvaluation centralizes Task.md update needs for recovery fields and important file references.',
      'RightPanel Task.md important-file references consume TaskMdUpdateNeedEvaluation before persistence.',
      'TasksPage direct Task.md saves consume TaskMdUpdateNeedEvaluation before persistence.',
      'TasksPage manual Task Record creation consumes TaskRecordWorthinessEvaluation before persistence.',
      'RuntimeRecoveryGuidance centralizes structured Task.md and Task Record recovery recommendations while preserving legacy guidance messages.',
      'AgentToolRegistry durable tool results expose recoveryGuidanceItems and legacy recoveryGuidance from RuntimeRecoveryGuidance without silently mutating Task.md.',
      'AgentToolRegistry persists recoveryGuidanceItems as a separate Run Step so task-memory recommendations remain auditable without silently mutating Task.md or Task Records.',
      'TaskMemoryGuidanceState reads structured guidance targets from Run Step input before falling back to guidance text parsing.',
      'TaskMemoryWriteProposal projects pending guidance into minimal confirmed-write proposals for Task.md or Task Records without automatically changing task memory.',
      'RunDetailRecord exposes taskMemoryWriteProposals derived from pending TaskMemoryGuidanceState, so runtime consumers can route the missing memory write without recomputing it.',
      'TaskMemoryGuidanceState distinguishes unresolved task-memory guidance from completed Task.md or Task Record writes.',
      'TaskMemoryGuidanceState tracks Task.md and Task Record guidance per target so one newer recommendation cannot mask another pending memory surface.',
      'TaskRecordWorthiness tests cover should-create and should-not-create cases for handoff, closeout, correction, option rationale, failures, external signals, duplicates, generic notes, and unbound notes.',
    ],
    gaps: [
      'TaskMdUpdateNeedEvaluation exists and covers RightPanel important-file references, TasksPage direct Task.md saves, and AgentToolRegistry recovery guidance through RuntimeRecoveryGuidance, but not every durable write asks whether Task.md also needs an update.',
      'TaskRecordWorthinessEvaluation is consumed by RightPanel context-refresh/phase-closeout writes, TasksPage manual Task Record creation, and AgentToolRegistry recovery guidance, but remaining write paths still need to consume it consistently.',
      'TaskMemoryWriteProposal is data-level only; retained UI surfaces still need to route proposal confirmation into existing Task.md or Task Record write paths.',
    ],
    nextVerification: [
      'Keep information-routing tests in place for task mutation, Task.md update recommendation, and Task Record worthiness when adding new durable write surfaces.',
    ],
  },
  {
    section: 'Task Creation Protocol',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'Global panel task capture routes through task_capture action evaluation.',
      'TasksPage explicit task creation now passes through the shared task_capture pre-step guard before persistence.',
      'runtime-intake-evaluator classifies user input before task capture as task, Task Record, task file, Decision, Work Habit, or discussion.',
      'runtime-task-capture-evaluator blocks duplicate open-task captures and generic title-only candidates before persistence.',
      'runtime-task-capture-evaluator blocks generic phase-template task titles, generic phase-template child titles, and child titles that only repeat the parent.',
      'TasksPage explicit task creation and RightPanel conversation capture consume the shared task-capture evaluator.',
      'TasksPage explicit task creation forwards the same task summary used by the capture evaluator to the service boundary.',
      'TaskService.create enforces the same duplicate/generic task-capture evaluator before repository persistence.',
      'TaskService.update reuses the same evaluator for title changes and parent moves, preventing duplicate sibling tasks.',
      'TaskService blocks child creation and child moves unless the parent is an open top-level project task.',
      'Project decomposition creates draft subtasks before real child task creation.',
    ],
    gaps: [
      'RightPanel capture uses the shared intake evaluator and TasksPage explicit creation uses the shared task_capture guard; both now consume duplicate/generic candidate checks, but some retained creation entry points are not routed through intake yet.',
      'Subtask creation has service-level generic child and parent-ownership guards, but future child-task creation paths must keep using shared confirmation boundaries.',
    ],
    nextVerification: [
      'Route remaining task creation entry points through RuntimeIntakeEvaluation or a stricter child-task evaluator.',
    ],
  },
  {
    section: 'Project And Subtask Protocol',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'Project drafts include title, summary, acceptance criteria, dependency, and rationale.',
      'Phase closeout now prefers handoff to existing child tasks instead of generating generic follow-up tasks.',
      'Task closeout evaluation can hand off to an existing successor when no child is available, and new follow-up proposals require evidence and confirmation instead of being created during closeout.',
      'runtime-subtask-evaluator blocks duplicate, generic, parent-overlapping, or underspecified subtask drafts before confirmed child creation.',
      'Project decomposition generation and confirmation both consult runtime-subtask-evaluator so existing children block another decomposition round before new drafts appear.',
      'Project decomposition generation detects existing children from the full task list, including children linked only by parentTaskId.',
      'TaskService keeps child parentTaskId and parent childTaskIds synchronized when child tasks are created, moved, or changed from the parent child list.',
      'TaskService blocks child creation, child moves, and parent child-list writes unless the parent is an open top-level project task.',
      'TaskService safe hierarchy repairs and explicit manual hierarchy resolutions pass parent/child structure writes through task_mutation guards.',
      'runtime-verification has an initial project mode for child completion, blocker/waiting counts, parent criteria, pending decisions, and risk confirmation.',
      'decision-effect-evaluator summarizes pending, approved, deferred, and cancelled decisions for project verification.',
      'Task completion modal uses project verification for project parent completion checks.',
      'Project detail surfaces display project verification next to the child task structure.',
    ],
    gaps: [
      'Project-level verification includes artifact/source counts and Decision effect summaries, but other project state transitions still need to consume it.',
      'Subtask draft evaluation exists for project decomposition generation and confirmed project child creation, while service-level capture and hierarchy guards cover generic child-title and invalid parent ownership mistakes; future child-task paths still need a common confirmation boundary.',
    ],
    nextVerification: [
      'Route remaining project state transitions through project verification.',
      'Route every child-task creation path through a shared confirmation boundary backed by runtime-subtask-evaluator or runtime-task-capture-evaluator.',
    ],
  },
  {
    section: 'Subtask Start Evaluation',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'Product principles define a lightweight subtask start evaluation before entering or executing a subtask.',
      'SubtaskStartEvaluation provides a shared runtime object for target task boundary, blockers/dependencies, pending decisions, handoff review, context cleanliness, and context sufficiency.',
      'RuntimeContextAssemblyGate, RuntimeHandoff, RuntimeResumePlan, and runtime verification already provide pieces of task-bound context refresh, handoff, and pre-step checks.',
      'runtime-verification exposes subtask_start mode so subtask start readiness can be evaluated through the same verification surface as execution and closeout checks.',
      'RuntimeResumePlan can carry an optional subtask_start verdict for phase-closeout handoff to a child or successor task before entering the target task.',
      'RunService, CodeAgentRunService, and OperatorStartedRunService run subtask_start target-readiness checks before creating task-bound work.',
      'Paused run continuation validates the resume checkpoint first, then rechecks the target task with subtask_start before resuming tools.',
      'Approved checkpoint Decisions recheck target-task readiness with subtask_start before resuming tool, browser, or patch-promotion execution.',
      'TaskService blocks direct transitions into running when target readiness still shows an active blocker, dependency, or waiting state.',
      'Project decomposition and task closeout flows already prefer existing child tasks and handoffs instead of creating generic follow-up tasks.',
    ],
    gaps: [
      'SubtaskStartEvaluation now guards phase-closeout handoff, completion handoff, direct running transitions, approved checkpoint resume, paused run continuation, ordinary Run starts, Code Agent starts, and operator-started runs, but some retained task-entry paths still need to pass full parent/handoff/context signals before every subtask start.',
      'Context cleanliness and context sufficiency are represented in one runtime verdict, but run-start service checks currently use a deliberately minimal target-readiness input to avoid overblocking older tasks.',
    ],
    nextVerification: [
      'Route remaining explicit task-enter actions through SubtaskStartEvaluation before provider-visible execution.',
    ],
  },
  {
    section: 'Execution Protocol',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'Runs and run steps record plans, tool calls, tool results, checkpoints, failures, and terminal verification.',
      'Agent tool registry gates risky local command/write tools through checkpoints and Decisions.',
      'Runtime action evaluator now covers run start/resume, task mutation, task state transition, context clear, phase closeout, and file proposals.',
      'runtime-verification has first-pass pre_step and post_step modes for execution permission and durable-change recovery notes.',
      'pre_step runtime verification can consume RuntimeCapabilitySnapshot when an execution explicitly requires model execution or workspace verification.',
      'RunService, CodeAgentRunService, and OperatorStartedRunService pass run_start through pre_step verification.',
      'DecisionService approve/defer/cancel actions pass through decision_action pre-step verification at the service boundary.',
      'TaskService transition and transitionIfAllowed pass task_state_transition through pre-step verification at the service boundary.',
      'TaskService completion transitions require task_completion memory coverage before writing completed state.',
      'Task completion memory coverage ignores Run and completion-check evidence older than the latest completion-criteria update.',
      'TaskService waiting transitions require a waiting reason before writing waiting_external state.',
      'TaskService task updates, task-bound source contexts, blockers, completion criteria, dependencies, and process-template bindings pass task_mutation through pre-step verification at the service boundary.',
      'Main IPC task-file and manual-artifact write boundaries pass task_mutation through pre-step verification before repository writes.',
      'RunService, CodeAgentRunService, and OperatorStartedRunService also pass target-task readiness through subtask_start before run creation.',
      'Persisted Run step verification now uses post_step verification.',
      'RunService checks completed Run output artifact writes with post_step durable-change verification before persisting generated output.',
      'Sandbox patch review and browser evidence persisters check artifact writes with post_step durable-change verification before persisting generated evidence artifacts.',
      'runtime-step-effect-evaluator feeds post_step verification with durable-change and recovery-note signals.',
      'RightPanel phase closeout uses pre_step and post_step verification around task-record persistence.',
      'RightPanel task file proposal confirmation uses pre_step and post_step verification around durable file writes.',
      'Tasks and Brief state transitions use shared renderer runtime guards backed by pre_step verification.',
      'Tasks special mutation paths for Task.md sync, risk updates, project moves, and project parent updates use shared mutation guards.',
      'Tasks file actions use durable panel action guards backed by pre_step and post_step verification.',
      'Tasks file content saves, project decomposition writes, and completion criteria creation now use renderer runtime guards before durable persistence.',
      'TaskService completion criteria creation and updates use CompletionCriteriaEvaluation before durable persistence.',
      'TaskService dependency creation and updates use TaskDependencyBoundaryEvaluation before durable persistence.',
      'TaskService blocker creation and updates use BlockerBoundaryEvaluation before durable persistence.',
      'AgentToolRegistry task/source/artifact durable tools use pre_step and post_step runtime verification.',
      'RightPanel internal phase/context record writes use durable panel action guards.',
      'RightPanel task capture, captured-task confirmation, and captured-task abandonment use runtime verification guards.',
      'RightPanel task-context follow-up task capture now passes explicit follow-up proposals through task closeout evaluation before creating a new task.',
      'Known panel runtime timeline event types are constrained through runtime-panel-events and rejected in TaskService when unknown panel.* types are written.',
      'TasksPage file/source/artifact actions and project decomposition confirmation now persist panel.* timeline events for RuntimeEventRecord audit projection.',
      'TasksPage project membership changes and completion handoffs now persist panel.* timeline events with task-to-task context.',
      'TaskService recordTimelineEvent guards panel.* task dynamic writes with task_mutation before persistence.',
      'RuntimeEntrypointCoverage keeps retained execution, resume, context-transition, task-capture, task-transition, project-decomposition, decision-action, agent-tool, and durable-write entrypoints explicit with required runtime gates.',
      'RuntimeEntrypointCoverage defines kind-level gate baselines so future entrypoints cannot register below their class minimum without a failing regression test.',
    ],
    gaps: [
      'Current retained execution and durable-write paths are guarded; future scheduled/event execution, new provider-visible tools, or new panel write paths must explicitly pass the same verification gates.',
      'RuntimeEntrypointCoverage is a regression registry, not dynamic enforcement; future runtime entrypoints must be added to the registry and wired to at least their kind-level gate baseline.',
      'RuntimeEventRecord projection and replay grouping are consumed in Tasks task dynamics; Run-side and other future retained surfaces must reuse the same projection instead of introducing parallel activity logic.',
      'Legacy WorkbenchPage remains retired; new runtime behavior must land in TasksPage, RightPanel, Runs, Activity, or Decisions instead.',
    ],
    nextVerification: [
      'Require any future execution service or panel durable action to opt into pre_step/post_step verification before persistence.',
      'Require any future task-dynamic surface to consume RuntimeEventRecord and groupRuntimeEventsForReplay rather than raw timeline-only data.',
    ],
  },
  {
    section: 'Task.md Rules',
    status: 'partial',
    priority: 'p1',
    implementedBy: [
      'Task.md is classified as task state and Task.md edits sync back to the structured task record.',
      'RightPanel can ensure Task.md exists and reference phase records from task memory.',
      'RightPanel important-file reference writes are gated by TaskMdUpdateNeedEvaluation.',
      'TasksPage direct Task.md saves are gated by TaskMdUpdateNeedEvaluation.',
      'AgentToolRegistry durable tool results recommend Task.md recovery updates when tool writes affect next step, completion criteria, artifacts, sources, or durable state.',
    ],
    gaps: [
      'Task.md update recommendations are not generated for every durable state change.',
      'Important created/modified files are not always referenced from Task.md or a Task Record.',
    ],
    nextVerification: [
      'Keep TaskMdUpdateNeed coverage for goal/scope/progress/decision/blocker/next-step/file-reference changes as new write paths are added.',
    ],
  },
  {
    section: 'Task Records Rules',
    status: 'partial',
    priority: 'p1',
    implementedBy: [
      'Context clearing and phase closeout create Task Records only when specific handoff/recovery content exists.',
      'Runtime action evaluator distinguishes task_record surfaces from timeline and ui-only actions.',
      'TaskRecordWorthinessEvaluation provides shared reasons for when a Task Record should or should not be created.',
      'RightPanel context-refresh and phase-closeout Task Record writes are gated by TaskRecordWorthinessEvaluation.',
      'RightPanel phase closeout also checks TaskMemoryCoverageEvaluation after record persistence before refreshing context or handing off.',
      'TasksPage manual Task Record creation is gated by TaskRecordWorthinessEvaluation.',
      'Task completion modal checks TaskMemoryCoverageEvaluation before treating completion as clean; insufficient memory becomes a recorded override concern.',
      'AgentToolRegistry source-context writes pass through TaskRecordWorthinessEvaluation before recommending Task Record creation, so ordinary raw sources stay source context and only recovery-worthy external signals become Task Record guidance.',
      'TaskRecordWorthiness tests cover positive and negative creation boundaries.',
    ],
    gaps: [
      'Future retained tool-driven Task Record creation entry points must keep using TaskRecordWorthinessEvaluation instead of creating records from generic summaries.',
    ],
    nextVerification: [
      'Keep Task Record worthiness tests aligned with any new retained tool-driven Task Record entry point.',
    ],
  },
  {
    section: 'Source Materials Protocol',
    status: 'partial',
    priority: 'p1',
    implementedBy: [
      'Source contexts carry kind, role, capturedAt, runId, and batch metadata.',
      'Source creation normalizes missing source roles through shared routing.',
      'SourceFreshnessEvaluation scores archived, selected, current-run, key, stable, recent, stale, and undated sources.',
      'SourceMaterialQualityEvaluation scores traceability, credibility, duplication, and sensitivity before source material is included in runtime context.',
      'RuntimeContextManifest combines source freshness and quality decisions into source-context inclusion metadata.',
    ],
    gaps: [
      'Source material quality checks are shared and represented in context manifests, but source creation flows do not yet collect explicit credibility or duplicate signals from every connector.',
      'Source inclusion metadata is data-level only; retained UI surfaces do not yet expose full source-quality explanations.',
    ],
    nextVerification: [
      'Pass explicit credibility, duplicate, and sensitivity signals from future connector ingestion paths into SourceMaterialQualityEvaluation.',
    ],
  },
  {
    section: 'Working Files And Outputs',
    status: 'partial',
    priority: 'p1',
    implementedBy: [
      'No default Artifacts/ folder is required.',
      'Ordinary chat-driven task file writes use proposal flow before writing.',
      'AI output, source material, task record, artifact, and ordinary file labels come from shared classification.',
    ],
    gaps: [
      'Important output references are not always propagated to Task.md or Task Records.',
    ],
    nextVerification: [
      'Add output-reference verification after file proposal confirmation and code-agent artifact creation.',
    ],
  },
  {
    section: 'Verification Protocol',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'runtime-verification normalizes run, run_step, pre_step, post_step, subtask_start, task_closeout, project, and context_clear checks.',
      'Run verification persistence, completion modal, project completion checks, phase closeout, context clearing, generated artifact writes, panel durable actions, and tool durable writes consume runtime verification.',
    ],
    gaps: [
      'Project-level verification is wired into completion and structure views; future project-level state transitions must consume the same verification before adding new completion paths.',
      'Pre-step and post-step verification cover current retained execution paths; future execution surfaces must opt in rather than adding direct writes.',
    ],
    nextVerification: [
      'Keep pre_step and post_step runtime verification as the required boundary for future execution services.',
    ],
  },
  {
    section: 'Task-Level Closeout And Next-Task Evaluation',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'task-closeout evaluator classifies ready_to_complete, needs_user_confirmation, pause_with_handoff, continue_current_task, and handoff_to_existing_child.',
      'Phase closeout writes a Task Record and hands off to an existing child when available.',
      'Context switching refreshes around the target task instead of carrying stale chat by default.',
      'runtime-handoff provides a shared RuntimeHandoff and RuntimeResumePlan for context refresh, task switch, phase closeout, and run resume planning.',
      'RuntimeResumePlan can carry a subtask_start gate when phase closeout hands off to a target task and the caller provides target task context.',
      'RightPanel consumes RuntimeHandoff for refresh, manual refresh, leave-context, start-global, task-switch confirmation, and phase-closeout child handoff.',
      'RunService paused-run continuation consumes RuntimeHandoff and RuntimeResumePlan before executing checkpoint resume tools.',
      'runtime-event-record projects timeline events, Runs, Run steps, Task Records, Decisions without timeline coverage, and runtime resume projections into a shared RuntimeEventRecord audit stream for retained activity surfaces.',
      'runtime-event-record groups projected events into replay-oriented stories for handoff, project structure, execution recovery, Decisions, durable records, source context, and task state.',
      'RunService.getDetail exposes optional runtimeEvents and runtimeReplayGroups on RunDetailRecord for Run-side data consumers.',
      'Tasks task dynamics consumes RuntimeEventRecord projection and replay groups instead of raw task timeline only.',
      'RightPanel context refresh, context switch confirmation/dismissal, phase closeout, and task file proposal writes persist panel.* timeline events for RuntimeEventRecord audit projection.',
      'TasksPage file/source/artifact actions and project decomposition confirmation persist panel.* timeline events for the same RuntimeEventRecord audit projection.',
      'TasksPage project membership changes and completion handoffs persist panel.* timeline events for task-to-task replay.',
      'runtime-panel-events constrains known panel.* event types before TaskService writes them to timeline.',
      'TaskService recordTimelineEvent guards panel.* task dynamic writes with task_mutation before persistence.',
      'RuntimeEventRecord preserves task-to-task relatedTaskId for completion handoff and accepted context switch events, and replay groups retain relatedTaskIds.',
      'Successor-task handoff beyond child tasks has closeout and replay metadata, while new follow-up task creation remains confirmation-gated.',
    ],
    gaps: [
      'Run checkpoint resume has a shared resume-plan shape and RuntimeEventRecord projection data, but retained activity surfaces do not yet render replay-oriented event groupings.',
      'Follow-up proposal gating exists in the shared closeout evaluator and RightPanel task-context capture consumes it; other retained creation entry points still need the same boundary when they create follow-up tasks from task context.',
    ],
    nextVerification: [
      'Wire retained follow-up task proposal entry points into the shared closeout evaluator.',
    ],
  },
  {
    section: 'Subagent Protocol',
    status: 'partial',
    priority: 'p1',
    implementedBy: [
      'Product principles include the required subagent boundaries.',
      'SubagentHandoffEvaluation verifies inherited principles, task context, narrow scope, allowed action/file scope, confirmation boundaries, and handoff completeness before main-Agent integration.',
    ],
    gaps: [
      'SubagentHandoffEvaluation exists as a shared runtime object, but no retained product entry point exposes subagent delegation yet.',
      'Subagent handoff evaluation is not yet persisted into task memory or RuntimeEventRecord because subagent delegation is not a product action surface yet.',
    ],
    nextVerification: [
      'When subagent delegation becomes a product action, route every subagent result through SubagentHandoffEvaluation before task memory, file writes, or user-facing handoff.',
    ],
  },
  {
    section: 'Context Clearing And New Conversations',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'Context clear actions require specific handoff signals before clearing active task discussions.',
      'RightPanel distinguishes refresh, manual refresh, leave task context, and new conversation.',
      'Context clear now combines runtime action evaluation with context-clear runtime verification.',
      'TaskMemoryCoverageEvaluation enforces the Task Memory Spec outcomes for context clearing before chat context can be discarded.',
      'AutoContextClearReadiness turns memory coverage into automatic-clear readiness outcomes without using a hard message-count rule.',
      'AutoContextClearReadiness can consume TaskMemoryGuidanceState so unresolved task-memory guidance blocks clearing until matching memory writes exist.',
      'RuntimeHandoff context refresh, leave-context, and global-conversation paths consume AutoContextClearReadiness before clearing task chat.',
      'RuntimeHandoff task-switch checks TaskMemoryCoverageEvaluation before leaving the previous task context, and also blocks unresolved TaskMemoryGuidanceState through AutoContextClearReadiness.',
      'RightPanel phase closeout consumes TaskMemoryCoverageEvaluation and pending TaskMemoryGuidanceState so handoff signals and task-memory suggestions must be written before chat refresh or next-task handoff.',
      'RuntimeHandoff phase closeout blocks chat clearing when the closeout result still has blocker, dependency, user-confirmation, or follow-up-confirmation work.',
      'Run start pre-step verification consumes pending TaskMemoryGuidanceState so unresolved task-memory writes block new execution.',
      'Paused Run resume consumes pending TaskMemoryGuidanceState before executing checkpoint tools.',
      'Approved Decision checkpoint resume consumes pending TaskMemoryGuidanceState before executing checkpoint tools.',
      'Task completion modal consumes TaskMemoryCoverageEvaluation for completion evidence and memory sufficiency.',
      'TaskService direct transitions into running consume TaskMemoryCoverageEvaluation for task-start memory sufficiency.',
      'RuntimeHandoffPreview represents manual refresh/archive preview as reusable runtime data instead of RightPanel-only text assembly.',
    ],
    gaps: [
      'Manual refresh preview is shared, but RightPanel context state transitions still live in separate component state values instead of one reducer/store.',
      'New lifecycle boundaries must continue to opt into TaskMemoryCoverageEvaluation instead of bypassing the shared evaluator.',
      'Automatic context clearing readiness exists as runtime data only; no retained UI or scheduler consumes it yet.',
    ],
    nextVerification: [
      'When UI state work is allowed, move RightPanel task context transitions behind a small reducer backed by RuntimeContextSnapshot and RuntimeHandoff.',
      'Route any new task lifecycle boundary through TaskMemoryCoverageEvaluation without adding extra UI steps.',
      'When automatic clearing is productized, consume AutoContextClearReadiness rather than reintroducing fixed-round clearing.',
    ],
  },
  {
    section: 'Work Habits Boundary',
    status: 'partial',
    priority: 'p2',
    implementedBy: [
      'Work habit proposals use shared routing and confirmation/learning flows instead of writing directly to task files.',
      'RuntimeIntakeEvaluation distinguishes task-specific user corrections, which should become Task Records, from cross-task corrections, which should become Work Habit proposals.',
    ],
    gaps: [
      'RuntimeIntakeEvaluation covers the main task-specific vs cross-task correction boundary, but downstream Work Habit persistence still depends on the confirmation flow.',
    ],
    nextVerification: [
      'Keep user-correction routing tests in place when adding new intake surfaces or Work Habit entry points.',
    ],
  },
  {
    section: 'Decisions, Confirmation, And Self-Check',
    status: 'partial',
    priority: 'p0',
    implementedBy: [
      'Decision creation and drafts use shared routing normalization.',
      'Decision actions pass through runtime action evaluation.',
      'Task-bound Decision actions preflight the target task memory annotation before changing the Decision status.',
      'Checkpointed risky tools create Decisions and resume only after approval.',
      'Decision effect summaries feed project verification for pending, approved, deferred, and cancelled decisions.',
      'Decisions page approve/defer/cancel actions use shared decision action guards backed by pre_step and post_step verification.',
      'DecisionJudgmentProjection centralizes decision category, urgency, task signal, options, recommendation, impact, reversibility, and sorting semantics for the Decisions page.',
      'DecisionService.listJudgments exposes the pending judgment-center projection at the domain boundary.',
      'Decisions page action results summarize approved, deferred, and cancelled effects using decision-effect-evaluator.',
    ],
    gaps: [
      'Decisions page still needs richer effect grouping by task/source when several related decisions are handled together.',
    ],
    nextVerification: [
      'Add grouped decision-effect tests when multi-decision action handling is implemented.',
    ],
  },
];

export function summarizeAgentPrinciplesCompliance(): Record<AgentPrinciplesComplianceStatus, number> {
  return AGENT_PRINCIPLES_COMPLIANCE.reduce<Record<AgentPrinciplesComplianceStatus, number>>((summary, item) => {
    summary[item.status] += 1;
    return summary;
  }, {
    implemented: 0,
    partial: 0,
    missing: 0,
  });
}
