#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  getScheduledEventAgentBackgroundLivePreflight,
  printScheduledEventAgentBackgroundLivePreflight,
} from './scheduled-event-agent-background-live-preflight.mjs';

const ENABLED = process.env.TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_PACKAGED_BACKGROUND_SOAK === 'true';
const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');

export function runScheduledEventAgentPackagedBackgroundSoakPreflight() {
  const preflight = getScheduledEventAgentBackgroundLivePreflight();
  printScheduledEventAgentBackgroundLivePreflight(preflight);
  console.log('Scheduled/event Agent packaged background soak');
  console.log('mode=opt-in packaged soak');
  console.log(`packagedApp=${fs.existsSync(executablePath) ? executablePath : '<missing>'}`);

  if (!ENABLED) {
    console.log('status=skip');
    console.log('skipReason=opt_in_required');
    console.log('set TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_PACKAGED_BACKGROUND_SOAK=true to launch the packaged app and run one provider-backed scheduler soak');
    console.log('packagedApp=not-launched');
    console.log('backgroundLiveRun=not-started');
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 0;
  }

  const issues = [...preflight.issues];

  if (process.platform !== 'darwin') {
    issues.push('macOS is required for the packaged scheduled/event background soak.');
  }

  if (!fs.existsSync(executablePath)) {
    issues.push(`Missing packaged app executable: ${executablePath}. Run npm run dist:mac:dir first.`);
  }

  if (issues.length > 0) {
    console.log('status=skip');
    console.log('skipReason=config_missing');
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
    console.log('packagedApp=not-launched');
    console.log('backgroundLiveRun=not-started');
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 0;
  }

  console.log('status=ready');
  console.log('packagedApp=ready_to_launch');
  console.log('backgroundLiveRun=ready_to_attempt');
  console.log('provider=not-called');
  console.log('docker=not-started');
  console.log('workspace=unchanged');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runScheduledEventAgentPackagedBackgroundSoakPreflight();
}
