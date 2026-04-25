import type { AiConfigInput, AiConfigStatus } from '@shared/types/settings';

type SettingsPageProps = {
  aiStatus: AiConfigStatus | null;
  configForm: AiConfigInput;
  onChange: (next: AiConfigInput) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
};

function formatAiConfigState(aiStatus: AiConfigStatus | null): string {
  if (!aiStatus) {
    return 'AI config 尚未初始化';
  }

  if (aiStatus.configured) {
    return `已配置 ${aiStatus.provider} / ${aiStatus.model}，更新时间 ${aiStatus.updatedAt}`;
  }

  if (aiStatus.provider && aiStatus.model) {
    return `已选择 ${aiStatus.provider} / ${aiStatus.model}，但 AI config 未就绪`;
  }

  return '尚未配置';
}

export function SettingsPage({ aiStatus, configForm, onChange, onSubmit }: SettingsPageProps) {
  return (
    <section className="page-grid">
      <article className="panel page-hero">
        <p className="eyebrow">Settings</p>
        <h1>AI Provider 与本地密钥存储</h1>
        <p className="lede">
          非敏感配置写入本地 config.json，真正的 API Key 只在 Main 进程中写入系统 Keychain。
        </p>
      </article>

      <article className="panel">
        <h2>当前状态</h2>
        <p className="meta">{formatAiConfigState(aiStatus)}</p>
        <p className="meta">
          {aiStatus?.apiKeySource === 'env'
            ? 'API Key 来自环境变量'
            : aiStatus?.apiKeyStored
            ? 'API Key 已存入系统 Keychain'
            : 'API Key 尚未存入系统 Keychain'}
        </p>
        <p className="meta">Base URL：{aiStatus?.baseUrl ?? '默认官方端点'}</p>
        <p className="meta">Workspace Root：{aiStatus?.workspaceRoot ?? '默认当前进程目录'}</p>
        <p className="meta">配置文件路径：{aiStatus?.configPath ?? '尚未初始化'}</p>
        <p className="meta">
          Scheduler 开关：{aiStatus?.featureFlags.enableScheduler ? '启用' : '未启用'}
        </p>
        <p className="meta">
          Sandbox Coding Agent：{aiStatus?.featureFlags.enableSandboxCodingAgent ? '启用' : '未启用'}
        </p>
      </article>

      <article className="panel">
        <h2>保存配置</h2>
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Provider
            <select
              value={configForm.provider}
              onChange={(event) =>
                onChange({
                  ...configForm,
                  provider: event.target.value as AiConfigInput['provider'],
                })
              }
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="fal-openrouter">fal OpenRouter</option>
              <option value="replicate">Replicate</option>
            </select>
          </label>
          <label>
            Model
            <input
              value={configForm.model}
              onChange={(event) => onChange({ ...configForm, model: event.target.value })}
            />
          </label>
          <label>
            Base URL
            <input
              placeholder={
                configForm.provider === 'fal-openrouter'
                  ? 'https://fal.run/openrouter/router/openai/v1'
                  : configForm.provider === 'replicate'
                    ? 'https://api.replicate.com/v1'
                  : 'https://api.example.com/v1'
              }
              value={configForm.baseUrl ?? ''}
              onChange={(event) => onChange({ ...configForm, baseUrl: event.target.value })}
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={configForm.apiKey}
              onChange={(event) => onChange({ ...configForm, apiKey: event.target.value })}
            />
          </label>
          <label>
            Workspace Root
            <input
              placeholder="/absolute/path/to/workspace"
              value={configForm.workspaceRoot ?? ''}
              onChange={(event) => onChange({ ...configForm, workspaceRoot: event.target.value })}
            />
          </label>
          <label className="checkbox-row">
            <input
              checked={configForm.featureFlags.enableScheduler}
              onChange={(event) =>
                onChange({
                  ...configForm,
                  featureFlags: {
                    ...configForm.featureFlags,
                    enableScheduler: event.target.checked,
                  },
                })
              }
              type="checkbox"
            />
            <span>启用本地 scheduler</span>
          </label>
          <button type="submit">保存到 Main / Keychain</button>
        </form>
        <p className="meta">
          提示：如果 API Key 留空，将保留当前 Keychain 中已有的密钥，只更新 config.json 中的非敏感配置。
        </p>
      </article>
    </section>
  );
}
