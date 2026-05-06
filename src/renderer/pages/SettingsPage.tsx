import { useState, useEffect } from 'react';
import type { AiConfigStatus } from '@shared/types/settings';

const DEFAULT_FLAGS = {
  enableScheduler: false,
  enableProviderNativeToolCalls: true,
  enableSandboxCodingAgent: false,
  enableSandboxPatchPromotionApply: false,
  enableSelfCheck: true,
  enableSelfLearn: true,
  contextCompressionThreshold: 45,
};

export function SettingsPage() {
  const [status, setStatus] = useState<AiConfigStatus | null>(null);
  const [selfCheck, setSelfCheck] = useState(true);
  const [selfLearn, setSelfLearn] = useState(true);
  const [ctxCompress, setCtxCompress] = useState(45);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    if (!window.api) return;
    window.api.getAiConfigStatus().then((s) => {
      setStatus(s);
      setSelfCheck(s.featureFlags.enableSelfCheck ?? true);
      setSelfLearn(s.featureFlags.enableSelfLearn ?? true);
      setCtxCompress(s.featureFlags.contextCompressionThreshold ?? 45);
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
        featureFlags: {
          ...DEFAULT_FLAGS,
          ...(status?.featureFlags ?? {}),
          enableSelfCheck: selfCheck,
          enableSelfLearn: selfLearn,
          contextCompressionThreshold: ctxCompress,
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
            <span className="settings-label">自检查（Self-Check）</span>
            <span className="settings-hint">Run 级和任务完成检查可关闭；Step 级轻量对照始终保留</span>
          </div>
          <Toggle value={selfCheck} onChange={setSelfCheck} />
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <span className="settings-label">自学习（Self-Learn）</span>
            <span className="settings-hint">任务完成时 AI 提炼工作习惯并更新 Context 记忆</span>
          </div>
          <Toggle value={selfLearn} onChange={setSelfLearn} />
        </div>

        <div className="settings-field" style={{ marginTop: 16 }}>
          <label className="settings-label">
            上下文压缩阈值
            <span className="settings-badge">{ctxCompress}%</span>
          </label>
          <input
            type="range" min={30} max={70} step={5}
            value={ctxCompress}
            onChange={(e) => setCtxCompress(Number(e.target.value))}
            className="settings-range"
          />
          <p className="settings-hint">用于右侧任务对话的刷新建议；推荐 40–50%。真正压缩前会先保留任务记忆。</p>
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
          修改 Provider 密钥或切换模型请前往 <strong>Model</strong> 页。
        </p>
      </section>

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
