import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  buildDefaultAgentCliRuntimeCapabilities,
  type AgentCliRuntimeId,
} from '@shared/agent-cli-runtime-status';
import type {
  AgentRuntimeAdapterCapabilities,
  AgentRuntimeNativeCapabilityDeclaration,
} from '@shared/agent-runtime-goal';
import type { AgentCliCapabilityMode, AiConfigStatus, AiProvider, AiRuntimeMode, FeatureFlags } from '@shared/types/settings';
import { CapabilitySafetyStrip } from '../components/CapabilitySafetyStrip';

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

const AGENT_CLI_CAPABILITY_MODE_OPTIONS: Array<{
  description: string;
  label: string;
  mode: AgentCliCapabilityMode;
}> = [
  {
    description: '尊重官方 CLI 的原生搜索、浏览、来源和文档能力；Taskplane 做上下文和记录。',
    label: '原生优先',
    mode: 'native',
  },
  {
    description: '先由 Taskplane 做 OpenAI 联网调研并落来源，再交给官方 CLI 继续判断。',
    label: '审计增强',
    mode: 'audit_enhanced',
  },
  {
    description: '只使用 Taskplane 已注入上下文，不允许实时联网或外部工具。',
    label: '受限模式',
    mode: 'restricted',
  },
];

function normalizeAgentCliCapabilityMode(mode: FeatureFlags['agentCliCapabilityMode']): AgentCliCapabilityMode {
  if (mode === 'audit_enhanced' || mode === 'restricted') return mode;
  return 'native';
}

function buildNextFeatureFlags(
  featureFlags: FeatureFlags | undefined,
  agentCliCapabilityMode: AgentCliCapabilityMode,
): FeatureFlags {
  return {
    enableScheduler: false,
    enableProviderNativeToolCalls: true,
    ...(featureFlags ?? {}),
    agentCliCapabilityMode,
  };
}

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
  const [selectedRuntimeMode, setSelectedRuntimeMode] = useState<AiRuntimeMode>('codex');
  const [agentCliCapabilityMode, setAgentCliCapabilityMode] = useState<AgentCliCapabilityMode>('native');
  const [customModelId, setCustomModelId] = useState('');
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [keys, setKeys] = useState<Partial<Record<KeyField, string>>>({});
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [showKeys, setShowKeys] = useState<Partial<Record<KeyField, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [openingLogin, setOpeningLogin] = useState(false);
  const [openingInstall, setOpeningInstall] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null);
  const [apiModelOpen, setApiModelOpen] = useState(false);
  const refreshingStatusRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (!window.api || refreshingStatusRef.current) return;
    refreshingStatusRef.current = true;
    setRefreshingStatus(true);
    try {
      const s = await window.api.getAiConfigStatus();
      setStatus(s);
      if (s.model) setSelectedModel(s.model);
      if (s.provider) setSelectedProvider(s.provider);
      setSelectedRuntimeMode(s.runtimeMode ?? 'codex');
      setAgentCliCapabilityMode(normalizeAgentCliCapabilityMode(s.featureFlags.agentCliCapabilityMode));
      setWorkspaceRoot(s.workspaceRoot ?? s.suggestedWorkspaceRoot ?? '');
    } catch {
      // Keep the last known status visible when a manual probe fails.
    } finally {
      refreshingStatusRef.current = false;
      setRefreshingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') void refreshStatus();
    }

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshStatus]);

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
        runtimeMode: selectedRuntimeMode,
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
        featureFlags: buildNextFeatureFlags(status?.featureFlags, agentCliCapabilityMode),
      });
      setStatus(next);
      setSelectedRuntimeMode(next.runtimeMode ?? selectedRuntimeMode);
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

  async function openAgentCliLogin(runtimeId: 'codex' | 'claude' = 'codex') {
    if (!window.api?.openAgentCliLogin || openingLogin) return;
    setOpeningLogin(true);
    try {
      await window.api.openAgentCliLogin({ runtimeId });
    } finally {
      setOpeningLogin(false);
    }
  }

  async function openAgentCliInstall(runtimeId: 'codex' | 'claude' = 'codex', options: { repair?: boolean } = {}) {
    if (!window.api?.openAgentCliInstall || openingInstall) return;
    setOpeningInstall(true);
    try {
      await window.api.openAgentCliInstall({ repair: options.repair, runtimeId });
    } finally {
      setOpeningInstall(false);
    }
  }

  async function saveRuntimeMode(runtimeMode: AiRuntimeMode) {
    if (!window.api || saving) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const next = await window.api.setAiConfig({
        provider: selectedProvider,
        model: selectedProvider === 'openai-compatible'
          ? customModelId || selectedModel
          : selectedModel,
        runtimeMode,
        providerKeys: {},
        workspaceRoot,
        featureFlags: buildNextFeatureFlags(status?.featureFlags, agentCliCapabilityMode),
      });
      setStatus(next);
      setSelectedRuntimeMode(next.runtimeMode ?? runtimeMode);
      setSaveResult('ok');
    } catch {
      setSaveResult('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 2500);
    }
  }

  const configuredProviders = new Set(status?.configuredProviders ?? []);
  const agentCliStatus = status?.agentCliRuntimeStatus ?? null;
  async function saveAgentCliCapabilityMode(mode: AgentCliCapabilityMode) {
    if (!window.api || saving) return;
    setAgentCliCapabilityMode(mode);
    setSaving(true);
    setSaveResult(null);
    try {
      const next = await window.api.setAiConfig({
        provider: selectedProvider,
        model: selectedProvider === 'openai-compatible'
          ? customModelId || selectedModel
          : selectedModel,
        runtimeMode: selectedRuntimeMode,
        providerKeys: {},
        workspaceRoot,
        featureFlags: buildNextFeatureFlags(status?.featureFlags, mode),
      });
      setStatus(next);
      setAgentCliCapabilityMode(normalizeAgentCliCapabilityMode(next.featureFlags.agentCliCapabilityMode));
      setSaveResult('ok');
    } catch {
      setAgentCliCapabilityMode(normalizeAgentCliCapabilityMode(status?.featureFlags.agentCliCapabilityMode));
      setSaveResult('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 2500);
    }
  }

  const agentCliCapability = status?.capabilityRegistry
    ?.find((entry) => entry.id === 'agent_cli.runtimes') ?? null;
  const agentCliSafety = status?.configurationSafetyReport?.surfaces
    .find((surface) => surface.id === 'agent_cli.runtimes') ?? null;

  const apiConfigPanel = apiModelOpen ? (
    <div className="agent-cli-api-config-panel">
      <div className="agent-cli-api-config-title">模型服务配置</div>
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
    </div>
  ) : null;

  return (
    <div className="model-page">
      <div className="model-page-head">
        <div>
          <h2 className="model-page-title">AI Runtime</h2>
          <p className="model-page-subtitle">选择 Taskplane 调用 AI 的默认 Runtime。</p>
          <p className="model-page-boundary">Agent CLI 和 Agent API 是同级 AI 调用层；任务拆解、推进、验收、记忆等环节由 Taskplane harness 编排，再按所选 Runtime 调用。</p>
        </div>
      </div>

      <AgentCliRuntimeSection
        apiConfigOpen={apiModelOpen}
        apiConfigPanel={apiConfigPanel}
        workspaceRoot={workspaceRoot}
        onWorkspaceRootChange={setWorkspaceRoot}
        status={agentCliStatus}
        capabilityMode={agentCliCapabilityMode}
        runtimeMode={selectedRuntimeMode}
        apiConfigured={Boolean(status?.configured)}
        apiProviderSummary={status?.configured ? `${status.provider} / ${status.model}` : null}
        capability={agentCliCapability}
        safety={agentCliSafety}
        onToggleApiConfig={() => setApiModelOpen((value) => !value)}
        onSelectRuntimeMode={(runtimeMode) => void saveRuntimeMode(runtimeMode)}
        onSelectCapabilityMode={(mode) => void saveAgentCliCapabilityMode(mode)}
        suggestedWorkspaceRoot={status?.suggestedWorkspaceRoot ?? null}
        onOpenLogin={(runtimeId) => void openAgentCliLogin(runtimeId)}
        onOpenInstall={(runtimeId, options) => void openAgentCliInstall(runtimeId, options)}
        onRefresh={() => void refreshStatus()}
        refreshing={refreshingStatus}
        openingInstall={openingInstall}
        openingLogin={openingLogin}
        onSave={() => void save()}
        saveLabel={saving ? '保存中…' : saveResult === 'ok' ? '已保存' : '保存工作区'}
        saveDisabled={saving}
      />

      {/* Footer */}
      <div className="model-page-footer">
        <span className="muted" style={{ fontSize: 12 }}>第一版优先打通 Agent CLI；Agent API 作为同级 Runtime 后续补齐</span>
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
  apiConfigOpen,
  apiConfigPanel,
  apiProviderSummary,
  capabilityMode,
  capability,
  workspaceRoot,
  onWorkspaceRootChange,
  onSave,
  onOpenLogin,
  onOpenInstall,
  onRefresh,
  onSelectCapabilityMode,
  onSelectRuntimeMode,
  onToggleApiConfig,
  openingInstall,
  openingLogin,
  refreshing,
  runtimeMode,
  saveDisabled,
  saveLabel,
  safety,
  suggestedWorkspaceRoot,
  status,
  apiConfigured,
}: {
  apiConfigOpen: boolean;
  apiConfigPanel: ReactNode;
  apiProviderSummary: string | null;
  capabilityMode: AgentCliCapabilityMode;
  capability: NonNullable<AiConfigStatus['capabilityRegistry']>[number] | null;
  workspaceRoot: string;
  onWorkspaceRootChange: (value: string) => void;
  onSave: () => void;
  onOpenLogin: (runtimeId: 'codex' | 'claude') => void;
  onOpenInstall: (runtimeId: 'codex' | 'claude', options?: { repair?: boolean }) => void;
  onRefresh: () => void;
  onSelectCapabilityMode: (mode: AgentCliCapabilityMode) => void;
  onSelectRuntimeMode: (runtimeMode: AiRuntimeMode) => void;
  onToggleApiConfig: () => void;
  apiConfigured: boolean;
  openingInstall: boolean;
  openingLogin: boolean;
  refreshing: boolean;
  runtimeMode: AiRuntimeMode;
  saveDisabled: boolean;
  saveLabel: string;
  safety: NonNullable<AiConfigStatus['configurationSafetyReport']>['surfaces'][number] | null;
  suggestedWorkspaceRoot: string | null;
  status: AiConfigStatus['agentCliRuntimeStatus'] | null;
}) {
  const runtimes = status?.runtimes ?? [];
  const codexRuntime = runtimes.find((runtime) => runtime.id === 'codex') ?? null;
  const claudeRuntime = runtimes.find((runtime) => runtime.id === 'claude') ?? null;
  const readyCount = runtimes.filter((runtime) => runtime.installed && runtime.authState === 'ready').length;
  const detectedCount = status?.detectedCount ?? runtimes.filter((runtime) => runtime.installed).length;
  const catalogueCount = status?.catalogueCount ?? 2;
  const hasReadyRuntime = readyCount > 0;

  return (
    <section className="agent-cli-section">
      <div className="agent-cli-head">
        <div>
          <div className="model-section-kicker">运行方式</div>
          <p className="model-section-copy">选择 Taskplane 各 AI 阶段的默认调用层；当前优先打通 Codex / Claude CLI，Agent API 后续补齐同一套 harness 流程。</p>
        </div>
        <div className="agent-cli-head-actions">
          <div className={`agent-cli-primary-state${hasReadyRuntime ? ' ready' : ''}`}>
            {readyCount}/{catalogueCount} 已登录
          </div>
          <button
            className={`btn sm ghost${refreshing ? ' disabled' : ''}`}
            onClick={onRefresh}
            disabled={refreshing}
            title="重新检测官方 CLI 登录和本机运行状态"
            type="button"
          >
            {refreshing ? '检测中…' : '重新检测'}
          </button>
        </div>
      </div>

      <CapabilitySafetyStrip
        boundaryLabel="执行边界"
        boundaryValue="任务前检查 + 用户确认"
        capability={capability}
        emptyReason="Agent CLI 运行时状态尚未进入共享能力注册表；不会自动启动原生 CLI。"
        safety={safety}
        statusLabel="运行时状态"
        unconfiguredLabel="需登录"
      />

      <div className="agent-cli-runtime-list" aria-label="Agent CLI runtimes">
        <AgentCliRuntimeRow
          runtime={codexRuntime}
          fallback={{
            command: 'codex',
            id: 'codex',
            label: 'Codex CLI',
          }}
          openingLogin={openingLogin}
          openingInstall={openingInstall}
          onOpenLogin={onOpenLogin}
          onOpenInstall={onOpenInstall}
          onSelectRuntimeMode={onSelectRuntimeMode}
          runtimeMode={runtimeMode}
        />
        <AgentCliRuntimeRow
          runtime={claudeRuntime}
          fallback={{
            command: 'claude',
            id: 'claude',
            label: 'Claude Code',
          }}
          openingLogin={openingLogin}
          openingInstall={openingInstall}
          onOpenLogin={onOpenLogin}
          onOpenInstall={onOpenInstall}
          onSelectRuntimeMode={onSelectRuntimeMode}
          runtimeMode={runtimeMode}
        />
        <div className={`agent-cli-runtime-row api-preview${runtimeMode === 'api' ? ' selected' : ''}`}>
          <div className="agent-cli-runtime-row-name">
            <div className="agent-cli-runtime-card-title">
              <span>Agent API Runtime</span>
            </div>
            <span className="agent-cli-runtime-card-command mono">同级 AI 调用层 · 部分阶段</span>
          </div>
          <span className="agent-cli-runtime-card-status preview">
            {runtimeMode === 'api' ? '正在使用' : apiConfigured ? '可选择' : '需配置'}
          </span>
          <span className="agent-cli-runtime-row-version">{apiConfigured ? '部分可用' : '缺少 Provider'}</span>
          <span className="agent-cli-runtime-row-detail">
            {runtimeMode === 'api'
              ? '当前问答 / 拆解 / 决策草稿等阶段走 Agent API；任务执行 run 仍待完善'
              : apiConfigured
                ? '可作为当前 AI 调用层；完整任务执行 run 仍待完善'
                : '先配置 Provider 密钥后才能选择'}
          </span>
          <div className="agent-cli-runtime-row-actions">
            <button
              className={`btn sm${runtimeMode === 'api' || !apiConfigured ? ' disabled' : ''}`}
              type="button"
              onClick={() => onSelectRuntimeMode('api')}
              disabled={runtimeMode === 'api' || !apiConfigured}
            >
              {runtimeMode === 'api' ? '正在使用' : apiConfigured ? '使用此方式' : '先配置 Provider'}
            </button>
          </div>
        </div>
        <div className="agent-cli-runtime-row api-preview">
          <div className="agent-cli-runtime-row-name">
            <div className="agent-cli-runtime-card-title">
              <span>Agent API Provider 配置</span>
            </div>
            <span className="agent-cli-runtime-card-command mono">{apiConfigured ? '已填写 Provider 密钥' : '需要先配置 Provider 密钥'}</span>
          </div>
          <span className="agent-cli-runtime-card-status preview">
            配置项
          </span>
          <span className="agent-cli-runtime-row-version">{apiProviderSummary ?? '未完成'}</span>
          <span className="agent-cli-runtime-row-detail">供 Agent API Runtime 调用；不是 Agent CLI 的隐式兜底</span>
          <div className="agent-cli-runtime-row-actions">
            <button
              className={`btn sm${apiConfigured ? ' ghost' : ' primary'}`}
              onClick={onToggleApiConfig}
              type="button"
            >
              {apiConfigOpen ? '收起配置' : apiConfigured ? '修改配置' : '配置 Provider'}
            </button>
          </div>
        </div>
        {apiConfigPanel}
      </div>

      <div className="agent-cli-capability-mode">
        <div>
          <div className="model-section-kicker">Agent CLI 能力模式</div>
          <p className="model-section-copy">默认尊重 Codex / Claude 官方 CLI 的原生能力；Taskplane 只负责上下文、记录和验收。</p>
        </div>
        <div className="settings-segmented" role="group" aria-label="Agent CLI capability mode">
          {AGENT_CLI_CAPABILITY_MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              className={`settings-segment${capabilityMode === option.mode ? ' active' : ''}`}
              onClick={() => onSelectCapabilityMode(option.mode)}
              title={option.description}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <details className="agent-cli-debug agent-cli-advanced">
        <summary>高级：运行目录</summary>
        <div className="agent-cli-workspace">
          <div className="agent-cli-workspace-head">
            <label className="settings-label" htmlFor="agent-cli-workspace-root">内部运行目录</label>
            <button
              className={`btn sm ghost${saveDisabled ? ' disabled' : ''}`}
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
              placeholder={suggestedWorkspaceRoot ?? '/Users/you/git/project'}
              onChange={(event) => onWorkspaceRootChange(event.target.value)}
            />
          </div>
          <p className="settings-hint">通常保持自动即可；具体文件读取会在任务上下文里决定。</p>
        </div>
        <div className="agent-cli-counts" aria-label="Agent CLI runtime counts">
          <span>{detectedCount} detected</span>
          <span>{status?.readyManualRunCount ?? 0} ready manual</span>
          <span>{status?.runningCount ?? 0} running</span>
        </div>
      </details>
    </section>
  );
}

function AgentCliRuntimeRow({
  fallback,
  onSelectRuntimeMode,
  onOpenLogin,
  onOpenInstall,
  openingInstall,
  openingLogin,
  runtime,
  runtimeMode,
}: {
  fallback: {
    command: 'codex' | 'claude';
    id: AgentCliRuntimeId;
    label: string;
  };
  onOpenLogin: (runtimeId: AgentCliRuntimeId) => void;
  onOpenInstall: (runtimeId: AgentCliRuntimeId, options?: { repair?: boolean }) => void;
  onSelectRuntimeMode: (runtimeMode: AiRuntimeMode) => void;
  openingInstall: boolean;
  openingLogin: boolean;
  runtime: NonNullable<AiConfigStatus['agentCliRuntimeStatus']>['runtimes'][number] | null;
  runtimeMode: AiRuntimeMode;
}) {
  const installed = runtime?.installed ?? false;
  const ready = installed && runtime?.authState === 'ready';
  const brokenInstall = installed && runtime?.authState === 'error';
  const needsLogin = installed && runtime?.authState === 'needs_login';
  const rowState = ready ? 'ready' : brokenInstall ? 'error' : needsLogin ? 'needs-login' : installed ? 'needs-login' : 'missing';
  const statusLabel = ready ? '已登录' : brokenInstall ? '安装异常' : installed ? '需登录' : '未安装';
  const capabilities = runtime?.capabilities ?? buildDefaultAgentCliRuntimeCapabilities(fallback.id, fallback.label, runtime?.version ?? null);
  const nativeGoalLabel = nativeGoalCapabilityLabel(capabilities.nativeGoalMode?.availability);
  const capabilityChips = installed ? runtimeCapabilityChips(capabilities) : [];
  const detail = ready ? `${workloadLabel(runtime.workload)} · ${nativeGoalLabel}` : brokenInstall ? '需重新安装' : installed ? '等待登录' : '未检测到';

  return (
    <div className={`agent-cli-runtime-row ${rowState}`}>
      <div className="agent-cli-runtime-row-name">
        <div className="agent-cli-runtime-card-title">
          <span>{fallback.label}</span>
        </div>
        <span className="agent-cli-runtime-card-command mono">{runtime?.command ?? fallback.command}</span>
      </div>
      <span className={`agent-cli-runtime-card-status ${rowState}`}>
        {statusLabel}
      </span>
      <span className="agent-cli-runtime-row-version">
        {runtime?.version ?? '版本未知'}
        {installed && !brokenInstall && (
          <button
            className="agent-cli-inline-action"
            type="button"
            onClick={() => onOpenInstall(fallback.id)}
            disabled={openingInstall}
          >
            更新
          </button>
        )}
      </span>
      <span className="agent-cli-runtime-row-detail">
        <span>{detail}</span>
        {capabilityChips.length > 0 && (
          <span className="agent-cli-runtime-capability-chips" aria-label={`${fallback.label} capability declarations`}>
            {capabilityChips.map((chip) => (
              <span key={chip.label} className={`agent-cli-runtime-capability-chip ${chip.tone}`} title={chip.reason}>
                {chip.label}
              </span>
            ))}
          </span>
        )}
      </span>
      {brokenInstall ? (
        <button
          className={`btn sm${openingInstall ? ' disabled' : ''}`}
          type="button"
          onClick={() => onOpenInstall(fallback.id, { repair: true })}
          disabled={openingInstall}
        >
          {openingInstall ? '正在打开…' : fallback.id === 'claude' ? '重新安装 Claude' : '重新安装 Codex'}
        </button>
      ) : !ready && installed ? (
        <button
          className={`btn sm primary${openingLogin ? ' disabled' : ''}`}
          type="button"
          onClick={() => onOpenLogin(fallback.id)}
          disabled={openingLogin}
        >
          {openingLogin ? '正在打开…' : fallback.id === 'claude' ? '登录 Claude' : '登录 Codex'}
        </button>
      ) : !installed ? (
        <button
          className={`btn sm${openingInstall ? ' disabled' : ''}`}
          type="button"
          onClick={() => onOpenInstall(fallback.id)}
          disabled={openingInstall}
        >
          {openingInstall ? '正在打开…' : fallback.id === 'claude' ? '安装 Claude' : '安装 Codex'}
        </button>
      ) : (
        <button
          className={`btn sm${runtimeMode === fallback.id ? ' disabled' : ''}`}
          type="button"
          onClick={() => onSelectRuntimeMode(fallback.id)}
          disabled={runtimeMode === fallback.id}
        >
          {runtimeMode === fallback.id ? '正在使用' : '使用此方式'}
        </button>
      )}
    </div>
  );
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

function runtimeCapabilityChips(capabilities: AgentRuntimeAdapterCapabilities): Array<{
  label: string;
  reason: string;
  tone: 'ready' | 'gated' | 'blocked';
}> {
  const native = capabilities.nativeCapabilities;
  return [
    nativeCapabilityChip(native?.structuredProgressEvents, '事件流', 'ready'),
    nativeCapabilityChip(native?.workspaceRead, '只读工作区', 'ready'),
    nativeCapabilityChip(native?.webSearch, nativeSearchCapabilityChipLabel(native?.webSearch), 'gated'),
    nativeCapabilityChip(native?.hooks, nativeAvailabilityChipLabel(native?.hooks, 'Hooks'), 'gated'),
    nativeCapabilityChip(native?.subagents, nativeAvailabilityChipLabel(native?.subagents, 'Subagents'), 'gated'),
    capabilities.supportsNativeGoalMode
      ? {
          label: 'Goal',
          reason: capabilities.nativeGoalMode.reason,
          tone: 'ready' as const,
        }
      : nativeCapabilityChip({
          availability: capabilities.nativeGoalMode.availability === 'unsupported' ? 'unsupported' : 'unverified',
          label: 'Goal',
          reason: capabilities.nativeGoalMode.reason,
        }, 'Goal', 'gated'),
    nativeCapabilityChip(native?.memory, '记忆由产品写入', 'gated'),
    nativeCapabilityChip(native?.compact, '上下文压缩', 'gated'),
    nativeCapabilityChip(native?.clear, '上下文清理', 'gated'),
    nativeCapabilityChip(native?.workspaceWrite, '写入需提案', 'blocked'),
  ].filter((chip): chip is { label: string; reason: string; tone: 'ready' | 'gated' | 'blocked' } => chip !== null);
}

function nativeSearchCapabilityChipLabel(
  capability: AgentRuntimeNativeCapabilityDeclaration | undefined,
): string {
  if (capability?.availability === 'product_controlled') return '搜索由产品控制';
  return nativeAvailabilityChipLabel(capability, '原生搜索');
}

function nativeAvailabilityChipLabel(
  capability: AgentRuntimeNativeCapabilityDeclaration | undefined,
  baseLabel: string,
): string {
  if (!capability) return `${baseLabel}未知`;
  if (capability.availability === 'available') return `${baseLabel}可用`;
  if (capability.availability === 'runtime_dependent') return `${baseLabel}随运行时`;
  if (capability.availability === 'unverified') return `${baseLabel}待验证`;
  if (capability.availability === 'unsupported') return `${baseLabel}不可用`;
  if (capability.availability === 'product_controlled') return `${baseLabel}由产品控制`;
  return `${baseLabel}未知`;
}

function nativeCapabilityChip(
  capability: AgentRuntimeNativeCapabilityDeclaration | undefined,
  label: string,
  fallbackTone: 'ready' | 'gated' | 'blocked',
): { label: string; reason: string; tone: 'ready' | 'gated' | 'blocked' } | null {
  if (!capability) return null;
  const tone = capability.availability === 'available'
    ? 'ready'
    : capability.availability === 'unsupported'
      ? 'blocked'
      : fallbackTone;
  return {
    label,
    reason: capability.reason,
    tone,
  };
}

function nativeGoalCapabilityLabel(availability?: 'available' | 'requires_update' | 'unknown' | 'unsupported') {
  if (availability === 'available') return 'Native Goal 已识别';
  if (availability === 'requires_update') return 'Native Goal 需更新';
  if (availability === 'unknown') return 'Native Goal 待确认';
  return 'Native Goal 未验证';
}
