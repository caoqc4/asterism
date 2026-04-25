import type { FeatureFlags } from '../../../shared/types/settings.js';
import type { LocalContainerSandboxPatchDraft } from './local-container-sandbox-backend.js';
import {
  buildSandboxPatchReviewRunRequest,
  type SandboxPatchReviewRunRequestBundle,
} from './sandbox-patch-review-request.js';
import { evaluateSandboxPatchReviewAdapterAvailability } from './sandbox-patch-review-service-factory.js';

export type SandboxPatchReviewRunPlan =
  | {
      status: 'blocked';
      reason: string;
      summary: string;
    }
  | {
      status: 'ready';
      requestBundle: SandboxPatchReviewRunRequestBundle;
      patchDraft: LocalContainerSandboxPatchDraft;
      decisionTitle: string;
      summary: string;
    };

export function buildSandboxPatchReviewRunPlan(params: {
  decisionTitle?: string | null;
  featureFlags: FeatureFlags;
  patchDraft: LocalContainerSandboxPatchDraft;
  requestedScripts: string[];
  runId: string;
  taskId: string;
  workspaceRoot: string | null | undefined;
}): SandboxPatchReviewRunPlan {
  const availability = evaluateSandboxPatchReviewAdapterAvailability(params.featureFlags);

  if (availability.status === 'disabled') {
    return {
      reason: availability.reason,
      status: 'blocked',
      summary: `Sandbox patch review run plan blocked: ${availability.reason}`,
    };
  }

  const patchDraft = normalizePatchDraft(params.patchDraft);

  if (!patchDraft.summary) {
    return blockedPlan('Sandbox patch review run plan requires a patch summary.');
  }

  if (!patchDraft.diff) {
    return blockedPlan('Sandbox patch review run plan requires a diff preview.');
  }

  if (!patchDraft.files.length) {
    return blockedPlan('Sandbox patch review run plan requires at least one changed file.');
  }

  try {
    const requestBundle = buildSandboxPatchReviewRunRequest({
      reason: `Review sandbox patch before workspace promotion: ${patchDraft.summary}`,
      requestedScripts: params.requestedScripts,
      runId: params.runId,
      taskId: params.taskId,
      workspaceRoot: params.workspaceRoot ?? '',
    });
    const decisionTitle = params.decisionTitle?.trim() || '确认提升 sandbox patch';

    return {
      decisionTitle,
      patchDraft,
      requestBundle,
      status: 'ready',
      summary: [
        'Sandbox patch review run plan ready',
        requestBundle.summary,
        `${patchDraft.files.length} file(s): ${patchDraft.files.join(', ')}`,
        `decision=${decisionTitle}`,
      ].join(' / '),
    };
  } catch (error) {
    return blockedPlan(error instanceof Error ? error.message : 'Sandbox patch review run plan failed.');
  }
}

function blockedPlan(reason: string): Extract<SandboxPatchReviewRunPlan, { status: 'blocked' }> {
  return {
    reason,
    status: 'blocked',
    summary: `Sandbox patch review run plan blocked: ${reason}`,
  };
}

function normalizePatchDraft(
  patchDraft: LocalContainerSandboxPatchDraft,
): LocalContainerSandboxPatchDraft {
  return {
    diff: patchDraft.diff.trim(),
    files: Array.from(new Set(patchDraft.files.map((file) => file.trim()).filter(Boolean))).sort(),
    riskSummary: patchDraft.riskSummary?.trim() || null,
    summary: patchDraft.summary.trim(),
  };
}
