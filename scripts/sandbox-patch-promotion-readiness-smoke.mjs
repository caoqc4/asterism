#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'sandbox-patch-promotion-readiness.js');
const sourceModulePath = path.join(root, 'src', 'shared', 'sandbox-patch-promotion-readiness.ts');

export async function runSandboxPatchPromotionReadinessSmoke() {
  console.log('Sandbox patch promotion readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('workspace=unchanged');
  console.log('workspaceApply=not-attempted');

  if (!fs.existsSync(modulePath) || sourceIsNewerThanBuild()) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    return 0;
  }

  const {
    evaluateSandboxPatchPromotionReadiness,
  } = await import(pathToFileURL(modulePath).href);

  const reviewOnly = evaluateSandboxPatchPromotionReadiness(buildCheckpoint());
  const ready = evaluateSandboxPatchPromotionReadiness(buildCheckpoint({
    payload: JSON.stringify({
      version: 1,
      kind: 'patch_promotion',
      artifactId: 'artifact_1',
      artifactSummary: 'Reviewable sandbox patch',
      sourceId: 'sandbox_source_1',
      descriptorId: 'workspace.staged_patch',
      decisionId: 'decision_1',
      decisionTitle: 'Confirm sandbox patch promotion',
      expectedFiles: ['src/app.ts', 'docs/notes.md', 'src/app.ts'],
      patchDigest: 'sha256:abc123',
      policySnapshot: {
        descriptorId: 'workspace.staged_patch',
      },
    }),
  }));
  const unsafePath = evaluateSandboxPatchPromotionReadiness(buildCheckpoint({
    payload: JSON.stringify({
      version: 1,
      kind: 'patch_promotion',
      artifactId: 'artifact_1',
      sessionId: 'sandbox_session_1',
      descriptorId: 'workspace.staged_patch',
      decisionId: 'decision_1',
      expectedFiles: ['../outside.txt', 'src/app.ts'],
      patchDigest: 'sha256:abc123',
      policySnapshot: {
        descriptorId: 'workspace.staged_patch',
      },
    }),
  }));
  const alreadyResolved = evaluateSandboxPatchPromotionReadiness(buildCheckpoint({
    status: 'resolved',
  }));

  printReadiness('reviewOnly', reviewOnly);
  printReadiness('ready', ready);
  printReadiness('unsafePath', unsafePath);
  printReadiness('alreadyResolved', alreadyResolved);

  if (
    reviewOnly.status !== 'missing_apply_metadata'
    || reviewOnly.satisfiedRequirements.length !== 10
    || !reviewOnly.missingRequirements.includes('expected_files')
    || !reviewOnly.missingRequirements.includes('patch_digest')
    || ready.status !== 'ready'
    || ready.satisfiedRequirements.length !== 12
    || ready.missingRequirements.length !== 0
    || ready.expectedFiles.join(',') !== 'src/app.ts,docs/notes.md'
    || unsafePath.status !== 'blocked'
    || !unsafePath.missingRequirements.includes('safe_expected_files')
    || alreadyResolved.status !== 'already_resolved'
    || !alreadyResolved.missingRequirements.includes('checkpoint_open')
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

function printReadiness(prefix, readiness) {
  console.log(`${prefix}Status=${readiness.status}`);
  console.log(`${prefix}Requirements=${readiness.satisfiedRequirements.length}/12`);
  console.log(`${prefix}MissingRequirements=${readiness.missingRequirements.join(',') || 'none'}`);
  console.log(`${prefix}ExpectedFiles=${readiness.expectedFiles.join(',') || 'none'}`);
}

function buildCheckpoint(partial = {}) {
  return {
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    id: partial.id ?? 'run_checkpoint_1',
    kind: partial.kind ?? 'patch_promotion',
    payload: partial.payload ?? JSON.stringify({
      version: 1,
      kind: 'patch_promotion',
      artifactId: 'artifact_1',
      artifactSummary: 'Reviewable sandbox patch',
      sessionId: 'sandbox_session_1',
      descriptorId: 'workspace.staged_patch',
      decisionId: 'decision_1',
      decisionTitle: 'Confirm sandbox patch promotion',
      policySnapshot: {
        descriptorId: 'workspace.staged_patch',
      },
    }),
    resolvedAt: partial.resolvedAt ?? null,
    runId: partial.runId ?? 'run_1',
    status: partial.status ?? 'open',
    stepId: partial.stepId ?? null,
  };
}

function sourceIsNewerThanBuild() {
  if (!fs.existsSync(modulePath) || !fs.existsSync(sourceModulePath)) return false;
  return fs.statSync(sourceModulePath).mtimeMs > fs.statSync(modulePath).mtimeMs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runSandboxPatchPromotionReadinessSmoke();
}
