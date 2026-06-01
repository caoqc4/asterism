import { describe, expect, it } from 'vitest';

import {
  buildTaskMemorySearchIndex,
  retrieveBusinessMemory,
  retrieveTaskExecutionMemory,
} from './task-memory-retrieval.js';
import type { ArtifactRecord } from './types/artifact.js';
import type {
  BusinessLineRecord,
  BusinessLineReview,
  BusinessLineSkillRevision,
} from './types/business-line.js';
import type { BlockerRecord } from './types/blocker.js';
import type { DecisionRecord } from './types/decision.js';
import type { AppliedProcessTemplateRecord } from './types/process-template.js';
import type { SourceContextRecord } from './types/source-context.js';
import type { TaskFileRecord } from './types/task-file.js';
import type { TaskDependencyRecord } from './types/task-dependency.js';
import type { TaskListItemRecord, TaskRecord, TimelineEventRecord } from './types/task.js';
import type { WorkHabitRecord } from './types/work-habit.js';
import type { RunRecord } from './types/run.js';

describe('task memory retrieval', () => {
  it('builds a deterministic searchable index across task memory surfaces', () => {
    const index = buildTaskMemorySearchIndex({
      currentTask: task(),
      taskFiles: [
        taskFile({ id: 'file_task_md', name: 'Task.md', path: 'Task.md' }),
        taskFile({ id: 'file_record', name: 'handoff.md', path: 'Task Records/handoff.md' }),
        taskFile({ id: 'file_support', name: 'notes.md', path: 'notes.md' }),
      ],
      sourceContexts: [sourceContext({ id: 'source_key', isKey: true, uri: 'https://example.com' })],
      artifacts: [artifact()],
      decisions: [decision()],
      blockers: [blocker()],
      dependencies: [dependency()],
      timeline: [timelineEvent()],
      workHabits: [workHabit()],
      processTemplates: [processTemplate()],
    });

    expect(index.map((item) => item.entityType)).toEqual([
      'task_state',
      'task_md',
      'task_record',
      'task_file',
      'source_context',
      'artifact',
      'decision',
      'blocker',
      'dependency',
      'task_dynamic',
      'work_habit',
      'process_template',
    ]);
    expect(index.find((item) => item.id === 'source_key')).toMatchObject({
      freshness: expect.objectContaining({ decision: 'include', reason: 'key_source' }),
      quality: expect.objectContaining({ decision: 'include', reason: 'key_source' }),
      importanceSignals: expect.arrayContaining(['key_source']),
    });
  });

  it('prioritizes current task recovery memory, pending decisions, blockers, and key sources', () => {
    const results = retrieveTaskExecutionMemory({
      currentTask: task(),
      taskFiles: [
        taskFile({ id: 'file_record_other', taskId: 'task_other', name: 'Other record', path: 'Task Records/other.md' }),
        taskFile({ id: 'file_task_md', name: 'Task.md', path: 'Task.md' }),
        taskFile({ id: 'file_record_current', name: 'Current record', path: 'Task Records/current.md' }),
      ],
      decisions: [decision({ id: 'decision_pending', status: 'pending' })],
      blockers: [blocker({ id: 'blocker_active', status: 'active' })],
      dependencies: [dependency({ id: 'dependency_active', status: 'active' })],
      sourceContexts: [sourceContext({ id: 'source_key', isKey: true, uri: 'https://example.com' })],
      maxResults: 6,
    });

    expect(results.map((item) => item.entity.id)).toEqual([
      'task_1',
      'file_task_md',
      'decision_pending',
      'blocker_active',
      'dependency_active',
      'file_record_current',
    ]);
    expect(results.find((item) => item.entity.id === 'file_record_other')).toBeUndefined();
  });

  it('demotes resolved blockers and dependencies below current recovery records', () => {
    const results = retrieveTaskExecutionMemory({
      currentTask: task(),
      now: '2026-05-18T00:00:00.000Z',
      taskFiles: [
        taskFile({ id: 'file_task_md', name: 'Task.md', path: 'Task.md' }),
        taskFile({ id: 'file_record_current', name: 'Current record', path: 'Task Records/current.md' }),
      ],
      blockers: [blocker({ id: 'blocker_resolved', status: 'resolved' })],
      dependencies: [dependency({ id: 'dependency_resolved', status: 'resolved' })],
      sourceContexts: [sourceContext({ id: 'source_current', uri: 'https://example.com' })],
    });

    expect(results.slice(0, 4).map((item) => item.entity.id)).toEqual([
      'task_1',
      'file_task_md',
      'file_record_current',
      'source_current',
    ]);
    expect(results.find((item) => item.entity.id === 'blocker_resolved')).toMatchObject({
      decision: 'include',
      reasons: expect.arrayContaining(['resolved_blocker']),
    });
    expect(results.find((item) => item.entity.id === 'dependency_resolved')).toMatchObject({
      decision: 'include',
      reasons: expect.arrayContaining(['resolved_dependency']),
    });
  });

  it('excludes archived or duplicate sources by default while keeping reasons', () => {
    const results = retrieveTaskExecutionMemory({
      currentTask: task(),
      now: '2026-05-18T00:00:00.000Z',
      sourceContexts: [
        sourceContext({ id: 'source_archived', status: 'archived', uri: 'https://old.example.com' }),
        sourceContext({ id: 'source_duplicate', isDuplicate: true, uri: 'https://dup.example.com' }),
        sourceContext({ id: 'source_sensitive', containsSensitiveData: true, uri: 'https://secret.example.com' }),
        sourceContext({
          id: 'source_stale',
          capturedAt: '2026-03-01T00:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
          uri: 'https://stale.example.com',
        }),
      ],
    });

    expect(results.find((item) => item.entity.id === 'source_archived')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['source_quality:archived', 'source_freshness:archived']),
    });
    expect(results.find((item) => item.entity.id === 'source_duplicate')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['source_quality:duplicate']),
    });
    expect(results.find((item) => item.entity.id === 'source_sensitive')).toMatchObject({
      decision: 'caution',
      reasons: expect.arrayContaining(['source_quality:sensitive']),
    });
    expect(results.find((item) => item.entity.id === 'source_stale')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['source_freshness:stale']),
    });
  });

  it('allows explicit selected files to surface with caution when otherwise weak', () => {
    const results = retrieveTaskExecutionMemory({
      currentTask: task(),
      taskFiles: [
        taskFile({
          id: 'file_other',
          taskId: 'task_other',
          name: 'Other task notes',
          path: 'notes.md',
        }),
      ],
      selectedFileIds: ['file_other'],
    });

    expect(results.find((item) => item.entity.id === 'file_other')).toMatchObject({
      decision: 'caution',
      reasons: expect.arrayContaining(['different_task', 'selected']),
    });
  });

  it('keeps unconfirmed work habits and inactive process templates out of execution context', () => {
    const results = retrieveTaskExecutionMemory({
      currentTask: task(),
      workHabits: [workHabit({ id: 'habit_pending', status: 'pending' })],
      processTemplates: [processTemplate({ bindingId: 'template_removed', bindingStatus: 'removed' })],
    });

    expect(results.find((item) => item.entity.id === 'habit_pending')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['unconfirmed_work_habit']),
    });
    expect(results.find((item) => item.entity.id === 'template_removed')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['inactive_process_template']),
    });
  });

  it('boosts exact query matches without letting unrelated records outrank current task state', () => {
    const results = retrieveTaskExecutionMemory({
      currentTask: task(),
      taskFiles: [
        taskFile({ id: 'file_current', name: 'Acceptance Notes', path: 'Task Records/acceptance.md' }),
        taskFile({ id: 'file_other', taskId: 'task_other', name: 'Acceptance Notes', path: 'Task Records/other.md' }),
      ],
      query: 'Acceptance Notes',
    });

    expect(results.slice(0, 3).map((item) => item.entity.id)).toEqual([
      'task_1',
      'file_current',
      'file_other',
    ]);
    expect(results.find((item) => item.entity.id === 'file_other')).toMatchObject({
      decision: 'include',
      reasons: expect.arrayContaining(['query_match']),
    });
  });

  it('retrieves business memory by owner with deterministic inclusion and exclusion reasons', () => {
    const results = retrieveBusinessMemory({
      owner: { kind: 'business_line', businessLineId: 'business_1' },
      records: [
        businessRecord({ id: 'record_future', shouldAffectFutureContext: true }),
        businessRecord({ id: 'record_draft', shouldAffectFutureContext: false }),
        businessRecord({ id: 'record_other', businessLineId: 'business_2', shouldAffectFutureContext: true }),
      ],
      reviews: [
        businessReview({ id: 'review_1' }),
        businessReview({ id: 'review_other', businessLineId: 'business_2' }),
      ],
      skillRevisions: [
        skillRevision({ id: 'sop_active', status: 'active' }),
        skillRevision({ id: 'sop_proposed', status: 'proposed' }),
        skillRevision({ id: 'sop_rejected', status: 'rejected' }),
        skillRevision({ id: 'sop_expired', expiresAt: '2020-01-01T00:00:00.000Z', status: 'active' }),
      ],
      decisions: [
        decision({ id: 'decision_active', businessLineId: 'business_1', status: 'pending' }),
        decision({ id: 'decision_closed', businessLineId: 'business_1', status: 'approved' }),
      ],
      selectedSourceIds: ['source_selected'],
      sources: [
        sourceContext({ id: 'source_selected', businessLineId: 'business_1', isKey: true }),
        sourceContext({ id: 'source_unselected', businessLineId: 'business_1' }),
      ],
      artifacts: [artifact({ id: 'artifact_1', businessLineId: 'business_1' })],
      currentNextAction: task({ id: 'task_1', businessLineId: 'business_1' }) as TaskListItemRecord,
      runs: [runRecord({ id: 'run_1', businessLineId: 'business_1', output: 'Evidence' })],
      workHabits: [workHabit(), workHabit({ id: 'habit_pending', status: 'pending' })],
    });

    expect(results.find((item) => item.id === 'record_future')).toMatchObject({
      decision: 'include',
      kind: 'business_record',
      reasons: expect.arrayContaining(['owner_scope', 'future_context_enabled']),
    });
    expect(results.find((item) => item.id === 'record_draft')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['future_context_disabled']),
    });
    expect(results.find((item) => item.id === 'record_other')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['cross_business_excluded']),
    });
    expect(results.find((item) => item.id === 'review:review_1')).toMatchObject({
      decision: 'include',
      kind: 'business_review',
      reasons: expect.arrayContaining(['structured_review']),
    });
    expect(results.find((item) => item.id === 'sop_active')).toMatchObject({
      decision: 'include',
      reasons: expect.arrayContaining(['accepted_sop']),
    });
    expect(results.find((item) => item.id === 'sop_proposed')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['inactive_sop:proposed']),
    });
    expect(results.find((item) => item.id === 'sop_rejected')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['inactive_sop:rejected']),
    });
    expect(results.find((item) => item.id === 'sop_expired')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['expired_sop']),
    });
    expect(results.find((item) => item.id === 'decision_active')).toMatchObject({
      decision: 'include',
      kind: 'active_decision',
      reasons: expect.arrayContaining(['active_decision']),
    });
    expect(results.find((item) => item.id === 'decision_closed')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['inactive_decision:approved']),
    });
    expect(results.find((item) => item.id === 'source_selected')).toMatchObject({
      decision: 'include',
      kind: 'selected_source',
      reasons: expect.arrayContaining(['selected_source', 'traceable_source']),
    });
    expect(results.find((item) => item.id === 'source_unselected')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['not_selected_source']),
    });
    expect(results.find((item) => item.id === 'artifact_1')).toMatchObject({
      decision: 'include',
      kind: 'artifact',
      reasons: expect.arrayContaining(['owner_scope', 'run_artifact']),
    });
    expect(results.find((item) => item.id === 'task_1')).toMatchObject({
      decision: 'include',
      kind: 'current_next_action',
      reasons: expect.arrayContaining(['open_next_action', 'next_safe_action_present']),
    });
    expect(results.find((item) => item.id === 'run_1')).toMatchObject({
      decision: 'include',
      kind: 'run_evidence',
      reasons: expect.arrayContaining(['terminal_run:completed', 'run_evidence_present']),
    });
    expect(results.find((item) => item.id === 'habit_1')).toMatchObject({
      decision: 'include',
      kind: 'work_habit',
      reasons: expect.arrayContaining(['confirmed_work_habit']),
    });
  });

  it('allows explicit business memory selection without enabling vector retrieval', () => {
    const results = retrieveBusinessMemory({
      owner: { kind: 'business_line', businessLineId: 'business_1' },
      explicitItemIds: ['record_draft'],
      records: [
        businessRecord({ id: 'record_draft', shouldAffectFutureContext: false }),
        businessRecord({ id: 'record_other', businessLineId: 'business_2', shouldAffectFutureContext: true }),
      ],
    });

    expect(results.find((item) => item.id === 'record_draft')).toMatchObject({
      decision: 'include',
      reasons: expect.arrayContaining(['explicit_non_future_context', 'explicitly_selected']),
    });
    expect(results.find((item) => item.id === 'record_other')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['cross_business_excluded']),
    });
    expect(results.map((item) => item.reasons.join(' ')).join(' ')).not.toMatch(/embedding|vector|rag/i);
  });

  it('allows explicit cross-business source, current Next Action, and run evidence selection', () => {
    const results = retrieveBusinessMemory({
      owner: { kind: 'business_line', businessLineId: 'business_1' },
      explicitItemIds: ['source_cross', 'task_cross', 'run_cross'],
      sources: [
        sourceContext({
          id: 'source_cross',
          businessLineId: 'business_2',
          taskId: 'task_cross',
        }),
        sourceContext({
          id: 'source_cross_unselected',
          businessLineId: 'business_2',
          taskId: 'task_cross',
        }),
      ],
      currentNextAction: task({
        id: 'task_cross',
        businessLineId: 'business_2',
      }) as TaskListItemRecord,
      runs: [
        runRecord({
          id: 'run_cross',
          businessLineId: 'business_2',
          taskId: 'task_cross',
          output: 'Cross-business run evidence selected by the operator.',
        }),
        runRecord({
          id: 'run_cross_unselected',
          businessLineId: 'business_2',
          taskId: 'task_cross',
          output: 'Cross-business run evidence was not selected.',
        }),
      ],
    });

    expect(results.find((item) => item.id === 'source_cross')).toMatchObject({
      decision: 'include',
      kind: 'selected_source',
      reasons: expect.arrayContaining(['cross_business_excluded', 'explicitly_selected']),
    });
    expect(results.find((item) => item.id === 'source_cross_unselected')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['cross_business_excluded', 'not_selected_source']),
    });
    expect(results.find((item) => item.id === 'task_cross')).toMatchObject({
      decision: 'include',
      kind: 'current_next_action',
      reasons: expect.arrayContaining(['cross_business_excluded', 'explicitly_selected']),
    });
    expect(results.find((item) => item.id === 'run_cross')).toMatchObject({
      decision: 'include',
      kind: 'run_evidence',
      reasons: expect.arrayContaining(['cross_business_excluded', 'explicitly_selected']),
    });
    expect(results.find((item) => item.id === 'run_cross_unselected')).toMatchObject({
      decision: 'exclude',
      reasons: expect.arrayContaining(['cross_business_excluded']),
    });
  });
});

function task(partial: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task_1',
    title: 'Build retrieval foundation',
    summary: 'Create deterministic task memory retrieval.',
    taskType: 'project',
    taskFacets: ['project'],
    parentTaskId: null,
    childTaskIds: [],
    state: 'running',
    nextStep: 'Read Task.md and recent task records.',
    waitingReason: null,
    riskLevel: 'none',
    riskNote: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...partial,
  };
}

function businessRecord(partial: Partial<BusinessLineRecord> = {}): BusinessLineRecord {
  return {
    id: 'record_1',
    type: 'signal',
    businessLineId: 'business_1',
    source: 'manual',
    summary: 'Future context record',
    confidence: 80,
    linkedActionId: null,
    linkedDecisionId: null,
    shouldAffectFutureContext: true,
    futureContextReason: 'Confirmed business memory.',
    provenance: null,
    createdAt: '2026-05-17T00:00:00.000Z',
    ...partial,
  };
}

function businessReview(partial: Partial<BusinessLineReview> = {}): BusinessLineReview {
  return {
    id: 'review_1',
    businessLineId: 'business_1',
    sourceActionId: 'task_1',
    resultSummary: 'Review confirmed the next action.',
    evidenceItems: ['run_1'],
    hypothesisChange: null,
    skillUpdateSuggestions: [],
    nextActionSuggestions: [],
    confidence: 85,
    requiresDecision: false,
    createdAt: '2026-05-17T01:00:00.000Z',
    ...partial,
  };
}

function skillRevision(partial: Partial<BusinessLineSkillRevision> = {}): BusinessLineSkillRevision {
  return {
    id: 'sop_1',
    skillId: 'skill_1',
    businessLineId: 'business_1',
    scopePath: 'business-line/Business 1',
    previousContent: null,
    nextContent: 'Use deterministic retrieval before planning.',
    changeReason: 'Review evidence',
    sourceReviewId: 'review_1',
    approvedBy: 'operator',
    status: 'active',
    effectiveAt: '2026-05-17T00:00:00.000Z',
    rollbackTargetRevisionId: null,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...partial,
  };
}

function runRecord(partial: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'run_1',
    taskId: 'task_1',
    businessLineId: 'business_1',
    type: 'agent',
    status: 'completed',
    instructions: 'Run evidence.',
    output: 'Completed run evidence.',
    outputSource: 'ai',
    failureReason: null,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...partial,
  };
}

function taskFile(partial: Partial<TaskFileRecord> = {}): TaskFileRecord {
  return {
    id: 'file_1',
    taskId: 'task_1',
    name: 'Task.md',
    path: 'Task.md',
    kind: 'file',
    content: 'Task recovery context',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...partial,
  };
}

function sourceContext(partial: Partial<SourceContextRecord> = {}): SourceContextRecord {
  return {
    id: 'source_1',
    taskId: 'task_1',
    title: 'Source',
    kind: 'link',
    isKey: false,
    uri: 'https://example.com/source',
    content: 'Evidence source',
    note: 'Traceable source',
    status: 'active',
    capturedAt: '2026-05-15T00:00:00.000Z',
    runId: null,
    batchId: null,
    sourceRole: 'raw',
    credibility: 'unknown',
    isDuplicate: false,
    containsSensitiveData: false,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    archivedAt: null,
    ...partial,
  };
}

function artifact(partial: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: 'artifact_1',
    taskId: 'task_1',
    sourceType: 'run',
    sourceId: 'run_1',
    kind: 'run_output',
    title: 'Run output',
    content: 'Generated output',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...partial,
  };
}

function decision(partial: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: 'decision_1',
    taskId: 'task_1',
    title: 'Choose retrieval policy',
    status: 'pending',
    scope: 'task',
    kind: 'direction_choice',
    sourceType: 'manual',
    sourceId: null,
    sourceLabel: null,
    context: { whyNow: 'Execution needs read order.' },
    options: [],
    recommendation: { label: 'Use deterministic retrieval', reason: 'Smallest reliable step.' },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...partial,
  };
}

function blocker(partial: Partial<BlockerRecord> = {}): BlockerRecord {
  return {
    id: 'blocker_1',
    taskId: 'task_1',
    title: 'Missing source policy',
    kind: 'document_or_material',
    detail: 'Need a source inclusion policy.',
    owner: null,
    responsibility: null,
    responsibilityLabel: null,
    sourceContextId: null,
    status: 'active',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    resolvedAt: null,
    ...partial,
  };
}

function dependency(partial: Partial<TaskDependencyRecord> = {}): TaskDependencyRecord {
  return {
    id: 'dependency_1',
    taskId: 'task_1',
    blockedByTaskId: 'task_upstream',
    blockedByTaskTitle: 'Upstream task',
    reason: 'Need upstream API contract.',
    status: 'active',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    resolvedAt: null,
    ...partial,
  };
}

function timelineEvent(partial: Partial<TimelineEventRecord> = {}): TimelineEventRecord {
  return {
    id: 'timeline_1',
    taskId: 'task_1',
    type: 'status_changed',
    payload: 'Task changed from planned to running.',
    createdAt: '2026-05-16T00:00:00.000Z',
    ...partial,
  };
}

function workHabit(partial: Partial<WorkHabitRecord> = {}): WorkHabitRecord {
  return {
    id: 'habit_1',
    rule: 'Prefer deterministic retrieval before embeddings.',
    source: 'manual',
    scope: 'global',
    scopeLabel: 'All tasks',
    status: 'confirmed',
    examples: 'Use exact paths first.',
    createdAt: '2026-05-01T00:00:00.000Z',
    lastAppliedAt: null,
    applicationCount: 0,
    ...partial,
  };
}

function processTemplate(partial: Partial<AppliedProcessTemplateRecord> = {}): AppliedProcessTemplateRecord {
  return {
    id: 'template_1',
    bindingId: 'template_binding_1',
    taskId: 'task_1',
    title: 'Runtime quality loop',
    summary: 'Read memory, execute, record.',
    content: '1. Read memory\n2. Execute\n3. Record',
    kind: 'workflow',
    tags: ['runtime'],
    status: 'active',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    archivedAt: null,
    bindingStatus: 'active',
    bindingNote: null,
    boundAt: '2026-05-02T00:00:00.000Z',
    bindingUpdatedAt: '2026-05-02T00:00:00.000Z',
    removedAt: null,
    ...partial,
  };
}
