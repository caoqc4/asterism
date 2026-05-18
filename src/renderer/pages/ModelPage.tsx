import { useState, useEffect } from 'react';
import type { ConfigurationSafetySurface } from '@shared/configuration-safety-report';
import type { AiConfigStatus, AiProvider } from '@shared/types/settings';
import { CONFIGURATION_SAFETY_STATE_LABELS, configurationSafetyProbePolicyLabel } from '../lib/configurationSafetyLabels';

interface ModelDef {
  id: string;
  name: string;
  desc: string;
  recommended?: boolean;
}

interface ProviderSection {
  provider: AiProvider;
  label: string;
  keyField: KeyField;
  placeholder: string;
  hint: string;
  models: ModelDef[];
  customBaseUrl?: boolean;
}

type KeyField = 'falOpenRouter' | 'anthropic' | 'openai' | 'google' | 'deepseek' | 'groq' | 'customKey';

const PROVIDERS: ProviderSection[] = [
  {
    provider: 'fal-openrouter',
    label: 'fal · OpenRouter',
    keyField: 'falOpenRouter',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:...',
    hint: '在 fal.ai 获取，通过 OpenRouter 路由 Gemini、GPT、Llama 等。',
    models: [
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: '快速多模态', recommended: true },
      { id: 'google/gemini-2.5-pro',   name: 'Gemini 2.5 Pro',   desc: '强推理' },
      { id: 'openai/gpt-4o',           name: 'GPT-4o',           desc: '工具调用稳定' },
      { id: 'openai/gpt-4o-mini',      name: 'GPT-4o mini',      desc: '轻量快速' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', desc: '开源' },
    ],
  },
  {
    provider: 'anthropic',
    label: 'Anthropic',
    keyField: 'anthropic',
    placeholder: 'sk-ant-...',
    hint: '在 console.anthropic.com 获取。密钥存储在本地系统钥匙串。',
    models: [
      { id: 'claude-sonnet-4-6',         name: 'Claude Sonnet 4.6', desc: '最佳平衡', recommended: true },
      { id: 'claude-opus-4-7',           name: 'Claude Opus 4.7',   desc: '旗舰，复杂分析' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5',  desc: '快速轻量' },
    ],
  },
  {
    provider: 'openai',
    label: 'OpenAI',
    keyField: 'openai',
    placeholder: 'sk-...',
    hint: '在 platform.openai.com 获取。',
    models: [
      { id: 'gpt-4o',      name: 'GPT-4o',      desc: '旗舰，工具调用稳定', recommended: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', desc: '轻量快速' },
      { id: 'o3-mini',     name: 'o3-mini',      desc: '强推理' },
    ],
  },
  {
    provider: 'google',
    label: 'Google Gemini',
    keyField: 'google',
    placeholder: 'AIza...',
    hint: '在 aistudio.google.com 获取。直连 Google API，无需中转。',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: '快速多模态', recommended: true },
      { id: 'gemini-2.5-pro',   name: 'Gemini 2.5 Pro',   desc: '强推理' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: '稳定版' },
    ],
  },
  {
    provider: 'deepseek',
    label: 'DeepSeek',
    keyField: 'deepseek',
    placeholder: 'sk-...',
    hint: '在 platform.deepseek.com 获取。强推理，性价比高。',
    models: [
      { id: 'deepseek-chat',     name: 'DeepSeek V3',     desc: '通用对话', recommended: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1',     desc: '深度推理' },
    ],
  },
  {
    provider: 'groq',
    label: 'Groq',
    keyField: 'groq',
    placeholder: 'gsk_...',
    hint: '在 console.groq.com 获取。超低延迟推理加速。',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', desc: '高速推理', recommended: true },
      { id: 'mixtral-8x7b-32768',      name: 'Mixtral 8x7B',  desc: '长上下文' },
    ],
  },
  {
    provider: 'openai-compatible',
    label: '自定义端点',
    keyField: 'customKey',
    placeholder: 'Bearer token 或 API Key',
    hint: '兼容 OpenAI API 格式（Ollama、LM Studio、Together.ai 等）。',
    models: [],
    customBaseUrl: true,
  },
];

export function ModelPage() {
  const [status, setStatus] = useState<AiConfigStatus | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>('fal-openrouter');
  const [selectedModel, setSelectedModel] = useState<string>('google/gemini-2.5-flash');
  const [customModelId, setCustomModelId] = useState('');
  const [keys, setKeys] = useState<Partial<Record<KeyField, string>>>({});
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [showKeys, setShowKeys] = useState<Partial<Record<KeyField, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    if (!window.api) return;
    window.api.getAiConfigStatus().then((s) => {
      setStatus(s);
      if (s.model) setSelectedModel(s.model);
      if (s.provider) setSelectedProvider(s.provider);
    }).catch(() => {});
  }, []);

  function setKey(field: KeyField, value: string) {
    setKeys((prev) => ({ ...prev, [field]: value }));
  }

  function toggleShow(field: KeyField) {
    setShowKeys((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  function handleProviderClick(p: AiProvider) {
    setSelectedProvider(p);
    const section = PROVIDERS.find((s) => s.provider === p);
    const firstModel = section?.models[0];
    if (firstModel) setSelectedModel(firstModel.id);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const effectiveModel = selectedProvider === 'openai-compatible'
        ? customModelId || selectedModel
        : selectedModel;
      const next = await window.api.setAiConfig({
        provider: selectedProvider,
        model: effectiveModel,
        providerKeys: {
          anthropic:    keys.anthropic    || undefined,
          openai:       keys.openai       || undefined,
          google:       keys.google       || undefined,
          deepseek:     keys.deepseek     || undefined,
          groq:         keys.groq         || undefined,
          falOpenRouter: keys.falOpenRouter || undefined,
          customKey:    keys.customKey    || undefined,
          customBaseUrl: customBaseUrl    || undefined,
        },
        featureFlags: status?.featureFlags ?? { enableScheduler: false, enableProviderNativeToolCalls: true },
      });
      setStatus(next);
      setKeys({});
      setSaveResult('ok');
    } catch {
      setSaveResult('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 2500);
    }
  }

  const configuredProviders = new Set(status?.configuredProviders ?? []);
  const modelSafetySurfaces = status?.configurationSafetyReport?.surfaces
    .filter((surface) => surface.id === 'model.provider' || surface.id === 'model.api_key')
    ?? [];

  return (
    <div className="model-page">
      <div className="model-page-head">
        <h2 className="model-page-title">Model</h2>
        <p className="model-page-subtitle">配置 AI Provider 密钥，选择默认使用的模型。</p>
        <p className="model-page-boundary">Provider 密钥保存在本机系统钥匙串；模型选择只影响后续 AI 调用，不会写入任务记忆。</p>
      </div>

      <ModelConfigurationSafety surfaces={modelSafetySurfaces} />

      {PROVIDERS.map((section) => {
        const isConfigured = configuredProviders.has(section.provider);
        const isSelected = selectedProvider === section.provider;
        const keyVal = keys[section.keyField] ?? '';
        const isUnlocked = isConfigured || Boolean(keyVal);

        return (
          <div
            key={section.provider}
            className={`model-provider-block${isSelected ? ' active' : ''}`}
            onClick={() => !isSelected && handleProviderClick(section.provider)}
          >
            <div className="model-provider-header">
              <div className="model-provider-header-left">
                <span className="model-provider-label">{section.label}</span>
                {isConfigured && !keyVal && (
                  <span className="model-provider-status configured">已配置 ✓</span>
                )}
              </div>
              {isSelected && <span className="model-provider-active-dot" />}
            </div>

            {isSelected && (
              <div className="model-provider-body">
                {/* Key input */}
                {section.customBaseUrl && (
                  <input
                    className="settings-input"
                    type="text"
                    value={customBaseUrl}
                    placeholder="Base URL  https://your-endpoint.com/v1"
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    style={{ marginBottom: 6 }}
                  />
                )}
                <div className="settings-api-row" style={{ marginBottom: 4 }}>
                  <input
                    className="settings-input"
                    type={showKeys[section.keyField] ? 'text' : 'password'}
                    value={keyVal}
                    placeholder={isConfigured ? '（已存储，输入新值可覆盖）' : section.placeholder}
                    onChange={(e) => setKey(section.keyField, e.target.value)}
                  />
                  <button className="btn sm ghost" onClick={() => toggleShow(section.keyField)}>
                    {showKeys[section.keyField] ? '隐藏' : '显示'}
                  </button>
                </div>
                <p className="settings-hint" style={{ marginBottom: 14 }}>{section.hint}</p>

                {/* Model selector */}
                {section.models.length > 0 ? (
                  <div className="model-select-row">
                    <label className="settings-label">默认模型</label>
                    <select
                      className="model-select"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={!isUnlocked}
                    >
                      {section.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}{m.recommended ? ' ★' : ''} — {m.desc}
                        </option>
                      ))}
                    </select>
                    <span className="model-select-id mono muted">{selectedModel}</span>
                  </div>
                ) : (
                  <div className="model-select-row">
                    <label className="settings-label">模型 ID</label>
                    <input
                      className="settings-input"
                      type="text"
                      value={customModelId}
                      placeholder="例：mistral-7b-instruct"
                      onChange={(e) => setCustomModelId(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer */}
      <div className="model-page-footer">
        <span className="muted" style={{ fontSize: 12 }}>
          {status?.model
            ? <>当前生效：<span className="mono">{status.provider} / {status.model}</span></>
            : '尚未配置'}
        </span>
        <button
          className={`btn primary${saving ? ' disabled' : ''}${saveResult === 'ok' ? ' saved' : ''}${saveResult === 'error' ? ' danger' : ''}`}
          onClick={save}
          disabled={saving}
        >
          {saving ? '保存中…' : saveResult === 'ok' ? '已保存 ✓' : saveResult === 'error' ? '保存失败' : '保存'}
        </button>
      </div>
    </div>
  );
}

function ModelConfigurationSafety({ surfaces }: { surfaces: ConfigurationSafetySurface[] }) {
  if (surfaces.length === 0) {
    return (
      <section className="settings-section model-safety-section">
        <div className="settings-section-title">模型配置边界</div>
        <p className="settings-hint">模型安全报告尚未生成；Model 页不会主动探测外部服务或读取密钥明文。</p>
      </section>
    );
  }

  return (
    <section className="settings-section model-safety-section">
      <div className="settings-section-title">模型配置边界</div>
      <div className="settings-safety-list">
        {surfaces.map((surface) => (
          <div key={surface.id} className="settings-safety-row">
            <div className="settings-safety-main">
              <span className={`settings-safety-state ${surface.state}`}>
                {CONFIGURATION_SAFETY_STATE_LABELS[surface.state]}
              </span>
              <span className="settings-safety-id">{surface.id}</span>
            </div>
            <div className="settings-safety-detail">
              <span>{surface.reason}</span>
              <span>
                探测：{configurationSafetyProbePolicyLabel(surface.startupProbePolicy)}
                {surface.requiresApproval ? ' · 需用户确认' : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
