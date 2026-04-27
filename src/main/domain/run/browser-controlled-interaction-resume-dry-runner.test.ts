import { describe, expect, it, vi } from 'vitest';

import type { RunStepRecord } from '../../../shared/types/run.js';
import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  buildDefaultBrowserControlledInteractionPolicy,
} from '../../../shared/types/browser-controlled-interaction.js';
import { runBrowserControlledInteractionResumeDryRun } from './browser-controlled-interaction-resume-dry-runner.js';

describe('browser controlled interaction resume dry-runner', () => {
  it('records an approved checkpoint resume plan without starting a browser', async () => {
    const runStepRepository = buildRunStepRepositoryMock();

    const result = await runBrowserControlledInteractionResumeDryRun({
      context: buildResumeContext(),
      payload: buildResumePayload(),
      runId: 'run_browser_resume_dry',
      runStepRepository,
    });

    expect(result).toMatchObject({
      blockedReasons: [],
      status: 'planned',
      summary: 'Browser controlled resume dry-run: planned / action=click / origin=http://localhost:5173 / browserStart=no / pageMutation=no / modelExposure=hidden',
    });
    expect(runStepRepository.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      kind: 'plan',
      output: 'browserStart=no / pageMutation=no / modelExposure=hidden / scheduler=no / providerCall=no',
      title: 'browser controlled resume dry-run accepted',
    }));
    expect(runStepRepository.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      kind: 'checkpoint',
      status: 'completed',
      title: 'Browser resume checkpoint reviewed',
    }));
    expect(runStepRepository.create).toHaveBeenNthCalledWith(3, expect.objectContaining({
      kind: 'tool_call',
      status: 'pending',
      title: 'Browser resume planned: click',
    }));
    expect(runStepRepository.create).toHaveBeenNthCalledWith(4, expect.objectContaining({
      kind: 'tool_result',
      status: 'skipped',
      title: 'Browser resume evidence pending: click',
    }));
  });

  it('records blocked validation evidence before browser start', async () => {
    const runStepRepository = buildRunStepRepositoryMock();

    const result = await runBrowserControlledInteractionResumeDryRun({
      context: {
        ...buildResumeContext(),
        decisionStatus: 'pending',
        schedulerAllowed: true,
      },
      payload: buildResumePayload(),
      runId: 'run_browser_resume_dry',
      runStepRepository,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockedReasons).toEqual([
      'Browser controlled resume requires an approved Decision; current status is pending.',
      'Browser controlled resume must not be scheduler-started.',
    ]);
    expect(runStepRepository.create).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'tool_result',
      status: 'failed',
      title: 'browser controlled resume blocked',
    }));
  });
});

function buildResumeContext() {
  return {
    checkpointStatus: 'open' as const,
    decisionStatus: 'approved' as const,
    descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
    modelExposure: 'hidden' as const,
    providerCallAllowed: false,
    requestedAction: 'click' as const,
    requestedOrigin: 'http://localhost:5173',
    schedulerAllowed: false,
  };
}

function buildResumePayload() {
  return {
    version: 1,
    kind: 'browser_controlled_interaction',
    descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
    action: {
      action: 'click',
      currentUrl: 'http://localhost:5173/draft',
      targetLabel: 'Publish post',
    },
    currentUrl: 'http://localhost:5173/draft',
    decisionId: 'decision_browser_1',
    decisionTitle: 'Approve browser publish click',
    origin: 'http://localhost:5173',
    policySnapshot: buildDefaultBrowserControlledInteractionPolicy({
      allowedActions: ['click'],
      allowedOrigins: ['http://localhost:5173'],
    }),
    screenshotArtifactId: 'artifact_screenshot_1',
    sideEffectClassification: 'possible_external_side_effect',
    visibleTextSummary: 'Draft publish page is visible.',
  };
}

function buildRunStepRepositoryMock() {
  let index = 0;

  return {
    create: vi.fn().mockImplementation(async (input: {
      error?: string | null;
      input?: string | null;
      kind: RunStepRecord['kind'];
      output?: string | null;
      runId: string;
      status?: RunStepRecord['status'];
      title: string;
    }): Promise<RunStepRecord> => {
      index += 1;
      return {
        createdAt: '2026-04-27T00:00:00.000Z',
        error: input.error ?? null,
        id: `run_step_${index}`,
        index,
        input: input.input ?? null,
        kind: input.kind,
        output: input.output ?? null,
        runId: input.runId,
        status: input.status ?? 'completed',
        title: input.title,
        updatedAt: '2026-04-27T00:00:00.000Z',
      };
    }),
  };
}
