import { useState } from 'react';

type ModelId = 'claude-sonnet-4-6' | 'claude-opus-4-7' | 'claude-haiku-4-5';

interface ModelOption {
  id: ModelId;
  name: string;
  desc: string;
  speed: 'fast' | 'balanced' | 'powerful';
}

const MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', desc: '日常任务推进的最佳平衡', speed: 'balanced' },
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', desc: '复杂分析与深度规划', speed: 'powerful' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', desc: '快速响应、轻量操作', speed: 'fast' },
];

const SPEED_LABELS = { fast: '极快', balanced: '均衡', powerful: '最强' };
const SPEED_COLORS = { fast: 'var(--green)', balanced: 'var(--blue)', powerful: 'var(--violet)' };

export function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState<ModelId>('claude-sonnet-4-6');
  const [selfCheck, setSelfCheck] = useState(true);
  const [selfLearn, setSelfLearn] = useState(true);
  const [ctxCompress, setCtxCompress] = useState(45);
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="settings-page">
      <div className="settings-head">
        <h2 className="settings-title">Settings</h2>
      </div>

      {/* API */}
      <section className="settings-section">
        <div className="settings-section-title">Anthropic API</div>

        <div className="settings-field">
          <label className="settings-label">API Key</label>
          <div className="settings-api-row">
            <input
              className="settings-input"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              placeholder="sk-ant-..."
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button className="btn sm ghost" onClick={() => setShowKey((v) => !v)}>
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
          <p className="settings-hint">在 console.anthropic.com 获取 API Key。密钥仅存储在本地。</p>
        </div>
      </section>

      {/* Model */}
      <section className="settings-section">
        <div className="settings-section-title">模型选择</div>
        <p className="settings-section-desc">选择执行任务时使用的默认模型。工作台内可按任务单独切换。</p>

        <div className="model-options">
          {MODELS.map((m) => (
            <button
              key={m.id}
              className={`model-option${model === m.id ? ' selected' : ''}`}
              onClick={() => setModel(m.id)}
            >
              <div className="model-option-head">
                <span className="model-name">{m.name}</span>
                <span className="model-speed" style={{ color: SPEED_COLORS[m.speed] }}>
                  {SPEED_LABELS[m.speed]}
                </span>
              </div>
              <p className="model-desc">{m.desc}</p>
              {model === m.id && <span className="model-check">✓</span>}
            </button>
          ))}
        </div>
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
            type="range"
            min={30}
            max={70}
            step={5}
            value={ctxCompress}
            onChange={(e) => setCtxCompress(Number(e.target.value))}
            className="settings-range"
          />
          <p className="settings-hint">会话窗口使用率达到此阈值时触发压缩。推荐 40–50%。</p>
        </div>
      </section>

      {/* Save */}
      <div className="settings-footer">
        <button className={`btn primary${saved ? ' saved' : ''}`} onClick={save}>
          {saved ? '已保存 ✓' : '保存设置'}
        </button>
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
