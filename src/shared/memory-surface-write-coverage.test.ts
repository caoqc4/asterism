import { describe, expect, it } from 'vitest';

import { memorySurfacePolicies, policyForRuntimeSurface } from './memory-surface-policy.js';
import { memorySurfaceWriteEntrypoints } from './memory-surface-write-coverage.js';

describe('memory surface write coverage', () => {
  it('registers retained write entrypoints with concrete surfaces, policies, and guards', () => {
    for (const entrypoint of memorySurfaceWriteEntrypoints()) {
      expect(entrypoint.id).toMatch(/^[a-z0-9_.]+$/);
      expect(entrypoint.surfaces.length).toBeGreaterThan(0);
      expect(entrypoint.writePolicies.length).toBeGreaterThan(0);
      expect(entrypoint.guards).toContain('simplicity_check');
      expect(entrypoint.note.length).toBeGreaterThan(20);

      const allowedPolicies = new Set(entrypoint.surfaces.map((surface) => policyForRuntimeSurface(surface).writePolicy));
      for (const policy of entrypoint.writePolicies) {
        expect(allowedPolicies.has(policy)).toBe(true);
      }
    }
  });

  it('covers every persistable memory write policy with at least one retained entrypoint', () => {
    const coveredPolicies = new Set(memorySurfaceWriteEntrypoints().flatMap((entrypoint) => entrypoint.writePolicies));

    for (const policy of memorySurfacePolicies()) {
      if (policy.writePolicy === 'do_not_persist') continue;
      expect(coveredPolicies.has(policy.writePolicy)).toBe(true);
    }
  });

  it('keeps recovery memory behind dedicated evaluators', () => {
    const recoveryEntrypoints = memorySurfaceWriteEntrypoints()
      .filter((entrypoint) => entrypoint.surfaces.some((surface) => surface === 'task_state' || surface === 'task_record'));

    expect(recoveryEntrypoints.length).toBeGreaterThan(0);
    for (const entrypoint of recoveryEntrypoints) {
      expect(entrypoint.writePolicies).toContain('dedicated_evaluator');
      expect(entrypoint.guards.some((guard) => (
        guard === 'task_md_update_need'
        || guard === 'task_record_worthiness'
        || guard === 'task_memory_write_apply_plan'
        || guard === 'runtime_surface_routing'
      ))).toBe(true);
    }
  });

  it('does not let source or artifact writers masquerade as ordinary files', () => {
    const sourceEntrypoints = memorySurfaceWriteEntrypoints()
      .filter((entrypoint) => entrypoint.surfaces.some((surface) => surface === 'source_material' || surface === 'ai_output'));
    for (const entrypoint of sourceEntrypoints) {
      expect(entrypoint.writePolicies).toContain('explicit_source_capture');
      expect(entrypoint.writePolicies).not.toContain('ordinary_file_writer');
      expect(entrypoint.guards).toContain('runtime_surface_routing');
    }

    const artifactEntrypoints = memorySurfaceWriteEntrypoints()
      .filter((entrypoint) => entrypoint.surfaces.includes('artifact'));
    for (const entrypoint of artifactEntrypoints) {
      expect(entrypoint.writePolicies).toContain('artifact_writer');
      expect(entrypoint.writePolicies).not.toContain('ordinary_file_writer');
      expect(entrypoint.guards).toContain('artifact_writer');
    }
  });

  it('keeps discussion-only content out of write coverage', () => {
    expect(memorySurfaceWriteEntrypoints().some((entrypoint) => entrypoint.surfaces.includes('discussion'))).toBe(false);
  });

  it('does not duplicate entrypoint ownership ids', () => {
    const ids = memorySurfaceWriteEntrypoints().map((entrypoint) => entrypoint.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
