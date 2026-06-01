import { evaluateSourceMaterialQuality } from './source-material-quality-evaluator.js';
import {
  normalizeCreateSourceContextInput,
} from './runtime-surface-routing.js';
import type {
  CreateSourceContextInput,
  SourceContextCredibility,
  SourceContextRecord,
  UpdateSourceContextInput,
} from './types/source-context.js';

export function normalizeCreateSourceContextMemoryMetadata(
  input: CreateSourceContextInput,
): CreateSourceContextInput {
  const normalized = normalizeCreateSourceContextInput(input);
  const quality = evaluateSourceMaterialQuality(normalized);
  return {
    ...normalized,
    credibility: normalized.credibility ?? quality.credibility,
    containsSensitiveData: normalized.containsSensitiveData ?? quality.sensitive,
  };
}

export function normalizeUpdateSourceContextMemoryMetadata(
  current: SourceContextRecord,
  input: UpdateSourceContextInput,
): UpdateSourceContextInput {
  const merged = {
    ...current,
    ...input,
    title: input.title ?? current.title,
    kind: input.kind ?? current.kind,
    isKey: input.isKey ?? current.isKey,
    uri: input.uri === undefined ? current.uri : input.uri,
    content: input.content === undefined ? current.content : input.content,
    note: input.note === undefined ? current.note : input.note,
    capturedAt: input.capturedAt === undefined ? current.capturedAt : input.capturedAt,
    sourceRole: input.sourceRole ?? current.sourceRole,
    credibility: input.credibility === undefined ? current.credibility : input.credibility,
    isDuplicate: input.isDuplicate ?? current.isDuplicate,
    containsSensitiveData: input.containsSensitiveData ?? current.containsSensitiveData,
  };
  const normalizedRole = normalizeCreateSourceContextInput({
    taskId: current.taskId,
    title: merged.title,
    kind: merged.kind,
    isKey: merged.isKey,
    uri: merged.uri,
    content: merged.content,
    note: merged.note,
    capturedAt: merged.capturedAt,
    runId: current.runId,
    batchId: current.batchId,
    sourceRole: merged.sourceRole,
    credibility: merged.credibility,
    isDuplicate: merged.isDuplicate,
    containsSensitiveData: merged.containsSensitiveData,
  });
  const quality = evaluateSourceMaterialQuality(normalizedRole);
  const nextCredibility: SourceContextCredibility = input.credibility
    ?? current.credibility
    ?? quality.credibility;

  return {
    ...input,
    sourceRole: normalizedRole.sourceRole,
    credibility: nextCredibility,
    isDuplicate: input.isDuplicate ?? current.isDuplicate ?? false,
    containsSensitiveData: input.containsSensitiveData ?? Boolean(current.containsSensitiveData || quality.sensitive),
  };
}
