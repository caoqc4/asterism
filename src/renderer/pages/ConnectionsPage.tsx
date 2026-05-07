import { useState } from 'react';

type SourceStatus = 'connected' | 'error' | 'pending';

interface ConnectedSource {
  id: string;
  type: SourceType;
  label: string;
  account: string;
  status: SourceStatus;
  lastSync: string;
}

type SourceType = 'email' | 'calendar' | 'github' | 'notion' | 'slack' | 'linear' | 'jira';

const SOURCE_BADGES: Record<SourceType, string> = {
  email: 'EMAIL',
  calendar: 'CAL',
  github: 'GIT',
  notion: 'NOTE',
  slack: 'CHAT',
  linear: 'ISSUE',
  jira: 'TICKET',
};

const AVAILABLE_SOURCES: Array<{ type: SourceType; label: string; desc: string }> = [
  { type: 'email', label: 'Gmail / Email', desc: '授权后提取邮件里的待跟进信号' },
  { type: 'calendar', label: 'Calendar', desc: '授权后识别会议、截止时间和日程变更' },
  { type: 'github', label: 'GitHub', desc: '授权后同步 PR、Issue 和代码协作信号' },
  { type: 'notion', label: 'Notion', desc: '授权后同步页面和数据库作为任务来源' },
  { type: 'slack', label: 'Slack', desc: '授权后提取频道里的任务信号' },
  { type: 'linear', label: 'Linear', desc: '授权后同步 Issue 和项目进度' },
  { type: 'jira', label: 'Jira', desc: '授权后同步 Ticket 状态' },
];

export function ConnectionsPage() {
  const [sources, setSources] = useState<ConnectedSource[]>([]);

  function disconnectSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="connections-page">
      <div className="connections-head">
        <h2 className="connections-title">Connections</h2>
        <p className="connections-subtitle">AI 可感知的外部信号源 — 授权后只处理相关新信号</p>
      </div>

      {/* Connected sources */}
      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">已连接来源</div>
            <div className="ctx-section-desc">连接成功后，AI 只在任务上下文需要时引用相关信号</div>
          </div>
          <button className="btn sm primary" disabled title="即将支持">+ 连接来源</button>
        </div>

        <div className="ctx-list">
          {sources.map((src) => (
            <div key={src.id} className="ctx-source-row">
              <span className="ctx-source-icon">{SOURCE_BADGES[src.type]}</span>
              <div className="ctx-source-info">
                <span className="ctx-source-label">{src.label}</span>
                <span className="ctx-source-account">{src.account}</span>
              </div>
              <div className="ctx-source-status">
                {src.status === 'connected' && (
                  <span className="status-pill connected">
                    <span className="dot running" style={{ width: 5, height: 5 }} />
                    已连接
                  </span>
                )}
                {src.status === 'error' && (
                  <span className="status-pill error">
                    <span className="dot risk" style={{ width: 5, height: 5 }} />
                    {src.lastSync}
                  </span>
                )}
              </div>
              <span className="ctx-source-sync muted">
                {src.status === 'connected' ? `同步于 ${src.lastSync}` : ''}
              </span>
              <div className="ctx-source-actions">
                {src.status === 'error' && <button className="btn sm">重新授权</button>}
                <button className="btn sm ghost" onClick={() => disconnectSource(src.id)}>断开</button>
              </div>
            </div>
          ))}
          {sources.length === 0 && (
            <div className="ctx-empty">
              <p>尚未连接任何来源。</p>
              <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                连接后 AI 只会把相关新信号带入 Brief 和任务上下文，等待你确认。
              </p>
            </div>
          )}
        </div>
        <div className="connections-boundary-note">
          未授权的来源不会进入 AI 上下文；只有连接成功且产生新信号时，外部信息才会出现在 Brief 和任务上下文里。
        </div>
      </section>

      {/* Available to connect */}
      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">可连接来源</div>
            <div className="ctx-section-desc">即将支持</div>
          </div>
        </div>
        <div className="conn-available-grid">
          {AVAILABLE_SOURCES.map((s) => (
            <div key={s.type} className="conn-available-card">
              <span className="ctx-source-icon">{SOURCE_BADGES[s.type]}</span>
              <div className="conn-available-label">{s.label}</div>
              <div className="conn-available-desc muted">{s.desc}</div>
              <button className="btn sm ghost" disabled>即将支持</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
