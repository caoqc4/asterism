import type { SourceContextKind } from '../../../shared/types/source-context.js';
import type { ExternalAccessConnectorRecord } from '../../../shared/external-access-status.js';
import type {
  ExternalAccessConnectorAdapter,
  ExternalAccessConnectorEvidence,
} from './external-access-status-service.js';

const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com/gmail/v1';
const DEFAULT_GMAIL_QUERY = 'newer_than:7d';
const DEFAULT_GMAIL_MAX_RESULTS = 10;
const MAX_GMAIL_MAX_RESULTS = 25;

type FetchLike = typeof fetch;

export type GmailConnectorAdapterOptions = {
  accessToken: string | null;
  accountLabel?: string | null;
  query?: string | null;
  maxResults?: number | null;
  apiBaseUrl?: string;
  fetchImpl?: FetchLike;
};

type GmailListResponse = {
  messages?: Array<{ id?: unknown; threadId?: unknown }>;
};

type GmailMessageResponse = {
  id?: unknown;
  threadId?: unknown;
  snippet?: unknown;
  internalDate?: unknown;
  payload?: {
    headers?: Array<{ name?: unknown; value?: unknown }>;
  };
};

export class GmailConnectorAdapter implements ExternalAccessConnectorAdapter {
  private readonly fetchImpl: FetchLike;
  private readonly apiBaseUrl: string;

  constructor(private readonly options: GmailConnectorAdapterOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.apiBaseUrl = options.apiBaseUrl ?? GMAIL_API_BASE_URL;
  }

  async getStatus(): Promise<ExternalAccessConnectorRecord> {
    if (!this.options.accessToken?.trim()) {
      return {
        id: 'gmail',
        label: 'Gmail',
        kind: 'email',
        accountLabel: this.options.accountLabel?.trim() || null,
        status: 'pending',
        errorReason: 'Gmail OAuth access token is not configured.',
      };
    }

    return {
      id: 'gmail',
      label: 'Gmail',
      kind: 'email',
      accountLabel: this.options.accountLabel?.trim() || 'OAuth token configured',
      status: 'connected',
      lastSyncAt: null,
    };
  }

  async listEvidence(): Promise<ExternalAccessConnectorEvidence[]> {
    const accessToken = this.options.accessToken?.trim();
    if (!accessToken) return [];

    const messages = await this.listMessages(accessToken);
    const evidence: ExternalAccessConnectorEvidence[] = [];

    for (const message of messages) {
      if (!message.id) continue;
      const detail = await this.getMessage(accessToken, message.id);
      evidence.push(evidenceFromMessage(detail));
    }

    return evidence;
  }

  private async listMessages(accessToken: string): Promise<Array<{ id: string; threadId: string | null }>> {
    const url = new URL(`${this.apiBaseUrl}/users/me/messages`);
    url.searchParams.set('maxResults', String(gmailMaxResults(this.options.maxResults)));
    url.searchParams.set('q', this.options.query?.trim() || DEFAULT_GMAIL_QUERY);

    const response = await this.fetchJson<GmailListResponse>(url, accessToken);
    return (response.messages ?? [])
      .map((message) => ({
        id: stringOrNull(message.id) ?? '',
        threadId: stringOrNull(message.threadId),
      }))
      .filter((message) => Boolean(message.id));
  }

  private getMessage(accessToken: string, messageId: string): Promise<GmailMessageResponse> {
    const url = new URL(`${this.apiBaseUrl}/users/me/messages/${encodeURIComponent(messageId)}`);
    url.searchParams.set('format', 'metadata');
    for (const header of ['Subject', 'From', 'To', 'Date']) {
      url.searchParams.append('metadataHeaders', header);
    }
    return this.fetchJson<GmailMessageResponse>(url, accessToken);
  }

  private async fetchJson<T>(url: URL, accessToken: string): Promise<T> {
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Gmail API request failed: ${response.status} ${response.statusText}`.trim());
    }

    return await response.json() as T;
  }
}

function evidenceFromMessage(message: GmailMessageResponse): ExternalAccessConnectorEvidence {
  const id = stringOrNull(message.id) ?? 'unknown-message';
  const headers = headersByName(message.payload?.headers ?? []);
  const subject = headers.subject ?? '(no subject)';
  const from = headers.from ?? 'unknown sender';
  const to = headers.to ?? 'unknown recipient';
  const date = headers.date ?? null;
  const capturedAt = date ? dateToIso(date) : internalDateToIso(message.internalDate);
  const snippet = stringOrNull(message.snippet);
  const content = [
    `From: ${from}`,
    `To: ${to}`,
    date ? `Date: ${date}` : null,
    snippet ? `Snippet: ${snippet}` : null,
  ].filter(Boolean).join('\n');

  return {
    externalId: id,
    title: subject,
    kind: 'note' satisfies SourceContextKind,
    uri: `gmail://message/${encodeURIComponent(id)}`,
    content,
    note: 'Gmail read-only metadata/snippet capture. Full email bodies are not imported by this connector slice.',
    capturedAt,
    credibility: 'verified',
    isDuplicate: false,
    containsSensitiveData: true,
  };
}

function headersByName(headers: Array<{ name?: unknown; value?: unknown }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    const name = stringOrNull(header.name)?.toLowerCase();
    const value = stringOrNull(header.value);
    if (!name || !value || result[name]) continue;
    result[name] = value;
  }
  return result;
}

function gmailMaxResults(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_GMAIL_MAX_RESULTS;
  return Math.max(1, Math.min(MAX_GMAIL_MAX_RESULTS, Math.trunc(value as number)));
}

function internalDateToIso(value: unknown): string {
  const millis = typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(millis) ? new Date(millis).toISOString() : new Date().toISOString();
}

function dateToIso(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
