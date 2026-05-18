import { describe, expect, it } from 'vitest';

import {
  CANONICAL_DATA_CONTRACTS,
  assertCanonicalWriteInput,
  canonicalFieldsForDomain,
  contractForCanonicalDomain,
  evaluateCanonicalDataDiagnostics,
  evaluateCanonicalWriteInput,
  isLegacyFallbackAllowed,
  legacyFallbacksForDomain,
} from './canonical-data-contract.js';

describe('canonical data contract', () => {
  it('declares one contract for every retained foundation domain', () => {
    expect(CANONICAL_DATA_CONTRACTS.map((contract) => contract.domain)).toEqual([
      'task',
      'task_hierarchy',
      'task_file',
      'source_context',
      'artifact',
      'decision',
      'blocker',
      'dependency',
      'run_event',
      'task_dynamic',
      'work_habit',
      'process_template',
    ]);

    for (const contract of CANONICAL_DATA_CONTRACTS) {
      expect(contract.canonicalFields.length).toBeGreaterThan(0);
      expect(contract.writeAuthority.length).toBeGreaterThan(0);
      expect(contract.readAuthority.length).toBeGreaterThan(0);
      expect(contract.notes.length).toBeGreaterThan(0);
    }
  });

  it('keeps task hierarchy authority on persisted parent and child fields', () => {
    expect(canonicalFieldsForDomain('task_hierarchy')).toEqual([
      'parentTaskId',
      'childTaskIds',
      'taskType',
      'taskFacets',
    ]);

    const contract = contractForCanonicalDomain('task_hierarchy');
    expect(contract.writeAuthority).toContain('TaskService');
    expect(contract.legacyFallbacks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        legacyField: 'renderer.localTaskAttributes.parentTaskId',
        replacesCanonicalField: 'parentTaskId',
        mode: 'read_only_when_canonical_missing',
        repairRoute: 'decision_manual_review',
      }),
      expect.objectContaining({
        legacyField: 'title phase-followup pattern',
        replacesCanonicalField: 'parentTaskId',
        mode: 'read_only_when_canonical_missing',
      }),
    ]));
  });

  it('allows legacy hierarchy fallback only while the canonical field is missing', () => {
    expect(isLegacyFallbackAllowed({
      domain: 'task_hierarchy',
      legacyField: 'renderer.localTaskAttributes.parentTaskId',
      canonicalFieldPresent: false,
    })).toBe(true);

    expect(isLegacyFallbackAllowed({
      domain: 'task_hierarchy',
      legacyField: 'renderer.localTaskAttributes.parentTaskId',
      canonicalFieldPresent: true,
    })).toBe(false);
  });

  it('keeps source role keyword fallback below explicit sourceRole authority', () => {
    expect(legacyFallbacksForDomain('source_context')).toEqual([
      expect.objectContaining({
        legacyField: 'title/note keyword classification',
        replacesCanonicalField: 'sourceRole',
        mode: 'read_only_when_canonical_missing',
      }),
    ]);
    expect(isLegacyFallbackAllowed({
      domain: 'source_context',
      legacyField: 'title/note keyword classification',
      canonicalFieldPresent: true,
    })).toBe(false);
  });

  it('documents that artifact classification cannot fall back to folder names', () => {
    const artifact = contractForCanonicalDomain('artifact');
    expect(artifact.legacyFallbacks).toEqual([]);
    expect(artifact.notes.join('\n')).toContain('Artifacts/');
    expect(isLegacyFallbackAllowed({
      domain: 'artifact',
      legacyField: 'Artifacts/ folder',
      canonicalFieldPresent: false,
    })).toBe(false);
  });

  it('requires ambiguous repair domains to route through Decisions or diagnostics', () => {
    expect(contractForCanonicalDomain('decision').repairRoute).toBe('decision_manual_review');
    expect(contractForCanonicalDomain('task_hierarchy').repairRoute).toBe('decision_manual_review');
    expect(contractForCanonicalDomain('task_file').repairRoute).toBe('read_only_diagnostic');
    expect(contractForCanonicalDomain('blocker').repairRoute).toBe('read_only_diagnostic');
    expect(contractForCanonicalDomain('dependency').repairRoute).toBe('read_only_diagnostic');
  });

  it('keeps decision source labels in the canonical contract', () => {
    expect(canonicalFieldsForDomain('decision')).toEqual(expect.arrayContaining([
      'sourceType',
      'sourceId',
      'sourceLabel',
    ]));
  });

  it('keeps source batch metadata in the canonical contract', () => {
    expect(canonicalFieldsForDomain('source_context')).toEqual(expect.arrayContaining([
      'capturedAt',
      'runId',
      'batchId',
      'sourceRole',
      'credibility',
    ]));
  });

  it('validates write-boundary fields without treating every canonical field as caller-writable', () => {
    const valid = evaluateCanonicalWriteInput({
      domain: 'task_file',
      input: {
        taskId: 'task_1',
        name: 'Task.md',
        kind: 'file',
        content: '# Task',
      },
      allowedFields: ['taskId', 'name', 'path', 'kind', 'content'],
      requiredFields: ['taskId', 'name', 'kind'],
    });

    expect(valid.allowed).toBe(true);
    expect(valid.summary).toContain('allowed=yes');

    const invalid = evaluateCanonicalWriteInput({
      domain: 'task_file',
      input: {
        id: 'caller_supplied',
        taskId: 'task_1',
        name: '',
        kind: 'file',
        artifactFolder: 'Artifacts/',
      },
      allowedFields: ['taskId', 'name', 'path', 'kind', 'content'],
      requiredFields: ['taskId', 'name', 'kind'],
    });

    expect(invalid.allowed).toBe(false);
    expect(invalid.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'unknown_write_field',
        field: 'id',
      }),
      expect.objectContaining({
        code: 'unknown_write_field',
        field: 'artifactFolder',
      }),
      expect.objectContaining({
        code: 'missing_required_write_field',
        field: 'name',
      }),
    ]));
  });

  it('blocks writes to read-only legacy fallback fields', () => {
    const invalid = evaluateCanonicalWriteInput({
      domain: 'task_hierarchy',
      input: {
        'renderer.localTaskAttributes.parentTaskId': 'legacy_parent',
        parentTaskId: 'task_parent',
      },
      allowedFields: ['parentTaskId', 'childTaskIds', 'taskType', 'taskFacets'],
      requiredFields: ['parentTaskId'],
    });

    expect(invalid.allowed).toBe(false);
    expect(invalid.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'legacy_fallback_write',
        field: 'renderer.localTaskAttributes.parentTaskId',
        repairRoute: 'decision_manual_review',
      }),
    ]));
  });

  it('throws a concise error for invalid canonical writes', () => {
    expect(() => assertCanonicalWriteInput({
      domain: 'decision',
      input: {
        title: 'Approve deployment',
        legacyStatus: 'pending',
      },
      allowedFields: ['taskId', 'title', 'scope', 'kind', 'sourceType', 'sourceId', 'sourceLabel', 'context', 'options', 'recommendation'],
      requiredFields: ['title', 'scope', 'kind', 'sourceType'],
    })).toThrow(/legacyStatus/);
  });

  it('diagnoses missing canonical fields and orphan task-bound records', () => {
    const result = evaluateCanonicalDataDiagnostics({
      tasks: [
        {
          id: 'task_1',
          title: 'Task',
          summary: null,
          state: 'running',
          taskType: 'project',
          taskFacets: ['project'],
          parentTaskId: null,
          childTaskIds: [],
          nextStep: 'Continue',
          waitingReason: null,
          riskLevel: 'none',
          riskNote: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
        {
          id: 'task_parent',
          title: 'Parent task',
          summary: null,
          state: 'running',
          taskType: 'project',
          taskFacets: ['project'],
          parentTaskId: null,
          childTaskIds: [],
          nextStep: 'Continue',
          waitingReason: null,
          riskLevel: 'none',
          riskNote: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
        {
          id: 'task_child',
          title: 'Child task',
          summary: null,
          state: 'planned',
          taskType: 'simple',
          taskFacets: ['simple'],
          parentTaskId: 'task_parent',
          childTaskIds: [],
          nextStep: 'Continue',
          waitingReason: null,
          riskLevel: 'none',
          riskNote: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
        {
          id: 'task_orphan_parent',
          title: 'Missing parent',
          summary: null,
          state: 'planned',
          taskType: 'simple',
          taskFacets: ['simple'],
          parentTaskId: 'missing_parent_task',
          childTaskIds: [],
          nextStep: 'Continue',
          waitingReason: null,
          riskLevel: 'none',
          riskNote: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      ],
      taskFiles: [
        {
          id: 'file_1',
          taskId: 'missing_task',
          name: 'Task.md',
          path: 'Task.md',
          kind: 'file',
          content: '# Task',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      ],
      sourceContexts: [
        {
          id: 'source_context_1',
          taskId: 'task_1',
          title: 'Existing source',
          kind: 'note',
          isKey: false,
          uri: null,
          content: 'Source content',
          note: null,
          status: 'active',
          capturedAt: '2026-05-17T00:00:00.000Z',
          runId: null,
          batchId: null,
          sourceRole: 'raw',
          credibility: 'unknown',
          isDuplicate: false,
          containsSensitiveData: false,
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
          archivedAt: null,
        },
      ],
      decisions: [
        {
          id: 'decision_1',
          taskId: null,
          title: 'Confirm direction',
          status: 'pending',
          scope: 'task',
          kind: 'direction_choice',
          sourceType: 'manual',
          sourceId: null,
          context: {},
          options: [],
          recommendation: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
        {
          id: 'decision_legacy',
          taskId: 'task_1',
          title: 'Missing source fields',
          status: 'pending',
          scope: 'task',
          kind: 'direction_choice',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      ],
      blockers: [
        {
          id: 'blocker_1',
          taskId: 'missing_task',
          title: 'Waiting on approval',
          kind: 'approval',
          detail: null,
          owner: null,
          responsibility: null,
          responsibilityLabel: null,
          sourceContextId: 'missing_source_context',
          status: 'active',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
          resolvedAt: null,
        },
      ],
      dependencies: [
        {
          id: 'dependency_1',
          taskId: 'task_1',
          blockedByTaskId: 'missing_upstream_task',
          reason: 'Waiting on upstream delivery.',
          status: 'active',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
          resolvedAt: null,
        },
      ],
    });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'orphan_task_reference',
        domain: 'task_hierarchy',
        recordId: 'task_orphan_parent',
        field: 'parentTaskId',
        repairRoute: 'decision_manual_review',
      }),
      expect.objectContaining({
        code: 'hierarchy_backlink_mismatch',
        domain: 'task_hierarchy',
        recordId: 'task_child',
        field: 'parentTaskId',
        repairRoute: 'mechanical_auto_repair',
      }),
      expect.objectContaining({
        code: 'orphan_task_reference',
        domain: 'task_file',
        recordId: 'file_1',
        field: 'taskId',
        repairRoute: 'read_only_diagnostic',
      }),
      expect.objectContaining({
        code: 'missing_task_binding',
        domain: 'decision',
        recordId: 'decision_1',
        repairRoute: 'decision_manual_review',
      }),
      expect.objectContaining({
        code: 'missing_canonical_field',
        domain: 'decision',
        recordId: 'decision_legacy',
        field: 'sourceType',
      }),
      expect.objectContaining({
        code: 'orphan_task_reference',
        domain: 'blocker',
        recordId: 'blocker_1',
        field: 'taskId',
      }),
      expect.objectContaining({
        code: 'orphan_source_reference',
        domain: 'blocker',
        recordId: 'blocker_1',
        field: 'sourceContextId',
      }),
      expect.objectContaining({
        code: 'orphan_task_reference',
        domain: 'dependency',
        recordId: 'dependency_1',
        field: 'blockedByTaskId',
      }),
    ]));
    expect(result.summary).toContain('canonicalDataDiagnostics issues=');
    expect(result.safeAutoRepairCount).toBeGreaterThan(0);
    expect(result.manualReviewCount).toBeGreaterThan(0);
    expect(result.readOnlyDiagnosticCount).toBeGreaterThan(0);
  });
});
