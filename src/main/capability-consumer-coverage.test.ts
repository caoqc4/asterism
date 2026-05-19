import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

function readProjectFile(path: string): string {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('capability consumer coverage', () => {
  it('keeps capability pages on shared registry and safety projections', () => {
    const consumers = [
      {
        file: 'src/renderer/pages/ConnectionsPage.tsx',
        capabilityId: 'external_access.connectors',
      },
      {
        file: 'src/renderer/pages/SkillsPage.tsx',
        capabilityId: 'skills.catalogue',
      },
      {
        file: 'src/renderer/pages/McpPage.tsx',
        capabilityId: 'mcp.servers',
      },
    ];

    for (const consumer of consumers) {
      const source = readProjectFile(consumer.file);

      expect(source).toContain('CapabilitySafetyStrip');
      expect(source).toContain('configurationSafetyReport');
      expect(source).toContain('capabilityRegistry');
      expect(source).toContain(consumer.capabilityId);
    }
  });

  it('keeps Settings, AI Runtime, and agent pre-run summaries on shared capability status', () => {
    const settingsSource = readProjectFile('src/renderer/pages/SettingsPage.tsx');
    const modelSource = readProjectFile('src/renderer/pages/ModelPage.tsx');
    const agentSummarySource = readProjectFile('src/renderer/lib/agentCapabilities.ts');

    expect(settingsSource).toContain('ConfigurationSafetySection');
    expect(settingsSource).toContain('configurationSafetyReport');
    expect(modelSource).toContain('runtimeMode');
    expect(modelSource).toContain('Agent CLI');
    expect(modelSource).toContain('API Model');
    expect(agentSummarySource).toContain('capabilityRegistry');
    expect(agentSummarySource).toContain('optional Skills/MCP capabilities');
  });

  it('keeps AiConfigService as the bridge from product surfaces into registry and safety report', () => {
    const source = readProjectFile('src/main/keychain/ai-config-service.ts');

    expect(source).toContain('createCapabilityProductSurfaceStatusService');
    expect(source).toContain('createAgentCliRuntimeStatusService');
    expect(source).toContain('externalAccessStatusForCapability');
    expect(source).toContain('buildCapabilityRegistry');
    expect(source).toContain('buildConfigurationSafetyReport');
    expect(source).toContain('buildRuntimeCapabilitySnapshot');
  });
});
