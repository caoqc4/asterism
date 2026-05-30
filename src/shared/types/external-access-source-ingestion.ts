import type { ConnectorSourceIngestionPlan } from '../connector-source-ingestion.js';
import type { BusinessLineRecord } from './business-line.js';
import type { SourceContextRecord } from './source-context.js';

export type ExternalAccessSourceIngestionPreviewInput = {
  taskId: string;
  businessLineId?: string | null;
};

export type ExternalAccessBusinessLineRecordCandidate = {
  businessLineId: string;
  planId: string;
  sourceLabel: string;
  summary: string;
  confidence: number;
  shouldAffectFutureContext: false;
  reviewRequired: true;
};

export type ExternalAccessSourceIngestionPreview = {
  taskId: string;
  businessLineId?: string | null;
  plans: ConnectorSourceIngestionPlan[];
  businessLineRecordCandidates: ExternalAccessBusinessLineRecordCandidate[];
  createCount: number;
  reviewCount: number;
  skipCount: number;
};

export type ExternalAccessSourceIngestionCommitInput = {
  taskId: string;
  businessLineId?: string | null;
  planIds: string[];
  confirmed: boolean;
};

export type ExternalAccessSourceIngestionCommitResult = {
  taskId: string;
  businessLineId?: string | null;
  created: SourceContextRecord[];
  createdBusinessRecords: BusinessLineRecord[];
  skippedPlanIds: string[];
};
