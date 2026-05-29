import { useEffect, useMemo, useState } from 'react';
import type {
  BusinessLineListItem,
  BusinessLineRecord,
  BusinessLineWorkspace,
} from '@shared/types/business-line';

type Tab = 'overview' | 'records' | 'next-actions' | 'learning';

interface BusinessLinesPageProps {
  onOpenPanel: (taskId: string, draftPrompt?: string, taskTitle?: string, autoSendDraftPrompt?: boolean, forceTaskBinding?: boolean, prefillDraftPrompt?: boolean) => void;
  onOpenTask: (taskId: string) => void;
  focusBusinessLineId?: string | null;
}

export function BusinessLinesPage({ onOpenPanel, onOpenTask, focusBusinessLineId }: BusinessLinesPageProps) {
  const [businessLines, setBusinessLines] = useState<BusinessLineListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(focusBusinessLineId ?? null);
  const [workspace, setWorkspace] = useState<BusinessLineWorkspace | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.api?.listBusinessLines) {
        setLoading(false);
        return;
      }
      const lines = await window.api.listBusinessLines();
      if (cancelled) return;
      setBusinessLines(lines);
      setSelectedId((current) => focusBusinessLineId ?? current ?? lines[0]?.id ?? null);
      setLoading(false);
    }
    load().catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [focusBusinessLineId]);

  useEffect(() => {
    if (!selectedId || !window.api?.getBusinessLineWorkspace) {
      setWorkspace(null);
      return;
    }
    let cancelled = false;
    window.api.getBusinessLineWorkspace(selectedId).then((nextWorkspace) => {
      if (!cancelled) setWorkspace(nextWorkspace);
    }).catch(() => {
      if (!cancelled) setWorkspace(null);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = useMemo(
    () => businessLines.find((line) => line.id === selectedId) ?? null,
    [businessLines, selectedId],
  );

  return (
    <div className="business-page">
      <div className="business-sidebar">
        <div className="business-sidebar-head">
          <div>
            <div className="page-kicker">Business Lines</div>
            <h2>业务线</h2>
          </div>
        </div>
        {loading && <div className="muted small">加载中…</div>}
        <div className="business-line-list">
          {businessLines.map((line) => (
            <button
              key={line.id}
              className={`business-line-item${line.id === selectedId ? ' active' : ''}`}
              onClick={() => {
                setSelectedId(line.id);
                setTab('overview');
              }}
            >
              <span className="business-line-title">{line.title}</span>
              <span className="business-line-meta">
                {line.nextActionCount} next actions · {line.activeSkillCount} SOP
              </span>
              {line.latestRecordSummary && (
                <span className="business-line-latest">{line.latestRecordSummary}</span>
              )}
            </button>
          ))}
          {!loading && businessLines.length === 0 && (
            <div className="business-empty">
              顶层 project / routine task 会自动适配成业务线；也可以稍后从这里创建新的业务线。
            </div>
          )}
        </div>
      </div>

      <div className="business-workspace">
        {!workspace && (
          <div className="business-workspace-empty">
            <h2>{selected?.title ?? '暂无业务线'}</h2>
            <p>创建或导入一个长期 project / routine 后，这里会显示 Overview、Records、Next Actions 和 Learning。</p>
          </div>
        )}

        {workspace && (
          <>
            <div className="business-workspace-head">
              <div>
                <div className="page-kicker">{workspace.businessLine.kind}</div>
                <h1>{workspace.businessLine.title}</h1>
                <p>{workspace.businessLine.goal ?? workspace.businessLine.summary ?? '尚未记录明确目标。'}</p>
              </div>
              {workspace.businessLine.legacyTaskId && (
                <button className="btn sm" onClick={() => onOpenTask(workspace.businessLine.legacyTaskId!)}>
                  打开原任务
                </button>
              )}
            </div>

            <div className="business-tabs">
              <TabButton id="overview" label="Overview" active={tab === 'overview'} onClick={setTab} />
              <TabButton id="records" label="Records" active={tab === 'records'} onClick={setTab} />
              <TabButton id="next-actions" label="Next Actions" active={tab === 'next-actions'} onClick={setTab} />
              <TabButton id="learning" label="Learning" active={tab === 'learning'} onClick={setTab} />
            </div>

            {tab === 'overview' && (
              <OverviewTab workspace={workspace} onOpenPanel={onOpenPanel} />
            )}
            {tab === 'records' && (
              <RecordsTab workspace={workspace} />
            )}
            {tab === 'next-actions' && (
              <NextActionsTab workspace={workspace} onOpenPanel={onOpenPanel} onOpenTask={onOpenTask} />
            )}
            {tab === 'learning' && (
              <LearningTab workspace={workspace} onWorkspace={setWorkspace} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({ id, label, active, onClick }: {
  id: Tab;
  label: string;
  active: boolean;
  onClick: (id: Tab) => void;
}) {
  return (
    <button className={`business-tab${active ? ' active' : ''}`} onClick={() => onClick(id)}>
      {label}
    </button>
  );
}

function OverviewTab({ workspace, onOpenPanel }: {
  workspace: BusinessLineWorkspace;
  onOpenPanel: BusinessLinesPageProps['onOpenPanel'];
}) {
  const suggestion = workspace.overview.nextSuggestion;
  return (
    <div className="business-grid">
      <section className="business-section wide">
        <h3>Current Suggestion</h3>
        {suggestion ? (
          <div className="business-suggestion">
            <div className="business-suggestion-top">
              <span className="tag">{suggestion.type}</span>
              <span className={`risk-pill risk-${suggestion.risk.level}`}>{suggestion.risk.level}</span>
              {suggestion.requiresDecision && <span className="risk-pill risk-medium">Decision</span>}
            </div>
            <h4>{suggestion.nextStep}</h4>
            <p>{suggestion.whyNow}</p>
            <div className="business-source-list">
              {(suggestion.sourceRecords.length > 0 ? suggestion.sourceRecords : ['missing-context']).map((source) => (
                <span key={source}>{source}</span>
              ))}
            </div>
            {suggestion.taskId && (
              <button
                className="btn sm primary"
                onClick={() => onOpenPanel(suggestion.taskId!, `请推进这个业务线 Next Action，并在完成后准备 post-action review。\n\n业务线：${workspace.businessLine.title}\n为什么现在：${suggestion.whyNow}\n下一步：${suggestion.nextStep}`, undefined, false, true, true)}
              >
                推进
              </button>
            )}
          </div>
        ) : (
          <p className="muted">暂无建议。</p>
        )}
      </section>

      <section className="business-section">
        <h3>Recent Changes</h3>
        <CompactList items={workspace.overview.recentChanges} empty="暂无近期变化。" />
      </section>

      <section className="business-section">
        <h3>Missing Context</h3>
        <CompactList items={workspace.overview.missingContext} empty="当前 context pack 足够推进下一步。" />
      </section>
    </div>
  );
}

function RecordsTab({ workspace }: { workspace: BusinessLineWorkspace }) {
  const records: BusinessLineRecord[] = [
    ...workspace.records,
    ...workspace.sourceRecords.map((source) => ({
      id: source.id,
      type: 'signal' as const,
      businessLineId: workspace.businessLine.id,
      source: source.uri ?? source.kind,
      summary: source.note ?? source.content ?? source.title,
      confidence: source.credibility === 'verified' ? 90 : 60,
      linkedActionId: null,
      linkedDecisionId: null,
      shouldAffectFutureContext: source.isKey,
      createdAt: source.createdAt,
    })),
  ];
  return (
    <div className="business-section">
      <h3>Records</h3>
      <div className="business-record-list">
        {records.map((record) => (
          <div key={`${record.type}:${record.id}`} className="business-record">
            <span className="tag">{record.type}</span>
            <p>{record.summary}</p>
            <small>{record.source} · confidence {record.confidence}</small>
          </div>
        ))}
        {records.length === 0 && <p className="muted">还没有业务线记录。</p>}
      </div>
    </div>
  );
}

function NextActionsTab({ workspace, onOpenPanel, onOpenTask }: {
  workspace: BusinessLineWorkspace;
  onOpenPanel: BusinessLinesPageProps['onOpenPanel'];
  onOpenTask: BusinessLinesPageProps['onOpenTask'];
}) {
  return (
    <div className="business-section">
      <h3>Next Actions</h3>
      <div className="business-action-list">
        {workspace.nextActions.map((task) => (
          <div key={task.id} className="business-action">
            <div>
              <strong>{task.title}</strong>
              <p>{task.nextStep ?? task.summary ?? '尚未明确下一步。'}</p>
              <small>{task.state} · risk {task.riskLevel}</small>
            </div>
            <div className="business-action-buttons">
              <button className="btn sm" onClick={() => onOpenTask(task.id)}>详情</button>
              <button className="btn sm primary" onClick={() => onOpenPanel(task.id, undefined, task.title, false, true)}>
                AI 协助
              </button>
            </div>
          </div>
        ))}
        {workspace.nextActions.length === 0 && <p className="muted">没有开放的 Next Actions。</p>}
      </div>
    </div>
  );
}

function LearningTab({ workspace, onWorkspace }: {
  workspace: BusinessLineWorkspace;
  onWorkspace: (workspace: BusinessLineWorkspace) => void;
}) {
  const [resultSummary, setResultSummary] = useState('');
  const [evidence, setEvidence] = useState('');
  const [hypothesisChange, setHypothesisChange] = useState('');
  const [skillSuggestion, setSkillSuggestion] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [requiresDecision, setRequiresDecision] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitReview() {
    if (!window.api?.recordBusinessLineReview || !resultSummary.trim()) return;
    setSubmitting(true);
    try {
      const nextWorkspace = await window.api.recordBusinessLineReview({
        businessLineId: workspace.businessLine.id,
        resultSummary,
        evidenceItems: evidence.split('\n').map((item) => item.trim()).filter(Boolean),
        hypothesisChange: hypothesisChange || null,
        skillUpdateSuggestions: skillSuggestion ? [skillSuggestion] : [],
        nextActionSuggestions: nextAction ? [nextAction] : [],
        confidence: 75,
        requiresDecision,
      });
      onWorkspace(nextWorkspace);
      setResultSummary('');
      setEvidence('');
      setHypothesisChange('');
      setSkillSuggestion('');
      setNextAction('');
      setRequiresDecision(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="business-grid">
      <section className="business-section wide">
        <h3>Post-action Review</h3>
        <div className="business-review-form">
          <textarea value={resultSummary} onChange={(e) => setResultSummary(e.target.value)} placeholder="What changed?" />
          <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidence items, one per line" />
          <input value={hypothesisChange} onChange={(e) => setHypothesisChange(e.target.value)} placeholder="Hypothesis change" />
          <input value={skillSuggestion} onChange={(e) => setSkillSuggestion(e.target.value)} placeholder="Skill/SOP update suggestion" />
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Next action suggestion" />
          <label className="business-check">
            <input type="checkbox" checked={requiresDecision} onChange={(e) => setRequiresDecision(e.target.checked)} />
            Risky update: route through Decisions
          </label>
          <button className="btn sm primary" disabled={!resultSummary.trim() || submitting} onClick={submitReview}>
            记录复盘并提议学习更新
          </button>
        </div>
      </section>

      <section className="business-section">
        <h3>Skill / SOP Revisions</h3>
        <div className="business-record-list">
          {workspace.learning.skillRevisions.map((revision) => (
            <div key={revision.id} className="business-record">
              <span className="tag">{revision.status}</span>
              <p>{revision.nextContent}</p>
              <small>{revision.changeReason}</small>
              {revision.requiresDecision && revision.approvalDecisionStatus !== 'approved' && (
                <small>Decision required before activation: {revision.approvalDecisionStatus ?? 'pending'}</small>
              )}
              {revision.status === 'proposed' && (
                <button
                  className="btn sm"
                  disabled={revision.requiresDecision && revision.approvalDecisionStatus !== 'approved'}
                  title={revision.requiresDecision && revision.approvalDecisionStatus !== 'approved'
                    ? '需要先批准关联 Decision'
                    : '接受这条业务线 SOP revision'}
                  onClick={async () => {
                    if (!window.api?.acceptBusinessLineSkillRevision) return;
                    onWorkspace(await window.api.acceptBusinessLineSkillRevision({ revisionId: revision.id }));
                  }}
                >
                  接受
                </button>
              )}
            </div>
          ))}
          {workspace.learning.skillRevisions.length === 0 && <p className="muted">还没有业务线 SOP revision。</p>}
        </div>
      </section>
    </div>
  );
}

function CompactList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="business-compact-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}
