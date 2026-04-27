import { describe, expect, it } from 'vitest';

import { isAgentToolScaffoldId } from '../agent-tool-scaffold.js';
import {
  BROWSER_CONTROLLED_ACTIONS,
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  buildBrowserControlledInteractionLocalQaFixture,
  buildDefaultBrowserControlledInteractionPolicy,
  isBrowserControlledAction,
  mapBrowserControlledInteractionStepToRunSteps,
  validateBrowserControlledInteractionRequest,
} from './browser-controlled-interaction.js';

describe('browser controlled interaction schema draft', () => {
  it('drafts controlled browser actions without registering a model-visible scaffold descriptor', () => {
    expect(BROWSER_CONTROLLED_ACTIONS).toEqual([
      'navigate',
      'click',
      'type_text',
      'select_option',
      'press_key',
      'scroll',
      'wait_for',
      'dismiss_popup',
      'capture_evidence',
    ]);
    expect(isBrowserControlledAction('click')).toBe(true);
    expect(isBrowserControlledAction('submit_form')).toBe(false);
    expect(isAgentToolScaffoldId(BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID)).toBe(false);
  });

  it('builds an operator-started allowlisted policy for local-dev QA drafts', () => {
    expect(buildDefaultBrowserControlledInteractionPolicy({
      allowedOrigins: ['http://localhost:5173'],
    })).toEqual({
      allowCredentials: false,
      allowedActions: ['navigate', 'click', 'capture_evidence'],
      allowedEvidenceKinds: ['screenshot', 'visible_text', 'page_summary'],
      allowedOrigins: ['http://localhost:5173'],
      isolatedProfile: true,
      maxActions: 8,
      networkPolicy: 'allowlisted',
      operatorStarted: true,
      outputLimitBytes: 128_000,
      sensitiveFieldPolicy: 'block',
      sideEffectPolicy: 'checkpoint_required',
      timeoutMs: 60_000,
    });
  });

  it('prepares a non-executing local-dev QA fixture plan', () => {
    const fixture = buildBrowserControlledInteractionLocalQaFixture({
      origin: 'http://127.0.0.1:5173',
    });

    expect(fixture).toMatchObject({
      allowedOrigin: 'http://127.0.0.1:5173',
      expectedArtifactKinds: ['screenshot', 'visible_text', 'page_summary'],
      expectedRunSteps: expect.arrayContaining([
        expect.objectContaining({
          kind: 'tool_call',
          status: 'running',
          title: 'Browser action planned: click',
        }),
        expect.objectContaining({
          kind: 'tool_result',
          status: 'skipped',
          title: 'Browser action evidence pending: capture_evidence',
        }),
      ]),
      name: 'browser-controlled-local-qa-fixture',
      path: '/browser-controlled-local-qa.html',
      smokeWillCallNetwork: false,
      smokeWillMutatePage: false,
      smokeWillStartBrowser: false,
      summary: 'Browser controlled interaction local QA fixture prepared / origin=http://127.0.0.1:5173 / path=/browser-controlled-local-qa.html / actions=navigate,click,type_text,select_option,capture_evidence / browserStart=no / networkCall=no / pageMutation=no / modelExposure=hidden',
    });
    expect(fixture.html).toContain('data-taskplane-controlled-qa="fixture"');
    expect(fixture.requests.map((request) => request.action.action)).toEqual([
      'navigate',
      'click',
      'type_text',
      'select_option',
      'capture_evidence',
    ]);
    expect(fixture.requests.every((request) =>
      validateBrowserControlledInteractionRequest(request).valid)).toBe(true);
    expect(fixture.expectedRunSteps).toHaveLength(10);
  });

  it('keeps local QA fixture actions checkpoint-free until side-effect targets appear', () => {
    const fixture = buildBrowserControlledInteractionLocalQaFixture({
      origin: 'http://127.0.0.1:5173',
    });
    const validations = fixture.requests.map((request) =>
      validateBrowserControlledInteractionRequest(request));

    expect(validations.map((validation) =>
      validation.valid ? validation.step.checkpointRequired : true)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('accepts bounded local controlled-interaction requests as schema only', () => {
    expect(validateBrowserControlledInteractionRequest({
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
    })).toMatchObject({
      request: {
        descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
        action: expect.objectContaining({
          action: 'click',
          targetRef: 'button-open-task',
        }),
        policy: expect.objectContaining({
          allowCredentials: false,
          operatorStarted: true,
        }),
      },
      step: {
        artifactKinds: ['screenshot', 'visible_text', 'page_summary'],
        checkpointRequired: false,
        sideEffectClassification: 'none',
        summary: 'action=click / checkpoint=no / origin=http://localhost:5173',
      },
      summary: 'Browser controlled interaction request valid / action=click / checkpoint=no / origin=http://localhost:5173',
      valid: true,
    });
  });

  it('marks possible external side effects as checkpoint-required step drafts', () => {
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

    expect(validation).toMatchObject({
      step: {
        checkpointRequired: true,
        sideEffectClassification: 'possible_external_side_effect',
        summary: 'action=click / checkpoint=required / origin=http://localhost:5173',
      },
      valid: true,
    });
    expect(validation.valid ? mapBrowserControlledInteractionStepToRunSteps(validation.step) : []).toEqual([
      {
        kind: 'tool_call',
        status: 'pending',
        title: 'Browser action planned: click',
        input: [
          'action=click',
          'url=http://localhost:5173/draft',
          'targetLabel=Publish post',
        ].join('\n'),
        output: 'Pending Decision before browser action execution.',
      },
      {
        kind: 'checkpoint',
        status: 'pending',
        title: 'Browser action requires checkpoint',
        input: [
          'action=click',
          'url=http://localhost:5173/draft',
          'targetLabel=Publish post',
        ].join('\n'),
        output: [
          'action=click / checkpoint=required / origin=http://localhost:5173',
          'evidence=screenshot,visible_text,page_summary',
          'sideEffect=possible_external_side_effect',
        ].join('\n'),
      },
    ]);
  });

  it('blocks credentials, unsafe actions, unsafe keys, and off-allowlist origins', () => {
    expect(validateBrowserControlledInteractionRequest({
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
        allowCredentials: true,
        isolatedProfile: false,
        maxActions: 200,
        networkPolicy: 'unrestricted',
        operatorStarted: false,
        outputLimitBytes: 2_000_000,
        sensitiveFieldPolicy: 'allow',
        sideEffectPolicy: 'allow',
        timeoutMs: 900_000,
      },
      purpose: 'Submit login form',
    })).toMatchObject({
      blockedReasons: expect.arrayContaining([
        'Browser controlled interaction policy must not allow credentials.',
        'Browser controlled interaction policy must use an isolated profile.',
        'Browser controlled interaction policy must use allowlisted network only.',
        'Browser controlled interaction policy must be operator-started.',
        'Browser controlled interaction policy must block sensitive fields.',
        'Browser controlled interaction policy must require checkpoints for side effects.',
        'Browser controlled interaction action URL must match an allowed origin.',
        'Browser controlled interaction key actions must use a safe key.',
        'Browser controlled interaction must not target sensitive fields.',
      ]),
      valid: false,
    });
  });
});
