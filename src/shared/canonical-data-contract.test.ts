import { describe, expect, it } from 'vitest';

import {
  CANONICAL_DATA_CONTRACTS,
  canonicalFieldsForDomain,
  contractForCanonicalDomain,
  evaluateCanonicalDataDiagnostics,
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
    });

    expect(result.issues).toEqual(expect.arrayContaining([
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
    ]));
    expect(result.summary).toContain('canonicalDataDiagnostics issues=');
    expect(result.manualReviewCount).toBeGreaterThan(0);
    expect(result.readOnlyDiagnosticCount).toBeGreaterThan(0);
  });
});
