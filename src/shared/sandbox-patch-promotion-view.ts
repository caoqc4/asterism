import type { DecisionRecord, DecisionStatus } from './types/decision.js';
import type { RunCheckpointStatus, RunDetailRecord } from './types/run.js';
import { parseRunCheckpointPayload } from './types/run-checkpoint-payload.js';

export type SandboxPatchPromotionViewTone = 'blocked' | 'completed' | 'pending' | 'ready';

export type SandboxPatchPromotionView = {
  artifactId: string;
  checkpointId: string;
  checkpointStatus: RunCheckpointStatus;
  decisionId: string | null;
  decisionStatus: DecisionStatus | null;
  detail: string;
  expectedFiles: string[];
  label: string;
  title: string;
  tone: SandboxPatchPromotionViewTone;
};

export function projectSandboxPatchPromotionViews(input: {
  decisions: DecisionRecord[];
  runDetails: RunDetailRecord[];
}): SandboxPatchPromotionView[] {
  const decisionsById = new Map(input.decisions.map((decision) => [decision.id, decision]));
  const decisionsByCheckpoint = new Map(
    input.decisions
      .filter((decision) => decision.sourceType === 'agent_checkpoint' && decision.sourceId)
      .map((decision) => [decision.sourceId!, decision]),
  );
  const views: SandboxPatchPromotionView[] = [];

  for (const runDetail of input.runDetails) {
    for (const checkpoint of runDetail.checkpoints ?? []) {
      const payload = parseRunCheckpointPayload(checkpoint.payload);

      if (payload?.kind !== 'patch_promotion' || typeof payload.artifactId !== 'string') {
        continue;
      }

      const payloadDecisionId = typeof payload.decisionId === 'string'
        ? payload.decisionId
        : null;
      const decision = payloadDecisionId
        ? decisionsById.get(payloadDecisionId) ?? decisionsByCheckpoint.get(checkpoint.id) ?? null
        : decisionsByCheckpoint.get(checkpoint.id) ?? null;
      const expectedFiles = Array.isArray(payload.expectedFiles)
        ? payload.expectedFiles.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];

      views.push(buildSandboxPatchPromotionView({
        artifactId: payload.artifactId,
        checkpointId: checkpoint.id,
        checkpointStatus: checkpoint.status,
        decision,
        expectedFiles,
        title: decision?.title
          ?? (typeof payload.decisionTitle === 'string' ? payload.decisionTitle : null)
          ?? 'sandbox patch promotion',
      }));
    }
  }

  return views.sort((a, b) => a.artifactId.localeCompare(b.artifactId));
}

function buildSandboxPatchPromotionView(params: {
  artifactId: string;
  checkpointId: string;
  checkpointStatus: RunCheckpointStatus;
  decision: DecisionRecord | null;
  expectedFiles: string[];
  title: string;
}): SandboxPatchPromotionView {
  const fileLabel = params.expectedFiles.length
    ? `涉及 ${params.expectedFiles.length} 个文件`
    : '未记录文件清单';
  const base = {
    artifactId: params.artifactId,
    checkpointId: params.checkpointId,
    checkpointStatus: params.checkpointStatus,
    decisionId: params.decision?.id ?? null,
    decisionStatus: params.decision?.status ?? null,
    expectedFiles: params.expectedFiles,
    title: params.title,
  };

  if (params.checkpointStatus === 'cancelled' || params.decision?.status === 'cancelled') {
    return {
      ...base,
      detail: `${fileLabel}；这份 reviewed patch 不会自动写入工作区，需要重新 review 或重新生成 patch。`,
      label: 'promotion 已取消',
      tone: 'blocked',
    };
  }

  if (params.decision?.status === 'deferred') {
    return {
      ...base,
      detail: `${fileLabel}；Decision 已延后，工作区保持未写入。`,
      label: 'promotion 已延后',
      tone: 'pending',
    };
  }

  if (params.decision?.status === 'pending' || params.checkpointStatus === 'open') {
    return {
      ...base,
      detail: `${fileLabel}；需要先在 Decisions 中审批，审批前不会写入工作区。`,
      label: '等待 promotion 拍板',
      tone: 'pending',
    };
  }

  if (params.decision?.status === 'approved' && params.checkpointStatus === 'resolved') {
    return {
      ...base,
      detail: `${fileLabel}；Decision 已批准且 checkpoint 已结清，实际工作区应用仍受功能开关和 apply 服务控制。`,
      label: 'promotion 已审批',
      tone: 'completed',
    };
  }

  if (params.decision?.status === 'approved') {
    return {
      ...base,
      detail: `${fileLabel}；Decision 已批准，等待 promotion checkpoint 完成结清。`,
      label: 'promotion 已审批，等待结清',
      tone: 'ready',
    };
  }

  if (params.checkpointStatus === 'resolved') {
    return {
      ...base,
      detail: `${fileLabel}；checkpoint 已结清，工作区应用仍按 promotion 服务结果判断。`,
      label: 'promotion checkpoint 已结清',
      tone: 'completed',
    };
  }

  return {
    ...base,
    detail: `${fileLabel}；未找到关联 Decision，需要回到 Run 证据检查 promotion checkpoint。`,
    label: 'promotion 状态待核对',
    tone: 'pending',
  };
}
