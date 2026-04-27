export type CodeAgentProviderVisibleContextKind =
  | 'artifact'
  | 'source_context'
  | 'workspace_file';

export type CodeAgentProviderVisibleContextItem = {
  id: string;
  kind: CodeAgentProviderVisibleContextKind;
  label: string;
};

export type CodeAgentProviderVisibleContextManifest = {
  items: CodeAgentProviderVisibleContextItem[];
  providerPromptContentIncluded: false;
  summary: string;
};

export function buildCodeAgentProviderVisibleContextManifest(params: {
  workspaceFiles?: string[];
}): CodeAgentProviderVisibleContextManifest {
  const workspaceFiles = normalizeSelectedValues(params.workspaceFiles ?? []);
  const items: CodeAgentProviderVisibleContextItem[] = workspaceFiles.map((file) => ({
    id: file,
    kind: 'workspace_file',
    label: file,
  }));

  return {
    items,
    providerPromptContentIncluded: false,
    summary: formatCodeAgentProviderVisibleContextManifestSummary(items),
  };
}

export function formatCodeAgentProviderVisibleContextManifestForStep(
  manifest: CodeAgentProviderVisibleContextManifest,
): string {
  return [
    manifest.summary,
    'providerPromptContent=no',
    ...manifest.items.map((item) => `${item.kind}:${item.id}`),
  ].join('\n');
}

export function formatCodeAgentProviderVisibleContextManifestSummary(
  items: CodeAgentProviderVisibleContextItem[],
): string {
  const workspaceFiles = items
    .filter((item) => item.kind === 'workspace_file')
    .map((item) => item.label);
  const sourceContexts = items.filter((item) => item.kind === 'source_context');
  const artifacts = items.filter((item) => item.kind === 'artifact');

  return [
    'Provider-visible context manifest',
    `items=${items.length}`,
    workspaceFiles.length ? `workspace_files=${workspaceFiles.join(',')}` : 'workspace_files=0',
    `source_context=${sourceContexts.length}`,
    `artifacts=${artifacts.length}`,
  ].join(' / ');
}

function normalizeSelectedValues(values: string[]): string[] {
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return normalized;
}
