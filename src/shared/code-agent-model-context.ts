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
  sourceContexts?: Array<{ id: string; title: string }>;
  workspaceFiles?: string[];
}): CodeAgentProviderVisibleContextManifest {
  const workspaceFiles = normalizeSelectedValues(params.workspaceFiles ?? []);
  const sourceContexts = (params.sourceContexts ?? [])
    .map((item) => ({
      id: item.id.trim(),
      title: item.title.trim(),
    }))
    .filter((item, index, items) =>
      item.id && items.findIndex((candidate) => candidate.id === item.id) === index);
  const items: CodeAgentProviderVisibleContextItem[] = [
    ...workspaceFiles.map((file) => ({
      id: file,
      kind: 'workspace_file' as const,
      label: file,
    })),
    ...sourceContexts.map((item) => ({
      id: item.id,
      kind: 'source_context' as const,
      label: item.title || item.id,
    })),
  ];

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
    ...manifest.items.map((item) => `${item.kind}:${item.id}:${item.label}`),
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
    sourceContexts.length
      ? `source_context=${sourceContexts.map((item) => item.label).join(',')}`
      : 'source_context=0',
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
