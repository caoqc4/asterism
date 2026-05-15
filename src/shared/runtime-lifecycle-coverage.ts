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
      'TasksPage explicit task creation and RightPanel conversation capture pass task candidates through the shared capture evaluator.',
      'TaskService.create enforces the same task-capture evaluator at the service boundary before repository persistence.',
      'TaskService.update reuses the same evaluator when title or parent scope changes, preventing duplicate siblings during project moves.',
    ],
    outOfAgentPrinciplesScope: [
      'Product-level intake must decide whether the user is creating work, browsing existing work, asking for status, or discussing direction.',
      'The UI must distinguish capture, draft, confirm, and enter-task states.',
    ],
    gaps: [
      'RightPanel capture uses shared intake routing and TasksPage explicit creation uses the shared task_capture guard, but decomposition and other creation entry points are not fully covered by intake yet.',
      'Service-level guards now block duplicate open-task captures and generic title-only candidates; broader semantic duplicate detection remains limited to normalized titles.',
    ],
    nextImplementation: [
      'Route project decomposition and additional creation entry points through shared intake checks.',
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
      'SourceFreshnessEvaluation classifies source materials as include, caution, or exclude, and RuntimeContextManifest can attach inclusion decisions and reasons to source context items.',
      'SelectedFileRelevanceEvaluation classifies selected files as include, caution, or exclude, and RuntimeContextManifest can attach selected-file relevance reasons.',
      'RunOrchestrator blocks model execution when runtime context assembly is missing required inputs.',
      'CodeAgentRunService blocks model-producer execution when required task recovery context is missing and passes selected source-context metadata into RuntimeContextManifest before execution.',
      'Code Agent has provider-visible context manifest logic.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must explain why context was included or excluded, not only what Agent should read.',
      'Runtime must handle UI visibility, model visibility, and durable context separately.',
    ],
    gaps: [
      'RuntimeContextAssemblyPolicy blocks ordinary Run and Code Agent model-producer execution, but not every execution entry point blocks on it yet.',
      'Source freshness and selected-file relevance are now represented as first-class inclusion reasons, ordinary Run working context and Code Agent model-producer runs pass source metadata, but not every retained execution entry point passes full context metadata yet.',
    ],
    nextImplementation: [
      'Pass full source and selected-file metadata into RuntimeContextManifest from retained execution entry points.',
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
    ],
    outOfAgentPrinciplesScope: [
      'Brief and priority queue design are product attention mechanics, not Agent execution rules.',
      'Sorting must reconcile actionable priority, blockers, waiting state, dates, and recent intent.',
    ],
    gaps: [
      'Priority ranking is not yet represented as a runtime lifecycle phase with traceable reasons.',
      'Brief differences from Tasks are documented but not enforced by coverage tests.',
    ],
    nextImplementation: [
      'Add RuntimeAttentionProjection tests for Brief vs Tasks result consistency and display limits.',
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
      'Runs and run steps store plan, model, tool, checkpoint, failure, and final events.',
      'AgentToolRegistry gates risky commands and writes.',
      'runtime-verification has first-pass pre_step and post_step modes for action permission, pending decisions, required context, and durable-change recovery notes.',
      'Run verification persistence now writes step verifications through post_step verification.',
      'runtime-step-effect-evaluator infers durable step changes and recovery-note presence before post_step verification.',
      'RightPanel phase closeout now passes through pre_step before saving and post_step before quality-check handoff.',
      'RightPanel task file proposal confirmation now passes through pre_step and post_step verification.',
      'Tasks and Brief task state transitions now use shared renderer runtime guards backed by pre_step verification.',
      'Tasks special mutation paths for Task.md sync, risk updates, project moves, and project parent updates now use shared mutation guards.',
      'Tasks file actions for create, rename, move, delete, source key toggles, source archive, and artifact creation now use durable panel action guards.',
      'Tasks file content saves for Task.md/Task Records, task files, sources, and artifacts now use durable panel action guards plus post-step completion checks.',
      'Tasks project decomposition confirmation now guards child task creation, child planning transitions, dependency creation, parent updates, task records, and completion criteria writes.',
      'AgentToolRegistry task/source/artifact durable tools now use pre_step and post_step runtime verification.',
      'RightPanel session refresh, phase closeout, and Task.md reference writes now guard their internal source/task-record persistence.',
      'RightPanel task capture, captured-task confirmation, and captured-task abandonment now use runtime verification guards.',
      'RightPanel task-context follow-up task capture now passes explicit follow-up proposals through task closeout evaluation before creating a new task.',
      'TasksPage file/source/artifact actions and project decomposition confirmation now persist panel.* timeline events for RuntimeEventRecord audit projection.',
      'TasksPage project membership changes and completion handoffs now persist panel.* timeline events for task-to-task replay.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must decide whether execution is panel-lightweight, Run-backed, Code Agent, operator-started browser QA, or future scheduled/event execution.',
    ],
    gaps: [
      'pre_step and post_step verification exist as shared evaluators; run_start, persisted step checks, phase closeout, task capture, task file proposal confirmation, primary task state transitions, Tasks file actions/content saves, project decomposition writes, and AgentToolRegistry durable tools are wired, but not every retained execution surface yet.',
      'Core task update and transition paths already write repository timeline events, Tasks activity presents RuntimeEventRecord projections, and Run detail exposes RuntimeEventRecord replay data.',
      'Legacy WorkbenchPage has been removed from the active renderer entry set; its retained responsibilities are covered by TasksPage, RightPanel, Runs, Activity, and Decisions surfaces.',
    ],
    nextImplementation: [
      'Keep RuntimeEventRecord replay grouping data-only until UI work is explicitly requested.',
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
      'TaskRecordWorthinessEvaluation centralizes when handoff, closeout, correction, option rationale, failure review, context archive, external signal, or durable state changes deserve Task Records.',
      'RightPanel context-refresh and phase-closeout Task Record writes now pass through TaskRecordWorthinessEvaluation before creating files.',
      'TaskMdUpdateNeedEvaluation centralizes when Task.md should be updated for recovery fields and important file references.',
      'RightPanel Task.md important-file reference writes now pass through TaskMdUpdateNeedEvaluation before creating or updating Task.md.',
      'TasksPage direct Task.md saves now pass through TaskMdUpdateNeedEvaluation before persisting the primary recovery file.',
      'TasksPage manual Task Record creation now passes through TaskRecordWorthinessEvaluation before creating Task Records files.',
      'AgentToolRegistry durable tool results now expose recoveryGuidance from TaskMdUpdateNeedEvaluation and TaskRecordWorthinessEvaluation without silently mutating Task.md.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime owns durable data model boundaries and UI labels for files, records, sources, and generated output.',
    ],
    gaps: [
      'TaskMdUpdateNeedEvaluation covers RightPanel references, TasksPage Task.md saves, and AgentToolRegistry durable tool guidance; remaining retained durable state changes should consume it through TasksPage, RightPanel, Runs, or Decisions.',
      'Output-reference propagation to Task.md or Task Records is now recommended by tool guidance but not automatically persisted.',
    ],
    nextImplementation: [
      'Add a confirmed writer for AgentToolRegistry recoveryGuidance through retained TasksPage/RightPanel flows.',
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
      'Decision actions pass through runtime-action-evaluator.',
      'decision-effect-evaluator summarizes pending, approved, deferred, and cancelled decisions for verification consumers.',
      'Decisions page approve/defer/cancel actions use shared decision action guards backed by pre_step and post_step verification.',
    ],
    outOfAgentPrinciplesScope: [
      'The Decisions page must behave like a judgment center, not only a list of task statuses.',
      'Approvals must explain effect after approval, rejection, defer, or cancel.',
    ],
    gaps: [
      'Decision judgment-center UI is incomplete.',
      'Decision effect summaries and action guards exist, but the Decisions page is not yet a full effect-oriented decision surface.',
    ],
    nextImplementation: [
      'Implement Package E Decisions judgment center.',
      'Show decision effect after approve/defer/cancel in the Decisions page.',
    ],
  },
  {
    phase: 'verification_and_closeout',
    status: 'partial',
    priority: 'p0',
    scope: 'agent_runtime',
    coveredBy: [
      'runtime-verification covers run, run_step, pre_step, post_step, task_closeout, project, and context_clear.',
      'Task completion modal, project completion checks, RightPanel phase closeout, and Run verification persistence consume runtime-verification.',
      'Project detail surfaces display project verification next to the child task structure.',
      'Project verification includes artifact/source evidence counts and Decision effect summaries.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must verify not only Agent completion, but user-triggered state changes, project progress, and UI context transitions.',
    ],
    gaps: [
      'Project verification is wired into the completion modal and project detail structure surface, but not every state mutation uses verification.',
      'Pre-step and post-step verification are not yet consumed by every Run and panel action path.',
    ],
    nextImplementation: [
      'Wire pre_step and post_step checks into execution services and panel durable actions.',
    ],
  },
  {
    phase: 'pause_resume_and_handoff',
    status: 'partial',
    priority: 'p0',
    scope: 'product_runtime',
    coveredBy: [
      'Context clearing requires specific handoff signals.',
      'Run resume passes through runtime action evaluation.',
      'Phase closeout writes Task Records and can hand off to existing child tasks.',
      'Task closeout evaluation can hand off to existing successors when no child task is available, and new follow-up proposals require evidence plus confirmation instead of automatic creation.',
      'runtime-handoff now provides a shared RuntimeHandoff and RuntimeResumePlan evaluator for context refresh, task switching, phase closeout, and run resume planning.',
      'RightPanel context refresh, manual refresh, global conversation reset, leave-task-context, task switch confirmation, and phase-closeout handoff now consume RuntimeHandoff results.',
      'RunService paused-run continuation now consumes RuntimeHandoff and RuntimeResumePlan before checkpoint resume execution.',
      'runtime-event-record now projects persisted timeline events, Runs, Run steps, Task Records, Decisions without timeline coverage, and runtime resume projections into a shared RuntimeEventRecord audit stream.',
      'Activity/audit projection is modeled by RuntimeEventRecord; Tasks activity consumes it and retained Run-side views should follow it.',
      'RuntimeEventRecord now has replay-oriented grouping for handoff, project structure changes, execution recovery, Decisions, durable records, source context, and task state changes.',
      'RunDetailRecord now carries optional runtimeEvents and runtimeReplayGroups from RunService.getDetail without requiring UI layout changes.',
      'RightPanel context refresh, context switch confirmation/dismissal, phase closeout, and task file proposal writes now persist panel.* timeline events for RuntimeEventRecord audit projection.',
      'RuntimeEventRecord preserves relatedTaskId for task-to-task completion handoff and accepted context-switch events, and replay groups retain relatedTaskIds for task A to task B recovery.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must distinguish pause, refresh, leave context, switch task, resume paused run, and start new global conversation.',
    ],
    gaps: [
      'RuntimeHandoff is now shared across RightPanel context clear, phase closeout, task switch flows, RunService checkpoint resume, and RuntimeEventRecord projection.',
      'Successor-task handoff outside parent-child hierarchy now has closeout and replay metadata.',
      'Follow-up proposal gating exists in the shared closeout evaluator and RightPanel task-context capture consumes it; other retained creation entry points still need the same boundary when they create follow-up tasks from task context.',
      'Replay grouping exists in shared runtime data but is not yet consumed by retained activity surfaces.',
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
      'runtime-subtask-evaluator blocks duplicate, generic, parent-overlapping, or underspecified project child drafts before creation.',
      'Project decomposition generation and confirmation both consult runtime-subtask-evaluator, so existing children block another decomposition round before a new draft appears.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must keep directory views, priority lists, detail pages, and project progress consistent.',
    ],
    gaps: [
      'Some task structure still relies on renderer-local attributes.',
      'Project progress and child ordering are not fully data-authoritative.',
      'Subtask draft evaluation is enforced for project decomposition generation and confirmation, but not yet every future child-task creation path.',
    ],
    nextImplementation: [
      'Finish Package F data model migration cleanup.',
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
      'RuntimeEventRecord is the shared activity/audit projection; Tasks activity consumes it, and Run-side surfaces should follow it.',
      'groupRuntimeEventsForReplay creates shared replay-oriented stories without changing UI layout or interaction.',
      'Task A to task B handoff replay is covered by relatedTaskId/relatedTaskIds projection tests.',
    ],
    outOfAgentPrinciplesScope: [
      'Runtime must decide what belongs in timeline vs run step vs Task Record, and how users audit changes later.',
    ],
    gaps: [
      'RuntimeEventRecord covers timeline, run, run step, task record, decision, resume projection, RightPanel events, and core TasksPage file/source/artifact/project/handoff events; Tasks activity consumes it and Run detail now exposes Run-side projection data.',
      'Replay grouping exists in shared runtime data and Run detail data, but is not yet rendered by retained activity surfaces.',
    ],
    nextImplementation: [
      'Keep replay grouping data-only until UI work is explicitly requested.',
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
