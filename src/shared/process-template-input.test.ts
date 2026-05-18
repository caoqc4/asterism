import { describe, expect, it } from 'vitest';

import {
  normalizeCreateProcessTemplateInput,
  normalizeUpdateProcessTemplateInput,
} from './process-template-input.js';

describe('process template input', () => {
  it('normalizes create input before persistence', () => {
    expect(normalizeCreateProcessTemplateInput({
      title: ' Launch checklist ',
      summary: '  ',
      content: ' 1. Check scope ',
      kind: 'checklist',
      tags: [' launch ', 'launch', ''],
    })).toEqual({
      title: 'Launch checklist',
      summary: null,
      content: '1. Check scope',
      kind: 'checklist',
      tags: ['launch'],
    });
  });

  it('rejects blank required create fields', () => {
    expect(() => normalizeCreateProcessTemplateInput({
      title: ' ',
      content: '1. Check scope',
      kind: 'checklist',
    })).toThrow('Process template title is required.');
  });

  it('rejects invalid process template kinds', () => {
    expect(() => normalizeCreateProcessTemplateInput({
      title: 'Launch checklist',
      content: '1. Check scope',
      kind: 'habit' as never,
    })).toThrow(/kind must be one of/);
  });

  it('normalizes update input and rejects explicit blank updates', () => {
    expect(normalizeUpdateProcessTemplateInput({
      id: ' process_template_1 ',
      summary: ' Updated ',
      tags: ['a', ' a '],
    })).toEqual({
      id: 'process_template_1',
      summary: 'Updated',
      tags: ['a'],
    });

    expect(() => normalizeUpdateProcessTemplateInput({
      id: 'process_template_1',
      content: ' ',
    })).toThrow('Process template content is required.');
  });
});
