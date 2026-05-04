import { useState } from 'react';

/* ─── Types ─── */

type SourceStatus = 'connected' | 'error' | 'pending';

interface ConnectedSource {
  id: string;
  type: 'email' | 'calendar' | 'github' | 'notion' | 'slack';
  label: string;
  account: string;
  status: SourceStatus;
  lastSync: string;
}

interface TaskMemory {
  id: string;
  taskTitle: string;
  lane: string;
  items: string[];
  updatedAt: string;
}

interface HabitRecord {
  id: string;
  observation: string;
  examples: string;
  confirmed: boolean | null;
}

/* ─── Mock data ─── */

const MOCK_SOURCES: ConnectedSource[] = [
  { id: 's1', type: 'email', label: 'Gmail', account: 'liqiang@company.com', status: 'connected', lastSync: '5 分钟前' },
  { id: 's2', type: 'calendar', label: 'Google Calendar', account: 'liqiang@company.com', status: 'connected', lastSync: '1 小时前' },
  { id: 's3', type: 'github', label: 'GitHub', account: 'liqiang95530', status: 'error', lastSync: '认证已过期' },
];

const MOCK_MEMORIES: TaskMemory[] = [
  {
    id: 'm1', taskTitle: '品牌合作来信回复', lane: 'escalate',
    items: [
      '对方为墨笺品牌，联系人 Lisa，微信同步在谈',
      '上次讨论：优先确认联名款数量和交货期',
      '决策记录：报价方案 B 已被接受（4/20）',
    ],
    updatedAt: '5/1',
  },
  {
    id: 'm2', taskTitle: 'Q2 财报分析报告', lane: 'unblock',
    items: [
      '核心指标：GMV、活跃用户、NPS',
      '数据来源：BI 系统导出 + 用户调研结果',
      '等待：用户确认是否纳入退款率指标',
    ],
    updatedAt: '4/29',
  },
  {
    id: 'm3', taskTitle: '周例会纪要整理', lane: 'continue',
    items: [
      '参会人：产品、设计、研发 TL',
      '核心议题：Q2 路线图优先级',
      '上次结论：推迟搜索功能，优先完成任务工作台',
    ],
    updatedAt: '5/3',
  },
];

const MOCK_HABITS: HabitRecord[] = [
  {
    id: 'h1',
    observation: '回复合作邮件前总会先确认对方微信上是否有同步沟通',
    examples: '品牌合作来信（3 次）、投资人跟进（2 次）',
    confirmed: true,
  },
  {
    id: 'h2',
    observation: '数据报告初稿完成后习惯先内部评审再对外发送',
    examples: 'Q1 财报、用户调研报告',
    confirmed: null,
  },
  {
    id: 'h3',
    observation: '周五下午较少处理需要深度思考的任务',
    examples: '过去 6 周的活动记录',
    confirmed: null,
  },
];

const SOURCE_ICONS: Record<string, string> = {
  email: '✉️', calendar: '📅', github: '🐙', notion: '📝', slack: '💬',
};

/* ─── Page ─── */

export function ContextPage() {
  const [sources, setSources] = useState<ConnectedSource[]>(MOCK_SOURCES);
  const [memories, setMemories] = useState<TaskMemory[]>(MOCK_MEMORIES);
  const [habits, setHabits] = useState<HabitRecord[]>(MOCK_HABITS);
  const [expandedMemory, setExpandedMemory] = useState<string | null>(null);
  const [editingHabit, setEditingHabit] = useState<string | null>(null);

  function confirmHabit(id: string, confirmed: boolean) {
    setHabits((prev) => prev.map((h) => h.id === id ? { ...h, confirmed } : h));
    setEditingHabit(null);
  }

  function deleteHabit(id: string) {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }

  function disconnectSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="context-page">
      {/* Header */}
      <div className="context-page-head">
        <h2 className="context-page-title">Context</h2>
        <p className="context-page-subtitle">AI 的感知与记忆层 — 对话结束后 agent 不失忆</p>
      </div>

      {/* Section 1: Connected Sources */}
      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">已连接来源</div>
            <div className="ctx-section-desc">AI 可感知的外部信号源</div>
          </div>
          <button className="btn sm primary">+ 连接来源</button>
        </div>

        <div className="ctx-list">
          {sources.map((src) => (
            <div key={src.id} className="ctx-source-row">
              <span className="ctx-source-icon">{SOURCE_ICONS[src.type]}</span>
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
                {src.status === 'pending' && (
                  <span className="status-pill">授权中</span>
                )}
              </div>
              <span className="ctx-source-sync muted">
                {src.status === 'connected' ? `同步于 ${src.lastSync}` : ''}
              </span>
              <div className="ctx-source-actions">
                {src.status === 'error' && (
                  <button className="btn sm">重新授权</button>
                )}
                <button className="btn sm ghost" onClick={() => disconnectSource(src.id)}>
                  断开
                </button>
              </div>
            </div>
          ))}
          {sources.length === 0 && (
            <div className="ctx-empty">暂无已连接来源。连接邮件、日历等来源后 AI 可感知外部信号。</div>
          )}
        </div>
      </section>

      {/* Section 2: Task memory */}
      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">任务上下文记忆</div>
            <div className="ctx-section-desc">AI 对每个任务积累的关键信息，跨会话持续保留</div>
          </div>
        </div>

        <div className="ctx-list">
          {memories.map((mem) => (
            <div key={mem.id} className="ctx-memory-row">
              <div
                className="ctx-memory-head"
                onClick={() => setExpandedMemory((prev) => (prev === mem.id ? null : mem.id))}
              >
                <span className={`tag lane-${mem.lane}`} style={{ fontSize: 10 }}>{mem.lane}</span>
                <span className="ctx-memory-title">{mem.taskTitle}</span>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{mem.updatedAt}</span>
                <span className="ctx-chevron">{expandedMemory === mem.id ? '▴' : '▾'}</span>
              </div>
              {expandedMemory === mem.id && (
                <div className="ctx-memory-body">
                  {mem.items.map((item, i) => (
                    <div key={i} className="ctx-memory-item">
                      <span className="ctx-memory-bullet">·</span>
                      <span>{item}</span>
                    </div>
                  ))}
                  <div className="ctx-memory-actions">
                    <button className="btn sm ghost">编辑记忆</button>
                    <button className="btn sm ghost" style={{ color: 'var(--accent)' }}>清除</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Work habits */}
      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">工作习惯记录</div>
            <div className="ctx-section-desc">AI 从你的工作模式中观察到的规律 — 可确认或纠正</div>
          </div>
        </div>

        <div className="ctx-list">
          {habits.map((h) => (
            <div key={h.id} className={`ctx-habit-row${h.confirmed === null ? ' unconfirmed' : ''}`}>
              <div className="ctx-habit-main">
                <div className="ctx-habit-obs">{h.observation}</div>
                <div className="ctx-habit-examples muted">{h.examples}</div>
              </div>
              <div className="ctx-habit-verdict">
                {h.confirmed === true && (
                  <span className="habit-badge confirmed">已确认</span>
                )}
                {h.confirmed === false && (
                  <span className="habit-badge rejected">已纠正</span>
                )}
                {h.confirmed === null && (
                  <div className="habit-actions">
                    <button className="btn sm primary" onClick={() => confirmHabit(h.id, true)}>确认</button>
                    <button className="btn sm ghost" onClick={() => confirmHabit(h.id, false)}>不准确</button>
                  </div>
                )}
              </div>
              <button
                className="ctx-habit-del icon-btn"
                onClick={() => deleteHabit(h.id)}
                title="删除"
              >
                <IconTrash />
              </button>
            </div>
          ))}
          {habits.length === 0 && (
            <div className="ctx-empty">AI 还没有观察到明显的工作习惯规律。</div>
          )}
        </div>
      </section>
    </div>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 12,4" />
      <path d="M5 4V2.5h4V4" />
      <rect x="3" y="4" width="8" height="8" rx="1.5" />
    </svg>
  );
}
