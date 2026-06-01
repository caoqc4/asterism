import { describe, expect, it, vi } from 'vitest';

import type { RunStepRecord } from '../../../shared/types/run.js';
import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  buildDefaultBrowserControlledInteractionPolicy,
} from '../../../shared/types/browser-controlled-interaction.js';
import { runBrowserControlledInteractionDryRun } from './browser-controlled-interaction-dry-runner.js';

describe('browser controlled interaction dry-runner', () => {
  it('records safe local action drafts without starting a browser', async () => {
    const runStepRepository = buildRunStepRepositoryMock();

    const result = await runBrowserControlledInteractionDryRun({
      runId: 'run_browser_controlled_dry',
      runStepRepository,
      requests: [
        {
          descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
          action: {
            action: 'click',
            currentUrl: 'http://localhost:5173/tasks',
            targetLabel: 'Open task detail',
            targetRef: 'button-open-task',
          },
          policy: buildDefaultBrowserControlledInteractionPolicy({
            allowedOrigins: ['http://localhost:5173'],
          }),
          purpose: 'Exercise a local dev-server QA flow.',
        },
      ],
    });

    expect(result).toMatchObject({
      blockedReasons: [],
      checkpointCount: 0,
      plannedActionCount: 1,
      status: 'planned',
      summary: 'Browser controlled interaction dry-run: planned / plannedActions=1 / checkpointRequired=0 / blocked=0 / browserStart=no / networkCall=no / modelExposure=hidden',
    });
    expect(runStepRepository.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      kind: 'plan',
      output: 'browserStart=no / networkCall=no / pageMutation=no / modelExposure=hidden / scheduler=no / providerCall=no',
      title: 'browser controlled dry-run accepted',
    }));
    expect(runStepRepository.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      kind: 'tool_call',
      status: 'running',
      title: 'Browser action planned: click',
    }));
    expect(runStepRepository.create).toHaveBeenNthCalledWith(3, expect.objectContaining({
      kind: 'tool_result',
      status: 'skipped',
      title: 'Browser action evidence pending: click',
    }));
  });

  it('records checkpoint-required action drafts without executing them', async () => {
    const result = await runBrowserControlledInteractionDryRun({
      runId: 'run_browser_controlled_dry',
      runStepRepository: buildRunStepRepositoryMock(),
      requests: [
        {
          descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
          action: {
            action: 'click',
            currentUrl: 'http://localhost:5173/draft',
            targetLabel: 'Publish post',
          },
          policy: buildDefaultBrowserControlledInteractionPolicy({
            allowedActions: ['click'],
            allowedOrigins: ['http://localhost:5173'],
          }),
          purpose: 'Prepare a publish preview without sending.',
        },
      ],
    });

    expect(result.status).toBe('checkpoint_required');
    expect(result.checkpointCount).toBe(1);
    expect(result.steps.map((step) => step.title)).toEqual([
      'browser controlled dry-run accepted',
      'Browser action planned: click',
      'Browser action requires checkpoint',
    ]);
  });

  it('records blocked validation evidence before any browser runtime can start', async () => {
    const runStepRepository = buildRunStepRepositoryMock();

    const result = await runBrowserControlledInteractionDryRun({
      runId: 'run_browser_controlled_dry',
      runStepRepository,
      requests: [
        {
          descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
          action: {
            action: 'press_key',
            currentUrl: 'https://publisher.example.com/draft',
            targetLabel: 'password',
            value: 'Enter',
          },
          policy: {
            ...buildDefaultBrowserControlledInteractionPolicy({
              allowedActions: ['press_key'],
              allowedOrigins: ['https://trusted.example.com'],
            }),
            maxActions: 200,
          },
          purpose: 'Submit login form',
        },
      ],
    });

    expect(result.status).toBe('blocked');
    expect(result.plannedActionCount).toBe(0);
    expect(result.blockedReasons).toEqual(expect.arrayContaining([
      'Browser controlled interaction policy action count exceeds the maximum.',
      'Browser controlled interaction action URL must match an allowed origin.',
      'Browser controlled interaction key actions must use a safe key.',
      'Browser controlled interaction must not target sensitive fields.',
    ]));
    expect(runStepRepository.create).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'tool_result',
      status: 'failed',
      title: 'browser controlled interaction blocked',
    }));
  });
});

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
