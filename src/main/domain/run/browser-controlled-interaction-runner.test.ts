import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  buildBrowserControlledInteractionLocalQaFixture,
  buildDefaultBrowserControlledInteractionPolicy,
} from '../../../shared/types/browser-controlled-interaction.js';
import { runBrowserControlledInteractionLocalQa } from './browser-controlled-interaction-runner.js';

describe('browser controlled interaction runner', () => {
  let outputDir = '';

  beforeEach(async () => {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-browser-controlled-runner-test-'));
  });

  afterEach(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('executes the local QA fixture actions in an isolated browser contract', async () => {
    const fixture = buildBrowserControlledInteractionLocalQaFixture({
      origin: 'http://127.0.0.1:5173',
    });
    const browserType = createFakeBrowserType();

    const result = await runBrowserControlledInteractionLocalQa({
      browserType,
      outputDir,
      requests: fixture.requests,
    });

    expect(result).toMatchObject({
      status: 'completed',
      summary: 'Browser controlled local QA completed / url=http://127.0.0.1:5173/browser-controlled-local-qa.html / actions=navigate,click,type_text,select_option,capture_evidence / artifacts=page_summary,visible_text,screenshot / credentials=no / externalOrigin=no / modelExposure=hidden',
    });
    expect(result.status === 'completed' ? result.artifacts.map((artifact) => artifact.kind) : []).toEqual([
      'page_summary',
      'visible_text',
      'screenshot',
    ]);
    expect(await fs.readFile(path.join(outputDir, 'browser-controlled-local-qa-screenshot.png'), 'utf8')).toBe('png');
    expect(browserType.calls).toEqual([
      'launch',
      'newContext',
      'newPage',
      'route:**/*',
      'goto:http://127.0.0.1:5173/browser-controlled-local-qa.html:domcontentloaded',
      'click:[data-ref="open-filter"]',
      'fill:[data-ref="search-note"]:local qa',
      'select:[data-ref="mode-select"]:Review',
      'innerText:body',
      'screenshot:browser-controlled-local-qa-screenshot.png',
      'contextClose',
      'browserClose',
    ]);
  });

  it('blocks invalid requests before launching a browser', async () => {
    const browserType = createFakeBrowserType();

    const result = await runBrowserControlledInteractionLocalQa({
      browserType,
      outputDir,
      requests: [
        {
          descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
          action: {
            action: 'click',
            currentUrl: 'https://external.example.com',
            targetLabel: 'Open external',
          },
          policy: buildDefaultBrowserControlledInteractionPolicy({
            allowedActions: ['click'],
            allowedOrigins: ['http://localhost:5173'],
          }),
          purpose: 'Attempt off-allowlist navigation.',
        },
      ],
    });

    expect(result).toMatchObject({
      blockedReasons: ['Browser controlled interaction action URL must match an allowed origin.'],
      status: 'blocked',
    });
    expect(browserType.calls).toEqual([]);
  });

  it('blocks checkpoint-required actions before launching a browser', async () => {
    const browserType = createFakeBrowserType();

    const result = await runBrowserControlledInteractionLocalQa({
      browserType,
      outputDir,
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

    expect(result).toMatchObject({
      blockedReasons: ['Browser controlled interaction checkpoint execution is deferred until BCI4.'],
      status: 'blocked',
      summary: 'Browser controlled interaction blocked before browser start: action=click / checkpoint=required / origin=http://localhost:5173',
    });
    expect(browserType.calls).toEqual([]);
  });
});

function createFakeBrowserType() {
  const calls: string[] = [];
  let currentUrl = '';

  const browserType = {
    calls,
    launch: async () => {
      calls.push('launch');
      return {
        close: async () => {
          calls.push('browserClose');
        },
        newContext: async () => {
          calls.push('newContext');
          return {
            close: async () => {
              calls.push('contextClose');
            },
            newPage: async () => {
              calls.push('newPage');
              return {
                goto: async (url: string, options: { waitUntil: string }) => {
                  currentUrl = url;
                  calls.push(`goto:${url}:${options.waitUntil}`);
                },
                locator: (selector: string) => ({
                  click: async () => {
                    calls.push(`click:${selector}`);
                  },
                  fill: async (value: string) => {
                    calls.push(`fill:${selector}:${value}`);
                  },
                  innerText: async () => {
                    calls.push(`innerText:${selector}`);
                    return 'Controlled Interaction Local QA\nReady for bounded local QA.';
                  },
                  selectOption: async (value: string) => {
                    calls.push(`select:${selector}:${value}`);
                  },
                }),
                route: async (url: string) => {
                  calls.push(`route:${url}`);
                },
                screenshot: async (options: { path: string }) => {
                  calls.push(`screenshot:${path.basename(options.path)}`);
                  await fs.writeFile(options.path, 'png', 'utf8');
                  return Buffer.from('png');
                },
                title: async () => 'Taskplane Browser Controlled Local QA',
                url: () => currentUrl,
              };
            },
          };
        },
      };
    },
  };

  return browserType;
}
