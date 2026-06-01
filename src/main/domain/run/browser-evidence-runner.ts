import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  BrowserEvidenceArtifact,
  BrowserEvidenceRequest,
  BrowserEvidenceResult,
} from '../../../shared/types/browser-evidence.js';
import { validateBrowserEvidenceRequest } from '../../../shared/types/browser-evidence.js';

type BrowserEvidenceBrowserType = {
  launch: (options: {
    headless: true;
    timeout: number;
  }) => Promise<BrowserEvidenceBrowser>;
};

type BrowserEvidenceBrowser = {
  close: () => Promise<void>;
  newContext: (options: {
    acceptDownloads: false;
    ignoreHTTPSErrors: false;
    javaScriptEnabled: true;
    viewport: {
      height: number;
      width: number;
    };
  }) => Promise<BrowserEvidenceContext>;
};

type BrowserEvidenceContext = {
  close: () => Promise<void>;
  newPage: () => Promise<BrowserEvidencePage>;
};

type BrowserEvidenceRoute = {
  abort: (errorCode?: string) => Promise<void>;
  continue: () => Promise<void>;
  request: () => {
    url: () => string;
  };
};

type BrowserEvidencePage = {
  goto: (url: string, options: {
    timeout: number;
    waitUntil: 'domcontentloaded';
  }) => Promise<unknown>;
  locator: (selector: string) => {
    innerText: (options: { timeout: number }) => Promise<string>;
  };
  route: (url: string, handler: (route: BrowserEvidenceRoute) => Promise<void>) => Promise<void>;
  screenshot: (options: {
    fullPage: false;
    path: string;
    type: 'png';
  }) => Promise<Buffer>;
  title: () => Promise<string>;
  url: () => string;
};

export type BrowserEvidenceRunnerInput = {
  browserType: BrowserEvidenceBrowserType;
  outputDir: string;
  request: BrowserEvidenceRequest;
};

export async function runBrowserEvidenceRequest(
  input: BrowserEvidenceRunnerInput,
): Promise<BrowserEvidenceResult> {
  const validation = validateBrowserEvidenceRequest(input.request);
  if (!validation.valid) {
    return {
      blockedReasons: validation.blockedReasons,
      status: 'blocked',
      summary: validation.summary,
    };
  }

  const request = validation.request;
  const allowedOrigins = new Set(request.policy.allowedOrigins);
  await fs.mkdir(input.outputDir, { recursive: true });

  let browser: BrowserEvidenceBrowser | null = null;
  let context: BrowserEvidenceContext | null = null;

  try {
    browser = await input.browserType.launch({
      headless: true,
      timeout: request.policy.timeoutMs,
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

    await page.goto(request.url, {
      timeout: request.policy.timeoutMs,
      waitUntil: 'domcontentloaded',
    });

    const title = await page.title();
    const visibleText = await boundedText(
      page.locator('body').innerText({ timeout: Math.min(request.policy.timeoutMs, 5_000) }),
      request.policy.outputLimitBytes,
    );
    const screenshotPath = path.join(input.outputDir, 'browser-evidence-screenshot.png');
    await page.screenshot({
      fullPage: false,
      path: screenshotPath,
      type: 'png',
    });

    const artifacts = buildArtifacts({
      pageUrl: page.url(),
      request,
      screenshotPath,
      title,
      visibleText,
    });

    return {
      artifacts,
      status: 'captured',
      summary: [
        'Browser evidence captured',
        `url=${page.url()}`,
        `artifacts=${artifacts.map((artifact) => artifact.kind).join(',')}`,
        'credentials=no',
        'mutation=no',
      ].join(' / '),
    };
  } catch (error) {
    return {
      artifacts: [],
      failureReason: error instanceof Error ? error.message : String(error),
      status: 'failed',
      summary: 'Browser evidence runner failed before producing artifacts.',
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

export async function createPlaywrightBrowserEvidenceRunner(): Promise<BrowserEvidenceBrowserType> {
  const playwright = await import('playwright');
  return playwright.chromium;
}

function buildArtifacts(params: {
  pageUrl: string;
  request: BrowserEvidenceRequest;
  screenshotPath: string;
  title: string;
  visibleText: string;
}): BrowserEvidenceArtifact[] {
  const artifacts: BrowserEvidenceArtifact[] = [];
  const allowedKinds = new Set(params.request.allowedEvidenceKinds);

  if (allowedKinds.has('page_summary')) {
    artifacts.push({
      content: JSON.stringify({
        title: params.title,
        url: params.pageUrl,
      }),
      kind: 'page_summary',
      summary: `Title: ${params.title || '(untitled)'}`,
      title: 'Browser page summary',
    });
  }

  if (allowedKinds.has('visible_text')) {
    artifacts.push({
      content: params.visibleText,
      kind: 'visible_text',
      summary: `${params.visibleText.length} visible text characters captured.`,
      title: 'Browser visible text',
    });
  }

  if (allowedKinds.has('screenshot')) {
    artifacts.push({
      kind: 'screenshot',
      path: params.screenshotPath,
      summary: 'Viewport screenshot captured from an isolated browser context.',
      title: 'Browser screenshot',
    });
  }

  return artifacts;
}

async function boundedText(textPromise: Promise<string>, limitBytes: number): Promise<string> {
  const text = await textPromise;
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.byteLength <= limitBytes) {
    return text;
  }

  return buffer.subarray(0, limitBytes).toString('utf8');
}

function parseOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
