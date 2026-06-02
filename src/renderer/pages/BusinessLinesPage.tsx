import { useEffect, useMemo, useState } from 'react';
import {
  buildBusinessLineCreationDraft,
  normalizeBusinessLineCreationLines,
} from '@shared/business-line-creation-template';
import type {
  BusinessLineCreationTemplate,
  BusinessLineListItem,
  BusinessLineRecord,
  BusinessLineWorkspace,
  CreateBusinessLineInput,
} from '@shared/types/business-line';

type Tab = 'overview' | 'records' | 'next-actions' | 'learning' | 'settings';

interface BusinessLinesPageProps {
  onOpenBusinessLinePanel: (
    businessLineId: string,
    businessLineTitle: string,
    draftPrompt?: string,
    taskId?: string | null,
    taskTitle?: string | null,
    autoSendDraftPrompt?: boolean,
  ) => void;
  onOpenTask: (taskId: string) => void;
  focusBusinessLineId?: string | null;
}

export function BusinessLinesPage({ onOpenBusinessLinePanel, onOpenTask, focusBusinessLineId }: BusinessLinesPageProps) {
  const [businessLines, setBusinessLines] = useState<BusinessLineListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(focusBusinessLineId ?? null);
  const [workspace, setWorkspace] = useState<BusinessLineWorkspace | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function loadBusinessLines(selectId?: string | null) {
    if (!window.api?.listBusinessLines) {
      setLoading(false);
      return;
    }
    const lines = await window.api.listBusinessLines();
    setBusinessLines(lines);
    setSelectedId((current) => selectId ?? focusBusinessLineId ?? current ?? lines[0]?.id ?? null);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    loadBusinessLines().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <button className="btn sm primary" onClick={() => setCreating(true)}>
            新建
          </button>
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
        {creating && (
          <BusinessLineCreationPanel
            existingLines={businessLines}
            onCancel={() => setCreating(false)}
            onCreated={async (nextWorkspace) => {
              setCreating(false);
              setWorkspace(nextWorkspace);
              setSelectedId(nextWorkspace.businessLine.id);
              setTab('overview');
              await loadBusinessLines(nextWorkspace.businessLine.id);
            }}
          />
        )}

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
              <button className={`business-tab secondary${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>
                Settings
              </button>
            </div>

            {tab === 'overview' && (
              <OverviewTab workspace={workspace} onOpenBusinessLinePanel={onOpenBusinessLinePanel} />
            )}
            {tab === 'records' && (
              <RecordsTab workspace={workspace} />
            )}
            {tab === 'next-actions' && (
              <NextActionsTab workspace={workspace} onOpenBusinessLinePanel={onOpenBusinessLinePanel} onOpenTask={onOpenTask} />
            )}
            {tab === 'learning' && (
              <LearningTab workspace={workspace} onWorkspace={setWorkspace} />
            )}
            {tab === 'settings' && (
              <BusinessLineSettingsTab workspace={workspace} onOpenTask={onOpenTask} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BusinessLineSettingsTab({ workspace, onOpenTask }: {
  workspace: BusinessLineWorkspace;
  onOpenTask: BusinessLinesPageProps['onOpenTask'];
}) {
  return (
    <div className="business-section">
      <h3>Settings</h3>
      <div className="business-settings-list">
        <div>
          <span>Business line id</span>
          <strong>{workspace.businessLine.id}</strong>
        </div>
        <div>
          <span>Kind</span>
          <strong>{workspace.businessLine.kind}</strong>
        </div>
        <div>
          <span>Goal</span>
          <strong>{workspace.businessLine.goal ?? workspace.businessLine.summary ?? 'Not set'}</strong>
        </div>
        <div>
          <span>Legacy recovery</span>
          {workspace.businessLine.legacyTaskId ? (
            <button className="link-button" onClick={() => onOpenTask(workspace.businessLine.legacyTaskId!)}>
              Open legacy task detail
            </button>
          ) : (
            <strong>Canonical business line</strong>
          )}
        </div>
      </div>
    </div>
  );
}

function BusinessLineCreationPanel({ existingLines, onCancel, onCreated }: {
  existingLines: BusinessLineListItem[];
  onCancel: () => void;
  onCreated: (workspace: BusinessLineWorkspace) => void | Promise<void>;
}) {
  const [template, setTemplate] = useState<BusinessLineCreationTemplate>('web_product');
  const [title, setTitle] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [continuousInformation, setContinuousInformation] = useState('');
  const [aiWorkAndConfirmation, setAiWorkAndConfirmation] = useState('');
  const [sourceBusinessLineId, setSourceBusinessLineId] = useState('');
  const [initialStructure, setInitialStructure] = useState('');
  const [initialRecords, setInitialRecords] = useState('');
  const [reviewPrompts, setReviewPrompts] = useState('');
  const [proposedSops, setProposedSops] = useState('');
  const [initialNextActions, setInitialNextActions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const selectedSourceBusinessLine = existingLines.find((line) => line.id === sourceBusinessLineId) ?? null;

  function generateDraft() {
    const draft = buildBusinessLineCreationDraft({
      aiWorkAndConfirmation,
      continuousInformation,
      desiredOutcome,
      template,
      title,
    });
    setInitialStructure(draft.initialStructure.join('\n'));
    setInitialRecords(draft.initialRecords.join('\n'));
    setReviewPrompts(draft.reviewPrompts.join('\n'));
    setProposedSops(draft.proposedSops.join('\n'));
    setInitialNextActions(draft.initialNextActions.join('\n'));
  }

  async function submit() {
    if (!window.api?.createBusinessLine || !title.trim()) return;
    setSubmitting(true);
    try {
      const draft = buildBusinessLineCreationDraft({
        aiWorkAndConfirmation,
        continuousInformation,
        desiredOutcome,
        template,
        title,
      });
      const input: CreateBusinessLineInput = {
        title: title.trim(),
        summary: continuousInformation.trim() || null,
        goal: desiredOutcome.trim() || null,
        kind: template === 'web_product' ? 'software_product' : 'general',
        template,
        desiredOutcome,
        continuousInformation,
        aiWorkAndConfirmation,
        sourceBusinessLineId: sourceBusinessLineId || null,
        initialStructure: normalizeBusinessLineCreationLines(initialStructure ? initialStructure.split('\n') : draft.initialStructure),
        initialRecords: normalizeBusinessLineCreationLines(initialRecords ? initialRecords.split('\n') : draft.initialRecords),
        reviewPrompts: normalizeBusinessLineCreationLines(reviewPrompts ? reviewPrompts.split('\n') : draft.reviewPrompts),
        proposedSops: normalizeBusinessLineCreationLines(proposedSops ? proposedSops.split('\n') : draft.proposedSops),
        initialNextActions: normalizeBusinessLineCreationLines(initialNextActions ? initialNextActions.split('\n') : draft.initialNextActions),
      };
      const workspace = await window.api.createBusinessLine(input);
      await onCreated(workspace);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="business-section business-create-panel">
      <div className="business-create-head">
        <div>
          <div className="page-kicker">Create Business Line</div>
          <h3>新建业务线</h3>
        </div>
        <button className="btn sm" onClick={onCancel}>取消</button>
      </div>
      <div className="business-create-grid">
        <label>
          Template
          <select value={template} onChange={(event) => setTemplate(event.target.value as BusinessLineCreationTemplate)}>
            <option value="web_product">Web Product / Software Product</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>
          What is this business line?
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="asterism onboarding web app" />
        </label>
        <label>
          What outcome would make it better?
          <textarea value={desiredOutcome} onChange={(event) => setDesiredOutcome(event.target.value)} placeholder="Activation improves from trial to first completed workflow." />
        </label>
        <label>
          What information must be recorded continuously?
          <textarea value={continuousInformation} onChange={(event) => setContinuousInformation(event.target.value)} placeholder="Customer signals, experiments, releases, metrics, risks." />
        </label>
        <label>
          What work can AI do, and what needs confirmation?
          <textarea value={aiWorkAndConfirmation} onChange={(event) => setAiWorkAndConfirmation(event.target.value)} placeholder="AI drafts specs and summaries; publishing/deploy/pricing needs approval." />
        </label>
        <label>
          Is this based on an existing business line's structure or experience?
          <select value={sourceBusinessLineId} onChange={(event) => setSourceBusinessLineId(event.target.value)}>
            <option value="">No existing business line</option>
            {existingLines.map((line) => (
              <option key={line.id} value={line.id}>{line.title}</option>
            ))}
          </select>
        </label>
        {selectedSourceBusinessLine ? (
          <div className="business-create-reference" role="note">
            <strong>Source business line: {selectedSourceBusinessLine.title}</strong>
            <span>
              Reused structure and SOPs are copied as source evidence or proposed learning only; they do not enter active context until accepted.
            </span>
          </div>
        ) : null}
      </div>
      <div className="business-create-actions">
        <button className="btn sm" onClick={generateDraft}>生成初始结构</button>
        <button className="btn sm primary" disabled={!title.trim() || submitting} onClick={submit}>
          创建业务线
        </button>
      </div>
      <div className="business-create-generated">
        <label>
          Initial structure
          <textarea value={initialStructure} onChange={(event) => setInitialStructure(event.target.value)} placeholder="One structure item per line" />
        </label>
        <label>
          Initial records
          <textarea value={initialRecords} onChange={(event) => setInitialRecords(event.target.value)} placeholder="One initial record per line" />
        </label>
        <label>
          Review prompts
          <textarea value={reviewPrompts} onChange={(event) => setReviewPrompts(event.target.value)} placeholder="One review prompt per line" />
        </label>
        <label>
          Proposed SOPs
          <textarea value={proposedSops} onChange={(event) => setProposedSops(event.target.value)} placeholder="One proposed SOP per line" />
        </label>
        <label>
          Initial Next Actions
          <textarea value={initialNextActions} onChange={(event) => setInitialNextActions(event.target.value)} placeholder="One initial next action per line" />
        </label>
      </div>
    </section>
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

function OverviewTab({ workspace, onOpenBusinessLinePanel }: {
  workspace: BusinessLineWorkspace;
  onOpenBusinessLinePanel: BusinessLinesPageProps['onOpenBusinessLinePanel'];
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
            <div className="business-action-buttons">
              {suggestion.taskId && (
                <button
                  className="btn sm primary"
                  onClick={() => onOpenBusinessLinePanel(
                    workspace.businessLine.id,
                    workspace.businessLine.title,
                    `开始执行当前 Next Action。\n\n业务线：${workspace.businessLine.title}\n为什么现在：${suggestion.whyNow}\n下一步：${suggestion.nextStep}\n\n完成后请返回可复盘的结果、证据和可能的待确认写入建议（TASKPLANE_WRITE_INTENTS）。`,
                    suggestion.taskId,
                    suggestion.nextStep,
                    true,
                  )}
                >
                  执行
                </button>
              )}
              <button
                className="btn sm"
                onClick={() => onOpenBusinessLinePanel(
                  workspace.businessLine.id,
                  workspace.businessLine.title,
                  `请推进这个业务线 Next Action，并在完成后准备 post-action review。\n\n业务线：${workspace.businessLine.title}\n为什么现在：${suggestion.whyNow}\n下一步：${suggestion.nextStep}`,
                  suggestion.taskId,
                )}
              >
                AI 协助
              </button>
            </div>
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
        <h3>Automations & Sensors</h3>
        {workspace.automations.automations.length === 0 && workspace.automations.sensors.length === 0 ? (
          <p className="muted">暂无业务线自动化或只读传感器。</p>
        ) : (
          <div className="business-automation-list">
            {workspace.automations.automations.map((automation) => (
              <div key={automation.id} className="business-automation">
                <div className="business-record-header">
                  <span className="tag">{automation.kind}</span>
                  <span className={`risk-pill risk-${automation.risk.level}`}>{automation.risk.level}</span>
                </div>
                <strong>{automation.title}</strong>
                <span>{automation.triggerLabel} · {automation.status}</span>
              </div>
            ))}
            {workspace.automations.sensors.map((sensor) => (
              <div key={sensor.id} className="business-automation">
                <div className="business-record-header">
                  <span className="tag">read-only</span>
                  <span className="risk-pill risk-low">{sensor.status}</span>
                </div>
                <strong>{sensor.title}</strong>
                <span>{sensor.reviewBoundary}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="business-section">
        <h3>Missing Context</h3>
        <CompactList items={workspace.overview.missingContext} empty="当前 context pack 足够推进下一步。" />
      </section>
    </div>
  );
}

function RecordsTab({ workspace }: { workspace: BusinessLineWorkspace }) {
  const records: BusinessLineRecord[] = workspace.records;
  return (
    <div className="business-section">
      <h3>Records</h3>
      <div className="business-record-list">
        {records.map((record) => (
          <div key={`${record.type}:${record.id}`} className="business-record">
            <div className="business-record-header">
              <span className="tag">{record.type}</span>
              <span className={record.shouldAffectFutureContext ? 'tag success' : 'tag muted-tag'}>
                {record.shouldAffectFutureContext ? 'future context' : 'memory only'}
              </span>
            </div>
            <p>{record.summary}</p>
            <small>
              {record.provenance?.sourceLabel ?? record.source}
              {record.provenance?.sourceBusinessLineId ? ` · Source business line: ${record.provenance.sourceBusinessLineTitle ?? record.provenance.sourceBusinessLineId}` : ''}
              {' · '}
              {record.provenance?.sourceType ?? 'record'}
              {' · confidence '}
              {record.confidence}
            </small>
            {record.futureContextReason && <small>{record.futureContextReason}</small>}
          </div>
        ))}
        {records.length === 0 && <p className="muted">还没有业务线记录。</p>}
      </div>
    </div>
  );
}

function NextActionsTab({ workspace, onOpenBusinessLinePanel, onOpenTask }: {
  workspace: BusinessLineWorkspace;
  onOpenBusinessLinePanel: BusinessLinesPageProps['onOpenBusinessLinePanel'];
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
              <button
                className="btn sm primary"
                onClick={() => onOpenBusinessLinePanel(
                  workspace.businessLine.id,
                  workspace.businessLine.title,
                  `开始执行当前 Next Action。\n\n业务线：${workspace.businessLine.title}\nNext Action：${task.title}\n下一步：${task.nextStep ?? task.summary ?? task.title}\n\n完成后请返回可复盘的结果、证据和可能的待确认写入建议（TASKPLANE_WRITE_INTENTS）。`,
                  task.id,
                  task.title,
                  true,
                )}
              >
                执行
              </button>
              <button
                className="btn sm"
                onClick={() => onOpenBusinessLinePanel(
                  workspace.businessLine.id,
                  workspace.businessLine.title,
                  undefined,
                  task.id,
                  task.title,
                )}
              >
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

  async function updateRevision(action: 'accept' | 'reject' | 'disable' | 'rollback', revisionId: string) {
    if (action === 'accept' && window.api?.acceptBusinessLineSkillRevision) {
      onWorkspace(await window.api.acceptBusinessLineSkillRevision({ revisionId }));
    }
    if (action === 'reject' && window.api?.rejectBusinessLineSkillRevision) {
      onWorkspace(await window.api.rejectBusinessLineSkillRevision({ revisionId }));
    }
    if (action === 'disable' && window.api?.disableBusinessLineSkillRevision) {
      onWorkspace(await window.api.disableBusinessLineSkillRevision({ revisionId }));
    }
    if (action === 'rollback' && window.api?.rollbackBusinessLineSkillRevision) {
      onWorkspace(await window.api.rollbackBusinessLineSkillRevision({ revisionId }));
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
              <div className="business-record-header">
                <span className="tag">{revision.status}</span>
                {revision.requiresDecision && <span className="tag decision">Decision</span>}
                {revision.needsReview && <span className="tag waiting">review due</span>}
                {revision.isExpired && <span className="tag muted-tag">expired</span>}
              </div>
              <p>{revision.nextContent}</p>
              <small>{revision.changeReason}</small>
              <small>
                Source review: {revision.provenance?.sourceReviewSummary ?? revision.sourceReviewId}
                {revision.provenance?.sourceBusinessLineId ? ` · Source business line: ${revision.provenance.sourceBusinessLineTitle ?? revision.provenance.sourceBusinessLineId}` : ''}
                {' · '}
                Scope: {revision.scopePath}
              </small>
              {revision.contentDiff && <small>Diff: {revision.contentDiff}</small>}
              {revision.approvalSourceType && (
                <small>
                  Approval: {revision.approvalSourceType}
                  {revision.approvalSourceId ? ` · ${revision.approvalSourceId}` : ''}
                  {revision.approvedBy ? ` · ${revision.approvedBy}` : ''}
                </small>
              )}
              {revision.rollbackTargetRevisionId && <small>Rollback target: {revision.rollbackTargetRevisionId}</small>}
              {(revision.reviewAfterAt || revision.expiresAt) && (
                <small>
                  {revision.reviewAfterAt ? `Review after ${revision.reviewAfterAt}` : ''}
                  {revision.reviewAfterAt && revision.expiresAt ? ' · ' : ''}
                  {revision.expiresAt ? `Expires ${revision.expiresAt}` : ''}
                </small>
              )}
              {revision.requiresDecision && revision.approvalDecisionStatus !== 'approved' && (
                <small>Decision required before activation: {revision.approvalDecisionStatus ?? 'pending'}</small>
              )}
              {revision.status === 'proposed' && (
                <div className="business-action-buttons">
                  <button
                    className="btn sm"
                    disabled={revision.isExpired || (revision.requiresDecision && revision.approvalDecisionStatus !== 'approved')}
                    title={revision.requiresDecision && revision.approvalDecisionStatus !== 'approved'
                      ? '需要先批准关联 Decision'
                      : '接受这条业务线 SOP revision'}
                    onClick={() => void updateRevision('accept', revision.id)}
                  >
                    接受
                  </button>
                  <button className="btn sm ghost" onClick={() => void updateRevision('reject', revision.id)}>拒绝</button>
                </div>
              )}
              {revision.status === 'active' && (
                <div className="business-action-buttons">
                  <button className="btn sm" onClick={() => void updateRevision('rollback', revision.id)}>回滚</button>
                  <button className="btn sm ghost" onClick={() => void updateRevision('disable', revision.id)}>禁用</button>
                </div>
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
