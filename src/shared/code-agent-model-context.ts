export type CodeAgentProviderVisibleContextKind =
  | 'artifact'
  | 'source_context'
  | 'workspace_file';

export type CodeAgentProviderVisibleContextItem = {
  artifactKind?: string | null;
  contentIncluded: boolean;
  id: string;
  kind: CodeAgentProviderVisibleContextKind;
  label: string;
  sourceId?: string | null;
  sourceType?: string | null;
};

export type CodeAgentProviderVisibleContextManifest = {
  items: CodeAgentProviderVisibleContextItem[];
  providerPromptContentIncluded: boolean;
  summary: string;
};

export function buildCodeAgentProviderVisibleContextManifest(params: {
  artifacts?: Array<{ id: string; kind?: string | null; sourceId?: string | null; sourceType?: string | null; title: string }>;
  sourceContexts?: Array<{ contentIncluded?: boolean; id: string; title: string }>;
  workspaceFiles?: string[];
}): CodeAgentProviderVisibleContextManifest {
  const workspaceFiles = normalizeSelectedValues(params.workspaceFiles ?? []);
  const artifacts = (params.artifacts ?? [])
    .map((item) => ({
      kind: item.kind?.trim() || null,
      id: item.id.trim(),
      sourceId: item.sourceId?.trim() || null,
      sourceType: item.sourceType?.trim() || null,
      title: item.title.trim(),
    }))
    .filter((item, index, items) =>
      item.id && items.findIndex((candidate) => candidate.id === item.id) === index);
  const sourceContexts = (params.sourceContexts ?? [])
    .map((item) => ({
      contentIncluded: item.contentIncluded === true,
      id: item.id.trim(),
      title: item.title.trim(),
    }))
    .filter((item, index, items) =>
      item.id && items.findIndex((candidate) => candidate.id === item.id) === index);
  const items: CodeAgentProviderVisibleContextItem[] = [
    ...workspaceFiles.map((file) => ({
      contentIncluded: true,
      id: file,
      kind: 'workspace_file' as const,
      label: file,
    })),
    ...sourceContexts.map((item) => ({
      contentIncluded: item.contentIncluded,
      id: item.id,
      kind: 'source_context' as const,
      label: item.title || item.id,
    })),
    ...artifacts.map((item) => ({
      artifactKind: item.kind,
      contentIncluded: false,
      id: item.id,
      kind: 'artifact' as const,
      label: item.title || item.id,
      sourceId: item.sourceId,
      sourceType: item.sourceType,
    })),
  ];

  return {
    items,
    providerPromptContentIncluded: items.some((item) => item.contentIncluded),
    summary: formatCodeAgentProviderVisibleContextManifestSummary(items),
  };
}

export function formatCodeAgentProviderVisibleContextManifestForStep(
  manifest: CodeAgentProviderVisibleContextManifest,
): string {
  return [
    manifest.summary,
    `providerPromptContent=${manifest.providerPromptContentIncluded ? 'partial' : 'no'}`,
    ...manifest.items.map(formatCodeAgentProviderVisibleContextItemForStep),
  ].join('\n');
}

function formatCodeAgentProviderVisibleContextItemForStep(
  item: CodeAgentProviderVisibleContextItem,
): string {
  const metadata = item.kind === 'artifact'
    ? [
        item.artifactKind ? `artifactKind=${item.artifactKind}` : null,
        item.sourceType ? `sourceType=${item.sourceType}` : null,
        item.sourceId ? `sourceId=${item.sourceId}` : null,
      ].filter((field): field is string => Boolean(field))
    : [];

  return [
    `${item.kind}:${item.id}:${item.label}:content=${item.contentIncluded ? 'yes' : 'no'}`,
    ...metadata,
  ].join(':');
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
    `content=${items.some((item) => item.contentIncluded) ? 'partial' : 'none'}`,
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
