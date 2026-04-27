import type { SourceContextRecord } from '../../../shared/types/source-context.js';

export type CodeAgentSourceContextItem = {
  content: string;
  id: string;
  title: string;
};

export type CodeAgentSourceContextSnapshot = {
  items: CodeAgentSourceContextItem[];
  summary: string;
};

export type CollectCodeAgentSourceContextResult =
  | {
      snapshot: CodeAgentSourceContextSnapshot;
      status: 'collected';
      summary: string;
    }
  | {
      blockedReasons: string[];
      status: 'blocked';
      summary: string;
    };

const DEFAULT_MAX_ITEMS = 3;
const DEFAULT_MAX_ITEM_BYTES = 8_000;
const DEFAULT_MAX_TOTAL_BYTES = 16_000;

export function collectCodeAgentSourceContext(params: {
  includeContent: boolean;
  maxItemBytes?: number;
  maxItems?: number;
  maxTotalBytes?: number;
  sourceContexts: SourceContextRecord[];
}): CollectCodeAgentSourceContextResult {
  if (!params.includeContent) {
    return {
      snapshot: {
        items: [],
        summary: 'Code Agent source context content was not included.',
      },
      status: 'collected',
      summary: 'Code Agent source context content collected / items=0 / bytes=0',
    };
  }

  const maxItems = params.maxItems ?? DEFAULT_MAX_ITEMS;
  const maxItemBytes = params.maxItemBytes ?? DEFAULT_MAX_ITEM_BYTES;
  const maxTotalBytes = params.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const blockedReasons: string[] = [];
  const selected = params.sourceContexts.slice(0, maxItems);

  if (params.sourceContexts.length === 0) {
    blockedReasons.push('Code Agent source context content requires at least one selected source context.');
  }

  if (params.sourceContexts.length > maxItems) {
    blockedReasons.push('Code Agent source context content requested too many items.');
  }

  const items: CodeAgentSourceContextItem[] = [];
  let totalBytes = 0;

  for (const sourceContext of selected) {
    const rendered = renderSourceContextSnapshot(sourceContext);
    const bytes = Buffer.byteLength(rendered, 'utf8');

    if (bytes > maxItemBytes) {
      blockedReasons.push(`Code Agent source context content exceeds per-item size limit: ${sourceContext.id}.`);
      continue;
    }

    totalBytes += bytes;
    items.push({
      content: rendered,
      id: sourceContext.id,
      title: sourceContext.title,
    });
  }

  if (totalBytes > maxTotalBytes) {
    blockedReasons.push('Code Agent source context content exceeds total size limit.');
  }

  if (blockedReasons.length) {
    return {
      blockedReasons,
      status: 'blocked',
      summary: `Code Agent source context content blocked: ${blockedReasons.join(' ')}`,
    };
  }

  return {
    snapshot: {
      items,
      summary: `Code Agent source context content collected ${items.length} item(s).`,
    },
    status: 'collected',
    summary: `Code Agent source context content collected / items=${items.length} / bytes=${totalBytes}`,
  };
}

export function formatCodeAgentSourceContextForPrompt(
  snapshot: CodeAgentSourceContextSnapshot | null | undefined,
): string[] {
  if (!snapshot?.items.length) {
    return [
      'Taskplane source context:',
      'No source-context content was included for this run.',
    ];
  }

  return [
    'Taskplane source context:',
    snapshot.summary,
    ...snapshot.items.flatMap((item) => [
      `--- source context: ${item.title} (${item.id})`,
      item.content,
      `--- end source context: ${item.id}`,
    ]),
  ];
}

function renderSourceContextSnapshot(sourceContext: SourceContextRecord): string {
  return [
    `title: ${sourceContext.title}`,
    `kind: ${sourceContext.kind}`,
    sourceContext.uri ? `uri: ${sourceContext.uri}` : null,
    sourceContext.note ? `note:\n${sourceContext.note}` : null,
    sourceContext.content ? `content:\n${sourceContext.content}` : null,
  ].filter((line): line is string => Boolean(line)).join('\n');
}
