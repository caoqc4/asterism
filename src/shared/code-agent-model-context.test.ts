import { describe, expect, it } from 'vitest';

import {
  buildCodeAgentProviderVisibleContextManifest,
  formatCodeAgentProviderVisibleContextManifestForStep,
} from './code-agent-model-context.js';

describe('code agent model context manifest', () => {
  it('summarizes selected workspace files without including prompt content', () => {
    const manifest = buildCodeAgentProviderVisibleContextManifest({
      workspaceFiles: ['docs/notes.md', ' docs/notes.md ', 'src/app.ts'],
    });

    expect(manifest).toMatchObject({
      providerPromptContentIncluded: false,
      summary: 'Provider-visible context manifest / items=2 / workspace_files=docs/notes.md,src/app.ts / source_context=0 / artifacts=0',
    });
    expect(manifest.items).toEqual([
      { id: 'docs/notes.md', kind: 'workspace_file', label: 'docs/notes.md' },
      { id: 'src/app.ts', kind: 'workspace_file', label: 'src/app.ts' },
    ]);
    expect(formatCodeAgentProviderVisibleContextManifestForStep(manifest)).toBe([
      'Provider-visible context manifest / items=2 / workspace_files=docs/notes.md,src/app.ts / source_context=0 / artifacts=0',
      'providerPromptContent=no',
      'workspace_file:docs/notes.md',
      'workspace_file:src/app.ts',
    ].join('\n'));
  });
});
