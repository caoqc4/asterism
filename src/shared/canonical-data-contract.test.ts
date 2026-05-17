import { describe, expect, it } from 'vitest';

import {
  CANONICAL_DATA_CONTRACTS,
  canonicalFieldsForDomain,
  contractForCanonicalDomain,
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
});
