import fs from 'node:fs/promises';
import path from 'node:path';

import type { BrowserEvidenceArtifact } from '../../../shared/types/browser-evidence.js';
import {
  type BrowserControlledInteractionRequest,
  type BrowserControlledInteractionResult,
  validateBrowserControlledInteractionRequest,
} from '../../../shared/types/browser-controlled-interaction.js';

type BrowserControlledBrowserType = {
  launch: (options: {
    headless: true;
    timeout: number;
  }) => Promise<BrowserControlledBrowser>;
};

type BrowserControlledBrowser = {
  close: () => Promise<void>;
  newContext: (options: {
    acceptDownloads: false;
    ignoreHTTPSErrors: false;
    javaScriptEnabled: true;
    viewport: {
      height: number;
      width: number;
    };
  }) => Promise<BrowserControlledContext>;
};

type BrowserControlledContext = {
  close: () => Promise<void>;
  newPage: () => Promise<BrowserControlledPage>;
};

type BrowserControlledRoute = {
  abort: (errorCode?: string) => Promise<void>;
  continue: () => Promise<void>;
  request: () => {
    url: () => string;
  };
};

type BrowserControlledLocator = {
  click: (options: { timeout: number }) => Promise<void>;
  fill: (value: string, options: { timeout: number }) => Promise<void>;
  innerText: (options: { timeout: number }) => Promise<string>;
  selectOption: (value: string, options: { timeout: number }) => Promise<unknown>;
};

type BrowserControlledPage = {
  goto: (url: string, options: {
    timeout: number;
    waitUntil: 'domcontentloaded';
  }) => Promise<unknown>;
  locator: (selector: string) => BrowserControlledLocator;
  route: (url: string, handler: (route: BrowserControlledRoute) => Promise<void>) => Promise<void>;
  screenshot: (options: {
    fullPage: false;
    path: string;
    type: 'png';
  }) => Promise<Buffer>;
  title: () => Promise<string>;
  url: () => string;
};

export type BrowserControlledInteractionRunnerInput = {
  browserType: BrowserControlledBrowserType;
  outputDir: string;
  requests: BrowserControlledInteractionRequest[];
};

export async function runBrowserControlledInteractionLocalQa(
  input: BrowserControlledInteractionRunnerInput,
): Promise<BrowserControlledInteractionResult> {
  const validations = input.requests.map((request) => validateBrowserControlledInteractionRequest(request));
  const invalid = validations.find((validation) => !validation.valid);
  if (invalid && !invalid.valid) {
    return {
      blockedReasons: invalid.blockedReasons,
      status: 'blocked',
      summary: invalid.summary,
    };
  }

  const steps = validations.flatMap((validation) => validation.valid ? [validation.step] : []);
  const checkpointStep = steps.find((step) => step.checkpointRequired);
  if (checkpointStep) {
    return {
      blockedReasons: ['Browser controlled interaction checkpoint execution is deferred until BCI4.'],
      status: 'blocked',
      summary: `Browser controlled interaction blocked before browser start: ${checkpointStep.summary}`,
    };
  }

  const policy = validations[0]?.valid ? validations[0].request.policy : null;
  if (!policy) {
    return {
      blockedReasons: ['Browser controlled interaction local QA requires at least one request.'],
      status: 'blocked',
      summary: 'Browser controlled interaction local QA blocked: no requests.',
    };
  }

  const allowedOrigins = new Set(policy.allowedOrigins);
  await fs.mkdir(input.outputDir, { recursive: true });

  let browser: BrowserControlledBrowser | null = null;
  let context: BrowserControlledContext | null = null;

  try {
    browser = await input.browserType.launch({
      headless: true,
      timeout: policy.timeoutMs,
    });
    context = await browser.newContext({
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true,
      viewport: {
        height: 720,
        width: 1280,
      },
    });
    const page = await context.newPage();

    await page.route('**/*', async (route) => {
      const targetOrigin = parseOrigin(route.request().url());
      if (targetOrigin && allowedOrigins.has(targetOrigin)) {
        await route.continue();
        return;
      }

      await route.abort('blockedbyclient');
    });

    const artifacts: BrowserEvidenceArtifact[] = [];
    for (const step of steps) {
      const action = step.action;

      if (action.action === 'navigate' && action.url) {
        await page.goto(action.url, {
          timeout: policy.timeoutMs,
          waitUntil: 'domcontentloaded',
        });
        continue;
      }

      if (action.action === 'click') {
        await getActionLocator(page, action.targetRef, action.targetLabel).click({
          timeout: Math.min(policy.timeoutMs, 5_000),
        });
        continue;
      }

      if (action.action === 'type_text' && action.text) {
        await getActionLocator(page, action.targetRef, action.targetLabel).fill(action.text, {
          timeout: Math.min(policy.timeoutMs, 5_000),
        });
        continue;
      }

      if (action.action === 'select_option' && action.value) {
        await getActionLocator(page, action.targetRef, action.targetLabel).selectOption(action.value, {
          timeout: Math.min(policy.timeoutMs, 5_000),
        });
        continue;
      }

      if (action.action === 'capture_evidence') {
        artifacts.push(...await captureBrowserControlledArtifacts({
          outputDir: input.outputDir,
          page,
          outputLimitBytes: policy.outputLimitBytes,
        }));
      }
    }

    return {
      artifacts,
      status: 'completed',
      summary: [
        'Browser controlled local QA completed',
        `url=${page.url()}`,
        `actions=${steps.map((step) => step.action.action).join(',')}`,
        `artifacts=${artifacts.map((artifact) => artifact.kind).join(',') || 'none'}`,
        'credentials=no',
        'externalOrigin=no',
        'modelExposure=hidden',
      ].join(' / '),
    };
  } catch (error) {
    return {
      blockedReasons: [error instanceof Error ? error.message : String(error)],
      status: 'blocked',
      summary: 'Browser controlled local QA blocked before completion.',
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

export async function createPlaywrightBrowserControlledInteractionRunner(): Promise<BrowserControlledBrowserType> {
  const playwright = await import('playwright');
  return playwright.chromium;
}

async function captureBrowserControlledArtifacts(params: {
  outputDir: string;
  outputLimitBytes: number;
  page: BrowserControlledPage;
}): Promise<BrowserEvidenceArtifact[]> {
  const title = await params.page.title();
  const visibleText = await boundedText(
    params.page.locator('body').innerText({ timeout: 5_000 }),
    params.outputLimitBytes,
  );
  const screenshotPath = path.join(params.outputDir, 'browser-controlled-local-qa-screenshot.png');
  await params.page.screenshot({
    fullPage: false,
    path: screenshotPath,
    type: 'png',
  });

  return [
    {
      content: JSON.stringify({
        title,
        url: params.page.url(),
      }),
      kind: 'page_summary',
      summary: `Title: ${title || '(untitled)'}`,
      title: 'Browser page summary',
    },
    {
      content: visibleText,
      kind: 'visible_text',
      summary: `${visibleText.length} visible text characters captured.`,
      title: 'Browser visible text',
    },
    {
      kind: 'screenshot',
      path: screenshotPath,
      summary: 'Viewport screenshot captured from an isolated browser context.',
      title: 'Browser screenshot',
    },
  ];
}

function getActionLocator(
  page: BrowserControlledPage,
  targetRef: string | null | undefined,
  targetLabel: string | null | undefined,
): BrowserControlledLocator {
  if (targetRef?.trim()) {
    return page.locator(`[data-ref="${escapeAttributeValue(targetRef.trim())}"]`);
  }

  return page.locator(`text=${targetLabel?.trim() ?? ''}`);
}

async function boundedText(textPromise: Promise<string>, limitBytes: number): Promise<string> {
  const text = await textPromise;
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.byteLength <= limitBytes) {
    return text;
  }

  return buffer.subarray(0, limitBytes).toString('utf8');
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
