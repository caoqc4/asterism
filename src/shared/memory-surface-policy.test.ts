import { describe, expect, it } from 'vitest';

import {
  classifyMemorySurfaceCandidate,
  memorySurfacePolicies,
  policyForRuntimeSurface,
} from './memory-surface-policy.js';

describe('memory surface policy', () => {
  it('defines one policy for every runtime surface kind', () => {
    expect(memorySurfacePolicies().map((policy) => policy.surface)).toEqual([
      'task_state',
      'task_record',
      'source_material',
      'ai_output',
      'artifact',
      'task_file',
      'decision',
      'run_step',
      'work_habit',
      'discussion',
    ]);
  });

  it('treats Task.md and Task Records as dedicated recovery memory', () => {
    expect(classifyMemorySurfaceCandidate({ kind: 'local_file', path: 'Task.md' })).toMatchObject({
      surface: 'task_state',
      category: 'recovery_memory',
      writePolicy: 'dedicated_evaluator',
      reusePolicy: 'read_for_task_resume',
      requiresTaskContext: true,
    });

    expect(classifyMemorySurfaceCandidate({ kind: 'local_file', path: 'Task Records/phase.md' })).toMatchObject({
      surface: 'task_record',
      category: 'recovery_memory',
      writePolicy: 'dedicated_evaluator',
      reusePolicy: 'read_for_task_resume',
      requiresTaskContext: true,
    });
  });

  it('separates external evidence sources from AI-generated output', () => {
    expect(classifyMemorySurfaceCandidate({
      kind: 'source',
      sourceRole: 'raw',
      name: '客户访谈原文',
      sourceUri: 'https://example.com/interview',
    })).toMatchObject({
      surface: 'source_material',
      category: 'evidence_source',
      writePolicy: 'explicit_source_capture',
      reusePolicy: 'read_as_evidence_with_quality_gate',
      requiresQualityMetadata: true,
    });

    expect(classifyMemorySurfaceCandidate({
      kind: 'source',
      sourceRole: 'digest',
      name: 'AI 项目拆解自检',
    })).toMatchObject({
      surface: 'ai_output',
      category: 'generated_output',
      reusePolicy: 'read_as_generated_context',
      requiresQualityMetadata: false,
    });
  });

  it('does not promote ordinary file paths to artifacts or sources', () => {
    expect(classifyMemorySurfaceCandidate({
      kind: 'local_file',
      path: 'Artifacts/report.md',
      name: 'report.md',
    })).toMatchObject({
      surface: 'task_file',
      category: 'supporting_file',
      writePolicy: 'ordinary_file_writer',
    });
  });

  it('requires explicit artifact metadata for artifact memory', () => {
    expect(classifyMemorySurfaceCandidate({
      kind: 'artifact',
      artifactKind: 'note',
      name: '发布检查清单',
    })).toMatchObject({
      surface: 'artifact',
      category: 'user_artifact',
      writePolicy: 'artifact_writer',
      reusePolicy: 'read_as_output_reference',
    });
  });

  it('keeps decision, run step, work habit, and discussion policies distinct', () => {
    expect(policyForRuntimeSurface('decision')).toMatchObject({
      category: 'decision_boundary',
      reusePolicy: 'block_until_resolved',
      requiresTaskContext: false,
    });
    expect(policyForRuntimeSurface('run_step')).toMatchObject({
      category: 'execution_event',
      writePolicy: 'run_step_writer',
    });
    expect(policyForRuntimeSurface('work_habit')).toMatchObject({
      category: 'cross_task_rule',
      writePolicy: 'work_habit_proposal',
    });
    expect(policyForRuntimeSurface('discussion')).toMatchObject({
      category: 'discussion_only',
      writePolicy: 'do_not_persist',
      reusePolicy: 'do_not_reuse',
    });
  });
});
