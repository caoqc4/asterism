export type CanonicalDomain =
  | 'task'
  | 'task_hierarchy'
  | 'task_file'
  | 'source_context'
  | 'artifact'
  | 'decision'
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
