import { useState, useEffect } from 'react';
import {
  projectDecisionJudgments,
  type DecisionCategoryKey,
  type DecisionJudgmentProjection,
} from '@shared/decision-judgment-projection';
import { summarizeDecisionEffects } from '@shared/decision-effect-evaluator';
import type {
  ApplyTaskHierarchyManualResolutionInput,
  TaskHierarchyConsistencyEvaluation,
  TaskHierarchyManualReviewItem,
  TaskHierarchyManualReviewPolicy,
} from '@shared/task-hierarchy-consistency';
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [hierarchyConsistency, setHierarchyConsistency] = useState<TaskHierarchyConsistencyEvaluation | null>(null);
  const [hierarchyPolicy, setHierarchyPolicy] = useState<TaskHierarchyManualReviewPolicy | null>(null);
  const [hierarchyNotice, setHierarchyNotice] = useState<string | null>(null);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);
  const [applyingHierarchyAction, setApplyingHierarchyAction] = useState<string | null>(null);
  const [actingDecisionIds, setActingDecisionIds] = useState<Set<string>>(() => new Set());
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
      Promise.all([
        loadJudgments,
        window.api!.getTaskHierarchyConsistency?.() ?? Promise.resolve(null),
        window.api!.getTaskHierarchyManualReviewPolicy?.() ?? Promise.resolve(null),
      ])
        .then(([judgments, hierarchy, policy]) => {
          if (cancelled) return;
          setDecisions(judgments.map((judgment) => ({
            ...judgment,
            expanded: false,
          })));
          setHierarchyConsistency(hierarchy);
          setHierarchyPolicy(policy);
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
    if (actingDecisionIds.has(id)) return;
    const decision = decisions.find((item) => item.id === id);
    const guard = guardDecisionAction({
      action,
      taskId: decision?.taskId ?? null,
    });
    if (!guard.allowed) return;
    setActionError(null);
    setActingDecisionIds((current) => new Set(current).add(id));
    window.api?.actOnDecision({ id, action })
      .then((updated) => {
        setDecisions((prev) => prev.filter((d) => d.id !== id));
        setActionEffect(buildDecisionActionEffect(updated, action));
        verifyDecisionActionCompleted({
          title: updated.title,
          action,
        });
      })
      .catch(() => {
        setActionError('拍板没有完成，事项已保留在列表中。请检查后重试。');
      })
      .finally(() => {
        setActingDecisionIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      });
  }

  function refreshHierarchyPolicy() {
    if (!window.api) return;
    Promise.all([
      window.api.getTaskHierarchyConsistency?.() ?? Promise.resolve(null),
      window.api.getTaskHierarchyManualReviewPolicy?.() ?? Promise.resolve(null),
    ]).then(([hierarchy, policy]) => {
      setHierarchyConsistency(hierarchy);
      setHierarchyPolicy(policy);
    }).catch(() => {
      setHierarchyError('任务结构检查没有完成，请稍后重试。');
    });
  }

  function applySafeHierarchyRepairs() {
    if (!window.api?.applySafeTaskHierarchyRepairs || applyingHierarchyAction) return;
    setHierarchyError(null);
    setApplyingHierarchyAction('safe');
    window.api.applySafeTaskHierarchyRepairs()
      .then((result) => {
        setHierarchyNotice(result.summary);
        refreshHierarchyPolicy();
      })
      .catch(() => {
        setHierarchyError('安全修复没有完成，任务结构未被修改。');
      })
      .finally(() => {
        setApplyingHierarchyAction(null);
      });
  }

  function applyHierarchyResolution(input: ApplyTaskHierarchyManualResolutionInput) {
    if (!window.api?.applyTaskHierarchyManualResolution || applyingHierarchyAction) return;
    const actionKey = `${input.kind}:${input.taskId}:${input.relatedTaskId ?? ''}:${input.targetParentTaskId ?? ''}`;
    setHierarchyError(null);
    setApplyingHierarchyAction(actionKey);
    window.api.applyTaskHierarchyManualResolution(input)
      .then((result) => {
        setHierarchyNotice(result.summary);
        refreshHierarchyPolicy();
      })
      .catch(() => {
        setHierarchyError('人工确认动作没有完成，任务结构未被修改。');
      })
      .finally(() => {
        setApplyingHierarchyAction(null);
      });
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchedDecisions = normalizedQuery
    ? decisions.filter((d) => [
        d.title,
        d.taskTitle,
        d.sourceLabel,
        d.sourceKindLabel,
        d.typeLabel,
        d.boundaryLabel,
        d.context.whyNow,
        d.context.ifDeferred,
        d.recommendation,
      ].join(' ').toLowerCase().includes(normalizedQuery))
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
  const hierarchyIssueCount = hierarchyConsistency?.issueCount ?? hierarchyPolicy?.items.length ?? 0;
  const hierarchyManualCount = hierarchyPolicy?.items.length ?? 0;
  const hasHierarchyConcern = hierarchyIssueCount > 0 || hierarchyManualCount > 0 || Boolean(hierarchyNotice || hierarchyError);

  return (
    <div className="decisions-page">
      <div className="decisions-head">
        <h2 className="decisions-title">Decisions</h2>
        <p className="decisions-subtitle">跨任务汇总所有需要你拍板的事项；AI 只给建议，不替你选择</p>
      </div>

      {actionError && (
        <div className="dec-overview" aria-label="拍板失败">
          <div className="dec-overview-chip">
            <span className="dec-overview-value">未完成</span>
            <span>{actionError}</span>
          </div>
        </div>
      )}

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

      {(hierarchyNotice || hierarchyError) && (
        <div className="dec-overview" aria-label="任务结构维护结果">
          <div className="dec-overview-chip">
            <span className="dec-overview-value">{hierarchyError ? '未完成' : '已处理'}</span>
            <span>{hierarchyError ?? hierarchyNotice}</span>
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

      {hasHierarchyConcern && (
        <section className="dec-section" aria-label="任务结构待确认">
          <div className="dec-section-head">
            <div className="dec-section-label">
              <span className="dot waiting" style={{ flexShrink: 0 }} />
              任务结构待确认
              <span className="dec-count">{hierarchyIssueCount}</span>
            </div>
            <div className="dec-section-note">只处理父子关系一致性；不会替你重排任务策略</div>
          </div>

          {hierarchyIssueCount > hierarchyManualCount && (
            <div className="dec-card">
              <div className="dec-card-head">
                <div className="dec-card-left">
                  <div className="dec-card-title">存在可安全修复的任务层级关系</div>
                  <div className="dec-card-meta">
                    <span className="dec-category completion">结构维护</span>
                    <span className="dec-rank-chip">{hierarchyConsistency?.summary ?? '任务层级需要检查。'}</span>
                  </div>
                </div>
                <div className="dec-card-right">
                  <button
                    className="btn primary"
                    disabled={Boolean(applyingHierarchyAction)}
                    onClick={applySafeHierarchyRepairs}
                  >
                    {applyingHierarchyAction === 'safe' ? '处理中…' : '应用安全修复 →'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {hierarchyPolicy?.items.map((item, index) => (
            <HierarchyReviewCard
              key={`${item.issue.code}:${item.issue.taskId}:${item.issue.relatedTaskId ?? ''}:${index}`}
              item={item}
              applyingAction={applyingHierarchyAction}
              onApply={applyHierarchyResolution}
              onOpenTask={() => onOpenTask(item.issue.taskId)}
            />
          ))}
        </section>
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
              acting={actingDecisionIds.has(d.id)}
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
              acting={actingDecisionIds.has(d.id)}
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

      {!loading && decisions.length === 0 && !hasHierarchyConcern && (
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
  const sourceLabel = decision.sourceLabel ?? decision.sourceType ?? decision.scope;
  if (action === 'approve' && isPatchPromotionDecision(decision)) {
    return {
      actionLabel: '已批准',
      detail: '批准已记录；真实写入只在 apply flag 开启且 promotion preflight 通过时发生，否则只记录 no-write 或 blocked 证据。',
      effectLabel: '应用边界',
      sourceLabel,
      title: decision.title,
    };
  }

  return {
    actionLabel: action === 'approve' ? '已批准' : action === 'defer' ? '已延后' : '已取消',
    detail: effect.effectDetail,
    effectLabel: effect.effectLabel,
    sourceLabel,
    title: decision.title,
  };
}

function isPatchPromotionDecision(decision: DecisionRecord): boolean {
  const text = `${decision.title} ${decision.sourceLabel ?? ''}`.toLowerCase();
  return decision.sourceLabel === 'workspace.staged_patch'
    || text.includes('workspace.staged_patch');
}

function hierarchyResolutionForItem(
  item: TaskHierarchyManualReviewItem,
): { label: string; input: ApplyTaskHierarchyManualResolutionInput } | null {
  if (item.issue.code === 'missing_child_record' && item.issue.relatedTaskId) {
    return {
      label: '移除悬空引用',
      input: {
        kind: 'remove_child_reference',
        taskId: item.issue.taskId,
        relatedTaskId: item.issue.relatedTaskId,
      },
    };
  }

  if (item.issue.code === 'missing_parent_record') {
    return {
      label: '清除无效父任务',
      input: {
        kind: 'clear_parent_reference',
        taskId: item.issue.taskId,
        relatedTaskId: item.issue.relatedTaskId,
      },
    };
  }

  if (item.issue.code === 'self_child') {
    return {
      label: '移除自引用',
      input: {
        kind: 'remove_self_reference',
        taskId: item.issue.taskId,
        relatedTaskId: item.issue.relatedTaskId,
      },
    };
  }

  if (item.issue.code === 'duplicate_child_id' && item.issue.relatedTaskId) {
    return {
      label: '去重子任务引用',
      input: {
        kind: 'dedupe_child_reference',
        taskId: item.issue.taskId,
        relatedTaskId: item.issue.relatedTaskId,
      },
    };
  }

  if (item.issue.code === 'child_listed_under_multiple_parents' && item.issue.relatedTaskId) {
    return {
      label: '从当前父任务移除',
      input: {
        kind: 'remove_child_reference',
        taskId: item.issue.taskId,
        relatedTaskId: item.issue.relatedTaskId,
      },
    };
  }

  return null;
}

interface HierarchyReviewCardProps {
  applyingAction: string | null;
  item: TaskHierarchyManualReviewItem;
  onApply: (input: ApplyTaskHierarchyManualResolutionInput) => void;
  onOpenTask: () => void;
}

function HierarchyReviewCard({ applyingAction, item, onApply, onOpenTask }: HierarchyReviewCardProps) {
  const resolution = hierarchyResolutionForItem(item);
  const actionKey = resolution
    ? `${resolution.input.kind}:${resolution.input.taskId}:${resolution.input.relatedTaskId ?? ''}:${resolution.input.targetParentTaskId ?? ''}`
    : null;

  return (
    <div className="dec-card expanded">
      <div className="dec-card-head">
        <div className="dec-card-left">
          <div className="dec-card-title">{item.decisionQuestion}</div>
          <div className="dec-card-meta">
            <span className="dec-category direction">结构确认</span>
            <span className="dec-rank-chip">{item.reason}</span>
            <span className="dec-rank-chip">{item.issue.code}</span>
          </div>
        </div>
        <div className="dec-card-right">
          {resolution && (
            <button
              className="btn primary"
              disabled={Boolean(applyingAction)}
              onClick={() => onApply(resolution.input)}
            >
              {applyingAction === actionKey ? '处理中…' : `${resolution.label} →`}
            </button>
          )}
        </div>
      </div>
      <div className="dec-options">
        <div className="dec-context">
          <div className="dec-context-item">
            <span className="dec-context-label">发现的问题</span>
            <span className="dec-context-text">{item.issue.message}</span>
          </div>
          <div className="dec-context-item">
            <span className="dec-context-label">建议处理</span>
            <span className="dec-context-text">{item.recommendedResolution}</span>
          </div>
        </div>
        <div className="dec-actions">
          <button className="btn sm ghost" onClick={onOpenTask}>查看相关任务</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Decision Card ─── */

interface DecisionCardProps {
  acting: boolean;
  decision: Decision;
  onToggle: () => void;
  onDecide: (action?: 'approve' | 'defer' | 'cancel') => void;
  onOpenPanel: () => void;
  onOpenTask: () => void;
}

function DecisionCard({ acting, decision: d, onToggle, onDecide, onOpenPanel, onOpenTask }: DecisionCardProps) {
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
            <span className="tag captured" style={{ fontSize: 10 }}>{d.sourceKindLabel}</span>
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
          <button className="btn primary" disabled={acting} onClick={(e) => { e.stopPropagation(); onDecide('approve'); }}>
            {acting ? '处理中…' : '拍板 →'}
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
              <p>{d.recommendationReason ?? d.options.find((option) => option.label === d.recommendation || option.label.includes(d.recommendation))?.desc ?? d.context.whyNow}</p>
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
              <div>
                <span>边界</span>
                <strong>{d.boundaryLabel}</strong>
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
            <div className="dec-context-item">
              <span className="dec-context-label">判断对象</span>
              <span className="dec-context-text">{d.sourceKindLabel}：{d.sourceLabel}</span>
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
                disabled={acting}
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
              <button className="btn sm ghost" onClick={onOpenTask}>{d.sourceActionLabel ?? '查看任务'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
