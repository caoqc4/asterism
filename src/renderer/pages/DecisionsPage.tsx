import { useState, useEffect } from 'react';
import type { DecisionRecord } from '@shared/types/decision';

interface Decision {
  id: string;
  taskId: string;
  title: string;
  taskTitle: string;
  typeLabel: string;
  updatedLabel: string;
  lane: string;
  urgency: 'today' | 'week';
  deadline?: string;
  context: DecisionContext;
  options: DecisionOption[];
  recommendation: string;
  recommendationClarity: 'clear' | 'review';
  expanded: boolean;
}

interface DecisionContext {
  whyNow: string;
  ifDeferred: string;
}

interface DecisionOption {
  label: string;
  desc: string;
  risk?: string;
}


function fromRecord(r: DecisionRecord): Decision {
  const isAgentCheckpoint = r.sourceType === 'agent_checkpoint';
  return {
    id: r.id,
    taskId: r.taskId,
    title: r.title,
    taskTitle: r.sourceLabel ?? r.taskId,
    typeLabel: formatDecisionType(r.sourceType),
    updatedLabel: `更新 ${formatDecisionDate(r.updatedAt)}`,
    lane: 'continue',
    urgency: isAgentCheckpoint ? 'today' : 'week',
    context: {
      whyNow: isAgentCheckpoint
        ? `Agent 在「${r.sourceLabel ?? r.title}」的执行检查点暂停，需要你确认是否恢复推进。`
        : `这次拍板会决定「${r.sourceLabel ?? r.title}」是否按当前方向继续推进。`,
      ifDeferred: isAgentCheckpoint
        ? '如果暂不处理，Agent 会保持暂停，相关任务不会自动继续执行。'
        : '如果暂不处理，相关任务会继续停留在等待拍板状态，后续执行不应自动推进。',
    },
    options: isAgentCheckpoint
      ? [
          { label: '恢复执行', desc: '确认检查点，可以让 Agent 按当前上下文继续推进。' },
          { label: '暂停等待', desc: '暂缓处理，保留检查点，等补充信息后再恢复。' },
          { label: '取消本次执行', desc: '取消这次检查点请求，不自动继续当前执行。' },
        ]
      : [
          { label: '批准', desc: '按当前建议继续推进，并记录这次拍板。' },
          { label: '稍后再定', desc: '暂缓处理，任务会回到等待状态。' },
          { label: '取消', desc: '取消这次决策请求，不改变任务当前执行状态。' },
        ],
    recommendation: isAgentCheckpoint ? '恢复执行' : '批准',
    recommendationClarity: isAgentCheckpoint ? 'review' : 'clear',
    expanded: false,
  };
}

function formatDecisionType(sourceType: DecisionRecord['sourceType']): string {
  if (sourceType === 'agent_checkpoint') return 'Agent 检查点';
  return '人工决策';
}

function formatDecisionDate(value: string): string {
  return value.slice(0, 10);
}

interface DecisionsPageProps {
  onOpenPanel: (taskId: string) => void;
  onOpenWorkbench: (taskId: string) => void;
}

export function DecisionsPage({ onOpenPanel, onOpenWorkbench }: DecisionsPageProps) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.api) { setLoading(false); return; }
    window.api.listDecisions()
      .then((records) => setDecisions(records
        .filter((r) => r.status === 'pending')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(fromRecord)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(id: string) {
    setDecisions((prev) =>
      prev.map((d) => d.id === id ? { ...d, expanded: !d.expanded } : d)
    );
  }

  function decide(id: string, action: 'approve' | 'defer' | 'cancel' = 'approve') {
    setDecisions((prev) => prev.filter((d) => d.id !== id));
    window.api?.actOnDecision({ id, action }).catch(() => {});
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleDecisions = normalizedQuery
    ? decisions.filter((d) => `${d.title} ${d.taskTitle}`.toLowerCase().includes(normalizedQuery))
    : decisions;
  const today = visibleDecisions.filter((d) => d.urgency === 'today');
  const week = visibleDecisions.filter((d) => d.urgency === 'week');

  return (
    <div className="decisions-page">
      <div className="decisions-head">
        <h2 className="decisions-title">Decisions</h2>
        <p className="decisions-subtitle">跨任务汇总所有需要你拍板的事项；AI 只给建议，不替你选择</p>
      </div>

      {decisions.length > 0 && (
        <>
          <div className="dec-overview">
            <div className="dec-overview-chip">
              <span className="dec-overview-value">{decisions.length}</span>
              <span>待拍板</span>
            </div>
            <div className="dec-overview-chip">
              <span className="dec-overview-value">{today.length}</span>
              <span>今天必须处理</span>
            </div>
            <div className="dec-overview-chip">
              <span className="dec-overview-value">{week.length}</span>
              <span>本周内</span>
            </div>
          </div>

          <div className="dec-filter">
            <input
              className="dec-filter-input"
              placeholder="搜索决策或任务"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </>
      )}

      {today.length > 0 && (
        <section className="dec-section">
          <div className="dec-section-head">
            <div className="dec-section-label">
              <span className="dot risk" style={{ flexShrink: 0 }} />
              今天必须处理
              <span className="dec-count">{today.length}</span>
            </div>
            <div className="dec-section-note">有截止时间或 Agent 检查点暂停的事项优先处理</div>
          </div>
          {today.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              onToggle={() => toggleExpand(d.id)}
              onDecide={(action) => decide(d.id, action)}
              onOpenPanel={() => onOpenPanel(d.taskId)}
              onOpenWorkbench={() => onOpenWorkbench(d.taskId)}
            />
          ))}
        </section>
      )}

      {week.length > 0 && (
        <section className="dec-section">
          <div className="dec-section-head">
            <div className="dec-section-label">
              <span className="dot waiting" style={{ flexShrink: 0 }} />
              本周内
              <span className="dec-count">{week.length}</span>
            </div>
            <div className="dec-section-note">推荐顺序按影响面 × 不可逆程度排列</div>
          </div>
          {week.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              onToggle={() => toggleExpand(d.id)}
              onDecide={(action) => decide(d.id, action)}
              onOpenPanel={() => onOpenPanel(d.taskId)}
              onOpenWorkbench={() => onOpenWorkbench(d.taskId)}
            />
          ))}
        </section>
      )}

      {!loading && decisions.length > 0 && visibleDecisions.length === 0 && (
        <div className="decisions-empty">
          <p>没有匹配的待拍板事项。</p>
        </div>
      )}

      {!loading && decisions.length === 0 && (
        <div className="decisions-empty">
          <p>当前没有待拍板事项。</p>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>AI 在执行任务时遇到需要你决策的分歧点，会自动在这里汇总。</p>
        </div>
      )}
    </div>
  );
}

/* ─── Decision Card ─── */

interface DecisionCardProps {
  decision: Decision;
  onToggle: () => void;
  onDecide: (action?: 'approve' | 'defer' | 'cancel') => void;
  onOpenPanel: () => void;
  onOpenWorkbench: () => void;
}

function DecisionCard({ decision: d, onToggle, onDecide, onOpenPanel, onOpenWorkbench }: DecisionCardProps) {
  return (
    <div className={`dec-card${d.expanded ? ' expanded' : ''}`}>
      {/* Card header */}
      <div className="dec-card-head" onClick={onToggle}>
        <div className="dec-card-left">
          <div className="dec-card-title">{d.title}</div>
          <div className="dec-card-meta">
            <span className={`tag lane-${d.lane}`} style={{ fontSize: 10 }}>{d.taskTitle}</span>
            <span className="tag captured" style={{ fontSize: 10 }}>{d.typeLabel}</span>
            <span className={`dec-clarity ${d.recommendationClarity}`}>
              {d.recommendationClarity === 'clear' ? '推荐路径清晰' : '需要复核'}
            </span>
            <span className="dec-updated">{d.updatedLabel}</span>
            {d.deadline && (
              <span className="dec-deadline">截止：{d.deadline}</span>
            )}
          </div>
        </div>
        <div className="dec-card-right">
          <div className="dec-rec">
            <span className="dec-rec-label">推荐</span>
            <span className="dec-rec-value">{d.recommendation}</span>
            <span className="dec-rec-hint">展开可比较备选</span>
          </div>
          <button className="btn primary" onClick={(e) => { e.stopPropagation(); onDecide('approve'); }}>
            拍板 →
          </button>
          <span className="dec-chevron">{d.expanded ? '▴' : '▾'}</span>
        </div>
      </div>

      {/* Expanded options */}
      {d.expanded && (
        <div className="dec-options">
          <div className="dec-context">
            <div className="dec-context-item">
              <span className="dec-context-label">为什么现在</span>
              <span className="dec-context-text">{d.context.whyNow}</span>
            </div>
            <div className="dec-context-item">
              <span className="dec-context-label">如果不处理</span>
              <span className="dec-context-text">{d.context.ifDeferred}</span>
            </div>
          </div>

          {d.options.map((opt) => (
            <div key={opt.label} className={`dec-option${opt.label === d.recommendation || opt.label.includes(d.recommendation) ? ' recommended' : ''}`}>
              <div className="dec-option-head">
                <span className="dec-option-label">{opt.label}</span>
                {(opt.label === d.recommendation || opt.label.includes(d.recommendation)) && (
                  <span className="dec-option-badge">推荐</span>
                )}
                {opt.risk && <span className="tag risk" style={{ fontSize: 10 }}>{opt.risk}</span>}
              </div>
              <p className="dec-option-desc">{opt.desc}</p>
              <button
                className="btn sm"
                onClick={() => onDecide(
                  opt.label === '稍后再定' || opt.label === '暂停等待'
                    ? 'defer'
                    : opt.label === '取消' || opt.label === '取消本次执行'
                      ? 'cancel'
                      : 'approve'
                )}
              >
                选择此方案
              </button>
            </div>
          ))}

          <div className="dec-actions">
            <button className="btn sm ghost" onClick={onOpenPanel}>修改后批准</button>
            <button className="btn sm ghost" onClick={onOpenPanel}>要求补充信息</button>
            <button className="btn sm ghost" onClick={onOpenWorkbench}>查看任务详情</button>
          </div>
        </div>
      )}
    </div>
  );
}
