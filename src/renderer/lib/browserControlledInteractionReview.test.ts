import { describe, expect, it } from 'vitest';

import { isAgentToolScaffoldId } from '@shared/agent-tool-scaffold';
import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  buildDefaultBrowserControlledInteractionPolicy,
  validateBrowserControlledInteractionRequest,
} from '@shared/types/browser-controlled-interaction';
import {
  buildBrowserControlledInteractionReview,
  buildBrowserControlledInteractionRunReview,
  buildBrowserControlledInteractionResumeReview,
  formatBrowserControlledRunEvidenceStatusLabel,
  formatBrowserControlledActionSummary,
  formatBrowserControlledCheckpointActionSummary,
} from './browserControlledInteractionReview';

describe('browser controlled interaction review helpers', () => {
  it('formats safe local controlled actions as dry-run review only', () => {
    const validation = validateBrowserControlledInteractionRequest({
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
    });
    const review = buildBrowserControlledInteractionReview(validation);

    expect(review).toMatchObject({
      actionSummary: 'action=click / url=http://localhost:5173/tasks / targetRef=button-open-task / targetLabel=Open task detail / checkpoint=no / sideEffect=none',
      blockedReasons: [],
      descriptorId: 'browser.controlled_interaction',
      nextMove: 'next=eligible for local QA dry-run review; browser runtime still disabled',
      policySummary: 'modelExposure=hidden / browserStart=no / scheduler=no / providerCall=no / evidence=screenshot,visible_text,page_summary',
      runStepTitles: [
        'Browser action planned: click',
        'Browser action evidence pending: click',
      ],
      status: 'ready',
      summary: 'Browser controlled interaction ready for dry-run review: action=click / checkpoint=no / origin=http://localhost:5173',
    });
    expect(isAgentToolScaffoldId(review.descriptorId)).toBe(true);
  });

  it('formats possible side effects as checkpoint-required review', () => {
    const validation = validateBrowserControlledInteractionRequest({
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      action: {
        action: 'click',
        currentUrl: 'http://localhost:5173/draft',
        targetLabel: 'Publish post',
      },
      policy: buildDefaultBrowserControlledInteractionPolicy({
        allowedActions: ['click', 'capture_evidence'],
        allowedOrigins: ['http://localhost:5173'],
      }),
      purpose: 'Prepare a publish preview without sending.',
    });
    const review = buildBrowserControlledInteractionReview(validation);

    expect(review).toMatchObject({
      actionSummary: 'action=click / url=http://localhost:5173/draft / targetLabel=Publish post / checkpoint=required / sideEffect=possible_external_side_effect',
      nextMove: 'next=create Decision checkpoint before browser action execution',
      runStepTitles: [
        'Browser action planned: click',
        'Browser action requires checkpoint',
      ],
      status: 'checkpoint_required',
      summary: 'Browser controlled interaction requires checkpoint: action=click / checkpoint=required / origin=http://localhost:5173',
    });
  });

  it('formats blocked requests without run steps or browser runtime claims', () => {
    const validation = validateBrowserControlledInteractionRequest({
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
    });
    const review = buildBrowserControlledInteractionReview(validation);

    expect(review.status).toBe('blocked');
    expect(review.actionSummary).toBeNull();
    expect(review.runStepTitles).toEqual([]);
    expect(review.policySummary).toBe('modelExposure=hidden / browserStart=no / scheduler=no / providerCall=no');
    expect(review.nextMove).toBe('next=fix request or policy before any browser runtime can start');
    expect(review.blockedReasons).toEqual(expect.arrayContaining([
      'Browser controlled interaction policy action count exceeds the maximum.',
      'Browser controlled interaction action URL must match an allowed origin.',
      'Browser controlled interaction key actions must use a safe key.',
      'Browser controlled interaction must not target sensitive fields.',
    ]));
  });

  it('can format a validated step directly for future Runs review', () => {
    const validation = validateBrowserControlledInteractionRequest({
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      action: {
        action: 'select_option',
        currentUrl: 'http://localhost:5173/tasks',
        targetLabel: 'Mode',
        targetRef: 'mode-select',
        value: 'Review',
      },
      policy: buildDefaultBrowserControlledInteractionPolicy({
        allowedActions: ['select_option'],
        allowedOrigins: ['http://localhost:5173'],
      }),
      purpose: 'Exercise a local select control.',
    });

    expect(validation.valid ? formatBrowserControlledActionSummary(validation.step) : null).toBe(
      'action=select_option / url=http://localhost:5173/tasks / targetRef=mode-select / targetLabel=Mode / value=Review / checkpoint=no / sideEffect=none',
    );
  });

  it('builds Runs review for dry-run evidence steps', () => {
    const review = buildBrowserControlledInteractionRunReview({
      output: null,
      checkpoints: [],
      steps: [
        buildStep({
          title: 'browser controlled dry-run accepted',
          kind: 'plan',
          output: 'browserStart=no / networkCall=no / pageMutation=no / modelExposure=hidden / scheduler=no / providerCall=no',
        }),
        buildStep({
          title: 'Browser action planned: click',
          kind: 'tool_call',
          status: 'running',
        }),
        buildStep({
          title: 'Browser action evidence pending: click',
          kind: 'tool_result',
          status: 'skipped',
        }),
      ],
    });

    expect(review).toMatchObject({
      actionCount: 1,
      blockedCount: 0,
      checkpointCount: 0,
      nextMove: 'next=review dry-run plan before enabling local QA runner',
      policySummary: 'modelExposure=hidden / scheduler=no / providerCall=no / genericPrompt=no',
      status: 'planned',
      summary: 'Browser controlled interaction review / status=planned / actions=1 / blocked=0 / checkpoints=0',
    });
    expect(review?.evidence).toEqual([
      {
        label: 'Runtime boundary',
        status: 'ready',
        summary: 'browserStart=no / networkCall=no / pageMutation=no / modelExposure=hidden / scheduler=no / providerCall=no',
      },
      {
        label: 'Action plan',
        status: 'ready',
        summary: 'click',
      },
    ]);
  });

  it('builds Runs review for completed local QA evidence', () => {
    const review = buildBrowserControlledInteractionRunReview({
      output: 'Browser controlled local QA completed / url=http://127.0.0.1:53578/browser-controlled-local-qa.html / actions=navigate,click,type_text,select_option,capture_evidence / artifacts=page_summary,visible_text,screenshot / credentials=no / externalOrigin=no / modelExposure=hidden',
      checkpoints: [],
      steps: [
        buildStep({ title: 'browser controlled dry-run accepted', kind: 'plan' }),
        buildStep({ title: 'Browser action planned: navigate', kind: 'tool_call' }),
        buildStep({ title: 'Browser action planned: capture_evidence', kind: 'tool_call' }),
      ],
    });

    expect(review).toMatchObject({
      actionCount: 2,
      nextMove: 'next=review captured local QA evidence before considering product UI exposure',
      status: 'completed',
    });
    expect(review?.evidence.at(-1)).toEqual({
      label: 'Local QA result',
      status: 'ready',
      summary: 'Browser controlled local QA completed / url=http://127.0.0.1:53578/browser-controlled-local-qa.html / actions=navigate,click,type_text,select_option,capture_evidence / artifacts=page_summary,visible_text,screenshot / credentials=no / externalOrigin=no / modelExposure=hidden',
    });
  });

  it('builds Runs review for blocked validation and checkpoint payloads', () => {
    const blocked = buildBrowserControlledInteractionRunReview({
      output: null,
      checkpoints: [],
      steps: [
        buildStep({
          error: 'Browser controlled interaction action URL must match an allowed origin.',
          kind: 'tool_result',
          status: 'failed',
          title: 'browser controlled interaction blocked',
        }),
      ],
    });
    expect(blocked).toMatchObject({
      blockedCount: 1,
      nextMove: 'next=fix blocked request or policy before any browser runtime can start',
      status: 'blocked',
    });

    const checkpoint = buildBrowserControlledInteractionRunReview({
      output: null,
      steps: [
        buildStep({
          title: 'Browser action planned: click',
          kind: 'tool_call',
          status: 'pending',
        }),
      ],
      checkpoints: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'run_checkpoint_browser',
          kind: 'external_wait',
          payload: JSON.stringify({
            version: 1,
            kind: 'browser_controlled_interaction',
            descriptorId: 'browser.controlled_interaction',
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
          }),
          resolvedAt: null,
          runId: 'run_browser',
          status: 'open',
          stepId: 'run_step_browser_checkpoint',
        },
      ],
    });

    expect(checkpoint).toMatchObject({
      checkpointCount: 1,
      nextMove: 'next=review checkpoint payload; approval does not auto-resume browser actions yet',
      status: 'checkpoint_required',
    });
    expect(checkpoint?.evidence.at(-1)).toEqual({
      label: 'Checkpoint boundary',
      status: 'pending',
      summary: 'action=click / origin=http://localhost:5173 / targetLabel=Publish post / screenshot=artifact_screenshot_1 / visibleText=Draft publish page is visible. / resume=deferred',
    });
    expect(formatBrowserControlledRunEvidenceStatusLabel('pending')).toBe('pending');
  });

  it('builds checkpoint resume review for an approved one-action payload', () => {
    const checkpoint = buildBrowserCheckpoint({
      status: 'open',
    });
    const review = buildBrowserControlledInteractionResumeReview(checkpoint, {
      decisionStatus: 'approved',
    });

    expect(review).toMatchObject({
      actionSummary: 'action=click / url=http://localhost:5173/draft / origin=http://localhost:5173 / targetLabel=Publish post / sideEffect=possible_external_side_effect',
      blockedReasons: [],
      checkpointId: 'run_checkpoint_browser',
      consequence: 'approval resumes exactly one recorded click action; it does not grant a browser session',
      decisionSummary: 'decision=approved / checkpoint=open',
      evidenceSummary: 'screenshot=artifact_screenshot_1 / visibleText=Draft publish page is visible. / decisionTitle=Approve browser publish click',
      nextMove: 'next=resume exactly one approved browser action after pre-launch validation',
      policySummary: 'modelExposure=hidden / scheduler=no / providerCall=no / genericPrompt=no / origin=http://localhost:5173 / allowed=click',
      status: 'resumeReady',
      summary: 'Browser controlled resume ready: action=click / url=http://localhost:5173/draft / origin=http://localhost:5173 / targetLabel=Publish post / sideEffect=possible_external_side_effect',
    });
    expect(formatBrowserControlledCheckpointActionSummary(JSON.parse(checkpoint.payload ?? '{}'))).toContain(
      'origin=http://localhost:5173',
    );
  });

  it('blocks checkpoint resume until a Decision is approved', () => {
    const review = buildBrowserControlledInteractionResumeReview(buildBrowserCheckpoint({ status: 'open' }), {
      decisionStatus: 'pending',
    });

    expect(review.status).toBe('blocked');
    expect(review.blockedReasons).toEqual([
      'Browser controlled resume requires an approved Decision; current status is pending.',
    ]);
    expect(review.nextMove).toBe('next=resolve blocked approval, policy, or checkpoint state before browser resume');
  });

  it('blocks checkpoint resume when current policy no longer allows the payload action', () => {
    const review = buildBrowserControlledInteractionResumeReview(buildBrowserCheckpoint({ status: 'open' }), {
      currentPolicy: buildDefaultBrowserControlledInteractionPolicy({
        allowedActions: ['capture_evidence'],
        allowedOrigins: ['http://localhost:5173'],
      }),
      decisionStatus: 'approved',
    });

    expect(review.status).toBe('blocked');
    expect(review.blockedReasons).toEqual([
      'Browser controlled resume action is not allowed by the current policy.',
    ]);
    expect(review.policySummary).toBe(
      'modelExposure=hidden / scheduler=no / providerCall=no / genericPrompt=no / origin=http://localhost:5173 / allowed=capture_evidence',
    );
  });

  it('marks resolved checkpoint resume reviews as already consumed', () => {
    const review = buildBrowserControlledInteractionResumeReview(buildBrowserCheckpoint({
      resolvedAt: '2026-01-01T00:10:00.000Z',
      status: 'resolved',
    }), {
      decisionStatus: 'approved',
    });

    expect(review.status).toBe('alreadyConsumed');
    expect(review.blockedReasons).toEqual([
      'Browser controlled checkpoint was already resolved or consumed.',
    ]);
    expect(review.nextMove).toBe('next=review post-resume evidence or create a new checkpoint for another action');
  });

  it('treats malformed or unsupported checkpoint payloads as stale', () => {
    const malformed = buildBrowserControlledInteractionResumeReview(buildBrowserCheckpoint({
      payload: '{',
      status: 'open',
    }), {
      decisionStatus: 'approved',
    });
    expect(malformed).toMatchObject({
      blockedReasons: ['Browser controlled checkpoint payload is not valid JSON.'],
      status: 'stalePayload',
    });

    const wrongKind = buildBrowserControlledInteractionResumeReview(buildBrowserCheckpoint({
      payload: JSON.stringify({ version: 1, kind: 'workspace_patch' }),
      status: 'open',
    }), {
      decisionStatus: 'approved',
    });
    expect(wrongKind).toMatchObject({
      blockedReasons: ['Browser controlled checkpoint payload kind is not supported.'],
      status: 'stalePayload',
    });

    const wrongVersion = buildBrowserControlledInteractionResumeReview(buildBrowserCheckpoint({
      payload: JSON.stringify({
        ...buildBrowserCheckpointPayload(),
        version: 2,
      }),
      status: 'open',
    }), {
      decisionStatus: 'approved',
    });
    expect(wrongVersion).toMatchObject({
      blockedReasons: ['Browser controlled checkpoint payload version is not supported.'],
      status: 'stalePayload',
    });
  });
});

function buildStep(overrides: {
  error?: string | null;
  kind: 'plan' | 'tool_call' | 'tool_result' | 'checkpoint';
  output?: string | null;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  title: string;
}) {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    error: overrides.error ?? null,
    id: 'run_step_browser',
    index: 1,
    input: null,
    kind: overrides.kind,
    output: overrides.output ?? null,
    runId: 'run_browser',
    status: overrides.status ?? 'completed',
    title: overrides.title,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildBrowserCheckpoint(overrides: {
  payload?: string | null;
  resolvedAt?: string | null;
  status: 'open' | 'resolved' | 'cancelled';
}) {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'run_checkpoint_browser',
    kind: 'external_wait' as const,
    payload: overrides.payload ?? JSON.stringify(buildBrowserCheckpointPayload()),
    resolvedAt: overrides.resolvedAt ?? null,
    runId: 'run_browser',
    status: overrides.status,
    stepId: 'run_step_browser_checkpoint',
  };
}

function buildBrowserCheckpointPayload() {
  return {
    version: 1,
    kind: 'browser_controlled_interaction',
    descriptorId: 'browser.controlled_interaction',
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
