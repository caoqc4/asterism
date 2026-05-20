import { describe, expect, it } from 'vitest';

import {
  evaluateNativeGoalForwardingReadiness,
  type NativeGoalForwardingEvidence,
} from './native-goal-forwarding-readiness.js';

describe('native-goal-forwarding-readiness', () => {
  it('keeps native goal forwarding audit-only until every evidence gate passes', () => {
    const readiness = evaluateNativeGoalForwardingReadiness({
      ...completeEvidence(),
      controlBoundaryVerified: false,
      packagedSmokeVerified: false,
    });

    expect(readiness).toEqual({
      adapterId: 'codex',
      missingEvidence: ['control boundary', 'packaged smoke'],
      ready: false,
      status: 'audit_only',
      summary: 'codex native goal forwarding remains audit-only; missing control boundary, packaged smoke.',
    });
  });

  it('allows a future explicit passthrough candidate only after the full evidence gate is satisfied', () => {
    const readiness = evaluateNativeGoalForwardingReadiness(completeEvidence());

    expect(readiness).toEqual({
      adapterId: 'codex',
      missingEvidence: [],
      ready: true,
      status: 'ready_to_open_passthrough',
      summary: 'codex native goal forwarding has complete evidence for an explicit passthrough candidate.',
    });
  });
});

function completeEvidence(): NativeGoalForwardingEvidence {
  return {
    adapterId: 'codex',
    commandShapeVerified: true,
    controlBoundaryVerified: true,
    memoryBoundaryVerified: true,
    packagedSmokeVerified: true,
    progressEvidenceVerified: true,
    sourceOfTruthBoundaryVerified: true,
    stateReflectionVerified: true,
  };
}
