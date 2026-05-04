import { useState, useEffect } from 'react';
import type { AiConfigInput, AiConfigStatus, AiProvider } from '@shared/types/settings';

/* ─── Provider catalog ─── */

interface ProviderDef {
  id: AiProvider;
  name: string;
  placeholder: string;
  keyLabel: string;
  models: { id: string; name: string; desc: string }[];
  baseUrlRequired?: boolean;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    placeholder: 'sk-ant-...',
    keyLabel: 'API Key',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', desc: '日常任务推进的最佳平衡' },
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', desc: '复杂分析与深度规划' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', desc: '快速响应、轻量操作' },
    ],
  },
  {
    id: 'fal-openrouter',
    name: 'fal (OpenRouter)',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:...',
    keyLabel: 'fal Key',
    models: [
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: '快速、多模态，cost-efficient' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: '强推理，适合复杂任务' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', desc: '通用，工具调用稳定' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', desc: '轻量快速' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', desc: '开源，自定义友好' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    placeholder: 'sk-...',
    keyLabel: 'API Key',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', desc: '旗舰，工具调用稳定' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', desc: '轻量快速' },
      { id: 'o3-mini', name: 'o3-mini', desc: '强推理' },
    ],
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI-Compatible',
    placeholder: 'Bearer token 或 API Key',
    keyLabel: 'API Key',
    baseUrlRequired: true,
    models: [
      { id: 'custom', name: '自定义模型 ID', desc: '填写下方模型 ID 字段' },
    ],
  },
];

const DEFAULT_FEATURE_FLAGS = {
  enableScheduler: false,
  enableProviderNativeToolCalls: true,
  enableSandboxCodingAgent: false,
  enableSandboxPatchPromotionApply: false,
};

export function SettingsPage() {
  const [status, setStatus] = useState<AiConfigStatus | null>(null);
  const [provider, setProvider] = useState<AiProvider>('fal-openrouter');
  const [model, setModel] = useState('google/gemini-2.5-flash');
  const [customModel, setCustomModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selfCheck, setSelfCheck] = useState(true);
  const [selfLearn, setSelfLearn] = useState(true);
  const [ctxCompress, setCtxCompress] = useState(45);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null);

  // Load current config from backend
  useEffect(() => {
    if (!window.api) return;
    window.api.getAiConfigStatus().then((s) => {
      setStatus(s);
      if (s.provider) setProvider(s.provider);
      if (s.model) setModel(s.model);
      if (s.baseUrl) setBaseUrl(s.baseUrl);
    }).catch(() => {});
  }, []);

  const providerDef = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  const effectiveModel = model === 'custom' ? customModel : model;

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const input: AiConfigInput = {
        provider,
        model: effectiveModel,
        apiKey,
        baseUrl: baseUrl || undefined,
        featureFlags: {
          ...DEFAULT_FEATURE_FLAGS,
        },
      };
      if (window.api) {
        const next = await window.api.setAiConfig(input);
        setStatus(next);
      }
      setSaveResult('ok');
    } catch {
      setSaveResult('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 2500);
    }
  }

  function handleProviderChange(p: AiProvider) {
    setProvider(p);
    const def = PROVIDERS.find((d) => d.id === p);
    if (def?.models[0]) setModel(def.models[0].id);
    setApiKey('');
    setBaseUrl('');
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

      {/* Provider + API Key */}
      <section className="settings-section">
        <div className="settings-section-title">AI Provider</div>

        {/* Provider selector */}
        <div className="settings-field">
          <label className="settings-label">Provider</label>
          <div className="provider-tabs">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                className={`provider-tab${provider === p.id ? ' active' : ''}`}
                onClick={() => handleProviderChange(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* API Key */}
        <div className="settings-field">
          <label className="settings-label">{providerDef.keyLabel}</label>
          <div className="settings-api-row">
            <input
              className="settings-input"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              placeholder={status?.apiKeyStored ? '（已存储，输入新值可覆盖）' : providerDef.placeholder}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button className="btn sm ghost" onClick={() => setShowKey((v) => !v)}>
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
          {status?.apiKeySource && (
            <p className="settings-hint">
              当前来源：{status.apiKeySource === 'keychain' ? '系统钥匙串' : '环境变量'}
            </p>
          )}
          {provider === 'anthropic' && (
            <p className="settings-hint">在 console.anthropic.com 获取。密钥仅存储在本地钥匙串。</p>
          )}
          {provider === 'fal-openrouter' && (
            <p className="settings-hint">在 fal.ai 获取。通过 OpenRouter 路由多家模型。</p>
          )}
          {provider === 'openai' && (
            <p className="settings-hint">在 platform.openai.com 获取。</p>
          )}
        </div>

        {/* Base URL (openai-compatible only) */}
        {(provider === 'openai-compatible') && (
          <div className="settings-field">
            <label className="settings-label">Base URL</label>
            <input
              className="settings-input"
              type="text"
              value={baseUrl}
              placeholder="https://your-endpoint.com/v1"
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
        )}
      </section>

      {/* Model */}
      <section className="settings-section">
        <div className="settings-section-title">模型</div>
        <p className="settings-section-desc">
          当前 provider 下可用模型。工作台内可按任务单独切换。
        </p>

        <div className="model-options">
          {providerDef.models.map((m) => (
            <button
              key={m.id}
              className={`model-option${model === m.id ? ' selected' : ''}`}
              onClick={() => setModel(m.id)}
            >
              <div className="model-option-head">
                <span className="model-name">{m.name}</span>
                <span className="model-id mono">{m.id}</span>
              </div>
              <p className="model-desc">{m.desc}</p>
              {model === m.id && <span className="model-check">✓</span>}
            </button>
          ))}

          {/* Custom model input for openai-compatible */}
          {provider === 'openai-compatible' && (
            <div className="settings-field" style={{ marginTop: 8 }}>
              <label className="settings-label">模型 ID</label>
              <input
                className="settings-input"
                type="text"
                value={customModel}
                placeholder="例：mistral-7b-instruct"
                onChange={(e) => setCustomModel(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Current config status */}
        {status?.model && (
          <div className="settings-current">
            <span className="settings-hint">当前生效：</span>
            <span className="mono" style={{ fontSize: 11.5 }}>{status.provider} / {status.model}</span>
          </div>
        )}
      </section>

      {/* AI Behavior */}
      <section className="settings-section">
        <div className="settings-section-title">AI 行为</div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <span className="settings-label">自检查（Self-Check）</span>
            <span className="settings-hint">Run 完成后 AI 自动验证输出质量，步骤级强制开启</span>
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
          <p className="settings-hint">会话窗口使用率达到此阈值时触发压缩。推荐 40–50%。</p>
        </div>
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
        {saveResult === 'error' && (
          <p className="settings-hint" style={{ color: 'var(--accent)', marginTop: 8 }}>
            保存失败，请检查 API Key 格式是否正确。
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Toggle ─── */

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
