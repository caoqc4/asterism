import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  parseBrowserControlledInteractionCheckpointPayload,
} from '../../../shared/types/browser-controlled-interaction.js';
import type { BrowserControlledResumeExecutor } from '../decision/decision-service.js';
import {
  createPlaywrightBrowserControlledInteractionRunner,
  runBrowserControlledInteractionResumeLocalQa,
} from './browser-controlled-interaction-runner.js';

export const runBrowserControlledResumeForApprovedDecision: BrowserControlledResumeExecutor = async (params) => {
  const parsed = parseBrowserControlledInteractionCheckpointPayload(params.payload);
  if (!parsed.valid) {
    return {
      blockedReasons: parsed.blockedReasons,
      status: 'blocked',
      summary: `Browser controlled resume blocked: ${parsed.blockedReasons.join(' ')}`,
    };
  }

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-browser-controlled-decision-resume-'));
  const artifactsDir = path.join(root, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });

  const browserType = await createPlaywrightBrowserControlledInteractionRunner();
  return runBrowserControlledInteractionResumeLocalQa({
    browserType,
    context: {
      checkpointStatus: 'open',
      currentPolicy: parsed.payload.policySnapshot,
      decisionStatus: params.decision.status,
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      modelExposure: 'hidden',
      providerCallAllowed: false,
      requestedAction: parsed.payload.action.action,
      requestedOrigin: parsed.payload.origin,
      schedulerAllowed: false,
    },
    outputDir: artifactsDir,
    payload: parsed.payload,
  });
};
