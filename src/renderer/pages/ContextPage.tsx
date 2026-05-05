import { useState, useEffect } from 'react';
import type { TaskListItemRecord } from '@shared/types/task';

interface HabitRecord {
  id: string;
  observation: string;
  examples: string;
  confirmed: boolean | null;
}

const SEED_HABITS: HabitRecord[] = [
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
];

function deriveLane(t: TaskListItemRecord): string {
  if (t.riskLevel === 'high') return 'escalate';
  if (t.activeBlocker || t.state === 'waiting_external') return 'unblock';
  if (t.state === 'running') return 'continue';
  if (t.state === 'captured') return 'clarify';
  return 'steady';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function ContextPage() {
  const [tasks, setTasks] = useState<TaskListItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [habits, setHabits] = useState<HabitRecord[]>(SEED_HABITS);

  useEffect(() => {
    if (!window.api) { setLoading(false); return; }
    window.api.listTasks()
      .then((all) => {
        const withContext = all.filter(
          (t) => t.state !== 'archived' && (t.summary || t.nextStep || t.activeBlocker || t.waitingReason)
        );
        setTasks(withContext.slice(0, 12));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function confirmHabit(id: string, confirmed: boolean) {
    setHabits((prev) => prev.map((h) => h.id === id ? { ...h, confirmed } : h));
  }

  function deleteHabit(id: string) {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }

  return (
    <div className="context-page">
      <div className="context-page-head">
        <h2 className="context-page-title">Context</h2>
        <p className="context-page-subtitle">AI 的记忆层 — 任务信息与工作习惯在会话间持续保留</p>
      </div>

      {/* Task memory */}
      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">任务上下文记忆</div>
            <div className="ctx-section-desc">AI 对活跃任务掌握的关键信息，跨会话持续保留</div>
          </div>
        </div>

        <div className="ctx-list">
          {loading && (
            <div className="ctx-empty muted">加载中…</div>
          )}
          {!loading && tasks.length === 0 && (
            <div className="ctx-empty">暂无带有上下文的活跃任务。在 Tasks 创建任务并补充说明后，AI 将自动建立记忆。</div>
          )}
          {tasks.map((task) => {
            const lane = deriveLane(task);
            const isExpanded = expandedTask === task.id;
            const items: string[] = [];
            if (task.summary) items.push(task.summary);
            if (task.nextStep) items.push(`下一步：${task.nextStep}`);
            if (task.waitingReason) items.push(`等待中：${task.waitingReason}`);
            if (task.activeBlocker) items.push(`阻塞：${task.activeBlocker.title}`);

            return (
              <div key={task.id} className="ctx-memory-row">
                <div
                  className="ctx-memory-head"
                  onClick={() => setExpandedTask((prev) => (prev === task.id ? null : task.id))}
                >
                  <span className={`tag lane-${lane}`} style={{ fontSize: 10 }}>{lane}</span>
                  <span className="ctx-memory-title">{task.title}</span>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>
                    {formatDate(task.updatedAt)}
                  </span>
                  <span className="ctx-chevron">{isExpanded ? '▴' : '▾'}</span>
                </div>
                {isExpanded && (
                  <div className="ctx-memory-body">
                    {items.length > 0 ? (
                      items.map((item, i) => (
                        <div key={i} className="ctx-memory-item">
                          <span className="ctx-memory-bullet">·</span>
                          <span>{item}</span>
                        </div>
                      ))
                    ) : (
                      <div className="ctx-memory-item muted">暂无详细上下文。</div>
                    )}
                    <div className="ctx-memory-actions">
                      <button className="btn sm ghost" disabled title="即将支持">编辑</button>
                      <button className="btn sm ghost" disabled title="即将支持" style={{ color: 'var(--accent)' }}>清除</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Work habits */}
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
                {h.confirmed === true && <span className="habit-badge confirmed">已确认</span>}
                {h.confirmed === false && <span className="habit-badge rejected">已纠正</span>}
                {h.confirmed === null && (
                  <div className="habit-actions">
                    <button className="btn sm primary" onClick={() => confirmHabit(h.id, true)}>确认</button>
                    <button className="btn sm ghost" onClick={() => confirmHabit(h.id, false)}>不准确</button>
                  </div>
                )}
              </div>
              <button className="ctx-habit-del icon-btn" onClick={() => deleteHabit(h.id)} title="删除">
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
