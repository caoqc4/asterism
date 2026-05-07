import { useState } from 'react';

interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: 'stdio' | 'sse' | 'http';
  status: 'connected' | 'disconnected' | 'error';
  toolCount?: number;
  error?: string;
}

const TRANSPORT_LABELS: Record<McpServer['transport'], string> = {
  stdio: 'stdio',
  sse: 'SSE',
  http: 'HTTP',
};

export function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function addServer(s: McpServer) {
    setServers((prev) => [...prev, s]);
    setShowForm(false);
  }

  function removeServer(id: string) {
    setServers((prev) => prev.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="mcp-page">
      <div className="mcp-head">
        <div>
          <h2 className="mcp-title">MCP 服务器</h2>
          <p className="mcp-subtitle">
            接入 Model Context Protocol 工具服务端，每个服务器可暴露多个工具供 AI 调用
          </p>
          <p className="mcp-boundary">
            连接服务器只会让工具进入 AI 能力库；具体调用仍由任务上下文、用户指令和执行确认决定。
          </p>
        </div>
        <button className="btn sm primary" onClick={() => setShowForm(true)}>
          + 添加服务器
        </button>
      </div>

      {showForm && (
        <AddServerForm onAdd={addServer} onCancel={() => setShowForm(false)} />
      )}

      <div className="mcp-list">
        {servers.map((s) => (
          <ServerCard
            key={s.id}
            server={s}
            expanded={expandedId === s.id}
            onExpand={() => toggle(s.id)}
            onRemove={() => removeServer(s.id)}
          />
        ))}
        {servers.length === 0 && !showForm && (
          <div className="mcp-empty">
            <p>还没有连接任何 MCP 服务器</p>
            <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              MCP（Model Context Protocol）是 Anthropic 推出的开放工具协议，
              兼容的服务端可将工具注册到 AI 能力库
            </p>
          </div>
        )}
      </div>

      {servers.length > 0 && (
        <div className="mcp-hint">
          <span className="mcp-hint-icon">ℹ</span>
          服务器上线后，其暴露的工具可出现在 AI 可用工具列表中，无需手动配置每个工具
        </div>
      )}
    </div>
  );
}

/* ─── Server card ─── */

function ServerCard({ server: s, expanded, onExpand, onRemove }: {
  server: McpServer; expanded: boolean; onExpand: () => void; onRemove: () => void;
}) {
  return (
    <div className={`mcp-card${expanded ? ' expanded' : ''}`}>
      <div className="mcp-card-main" onClick={onExpand}>
        <div className="mcp-card-status-dot">
          <span className={`dot ${s.status === 'connected' ? 'running' : s.status === 'error' ? 'risk' : ''}`} />
        </div>
        <div className="mcp-card-info">
          <div className="mcp-card-name">
            {s.name}
            <span className="mcp-transport-tag">{TRANSPORT_LABELS[s.transport]}</span>
          </div>
          <div className="mcp-card-url">{s.url}</div>
        </div>
        <div className="mcp-card-right">
          {s.status === 'connected' && s.toolCount != null && (
            <span className="mcp-tool-count">{s.toolCount} 个工具</span>
          )}
          {s.status === 'error' && (
            <span className="mcp-error-badge">连接失败</span>
          )}
          {s.status === 'disconnected' && (
            <span className="mcp-disconnected-badge">未连接</span>
          )}
        </div>
        <span className={`skill-expand-arrow${expanded ? ' open' : ''}`}>›</span>
      </div>

      {expanded && (
        <div className="mcp-card-body">
          <div className="skill-config-row">
            <label className="skill-config-label">URL</label>
            <div className="settings-input mono" style={{ padding: '7px 10px', fontSize: 12, color: 'var(--ink-2)' }}>
              {s.url}
            </div>
          </div>
          {s.error && (
            <div className="mcp-error-detail">{s.error}</div>
          )}
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

/* ─── Add server form ─── */

function AddServerForm({ onAdd, onCancel }: { onAdd: (s: McpServer) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [transport, setTransport] = useState<McpServer['transport']>('sse');

  function submit() {
    if (!name.trim() || !url.trim()) return;
    onAdd({
      id: `mcp_${Date.now()}`,
      name: name.trim(),
      url: url.trim(),
      transport,
      status: 'disconnected',
    });
  }

  return (
    <div className="skill-custom-form" style={{ marginBottom: 20 }}>
      <div className="skill-config-row">
        <label className="skill-config-label">服务器名称 *</label>
        <input className="settings-input" value={name} placeholder="My MCP Server" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="skill-config-row">
        <label className="skill-config-label">连接地址 *</label>
        <input
          className="settings-input mono"
          value={url}
          placeholder="http://localhost:3000/mcp"
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="skill-config-row">
        <label className="skill-config-label">传输协议</label>
        <div className="mcp-transport-pills">
          {(['sse', 'http', 'stdio'] as const).map((t) => (
            <button
              key={t}
              className={`task-edit-risk-btn${transport === t ? ' active' : ''}`}
              onClick={() => setTransport(t)}
            >
              {TRANSPORT_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="skill-installed-actions">
        <button className="btn sm primary" disabled={!name.trim() || !url.trim()} onClick={submit}>
          添加
        </button>
        <button className="btn sm ghost" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
