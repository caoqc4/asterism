import type { CapabilityRegistryEntry } from '@shared/capability-registry';
import type { ConfigurationSafetySurface } from '@shared/configuration-safety-report';

export function CapabilitySafetyStrip({
  capability,
  safety,
}: {
  capability: CapabilityRegistryEntry | null;
  safety: ConfigurationSafetySurface | null;
}) {
  return (
    <div className="connections-safety-strip">
      <div className="connections-safety-item">
        <span>能力状态</span>
        <strong>{capabilityStatusLabel(capability, safety)}</strong>
      </div>
      <div className="connections-safety-item">
        <span>探测策略</span>
        <strong>{probePolicyLabel(safety?.startupProbePolicy)}</strong>
      </div>
      <div className="connections-safety-item">
        <span>调用边界</span>
        <strong>{capability?.requiresApproval ? '需确认' : '只读可用'}</strong>
      </div>
      <p>
        {safety?.reason
          ?? capability?.missingReason
          ?? '该能力还没有接入结构化状态；不会自动暴露给 AI。'}
      </p>
    </div>
  );
}

function capabilityStatusLabel(
  capability: CapabilityRegistryEntry | null,
  safety: ConfigurationSafetySurface | null,
): string {
  if (!capability) return '未接入';
  if (capability.status === 'available') return '可用';
  if (capability.status === 'unconfigured') return '未配置';
  if (capability.status === 'disabled' && safety?.state === 'disabled_by_policy') return '策略关闭';
  if (capability.status === 'disabled') return '已关闭';
  return '未知';
}

function probePolicyLabel(policy: ConfigurationSafetySurface['startupProbePolicy'] | undefined): string {
  if (policy === 'manual_only') return '仅手动';
  if (policy === 'safe_read_only') return '安全只读';
  if (policy === 'never') return '不自动';
  return '仅手动';
}
