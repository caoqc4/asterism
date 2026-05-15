import { describe, expect, it } from 'vitest';

import { evaluateSelectedFileRelevance } from './selected-file-relevance.js';

describe('selected file relevance', () => {
  it('includes Task.md and Task Records as explicit recovery context', () => {
    expect(evaluateSelectedFileRelevance({ path: 'Task.md', contentPreview: '# Task' })).toMatchObject({
      decision: 'include',
      reason: 'task_md',
    });
    expect(evaluateSelectedFileRelevance({
      path: 'Task Records/phase-closeout.md',
      contentPreview: '# Closeout',
    })).toMatchObject({
      decision: 'include',
      reason: 'task_record',
    });
  });

  it('warns on generated output and files without preview', () => {
    expect(evaluateSelectedFileRelevance({
      kind: 'ai_output',
      path: 'AI 项目拆解自检.md',
      contentPreview: 'draft',
    })).toMatchObject({
      decision: 'caution',
      reason: 'generated_output',
    });

    expect(evaluateSelectedFileRelevance({ path: 'notes.md' })).toMatchObject({
      decision: 'caution',
      reason: 'empty_preview',
    });
  });

  it('excludes archived paths by default', () => {
    expect(evaluateSelectedFileRelevance({
      path: 'Archive/old-note.md',
      contentPreview: 'old',
    })).toMatchObject({
      decision: 'exclude',
      reason: 'archived_path',
    });
  });

  it('includes ordinary explicitly selected files with preview', () => {
    expect(evaluateSelectedFileRelevance({
      path: 'research.md',
      contentPreview: 'research',
    })).toMatchObject({
      decision: 'include',
      reason: 'selected_file',
    });
  });
});
