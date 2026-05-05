import { useState, useEffect } from 'react';
import type { TaskDetail } from '@shared/types/task';
import type { RunRecord, RunDetailRecord } from '@shared/types/run';
import type { SourceContextRecord } from '@shared/types/source-context';
import type { ArtifactRecord, ArtifactKind } from '@shared/types/artifact';

type WorkbenchTab = 'runs' | 'sources' | 'artifacts' | 'activity';

const TAB_LABELS: Record<WorkbenchTab, string> = {
  runs:      '执行',
  sources:   '来源',
  artifacts: '产物',
  activity:  '活动',
};

const LANE_LABELS: Record<string, string> = {
  escalate: 'Escalate now',
  unblock:  'Unblock or decide',
  continue: 'Continue or review',
  clarify:  'Clarify',
  steady:   'Steady',
};

function deriveLane(detail: TaskDetail): string {
  if (detail.riskLevel === 'high') return 'escalate';
  if (detail.activeBlocker || detail.state === 'waiting_external') return 'unblock';
  if (detail.state === 'running') return 'continue';
  if (detail.state === 'captured') return 'clarify';
  if (detail.riskLevel === 'medium') return 'unblock';
  return 'continue';
}

function deriveStatus(detail: TaskDetail): string {
  if (detail.state === 'running') return 'running';
  if (detail.state === 'waiting_external') return 'waiting';
  if (detail.state === 'completed') return 'completed';
  return 'idle';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface WorkbenchPageProps {
  taskId: string;
  onBack: () => void;
  onOpenPanel: () => void;
}

export function WorkbenchPage({ taskId, onBack, onOpenPanel }: WorkbenchPageProps) {
  const [tab, setTab] = useState<WorkbenchTab>('runs');
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [activeRunDetail, setActiveRunDetail] = useState<RunDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);

  function loadRuns() {
    return window.api?.listRuns().then((all) => {
      const taskRuns = all.filter((r) => r.taskId === taskId).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRuns(taskRuns);
      const active = taskRuns.find((r) => r.status === 'running' || r.status === 'paused');
      if (active && window.api?.getRunDetail) {
        window.api.getRunDetail(active.id).then((rd) => {
          if (rd) setActiveRunDetail(rd);
          else setActiveRunDetail(null);
        }).catch(() => {});
      } else {
        setActiveRunDetail(null);
      }
    }).catch(() => {});
  }

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setRuns([]);
    setActiveRunDetail(null);

    const loadDetail = window.api?.getTaskDetail(taskId).then((d) => {
      if (d) setDetail(d);
    }).catch(() => {});

    Promise.allSettled([loadDetail, loadRuns()].filter(Boolean)).finally(() => setLoading(false));

    // Subscribe to run.changed and task.changed events for live updates
    const unsub = window.api?.subscribeToEvents((event) => {
      if (event.type === 'run.changed') {
        void loadRuns();
      }
      if (event.type === 'task.changed' && (!event.entityId || event.entityId === taskId)) {
        window.api?.getTaskDetail(taskId).then((d) => { if (d) setDetail(d); }).catch(() => {});
      }
    });

    return () => { unsub?.(); };
  }, [taskId]);

  const lane = detail ? deriveLane(detail) : 'continue';
  const status = detail ? deriveStatus(detail) : 'idle';
  const title = detail?.title ?? taskId;
  const resume = detail?.resumeCard;

  const activeRun = runs.find((r) => r.status === 'running' || r.status === 'paused');

  function startEditingTitle() {
    setTitleDraft(detail?.title ?? '');
    setEditingTitle(true);
  }

  async function commitTitle() {
    const t = titleDraft.trim();
    setEditingTitle(false);
    if (!t || t === detail?.title) return;
    setDetail((d) => d ? { ...d, title: t } : d);
    window.api?.updateTask({ id: taskId, title: t }).catch(() => {
      window.api?.getTaskDetail(taskId).then((d) => { if (d) setDetail(d); }).catch(() => {});
    });
  }

  async function transitionTo(nextState: 'completed' | 'archived') {
    setMoreOpen(false);
    await window.api?.transitionTask({ id: taskId, nextState }).catch(() => {});
    onBack();
  }

  return (
    <div className="workbench" onClick={() => setMoreOpen(false)}>
      {/* Header */}
      <div className="workbench-header">
        <div className="workbench-header-top">
          <div className="workbench-title-row">
            {loading ? (
              <h2 className="workbench-title muted">加载中…</h2>
            ) : editingTitle ? (
              <input
                className="workbench-title-input"
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void commitTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void commitTitle(); }
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
              />
            ) : (
              <h2 className="workbench-title editable" onClick={startEditingTitle} title="点击编辑标题">
                {title}
              </h2>
            )}
            <div className="workbench-header-tags">
              <span className={`tag lane-${lane}`}>{LANE_LABELS[lane]}</span>
              <StatusBadge status={status} />
            </div>
          </div>
          <div className="workbench-header-actions">
            <button className="icon-btn" onClick={onOpenPanel} title="AI 面板">
              <IconChat />
            </button>
            <button className="icon-btn" title="编辑详情" onClick={(e) => { e.stopPropagation(); setShowEditPanel((v) => !v); }}>
              <IconEdit />
            </button>
            <div className="more-wrap" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn" title="更多操作" onClick={() => setMoreOpen((v) => !v)}>
                <IconMore />
              </button>
              {moreOpen && (
                <div className="more-menu">
                  <button className="more-menu-item" onClick={() => { setMoreOpen(false); onOpenPanel(); }}>规划讨论</button>
                  <button className="more-menu-item" onClick={() => void transitionTo('completed')}>标记完成</button>
                  <button className="more-menu-item danger" onClick={() => void transitionTo('archived')}>归档任务</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Inline edit panel */}
        {showEditPanel && detail && (
          <TaskEditPanel
            detail={detail}
            onSave={(patch) => {
              setDetail((d) => d ? { ...d, ...patch } : d);
              window.api?.updateTask({ id: taskId, ...patch }).catch(() => {});
              setShowEditPanel(false);
            }}
            onClose={() => setShowEditPanel(false)}
          />
        )}
      </div>

      {/* Resume Card */}
      <div className="resume-card">
        <div className="resume-narrative">
          {resume ? (
            <>
              <p>{resume.summary}</p>
              {resume.nextSuggestedMove && (
                <p className="resume-context">{resume.nextSuggestedMove}</p>
              )}
            </>
          ) : detail ? (
            <>
              <p>
                {status === 'running'
                  ? '当前有活跃 Run 正在执行中。'
                  : status === 'waiting'
                  ? `任务等待中——${detail.waitingReason ?? '等待外部输入'}。`
                  : `任务当前处于待处理状态。${detail.nextStep ? `下一步：${detail.nextStep}` : ''}`}
              </p>
              {detail.activeBlocker && (
                <p className="resume-context">阻塞：{detail.activeBlocker.title}</p>
              )}
            </>
          ) : (
            <p className="muted">加载任务详情中…</p>
          )}
        </div>

        <div className="resume-card-footer">
          <div className="resume-actions">
            <button className="btn primary" onClick={() => setTab('runs')}>
              {activeRun ? '查看进度 →' : lane === 'unblock' ? '去拍板 →' : '启动 Run →'}
            </button>
            {!activeRun && (
              <button className="btn ghost" onClick={onOpenPanel}>规划讨论</button>
            )}
          </div>
          <button className="btn sm ghost resume-regen" disabled title="即将支持">
            <IconRefresh /> 重新生成
          </button>
        </div>

        {activeRun && (
          <div className="run-progress">
            <div className="run-progress-bar">
              <div className="run-progress-fill" style={{ width: activeRunProgress(activeRunDetail) }} />
            </div>
            <span className="run-progress-label">
              {activeRunLabel(activeRunDetail)}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="workbench-tabs">
        {(Object.keys(TAB_LABELS) as WorkbenchTab[]).map((t) => (
          <button
            key={t}
            className={`workbench-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="workbench-body">
        {tab === 'runs' && (
          <RunsTab
            taskId={taskId}
            runs={runs}
            activeRunDetail={activeRunDetail}
          />
        )}
        {tab === 'sources' && <SourcesTab taskId={taskId} sources={detail?.sourceContexts ?? []} onAdded={(sc) => setDetail((d) => d ? { ...d, sourceContexts: [...d.sourceContexts, sc] } : d)} />}
        {tab === 'artifacts' && <ArtifactsTab artifacts={detail?.artifacts ?? []} />}
        {tab === 'activity' && <ActivityTab timeline={detail?.timeline ?? []} />}
      </div>
    </div>
  );
}

function activeRunProgress(rd: RunDetailRecord | null): string {
  if (!rd?.steps?.length) return '20%';
  const done = rd.steps.filter((s) => s.status === 'completed').length;
  return `${Math.round((done / rd.steps.length) * 100)}%`;
}

function activeRunLabel(rd: RunDetailRecord | null): string {
  if (!rd?.steps?.length) return 'Running…';
  const done = rd.steps.filter((s) => s.status === 'completed').length;
  const total = rd.steps.length;
  const current = rd.steps.find((s) => s.status === 'running');
  return `步骤 ${done + 1} / ${total}${current ? ` · ${current.title}` : ''}`;
}

/* ─── Status badge ─── */

function StatusBadge({ status }: { status: string }) {
  if (status === 'running') return (
    <span className="tag running"><span className="dot running" style={{ width: 5, height: 5 }} /> Running</span>
  );
  if (status === 'waiting') return (
    <span className="tag waiting"><span className="dot waiting" style={{ width: 5, height: 5 }} /> 等待中</span>
  );
  return null;
}

/* ─── Runs tab ─── */

function RunsTab({
  taskId,
  runs,
  activeRunDetail,
}: {
  taskId: string;
  runs: RunRecord[];
  activeRunDetail: RunDetailRecord | null;
}) {
  const active = runs.find((r) => r.status === 'running' || r.status === 'paused');
  const historical = runs.filter((r) => r !== active);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [showRunForm, setShowRunForm] = useState(false);
  const [runNote, setRunNote] = useState('');
  const [triggering, setTriggering] = useState(false);

  async function triggerNewRun() {
    if (!window.api || triggering) return;
    setTriggering(true);
    try {
      await window.api.triggerRun({ taskId, type: 'agent' });
      setShowRunForm(false);
      setRunNote('');
    } catch (e) {
      console.error('Failed to trigger run', e);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="tab-content">
      {active && (
        <div className="run-item run-active">
          <div className="run-item-header">
            <span className="dot running" />
            <span className="run-item-name">Run · {active.status === 'paused' ? '暂停中' : '执行中'}</span>
            <span className="run-item-time muted">{formatDate(active.createdAt)}</span>
          </div>
          {activeRunDetail?.steps && activeRunDetail.steps.length > 0 && (
            <div className="run-steps">
              {activeRunDetail.steps.map((step) => (
                <RunStep
                  key={step.id}
                  label={step.title}
                  done={step.status === 'completed'}
                  active={step.status === 'running'}
                  pending={step.status === 'pending'}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {historical.map((r, i) => {
        const isExpanded = expandedRunId === r.id;
        const runNum = runs.length - i - (active ? 1 : 0);
        return (
          <div key={r.id} className={`run-item${isExpanded ? ' expanded' : ''}`}>
            <div className="run-item-header" style={{ cursor: 'pointer' }} onClick={() => setExpandedRunId(isExpanded ? null : r.id)}>
              <span className={`dot ${r.status === 'completed' ? 'completed' : r.status === 'failed' ? 'risk' : ''}`} />
              <span className="run-item-name">
                Run #{runNum} · {
                  r.status === 'completed' ? '已完成' :
                  r.status === 'failed' ? '失败' :
                  r.status === 'needs_confirmation' ? '等待确认' : r.status
                }
              </span>
              <span className="run-item-time muted">{formatDate(r.updatedAt)}</span>
              <span className="skill-expand-arrow" style={{ marginLeft: 4 }}>{isExpanded ? '▴' : '▾'}</span>
            </div>
            {isExpanded && (
              <div className="run-item-detail">
                {r.output ? (
                  <pre className="run-item-full-output">{r.output}</pre>
                ) : (
                  <p className="muted" style={{ fontSize: 12 }}>此 Run 没有输出记录。</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {runs.length === 0 && !showRunForm && (
        <div className="tab-empty">还没有 Run 记录。</div>
      )}

      {!active && (
        showRunForm ? (
          <div className="run-trigger-form">
            <textarea
              className="run-trigger-input"
              placeholder="给 AI 的指令（可选）— 留空则由 AI 根据任务上下文自主决定"
              value={runNote}
              rows={3}
              autoFocus
              onChange={(e) => setRunNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowRunForm(false); }}
            />
            <div className="run-trigger-actions">
              <button
                className={`btn sm primary${triggering ? ' disabled' : ''}`}
                onClick={() => void triggerNewRun()}
                disabled={triggering}
              >
                {triggering ? '启动中…' : '启动 Run'}
              </button>
              <button className="btn sm ghost" onClick={() => setShowRunForm(false)}>取消</button>
            </div>
          </div>
        ) : (
          <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setShowRunForm(true)}>
            + 新建 Run
          </button>
        )
      )}
    </div>
  );
}

function RunStep({ label, done, active, pending }: {
  label: string; done?: boolean; active?: boolean; pending?: boolean;
}) {
  return (
    <div className={`run-step${active ? ' active' : done ? ' done' : ' pending'}`}>
      <span className="run-step-dot">
        {done ? '✓' : active ? '●' : '○'}
      </span>
      <span className="run-step-label">{label}</span>
      {active && <span className="dot running" style={{ marginLeft: 'auto' }} />}
    </div>
  );
}

/* ─── Sources tab ─── */

function SourcesTab({
  taskId,
  sources,
  onAdded,
}: {
  taskId: string;
  sources: { id: string; title: string; kind: string; updatedAt: string; uri?: string | null }[];
  onAdded: (sc: SourceContextRecord) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [uri, setUri] = useState('');
  const [kind, setKind] = useState<'link' | 'doc' | 'note'>('link');
  const [saving, setSaving] = useState(false);

  async function addSource() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      if (window.api) {
        const created = await window.api.createSourceContext({ taskId, title: t, kind, uri: uri.trim() || null });
        onAdded(created);
      }
      setTitle(''); setUri(''); setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tab-content">
      {sources.length === 0 && !showForm && (
        <div className="tab-empty">暂无来源文件。</div>
      )}
      {sources.map((s) => (
        <div key={s.id} className="source-item">
          <span className="tag captured">{s.kind.toUpperCase()}</span>
          <span className="source-label">{s.title}</span>
          {s.uri && <a className="source-uri muted" href={s.uri} target="_blank" rel="noreferrer">{s.uri.slice(0, 40)}…</a>}
          <span className="muted" style={{ marginLeft: 'auto', flexShrink: 0 }}>{formatDate(s.updatedAt)}</span>
        </div>
      ))}
      {showForm ? (
        <div className="source-add-form">
          <select className="source-kind-select" value={kind} onChange={(e) => setKind(e.target.value as 'link' | 'doc' | 'note')}>
            <option value="link">链接</option>
            <option value="doc">文档</option>
            <option value="note">备注</option>
          </select>
          <input className="settings-input" placeholder="来源标题" value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addSource(); if (e.key === 'Escape') setShowForm(false); }} autoFocus />
          {kind === 'link' && (
            <input className="settings-input" placeholder="URL（可选）" value={uri} onChange={(e) => setUri(e.target.value)} />
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn sm primary${saving ? ' disabled' : ''}`} onClick={() => void addSource()} disabled={!title.trim() || saving}>
              {saving ? '添加中…' : '添加'}
            </button>
            <button className="btn sm ghost" onClick={() => { setShowForm(false); setTitle(''); setUri(''); }}>取消</button>
          </div>
        </div>
      ) : (
        <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setShowForm(true)}>+ 添加来源</button>
      )}
    </div>
  );
}

/* ─── Artifacts tab ─── */

const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {
  run_output:       '运行输出',
  note:             '笔记',
  patch:            '代码改动',
  browser_evidence: '浏览器截图',
};

function ArtifactsTab({ artifacts }: { artifacts: ArtifactRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="tab-content">
      {artifacts.length === 0 && (
        <div className="tab-empty">暂无产物文件。Run 完成后产出的内容会出现在这里。</div>
      )}
      {artifacts.map((a) => (
        <div key={a.id} className={`artifact-item${expandedId === a.id ? ' expanded' : ''}`}>
          <div className="artifact-header" onClick={() => setExpandedId((p) => p === a.id ? null : a.id)}>
            <span className="tag">{ARTIFACT_KIND_LABELS[a.kind as ArtifactKind] ?? a.kind}</span>
            <span className="artifact-title">{a.title ?? a.id}</span>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{formatDate(a.createdAt)}</span>
            <span className={`skill-expand-arrow${expandedId === a.id ? ' open' : ''}`}>›</span>
          </div>
          {expandedId === a.id && a.content && (
            <div className="artifact-body">
              <pre className="artifact-content">{a.content}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Activity tab ─── */

const EVENT_LABELS: Record<string, (payload: string | null) => string> = {
  'task.created':              () => '任务已创建',
  'task.updated':              () => '任务信息已更新',
  'task.next_step_changed':    (p) => p ? `下一步：${p.slice(0, 40)}` : '下一步已更新',
  'task.waiting_changed':      (p) => p ? `等待：${p.slice(0, 40)}` : '等待状态已变更',
  'task.risk_changed':         (p) => p ? `风险等级：${p}` : '风险等级已变更',
  'task.transitioned':         (p) => p ? `状态变更 → ${p}` : '任务状态已变更',
  'run.created':               () => 'AI 开始执行',
  'run.completed':             () => 'AI 执行完成',
  'run.failed':                () => 'AI 执行失败',
  'source_context.created':    (p) => p ? `上下文已添加：${p.slice(0, 40)}` : '上下文已添加',
  'source_context.updated':    (p) => p ? `上下文已更新：${p.slice(0, 40)}` : '上下文已更新',
  'task_dependency.created':   (p) => p ? `新增依赖：${p.slice(0, 40)}` : '新增任务依赖',
  'task_dependency.resolved':  () => '依赖已解除',
  'blocker.created':           (p) => p ? `阻塞：${p.slice(0, 40)}` : '发现阻塞项',
  'blocker.resolved':          () => '阻塞已解除',
  'decision.created':          () => 'AI 提交决策请求',
  'decision.acted':            () => '决策已拍板',
};

function formatEventLabel(type: string, payload: string | null): string {
  const formatter = EVENT_LABELS[type];
  if (formatter) return formatter(payload);
  return type.replace(/\./g, ' › ');
}

function eventDotClass(type: string): string {
  if (type.startsWith('run.')) return 'running';
  if (type.includes('blocker') || type.includes('failed')) return 'risk';
  if (type.includes('waiting')) return 'waiting';
  return '';
}

function ActivityTab({ timeline }: { timeline: { id: string; type: string; payload: string | null; createdAt: string }[] }) {
  return (
    <div className="tab-content">
      {timeline.length === 0 && (
        <div className="tab-empty">暂无活动记录。</div>
      )}
      <div className="activity-list">
        {timeline.slice().reverse().map((e) => (
          <div key={e.id} className="activity-item">
            <div className="activity-dot-wrap">
              <span className={`dot ${eventDotClass(e.type)}`} style={{ width: 7, height: 7 }} />
              <div className="activity-line" />
            </div>
            <div className="activity-body">
              <span className="activity-text">{formatEventLabel(e.type, e.payload)}</span>
              <span className="activity-time muted">
                {new Date(e.createdAt).toLocaleString('zh', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Icons ─── */

function IconChat() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2H2a.5.5 0 0 0-.5.5v7A.5.5 0 0 0 2 10h2v2.5l3-2.5h5a.5.5 0 0 0 .5-.5v-7A.5.5 0 0 0 12 2z" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="3" cy="7" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="7" cy="7" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6a5 5 0 1 0 1-3" />
      <polyline points="1,1 1,4 4,4" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" />
    </svg>
  );
}

/* ─── Task Edit Panel ─── */

function TaskEditPanel({
  detail,
  onSave,
  onClose,
}: {
  detail: TaskDetail;
  onSave: (patch: { summary?: string | null; nextStep?: string | null; riskLevel?: 'none' | 'low' | 'medium' | 'high' }) => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState(detail.summary ?? '');
  const [nextStep, setNextStep] = useState(detail.nextStep ?? '');
  const [riskLevel, setRiskLevel] = useState(detail.riskLevel);

  return (
    <div className="task-edit-panel">
      <div className="task-edit-row">
        <label className="task-edit-label">任务摘要</label>
        <textarea
          className="task-edit-textarea"
          rows={3}
          value={summary}
          placeholder="简要描述任务的目标和背景…"
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>
      <div className="task-edit-row">
        <label className="task-edit-label">下一步行动</label>
        <input
          className="settings-input"
          value={nextStep}
          placeholder="明确的下一步行动…"
          onChange={(e) => setNextStep(e.target.value)}
        />
      </div>
      <div className="task-edit-row">
        <label className="task-edit-label">
          已承诺
          <span className="settings-hint" style={{ marginLeft: 6, fontSize: 10 }}>即将支持</span>
        </label>
        <input
          className="settings-input"
          disabled
          placeholder="例：向客户承诺 3/20 前交付初稿"
          title="即将支持"
        />
        <span className="settings-hint">填写后任务出现在「已承诺」视角，AI 将其视为高优先级</span>
      </div>
      <div className="task-edit-row">
        <label className="task-edit-label">风险等级</label>
        <div className="task-edit-risk-row">
          {(['none', 'low', 'medium', 'high'] as const).map((level) => (
            <button
              key={level}
              className={`task-edit-risk-btn${riskLevel === level ? ' active' : ''}`}
              onClick={() => setRiskLevel(level)}
            >
              {level === 'none' ? '无' : level === 'low' ? '低' : level === 'medium' ? '中' : '高'}
            </button>
          ))}
        </div>
      </div>
      <div className="task-edit-actions">
        <button
          className="btn sm primary"
          onClick={() => onSave({ summary: summary || null, nextStep: nextStep || null, riskLevel })}
        >
          保存
        </button>
        <button className="btn sm ghost" onClick={onClose}>取消</button>
      </div>
    </div>
  );
}
