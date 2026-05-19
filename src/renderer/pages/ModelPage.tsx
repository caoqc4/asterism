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
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [keys, setKeys] = useState<Partial<Record<KeyField, string>>>({});
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [showKeys, setShowKeys] = useState<Partial<Record<KeyField, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null);
  const [apiModelOpen, setApiModelOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    if (!window.api || refreshingStatus) return;
    setRefreshingStatus(true);
    try {
      const s = await window.api.getAiConfigStatus();
      setStatus(s);
      if (s.model) setSelectedModel(s.model);
      if (s.provider) setSelectedProvider(s.provider);
      setWorkspaceRoot(s.workspaceRoot ?? '');
    } catch {
      // Keep the last known status visible when a manual probe fails.
    } finally {
      setRefreshingStatus(false);
    }
  }

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
        workspaceRoot,
        featureFlags: status?.featureFlags ?? { enableScheduler: false, enableProviderNativeToolCalls: true },
      });
      setStatus(next);
      setWorkspaceRoot(next.workspaceRoot ?? '');
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
  const agentCliStatus = status?.agentCliRuntimeStatus ?? null;
  const agentCliSafety = status?.configurationSafetyReport?.surfaces
    .find((surface) => surface.id === 'agent_cli.runtimes') ?? null;
  const agentCliCapability = status?.capabilityRegistry
    ?.find((entry) => entry.id === 'agent_cli.runtimes') ?? null;

  return (
    <div className="model-page">
      <div className="model-page-head">
        <div>
          <h2 className="model-page-title">AI Runtime</h2>
          <p className="model-page-subtitle">优先使用本机官方 Agent CLI；API 模型只作为辅助配置。</p>
          <p className="model-page-boundary">账号登录在官方 CLI 中完成，Taskplane 只检测本机状态、配置工作目录并记录运行证据。</p>
        </div>
        <button
          className={`btn sm ghost${refreshingStatus ? ' disabled' : ''}`}
          onClick={() => void refreshStatus()}
          disabled={refreshingStatus}
          title="重新检测官方 CLI 登录和本机运行状态"
          type="button"
        >
          {refreshingStatus ? '检测中' : '重新检测'}
        </button>
      </div>

      <AgentCliRuntimeSection
        workspaceRoot={workspaceRoot}
        onWorkspaceRootChange={setWorkspaceRoot}
        status={agentCliStatus}
        safety={agentCliSafety}
        capabilitySummary={agentCliCapability?.summary ?? null}
        onSave={() => void save()}
        saveLabel={saving ? '保存中…' : saveResult === 'ok' ? '已保存' : '保存 Workspace root'}
        saveDisabled={saving}
      />

      <section className="model-api-section">
        <button
          className="model-collapsible-head"
          onClick={() => setApiModelOpen((value) => !value)}
          type="button"
        >
          <span>
            <span className="model-section-kicker">Auxiliary API Model</span>
            <span className="model-section-copy">可选。用于轻量 AI 辅助、摘要、草稿和内部工具；coding agent 优先走 Agent CLI。</span>
          </span>
          <span className="model-collapsible-state">{apiModelOpen ? '收起' : '展开'}</span>
        </button>
      </section>

      {apiModelOpen && PROVIDERS.map((section) => {
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

      <ModelConfigurationSafety
        open={safetyOpen}
        onToggle={() => setSafetyOpen((value) => !value)}
        surfaces={modelSafetySurfaces}
      />

      {/* Footer */}
      <div className="model-page-footer">
        <span className="muted" style={{ fontSize: 12 }}>
          {status?.model
            ? <>辅助 API 当前：<span className="mono">{status.provider} / {status.model}</span></>
            : '辅助 API 尚未配置'}
        </span>
        <button
          className={`btn primary${saving ? ' disabled' : ''}${saveResult === 'ok' ? ' saved' : ''}${saveResult === 'error' ? ' danger' : ''}`}
          onClick={save}
          disabled={saving}
        >
          {saving ? '保存中…' : saveResult === 'ok' ? '已保存 ✓' : saveResult === 'error' ? '保存失败' : '保存 AI Runtime 配置'}
        </button>
      </div>
    </div>
  );
}

function AgentCliRuntimeSection({
  workspaceRoot,
  onWorkspaceRootChange,
  onSave,
  saveDisabled,
  saveLabel,
  status,
  safety,
  capabilitySummary,
}: {
  workspaceRoot: string;
  onWorkspaceRootChange: (value: string) => void;
  onSave: () => void;
  saveDisabled: boolean;
  saveLabel: string;
  status: AiConfigStatus['agentCliRuntimeStatus'] | null;
  safety: ConfigurationSafetySurface | null;
  capabilitySummary: string | null;
}) {
  const runtimes = status?.runtimes ?? [];
  const readyRuntime = runtimes.find((runtime) => (
    runtime.installed
    && runtime.authState === 'ready'
    && runtime.executionSupport === 'manual_run'
  )) ?? null;
  const workspaceReady = Boolean(workspaceRoot.trim());
  const primaryStatus = !workspaceReady
    ? '先设置 Workspace root'
    : readyRuntime
      ? `当前可执行：${readyRuntime.label}`
      : '等待官方 CLI 登录或安装';
  const runnable = Boolean(workspaceReady && readyRuntime);
  const nextAction = !readyRuntime
    ? {
        label: '在终端登录 Codex',
        title: '先登录 Codex CLI',
        detail: '打开终端运行 codex login，登录完成后回到这里点重新检测。',
      }
    : !workspaceReady
      ? {
          label: '保存工作目录',
          title: '选择这个任务要操作的项目目录',
          detail: '填项目根目录。Agent CLI 会从这里读取代码和上下文。',
        }
      : {
          label: '去任务里运行',
          title: 'AI Runtime 已准备好',
          detail: '打开一个任务，在右侧输入框切到 Codex，然后发送你的需求。',
        };

  return (
    <section className="agent-cli-section">
      <div className="agent-cli-head">
        <div>
          <div className="model-section-kicker">Agent CLI</div>
          <p className="model-section-copy">用官方 CLI 账号在任务里启动后台 Agent run。</p>
        </div>
        <div className={`agent-cli-primary-state${readyRuntime && workspaceReady ? ' ready' : ''}`}>
          {primaryStatus}
        </div>
      </div>

      <div className={`agent-cli-action ${runnable ? 'ready' : ''}`}>
        <div className="agent-cli-action-icon">{runnable ? '✓' : readyRuntime ? '2' : '1'}</div>
        <div className="agent-cli-action-copy">
          <strong>{nextAction.title}</strong>
          <span>{nextAction.detail}</span>
        </div>
        <div className="agent-cli-action-state">{nextAction.label}</div>
      </div>

      <div className="agent-cli-workspace">
        <div className="agent-cli-workspace-head">
          <label className="settings-label" htmlFor="agent-cli-workspace-root">项目目录</label>
          <button
            className={`btn sm primary${saveDisabled ? ' disabled' : ''}`}
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
          >
            {saveLabel}
          </button>
        </div>
        <div className="agent-cli-workspace-row">
          <input
            id="agent-cli-workspace-root"
            className="settings-input mono"
            type="text"
            value={workspaceRoot}
            placeholder="/Users/you/git/project"
            onChange={(event) => onWorkspaceRootChange(event.target.value)}
          />
        </div>
        <p className="settings-hint">第一版只读运行，不会自动改代码或提交。</p>
      </div>

      <div className="agent-cli-boundary">
        <span>账号不在这里配置。Codex 登录用 <span className="mono">codex login</span>；Claude 登录用 <span className="mono">claude auth login</span>。</span>
        <details className="agent-cli-debug">
          <summary>CLI 明细</summary>
          <div className="agent-cli-grid">
            {runtimes.length > 0 ? runtimes.map((runtime) => (
              <div key={runtime.id} className={`agent-cli-row ${runtime.installed ? 'installed' : 'missing'}`}>
                <div className="agent-cli-runtime-main">
                  <span className="agent-cli-runtime-name">{runtime.label}</span>
                  <span className="agent-cli-runtime-command mono">{runtime.command}</span>
                  {runtime.id === 'codex' && <span className="model-tag">主路径</span>}
                  {runtime.id === 'claude' && <span className="agent-cli-pill">可选</span>}
                </div>
                <div className="agent-cli-runtime-meta">
                  <span className={`agent-cli-status ${runtime.installed ? 'ok' : 'muted'}`}>
                    {runtime.installed ? authStateLabel(runtime.authState) : '未安装'}
                  </span>
                  <span>{runtime.version ?? '版本未知'}</span>
                  <span>{workloadLabel(runtime.workload)}</span>
                </div>
                {runtime.missingReason && (
                  <p className="agent-cli-runtime-note">{runtime.missingReason}</p>
                )}
                <p className="agent-cli-runtime-note">{agentCliRuntimeNextStep(runtime)}</p>
              </div>
            )) : (
              <div className="agent-cli-empty">Agent CLI 状态尚未生成。</div>
            )}
          </div>
        </details>
        <details className="agent-cli-debug">
          <summary>调试详情</summary>
          <div className="agent-cli-counts" aria-label="Agent CLI runtime counts">
            <span>{status?.detectedCount ?? 0} detected</span>
            <span>{status?.manualRunCount ?? 0} manual</span>
            <span>{status?.readyManualRunCount ?? 0} ready manual</span>
            <span>{status?.runningCount ?? 0} running</span>
          </div>
          {safety && (
            <span>
              安全：{CONFIGURATION_SAFETY_STATE_LABELS[safety.state]} · 探测：{configurationSafetyProbePolicyLabel(safety.startupProbePolicy)}
            </span>
          )}
          {capabilitySummary && <span className="mono">{capabilitySummary}</span>}
        </details>
      </div>
    </section>
  );
}

function ModelConfigurationSafety({
  open,
  onToggle,
  surfaces,
}: {
  open: boolean;
  onToggle: () => void;
  surfaces: ConfigurationSafetySurface[];
}) {
  if (surfaces.length === 0) {
    return (
      <section className="settings-section model-safety-section">
        <button className="model-collapsible-head" onClick={onToggle} type="button">
          <span>
            <span className="model-section-kicker">Safety Details</span>
            <span className="model-section-copy">内部安全报告。当前没有可显示的模型配置项。</span>
          </span>
          <span className="model-collapsible-state">{open ? '收起' : '展开'}</span>
        </button>
        <p className="settings-hint">模型安全报告尚未生成；AI Runtime 页不会主动探测外部服务或读取密钥明文。</p>
      </section>
    );
  }

  return (
    <section className="settings-section model-safety-section">
      <button className="model-collapsible-head" onClick={onToggle} type="button">
        <span>
          <span className="model-section-kicker">Safety Details</span>
          <span className="model-section-copy">默认收起。用于检查密钥暴露、探测策略和配置安全边界。</span>
        </span>
        <span className="model-collapsible-state">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
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
      )}
    </section>
  );
}

function agentCliRuntimeNextStep(runtime: NonNullable<AiConfigStatus['agentCliRuntimeStatus']>['runtimes'][number]) {
  if (!runtime.installed) {
    return runtime.id === 'claude'
      ? '可选：安装 Claude Code 并在终端登录；当前 Codex CLI 是第一版主路径。'
      : '安装 Codex CLI 后在终端运行 codex login，再点击重新检测。';
  }
  if (runtime.authState === 'ready') return '已通过官方 CLI 登录；Taskplane 不接管或保存账号。';
  if (runtime.authState === 'needs_login') {
    return runtime.id === 'claude'
      ? '在终端运行 claude auth login 后点击重新检测。'
      : '在终端运行 codex login 后点击重新检测。';
  }
  if (runtime.authState === 'error') return '官方 CLI 登录状态异常；请在终端检查后重新检测。';
  return '如果已完成官方 CLI 登录，点击重新检测同步状态。';
}

function authStateLabel(state: 'unknown' | 'ready' | 'needs_login' | 'error') {
  if (state === 'ready') return '可运行';
  if (state === 'needs_login') return '需登录';
  if (state === 'error') return '异常';
  return '已检测';
}

function workloadLabel(workload: 'idle' | 'running' | 'blocked') {
  if (workload === 'running') return '运行中';
  if (workload === 'blocked') return '受阻';
  return '空闲';
}
