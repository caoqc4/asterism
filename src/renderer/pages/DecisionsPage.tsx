import { useState } from 'react';

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

const MOCK_DECISIONS: Decision[] = [
  {
    id: 'd1',
    title: '品牌合作报价：确认合作方案',
    taskTitle: '品牌合作来信回复',
    lane: 'escalate',
    urgency: 'today',
    deadline: '今日 18:00',
    recommendation: '方案 B',
    options: [
      { label: '方案 A：联名限定款', desc: '最低起量 500 件，交货 30 天，利润率约 35%', risk: '库存积压风险' },
      { label: '方案 B：买断授权', desc: '一次性授权费 8 万，对方自行生产，我方无库存压力', },
      { label: '方案 C：先小批量试单', desc: '100 件试水，双方各承担 50% 损耗', },
    ],
    expanded: false,
  },
  {
    id: 'd2',
    title: 'Q2 财报：是否纳入退款率指标',
    taskTitle: 'Q2 财报分析报告',
    lane: 'unblock',
    urgency: 'today',
    deadline: '今日',
    recommendation: '纳入（推荐）',
    options: [
      { label: '纳入退款率', desc: '更全面反映用户满意度，但数据需额外处理 2 小时', },
      { label: '不纳入', desc: '按原方案推进，本周五可完成初稿', },
    ],
    expanded: false,
  },
  {
    id: 'd3',
    title: '官网改版：开发排期是否接受延后 2 周',
    taskTitle: '官网改版项目',
    lane: 'continue',
    urgency: 'week',
    recommendation: '接受延后',
    options: [
      { label: '接受延后 2 周', desc: '开发资源优先处理 App 版本，官网顺延至 6/15 上线', },
      { label: '坚持原排期', desc: '需要协调额外 1 名前端资源，成本增加约 1.5 万', risk: '资源紧张' },
    ],
    expanded: false,
  },
  {
    id: 'd4',
    title: '竞品调研：范围是否包含海外市场',
    taskTitle: '竞品调研报告',
    lane: 'clarify',
    urgency: 'week',
    recommendation: '仅国内（推荐先行）',
    options: [
      { label: '仅国内竞品', desc: '聚焦 5 款主要竞品，2 周可出报告', },
      { label: '含海外市场', desc: '额外覆盖 Notion、Linear 等，周期延长至 4 周', },
    ],
    expanded: false,
  },
];

export function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>(MOCK_DECISIONS);

  function toggleExpand(id: string) {
    setDecisions((prev) =>
      prev.map((d) => d.id === id ? { ...d, expanded: !d.expanded } : d)
    );
  }

  function decide(id: string) {
    setDecisions((prev) => prev.filter((d) => d.id !== id));
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
            <DecisionCard key={d.id} decision={d} onToggle={() => toggleExpand(d.id)} onDecide={() => decide(d.id)} />
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
            <DecisionCard key={d.id} decision={d} onToggle={() => toggleExpand(d.id)} onDecide={() => decide(d.id)} />
          ))}
        </section>
      )}

      {decisions.length === 0 && (
        <div className="decisions-empty">
          <p>当前没有待拍板事项。</p>
        </div>
      )}
    </div>
  );
}

/* ─── Decision Card ─── */

interface DecisionCardProps {
  decision: Decision;
  onToggle: () => void;
  onDecide: () => void;
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
          <button className="btn primary" onClick={(e) => { e.stopPropagation(); onDecide(); }}>
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
              <button className="btn sm" onClick={onDecide}>选择此方案</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
