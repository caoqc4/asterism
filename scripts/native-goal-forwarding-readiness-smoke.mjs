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
  console.log(`unsupportedRequirements=${scalarValue(unsupportedAudit.summary, 'requirements') ?? 'missing'}`);
  console.log(`unsupportedMissingEvidence=${unsupportedAudit.missingEvidence.join(',') || 'none'}`);
  console.log(`reportedCapabilityStatus=${reportedCapabilityAudit.status}`);
  console.log(`reportedCapabilityReady=${reportedCapabilityAudit.ready ? 'yes' : 'no'}`);
  console.log(`reportedCapabilityRequirements=${scalarValue(reportedCapabilityAudit.summary, 'requirements') ?? 'missing'}`);
  console.log(`reportedCapabilityMissingEvidence=${reportedCapabilityAudit.missingEvidence.join(',') || 'none'}`);
  console.log(`syntheticReadyStatus=${syntheticReady.status}`);
  console.log(`syntheticReady=${syntheticReady.ready ? 'yes' : 'no'}`);
  console.log(`syntheticReadyRequirements=${scalarValue(syntheticReady.summary, 'requirements') ?? 'missing'}`);
  console.log(`syntheticMissingEvidence=${syntheticReady.missingEvidence.join(',') || 'none'}`);
  console.log('nativeGoalForwarding=audit-only');

  if (
    unsupportedAudit.status !== 'audit_only'
    || unsupportedAudit.ready
    || scalarValue(unsupportedAudit.summary, 'nativeGoalReady') !== 'no'
    || scalarValue(unsupportedAudit.summary, 'requirements') !== '3/8'
    || !unsupportedAudit.missingEvidence.includes('adapter capability')
    || reportedCapabilityAudit.status !== 'audit_only'
    || reportedCapabilityAudit.ready
    || scalarValue(reportedCapabilityAudit.summary, 'nativeGoalReady') !== 'no'
    || scalarValue(reportedCapabilityAudit.summary, 'requirements') !== '4/8'
    || !reportedCapabilityAudit.missingEvidence.includes('command shape')
    || !reportedCapabilityAudit.missingEvidence.includes('progress evidence')
    || !reportedCapabilityAudit.missingEvidence.includes('control boundary')
    || !reportedCapabilityAudit.missingEvidence.includes('packaged smoke')
    || syntheticReady.status !== 'ready_to_open_passthrough'
    || !syntheticReady.ready
    || scalarValue(syntheticReady.summary, 'nativeGoalReady') !== 'yes'
    || scalarValue(syntheticReady.summary, 'requirements') !== '8/8'
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

function scalarValue(summary, key) {
  const prefix = `${key}=`;
  const part = summary.split(' / ').find((item) => item.trim().startsWith(prefix));
  return part?.trim().slice(prefix.length).trim() ?? null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runNativeGoalForwardingReadinessSmoke();
}
