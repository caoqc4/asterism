import { describe, expect, it } from 'vitest';

import {
  BROWSER_EVIDENCE_ACTIONS,
  buildBrowserEvidencePreflight,
  buildBrowserEvidenceRunnerSmokeFixture,
  buildDefaultBrowserSessionPolicy,
  isBrowserEvidenceAction,
  isBrowserEvidenceKind,
  validateBrowserEvidenceRequest,
} from './browser-evidence.js';

describe('browser evidence contract', () => {
  it('reserves only read-only browser evidence actions', () => {
    expect(BROWSER_EVIDENCE_ACTIONS).toEqual([
      'open_url',
      'inspect_page',
      'extract_visible_text',
      'capture_screenshot',
      'capture_trace',
      'run_readonly_check',
    ]);
    expect(isBrowserEvidenceAction('capture_screenshot')).toBe(true);
    expect(isBrowserEvidenceAction('click')).toBe(false);
    expect(isBrowserEvidenceAction('type')).toBe(false);
    expect(isBrowserEvidenceAction('submit_form')).toBe(false);
    expect(isBrowserEvidenceKind('screenshot')).toBe(true);
    expect(isBrowserEvidenceKind('posted_payload')).toBe(false);
  });

  it('builds a credential-free isolated allowlisted browser policy', () => {
    expect(buildDefaultBrowserSessionPolicy({
      allowedOrigins: ['http://localhost:5173'],
    })).toEqual({
      allowCredentials: false,
      allowedOrigins: ['http://localhost:5173'],
      isolatedProfile: true,
      networkPolicy: 'allowlisted',
      outputLimitBytes: 64_000,
      timeoutMs: 30_000,
    });
  });

  it('reports reserved preflight state without opening a browser or calling the network', () => {
    expect(buildBrowserEvidencePreflight({
      allowedOrigins: ['http://localhost:5173'],
      enabled: true,
    })).toEqual({
      blockedReasons: [
        'browser.readonly_evidence remains reserved and hidden',
        'browser evidence runtime is not implemented',
      ],
      browserWillStart: false,
      configuredOriginCount: 1,
      descriptorId: 'browser.readonly_evidence',
      exposedToModels: false,
      networkWillBeCalled: false,
      status: 'reserved',
      summary: [
        'Browser evidence preflight: reserved',
        'configuredOrigins=1',
        'modelExposure=hidden',
        'browserStart=no',
        'networkCall=no',
        'next=implement isolated runner smoke only after B2 is accepted',
      ].join(' / '),
    });
  });

  it('keeps preflight blocked when enabled without explicit origins', () => {
    expect(buildBrowserEvidencePreflight({ enabled: true })).toMatchObject({
      blockedReasons: expect.arrayContaining([
        'browser evidence requires explicit allowed origins before runtime implementation',
      ]),
      browserWillStart: false,
      configuredOriginCount: 0,
      exposedToModels: false,
      networkWillBeCalled: false,
      status: 'reserved',
    });
  });

  it('prepares an isolated runner smoke fixture without starting browser or network activity', () => {
    const fixture = buildBrowserEvidenceRunnerSmokeFixture({
      origin: 'http://127.0.0.1:4173',
    });

    expect(fixture).toMatchObject({
      allowedOrigin: 'http://127.0.0.1:4173',
      expectedArtifactKinds: ['screenshot', 'visible_text', 'page_summary'],
      name: 'browser-evidence-readonly-smoke',
      request: {
        action: 'capture_screenshot',
        allowedEvidenceKinds: ['screenshot', 'visible_text', 'page_summary'],
        policy: expect.objectContaining({
          allowCredentials: false,
          allowedOrigins: ['http://127.0.0.1:4173'],
          isolatedProfile: true,
          networkPolicy: 'allowlisted',
        }),
        purpose: 'Capture isolated local browser evidence smoke output.',
        url: 'http://127.0.0.1:4173/browser-evidence-smoke.html',
      },
      smokeWillCallNetwork: false,
      smokeWillStartBrowser: false,
      summary: 'Browser evidence runner smoke fixture prepared / origin=http://127.0.0.1:4173 / path=/browser-evidence-smoke.html / browserStart=no / networkCall=no / mutation=not representable',
    });
    expect(fixture.html).toContain('data-taskplane-evidence="readonly-smoke"');
    expect(validateBrowserEvidenceRequest(fixture.request)).toMatchObject({ valid: true });
  });

  it('accepts bounded read-only evidence requests', () => {
    expect(validateBrowserEvidenceRequest({
      action: 'capture_screenshot',
      allowedEvidenceKinds: ['screenshot', 'visible_text'],
      policy: buildDefaultBrowserSessionPolicy({
        allowedOrigins: ['http://localhost:5173'],
      }),
      purpose: 'Capture local app evidence for a Taskplane run.',
      url: 'http://localhost:5173/tasks?focus=run',
    })).toMatchObject({
      request: {
        action: 'capture_screenshot',
        allowedEvidenceKinds: ['screenshot', 'visible_text'],
        policy: expect.objectContaining({
          allowCredentials: false,
          isolatedProfile: true,
          networkPolicy: 'allowlisted',
        }),
        purpose: 'Capture local app evidence for a Taskplane run.',
        url: 'http://localhost:5173/tasks?focus=run',
      },
      summary: 'Browser evidence request valid for http://localhost:5173.',
      valid: true,
    });
  });

  it('blocks mutation, credentials, unrestricted network, and off-allowlist URLs', () => {
    expect(validateBrowserEvidenceRequest({
      action: 'submit_form',
      allowedEvidenceKinds: ['screenshot', 'posted_payload'],
      policy: {
        allowCredentials: true,
        allowedOrigins: ['https://docs.example.com'],
        isolatedProfile: false,
        networkPolicy: 'unrestricted',
        outputLimitBytes: 2_000_000,
        timeoutMs: 900_000,
      },
      purpose: 'Post an update',
      url: 'https://publisher.example.com/post',
    })).toMatchObject({
      blockedReasons: expect.arrayContaining([
        'Browser evidence request action must be read-only.',
        'Browser evidence request evidence kinds must be supported read-only artifacts.',
        'Browser evidence policy must not allow credentials.',
        'Browser evidence policy must use an isolated profile.',
        'Browser evidence policy must use allowlisted network only.',
        'Browser evidence request URL must match an allowed origin.',
        'Browser evidence policy timeout exceeds the maximum allowed duration.',
        'Browser evidence policy output limit exceeds the maximum allowed size.',
      ]),
      valid: false,
    });
  });

  it('requires explicit allowed origins and browser-safe URLs', () => {
    expect(validateBrowserEvidenceRequest({
      action: 'inspect_page',
      allowedEvidenceKinds: ['page_summary'],
      policy: buildDefaultBrowserSessionPolicy({ allowedOrigins: [] }),
      purpose: 'Inspect a local report',
      url: 'file:///tmp/report.html',
    })).toMatchObject({
      blockedReasons: expect.arrayContaining([
        'Browser evidence request requires an http, https, or localhost URL.',
        'Browser evidence policy requires at least one allowed origin.',
      ]),
      valid: false,
    });
  });
});
