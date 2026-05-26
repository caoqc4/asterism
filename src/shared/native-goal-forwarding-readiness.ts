export type NativeGoalForwardingEvidence = {
  adapterId: string;
  adapterCapabilityVerified: boolean;
  commandShapeVerified: boolean;
  stateReflectionVerified: boolean;
  progressEvidenceVerified: boolean;
  controlBoundaryVerified: boolean;
  memoryBoundaryVerified: boolean;
  sourceOfTruthBoundaryVerified: boolean;
  packagedSmokeVerified: boolean;
  notes?: string[];
};

export type NativeGoalForwardingReadiness = {
  adapterId: string;
  ready: boolean;
  status: 'ready_to_open_passthrough' | 'audit_only';
  missingEvidence: string[];
  summary: string;
};

export type NativeGoalAuditReadinessInput = {
  adapterId: string;
  supportsNativeGoalMode: boolean;
};

const evidenceLabels: Array<[keyof NativeGoalForwardingEvidence, string]> = [
  ['adapterCapabilityVerified', 'adapter capability'],
  ['commandShapeVerified', 'command shape'],
  ['stateReflectionVerified', 'state reflection'],
  ['progressEvidenceVerified', 'progress evidence'],
  ['controlBoundaryVerified', 'control boundary'],
  ['memoryBoundaryVerified', 'memory boundary'],
  ['sourceOfTruthBoundaryVerified', 'source-of-truth boundary'],
  ['packagedSmokeVerified', 'packaged smoke'],
];

export function evaluateNativeGoalForwardingReadiness(
  evidence: NativeGoalForwardingEvidence,
): NativeGoalForwardingReadiness {
  const missingEvidence = evidenceLabels
    .filter(([key]) => evidence[key] !== true)
    .map(([, label]) => label);
  const ready = missingEvidence.length === 0;

  return {
    adapterId: evidence.adapterId,
    missingEvidence,
    ready,
    status: ready ? 'ready_to_open_passthrough' : 'audit_only',
    summary: ready
      ? `${evidence.adapterId} native goal forwarding has complete evidence for an explicit passthrough candidate.`
      : `${evidence.adapterId} native goal forwarding remains audit-only; missing ${missingEvidence.join(', ')}.`,
  };
}

export function buildNativeGoalAuditReadinessEvidence(
  input: NativeGoalAuditReadinessInput,
): NativeGoalForwardingEvidence {
  return {
    adapterId: input.adapterId,
    adapterCapabilityVerified: input.supportsNativeGoalMode,
    commandShapeVerified: false,
    controlBoundaryVerified: false,
    memoryBoundaryVerified: true,
    packagedSmokeVerified: false,
    progressEvidenceVerified: false,
    sourceOfTruthBoundaryVerified: true,
    stateReflectionVerified: true,
    notes: [
      input.supportsNativeGoalMode
        ? 'Runtime reports native goal affordance, but Taskplane has not verified passthrough command shape and lifecycle evidence.'
        : 'Runtime has not reported a verified native goal affordance.',
      'Taskplane records the request as product-owned audit evidence and keeps memory/source-of-truth boundaries closed.',
    ],
  };
}
