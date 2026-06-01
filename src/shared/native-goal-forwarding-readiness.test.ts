import { describe, expect, it } from 'vitest';

import {
  buildNativeGoalAuditReadinessEvidence,
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
      summary: 'codex native goal forwarding remains audit-only; missing control boundary, packaged smoke. / nativeGoalReady=no / status=audit_only / requirements=6/8 / missingEvidence=control boundary,packaged smoke',
    });
  });

  it('allows a future explicit passthrough candidate only after the full evidence gate is satisfied', () => {
    const readiness = evaluateNativeGoalForwardingReadiness(completeEvidence());

    expect(readiness).toEqual({
      adapterId: 'codex',
      missingEvidence: [],
      ready: true,
      status: 'ready_to_open_passthrough',
      summary: 'codex native goal forwarding has complete evidence for an explicit passthrough candidate. / nativeGoalReady=yes / status=ready_to_open_passthrough / requirements=8/8 / missingEvidence=none',
    });
  });

  it('builds audit-run readiness evidence without opening native goal passthrough', () => {
    const evidence = buildNativeGoalAuditReadinessEvidence({
      adapterId: 'claude',
      supportsNativeGoalMode: true,
    });
    const readiness = evaluateNativeGoalForwardingReadiness(evidence);

    expect(evidence).toMatchObject({
      adapterId: 'claude',
      adapterCapabilityVerified: true,
      commandShapeVerified: false,
      memoryBoundaryVerified: true,
      sourceOfTruthBoundaryVerified: true,
      stateReflectionVerified: true,
    });
    expect(readiness).toMatchObject({
      status: 'audit_only',
      missingEvidence: ['command shape', 'progress evidence', 'control boundary', 'packaged smoke'],
    });
    expect(readiness.summary).toContain('nativeGoalReady=no');
    expect(readiness.summary).toContain('requirements=4/8');
    expect(readiness.summary).toContain('missingEvidence=command shape,progress evidence,control boundary,packaged smoke');
    expect(evidence.notes?.join('\n')).toContain('Taskplane records the request as product-owned audit evidence');
  });

  it('requires the adapter to declare native goal capability before passthrough can be ready', () => {
    const readiness = evaluateNativeGoalForwardingReadiness({
      ...completeEvidence(),
      adapterCapabilityVerified: false,
    });

    expect(readiness).toEqual({
      adapterId: 'codex',
      missingEvidence: ['adapter capability'],
      ready: false,
      status: 'audit_only',
      summary: 'codex native goal forwarding remains audit-only; missing adapter capability. / nativeGoalReady=no / status=audit_only / requirements=7/8 / missingEvidence=adapter capability',
    });
  });
});

function completeEvidence(): NativeGoalForwardingEvidence {
  return {
    adapterId: 'codex',
    adapterCapabilityVerified: true,
    commandShapeVerified: true,
    controlBoundaryVerified: true,
    memoryBoundaryVerified: true,
    packagedSmokeVerified: true,
    progressEvidenceVerified: true,
    sourceOfTruthBoundaryVerified: true,
    stateReflectionVerified: true,
  };
}
