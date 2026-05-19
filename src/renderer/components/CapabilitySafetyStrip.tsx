import type { CapabilityRegistryEntry } from '@shared/capability-registry';
import type { ConfigurationSafetySurface } from '@shared/configuration-safety-report';
import { configurationSafetyProbePolicyLabel } from '../lib/configurationSafetyLabels';

export function CapabilitySafetyStrip({
  capability,
  boundaryLabel = '调用边界',
  boundaryValue,
  emptyReason = '该能力还没有接入结构化状态；不会自动暴露给 AI。',
  safety,
  statusLabel = '能力状态',
  unconfiguredLabel = '未配置',
}: {
  capability: CapabilityRegistryEntry | null;
  boundaryLabel?: string;
  boundaryValue?: string;
  emptyReason?: string;
  safety: ConfigurationSafetySurface | null;
  statusLabel?: string;
  unconfiguredLabel?: string;
}) {
  return (
    <div className="connections-safety-strip">
      <div className="connections-safety-item">
        <span>{statusLabel}</span>
        <strong>{capabilityStatusLabel(capability, safety, unconfiguredLabel)}</strong>
      </div>
      <div className="connections-safety-item">
        <span>探测策略</span>
        <strong>{configurationSafetyProbePolicyLabel(safety?.startupProbePolicy)}</strong>
      </div>
      <div className="connections-safety-item">
        <span>{boundaryLabel}</span>
        <strong>{boundaryValue ?? (capability?.requiresApproval ? '需确认' : '只读可用')}</strong>
      </div>
      <p>
        {safety?.reason
          ?? capability?.missingReason
          ?? emptyReason}
        {safety?.diagnosticSummary && safety.diagnosticSummary !== safety.reason
          ? ` / 诊断：${safety.diagnosticSummary}`
          : ''}
      </p>
    </div>
  );
}

function capabilityStatusLabel(
  capability: CapabilityRegistryEntry | null,
  safety: ConfigurationSafetySurface | null,
  unconfiguredLabel: string,
): string {
  if (!capability) return '未接入';
  if (capability.status === 'available') return '可用';
  if (capability.status === 'unconfigured') return unconfiguredLabel;
  if (capability.status === 'disabled' && safety?.state === 'disabled_by_policy') return '策略关闭';
  if (capability.status === 'disabled') return '已关闭';
  return '未知';
}
