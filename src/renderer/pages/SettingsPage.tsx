import { useState, useEffect } from 'react';
import type { AiCommunicationStyle, AiConfigStatus, AiConfirmationThreshold } from '@shared/types/settings';
import type { ConfigurationSafetyReport, ConfigurationSafetySurface } from '@shared/configuration-safety-report';
import { CONTEXT_COMPRESSION_THRESHOLD, DEFAULT_FEATURE_FLAGS, SELF_CHECK_RETRY_LIMIT } from '@shared/settings-defaults';
import { CONFIGURATION_SAFETY_STATE_LABELS, configurationSafetyProbePolicyLabel } from '../lib/configurationSafetyLabels';

const COMMUNICATION_STYLE_LABELS: Record<AiCommunicationStyle, string> = {
  concise: '简洁',
  balanced: '均衡',
  detailed: '详细',
};

const CONFIRMATION_THRESHOLD_LABELS: Record<AiConfirmationThreshold, string> = {
  low: '低',
  normal: '标准',
  high: '高',
};

export function SettingsPage() {
  const [status, setStatus] = useState<AiConfigStatus | null>(null);
  const [selfCheck, setSelfCheck] = useState(true);
  const [selfLearn, setSelfLearn] = useState(true);
  const [ctxCompress, setCtxCompress] = useState<number>(CONTEXT_COMPRESSION_THRESHOLD.default);
  const [selfCheckRetries, setSelfCheckRetries] = useState<number>(SELF_CHECK_RETRY_LIMIT.default);
  const [communicationStyle, setCommunicationStyle] = useState<AiCommunicationStyle>('balanced');
  const [confirmationThreshold, setConfirmationThreshold] = useState<AiConfirmationThreshold>('normal');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    if (!window.api) return;
    window.api.getAiConfigStatus().then((s) => {
      setStatus(s);
      setSelfCheck(s.featureFlags.enableSelfCheck ?? true);
      setSelfLearn(s.featureFlags.enableSelfLearn ?? true);
      setCtxCompress(s.featureFlags.contextCompressionThreshold ?? CONTEXT_COMPRESSION_THRESHOLD.default);
      setSelfCheckRetries(s.featureFlags.selfCheckRetryLimit ?? SELF_CHECK_RETRY_LIMIT.default);
      setCommunicationStyle(s.featureFlags.communicationStyle ?? 'balanced');
      setConfirmationThreshold(s.featureFlags.confirmationThreshold ?? 'normal');
    }).catch(() => {});
  }, []);

  async function save() {
    if (saving || !window.api) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const next = await window.api.setAiConfig({
        provider: status?.provider ?? 'fal-openrouter',
        model: status?.model ?? 'google/gemini-2.5-flash',
        workspaceRoot: status?.workspaceRoot ?? null,
        featureFlags: {
          ...DEFAULT_FEATURE_FLAGS,
          enableProviderNativeToolCalls: true,
          ...(status?.featureFlags ?? {}),
          enableSelfCheck: selfCheck,
          enableSelfLearn: selfLearn,
          contextCompressionThreshold: ctxCompress,
          selfCheckRetryLimit: selfCheckRetries,
          communicationStyle,
          confirmationThreshold,
        },
      });
      setStatus(next);
      setSaveResult('ok');
    } catch {
      setSaveResult('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 2500);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-head">
        <h2 className="settings-title">Settings</h2>
        {status && (
          <div className={`settings-status-chip ${status.configured ? 'ok' : 'warn'}`}>
            {status.configured ? '✓ 已配置' : '未配置'}
          </div>
        )}
      </div>

      {/* AI Behavior */}
      <section className="settings-section">
        <div className="settings-section-title">AI 行为</div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <span className="settings-label">Run / Next Action 自检查</span>
            <span className="settings-hint">控制 Run 级验证和 Next Action 完成确认；Step 级轻量对照始终保留</span>
          </div>
          <Toggle value={selfCheck} onChange={setSelfCheck} />
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <span className="settings-label">自学习（Self-Learn）</span>
            <span className="settings-hint">完成、覆盖、SOP 提取等节点提炼工作习惯；关闭后不生成新的习惯提议</span>
          </div>
          <Toggle value={selfLearn} onChange={setSelfLearn} />
        </div>

        <div className="settings-behavior-note">
          Step 级检查是执行质量基线，通过时静默，只在失败时留下说明；Run / Next Action 检查只在失败、等待拍板或完成确认时提示。自学习绑定在完成、覆盖、SOP 提取等节点触发，不做持续行为监控；学到的规则会在 Work Habits 展示，可停用或删除。
        </div>

        <div className="settings-field" style={{ marginTop: 16 }}>
          <div className="settings-label">沟通风格</div>
          <SegmentedControl
            value={communicationStyle}
            options={['concise', 'balanced', 'detailed']}
            labels={COMMUNICATION_STYLE_LABELS}
            onChange={setCommunicationStyle}
          />
          <p className="settings-hint">影响 AI 的回答密度和展开程度；不改变业务线、Records 或 Next Actions 的生命周期。</p>
        </div>

        <div className="settings-field" style={{ marginTop: 16 }}>
          <div className="settings-label">确认阈值</div>
          <SegmentedControl
            value={confirmationThreshold}
            options={['low', 'normal', 'high']}
            labels={CONFIRMATION_THRESHOLD_LABELS}
            onChange={setConfirmationThreshold}
          />
          <p className="settings-hint">用于校准 AI 遇到风险、外部动作或不确定结论时主动请你确认的频率。</p>
          <p className="settings-hint">低：更少打断；标准：风险和外部动作会确认；高：不确定结论也更常请你拍板。</p>
          <p className="settings-hint">此设置不绕过 Standing Approval、workspace 写入、外部连接或付费/发布类硬确认；它只调整低风险对话和建议中的打断频率。</p>
        </div>

        <div className="settings-field" style={{ marginTop: 16 }}>
          <label className="settings-label">
            Step 级自动修正上限
            <span className="settings-badge">{selfCheckRetries} 次</span>
          </label>
          <input
            type="range"
            min={SELF_CHECK_RETRY_LIMIT.min}
            max={SELF_CHECK_RETRY_LIMIT.max}
            step={SELF_CHECK_RETRY_LIMIT.step}
            value={selfCheckRetries}
            onChange={(e) => setSelfCheckRetries(Number(e.target.value))}
            className="settings-range"
          />
          <p className="settings-hint">用于 Step 级检查失败后的自动修正上限；0 表示失败后直接等待人工处理。</p>
        </div>

        <div className="settings-field" style={{ marginTop: 16 }}>
          <label className="settings-label">
            上下文压缩阈值
            <span className="settings-badge">{ctxCompress}%</span>
          </label>
          <input
            type="range"
            min={CONTEXT_COMPRESSION_THRESHOLD.min}
            max={CONTEXT_COMPRESSION_THRESHOLD.max}
            step={CONTEXT_COMPRESSION_THRESHOLD.step}
            value={ctxCompress}
            onChange={(e) => setCtxCompress(Number(e.target.value))}
            className="settings-range"
          />
          <p className="settings-hint">用于业务线和 Next Action 对话的刷新建议；推荐 40–50%。真正压缩前会先保留关键决策、偏好变化和未解决问题。</p>
        </div>
      </section>

      {/* Current model summary — always visible */}
      <section className="settings-section">
        <div className="settings-section-title">当前 AI 配置</div>
        <div className="settings-current">
          <span className="settings-hint">活跃模型：</span>
          <span className="mono" style={{ fontSize: 11.5 }}>
            {status ? `${status.provider} / ${status.model}` : '加载中…'}
          </span>
        </div>
        <p className="settings-hint" style={{ marginTop: 6 }}>
          修改模型服务配置、设置 Workspace root 或查看 Agent CLI / Agent API Runtime 状态请前往 <strong>AI Runtime</strong> 页。
        </p>
      </section>

      <ConfigurationSafetySection report={status?.configurationSafetyReport ?? null} />

      {/* Save */}
      <div className="settings-footer">
        <button
          className={`btn primary${saving ? ' disabled' : ''}${saveResult === 'ok' ? ' saved' : ''}${saveResult === 'error' ? ' danger' : ''}`}
          onClick={save}
          disabled={saving}
        >
          {saving ? '保存中…' : saveResult === 'ok' ? '已保存 ✓' : saveResult === 'error' ? '保存失败' : '保存设置'}
        </button>
      </div>
    </div>
  );
}

function ConfigurationSafetySection({ report }: { report: ConfigurationSafetyReport | null }) {
  if (!report) {
    return (
      <section className="settings-section">
        <div className="settings-section-title">配置安全边界</div>
        <p className="settings-hint">安全报告尚未生成；Settings 不会主动探测外部服务或读取密钥明文。</p>
      </section>
    );
  }

  const configuredCount = report.surfaces.filter((surface) => surface.state === 'configured').length;
  const approvalCount = report.surfaces.filter((surface) => surface.state === 'approval_required').length;

  return (
    <section className="settings-section">
      <div className="settings-section-title">配置安全边界</div>
      <div className="settings-safety-summary">
        <span>已配置 {configuredCount}</span>
        <span>需确认 {approvalCount}</span>
        <span>受阻 {report.blockedReasons.length}</span>
        <span>{report.secretExposureSafe ? '密钥不外显' : '需检查密钥展示'}</span>
      </div>
      <div className="settings-safety-list">
        {report.surfaces.map((surface) => {
          const evidenceChips = configurationSafetyEvidenceChips(surface);
          return (
            <div key={surface.id} className="settings-safety-row">
              <div className="settings-safety-main">
                <span className={`settings-safety-state ${surface.state}`}>
                  {CONFIGURATION_SAFETY_STATE_LABELS[surface.state]}
                </span>
                <span className="settings-safety-id">{surface.id}</span>
              </div>
              <div className="settings-safety-detail">
                <span>{surface.reason}</span>
                {surface.diagnosticSummary && surface.diagnosticSummary !== surface.reason && (
                  <span>诊断：{surface.diagnosticSummary}</span>
                )}
                {evidenceChips.length > 0 && (
                  <div className="settings-safety-evidence" aria-label={`${surface.id} evidence`}>
                    {evidenceChips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                )}
                <span>
                  探测：{configurationSafetyProbePolicyLabel(surface.startupProbePolicy)}
                  {surface.requiresApproval ? ' · 需用户确认' : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {report.blockedReasons.length > 0 && (
        <p className="settings-hint" style={{ marginTop: 8 }}>
          当前不会自动启用受阻能力；需要在对应页面配置或手动确认后才会进入运行时。
        </p>
      )}
    </section>
  );
}

function configurationSafetyEvidenceChips(surface: ConfigurationSafetySurface): string[] {
  if (surface.id === 'sandbox.patch_promotion') {
    return configurationSafetyScalarChips(surface, [
      'promotionReady',
      'promotionRequirements',
      'promotionSatisfiedRequirements',
      'promotionMissingRequirements',
      'missingRequirements',
      'selectedRuntimeContract',
      'selectedRuntimeRun',
      'selectedRuntimeRunEvidenceChain',
      'selectedRuntimeTask',
      'selectedRuntimeTaskEvidenceChain',
      'selectedRuntimeProvider',
      'selectedRuntimeProviderEvidenceChain',
      'providerConfigured',
      'configuredProvider',
      'configuredProviderEvidenceChain',
      'targetTaskIdentity',
      'targetTaskEvidenceChain',
      'checkpointEvidenceChain',
      'sameRunEvidenceChain',
      'explicitOperatorApply',
      'postApplyRunEvidence',
      'operatorId',
      'operatorApplyTask',
      'operatorApplyRun',
      'operatorApplyCheckpoint',
      'operatorApplyEvidenceChain',
      'patchArtifactId',
      'decisionArtifactId',
      'preflightArtifactId',
      'decisionArtifactEvidenceChain',
      'artifactEvidenceChain',
      'promotionDecisionId',
      'promotionCheckpointId',
      'preflightCheckpointId',
      'patchArtifactTask',
      'promotionDecisionTask',
      'promotionPreflightTask',
      'postApplyTask',
      'patchRunId',
      'decisionRunId',
      'preflightRunId',
      'postApplyRunId',
      'sameRunId',
      'expectedFileCount',
      'expectedFiles',
      'expectedFileEvidenceChain',
      'touchedFileCount',
      'touchedFiles',
      'postApplyFilesMatched',
      'filePathSafetyChain',
      'touchedFileEvidenceChain',
    ]);
  }
  if (surface.id !== 'runtime.scheduler') return [];
  return configurationSafetyScalarChips(surface, [
    'proposalReady',
    'proposalRequirements',
    'proposalSatisfiedRequirements',
    'proposalMissingRequirements',
    'missingRequirements',
    'approvalQueueSurface',
    'decisionPayload',
    'decisionTitle',
    'decisionTitleKey',
    'decisionRationale',
    'decisionOptions',
    'decisionOptionKeys',
    'decisionOptionIdentity',
    'decisionProposedOutcome',
    'decisionProposedOutcomeKey',
    'decisionProposedOutcomeMatchesOption',
    'authorization',
    'operatorId',
    'localRecoveryRunId',
    'localRecoveryTask',
    'localRecoveryCompleted',
    'localRecoveryTaskMatched',
    'standingApprovalPolicyId',
    'standingApprovalScopeTask',
    'standingApprovalActive',
    'standingApprovalScopeMatched',
    'decisionPersistenceAllowed',
    'writebackDispatchAllowed',
    'schedulerTriggerAllowed',
    'triggerPlanReady',
    'runtimeStartAllowed',
    'runtimeStartReady',
    'runtimeStartRequirements',
    'runtimeStartSatisfiedRequirements',
    'runtimeStartMissingRequirements',
    'schedulerTriggerServiceConnected',
    'selectedRuntimeIdentity',
  ]);
}

function configurationSafetyScalarChips(surface: ConfigurationSafetySurface, keys: string[]): string[] {
  const text = `${surface.reason} / ${surface.diagnosticSummary ?? ''}`;
  return keys.map((key) => {
    const value = scalarSummaryValue(text, key);
    return value ? `${key}=${value}` : null;
  }).filter((chip): chip is string => Boolean(chip));
}

function scalarSummaryValue(summary: string, key: string): string | null {
  const prefix = `${key}=`;
  const part = summary.split(' / ').find((item) => item.trim().startsWith(prefix));
  return part?.trim().slice(prefix.length).trim() ?? null;
}

function SegmentedControl<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-segmented">
      {options.map((option) => (
        <button
          key={option}
          className={`settings-segment${value === option ? ' active' : ''}`}
          onClick={() => onChange(option)}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle${value ? ' on' : ''}`}
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
    >
      <span className="toggle-thumb" />
    </button>
  );
}
