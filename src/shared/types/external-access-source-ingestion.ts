import type { ConnectorSourceIngestionPlan } from '../connector-source-ingestion.js';
import type { SourceContextRecord } from './source-context.js';

export type ExternalAccessSourceIngestionPreviewInput = {
  taskId: string;
};

export type ExternalAccessSourceIngestionPreview = {
  taskId: string;
  plans: ConnectorSourceIngestionPlan[];
  createCount: number;
  reviewCount: number;
  skipCount: number;
};

export type ExternalAccessSourceIngestionCommitInput = {
  taskId: string;
  planIds: string[];
  confirmed: boolean;
};

export type ExternalAccessSourceIngestionCommitResult = {
  taskId: string;
  created: SourceContextRecord[];
  skippedPlanIds: string[];
};
