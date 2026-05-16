export type SourceContextKind = 'link' | 'doc' | 'issue' | 'pr' | 'website_list' | 'note';

export type SourceContextStatus = 'active' | 'archived';

export type SourceContextRole = 'raw' | 'digest' | 'stable_reference';

export type SourceContextCredibility = 'verified' | 'unknown' | 'low';

export type SourceContextRecord = {
  id: string;
  taskId: string;
  title: string;
  kind: SourceContextKind;
  isKey: boolean;
  uri: string | null;
  content: string | null;
  note: string | null;
  status: SourceContextStatus;
  capturedAt?: string;
  runId?: string | null;
  batchId?: string | null;
  sourceRole?: SourceContextRole;
  credibility?: SourceContextCredibility | null;
  isDuplicate?: boolean;
  containsSensitiveData?: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type CreateSourceContextInput = {
  taskId: string;
  title: string;
  kind: SourceContextKind;
  isKey?: boolean;
  uri?: string | null;
  content?: string | null;
  note?: string | null;
  capturedAt?: string | null;
  runId?: string | null;
  batchId?: string | null;
  sourceRole?: SourceContextRole;
  credibility?: SourceContextCredibility | null;
  isDuplicate?: boolean;
  containsSensitiveData?: boolean;
};

export type UpdateSourceContextInput = {
  id: string;
  title?: string;
  kind?: SourceContextKind;
  isKey?: boolean;
  uri?: string | null;
  content?: string | null;
  note?: string | null;
};
