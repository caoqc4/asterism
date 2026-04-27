import type { BrowserEvidenceArtifact, BrowserEvidenceKind } from './browser-evidence.js';
import type { RunStepKind, RunStepStatus } from './run.js';

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

export type BrowserControlledInteractionRunStepDraft = {
  kind: RunStepKind;
  status: RunStepStatus;
  title: string;
  input: string | null;
  output: string | null;
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

export type BrowserControlledInteractionLocalQaFixture = {
  allowedOrigin: string;
  expectedArtifactKinds: BrowserEvidenceKind[];
  expectedRunSteps: BrowserControlledInteractionRunStepDraft[];
  html: string;
  name: string;
  path: string;
  requests: BrowserControlledInteractionRequest[];
  smokeWillCallNetwork: false;
  smokeWillMutatePage: false;
  smokeWillStartBrowser: false;
  summary: string;
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

export function buildBrowserControlledInteractionLocalQaFixture(params: {
  name?: string;
  origin?: string;
  path?: string;
} = {}): BrowserControlledInteractionLocalQaFixture {
  const origin = params.origin ?? 'http://127.0.0.1:0';
  const path = params.path ?? '/browser-controlled-local-qa.html';
  const url = new URL(path, origin);
  const policy = buildDefaultBrowserControlledInteractionPolicy({
    allowedActions: ['navigate', 'click', 'type_text', 'select_option', 'capture_evidence'],
    allowedOrigins: [url.origin],
    maxActions: 6,
  });
  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Taskplane Browser Controlled Local QA</title></head>',
    '<body>',
    '<main data-taskplane-controlled-qa="fixture">',
    '<h1>Controlled Interaction Local QA</h1>',
    '<button data-ref="open-filter">Open filter</button>',
    '<label>Search note <input data-ref="search-note" type="text" autocomplete="off"></label>',
    '<label>Mode <select data-ref="mode-select"><option>Preview</option><option>Review</option></select></label>',
    '<section data-ref="result-panel">Ready for bounded local QA.</section>',
    '</main>',
    '</body>',
    '</html>',
  ].join('');
  const requests: BrowserControlledInteractionRequest[] = [
    {
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      action: {
        action: 'navigate',
        url: url.toString(),
      },
      policy,
      purpose: 'Open the local dev-server QA fixture.',
    },
    {
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      action: {
        action: 'click',
        currentUrl: url.toString(),
        targetLabel: 'Open filter',
        targetRef: 'open-filter',
      },
      policy,
      purpose: 'Exercise a harmless local button before capturing evidence.',
    },
    {
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      action: {
        action: 'type_text',
        currentUrl: url.toString(),
        targetLabel: 'Search note',
        targetRef: 'search-note',
        text: 'local qa',
      },
      policy,
      purpose: 'Exercise bounded non-sensitive local text input.',
    },
    {
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      action: {
        action: 'select_option',
        currentUrl: url.toString(),
        targetLabel: 'Mode',
        targetRef: 'mode-select',
        value: 'Review',
      },
      policy,
      purpose: 'Exercise a bounded local select control.',
    },
    {
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      action: {
        action: 'capture_evidence',
        currentUrl: url.toString(),
        targetLabel: 'Result panel',
        targetRef: 'result-panel',
      },
      policy,
      purpose: 'Capture post-action local QA evidence.',
    },
  ];
  const expectedRunSteps = requests.flatMap((request) => {
    const validation = validateBrowserControlledInteractionRequest(request);
    return validation.valid ? mapBrowserControlledInteractionStepToRunSteps(validation.step) : [];
  });

  return {
    allowedOrigin: url.origin,
    expectedArtifactKinds: ['screenshot', 'visible_text', 'page_summary'],
    expectedRunSteps,
    html,
    name: params.name ?? 'browser-controlled-local-qa-fixture',
    path: url.pathname,
    requests,
    smokeWillCallNetwork: false,
    smokeWillMutatePage: false,
    smokeWillStartBrowser: false,
    summary: [
      'Browser controlled interaction local QA fixture prepared',
      `origin=${url.origin}`,
      `path=${url.pathname}`,
      `actions=${requests.map((request) => request.action.action).join(',')}`,
      'browserStart=no',
      'networkCall=no',
      'pageMutation=no',
      'modelExposure=hidden',
    ].join(' / '),
  };
}

export function mapBrowserControlledInteractionStepToRunSteps(
  step: BrowserControlledInteractionStepDraft,
): BrowserControlledInteractionRunStepDraft[] {
  const actionInput = [
    `action=${step.action.action}`,
    step.currentUrl ? `url=${step.currentUrl}` : null,
    step.action.targetRef ? `targetRef=${step.action.targetRef}` : null,
    step.action.targetLabel ? `targetLabel=${step.action.targetLabel}` : null,
  ].filter(Boolean).join('\n');
  const resultOutput = [
    step.summary,
    `evidence=${step.artifactKinds.join(',') || 'none'}`,
    `sideEffect=${step.sideEffectClassification}`,
  ].join('\n');

  return [
    {
      kind: 'tool_call',
      status: step.checkpointRequired ? 'pending' : 'running',
      title: `Browser action planned: ${step.action.action}`,
      input: actionInput || null,
      output: step.checkpointRequired ? 'Pending Decision before browser action execution.' : null,
    },
    {
      kind: step.checkpointRequired ? 'checkpoint' : 'tool_result',
      status: step.checkpointRequired ? 'pending' : 'skipped',
      title: step.checkpointRequired
        ? 'Browser action requires checkpoint'
        : `Browser action evidence pending: ${step.action.action}`,
      input: step.checkpointRequired ? actionInput || null : null,
      output: resultOutput,
    },
  ];
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
