import type { FeatureFlags } from '../../../shared/types/settings.js';
import type { LocalContainerSandboxPatchDraft } from './local-container-sandbox-backend.js';
import { validateSandboxPatchDraftSource } from './sandbox-patch-draft-source.js';
import {
  buildSandboxPatchReviewRunPlan,
  type SandboxPatchReviewRunPlan,
} from './sandbox-patch-review-run-plan.js';

export class SandboxPatchReviewPlanningService {
  previewLocalNoteDiagnostic(params: {
    featureFlags: FeatureFlags;
    runId: string;
    taskId: string;
    workspaceRoot: string | null | undefined;
  }): SandboxPatchReviewRunPlan {
    return buildSandboxPatchReviewRunPlan({
      featureFlags: params.featureFlags,
      patchDraft: {
        diff: '',
        files: [],
        summary: '',
      },
      requestedScripts: ['test', 'lint'],
      runId: params.runId,
      taskId: params.taskId,
      workspaceRoot: params.workspaceRoot,
    });
  }

  preview(params: {
    decisionTitle?: string | null;
    featureFlags: FeatureFlags;
    patchDraft: LocalContainerSandboxPatchDraft;
    requestedScripts: string[];
    runId: string;
    taskId: string;
    workspaceRoot: string | null | undefined;
  }): SandboxPatchReviewRunPlan {
    return buildSandboxPatchReviewRunPlan(params);
  }

  previewFromSource(params: {
    decisionTitle?: string | null;
    expectedWorkspaceRoot?: string | null;
    featureFlags: FeatureFlags;
    source: unknown;
  }): SandboxPatchReviewRunPlan {
    const validation = validateSandboxPatchDraftSource(params.source);

    if (!validation.valid) {
      return {
        reason: validation.blockedReasons.join(' '),
        status: 'blocked',
        summary: validation.summary,
      };
    }

    const expectedWorkspaceRoot = params.expectedWorkspaceRoot?.trim();
    if (expectedWorkspaceRoot && expectedWorkspaceRoot !== validation.source.workspaceRoot) {
      const reason = 'Sandbox patch draft source workspace does not match the selected workspace.';
      return {
        reason,
        status: 'blocked',
        summary: `Sandbox patch review run plan blocked: ${reason}`,
      };
    }

    const plan = buildSandboxPatchReviewRunPlan({
      decisionTitle: params.decisionTitle,
      featureFlags: params.featureFlags,
      patchDraft: validation.source.patchDraft,
      requestedScripts: validation.source.requestedScripts,
      runId: validation.source.runId,
      taskId: validation.source.taskId,
      workspaceRoot: validation.source.workspaceRoot,
    });

    if (plan.status === 'blocked') {
      return plan;
    }

    return {
      ...plan,
      summary: `${plan.summary} / ${validation.summary}`,
    };
  }
}
