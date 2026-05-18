export type CanonicalDomain =
  | 'task'
  | 'task_hierarchy'
  | 'task_file'
  | 'source_context'
  | 'artifact'
  | 'decision'
  | 'blocker'
  | 'dependency'
  | 'run_event'
  | 'task_dynamic'
  | 'work_habit'
  | 'process_template';

export type LegacyFallbackMode =
  | 'not_allowed'
  | 'read_only_when_canonical_missing'
  | 'read_only_until_migrated';

export type RepairRoute =
  | 'mechanical_auto_repair'
  | 'decision_manual_review'
  | 'read_only_diagnostic'
  | 'not_applicable';

export type LegacyFallbackRule = {
  legacyField: string;
  replacesCanonicalField: string;
  mode: LegacyFallbackMode;
  condition: string;
  repairRoute: RepairRoute;
};

export type CanonicalDataContract = {
  domain: CanonicalDomain;
  canonicalFields: string[];
  writeAuthority: string;
  readAuthority: string;
  legacyFallbacks: LegacyFallbackRule[];
  repairRoute: RepairRoute;
  notes: string[];
};

export type CanonicalDataDiagnosticIssueCode =
  | 'missing_canonical_field'
  | 'hierarchy_backlink_mismatch'
  | 'orphan_task_reference'
  | 'orphan_source_reference'
  | 'missing_task_binding';

export type CanonicalDataWriteIssueCode =
  | 'unknown_write_field'
  | 'legacy_fallback_write'
  | 'missing_required_write_field';

export type CanonicalDataDiagnosticSeverity = 'info' | 'warning' | 'error';

export type CanonicalDataDiagnosticIssue = {
  code: CanonicalDataDiagnosticIssueCode;
  domain: CanonicalDomain;
  recordId: string;
  field?: string | null;
  severity: CanonicalDataDiagnosticSeverity;
  repairRoute: RepairRoute;
  message: string;
};

export type CanonicalDataWriteIssue = {
  code: CanonicalDataWriteIssueCode;
  domain: CanonicalDomain;
  field: string;
  severity: CanonicalDataDiagnosticSeverity;
  repairRoute: RepairRoute;
  message: string;
};

export type CanonicalDataDiagnosticEvaluation = {
  issues: CanonicalDataDiagnosticIssue[];
  safeAutoRepairCount: number;
  manualReviewCount: number;
  readOnlyDiagnosticCount: number;
  summary: string;
};

export type CanonicalDataWriteValidation = {
  allowed: boolean;
  issues: CanonicalDataWriteIssue[];
  summary: string;
};

type CanonicalDataDiagnosticRecord = Record<string, unknown>;

export type CanonicalDataDiagnosticInput = {
  tasks?: CanonicalDataDiagnosticRecord[];
  taskFiles?: CanonicalDataDiagnosticRecord[];
  sourceContexts?: CanonicalDataDiagnosticRecord[];
  artifacts?: CanonicalDataDiagnosticRecord[];
  decisions?: CanonicalDataDiagnosticRecord[];
  blockers?: CanonicalDataDiagnosticRecord[];
  dependencies?: CanonicalDataDiagnosticRecord[];
  runEvents?: CanonicalDataDiagnosticRecord[];
  taskDynamics?: CanonicalDataDiagnosticRecord[];
  workHabits?: CanonicalDataDiagnosticRecord[];
  processTemplates?: CanonicalDataDiagnosticRecord[];
};

export const CANONICAL_DATA_CONTRACTS: CanonicalDataContract[] = [
  {
    domain: 'task',
    canonicalFields: [
      'id',
      'title',
      'summary',
      'state',
      'taskType',
      'taskFacets',
      'nextStep',
      'waitingReason',
      'riskLevel',
      'riskNote',
      'createdAt',
      'updatedAt',
    ],
    writeAuthority: 'TaskService + TaskRepository',
    readAuthority: 'TaskRecord / TaskDetail structured fields',
    legacyFallbacks: [],
    repairRoute: 'read_only_diagnostic',
    notes: [
      'Narrative Task.md can summarize task state, but structured task fields remain authoritative.',
      'New writes should not infer state or type from title patterns.',
    ],
  },
  {
    domain: 'task_hierarchy',
    canonicalFields: ['parentTaskId', 'childTaskIds', 'taskType', 'taskFacets'],
    writeAuthority: 'TaskService hierarchy mutations',
    readAuthority: 'task-hierarchy helpers over persisted task fields',
    legacyFallbacks: [
      {
        legacyField: 'renderer.localTaskAttributes.parentTaskId',
        replacesCanonicalField: 'parentTaskId',
        mode: 'read_only_when_canonical_missing',
        condition: 'Only for historical records where the persisted task object lacks parentTaskId entirely.',
        repairRoute: 'decision_manual_review',
      },
      {
        legacyField: 'renderer.localTaskAttributes.childTaskIds',
        replacesCanonicalField: 'childTaskIds',
        mode: 'read_only_when_canonical_missing',
        condition: 'Only for historical records where the persisted task object lacks childTaskIds entirely.',
        repairRoute: 'decision_manual_review',
      },
      {
        legacyField: 'title phase-followup pattern',
        replacesCanonicalField: 'parentTaskId',
        mode: 'read_only_when_canonical_missing',
        condition: 'Only when the task object does not own a parentTaskId field and the inferred parent is an open top-level project.',
        repairRoute: 'decision_manual_review',
      },
    ],
    repairRoute: 'decision_manual_review',
    notes: [
      'Safe missing backlinks can be mechanically repaired after revalidation.',
      'Conflicting parentage, missing records, self references, and duplicates route to Decisions manual review.',
    ],
  },
  {
    domain: 'task_file',
    canonicalFields: ['id', 'taskId', 'name', 'path', 'kind', 'content', 'createdAt', 'updatedAt'],
    writeAuthority: 'Task file repository through task-file mutation guards',
    readAuthority: 'TaskFileRecord plus task-memory path classification',
    legacyFallbacks: [],
    repairRoute: 'read_only_diagnostic',
    notes: [
      'Task.md and Task Records are reserved paths with dedicated evaluators.',
      'Ordinary task files must not be promoted to artifacts or sources by folder name alone.',
    ],
  },
  {
    domain: 'source_context',
    canonicalFields: [
      'id',
      'taskId',
      'title',
      'kind',
      'isKey',
      'uri',
      'content',
      'note',
      'status',
      'capturedAt',
      'runId',
      'batchId',
      'sourceRole',
      'credibility',
      'isDuplicate',
      'containsSensitiveData',
      'createdAt',
      'updatedAt',
      'archivedAt',
    ],
    writeAuthority: 'SourceContextRepository through source-context normalization',
    readAuthority: 'SourceContextRecord with source freshness and quality evaluators',
    legacyFallbacks: [
      {
        legacyField: 'title/note keyword classification',
        replacesCanonicalField: 'sourceRole',
        mode: 'read_only_when_canonical_missing',
        condition: 'Only when sourceRole is absent; explicit sourceRole always wins.',
        repairRoute: 'read_only_diagnostic',
      },
    ],
    repairRoute: 'read_only_diagnostic',
    notes: [
      'Source quality metadata is part of retrieval safety, not a UI label only.',
      'Archived, duplicate, low-credibility, or sensitive sources must carry explicit inclusion reasons.',
    ],
  },
  {
    domain: 'artifact',
    canonicalFields: ['id', 'taskId', 'sourceType', 'sourceId', 'kind', 'title', 'content', 'createdAt', 'updatedAt'],
    writeAuthority: 'Artifact writers and manual artifact service',
    readAuthority: 'ArtifactRecord explicit kind and source metadata',
    legacyFallbacks: [],
    repairRoute: 'read_only_diagnostic',
    notes: [
      'Artifacts require explicit artifact writes or artifact metadata.',
      'A path named Artifacts/ is not enough to classify a file as a product artifact.',
    ],
  },
  {
    domain: 'decision',
    canonicalFields: [
      'id',
      'taskId',
      'title',
      'status',
      'scope',
      'kind',
      'sourceType',
      'sourceId',
      'sourceLabel',
      'context',
      'options',
      'recommendation',
      'createdAt',
      'updatedAt',
    ],
    writeAuthority: 'DecisionService and Decisions judgment-center actions',
    readAuthority: 'DecisionRecord scope/kind/status/source fields',
    legacyFallbacks: [],
    repairRoute: 'decision_manual_review',
    notes: [
      'Pending decisions block execution through runtime verification when they affect the task.',
      'Ambiguous repair or approval cases should become Decisions instead of silent mutation.',
    ],
  },
  {
    domain: 'blocker',
    canonicalFields: [
      'id',
      'taskId',
      'title',
      'kind',
      'detail',
      'owner',
      'responsibility',
      'responsibilityLabel',
      'sourceContextId',
      'status',
      'createdAt',
      'updatedAt',
      'resolvedAt',
    ],
    writeAuthority: 'BlockerRepository through TaskService blocker flows',
    readAuthority: 'BlockerRecord active/resolved status plus source/responsibility metadata',
    legacyFallbacks: [],
    repairRoute: 'read_only_diagnostic',
    notes: [
      'Blockers are execution constraints and retrieval signals, not task state replacements.',
      'A blocker must stay bound to a task; orphaned blockers cannot safely influence priority or execution.',
    ],
  },
  {
    domain: 'dependency',
    canonicalFields: [
      'id',
      'taskId',
      'blockedByTaskId',
      'reason',
      'status',
      'createdAt',
      'updatedAt',
      'resolvedAt',
    ],
    writeAuthority: 'TaskDependencyRepository through TaskService dependency flows',
    readAuthority: 'TaskDependencyRecord active/resolved status and blockedByTaskId',
    legacyFallbacks: [],
    repairRoute: 'read_only_diagnostic',
    notes: [
      'Dependencies describe task-to-task execution order and must not be inferred from title text.',
      'Orphaned dependency endpoints should be diagnosed before they affect priority or retrieval.',
    ],
  },
  {
    domain: 'run_event',
    canonicalFields: ['runId', 'stepId', 'kind', 'input', 'output', 'status', 'createdAt'],
    writeAuthority: 'RunService, CodeAgentRunService, OperatorStartedRunService, and AgentToolRegistry',
    readAuthority: 'Run detail records and RuntimeEventRecord projections',
    legacyFallbacks: [],
    repairRoute: 'read_only_diagnostic',
    notes: [
      'Run detail is execution audit data; only durable recovery summaries should be proposed into Task.md or Task Records.',
    ],
  },
  {
    domain: 'task_dynamic',
    canonicalFields: ['id', 'taskId', 'type', 'payload', 'createdAt'],
    writeAuthority: 'TaskService.recordTimelineEvent through task_mutation guard',
    readAuthority: 'RuntimeEventRecord replay projection',
    legacyFallbacks: [
      {
        legacyField: 'raw timeline payload text',
        replacesCanonicalField: 'payload.changedFields',
        mode: 'read_only_until_migrated',
        condition: 'Only for old timeline events that predate changed-field payloads.',
        repairRoute: 'read_only_diagnostic',
      },
    ],
    repairRoute: 'read_only_diagnostic',
    notes: [
      'Task dynamics are replay/audit facts, not replacement task state.',
    ],
  },
  {
    domain: 'work_habit',
    canonicalFields: ['id', 'rule', 'source', 'scope', 'scopeLabel', 'status', 'examples', 'createdAt', 'lastAppliedAt', 'applicationCount'],
    writeAuthority: 'WorkHabit service through proposal/manual import flows',
    readAuthority: 'Confirmed WorkHabitRecord filtered by scope applicability',
    legacyFallbacks: [],
    repairRoute: 'read_only_diagnostic',
    notes: [
      'Pending work habits are not execution rules until confirmed.',
    ],
  },
  {
    domain: 'process_template',
    canonicalFields: ['id', 'title', 'summary', 'content', 'kind', 'tags', 'status', 'bindingId', 'taskId', 'bindingStatus', 'boundAt'],
    writeAuthority: 'Process template service and task binding mutations',
    readAuthority: 'AppliedProcessTemplateRecord with active binding status',
    legacyFallbacks: [],
    repairRoute: 'read_only_diagnostic',
    notes: [
      'Removed or archived templates do not participate in execution read order.',
    ],
  },
];

export function contractForCanonicalDomain(domain: CanonicalDomain): CanonicalDataContract {
  const contract = CANONICAL_DATA_CONTRACTS.find((item) => item.domain === domain);
  if (!contract) {
    throw new Error(`Missing canonical data contract for ${domain}`);
  }
  return contract;
}

export function canonicalFieldsForDomain(domain: CanonicalDomain): string[] {
  return [...contractForCanonicalDomain(domain).canonicalFields];
}

export function legacyFallbacksForDomain(domain: CanonicalDomain): LegacyFallbackRule[] {
  return contractForCanonicalDomain(domain).legacyFallbacks.map((rule) => ({ ...rule }));
}

export function isLegacyFallbackAllowed(params: {
  domain: CanonicalDomain;
  legacyField: string;
  canonicalFieldPresent: boolean;
}): boolean {
  const rule = contractForCanonicalDomain(params.domain).legacyFallbacks
    .find((item) => item.legacyField === params.legacyField);
  if (!rule || rule.mode === 'not_allowed') return false;
  if (rule.mode === 'read_only_when_canonical_missing') return !params.canonicalFieldPresent;
  return true;
}

export function evaluateCanonicalWriteInput(params: {
  domain: CanonicalDomain;
  input: Record<string, unknown>;
  allowedFields: string[];
  requiredFields?: string[];
}): CanonicalDataWriteValidation {
  const contract = contractForCanonicalDomain(params.domain);
  const canonicalFields = new Set(contract.canonicalFields);
  const allowedFields = new Set(params.allowedFields);
  const legacyFields = new Set(contract.legacyFallbacks.map((rule) => rule.legacyField));
  const issues: CanonicalDataWriteIssue[] = [];

  for (const field of Object.keys(params.input)) {
    if (allowedFields.has(field)) continue;
    const legacyWrite = legacyFields.has(field);
    issues.push({
      code: legacyWrite ? 'legacy_fallback_write' : 'unknown_write_field',
      domain: params.domain,
      field,
      severity: legacyWrite ? 'error' : canonicalFields.has(field) ? 'warning' : 'error',
      repairRoute: legacyWrite ? 'decision_manual_review' : contract.repairRoute,
      message: legacyWrite
        ? `${params.domain} write attempted to persist legacy fallback field ${field}; legacy fallbacks are read-only.`
        : `${params.domain} write field ${field} is not part of this write boundary.`,
    });
  }

  for (const field of params.requiredFields ?? []) {
    if (hasValue(params.input[field])) continue;
    issues.push({
      code: 'missing_required_write_field',
      domain: params.domain,
      field,
      severity: 'error',
      repairRoute: contract.repairRoute,
      message: `${params.domain} write is missing required canonical field ${field}.`,
    });
  }

  return {
    allowed: issues.length === 0,
    issues,
    summary: `canonicalWrite ${params.domain} allowed=${issues.length === 0 ? 'yes' : 'no'} / issues=${issues.length}`,
  };
}

export function assertCanonicalWriteInput(params: {
  domain: CanonicalDomain;
  input: Record<string, unknown>;
  allowedFields: string[];
  requiredFields?: string[];
}): void {
  const validation = evaluateCanonicalWriteInput(params);
  if (!validation.allowed) {
    throw new Error(validation.issues.map((issue) => issue.message).join(' '));
  }
}

export function evaluateCanonicalDataDiagnostics(
  input: CanonicalDataDiagnosticInput,
): CanonicalDataDiagnosticEvaluation {
  const issues: CanonicalDataDiagnosticIssue[] = [];
  const taskIds = new Set((input.tasks ?? [])
    .map((task) => stringField(task, 'id'))
    .filter(Boolean) as string[]);
  const sourceContextIds = new Set((input.sourceContexts ?? [])
    .map((source) => stringField(source, 'id'))
    .filter(Boolean) as string[]);

  issues.push(
    ...missingCanonicalFieldIssues('task', input.tasks ?? []),
    ...missingCanonicalFieldIssues('task_hierarchy', input.tasks ?? []),
    ...missingCanonicalFieldIssues('task_file', input.taskFiles ?? []),
    ...missingCanonicalFieldIssues('source_context', input.sourceContexts ?? []),
    ...missingCanonicalFieldIssues('artifact', input.artifacts ?? []),
    ...missingCanonicalFieldIssues('decision', input.decisions ?? []),
    ...missingCanonicalFieldIssues('blocker', input.blockers ?? []),
    ...missingCanonicalFieldIssues('dependency', input.dependencies ?? []),
    ...missingCanonicalFieldIssues('run_event', input.runEvents ?? []),
    ...missingCanonicalFieldIssues('task_dynamic', input.taskDynamics ?? []),
    ...missingCanonicalFieldIssues('work_habit', input.workHabits ?? []),
    ...missingCanonicalFieldIssues('process_template', input.processTemplates ?? []),
    ...taskHierarchyReferenceIssues(input.tasks ?? [], taskIds),
    ...orphanTaskReferenceIssues('task_file', input.taskFiles ?? [], taskIds),
    ...orphanTaskReferenceIssues('source_context', input.sourceContexts ?? [], taskIds),
    ...orphanTaskReferenceIssues('artifact', input.artifacts ?? [], taskIds),
    ...orphanTaskReferenceIssues('task_dynamic', input.taskDynamics ?? [], taskIds),
    ...orphanTaskReferenceIssues('blocker', input.blockers ?? [], taskIds),
    ...orphanTaskReferenceIssues('dependency', input.dependencies ?? [], taskIds),
    ...orphanBlockerSourceReferenceIssues(input.blockers ?? [], sourceContextIds),
    ...orphanDependencyTargetIssues(input.dependencies ?? [], taskIds),
    ...taskScopedDecisionBindingIssues(input.decisions ?? [], taskIds),
  );

  const safeAutoRepairCount = issues.filter((issue) => issue.repairRoute === 'mechanical_auto_repair').length;
  const manualReviewCount = issues.filter((issue) => issue.repairRoute === 'decision_manual_review').length;
  const readOnlyDiagnosticCount = issues.filter((issue) => issue.repairRoute === 'read_only_diagnostic').length;

  return {
    issues,
    safeAutoRepairCount,
    manualReviewCount,
    readOnlyDiagnosticCount,
    summary: `canonicalDataDiagnostics issues=${issues.length} / manualReview=${manualReviewCount} / readOnly=${readOnlyDiagnosticCount} / safeAutoRepair=${safeAutoRepairCount}`,
  };
}

function missingCanonicalFieldIssues(
  domain: CanonicalDomain,
  records: CanonicalDataDiagnosticRecord[],
): CanonicalDataDiagnosticIssue[] {
  const contract = contractForCanonicalDomain(domain);
  return records.flatMap((record, index) => contract.canonicalFields
    .filter((field) => !Object.prototype.hasOwnProperty.call(record, field))
    .map((field) => ({
      code: 'missing_canonical_field' as const,
      domain,
      recordId: recordId(record, index),
      field,
      severity: contract.repairRoute === 'decision_manual_review' ? 'warning' as const : 'info' as const,
      repairRoute: contract.repairRoute,
      message: `${domain} record is missing canonical field ${field}; use ${contract.repairRoute} before relying on legacy fallback.`,
    })));
}

function taskHierarchyReferenceIssues(
  tasks: CanonicalDataDiagnosticRecord[],
  taskIds: Set<string>,
): CanonicalDataDiagnosticIssue[] {
  const taskById = new Map(tasks
    .map((task, index) => [stringField(task, 'id'), { task, index }] as const)
    .filter((entry): entry is readonly [string, { task: CanonicalDataDiagnosticRecord; index: number }] => Boolean(entry[0])));
  const issues: CanonicalDataDiagnosticIssue[] = [];

  for (const { task, index } of taskById.values()) {
    const taskId = stringField(task, 'id');
    if (!taskId) continue;

    const parentTaskId = stringField(task, 'parentTaskId');
    if (parentTaskId) {
      const parent = taskById.get(parentTaskId)?.task;
      if (!parent) {
        issues.push({
          code: 'orphan_task_reference',
          domain: 'task_hierarchy',
          recordId: recordId(task, index),
          field: 'parentTaskId',
          severity: 'error',
          repairRoute: 'decision_manual_review',
          message: `task_hierarchy record references missing parent task ${parentTaskId}.`,
        });
      } else if (!arrayField(parent, 'childTaskIds').includes(taskId)) {
        issues.push({
          code: 'hierarchy_backlink_mismatch',
          domain: 'task_hierarchy',
          recordId: recordId(task, index),
          field: 'parentTaskId',
          severity: 'warning',
          repairRoute: 'mechanical_auto_repair',
          message: `task_hierarchy child ${taskId} points to parent ${parentTaskId}, but the parent childTaskIds list does not include the child.`,
        });
      }
    }

    for (const childTaskId of arrayField(task, 'childTaskIds')) {
      const child = taskById.get(childTaskId)?.task;
      if (!taskIds.has(childTaskId) || !child) {
        issues.push({
          code: 'orphan_task_reference',
          domain: 'task_hierarchy',
          recordId: recordId(task, index),
          field: 'childTaskIds',
          severity: 'error',
          repairRoute: 'decision_manual_review',
          message: `task_hierarchy parent ${taskId} references missing child task ${childTaskId}.`,
        });
        continue;
      }

      const childParentTaskId = stringField(child, 'parentTaskId');
      if (childParentTaskId !== taskId) {
        issues.push({
          code: 'hierarchy_backlink_mismatch',
          domain: 'task_hierarchy',
          recordId: recordId(task, index),
          field: 'childTaskIds',
          severity: 'warning',
          repairRoute: 'decision_manual_review',
          message: childParentTaskId
            ? `task_hierarchy parent ${taskId} lists child ${childTaskId}, but the child points to parent ${childParentTaskId}.`
            : `task_hierarchy parent ${taskId} lists child ${childTaskId}, but the child has no parentTaskId backlink.`,
        });
      }
    }
  }

  return issues;
}

function orphanTaskReferenceIssues(
  domain: CanonicalDomain,
  records: CanonicalDataDiagnosticRecord[],
  taskIds: Set<string>,
): CanonicalDataDiagnosticIssue[] {
  const contract = contractForCanonicalDomain(domain);
  return records.flatMap((record, index) => {
    const taskId = stringField(record, 'taskId');
    if (!taskId || taskIds.has(taskId)) return [];
    return [{
      code: 'orphan_task_reference' as const,
      domain,
      recordId: recordId(record, index),
      field: 'taskId',
      severity: 'error' as const,
      repairRoute: contract.repairRoute,
      message: `${domain} record references missing task ${taskId}.`,
    }];
  });
}

function taskScopedDecisionBindingIssues(
  decisions: CanonicalDataDiagnosticRecord[],
  taskIds: Set<string>,
): CanonicalDataDiagnosticIssue[] {
  const contract = contractForCanonicalDomain('decision');
  return decisions.flatMap((decision, index) => {
    const scope = stringField(decision, 'scope');
    const taskId = stringField(decision, 'taskId');
    if (scope !== 'task') return [];
    if (taskId && taskIds.has(taskId)) return [];
    return [{
      code: taskId ? 'orphan_task_reference' as const : 'missing_task_binding' as const,
      domain: 'decision' as const,
      recordId: recordId(decision, index),
      field: 'taskId',
      severity: 'warning' as const,
      repairRoute: contract.repairRoute,
      message: taskId
        ? `task-scoped Decision references missing task ${taskId}.`
        : 'task-scoped Decision is missing taskId.',
    }];
  });
}

function orphanDependencyTargetIssues(
  dependencies: CanonicalDataDiagnosticRecord[],
  taskIds: Set<string>,
): CanonicalDataDiagnosticIssue[] {
  const contract = contractForCanonicalDomain('dependency');
  return dependencies.flatMap((dependency, index) => {
    const blockedByTaskId = stringField(dependency, 'blockedByTaskId');
    if (!blockedByTaskId || taskIds.has(blockedByTaskId)) return [];
    return [{
      code: 'orphan_task_reference' as const,
      domain: 'dependency' as const,
      recordId: recordId(dependency, index),
      field: 'blockedByTaskId',
      severity: 'error' as const,
      repairRoute: contract.repairRoute,
      message: `dependency record references missing upstream task ${blockedByTaskId}.`,
    }];
  });
}

function orphanBlockerSourceReferenceIssues(
  blockers: CanonicalDataDiagnosticRecord[],
  sourceContextIds: Set<string>,
): CanonicalDataDiagnosticIssue[] {
  const contract = contractForCanonicalDomain('blocker');
  return blockers.flatMap((blocker, index) => {
    const sourceContextId = stringField(blocker, 'sourceContextId');
    if (!sourceContextId || sourceContextIds.has(sourceContextId)) return [];
    return [{
      code: 'orphan_source_reference' as const,
      domain: 'blocker' as const,
      recordId: recordId(blocker, index),
      field: 'sourceContextId',
      severity: 'warning' as const,
      repairRoute: contract.repairRoute,
      message: `blocker record references missing source context ${sourceContextId}.`,
    }];
  });
}

function stringField(record: CanonicalDataDiagnosticRecord, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function arrayField(record: CanonicalDataDiagnosticRecord, field: string): string[] {
  const value = record[field];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function recordId(record: CanonicalDataDiagnosticRecord, index: number): string {
  return stringField(record, 'id') ?? `record:${index}`;
}
