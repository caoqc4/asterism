export type SandboxPatchPromotionStatus = 'applied' | 'blocked' | 'pending';

export type SandboxPatchPromotionRecord = {
  id: string;
  checkpointId: string;
  runId: string;
  taskId: string;
  artifactId: string;
  sourceId: string;
  decisionId: string;
  patchDigest: string;
  expectedFiles: string[];
  status: SandboxPatchPromotionStatus;
  auditSummary: string | null;
  blockedReasons: string[];
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
};

export type CreateSandboxPatchPromotionInput = {
  checkpointId: string;
  runId: string;
  taskId: string;
  artifactId: string;
  sourceId: string;
  decisionId: string;
  patchDigest: string;
  expectedFiles: string[];
  auditSummary?: string | null;
};

export type ApplySandboxPatchPromotionInput = {
  checkpointId: string;
  operatorConfirmed: boolean;
};

export type ApplySandboxPatchPromotionResult =
  | {
      auditSummary: string;
      promotion: SandboxPatchPromotionRecord;
      status: 'already_applied';
      touchedFiles: string[];
    }
  | {
      auditSummary: string;
      promotion: SandboxPatchPromotionRecord;
      status: 'applied';
      touchedFiles: string[];
    }
  | {
      auditSummary: string;
      blockedReasons: string[];
      promotion?: SandboxPatchPromotionRecord;
      status: 'blocked';
      touchedFiles: string[];
    };
