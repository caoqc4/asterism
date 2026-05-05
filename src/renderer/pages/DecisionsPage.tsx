import { useState, useEffect } from 'react';
import type { DecisionRecord } from '@shared/types/decision';

interface Decision {
  id: string;
  title: string;
  taskTitle: string;
  lane: string;
  urgency: 'today' | 'week';
  deadline?: string;
  options: DecisionOption[];
  recommendation: string;
  expanded: boolean;
}

interface DecisionOption {
  label: string;
  desc: string;
  risk?: string;
}


function fromRecord(r: DecisionRecord): Decision {
  return {
    id: r.id,
    title: r.title,
    taskTitle: r.sourceLabel ?? r.taskId,
    lane: 'continue',
    urgency: 'week',
    options: [
      { label: '批准', desc: '按当前建议继续推进，并记录这次拍板。' },
      { label: '稍后再定', desc: '暂缓处理，任务会回到等待状态。' },
      { label: '取消', desc: '取消这次决策请求，不改变任务当前执行状态。' },
    ],
    recommendation: '批准',
    expanded: false,
  };
}

export function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.api) { setLoading(false); return; }
    window.api.listDecisions()
      .then((records) => setDecisions(records.filter((r) => r.status === 'pending').map(fromRecord)))
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

  const today = decisions.filter((d) => d.urgency === 'today');
  const week = decisions.filter((d) => d.urgency === 'week');

  return (
    <div className="decisions-page">
      <div className="decisions-head">
        <h2 className="decisions-title">Decisions</h2>
        <p className="decisions-subtitle">跨任务汇总所有需要你拍板的事项</p>
      </div>

      {today.length > 0 && (
        <section className="dec-section">
          <div className="dec-section-label">
            <span className="dot risk" style={{ flexShrink: 0 }} />
            今天必须处理
            <span className="dec-count">{today.length}</span>
          </div>
          {today.map((d) => (
            <DecisionCard key={d.id} decision={d} onToggle={() => toggleExpand(d.id)} onDecide={(action) => decide(d.id, action)} />
          ))}
        </section>
      )}

      {week.length > 0 && (
        <section className="dec-section">
          <div className="dec-section-label">
            <span className="dot waiting" style={{ flexShrink: 0 }} />
            本周内
            <span className="dec-count">{week.length}</span>
          </div>
          {week.map((d) => (
            <DecisionCard key={d.id} decision={d} onToggle={() => toggleExpand(d.id)} onDecide={(action) => decide(d.id, action)} />
          ))}
        </section>
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
}

function DecisionCard({ decision: d, onToggle, onDecide }: DecisionCardProps) {
  return (
    <div className={`dec-card${d.expanded ? ' expanded' : ''}`}>
      {/* Card header */}
      <div className="dec-card-head" onClick={onToggle}>
        <div className="dec-card-left">
          <div className="dec-card-title">{d.title}</div>
          <div className="dec-card-meta">
            <span className={`tag lane-${d.lane}`} style={{ fontSize: 10 }}>{d.taskTitle}</span>
            {d.deadline && (
              <span className="dec-deadline">截止：{d.deadline}</span>
            )}
          </div>
        </div>
        <div className="dec-card-right">
          <div className="dec-rec">
            <span className="dec-rec-label">推荐</span>
            <span className="dec-rec-value">{d.recommendation}</span>
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
                onClick={() => onDecide(opt.label === '稍后再定' ? 'defer' : opt.label === '取消' ? 'cancel' : 'approve')}
              >
                选择此方案
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
