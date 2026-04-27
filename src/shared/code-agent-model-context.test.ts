import { describe, expect, it } from 'vitest';

import {
  buildCodeAgentProviderVisibleContextManifest,
  formatCodeAgentProviderVisibleContextManifestForStep,
} from './code-agent-model-context.js';

describe('code agent model context manifest', () => {
  it('summarizes selected workspace files without including prompt content', () => {
    const manifest = buildCodeAgentProviderVisibleContextManifest({
      sourceContexts: [
        { contentIncluded: true, id: 'source_context_1', title: 'Design note' },
        { id: 'source_context_1', title: 'Duplicate note' },
      ],
      workspaceFiles: ['docs/notes.md', ' docs/notes.md ', 'src/app.ts'],
    });

    expect(manifest).toMatchObject({
      providerPromptContentIncluded: true,
      summary: 'Provider-visible context manifest / items=3 / workspace_files=docs/notes.md,src/app.ts / source_context=Design note / artifacts=0 / content=partial',
    });
    expect(manifest.items).toEqual([
      { contentIncluded: true, id: 'docs/notes.md', kind: 'workspace_file', label: 'docs/notes.md' },
      { contentIncluded: true, id: 'src/app.ts', kind: 'workspace_file', label: 'src/app.ts' },
      { contentIncluded: true, id: 'source_context_1', kind: 'source_context', label: 'Design note' },
    ]);
    expect(formatCodeAgentProviderVisibleContextManifestForStep(manifest)).toBe([
      'Provider-visible context manifest / items=3 / workspace_files=docs/notes.md,src/app.ts / source_context=Design note / artifacts=0 / content=partial',
      'providerPromptContent=partial',
      'workspace_file:docs/notes.md:docs/notes.md:content=yes',
      'workspace_file:src/app.ts:src/app.ts:content=yes',
      'source_context:source_context_1:Design note:content=yes',
    ].join('\n'));
  });
});
