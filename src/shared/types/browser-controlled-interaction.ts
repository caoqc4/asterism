import type { BrowserEvidenceArtifact, BrowserEvidenceKind } from './browser-evidence.js';

export const BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID = 'browser.controlled_interaction' as const;

export const BROWSER_CONTROLLED_ACTIONS = [
  'navigate',
  'click',
  'type_text',
  'select_option',
  'press_key',
  'scroll',
  'wait_for',
  'dismiss_popup',
  'capture_evidence',
] as const;

export type BrowserControlledAction = typeof BROWSER_CONTROLLED_ACTIONS[number];

export type BrowserSensitiveFieldPolicy = 'block';
export type BrowserSideEffectPolicy = 'checkpoint_required';

export type BrowserControlledInteractionPolicy = {
  allowCredentials: false;
  allowedActions: BrowserControlledAction[];
  allowedEvidenceKinds: BrowserEvidenceKind[];
  allowedOrigins: string[];
  isolatedProfile: true;
  maxActions: number;
  networkPolicy: 'allowlisted';
  operatorStarted: true;
  outputLimitBytes: number;
  sensitiveFieldPolicy: BrowserSensitiveFieldPolicy;
  sideEffectPolicy: BrowserSideEffectPolicy;
  timeoutMs: number;
};

export type BrowserControlledInteractionAction = {
  action: BrowserControlledAction;
  currentUrl?: string | null;
  targetLabel?: string | null;
  targetRef?: string | null;
  text?: string | null;
  url?: string | null;
  value?: string | null;
};

export type BrowserControlledInteractionRequest = {
  descriptorId: typeof BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID;
  action: BrowserControlledInteractionAction;
  policy: BrowserControlledInteractionPolicy;
  purpose: string;
};

export type BrowserControlledInteractionStepDraft = {
  action: BrowserControlledInteractionAction;
  artifactKinds: BrowserEvidenceKind[];
  checkpointRequired: boolean;
  currentUrl: string | null;
  sideEffectClassification: 'none' | 'possible_external_side_effect';
  summary: string;
};

export type BrowserControlledInteractionResult =
  | {
      artifacts: BrowserEvidenceArtifact[];
      status: 'completed';
      summary: string;
    }
  | {
      blockedReasons: string[];
      status: 'blocked';
      summary: string;
    }
  | {
      checkpoint: BrowserControlledInteractionCheckpointPayloadV1;
      status: 'needs_confirmation';
      summary: string;
    };

export type BrowserControlledInteractionCheckpointPayloadV1 = {
  version: 1;
  kind: 'browser_controlled_interaction';
  descriptorId: typeof BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID;
  action: BrowserControlledInteractionAction;
  currentUrl: string;
  decisionId: string | null;
  decisionTitle: string;
  origin: string;
  policySnapshot: BrowserControlledInteractionPolicy;
  screenshotArtifactId: string | null;
  sideEffectClassification: 'possible_external_side_effect';
  visibleTextSummary: string | null;
};

export type BrowserControlledInteractionRequestValidation =
  | {
      blockedReasons: [];
      request: BrowserControlledInteractionRequest;
      step: BrowserControlledInteractionStepDraft;
      summary: string;
      valid: true;
    }
  | {
      blockedReasons: string[];
      summary: string;
      valid: false;
    };

const BROWSER_CONTROLLED_ACTION_SET = new Set<string>(BROWSER_CONTROLLED_ACTIONS);
const MAX_BROWSER_CONTROLLED_ACTIONS = 20;
const MAX_BROWSER_CONTROLLED_TIMEOUT_MS = 120_000;
const MAX_BROWSER_CONTROLLED_OUTPUT_LIMIT_BYTES = 512_000;
const SAFE_KEYS = new Set(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Escape', 'Tab']);

export function isBrowserControlledAction(value: unknown): value is BrowserControlledAction {
  return typeof value === 'string' && BROWSER_CONTROLLED_ACTION_SET.has(value);
}

export function buildDefaultBrowserControlledInteractionPolicy(params: {
  allowedOrigins: string[];
  allowedActions?: BrowserControlledAction[];
  allowedEvidenceKinds?: BrowserEvidenceKind[];
  maxActions?: number;
  outputLimitBytes?: number;
  timeoutMs?: number;
}): BrowserControlledInteractionPolicy {
  return {
    allowCredentials: false,
    allowedActions: params.allowedActions ?? ['navigate', 'click', 'capture_evidence'],
    allowedEvidenceKinds: params.allowedEvidenceKinds ?? ['screenshot', 'visible_text', 'page_summary'],
    allowedOrigins: params.allowedOrigins,
    isolatedProfile: true,
    maxActions: params.maxActions ?? 8,
    networkPolicy: 'allowlisted',
    operatorStarted: true,
    outputLimitBytes: params.outputLimitBytes ?? 128_000,
    sensitiveFieldPolicy: 'block',
    sideEffectPolicy: 'checkpoint_required',
    timeoutMs: params.timeoutMs ?? 60_000,
  };
}

export function validateBrowserControlledInteractionRequest(
  request: unknown,
): BrowserControlledInteractionRequestValidation {
  if (!request || typeof request !== 'object') {
    return invalidBrowserControlledInteractionRequest(['Browser controlled interaction request must be an object.']);
  }

  const candidate = request as Partial<BrowserControlledInteractionRequest>;
  const blockedReasons: string[] = [];
  const purpose = typeof candidate.purpose === 'string' ? candidate.purpose.trim() : '';

  if (candidate.descriptorId !== BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID) {
    blockedReasons.push('Browser controlled interaction request must use the controlled interaction descriptor.');
  }

  if (!purpose) {
    blockedReasons.push('Browser controlled interaction request requires a purpose.');
  }

  const action = candidate.action;
  if (!action || typeof action !== 'object') {
    blockedReasons.push('Browser controlled interaction request requires an action.');
  } else if (!isBrowserControlledAction(action.action)) {
    blockedReasons.push('Browser controlled interaction action is not supported.');
  }

  const policy = candidate.policy;
  if (!policy || typeof policy !== 'object') {
    blockedReasons.push('Browser controlled interaction request requires a policy.');
  } else {
    validateBrowserControlledPolicy(policy, blockedReasons);
    if (action && typeof action === 'object') {
      validateBrowserControlledActionAgainstPolicy(action, policy, blockedReasons);
    }
  }

  if (blockedReasons.length || !action || typeof action !== 'object' || !policy || typeof policy !== 'object') {
    return invalidBrowserControlledInteractionRequest(blockedReasons);
  }

  const currentUrl = typeof action.currentUrl === 'string' && action.currentUrl.trim()
    ? action.currentUrl.trim()
    : typeof action.url === 'string' && action.url.trim()
      ? action.url.trim()
      : null;
  const sideEffectClassification = isPotentialBrowserSideEffect(action)
    ? 'possible_external_side_effect'
    : 'none';
  const step: BrowserControlledInteractionStepDraft = {
    action: {
      ...action,
      action: action.action as BrowserControlledAction,
    },
    artifactKinds: policy.allowedEvidenceKinds,
    checkpointRequired: sideEffectClassification !== 'none',
    currentUrl,
    sideEffectClassification,
    summary: [
      `action=${action.action}`,
      `checkpoint=${sideEffectClassification === 'none' ? 'no' : 'required'}`,
      `origin=${currentUrl ? parseBrowserControlledUrl(currentUrl)?.origin ?? 'unknown' : 'unknown'}`,
    ].join(' / '),
  };

  return {
    blockedReasons: [],
    request: {
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      action: step.action,
      policy,
      purpose,
    },
    step,
    summary: `Browser controlled interaction request valid / ${step.summary}`,
    valid: true,
  };
}

function validateBrowserControlledPolicy(
  policy: Partial<BrowserControlledInteractionPolicy>,
  blockedReasons: string[],
): void {
  if (policy.allowCredentials !== false) {
    blockedReasons.push('Browser controlled interaction policy must not allow credentials.');
  }

  if (policy.isolatedProfile !== true) {
    blockedReasons.push('Browser controlled interaction policy must use an isolated profile.');
  }

  if (policy.networkPolicy !== 'allowlisted') {
    blockedReasons.push('Browser controlled interaction policy must use allowlisted network only.');
  }

  if (policy.operatorStarted !== true) {
    blockedReasons.push('Browser controlled interaction policy must be operator-started.');
  }

  if (policy.sensitiveFieldPolicy !== 'block') {
    blockedReasons.push('Browser controlled interaction policy must block sensitive fields.');
  }

  if (policy.sideEffectPolicy !== 'checkpoint_required') {
    blockedReasons.push('Browser controlled interaction policy must require checkpoints for side effects.');
  }

  if (!Array.isArray(policy.allowedOrigins) || policy.allowedOrigins.length === 0) {
    blockedReasons.push('Browser controlled interaction policy requires at least one allowed origin.');
  } else if (policy.allowedOrigins.some((origin) => !parseBrowserControlledUrl(origin))) {
    blockedReasons.push('Browser controlled interaction policy origins must be http, https, or localhost URLs.');
  }

  if (!Array.isArray(policy.allowedActions) || policy.allowedActions.length === 0) {
    blockedReasons.push('Browser controlled interaction policy requires at least one allowed action.');
  } else if (policy.allowedActions.some((action) => !isBrowserControlledAction(action))) {
    blockedReasons.push('Browser controlled interaction policy actions must be supported.');
  }

  if (!Array.isArray(policy.allowedEvidenceKinds) || policy.allowedEvidenceKinds.length === 0) {
    blockedReasons.push('Browser controlled interaction policy requires evidence kinds.');
  }

  if (!Number.isInteger(policy.maxActions) || typeof policy.maxActions !== 'number' || policy.maxActions <= 0) {
    blockedReasons.push('Browser controlled interaction policy requires a positive max action count.');
  } else if (policy.maxActions > MAX_BROWSER_CONTROLLED_ACTIONS) {
    blockedReasons.push('Browser controlled interaction policy action count exceeds the maximum.');
  }

  if (!Number.isInteger(policy.timeoutMs) || typeof policy.timeoutMs !== 'number' || policy.timeoutMs <= 0) {
    blockedReasons.push('Browser controlled interaction policy requires a positive timeout.');
  } else if (policy.timeoutMs > MAX_BROWSER_CONTROLLED_TIMEOUT_MS) {
    blockedReasons.push('Browser controlled interaction policy timeout exceeds the maximum.');
  }

  if (!Number.isInteger(policy.outputLimitBytes)
    || typeof policy.outputLimitBytes !== 'number'
    || policy.outputLimitBytes <= 0) {
    blockedReasons.push('Browser controlled interaction policy requires a positive output limit.');
  } else if (policy.outputLimitBytes > MAX_BROWSER_CONTROLLED_OUTPUT_LIMIT_BYTES) {
    blockedReasons.push('Browser controlled interaction policy output limit exceeds the maximum.');
  }
}

function validateBrowserControlledActionAgainstPolicy(
  action: Partial<BrowserControlledInteractionAction>,
  policy: Partial<BrowserControlledInteractionPolicy>,
  blockedReasons: string[],
): void {
  if (isBrowserControlledAction(action.action) && !policy.allowedActions?.includes(action.action)) {
    blockedReasons.push('Browser controlled interaction action is not allowed by policy.');
  }

  const url = typeof action.url === 'string' && action.url.trim()
    ? action.url.trim()
    : typeof action.currentUrl === 'string' && action.currentUrl.trim()
      ? action.currentUrl.trim()
      : null;
  const parsedUrl = url ? parseBrowserControlledUrl(url) : null;

  if ((action.action === 'navigate' || action.url) && !parsedUrl) {
    blockedReasons.push('Browser controlled interaction action URL must be http, https, or localhost.');
  }

  if (parsedUrl && !policy.allowedOrigins?.includes(parsedUrl.origin)) {
    blockedReasons.push('Browser controlled interaction action URL must match an allowed origin.');
  }

  if ((action.action === 'click' || action.action === 'type_text' || action.action === 'select_option')
    && !readNonEmptyString(action.targetRef)
    && !readNonEmptyString(action.targetLabel)) {
    blockedReasons.push('Browser controlled interaction target actions require a target ref or label.');
  }

  if (action.action === 'type_text' && !readNonEmptyString(action.text)) {
    blockedReasons.push('Browser controlled interaction text actions require bounded text.');
  }

  if (action.action === 'select_option' && !readNonEmptyString(action.value)) {
    blockedReasons.push('Browser controlled interaction select actions require a value.');
  }

  if (action.action === 'press_key' && !SAFE_KEYS.has(readNonEmptyString(action.value) ?? '')) {
    blockedReasons.push('Browser controlled interaction key actions must use a safe key.');
  }

  if (looksSensitive(action.targetLabel) || looksSensitive(action.targetRef)) {
    blockedReasons.push('Browser controlled interaction must not target sensitive fields.');
  }
}

function isPotentialBrowserSideEffect(action: Partial<BrowserControlledInteractionAction>): boolean {
  const target = `${action.targetLabel ?? ''} ${action.targetRef ?? ''}`.toLowerCase();
  return action.action === 'click'
    && /\b(submit|send|publish|post|delete|buy|purchase|checkout|confirm)\b/.test(target);
}

function looksSensitive(value: unknown): boolean {
  return typeof value === 'string'
    && /\b(password|passcode|token|api key|secret|mfa|2fa|payment|card)\b/i.test(value);
}

function parseBrowserControlledUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function invalidBrowserControlledInteractionRequest(
  blockedReasons: string[],
): BrowserControlledInteractionRequestValidation {
  const reasons = blockedReasons.length
    ? blockedReasons
    : ['Browser controlled interaction request is invalid.'];

  return {
    blockedReasons: reasons,
    summary: `Browser controlled interaction request blocked: ${reasons.join(' ')}`,
    valid: false,
  };
}
