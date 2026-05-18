// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CapabilityRegistryEntry } from '@shared/capability-registry';
import type { ConfigurationSafetySurface } from '@shared/configuration-safety-report';
import { CapabilitySafetyStrip } from './CapabilitySafetyStrip';

describe('CapabilitySafetyStrip', () => {
  it('uses default capability safety labels for generic capability pages', () => {
    render(
      <CapabilitySafetyStrip
        capability={capability({ status: 'disabled' })}
        safety={safety({ state: 'disabled_by_policy', reason: 'No ready skill is enabled.' })}
      />,
    );

    expect(screen.getByText('能力状态')).toBeTruthy();
    expect(screen.getByText('策略关闭')).toBeTruthy();
    expect(screen.getByText('探测策略')).toBeTruthy();
    expect(screen.getByText('仅手动')).toBeTruthy();
    expect(screen.getByText('调用边界')).toBeTruthy();
    expect(screen.getByText('需确认')).toBeTruthy();
    expect(screen.getByText('No ready skill is enabled.')).toBeTruthy();
  });

  it('allows External Access to reuse the same safety projection with connector-specific labels', () => {
    render(
      <CapabilitySafetyStrip
        capability={capability({ status: 'unconfigured', missingReason: 'Gmail authorization is pending.' })}
        safety={safety({ state: 'missing', reason: 'External access connector authorization is pending or has errors.' })}
        statusLabel="连接器状态"
        unconfiguredLabel="未连接"
        boundaryLabel="入库边界"
        boundaryValue="先质检，再确认"
      />,
    );

    expect(screen.getByText('连接器状态')).toBeTruthy();
    expect(screen.getByText('未连接')).toBeTruthy();
    expect(screen.getByText('入库边界')).toBeTruthy();
    expect(screen.getByText('先质检，再确认')).toBeTruthy();
    expect(screen.getByText('External access connector authorization is pending or has errors.')).toBeTruthy();
  });
});

function capability(partial: Partial<CapabilityRegistryEntry> = {}): CapabilityRegistryEntry {
  return {
    id: partial.id ?? 'skills.catalogue',
    label: partial.label ?? 'Skills',
    family: partial.family ?? 'skill',
    status: partial.status ?? 'available',
    configured: partial.configured ?? partial.status === 'available',
    missingReason: partial.missingReason ?? null,
    visibility: partial.visibility ?? 'hidden',
    access: partial.access ?? 'mixed',
    requiresApproval: partial.requiresApproval ?? true,
    requiredGate: partial.requiredGate ?? 'runtime_entrypoint_coverage',
    summary: partial.summary ?? 'enabled=1 / ready=1 / needsConfig=0 / catalogue=1',
  };
}

function safety(partial: Partial<ConfigurationSafetySurface> = {}): ConfigurationSafetySurface {
  return {
    id: partial.id ?? 'skills.catalogue',
    state: partial.state ?? 'approval_required',
    reason: partial.reason ?? 'enabled=1 / ready=1 / needsConfig=0 / catalogue=1',
    requiresApproval: partial.requiresApproval ?? true,
    startupProbePolicy: partial.startupProbePolicy ?? 'manual_only',
    exposesSecretValue: partial.exposesSecretValue ?? false,
  };
}
