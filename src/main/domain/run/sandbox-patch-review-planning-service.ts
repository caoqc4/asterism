import type { FeatureFlags } from '../../../shared/types/settings.js';
import type { LocalContainerSandboxPatchDraft } from './local-container-sandbox-backend.js';
import {
  buildSandboxPatchReviewRunPlan,
  type SandboxPatchReviewRunPlan,
} from './sandbox-patch-review-run-plan.js';

export class SandboxPatchReviewPlanningService {
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
}
