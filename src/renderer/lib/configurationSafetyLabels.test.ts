import { describe, expect, it } from 'vitest';

import { CONFIGURATION_SAFETY_STATE_LABELS, configurationSafetyProbePolicyLabel } from './configurationSafetyLabels';

describe('configuration safety labels', () => {
  it('keeps safety state labels shared across capability surfaces', () => {
    expect(CONFIGURATION_SAFETY_STATE_LABELS).toEqual({
      configured: '已配置',
      missing: '缺失',
      disabled_by_flag: '已关闭',
      disabled_by_policy: '策略关闭',
      approval_required: '需确认',
    });
  });

  it('keeps probe policy labels shared across Settings, Model, and capability strips', () => {
    expect(configurationSafetyProbePolicyLabel('manual_only')).toBe('仅手动');
    expect(configurationSafetyProbePolicyLabel('safe_read_only')).toBe('安全只读');
    expect(configurationSafetyProbePolicyLabel('never')).toBe('不自动');
    expect(configurationSafetyProbePolicyLabel(undefined)).toBe('仅手动');
  });
});
