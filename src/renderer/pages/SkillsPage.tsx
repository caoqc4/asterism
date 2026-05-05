import { useState, useRef } from 'react';

/* ─── Types ─── */

type SkillSource = 'builtin' | 'local' | 'http';

interface Skill {
  id: string;
  source: SkillSource;
  name: string;
  invokeId: string;
  desc: string;
  enabled: boolean;
  status: 'ready' | 'needs_config';
  config: Record<string, string>;
  configSchema?: ConfigField[];
}

interface ConfigField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}

/* ─── Built-in skills catalogue ─── */

const BUILTIN_CATALOGUE: Omit<Skill, 'enabled' | 'status' | 'config'>[] = [
  {
    id: 'web_search',
    source: 'builtin',
    name: 'Web Search',
    invokeId: 'web_search',
    desc: '实时搜索互联网，获取最新信息和资料',
    configSchema: [],
  },
  {
    id: 'code_runner',
    source: 'builtin',
    name: 'Code Runner',
    invokeId: 'code_runner',
    desc: '在沙盒环境中执行 Python / Node.js 代码',
    configSchema: [],
  },
  {
    id: 'browser',
    source: 'builtin',
    name: 'Browser',
    invokeId: 'browser',
    desc: '控制浏览器访问网页、截图、抓取内容',
    configSchema: [],
  },
  {
    id: 'file_read',
    source: 'builtin',
    name: 'File Read',
    invokeId: 'file_read',
    desc: '读取工作区文件内容，辅助 AI 理解上下文',
    configSchema: [],
  },
];

/* ─── Helpers ─── */

function folderToInvokeId(name: string) {
  return name.toLowerCase().replace(/[-\s]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function folderToDisplayName(name: string) {
  return name.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function parseSkillFolders(files: FileList): string[] {
  const dirs = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    const parts = files[i].webkitRelativePath.split('/');
    if (parts.length >= 2 && parts[1]) dirs.add(parts[1]);
  }
  return Array.from(dirs).sort();
}

/* ─── Page ─── */

export function SkillsPage() {
  const [builtins, setBuiltins] = useState<Skill[]>(
    BUILTIN_CATALOGUE.map((c) => ({ ...c, enabled: c.id === 'web_search', status: 'ready', config: {} }))
  );
  const [localSkills, setLocalSkills] = useState<Skill[]>([]);
  const [httpSkills, setHttpSkills] = useState<Skill[]>([]);
  const [localDirLabel, setLocalDirLabel] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showHttpForm, setShowHttpForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'builtin' | 'local' | 'http'>('builtin');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allEnabled = [...builtins, ...localSkills, ...httpSkills].filter((s) => s.enabled);

  function toggleBuiltin(id: string) {
    setBuiltins((prev) => prev.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }

  function toggleLocal(id: string) {
    setLocalSkills((prev) => prev.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }

  function toggleHttp(id: string) {
    setHttpSkills((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      const ready = s.status === 'ready';
      return { ...s, enabled: ready ? !s.enabled : false };
    }));
  }

  function setHttpConfig(skillId: string, key: string, value: string) {
    setHttpSkills((prev) => prev.map((s) => {
      if (s.id !== skillId) return s;
      const next = { ...s.config, [key]: value };
      const allFilled = (s.configSchema ?? []).every((f) => next[f.key]?.trim());
      return { ...s, config: next, status: allFilled ? 'ready' : 'needs_config' };
    }));
  }

  function removeLocal(id: string) {
    setLocalSkills((prev) => prev.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function removeHttp(id: string) {
    setHttpSkills((prev) => prev.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function handleDirectorySelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const root = files[0].webkitRelativePath.split('/')[0];
    setLocalDirLabel(root);
    const existingIds = new Set(localSkills.map((s) => s.id));
    const discovered = parseSkillFolders(files)
      .filter((name) => !existingIds.has(name))
      .map((name): Skill => ({
        id: name,
        source: 'local',
        name: folderToDisplayName(name),
        invokeId: folderToInvokeId(name),
        desc: '',
        enabled: false,
        status: 'ready',
        config: {},
      }));
    setLocalSkills((prev) => [...prev, ...discovered]);
    e.target.value = '';
  }

  function addHttpSkill(skill: Skill) {
    setHttpSkills((prev) => [...prev, skill]);
    setShowHttpForm(false);
    setExpandedId(skill.id);
  }

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="skills-page">
      <div className="skills-head-row">
        <div>
          <h2 className="skills-title">Skills</h2>
          <p className="skills-subtitle">AI 执行任务时可调用的工具模块</p>
        </div>
        {allEnabled.length > 0 && (
          <span className="skills-enabled-summary">
            {allEnabled.length} 个技能已启用
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="skills-tabs">
        <button className={`skills-tab${activeTab === 'builtin' ? ' active' : ''}`} onClick={() => setActiveTab('builtin')}>
          系统内置
          {builtins.filter((s) => s.enabled).length > 0 && (
            <span className="skills-tab-dot" />
          )}
        </button>
        <button className={`skills-tab${activeTab === 'local' ? ' active' : ''}`} onClick={() => setActiveTab('local')}>
          本地目录
          {localSkills.filter((s) => s.enabled).length > 0 && (
            <span className="skills-tab-dot" />
          )}
        </button>
        <button className={`skills-tab${activeTab === 'http' ? ' active' : ''}`} onClick={() => setActiveTab('http')}>
          自定义 HTTP
          {httpSkills.filter((s) => s.enabled).length > 0 && (
            <span className="skills-tab-dot" />
          )}
        </button>
      </div>

      {/* ── Built-in tab ── */}
      {activeTab === 'builtin' && (
        <div className="skills-panel">
          <p className="skills-panel-hint">
            平台预置工具，开箱即用，按需开启
          </p>
          <div className="skills-list">
            {builtins.map((s) => (
              <BuiltinRow
                key={s.id}
                skill={s}
                expanded={expandedId === s.id}
                onToggle={() => toggleBuiltin(s.id)}
                onExpand={() => toggle(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Local tab ── */}
      {activeTab === 'local' && (
        <div className="skills-panel">
          <div className="skills-dir-bar">
            <span className="skills-dir-icon">📁</span>
            <span className="skills-dir-label">
              {localDirLabel || '未选择技能目录'}
            </span>
            <button className="btn sm ghost" onClick={() => fileInputRef.current?.click()}>
              {localDirLabel ? '重新扫描' : '选择目录…'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              /* @ts-expect-error webkitdirectory is non-standard */
              webkitdirectory=""
              onChange={handleDirectorySelect}
            />
          </div>

          <div className="skills-list">
            {localSkills.map((s) => (
              <LocalRow
                key={s.id}
                skill={s}
                expanded={expandedId === s.id}
                onToggle={() => toggleLocal(s.id)}
                onExpand={() => toggle(s.id)}
                onSetDesc={(d) =>
                  setLocalSkills((prev) =>
                    prev.map((x) => (x.id === s.id ? { ...x, desc: d } : x))
                  )
                }
                onRemove={() => removeLocal(s.id)}
              />
            ))}
            {localSkills.length === 0 && (
              <div className="skills-empty">
                <p>选择本地技能目录后，子文件夹会自动识别为可调用的技能模块</p>
                <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                  文件夹名称会自动转为调用标识符，如 xhs-ana → #xhs_ana
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HTTP tab ── */}
      {activeTab === 'http' && (
        <div className="skills-panel">
          <div className="skills-panel-actions">
            <p className="skills-panel-hint" style={{ margin: 0 }}>
              将任意 HTTP API 包装成 AI 可调用的工具
            </p>
            <button className="btn sm primary" onClick={() => setShowHttpForm(true)}>
              + 新建工具
            </button>
          </div>

          {showHttpForm && (
            <HttpSkillForm
              onAdd={addHttpSkill}
              onCancel={() => setShowHttpForm(false)}
            />
          )}

          <div className="skills-list">
            {httpSkills.map((s) => (
              <HttpRow
                key={s.id}
                skill={s}
                expanded={expandedId === s.id}
                onToggle={() => toggleHttp(s.id)}
                onExpand={() => toggle(s.id)}
                onSetConfig={(k, v) => setHttpConfig(s.id, k, v)}
                onRemove={() => removeHttp(s.id)}
              />
            ))}
            {httpSkills.length === 0 && !showHttpForm && (
              <div className="skills-empty">
                还没有自定义 HTTP 工具。点击「新建工具」创建。
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Built-in row ─── */

function BuiltinRow({ skill, expanded, onToggle, onExpand }: {
  skill: Skill; expanded: boolean; onToggle: () => void; onExpand: () => void;
}) {
  return (
    <div className={`skill-row${skill.enabled ? ' skill-row-on' : ''}${expanded ? ' skill-row-expanded' : ''}`}>
      <div className="skill-row-main" onClick={onExpand}>
        <div className="skill-row-info">
          <div className="skill-row-name">
            {skill.name}
            <span className="skill-invoke-id">#{skill.invokeId}</span>
          </div>
          <div className="skill-row-desc">{skill.desc}</div>
        </div>
        <div className="skill-row-right" onClick={(e) => e.stopPropagation()}>
          <button
            className={`toggle${skill.enabled ? ' on' : ''}`}
            role="switch"
            aria-checked={skill.enabled}
            onClick={onToggle}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Local skill row ─── */

function LocalRow({ skill, expanded, onToggle, onExpand, onSetDesc, onRemove }: {
  skill: Skill; expanded: boolean;
  onToggle: () => void; onExpand: () => void;
  onSetDesc: (d: string) => void; onRemove: () => void;
}) {
  return (
    <div className={`skill-row${skill.enabled ? ' skill-row-on' : ''}${expanded ? ' skill-row-expanded' : ''}`}>
      <div className="skill-row-main" onClick={onExpand}>
        <span className="skill-row-folder-icon">📁</span>
        <div className="skill-row-info">
          <div className="skill-row-name">
            {skill.name}
            <span className="skill-invoke-id">#{skill.invokeId}</span>
          </div>
          {skill.desc && !expanded && (
            <div className="skill-row-desc">{skill.desc}</div>
          )}
        </div>
        <div className="skill-row-right" onClick={(e) => e.stopPropagation()}>
          <button
            className={`toggle${skill.enabled ? ' on' : ''}`}
            role="switch"
            aria-checked={skill.enabled}
            onClick={onToggle}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
        <span className={`skill-expand-arrow${expanded ? ' open' : ''}`}>›</span>
      </div>
      {expanded && (
        <div className="skill-row-body">
          <div className="skill-config-row">
            <label className="skill-config-label">AI 调用说明</label>
            <textarea
              className="skill-desc-input"
              rows={3}
              placeholder={`何时调用 #${skill.invokeId}，以及如何使用它…`}
              value={skill.desc}
              onChange={(e) => onSetDesc(e.target.value)}
            />
            <span className="settings-hint">此说明会注入 AI 系统提示，影响调用时机</span>
          </div>
          <div className="skill-row-body-actions">
            <button className="btn sm ghost" style={{ color: 'var(--accent)' }} onClick={onRemove}>
              移除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── HTTP skill row ─── */

function HttpRow({ skill, expanded, onToggle, onExpand, onSetConfig, onRemove }: {
  skill: Skill; expanded: boolean;
  onToggle: () => void; onExpand: () => void;
  onSetConfig: (k: string, v: string) => void; onRemove: () => void;
}) {
  const [showSecret, setShowSecret] = useState(false);
  return (
    <div className={`skill-row${skill.enabled ? ' skill-row-on' : ''}${expanded ? ' skill-row-expanded' : ''}`}>
      <div className="skill-row-main" onClick={onExpand}>
        <div className="skill-row-info">
          <div className="skill-row-name">
            {skill.name}
            <span className="skill-invoke-id">#{skill.invokeId}</span>
            {skill.status === 'needs_config' && (
              <span className="skill-status-pill warn">需配置</span>
            )}
          </div>
          <div className="skill-row-desc">{skill.desc || skill.config['endpoint'] || ''}</div>
        </div>
        <div className="skill-row-right" onClick={(e) => e.stopPropagation()}>
          <button
            className={`toggle${skill.enabled ? ' on' : ''}${skill.status === 'needs_config' ? ' disabled' : ''}`}
            role="switch"
            aria-checked={skill.enabled}
            disabled={skill.status === 'needs_config'}
            onClick={onToggle}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
        <span className={`skill-expand-arrow${expanded ? ' open' : ''}`}>›</span>
      </div>
      {expanded && (
        <div className="skill-row-body">
          {(skill.configSchema ?? []).map((field) => (
            <div key={field.key} className="skill-config-row">
              <label className="skill-config-label">{field.label}</label>
              <div className="settings-api-row">
                <input
                  className="settings-input"
                  type={field.secret && !showSecret ? 'password' : 'text'}
                  value={skill.config[field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => onSetConfig(field.key, e.target.value)}
                />
                {field.secret && (
                  <button className="btn sm ghost" onClick={() => setShowSecret((v) => !v)}>
                    {showSecret ? '隐藏' : '显示'}
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="skill-row-body-actions">
            <button className="btn sm ghost" style={{ color: 'var(--accent)' }} onClick={onRemove}>
              移除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── HTTP skill form ─── */

function HttpSkillForm({ onAdd, onCancel }: { onAdd: (s: Skill) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [invokeId, setInvokeId] = useState('');
  const [desc, setDesc] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [authHeader, setAuthHeader] = useState('');

  const derivedId = invokeId || name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  function submit() {
    if (!name.trim() || !derivedId) return;
    onAdd({
      id: `http_${Date.now()}`,
      source: 'http',
      name: name.trim(),
      invokeId: derivedId,
      desc: desc.trim(),
      enabled: false,
      status: endpoint.trim() ? 'ready' : 'needs_config',
      config: { endpoint: endpoint.trim(), auth: authHeader.trim() },
      configSchema: [
        { key: 'endpoint', label: 'Endpoint URL', placeholder: 'https://api.example.com/invoke' },
        { key: 'auth', label: 'Authorization Header', placeholder: 'Bearer …', secret: true },
      ],
    });
  }

  return (
    <div className="skill-custom-form">
      <div className="skill-config-row">
        <label className="skill-config-label">名称 *</label>
        <input className="settings-input" value={name} placeholder="My Tool" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="skill-config-row">
        <label className="skill-config-label">调用标识符</label>
        <input
          className="settings-input mono"
          value={invokeId}
          placeholder={derivedId || 'my_tool'}
          onChange={(e) => setInvokeId(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
        />
        <span className="settings-hint">AI 用此 ID 调用工具，留空则自动从名称生成</span>
      </div>
      <div className="skill-config-row">
        <label className="skill-config-label">描述</label>
        <input className="settings-input" value={desc} placeholder="告诉 AI 何时调用此工具" onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="skill-config-row">
        <label className="skill-config-label">Endpoint URL</label>
        <input className="settings-input" value={endpoint} placeholder="https://api.example.com/invoke" onChange={(e) => setEndpoint(e.target.value)} />
      </div>
      <div className="skill-config-row">
        <label className="skill-config-label">Authorization Header</label>
        <input className="settings-input" type="password" value={authHeader} placeholder="Bearer …" onChange={(e) => setAuthHeader(e.target.value)} />
      </div>
      <div className="skill-installed-actions">
        <button className="btn sm primary" disabled={!name.trim()} onClick={submit}>创建</button>
        <button className="btn sm ghost" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
