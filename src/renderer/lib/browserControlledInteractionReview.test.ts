import { describe, expect, it } from 'vitest';

import { isAgentToolScaffoldId } from '@shared/agent-tool-scaffold';
import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  buildDefaultBrowserControlledInteractionPolicy,
  validateBrowserControlledInteractionRequest,
} from '@shared/types/browser-controlled-interaction';
import {
  buildBrowserControlledInteractionReview,
  formatBrowserControlledActionSummary,
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
    expect(isAgentToolScaffoldId(review.descriptorId)).toBe(false);
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
});
