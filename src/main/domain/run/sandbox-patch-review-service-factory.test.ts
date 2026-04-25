import { describe, expect, it } from 'vitest';

import { LocalContainerSandboxProvider } from './local-container-sandbox-backend.js';
import { SandboxPatchReviewRunAdapter } from './sandbox-patch-review-run-adapter.js';
import { resolveSandboxPatchReviewRunAdapter } from './sandbox-patch-review-service-factory.js';

describe('resolveSandboxPatchReviewRunAdapter', () => {
  it('keeps the sandbox patch review adapter disabled while the feature flag is off', () => {
    const resolution = resolveSandboxPatchReviewRunAdapter({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
      },
    });

    expect(resolution).toEqual({
      status: 'disabled',
      reason: expect.stringContaining('feature flag is off'),
    });
  });

  it('builds an adapter without creating a container runner when the feature flag is on', () => {
    const resolution = resolveSandboxPatchReviewRunAdapter({
      dependencies: {
        provider: new LocalContainerSandboxProvider(),
      },
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
    });

    expect(resolution.status).toBe('available');

    if (resolution.status === 'available') {
      expect(resolution.adapter).toBeInstanceOf(SandboxPatchReviewRunAdapter);
      expect(resolution.reason).toContain('explicit runner calls only');
    }
  });
});
