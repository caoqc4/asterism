export const BROWSER_EVIDENCE_ACTIONS = [
  'open_url',
  'inspect_page',
  'extract_visible_text',
  'capture_screenshot',
  'capture_trace',
  'run_readonly_check',
] as const;

export type BrowserEvidenceAction = typeof BROWSER_EVIDENCE_ACTIONS[number];

export const BROWSER_EVIDENCE_KINDS = [
  'page_summary',
  'visible_text',
  'screenshot',
  'trace',
  'dom_snapshot',
] as const;

export type BrowserEvidenceKind = typeof BROWSER_EVIDENCE_KINDS[number];

export type BrowserEvidenceArtifact = {
  kind: BrowserEvidenceKind;
  title: string;
  summary: string;
  content?: string | null;
  path?: string | null;
};

export type BrowserSessionPolicy = {
  allowCredentials: false;
  allowedOrigins: string[];
  isolatedProfile: true;
  networkPolicy: 'allowlisted';
  outputLimitBytes: number;
  timeoutMs: number;
};

export type BrowserEvidenceRequest = {
  action: BrowserEvidenceAction;
  allowedEvidenceKinds: BrowserEvidenceKind[];
  policy: BrowserSessionPolicy;
  purpose: string;
  url: string;
};

export type BrowserEvidenceResult =
  | {
      artifacts: BrowserEvidenceArtifact[];
      status: 'captured';
      summary: string;
    }
  | {
      blockedReasons: string[];
      status: 'blocked';
      summary: string;
    }
  | {
      artifacts: BrowserEvidenceArtifact[];
      failureReason: string;
      status: 'failed';
      summary: string;
    };

export type BrowserEvidenceRequestValidation =
  | {
      blockedReasons: [];
      request: BrowserEvidenceRequest;
      summary: string;
      valid: true;
    }
  | {
      blockedReasons: string[];
      summary: string;
      valid: false;
    };

const MAX_BROWSER_EVIDENCE_TIMEOUT_MS = 120_000;
const MAX_BROWSER_EVIDENCE_OUTPUT_LIMIT_BYTES = 256_000;

const BROWSER_EVIDENCE_ACTION_SET = new Set<string>(BROWSER_EVIDENCE_ACTIONS);
const BROWSER_EVIDENCE_KIND_SET = new Set<string>(BROWSER_EVIDENCE_KINDS);

export function isBrowserEvidenceAction(value: unknown): value is BrowserEvidenceAction {
  return typeof value === 'string' && BROWSER_EVIDENCE_ACTION_SET.has(value);
}

export function isBrowserEvidenceKind(value: unknown): value is BrowserEvidenceKind {
  return typeof value === 'string' && BROWSER_EVIDENCE_KIND_SET.has(value);
}

export function buildDefaultBrowserSessionPolicy(params: {
  allowedOrigins: string[];
  outputLimitBytes?: number;
  timeoutMs?: number;
}): BrowserSessionPolicy {
  return {
    allowCredentials: false,
    allowedOrigins: params.allowedOrigins,
    isolatedProfile: true,
    networkPolicy: 'allowlisted',
    outputLimitBytes: params.outputLimitBytes ?? 64_000,
    timeoutMs: params.timeoutMs ?? 30_000,
  };
}

export function validateBrowserEvidenceRequest(request: unknown): BrowserEvidenceRequestValidation {
  if (!request || typeof request !== 'object') {
    return invalidBrowserEvidenceRequest(['Browser evidence request must be an object.']);
  }

  const candidate = request as Partial<BrowserEvidenceRequest>;
  const blockedReasons: string[] = [];

  if (!isBrowserEvidenceAction(candidate.action)) {
    blockedReasons.push('Browser evidence request action must be read-only.');
  }

  if (typeof candidate.purpose !== 'string' || !candidate.purpose.trim()) {
    blockedReasons.push('Browser evidence request requires a purpose.');
  }

  const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
  const parsedUrl = parseBrowserEvidenceUrl(url);

  if (!parsedUrl) {
    blockedReasons.push('Browser evidence request requires an http, https, or localhost URL.');
  }

  const evidenceKinds = Array.isArray(candidate.allowedEvidenceKinds)
    ? candidate.allowedEvidenceKinds
    : [];
  const normalizedEvidenceKinds = evidenceKinds
    .filter(isBrowserEvidenceKind);

  if (!evidenceKinds.length) {
    blockedReasons.push('Browser evidence request requires at least one evidence kind.');
  } else if (normalizedEvidenceKinds.length !== evidenceKinds.length) {
    blockedReasons.push('Browser evidence request evidence kinds must be supported read-only artifacts.');
  }

  const policy = candidate.policy;
  if (!policy || typeof policy !== 'object') {
    blockedReasons.push('Browser evidence request requires a browser session policy.');
  } else {
    if (policy.allowCredentials !== false) {
      blockedReasons.push('Browser evidence policy must not allow credentials.');
    }

    if (policy.isolatedProfile !== true) {
      blockedReasons.push('Browser evidence policy must use an isolated profile.');
    }

    if (policy.networkPolicy !== 'allowlisted') {
      blockedReasons.push('Browser evidence policy must use allowlisted network only.');
    }

    if (!Array.isArray(policy.allowedOrigins) || policy.allowedOrigins.length === 0) {
      blockedReasons.push('Browser evidence policy requires at least one allowed origin.');
    } else if (parsedUrl && !isUrlOriginAllowed(parsedUrl, policy.allowedOrigins)) {
      blockedReasons.push('Browser evidence request URL must match an allowed origin.');
    }

    if (!Number.isInteger(policy.timeoutMs) || policy.timeoutMs <= 0) {
      blockedReasons.push('Browser evidence policy requires a positive integer timeout.');
    } else if (policy.timeoutMs > MAX_BROWSER_EVIDENCE_TIMEOUT_MS) {
      blockedReasons.push('Browser evidence policy timeout exceeds the maximum allowed duration.');
    }

    if (!Number.isInteger(policy.outputLimitBytes) || policy.outputLimitBytes <= 0) {
      blockedReasons.push('Browser evidence policy requires a positive integer output limit.');
    } else if (policy.outputLimitBytes > MAX_BROWSER_EVIDENCE_OUTPUT_LIMIT_BYTES) {
      blockedReasons.push('Browser evidence policy output limit exceeds the maximum allowed size.');
    }
  }

  if (blockedReasons.length > 0 || !parsedUrl || !policy) {
    return invalidBrowserEvidenceRequest(blockedReasons);
  }

  return {
    blockedReasons: [],
    request: {
      action: candidate.action as BrowserEvidenceAction,
      allowedEvidenceKinds: normalizedEvidenceKinds,
      policy: {
        allowCredentials: false,
        allowedOrigins: policy.allowedOrigins,
        isolatedProfile: true,
        networkPolicy: 'allowlisted',
        outputLimitBytes: policy.outputLimitBytes,
        timeoutMs: policy.timeoutMs,
      },
      purpose: candidate.purpose!.trim(),
      url: parsedUrl.toString(),
    },
    summary: `Browser evidence request valid for ${parsedUrl.origin}.`,
    valid: true,
  };
}

function parseBrowserEvidenceUrl(value: string): URL | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isUrlOriginAllowed(url: URL, allowedOrigins: string[]): boolean {
  return allowedOrigins.some((origin) => origin === url.origin);
}

function invalidBrowserEvidenceRequest(blockedReasons: string[]): BrowserEvidenceRequestValidation {
  const reasons = blockedReasons.length
    ? blockedReasons
    : ['Browser evidence request is invalid.'];

  return {
    blockedReasons: reasons,
    summary: `Browser evidence request blocked: ${reasons.join('; ')}`,
    valid: false,
  };
}

