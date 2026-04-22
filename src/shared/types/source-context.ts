export type SourceContextKind = 'link' | 'doc' | 'issue' | 'pr' | 'website_list' | 'note';

export type SourceContextStatus = 'active' | 'archived';

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
