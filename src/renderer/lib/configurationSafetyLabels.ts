import type { ConfigurationSafetyState, ConfigurationSafetySurface } from '@shared/configuration-safety-report';

export const CONFIGURATION_SAFETY_STATE_LABELS: Record<ConfigurationSafetyState, string> = {
  configured: '已配置',
  missing: '缺失',
  disabled_by_flag: '已关闭',
  disabled_by_policy: '策略关闭',
  approval_required: '需确认',
};

export function configurationSafetyProbePolicyLabel(
  policy: ConfigurationSafetySurface['startupProbePolicy'] | undefined,
): string {
  if (policy === 'manual_only') return '仅手动';
  if (policy === 'safe_read_only') return '安全只读';
  if (policy === 'never') return '不自动';
  return '仅手动';
}
