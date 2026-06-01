import { describe, expect, it } from 'vitest';

import {
  extractJsonObjectFromText,
  normalizeProjectDecompositionDraft,
} from './project-decomposition-draft.js';

describe('project decomposition draft contract', () => {
  it('extracts JSON from fenced model output', () => {
    expect(extractJsonObjectFromText('```json\n{"parentGoal":"上线"}\n```')).toEqual({
      parentGoal: '上线',
    });
  });

  it('normalizes model output into bounded project subtask drafts', () => {
    const result = normalizeProjectDecompositionDraft({
      parentGoal: '上线小程序',
      subtasks: [
        {
          title: '需求与范围确认',
          summary: '确认范围',
          acceptanceCriteria: '范围文档可验收',
          dependency: '',
          rationale: '独立边界清楚',
        },
      ],
      review: '粒度合适',
      nextStep: '请确认创建',
    });

    expect(result).toEqual({
      parentGoal: '上线小程序',
      subtasks: [
        {
          title: '需求与范围确认',
          summary: '确认范围',
          acceptanceCriteria: '范围文档可验收',
          dependency: null,
          rationale: '独立边界清楚',
        },
      ],
      review: '粒度合适',
      nextStep: '请确认创建',
    });
  });

  it('requires at least one subtask draft', () => {
    expect(() => normalizeProjectDecompositionDraft({ subtasks: [] }))
      .toThrow('Project decomposition response did not include subtasks.');
  });
});
