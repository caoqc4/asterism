import type { FeatureFlags } from '../../../shared/types/settings.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { SandboxPatchPromotionRepository } from '../../db/repositories/sandbox-patch-promotion-repository.js';
import { AgentCheckpointRecorder } from './agent-checkpoint-recorder.js';
import { LocalContainerSandboxProvider } from './local-container-sandbox-backend.js';
import { SandboxPatchReviewPersister } from './sandbox-patch-review-persister.js';
import { SandboxPatchReviewRunAdapter } from './sandbox-patch-review-run-adapter.js';

export type SandboxPatchReviewAdapterResolution =
  | {
      status: 'disabled';
      reason: string;
    }
  | {
      status: 'available';
      adapter: SandboxPatchReviewRunAdapter;
      reason: string;
    };

export type SandboxPatchReviewAdapterAvailability =
  | {
      status: 'disabled';
      reason: string;
    }
  | {
      status: 'available';
      reason: string;
    };

export type SandboxPatchReviewServiceDependencies = {
  artifactRepository?: ArtifactRepository;
  decisionRepository?: DecisionRepository | null;
  provider?: LocalContainerSandboxProvider;
  runCheckpointRepository?: RunCheckpointRepository;
  runStepRepository?: RunStepRepository;
  sandboxPatchPromotionRepository?: SandboxPatchPromotionRepository | null;
};

export function evaluateSandboxPatchReviewAdapterAvailability(
  featureFlags: FeatureFlags,
): SandboxPatchReviewAdapterAvailability {
  return featureFlags.enableSandboxCodingAgent
    ? {
        status: 'available',
        reason:
          'Sandbox patch review adapter is available for explicit runner calls only; no container runner is created by the factory.',
      }
    : {
        status: 'disabled',
        reason: 'Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
      };
}

export function resolveSandboxPatchReviewRunAdapter(params: {
  featureFlags: FeatureFlags;
  dependencies?: SandboxPatchReviewServiceDependencies;
}): SandboxPatchReviewAdapterResolution {
  const availability = evaluateSandboxPatchReviewAdapterAvailability(params.featureFlags);

  if (availability.status === 'disabled') {
    return availability;
  }

  const runStepRepository = params.dependencies?.runStepRepository ?? new RunStepRepository();
  const runCheckpointRepository =
    params.dependencies?.runCheckpointRepository ?? new RunCheckpointRepository();
  const artifactRepository = params.dependencies?.artifactRepository ?? new ArtifactRepository();
  const decisionRepository =
    params.dependencies && 'decisionRepository' in params.dependencies
      ? params.dependencies.decisionRepository
      : new DecisionRepository();
  const sandboxPatchPromotionRepository =
    params.dependencies && 'sandboxPatchPromotionRepository' in params.dependencies
      ? params.dependencies.sandboxPatchPromotionRepository
      : new SandboxPatchPromotionRepository();
  const checkpointRecorder = new AgentCheckpointRecorder(
    runCheckpointRepository,
    runStepRepository,
    decisionRepository,
    sandboxPatchPromotionRepository,
  );
  const persister = new SandboxPatchReviewPersister(
    artifactRepository,
    runStepRepository,
    checkpointRecorder,
  );
  const adapter = new SandboxPatchReviewRunAdapter(
    params.dependencies?.provider ?? new LocalContainerSandboxProvider(),
    persister,
    runStepRepository,
  );

  return {
    adapter,
    ...availability,
  };
}
