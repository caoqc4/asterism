import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { SourceContextCredibility, SourceContextKind } from '../../../shared/types/source-context.js';
import type { ExternalAccessConnectorRecord } from '../../../shared/external-access-status.js';
import type {
  ExternalAccessConnectorAdapter,
  ExternalAccessConnectorEvidence,
} from './external-access-status-service.js';

const MAX_EVIDENCE_FILES = 50;
const MAX_EVIDENCE_BYTES = 128 * 1024;

const SUPPORTED_EXTENSIONS = new Set(['.json', '.md', '.markdown', '.txt']);

type LocalInboxEvidenceJson = {
  externalId?: unknown;
  title?: unknown;
  kind?: unknown;
  uri?: unknown;
  content?: unknown;
  note?: unknown;
  capturedAt?: unknown;
  isKey?: unknown;
  credibility?: unknown;
  isDuplicate?: unknown;
  containsSensitiveData?: unknown;
};

export class LocalInboxConnectorAdapter implements ExternalAccessConnectorAdapter {
  constructor(private readonly inboxDir: string) {}

  async getStatus(): Promise<ExternalAccessConnectorRecord> {
    const directory = this.inboxDir.trim();
    if (!directory) return errorStatus('Local inbox directory is not configured.');

    try {
      const stat = await fs.stat(directory);
      if (!stat.isDirectory()) return errorStatus('Local inbox path is not a directory.');

      const files = await this.listSupportedFiles(directory);
      const latest = files
        .map((file) => file.mtimeMs)
        .sort((left, right) => right - left)[0];

      return {
        id: 'local_inbox',
        label: 'Local Inbox',
        kind: 'other',
        accountLabel: path.basename(directory) || directory,
        status: 'connected',
        lastSyncAt: latest ? new Date(latest).toISOString() : stat.mtime.toISOString(),
      };
    } catch (error) {
      return errorStatus(error instanceof Error ? error.message : 'Unable to read local inbox directory.');
    }
  }

  async listEvidence(input: { taskId: string }): Promise<ExternalAccessConnectorEvidence[]> {
    const status = await this.getStatus();
    if (status.status !== 'connected') return [];

    const files = await this.listSupportedFiles(this.inboxDir);
    const evidence: ExternalAccessConnectorEvidence[] = [];

    for (const file of files.slice(0, MAX_EVIDENCE_FILES)) {
      evidence.push(await this.evidenceFromFile(file, input.taskId));
    }

    return evidence;
  }

  private async listSupportedFiles(directory: string): Promise<Array<{ name: string; fullPath: string; mtimeMs: number }>> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map(async (entry) => {
        const fullPath = path.join(directory, entry.name);
        const stat = await fs.stat(fullPath);
        return {
          name: entry.name,
          fullPath,
          mtimeMs: stat.mtimeMs,
        };
      }));

    return files.sort((left, right) => right.mtimeMs - left.mtimeMs);
  }

  private async evidenceFromFile(
    file: { name: string; fullPath: string; mtimeMs: number },
    taskId: string,
  ): Promise<ExternalAccessConnectorEvidence> {
    const raw = await readBoundedUtf8(file.fullPath);
    const capturedAt = new Date(file.mtimeMs).toISOString();
    const extension = path.extname(file.name).toLowerCase();

    if (extension === '.json') {
      try {
        return evidenceFromJsonFile({
          raw,
          fileName: file.name,
          capturedAt,
        });
      } catch (error) {
        return {
          externalId: file.name,
          title: `Invalid local inbox JSON: ${file.name}`,
          kind: 'note',
          uri: `local-inbox://${encodeURIComponent(file.name)}`,
          note: error instanceof Error ? error.message : 'Invalid local inbox JSON.',
          capturedAt,
          credibility: 'low',
          isDuplicate: false,
          containsSensitiveData: false,
        };
      }
    }

    return {
      externalId: file.name,
      title: titleFromText(raw, file.name),
      kind: extension === '.md' || extension === '.markdown' ? 'doc' : 'note',
      uri: `local-inbox://${encodeURIComponent(file.name)}`,
      content: raw,
      note: `Local inbox file for task ${taskId}: ${file.name}`,
      capturedAt,
      credibility: 'unknown',
      isDuplicate: false,
      containsSensitiveData: false,
    };
  }
}

function errorStatus(errorReason: string): ExternalAccessConnectorRecord {
  return {
    id: 'local_inbox',
    label: 'Local Inbox',
    kind: 'other',
    status: 'error',
    errorReason,
  };
}

async function readBoundedUtf8(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_EVIDENCE_BYTES) {
    throw new Error(`Local inbox evidence is too large: ${path.basename(filePath)}.`);
  }
  return fs.readFile(filePath, 'utf8');
}

function evidenceFromJsonFile(params: {
  raw: string;
  fileName: string;
  capturedAt: string;
}): ExternalAccessConnectorEvidence {
  const parsed = JSON.parse(params.raw) as LocalInboxEvidenceJson;
  const content = stringOrNull(parsed.content);
  const note = stringOrNull(parsed.note);

  return {
    externalId: stringOrNull(parsed.externalId) ?? params.fileName,
    title: stringOrNull(parsed.title) ?? titleFromText(content ?? note ?? '', params.fileName),
    kind: sourceKind(parsed.kind) ?? 'doc',
    uri: stringOrNull(parsed.uri) ?? `local-inbox://${encodeURIComponent(params.fileName)}`,
    content,
    note,
    capturedAt: stringOrNull(parsed.capturedAt) ?? params.capturedAt,
    isKey: booleanOrUndefined(parsed.isKey),
    credibility: credibility(parsed.credibility) ?? 'unknown',
    isDuplicate: booleanOrUndefined(parsed.isDuplicate) ?? false,
    containsSensitiveData: booleanOrUndefined(parsed.containsSensitiveData) ?? false,
  };
}

function titleFromText(raw: string, fileName: string): string {
  const heading = raw.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));
  if (heading) return heading.replace(/^#\s+/, '').trim() || fileName;

  const firstLine = raw.split(/\r?\n/).find((line) => line.trim())?.trim();
  return firstLine ? firstLine.slice(0, 80) : fileName;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function sourceKind(value: unknown): SourceContextKind | null {
  if (
    value === 'link'
    || value === 'doc'
    || value === 'issue'
    || value === 'pr'
    || value === 'website_list'
    || value === 'note'
  ) {
    return value;
  }
  return null;
}

function credibility(value: unknown): SourceContextCredibility | null {
  if (value === 'verified' || value === 'unknown' || value === 'low') return value;
  return null;
}
