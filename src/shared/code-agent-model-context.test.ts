import { describe, expect, it } from 'vitest';

import {
  buildCodeAgentProviderVisibleContextManifest,
  formatCodeAgentProviderVisibleContextManifestForStep,
} from './code-agent-model-context.js';

describe('code agent model context manifest', () => {
  it('summarizes selected workspace files without including prompt content', () => {
    const manifest = buildCodeAgentProviderVisibleContextManifest({
      artifacts: [
        { id: 'artifact_1', kind: 'run_output', sourceId: 'run_prior', sourceType: 'run', title: 'Prior run output' },
        { id: 'artifact_1', kind: 'patch', sourceId: 'run_other', sourceType: 'run', title: 'Duplicate artifact' },
      ],
      sourceContexts: [
        { contentIncluded: true, id: 'source_context_1', title: 'Design note' },
        { id: 'source_context_1', title: 'Duplicate note' },
      ],
      workspaceFiles: ['docs/notes.md', ' docs/notes.md ', 'src/app.ts'],
    });

    expect(manifest).toMatchObject({
      providerPromptContentIncluded: true,
      summary: 'Provider-visible context manifest / items=4 / workspace_files=docs/notes.md,src/app.ts / source_context=Design note / artifacts=1 / content=partial',
    });
    expect(manifest.items).toEqual([
      { contentIncluded: true, id: 'docs/notes.md', kind: 'workspace_file', label: 'docs/notes.md' },
      { contentIncluded: true, id: 'src/app.ts', kind: 'workspace_file', label: 'src/app.ts' },
      { contentIncluded: true, id: 'source_context_1', kind: 'source_context', label: 'Design note' },
      {
        artifactKind: 'run_output',
        contentIncluded: false,
        id: 'artifact_1',
        kind: 'artifact',
        label: 'Prior run output',
        sourceId: 'run_prior',
        sourceType: 'run',
      },
    ]);
    expect(formatCodeAgentProviderVisibleContextManifestForStep(manifest)).toBe([
      'Provider-visible context manifest / items=4 / workspace_files=docs/notes.md,src/app.ts / source_context=Design note / artifacts=1 / content=partial',
      'providerPromptContent=partial',
      'workspace_file:docs/notes.md:docs/notes.md:content=yes',
      'workspace_file:src/app.ts:src/app.ts:content=yes',
      'source_context:source_context_1:Design note:content=yes',
      'artifact:artifact_1:Prior run output:content=no:artifactKind=run_output:sourceType=run:sourceId=run_prior',
    ].join('\n'));
  });
});
