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
      'source_context.create',
      'decision.create',
      'task.update_next_step',
      'task.mark_blocked',
      'task.complete.propose',
    ],
    gates: [
      'runtime_action',
      'runtime_context_assembly',
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
      'Taskplane extracts Write Intent from runtime output before product writes.',
      'Shared writeback proposal builder normalizes runtime Write Intent into reusable product proposal surfaces.',
      'Shared writeback apply plans map confirmed proposals to service inputs and timeline evidence.',
      'Shared writeback dispatch applies plans through injected ports, so renderer and future service runtimes can share the same write boundary.',
      'Main-side writeback dispatch adapter wires shared dispatch to TaskService, DecisionService, and TaskFileRepository ports.',
      'Right-panel confirmations invoke main-side writeback IPC when available, with renderer-port dispatch kept as a compatibility fallback.',
      'Right-panel proposals can confirm task records, source contexts, decisions, next-step updates, blockers, completion proposals, and subtask drafts.',
      'Completed native runs summarize Taskplane web research capture and native CLI web/search events.',
      'Run verification and memory proposals remain product-controlled.',
    ],
    gaps: [
      'Right-panel Write Intent confirmation uses main-side dispatch, but non-UI runtime confirmation flows do not yet invoke it automatically.',
    ],
    nextActions: [
      'Wire confirmed non-UI CLI/API Write Intent proposals to the main-side dispatch adapter.',
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
    cliOnlyClosure: 'partial',
    futureApiClosure: 'partial',
    evidence: [
      'Project decomposition produces draft child tasks before durable subtasks.',
      'Subtask draft validation blocks underspecified or tiny proposals before confirmation.',
    ],
    gaps: [
      'Decomposition runtime selection should use the same adapter abstraction as ordinary task execution instead of API-only paths.',
    ],
    nextActions: [
      'Move decomposition drafting behind runtime-neutral DecisionBackend / selected runtime support.',
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
    ],
    gaps: [
      'Automatic writeback should keep distinguishing recovery memory from ordinary chat summaries.',
    ],
    nextActions: [
      'Route memory proposals through Write Intent worthiness checks before durable task records.',
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
      'Completion verification is separate from model output.',
    ],
    gaps: [
      'Decision, blocker, next-step, and completion Write Intent now share apply-plan and main-side dispatch code, but non-UI runtime adapters still need to invoke it after confirmation.',
    ],
    nextActions: [
      'Connect non-UI runtime confirmation handlers to the main-side writeback dispatch adapter.',
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
    ],
    gaps: [
      'Task-file and artifact Write Intent should be represented explicitly when native runtime output proposes files.',
    ],
    nextActions: [
      'Add task-file/artifact proposal intent types only when the UI proposal surface is ready.',
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
      'Native CLI web/search events and Taskplane web research bridge results are summarized in run progress or completion output.',
    ],
    gaps: [
      'Native CLI tool progress has first web/search mapping, but should deepen provider-specific schemas for more precise external-tool status.',
    ],
    nextActions: [
      'Map provider-specific CLI events into runtime-neutral capability progress states.',
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
    ],
    cliOnlyClosure: 'partial',
    futureApiClosure: 'partial',
    evidence: [
      'Work habits are selected as applicable context and stay behind confirmation flows.',
      'Scheduled briefs use product-harness fallback when provider execution is unavailable.',
    ],
    gaps: [
      'Routine/event-triggered Agent CLI execution still needs deeper runtime-neutral orchestration coverage.',
    ],
    nextActions: [
      'Audit scheduled execution separately before enabling native runtime automation.',
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
    ],
    gaps: [
      'Claude real-account execution smoke remains pending until account readiness is available.',
    ],
    nextActions: [
      'Add Claude live smoke once local account credentials are available.',
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
