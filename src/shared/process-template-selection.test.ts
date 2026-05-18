import { describe, expect, it } from 'vitest';

import { normalizeProcessTemplateSelection } from './process-template-selection.js';

describe('process template selection', () => {
  const candidates = [
    { id: 'template_1', title: 'Risk review' },
    { id: 'template_2', title: 'Launch checklist' },
  ];

  it('keeps selected templates only when shouldUse is true and ids match candidates', () => {
    expect(normalizeProcessTemplateSelection({
      candidates,
      shouldUse: true,
      selectedTemplateIds: ['template_2'],
      reason: 'The launch checklist fits the next step.',
    })).toEqual({
      shouldUse: true,
      selectedTemplates: [{ id: 'template_2', title: 'Launch checklist' }],
      reason: 'The launch checklist fits the next step.',
    });
  });

  it('clears selected templates when the model says not to use templates', () => {
    expect(normalizeProcessTemplateSelection({
      candidates,
      shouldUse: false,
      selectedTemplateIds: ['template_1'],
      reason: 'No clear benefit.',
    })).toEqual({
      shouldUse: false,
      selectedTemplates: [],
      reason: 'No clear benefit.',
    });
  });

  it('clears selection when ids do not match candidates', () => {
    expect(normalizeProcessTemplateSelection({
      candidates,
      shouldUse: true,
      selectedTemplateIds: ['missing'],
      reason: 'Model selected a missing template.',
    })).toEqual({
      shouldUse: false,
      selectedTemplates: [],
      reason: 'Model selected a missing template.',
    });
  });
});
