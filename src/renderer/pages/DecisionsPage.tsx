import { useState, useEffect } from 'react';
import {
  projectDecisionJudgments,
  type DecisionCategoryKey,
  type DecisionJudgmentProjection,
} from '@shared/decision-judgment-projection';
import { summarizeDecisionEffects } from '@shared/decision-effect-evaluator';
import type { DecisionRecord } from '@shared/types/decision';
import { guardDecisionAction, verifyDecisionActionCompleted } from '../lib/runtimeActionGuards';

type DecisionFilterKey = 'all' | DecisionCategoryKey;

type Decision = DecisionJudgmentProjection & {
  expanded: boolean;
};

type DecisionActionEffect = {
  actionLabel: string;
  detail: string;
  effectLabel: string;
  sourceLabel: string;
  title: string;
};

interface DecisionsPageProps {
  onOpenPanel: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}

export function DecisionsPage({ onOpenPanel, onOpenTask }: DecisionsPageProps) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKey, setFilterKey] = useState<DecisionFilterKey>('all');
  const [actionEffect, setActionEffect] = useState<DecisionActionEffect | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.api) { setLoading(false); return; }
    let cancelled = false;
    function reload() {
      setLoading(true);
      const loadJudgments = window.api!.listDecisionJudgments
        ? window.api!.listDecisionJudgments()
        : Promise.all([
            window.api!.listDecisions(),
            window.api!.listTasks?.() ?? Promise.resolve([]),
          ]).then(([records, tasks]) => {
            const tasksById = new Map(tasks.map((task) => [task.id, task]));
            return projectDecisionJudgments(records, tasksById);
          });
      loadJudgments
        .then((judgments) => {
          if (cancelled) return;
          setDecisions(judgments.map((judgment) => ({
            ...judgment,
            expanded: false,
          })));
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    reload();
    const unsubscribe = window.api.subscribeToEvents?.((event) => {
      if (event.type === 'decision.changed' || event.type === 'task.changed') reload();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  function toggleExpand(id: string) {
    setDecisions((prev) =>
      prev.map((d) => d.id === id ? { ...d, expanded: !d.expanded } : d)
    );
  }

  function decide(id: string, action: 'approve' | 'defer' | 'cancel' = 'approve') {
    const decision = decisions.find((item) => item.id === id);
    const guard = guardDecisionAction({
      action,
      taskId: decision?.taskId ?? null,
    });
    if (!guard.allowed) return;
    setDecisions((prev) => prev.filter((d) => d.id !== id));
    window.api?.actOnDecision({ id, action })
      .then((updated) => {
        setActionEffect(buildDecisionActionEffect(updated, action));
        verifyDecisionActionCompleted({
          title: updated.title,
          action,
        });
      })
      .catch(() => {});
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchedDecisions = normalizedQuery
    ? decisions.filter((d) => `${d.title} ${d.taskTitle}`.toLowerCase().includes(normalizedQuery))
    : decisions;
  const visibleDecisions = filterKey === 'all'
    ? searchedDecisions
    : searchedDecisions.filter((d) => d.category.key === filterKey);
  const sortedVisibleDecisions = [...visibleDecisions].sort((a, b) => (
    b.sortScore - a.sortScore || b.updatedLabel.localeCompare(a.updatedLabel)
  ));
  const today = sortedVisibleDecisions.filter((d) => d.urgency === 'today');
  const week = sortedVisibleDecisions.filter((d) => d.urgency === 'week');
  const categoryCounts = decisions.reduce<Record<DecisionFilterKey, number>>((acc, decision) => {
    acc.all += 1;
    acc[decision.category.key] += 1;
    return acc;
  }, { all: 0, agent: 0, risk: 0, completion: 0, direction: 0 });

  return (
    <div className="decisions-page">
      <div className="decisions-head">
        <h2 className="decisions-title">Decisions</h2>
        <p className="decisions-subtitle">跨任务汇总所有需要你拍板的事项；AI 只给建议，不替你选择</p>
      </div>

      {actionEffect && (
        <div className="dec-overview" aria-label="拍板结果">
          <div className="dec-overview-chip">
            <span className="dec-overview-value">{actionEffect.actionLabel}</span>
            <span>{actionEffect.title}</span>
          </div>
          <div className="dec-overview-chip">
            <span className="dec-overview-value">{actionEffect.effectLabel}</span>
            <span>{actionEffect.detail}</span>
          </div>
          <div className="dec-overview-chip">
            <span className="dec-overview-value">来源</span>
            <span>{actionEffect.sourceLabel}</span>
          </div>
        </div>
      )}

      {decisions.length > 0 && (
        <>
          <div className="dec-overview">
            <div className="dec-overview-chip">
              <span className="dec-overview-value">{decisions.length}</span>
              <span>待拍板</span>
            </div>
            <div className="dec-overview-chip">
              <span className="dec-overview-value">{categoryCounts.agent}</span>
              <span>Agent 暂停</span>
            </div>
            <div className="dec-overview-chip">
              <span className="dec-overview-value">{categoryCounts.risk}</span>
              <span>风险确认</span>
            </div>
          </div>

          <div className="dec-filter">
            <div className="dec-filter-tabs" aria-label="决策类型">
              {([
                ['all', '全部'],
                ['agent', 'Agent 暂停'],
                ['risk', '风险确认'],
                ['completion', '完成验收'],
                ['direction', '方向拍板'],
              ] as Array<[DecisionFilterKey, string]>).map(([key, label]) => (
                <button
                  key={key}
                  className={`dec-filter-tab${filterKey === key ? ' active' : ''}`}
                  onClick={() => setFilterKey(key)}
                >
                  {label}
                  {categoryCounts[key] > 0 && <span>{categoryCounts[key]}</span>}
                </button>
              ))}
            </div>
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
              onOpenTask={() => onOpenTask(d.taskId)}
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
              onOpenTask={() => onOpenTask(d.taskId)}
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
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>这里不是任务列表；只有当 AI 遇到风险操作、方向分歧、执行恢复或验收确认时，才会汇总到这里等待你拍板。</p>
        </div>
      )}
    </div>
  );
}

function buildDecisionActionEffect(
  decision: DecisionRecord,
  action: 'approve' | 'defer' | 'cancel',
): DecisionActionEffect {
  const effect = summarizeDecisionEffects([decision]);
  return {
    actionLabel: action === 'approve' ? '已批准' : action === 'defer' ? '已延后' : '已取消',
    detail: effect.effectDetail,
    effectLabel: effect.effectLabel,
    sourceLabel: decision.sourceLabel ?? decision.sourceType ?? decision.scope,
    title: decision.title,
  };
}

/* ─── Decision Card ─── */

interface DecisionCardProps {
  decision: Decision;
  onToggle: () => void;
  onDecide: (action?: 'approve' | 'defer' | 'cancel') => void;
  onOpenPanel: () => void;
  onOpenTask: () => void;
}

function DecisionCard({ decision: d, onToggle, onDecide, onOpenPanel, onOpenTask }: DecisionCardProps) {
  return (
    <div className={`dec-card${d.expanded ? ' expanded' : ''}`}>
      {/* Card header */}
      <div className="dec-card-head" onClick={onToggle}>
        <div className="dec-card-left">
          <div className="dec-card-title">{d.title}</div>
          <div className="dec-card-meta">
            <span className={`dec-category ${d.category.tone}`}>{d.category.label}</span>
            <span className={`tag lane-${d.lane}`} style={{ fontSize: 10 }}>{d.taskTitle}</span>
            <span className="tag captured" style={{ fontSize: 10 }}>{d.taskStateLabel}</span>
            <span className="tag captured" style={{ fontSize: 10 }}>{d.typeLabel}</span>
            <span className={`dec-clarity ${d.recommendationClarity}`}>
              {d.recommendationClarity === 'clear' ? '推荐路径清晰' : '需要复核'}
            </span>
            <span className="dec-rank-chip">{d.impactLabel}</span>
            <span className="dec-rank-chip">{d.reversibilityLabel}</span>
            {d.group.pendingCount > 1 && (
              <span className="dec-rank-chip">同组 {d.group.pendingCount} 项</span>
            )}
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
          <div className="dec-judgement-strip">
            <div className="dec-judgement-primary">
              <span>推荐判断</span>
              <strong>{d.recommendation}</strong>
              <p>{d.options.find((option) => option.label === d.recommendation || option.label.includes(d.recommendation))?.desc ?? d.context.whyNow}</p>
            </div>
            <div className="dec-judgement-facts">
              <div>
                <span>影响</span>
                <strong>{d.impactLabel}</strong>
              </div>
              <div>
                <span>可逆性</span>
                <strong>{d.reversibilityLabel}</strong>
              </div>
              <div>
                <span>来源</span>
                <strong>{d.sourceLabel}</strong>
              </div>
            </div>
          </div>
          <div className="dec-context">
            <div className="dec-context-item">
              <span className="dec-context-label">为什么现在</span>
              <span className="dec-context-text">{d.context.whyNow}</span>
            </div>
            <div className="dec-context-item">
              <span className="dec-context-label">如果不处理</span>
              <span className="dec-context-text">{d.context.ifDeferred}</span>
            </div>
            <div className="dec-context-item">
              <span className="dec-context-label">任务信号</span>
              <span className="dec-context-text">{d.taskSignal}</span>
            </div>
          </div>

          {d.group.pendingCount > 1 && (
            <div className="dec-group-note">
              <span>同一来源</span>
              <strong>{d.group.label}</strong>
              <p>{d.group.effectDetail}</p>
            </div>
          )}

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

          {d.taskId && (
            <div className="dec-actions">
              <button className="btn sm ghost" onClick={onOpenPanel}>修改后批准</button>
              <button className="btn sm ghost" onClick={onOpenPanel}>要求补充信息</button>
              <button className="btn sm ghost" onClick={onOpenTask}>查看任务</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
