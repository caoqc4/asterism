#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'native-goal-forwarding-readiness.js');

export async function runNativeGoalForwardingReadinessSmoke() {
  console.log('Native goal forwarding readiness smoke');
  console.log('mode=read-only');
  console.log('cli=not-called');
  console.log('provider=not-called');
  console.log('workspace=unchanged');
  console.log('taskplaneGoalLoop=available');
  console.log('passthrough=closed');

  if (!fs.existsSync(modulePath)) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    return 0;
  }

  const {
    buildNativeGoalAuditReadinessEvidence,
    evaluateNativeGoalForwardingReadiness,
  } = await import(pathToFileURL(modulePath).href);

  const unsupportedAudit = evaluateNativeGoalForwardingReadiness(
    buildNativeGoalAuditReadinessEvidence({
      adapterId: 'codex',
      supportsNativeGoalMode: false,
    }),
  );
  const reportedCapabilityAudit = evaluateNativeGoalForwardingReadiness(
    buildNativeGoalAuditReadinessEvidence({
      adapterId: 'codex',
      supportsNativeGoalMode: true,
    }),
  );
  const syntheticReady = evaluateNativeGoalForwardingReadiness({
    adapterId: 'codex',
    adapterCapabilityVerified: true,
    commandShapeVerified: true,
    controlBoundaryVerified: true,
    memoryBoundaryVerified: true,
    packagedSmokeVerified: true,
    progressEvidenceVerified: true,
    sourceOfTruthBoundaryVerified: true,
    stateReflectionVerified: true,
  });

  console.log(`unsupportedStatus=${unsupportedAudit.status}`);
  console.log(`unsupportedReady=${unsupportedAudit.ready ? 'yes' : 'no'}`);
  console.log(`unsupportedMissingEvidence=${unsupportedAudit.missingEvidence.join(',') || 'none'}`);
  console.log(`reportedCapabilityStatus=${reportedCapabilityAudit.status}`);
  console.log(`reportedCapabilityReady=${reportedCapabilityAudit.ready ? 'yes' : 'no'}`);
  console.log(`reportedCapabilityMissingEvidence=${reportedCapabilityAudit.missingEvidence.join(',') || 'none'}`);
  console.log(`syntheticReadyStatus=${syntheticReady.status}`);
  console.log(`syntheticReady=${syntheticReady.ready ? 'yes' : 'no'}`);
  console.log(`syntheticMissingEvidence=${syntheticReady.missingEvidence.join(',') || 'none'}`);
  console.log('nativeGoalForwarding=audit-only');

  if (
    unsupportedAudit.status !== 'audit_only'
    || unsupportedAudit.ready
    || !unsupportedAudit.missingEvidence.includes('adapter capability')
    || reportedCapabilityAudit.status !== 'audit_only'
    || reportedCapabilityAudit.ready
    || !reportedCapabilityAudit.missingEvidence.includes('command shape')
    || !reportedCapabilityAudit.missingEvidence.includes('progress evidence')
    || !reportedCapabilityAudit.missingEvidence.includes('control boundary')
    || !reportedCapabilityAudit.missingEvidence.includes('packaged smoke')
    || syntheticReady.status !== 'ready_to_open_passthrough'
    || !syntheticReady.ready
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runNativeGoalForwardingReadinessSmoke();
}
