import { useState, useEffect } from 'react';
import type { DecisionRecord } from '@shared/types/decision';
import type { TaskListItemRecord } from '@shared/types/task';

type DecisionCategoryKey = 'agent' | 'risk' | 'completion' | 'direction';
type DecisionFilterKey = 'all' | DecisionCategoryKey;

interface DecisionCategory {
  key: DecisionCategoryKey;
  label: string;
  tone: 'agent' | 'risk' | 'completion' | 'direction';
}

interface Decision {
  id: string;
  taskId: string;
  title: string;
  taskTitle: string;
  taskStateLabel: string;
  taskSignal: string;
  sourceLabel: string;
  typeLabel: string;
  updatedLabel: string;
  lane: string;
  urgency: 'today' | 'week';
  deadline?: string;
  category: DecisionCategory;
  context: DecisionContext;
  options: DecisionOption[];
  recommendation: string;
  recommendationClarity: 'clear' | 'review';
  impactLabel: string;
  reversibilityLabel: string;
  sortScore: number;
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

function fromRecord(r: DecisionRecord, task: TaskListItemRecord | null): Decision {
  const isAgentCheckpoint = r.sourceType === 'agent_checkpoint';
  const category = classifyDecision(r, task);
  const taskTitle = task?.title ?? r.sourceLabel ?? r.sourceId ?? '全局事项';
  const taskStateLabel = task ? formatTaskState(task.state) : '未关联到当前任务';
  const taskSignal = buildTaskSignal(task);
  const fallbackOptions = isAgentCheckpoint
    ? [
        { label: '恢复执行', desc: '确认当前检查点，让 Agent 按当前上下文继续推进；这不会授予后续同类动作的长期权限。' },
        { label: '暂停等待', desc: '暂缓处理，保留检查点，等补充信息后再恢复。' },
        { label: '取消本次执行', desc: '取消这次检查点请求，不自动继续当前执行。' },
      ]
    : [
        { label: category.key === 'completion' ? '确认完成' : '批准', desc: optionApproveDescription(category) },
        { label: '稍后再定', desc: '暂缓处理，任务会回到等待状态。' },
        { label: '取消', desc: '取消这次决策请求，不改变任务当前执行状态。' },
      ];
  const options = r.options?.length
    ? r.options.map((option) => ({
        label: option.label,
        desc: option.description ?? option.risk ?? '按此方案处理，并记录这次拍板。',
        risk: option.risk ?? undefined,
      }))
    : fallbackOptions;
  const recommendation = r.recommendation?.label
    ?? (isAgentCheckpoint ? '恢复执行' : category.key === 'completion' ? '确认完成' : '批准');
  return {
    id: r.id,
    taskId: r.taskId ?? '',
    title: r.title,
    taskTitle,
    taskStateLabel,
    taskSignal,
    sourceLabel: r.sourceLabel ?? r.sourceId ?? taskTitle,
    typeLabel: formatDecisionType(r.sourceType),
    updatedLabel: `更新 ${formatDecisionDate(r.updatedAt)}`,
    lane: 'continue',
    urgency: isAgentCheckpoint ? 'today' : 'week',
    category,
    context: {
      whyNow: isAgentCheckpoint
        ? `Agent 在「${r.sourceLabel ?? r.title}」的执行检查点暂停，需要你确认是否恢复推进。`
        : r.context?.whyNow ?? buildWhyNow(r, task, category),
      ifDeferred: isAgentCheckpoint
        ? '如果暂不处理，Agent 会保持暂停，相关任务不会自动继续执行。'
        : r.context?.ifDeferred ?? buildDeferredImpact(task, category),
    },
    options,
    recommendation,
    recommendationClarity: isAgentCheckpoint ? 'review' : 'clear',
    impactLabel: impactLabelFor(category, task),
    reversibilityLabel: reversibilityLabelFor(category),
    sortScore: scoreDecision(r, task, category),
    expanded: false,
  };
}

function classifyDecision(r: DecisionRecord, task: TaskListItemRecord | null): DecisionCategory {
  if (r.kind === 'agent_resume' || r.scope === 'agent') {
    return { key: 'agent', label: 'Agent 暂停', tone: 'agent' };
  }
  if (r.kind === 'risk_approval' || r.kind === 'external_write' || r.scope === 'external_access' || r.scope === 'workspace') {
    return { key: 'risk', label: r.kind === 'external_write' ? '外部写入' : '风险确认', tone: 'risk' };
  }
  if (r.kind === 'completion_acceptance') {
    return { key: 'completion', label: '完成验收', tone: 'completion' };
  }
  if (r.sourceType === 'agent_checkpoint') {
    return { key: 'agent', label: 'Agent 暂停', tone: 'agent' };
  }
  const text = `${r.title} ${r.sourceLabel ?? ''}`.toLowerCase();
  if (task?.riskLevel === 'high' || text.includes('写入') || text.includes('promotion') || text.includes('权限')) {
    return { key: 'risk', label: '风险确认', tone: 'risk' };
  }
  if (text.includes('完成') || text.includes('验收') || text.includes('交付')) {
    return { key: 'completion', label: '完成验收', tone: 'completion' };
  }
  return { key: 'direction', label: '方向拍板', tone: 'direction' };
}

function buildWhyNow(r: DecisionRecord, task: TaskListItemRecord | null, category: DecisionCategory): string {
  const subject = task?.title ?? r.sourceLabel ?? r.title;
  if (category.key === 'risk') {
    return `「${subject}」涉及高影响或外部写入，需要你确认风险边界后再继续。`;
  }
  if (category.key === 'completion') {
    return `「${subject}」进入验收节点，需要你确认是否可以作为完成状态记录。`;
  }
  if (task?.activeBlocker) {
    return `「${subject}」当前有阻塞，拍板结果会决定下一步是继续推进、补充信息还是暂停。`;
  }
  return `这次拍板会决定「${subject}」是否按当前方向继续推进。`;
}

function buildDeferredImpact(task: TaskListItemRecord | null, category: DecisionCategory): string {
  if (category.key === 'risk') return '如果暂不处理，相关高风险动作不会继续执行，任务保持等待人工确认。';
  if (category.key === 'completion') return '如果暂不处理，任务不会进入完成状态，后续仍会保留为待验收。';
  if (task?.activeBlocker) return '如果暂不处理，阻塞不会解除，依赖它的后续任务也不应自动推进。';
  return '如果暂不处理，相关任务会继续停留在等待拍板状态，后续执行不应自动推进。';
}

function optionApproveDescription(category: DecisionCategory): string {
  if (category.key === 'risk') return '确认当前风险可以接受，并记录这次授权范围。';
  if (category.key === 'completion') return '确认当前结果达到完成标准，并记录这次验收。';
  return '按当前建议继续推进，并记录这次拍板。';
}

function scoreDecision(r: DecisionRecord, task: TaskListItemRecord | null, category: DecisionCategory): number {
  let score = category.key === 'agent' ? 50 : category.key === 'risk' ? 40 : category.key === 'completion' ? 30 : 20;
  if (task?.activeBlocker) score += 6;
  if (task?.riskLevel === 'high') score += 5;
  if (r.sourceType === 'agent_checkpoint') score += 4;
  return score;
}

function impactLabelFor(category: DecisionCategory, task: TaskListItemRecord | null): string {
  if (category.key === 'agent' || category.key === 'risk' || task?.riskLevel === 'high') return '高影响';
  if (category.key === 'completion') return '交付影响';
  return '中影响';
}

function reversibilityLabelFor(category: DecisionCategory): string {
  if (category.key === 'agent') return '需谨慎恢复';
  if (category.key === 'risk') return '需留痕';
  if (category.key === 'completion') return '可复核';
  return '可回退';
}

function buildTaskSignal(task: TaskListItemRecord | null): string {
  if (!task) return '这条决策没有匹配到当前任务，仍可在这里处理。';
  if (task.activeBlocker) return `阻塞：${task.activeBlocker.title}`;
  if (task.activeDependency) return `依赖：${task.activeDependency.blockedByTaskTitle ?? task.activeDependency.blockedByTaskId}`;
  if (task.activeWaitingItem) return `等待：${task.activeWaitingItem.reason}`;
  if (task.nextStep) return `下一步：${task.nextStep}`;
  return task.summary ?? '暂无更多任务上下文。';
}

function formatTaskState(state: TaskListItemRecord['state']): string {
  const labels: Record<TaskListItemRecord['state'], string> = {
    captured: '待明确',
    triaged: '已整理',
    planned: '推进中',
    running: '执行中',
    waiting_external: '等待中',
    completed: '已完成',
    archived: '已归档',
  };
  return labels[state];
}

function formatDecisionType(sourceType: DecisionRecord['sourceType']): string {
  if (sourceType === 'agent_checkpoint') return 'Agent 检查点';
  if (sourceType === 'external_access') return '外部授权';
  if (sourceType === 'workspace') return '工作区操作';
  if (sourceType === 'run') return '执行记录';
  if (sourceType === 'tool') return '工具调用';
  if (sourceType === 'system') return '系统事项';
  return '人工决策';
}

function formatDecisionDate(value: string): string {
  return value.slice(0, 10);
}

interface DecisionsPageProps {
  onOpenPanel: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}

export function DecisionsPage({ onOpenPanel, onOpenTask }: DecisionsPageProps) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKey, setFilterKey] = useState<DecisionFilterKey>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.api) { setLoading(false); return; }
    let cancelled = false;
    function reload() {
      setLoading(true);
      Promise.all([
        window.api!.listDecisions(),
        window.api!.listTasks?.() ?? Promise.resolve([]),
      ])
        .then(([records, tasks]) => {
          if (cancelled) return;
          const tasksById = new Map(tasks.map((task) => [task.id, task]));
          setDecisions(records
            .filter((r) => r.status === 'pending')
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((record) => fromRecord(record, record.taskId ? tasksById.get(record.taskId) ?? null : null)));
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
    setDecisions((prev) => prev.filter((d) => d.id !== id));
    window.api?.actOnDecision({ id, action }).catch(() => {});
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
