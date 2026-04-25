import { describe, expect, it } from 'vitest';

import {
  buildAgentSandboxBackendProfileFromProbe,
  buildAgentSandboxProviderCapabilitiesFromBackendProfile,
  evaluateAgentSandboxBackendReadiness,
  summarizeAgentSandboxBackendProbe,
} from '../../../shared/agent-sandbox-provider.js';
import { buildLocalContainerSandboxBackendProbe } from './local-container-sandbox-backend.js';

describe('local container sandbox backend probe', () => {
  it('reports unavailable local container runtime without creating a backend profile', () => {
    const probe = buildLocalContainerSandboxBackendProbe({
      detail: 'Docker CLI not found.',
      dockerAvailable: false,
    });

    expect(probe).toEqual({
      backendId: 'local-container',
      kind: 'local_container',
      reason: 'Docker CLI not found.',
      status: 'unavailable',
    });
    expect(buildAgentSandboxBackendProfileFromProbe(probe)).toBeNull();
    expect(summarizeAgentSandboxBackendProbe(probe)).toBe(
      'backend=local-container / kind=local_container / available=no / reason=Docker CLI not found.',
    );
  });

  it('maps an available local container runtime into a ready backend profile', () => {
    const probe = buildLocalContainerSandboxBackendProbe({
      dockerAvailable: true,
    });
    const profile = buildAgentSandboxBackendProfileFromProbe(probe);

    expect(profile).toMatchObject({
      environmentPolicy: 'empty',
      id: 'local-container',
      isolation: 'container',
      kind: 'local_container',
      networkMode: 'disabled',
    });
    expect(evaluateAgentSandboxBackendReadiness(profile!)).toMatchObject({
      blockedReasons: [],
      ready: true,
    });
    expect(buildAgentSandboxProviderCapabilitiesFromBackendProfile(profile!)).toMatchObject({
      enabled: true,
      kind: 'local_container',
      supportsPatchArtifacts: true,
      supportsTargetedCommands: true,
    });
  });
});
