import { describe, expect, it } from 'vitest';

import {
  CapabilityProductSurfaceStatusService,
  readCapabilityProductSurfaceFixture,
} from './capability-product-surface-status-service.js';

describe('CapabilityProductSurfaceStatusService', () => {
  it('returns explicit default catalogue statuses when no service fixture exists', async () => {
    const service = new CapabilityProductSurfaceStatusService(() => null);

    await expect(service.getSkillsStatus()).resolves.toEqual({
      catalogueCount: 1,
      enabledCount: 0,
      modelVisibleCount: 0,
      needsConfigCount: 0,
      readyCount: 0,
    });
    await expect(service.getMcpStatus()).resolves.toEqual({
      catalogueCount: 1,
      connectedServerCount: 0,
      errorCount: 0,
      modelVisibleToolCount: 0,
      toolCount: 0,
    });
  });

  it('projects fixture Skills and MCP service records into capability counts', async () => {
    const service = new CapabilityProductSurfaceStatusService(() => ({
      mcpServers: [
        { id: 'playwright', status: 'connected', toolCount: 4, modelVisibleToolCount: 0 },
        { id: 'docs', status: 'connected', toolCount: 2, modelVisibleToolCount: 1 },
        { id: 'broken', status: 'error', toolCount: 3, modelVisibleToolCount: 3 },
      ],
      skills: [
        { id: 'brainstorming', status: 'ready', modelVisible: false },
        { id: 'task-memory', status: 'ready', modelVisible: true },
        { id: 'needs-config', status: 'enabled', modelVisible: false },
      ],
    }));

    await expect(service.getSkillsStatus()).resolves.toEqual({
      catalogueCount: 1,
      enabledCount: 3,
      modelVisibleCount: 1,
      needsConfigCount: 1,
      readyCount: 2,
    });
    await expect(service.getMcpStatus()).resolves.toEqual({
      catalogueCount: 1,
      connectedServerCount: 2,
      errorCount: 1,
      modelVisibleToolCount: 1,
      toolCount: 6,
    });
  });

  it('turns invalid fixture payloads into non-visible error counts', async () => {
    const service = new CapabilityProductSurfaceStatusService(() => ({
      mcpServers: 'invalid',
      skills: 'invalid',
    }));

    await expect(service.getSkillsStatus()).resolves.toMatchObject({
      enabledCount: 0,
      modelVisibleCount: 0,
      needsConfigCount: 1,
      readyCount: 0,
    });
    await expect(service.getMcpStatus()).resolves.toMatchObject({
      connectedServerCount: 0,
      errorCount: 1,
      modelVisibleToolCount: 0,
      toolCount: 0,
    });
  });

  it('reads optional local fixture JSON without touching external services', () => {
    expect(readCapabilityProductSurfaceFixture(JSON.stringify({
      mcpServers: [{ id: 'playwright', status: 'connected', toolCount: 1, modelVisibleToolCount: 0 }],
      skills: [{ id: 'brainstorming', status: 'ready', modelVisible: false }],
    }))).toEqual({
      mcpServers: [{ id: 'playwright', status: 'connected', toolCount: 1, modelVisibleToolCount: 0 }],
      skills: [{ id: 'brainstorming', status: 'ready', modelVisible: false }],
    });
  });

  it('reports malformed local fixture JSON as invalid fixture sections', () => {
    expect(readCapabilityProductSurfaceFixture('{not json')).toEqual({
      mcpServers: 'invalid',
      skills: 'invalid',
    });
  });
});
