import {
  evaluateSourceMaterialQuality,
  type SourceMaterialQualityEvaluation,
} from './source-material-quality-evaluator.js';
import { normalizeCreateSourceContextMemoryMetadata } from './source-context-memory-metadata.js';
import type {
  CreateSourceContextInput,
  SourceContextCredibility,
  SourceContextKind,
} from './types/source-context.js';

export type ConnectorSourceIngestionInput = {
  taskId: string;
  connectorId: string;
  connectorName: string;
  externalId?: string | null;
  title: string;
  kind?: SourceContextKind;
  uri?: string | null;
  content?: string | null;
  note?: string | null;
  capturedAt?: string | null;
  isKey?: boolean;
  credibility?: SourceContextCredibility | null;
  isDuplicate?: boolean;
  containsSensitiveData?: boolean;
};

export type ConnectorSourceIngestionDecision = 'create' | 'review' | 'skip';

export type ConnectorSourceTrace = {
  connectorId: string;
  connectorName: string;
  externalId: string | null;
  originLabel: string;
};

export type ConnectorSourceIngestionPlan = {
  decision: ConnectorSourceIngestionDecision;
  trace: ConnectorSourceTrace;
  sourceContext: CreateSourceContextInput;
  quality: SourceMaterialQualityEvaluation;
  reviewReason: string | null;
};

export function planConnectorSourceIngestion(
  input: ConnectorSourceIngestionInput,
): ConnectorSourceIngestionPlan {
  const trace = buildConnectorSourceTrace(input);
  const capturedAt = input.capturedAt?.trim();
  if (!input.taskId.trim()) {
    throw new Error('Connector source ingestion requires taskId.');
  }
  if (!input.title.trim()) {
    throw new Error('Connector source ingestion requires title.');
  }
  if (!capturedAt) {
    throw new Error('Connector source ingestion requires capturedAt.');
  }
  const sourceContext = normalizeCreateSourceContextMemoryMetadata({
    taskId: input.taskId.trim(),
    title: input.title.trim(),
    kind: input.kind ?? 'doc',
    isKey: input.isKey ?? false,
    uri: input.uri ?? null,
    content: input.content ?? null,
    note: withConnectorTraceNote(input.note, trace),
    capturedAt,
    batchId: connectorBatchId(trace),
    sourceRole: 'raw',
    credibility: input.credibility ?? null,
    isDuplicate: input.isDuplicate ?? false,
    containsSensitiveData: input.containsSensitiveData ?? false,
  });
  const quality = evaluateSourceMaterialQuality(sourceContext);
  const decision = quality.decision === 'exclude'
    ? 'skip'
    : quality.decision === 'caution'
      ? 'review'
      : 'create';

  return {
    decision,
    trace,
    sourceContext,
    quality,
    reviewReason: decision === 'review' ? quality.summary : null,
  };
}

function buildConnectorSourceTrace(input: ConnectorSourceIngestionInput): ConnectorSourceTrace {
  const connectorId = input.connectorId.trim();
  const connectorName = input.connectorName.trim();
  if (!connectorId) {
    throw new Error('Connector source ingestion requires connectorId.');
  }
  if (!connectorName) {
    throw new Error('Connector source ingestion requires connectorName.');
  }

  return {
    connectorId,
    connectorName,
    externalId: input.externalId?.trim() || null,
    originLabel: input.externalId?.trim()
      ? `${connectorName}:${input.externalId.trim()}`
      : connectorName,
  };
}

function connectorBatchId(trace: ConnectorSourceTrace): string {
  return trace.externalId
    ? `connector:${trace.connectorId}:${trace.externalId}`
    : `connector:${trace.connectorId}`;
}

function withConnectorTraceNote(note: string | null | undefined, trace: ConnectorSourceTrace): string {
  const base = note?.trim();
  const connectorNote = `Connector source: ${trace.originLabel}`;
  return base ? `${base}\n${connectorNote}` : connectorNote;
}
