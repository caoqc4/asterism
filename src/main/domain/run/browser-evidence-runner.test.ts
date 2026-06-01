import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildBrowserEvidenceRunnerSmokeFixture,
  buildDefaultBrowserSessionPolicy,
} from '../../../shared/types/browser-evidence.js';
import { runBrowserEvidenceRequest } from './browser-evidence-runner.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, {
    force: true,
    recursive: true,
  })));
});

describe('browser evidence runner', () => {
  it('captures read-only page summary, visible text, and screenshot artifacts', async () => {
    const outputDir = await makeTempDir();
    const fixture = buildBrowserEvidenceRunnerSmokeFixture({
      origin: 'http://127.0.0.1:4173',
    });
    const browserType = createFakeBrowserType({
      bodyText: 'Browser Evidence Smoke\nThis fixture is local, credential-free, and read-only.',
      title: 'Taskplane Browser Evidence Smoke',
      url: fixture.request.url,
    });

    const result = await runBrowserEvidenceRequest({
      browserType,
      outputDir,
      request: fixture.request,
    });

    expect(result).toMatchObject({
      status: 'captured',
      summary: expect.stringContaining('credentials=no / mutation=no'),
    });
    expect(result.status === 'captured' ? result.artifacts.map((artifact) => artifact.kind) : []).toEqual([
      'page_summary',
      'visible_text',
      'screenshot',
    ]);
    expect(result.status === 'captured' ? result.artifacts[0].content : '').toContain(
      'Taskplane Browser Evidence Smoke',
    );
    expect(result.status === 'captured' ? result.artifacts[2].path : '').toBe(
      path.join(outputDir, 'browser-evidence-screenshot.png'),
    );
    expect(await fs.readFile(path.join(outputDir, 'browser-evidence-screenshot.png'), 'utf8')).toBe('png');
    expect(browserType.calls).toEqual([
      'launch:headless=true',
      'newContext:downloads=false',
      'newPage',
      'route:**/*',
      'routeContinue:http://127.0.0.1:4173/browser-evidence-smoke.html',
      'routeAbort:https://tracker.example.com/pixel.png:blockedbyclient',
      'goto:http://127.0.0.1:4173/browser-evidence-smoke.html:domcontentloaded',
      'screenshot:browser-evidence-screenshot.png',
      'contextClose',
      'browserClose',
    ]);
  });

  it('blocks invalid or unsafe requests before launching a browser', async () => {
    const outputDir = await makeTempDir();
    const browserType = createFakeBrowserType({
      bodyText: '',
      title: '',
      url: 'https://publisher.example.com/post',
    });

    const result = await runBrowserEvidenceRequest({
      browserType,
      outputDir,
      request: {
        action: 'capture_screenshot',
        allowedEvidenceKinds: ['screenshot'],
        policy: buildDefaultBrowserSessionPolicy({
          allowedOrigins: ['https://docs.example.com'],
        }),
        purpose: 'Capture a page outside the allowlist.',
        url: 'https://publisher.example.com/post',
      },
    });

    expect(result).toMatchObject({
      blockedReasons: expect.arrayContaining([
        'Browser evidence request URL must match an allowed origin.',
      ]),
      status: 'blocked',
    });
    expect(browserType.calls).toEqual([]);
  });
});

async function makeTempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-browser-evidence-test-'));
  tempRoots.push(root);
  return root;
}

function createFakeBrowserType(params: {
  bodyText: string;
  title: string;
  url: string;
}) {
  const calls: string[] = [];
  const browserType = {
    calls,
    launch: async (options: { headless: true }) => {
      calls.push(`launch:headless=${String(options.headless)}`);
      return {
        close: async () => {
          calls.push('browserClose');
        },
        newContext: async (options: { acceptDownloads: false }) => {
          calls.push(`newContext:downloads=${String(options.acceptDownloads)}`);
          return {
            close: async () => {
              calls.push('contextClose');
            },
            newPage: async () => {
              calls.push('newPage');
              return {
                goto: async (url: string, options: { waitUntil: 'domcontentloaded' }) => {
                  calls.push(`goto:${url}:${options.waitUntil}`);
                },
                locator: () => ({
                  innerText: async () => params.bodyText,
                }),
                route: async (pattern: string, handler: (route: {
                  abort: (errorCode?: string) => Promise<void>;
                  continue: () => Promise<void>;
                  request: () => { url: () => string };
                }) => Promise<void>) => {
                  calls.push(`route:${pattern}`);
                  await handler(createRoute(params.url, calls));
                  await handler(createRoute('https://tracker.example.com/pixel.png', calls));
                },
                screenshot: async (options: { path: string }) => {
                  calls.push(`screenshot:${path.basename(options.path)}`);
                  await fs.writeFile(options.path, 'png', 'utf8');
                  return Buffer.from('png');
                },
                title: async () => params.title,
                url: () => params.url,
              };
            },
          };
        },
      };
    },
  };
  return browserType;
}

function createRoute(url: string, calls: string[]) {
  return {
    abort: async (errorCode?: string) => {
      calls.push(`routeAbort:${url}:${errorCode ?? ''}`);
    },
    continue: async () => {
      calls.push(`routeContinue:${url}`);
    },
    request: () => ({
      url: () => url,
    }),
  };
}
