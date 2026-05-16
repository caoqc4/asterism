import { describe, expect, it } from 'vitest';

import { buildBrowserEvidenceRunnerSmokeFixture } from '../../../shared/types/browser-evidence.js';
import {
  BrowserEvidencePersister,
  buildBrowserEvidenceArtifactContent,
} from './browser-evidence-persister.js';

describe('BrowserEvidencePersister', () => {
  it('builds artifact content without credential or mutation state', () => {
    const fixture = buildBrowserEvidenceRunnerSmokeFixture({
      origin: 'http://127.0.0.1:4173',
    });
    const content = buildBrowserEvidenceArtifactContent({
      request: fixture.request,
      result: {
        artifacts: [
          {
            content: 'Browser Evidence Smoke',
            kind: 'visible_text',
            summary: '22 visible text characters captured.',
            title: 'Browser visible text',
          },
        ],
        status: 'captured',
        summary: 'Browser evidence captured / credentials=no / mutation=no',
      },
    });

    expect(content).toEqual({
      artifacts: [
        {
          content: 'Browser Evidence Smoke',
          kind: 'visible_text',
          summary: '22 visible text characters captured.',
          title: 'Browser visible text',
        },
      ],
      policy: {
        allowCredentials: false,
        allowedOrigins: ['http://127.0.0.1:4173'],
        isolatedProfile: true,
        networkPolicy: 'allowlisted',
      },
      request: {
        action: 'capture_screenshot',
        allowedEvidenceKinds: ['screenshot', 'visible_text', 'page_summary'],
        purpose: 'Capture isolated local browser evidence smoke output.',
        url: 'http://127.0.0.1:4173/browser-evidence-smoke.html',
      },
      result: {
        status: 'captured',
        summary: 'Browser evidence captured / credentials=no / mutation=no',
      },
    });
  });

  it('persists captured browser evidence as a run artifact and run steps', async () => {
    const fixture = buildBrowserEvidenceRunnerSmokeFixture({
      origin: 'http://127.0.0.1:4173',
    });
    const createdSteps: Array<{
      input?: string | null;
      kind: string;
      output?: string | null;
      runId: string;
      status?: string;
      title: string;
    }> = [];
    const persister = new BrowserEvidencePersister(
      {
        createBrowserEvidenceFromRun: async (params) => ({
          content: params.content,
          createdAt: '2026-04-27T00:00:00.000Z',
          id: 'artifact_browser_1',
          kind: 'browser_evidence',
          sourceId: params.runId,
          sourceType: 'run',
          taskId: params.taskId,
          title: params.title,
          updatedAt: '2026-04-27T00:00:00.000Z',
        }),
      },
      {
        create: async (input) => {
          createdSteps.push(input);
          return {
            createdAt: '2026-04-27T00:00:00.000Z',
            error: input.error ?? null,
            id: `run_step_${createdSteps.length}`,
            index: createdSteps.length,
            input: input.input ?? null,
            kind: input.kind,
            output: input.output ?? null,
            runId: input.runId,
            status: input.status ?? 'completed',
            title: input.title,
            updatedAt: '2026-04-27T00:00:00.000Z',
          };
        },
      },
    );

    const persisted = await persister.persistCaptured({
      request: fixture.request,
      result: {
        artifacts: [
          {
            kind: 'screenshot',
            path: '/tmp/browser-evidence-screenshot.png',
            summary: 'Viewport screenshot captured from an isolated browser context.',
            title: 'Browser screenshot',
          },
        ],
        status: 'captured',
        summary: 'Browser evidence captured / artifacts=screenshot / credentials=no / mutation=no',
      },
      runId: 'run_1',
      taskId: 'task_1',
    });

    expect(persisted.artifact).toMatchObject({
      id: 'artifact_browser_1',
      kind: 'browser_evidence',
      sourceId: 'run_1',
      taskId: 'task_1',
      title: 'Browser evidence',
    });
    expect(JSON.parse(persisted.artifact.content)).toMatchObject({
      artifacts: [
        {
          kind: 'screenshot',
          path: '/tmp/browser-evidence-screenshot.png',
        },
      ],
      policy: {
        allowCredentials: false,
        isolatedProfile: true,
        networkPolicy: 'allowlisted',
      },
      result: {
        status: 'captured',
      },
    });
    expect(createdSteps).toEqual([
      {
        input: 'http://127.0.0.1:4173/browser-evidence-smoke.html',
        kind: 'tool_result',
        output: 'Browser evidence captured / artifacts=screenshot / credentials=no / mutation=no',
        runId: 'run_1',
        status: 'completed',
        title: 'browser evidence captured',
      },
      {
        input: 'screenshot',
        kind: 'artifact',
        output: 'artifact_browser_1',
        runId: 'run_1',
        status: 'completed',
        title: 'record browser evidence artifact',
      },
      {
        input: JSON.stringify({
          targets: ['task_md'],
          items: [{
            target: 'task_md',
            reason: 'important_file',
            referencePath: 'artifact_browser_1',
          }],
        }),
        kind: 'plan',
        output: '- Task.md: important_file / reference=artifact_browser_1',
        runId: 'run_1',
        status: 'completed',
        title: '任务记忆建议',
      },
    ]);
    expect(persisted.steps.memoryGuidance?.output).toBe('- Task.md: important_file / reference=artifact_browser_1');
  });
});
