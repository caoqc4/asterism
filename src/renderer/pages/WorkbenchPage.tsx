import { useState, useEffect } from 'react';
import type { TaskDetail, TaskListItemRecord } from '@shared/types/task';
import type { RunRecord, RunDetailRecord, RunStepRecord, RunVerificationRecord } from '@shared/types/run';
import { evaluateRunSelfCheck, evaluateRunStepSelfCheck, type RunSelfCheckResult } from '@shared/run-self-check';
import type { SourceContextRecord } from '@shared/types/source-context';
import type { ArtifactRecord, ArtifactKind } from '@shared/types/artifact';
import { TaskCompletionCheckModal } from '../components/TaskCompletionCheckModal';
import { recordSopTemplateHabit } from '../lib/workHabits';
import {
  defaultScheduleForType,
  defaultTriggerForType,
  getTaskAttributes,
  loadTaskAttributes,
  moveTaskToProject,
  saveTaskAttributes,
  type TaskAttributeRecord,
  type TaskExecutionType,
} from '../lib/taskAttributes';
import {
  createManualArtifact,
  deleteArtifactWorkspace,
  isInlineEditableArtifact,
  mergeTaskArtifacts,
  updateArtifactWorkspace,
} from '../lib/artifactWorkspace';

type WorkbenchTab = 'runs' | 'sources' | 'artifacts' | 'activity';
type ResumeSignalTone = 'ready' | 'thin';

interface ResumeSignal {
  label: string;
  tone?: ResumeSignalTone;
}

interface ProjectChildSummary {
  id: string;
  title: string;
  state: TaskListItemRecord['state'];
  nextStep: string | null;
  waitingReason: string | null;
  riskLevel: TaskListItemRecord['riskLevel'];
}

const TAB_LABELS: Record<WorkbenchTab, string> = {
  runs:      '执行',
  sources:   '来源',
  artifacts: '产物',
  activity:  '活动',
};

const TASK_TYPE_LABELS: Record<TaskExecutionType, string> = {
  simple:    '一次性',
  project:   '项目型',
  scheduled: '定时任务',
  event:     '事件触发',
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

function buildResumeSignals(params: {
  detail: TaskDetail | null;
  runs: RunRecord[];
  activeRun: RunRecord | null;
}): ResumeSignal[] {
  const { detail, runs, activeRun } = params;
  if (!detail) return [];

  const signals: ResumeSignal[] = [
    { label: `Priority Lane · ${LANE_LABELS[deriveLane(detail)] ?? deriveLane(detail)}` },
  ];
  const keySources = detail.sourceContexts.filter((source) => source.isKey).length;
  const completedCriteria = detail.completionCriteria.filter((criterion) => Boolean(criterion.satisfiedAt)).length;
  const evidenceCount = [
    runs.length > 0,
    keySources > 0,
    detail.timeline.length > 0,
    detail.completionCriteria.length > 0,
  ].filter(Boolean).length;

  if (activeRun) signals.push({ label: activeRun.status === 'paused' ? 'Run 暂停中' : 'Run 执行中' });
  else if (runs.length > 0) signals.push({ label: `Run ${runs.length}` });

  if (keySources > 0) signals.push({ label: `关键来源 ${keySources}` });
  if (detail.completionCriteria.length > 0) {
    signals.push({ label: `完成标准 ${completedCriteria}/${detail.completionCriteria.length}` });
  }
  if (detail.timeline.length > 0) signals.push({ label: `活动 ${detail.timeline.length}` });
  if (evidenceCount < 2) signals.push({ label: '信号不足，先补齐目标', tone: 'thin' });

  return signals;
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
  const [runFormRequest, setRunFormRequest] = useState(0);
  const [showCompletionCheck, setShowCompletionCheck] = useState(false);
  const [showSopExtract, setShowSopExtract] = useState(false);
  const [taskAttrs, setTaskAttrs] = useState<TaskAttributeRecord | null>(() => getTaskAttributes(taskId));
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; title: string }>>([]);
  const [projectChildren, setProjectChildren] = useState<ProjectChildSummary[]>([]);
  const [generatedResume, setGeneratedResume] = useState<{ summary: string; nextSuggestedMove: string; generatedAt: string } | null>(null);

  function loadProjectOptions(records?: TaskListItemRecord[]) {
    const applyRecords = (items: TaskListItemRecord[]) => {
      const attrs = loadTaskAttributes();
      const currentAttrs = attrs[taskId] ?? null;
      setProjectOptions(items
        .filter((task) => task.id !== taskId && attrs[task.id]?.type === 'project' && !attrs[task.id]?.parentTaskId)
        .map((task) => ({ id: task.id, title: task.title })));
      setProjectChildren((currentAttrs?.childTaskIds ?? [])
        .map((id) => items.find((task) => task.id === id))
        .filter((task): task is TaskListItemRecord => Boolean(task))
        .map((task) => ({
          id: task.id,
          title: task.title,
          state: task.state,
          nextStep: task.nextStep,
          waitingReason: task.waitingReason,
          riskLevel: task.riskLevel,
        })));
    };

    if (records) {
      applyRecords(records);
      return;
    }
    window.api?.listTasks?.().then(applyRecords).catch(() => {});
  }

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
    setTaskAttrs(getTaskAttributes(taskId));
    loadProjectOptions();
    setGeneratedResume(null);

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
        loadProjectOptions();
      }
    });

    return () => { unsub?.(); };
  }, [taskId]);

  const lane = detail ? deriveLane(detail) : 'continue';
  const status = detail ? deriveStatus(detail) : 'idle';
  const title = detail?.title ?? taskId;
  const resume = generatedResume ?? detail?.resumeCard;
  const currentProject = taskAttrs?.parentTaskId
    ? projectOptions.find((project) => project.id === taskAttrs.parentTaskId)
    : null;

  const activeRun = runs.find((r) => r.status === 'running' || r.status === 'paused');
  const resumeSignals = buildResumeSignals({ detail, runs, activeRun: activeRun ?? null });

  function regenerateResume() {
    if (!detail) return;
    const recentRun = activeRun ?? runs[0] ?? null;
    const recentRunCheck = recentRun ? evaluateRunSelfCheck(recentRun, activeRunDetail) : null;
    const keySources = detail.sourceContexts.filter((source) => source.isKey).slice(0, 2);
    const typeLabel = taskAttrs ? TASK_TYPE_LABELS[taskAttrs.type] : '一次性';
    const statusLabel = status === 'running'
      ? '正在执行'
      : status === 'waiting'
        ? '等待外部输入'
        : status === 'completed'
          ? '已完成'
          : '待推进';
    const summaryParts = [
      `这是一个${typeLabel}任务，当前状态是${statusLabel}。`,
      recentRunCheck
        ? `最近 Run 结论：${recentRunCheck.label}，${recentRunCheck.detail}`
        : keySources.length > 0
          ? `当前关键来源是 ${keySources.map((source) => source.title).join('、')}。`
          : '这个任务还没有足够执行记录，适合先明确目标和完成标准。',
    ];
    const nextSuggestedMove = detail.activeBlocker
      ? `下一步建议：先处理阻塞「${detail.activeBlocker.title}」。`
      : detail.waitingReason
        ? `下一步建议：围绕「${detail.waitingReason}」做一次跟进。`
        : detail.nextStep
          ? `下一步建议：${detail.nextStep}`
          : taskAttrs?.commitment
            ? `下一步建议：围绕承诺「${taskAttrs.commitment}」补齐交付计划。`
            : '下一步建议：补充任务摘要和完成标准，然后启动 Run。';

    setGeneratedResume({
      summary: summaryParts.join(' '),
      nextSuggestedMove,
      generatedAt: new Date().toISOString(),
    });
  }

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

  async function deferUntilTomorrow() {
    setMoreOpen(false);
    await window.api?.transitionTask({
      id: taskId,
      nextState: 'waiting_external',
      waitingReason: '延后处理：明天',
    }).then((record) => {
      setDetail((current) => current ? {
        ...current,
        state: record.state,
        waitingReason: record.waitingReason,
        updatedAt: record.updatedAt,
      } : current);
    }).catch(() => {});
  }

  function moveCurrentTaskToProject(projectId: string | null) {
    const result = moveTaskToProject(taskId, projectId);
    setTaskAttrs(result.task);
    setMoreOpen(false);
  }

  function openRunForm() {
    setTab('runs');
    setRunFormRequest((value) => value + 1);
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
                  <button className="more-menu-item" onClick={() => void deferUntilTomorrow()}>延期到明天</button>
                  <button className="more-menu-item" onClick={() => { setMoreOpen(false); setShowEditPanel(true); }}>改优先级</button>
                  <div className="more-menu-label">移至项目</div>
                  {projectOptions
                    .filter((project) => project.id !== taskAttrs?.parentTaskId)
                    .map((project) => (
                      <button key={project.id} className="more-menu-item sub" onClick={() => moveCurrentTaskToProject(project.id)}>
                        {project.title}
                      </button>
                    ))}
                  {taskAttrs?.parentTaskId && (
                    <button className="more-menu-item sub" onClick={() => moveCurrentTaskToProject(null)}>移出项目</button>
                  )}
                  <button className="more-menu-item" onClick={() => { setMoreOpen(false); setShowSopExtract(true); }}>提取流程模板</button>
                  <button className="more-menu-item" onClick={() => { setMoreOpen(false); setShowCompletionCheck(true); }}>标记完成</button>
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
            attrs={taskAttrs}
            onSave={(patch) => {
              setDetail((d) => d ? { ...d, ...patch } : d);
              window.api?.updateTask({ id: taskId, ...patch }).catch(() => {});
              setShowEditPanel(false);
            }}
            onSaveAttrs={(patch) => {
              const nextAttrs = saveTaskAttributes(taskId, patch);
              setTaskAttrs(nextAttrs);
            }}
            onClose={() => setShowEditPanel(false)}
          />
        )}
      </div>

      {taskAttrs && (taskAttrs.type !== 'simple' || taskAttrs.parentTaskId || taskAttrs.commitment) && (
        <div className="workbench-config-strip">
          <span className="tag">{TASK_TYPE_LABELS[taskAttrs.type]}</span>
          {currentProject && <button className="workbench-config-pill">📁 {currentProject.title}</button>}
          {taskAttrs.schedule && <button className="workbench-config-pill">🔁 {taskAttrs.schedule}</button>}
          {taskAttrs.trigger && <button className="workbench-config-pill">⚡ {taskAttrs.trigger}</button>}
          {taskAttrs.commitment && <button className="workbench-config-pill">🤝 {taskAttrs.commitment}</button>}
        </div>
      )}

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
            <button className="btn primary" onClick={activeRun ? () => setTab('runs') : openRunForm}>
              {activeRun ? '查看进度 →' : '启动 Run →'}
            </button>
            {!activeRun && (
              <button className="btn ghost" onClick={onOpenPanel}>规划讨论</button>
            )}
          </div>
          <button className="btn sm ghost resume-regen" onClick={regenerateResume} disabled={!detail}>
            <IconRefresh /> 重新生成
          </button>
        </div>
        {generatedResume && (
          <div className="resume-generated-at">
            已重新生成 · {new Date(generatedResume.generatedAt).toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        {resumeSignals.length > 0 && (
          <div className="resume-signals" aria-label="推进依据">
            <span className="resume-signals-label">推进依据</span>
            {resumeSignals.map((signal) => (
              <span key={signal.label} className={`resume-signal${signal.tone === 'thin' ? ' thin' : ''}`}>
                {signal.label}
              </span>
            ))}
          </div>
        )}

        {detail && detail.completionCriteria.length > 0 && (
          <CompletionCriteriaProgress detail={detail} />
        )}

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
            runFormRequest={runFormRequest}
            onRunCreated={(run) => setRuns((items) => [run, ...items.filter((item) => item.id !== run.id)])}
            projectChildren={projectChildren}
          />
        )}
        {tab === 'sources' && (
          <SourcesTab
            taskId={taskId}
            sources={detail?.sourceContexts ?? []}
            onAdded={(sc) => setDetail((d) => d ? { ...d, sourceContexts: [...d.sourceContexts, sc] } : d)}
            onUpdated={(sc) => setDetail((d) => d
              ? { ...d, sourceContexts: d.sourceContexts.map((item) => item.id === sc.id ? sc : item) }
              : d)}
            onArchived={(id) => setDetail((d) => d
              ? { ...d, sourceContexts: d.sourceContexts.filter((item) => item.id !== id) }
              : d)}
          />
        )}
        {tab === 'artifacts' && <ArtifactsTab taskId={taskId} artifacts={detail?.artifacts ?? []} />}
        {tab === 'activity' && <ActivityTab timeline={detail?.timeline ?? []} />}
      </div>

      {showCompletionCheck && (
        <TaskCompletionCheckModal
          taskId={taskId}
          taskTitle={title}
          onCancel={() => setShowCompletionCheck(false)}
          onCompleteAnyway={() => {
            setShowCompletionCheck(false);
            void transitionTo('completed');
          }}
          onMarkWaiting={(reason) => {
            setShowCompletionCheck(false);
            void window.api?.transitionTask({
              id: taskId,
              nextState: 'waiting_external',
              waitingReason: reason,
            }).then((record) => {
              setDetail((current) => current ? {
                ...current,
                state: record.state,
                waitingReason: record.waitingReason,
                updatedAt: record.updatedAt,
              } : current);
            }).catch(() => {});
          }}
        />
      )}

      {showSopExtract && detail && (
        <SopExtractModal
          detail={detail}
          onCancel={() => setShowSopExtract(false)}
          onSave={(steps) => {
            const input = {
              taskId,
              taskTitle: title,
              steps,
            };
            if (window.api?.recordSopTemplateHabit) {
              void window.api.recordSopTemplateHabit(input);
            } else {
              recordSopTemplateHabit(input);
            }
            const api = window.api;
            if (api) {
              void api.createProcessTemplate({
                title: `「${title}」流程模板`,
                summary: `${title} 的可复用 SOP 流程`,
                content: formatSopProcessTemplateContent(steps),
                kind: 'sop',
                tags: [title],
              }).then((template) => api.applyProcessTemplate({
                taskId,
                templateId: template.id,
                note: '从任务工作台提取并保存的 SOP 模板',
              })).then((applied) => {
                setDetail((current) => current ? {
                  ...current,
                  processTemplates: [
                    applied,
                    ...current.processTemplates.filter((template) => template.bindingId !== applied.bindingId),
                  ],
                  resumeCard: {
                    ...current.resumeCard,
                    currentMethod: {
                      templateId: applied.id,
                      title: applied.title,
                      detail: applied.summary,
                      selectionReason: '刚从当前任务提取为 SOP 模板。',
                    },
                  },
                } : current);
              }).catch(() => {});
            }
            setShowSopExtract(false);
          }}
        />
      )}
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

function CompletionCriteriaProgress({ detail }: { detail: TaskDetail }) {
  const total = detail.completionCriteria.length;
  const satisfied = detail.completionCriteria.filter((item) => item.status === 'satisfied').length;
  const nextOpen = detail.completionCriteria.find((item) => item.status !== 'satisfied');

  return (
    <div className="resume-criteria">
      <div className="resume-criteria-head">
        <span>完成标准</span>
        <strong>{satisfied}/{total}</strong>
      </div>
      <div className="resume-criteria-bar">
        <div className="resume-criteria-fill" style={{ width: `${Math.round((satisfied / total) * 100)}%` }} />
      </div>
      {nextOpen && (
        <div className="resume-criteria-next">下一项：{nextOpen.text}</div>
      )}
    </div>
  );
}

/* ─── Runs tab ─── */

function RunsTab({
  taskId,
  runs,
  activeRunDetail,
  runFormRequest,
  onRunCreated,
  projectChildren,
}: {
  taskId: string;
  runs: RunRecord[];
  activeRunDetail: RunDetailRecord | null;
  runFormRequest: number;
  onRunCreated: (run: RunRecord) => void;
  projectChildren: ProjectChildSummary[];
}) {
  const active = runs.find((r) => r.status === 'running' || r.status === 'paused');
  const historical = runs.filter((r) => r !== active);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runDetailsById, setRunDetailsById] = useState<Record<string, RunDetailRecord | null>>({});
  const [showRunForm, setShowRunForm] = useState(false);
  const [runNote, setRunNote] = useState('');
  const [triggering, setTriggering] = useState(false);
  const checkStats = collectRunCheckStats({
    runs,
    activeRunDetail,
    runDetailsById,
  });

  useEffect(() => {
    if (runFormRequest > 0 && !active) setShowRunForm(true);
  }, [active, runFormRequest]);

  useEffect(() => {
    setExpandedRunId(null);
    setRunDetailsById({});
  }, [taskId]);

  async function toggleHistoricalRun(runId: string) {
    const isExpanded = expandedRunId === runId;
    setExpandedRunId(isExpanded ? null : runId);
    if (isExpanded || runDetailsById[runId] !== undefined || !window.api?.getRunDetail) return;

    const detail = await window.api.getRunDetail(runId).catch(() => null);
    setRunDetailsById((current) => ({ ...current, [runId]: detail }));
  }

  async function triggerNewRun() {
    if (!window.api || triggering) return;
    setTriggering(true);
    try {
      const created = await window.api.triggerRun({
        taskId,
        type: 'agent',
        instructions: runNote.trim() || undefined,
      });
      onRunCreated(created);
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
      {projectChildren.length > 0 && <ProjectExecutionSummary children={projectChildren} />}

      {runs.length > 0 && (
        <div className="run-check-overview">
          <span className="run-check-overview-title">自检查记录</span>
          <span className="run-check-overview-chip">Run {checkStats.runs}</span>
          <span className="run-check-overview-chip">Step {checkStats.steps}</span>
          <span className="run-check-overview-chip pass">通过 {checkStats.pass}</span>
          {checkStats.pending > 0 && (
            <span className="run-check-overview-chip pending">检查中 {checkStats.pending}</span>
          )}
          {(checkStats.warn + checkStats.fail) > 0 && (
            <span className="run-check-overview-chip warn">需关注 {checkStats.warn + checkStats.fail}</span>
          )}
          <span className="run-check-overview-note">
            Step 检查内置记录；Run 检查与完成确认按 AI 行为偏好触发。
          </span>
        </div>
      )}

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
                  step={step}
                  detail={activeRunDetail}
                />
              ))}
            </div>
          )}
          <RunCheckSummary check={getRunCheck(active, activeRunDetail)} />
        </div>
      )}

      {historical.map((r, i) => {
        const isExpanded = expandedRunId === r.id;
        const runNum = runs.length - i - (active ? 1 : 0);
        const historicalDetail = runDetailsById[r.id] ?? null;
        return (
          <div key={r.id} className={`run-item${isExpanded ? ' expanded' : ''}`}>
            <div className="run-item-header" style={{ cursor: 'pointer' }} onClick={() => void toggleHistoricalRun(r.id)}>
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
                <RunCheckSummary check={getRunCheck(r, historicalDetail)} />
                {historicalDetail?.steps && historicalDetail.steps.length > 0 && (
                  <div className="run-steps">
                    {historicalDetail.steps.map((step) => (
                      <RunStep
                        key={step.id}
                        step={step}
                        detail={historicalDetail}
                      />
                    ))}
                  </div>
                )}
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

function ProjectExecutionSummary({ children }: { children: ProjectChildSummary[] }) {
  const completed = children.filter((child) => child.state === 'completed').length;
  const waiting = children.filter((child) => child.state === 'waiting_external').length;
  const running = children.filter((child) => child.state === 'running').length;
  const attention = children.filter((child) => child.riskLevel === 'high' || child.state === 'waiting_external');
  const nextChild = attention[0] ?? children.find((child) => child.state !== 'completed') ?? children[0]!;

  return (
    <div className="project-exec-summary">
      <div className="project-exec-head">
        <span className="project-exec-title">项目子任务执行概览</span>
        <span className="project-exec-progress">{completed}/{children.length} 子任务完成</span>
      </div>
      <div className="project-exec-chips">
        {running > 0 && <span className="run-check-overview-chip pending">执行中 {running}</span>}
        {waiting > 0 && <span className="run-check-overview-chip warn">等待中 {waiting}</span>}
        {attention.length > 0 && <span className="run-check-overview-chip warn">需关注 {attention.length}</span>}
      </div>
      <div className="project-exec-list">
        {children.slice(0, 4).map((child) => (
          <div key={child.id} className="project-exec-child">
            <span className={`dot ${child.state === 'completed' ? 'completed' : child.riskLevel === 'high' ? 'risk' : child.state === 'waiting_external' ? 'waiting' : ''}`} />
            <span className="project-exec-child-title">{child.title}</span>
            <span className="project-exec-child-state">{formatProjectChildState(child.state)}</span>
          </div>
        ))}
      </div>
      {nextChild && (
        <div className="project-exec-next">
          下一步：{nextChild.waitingReason ?? nextChild.nextStep ?? `推进「${nextChild.title}」`}
        </div>
      )}
    </div>
  );
}

function formatProjectChildState(state: ProjectChildSummary['state']): string {
  if (state === 'completed') return '已完成';
  if (state === 'running') return '执行中';
  if (state === 'waiting_external') return '等待中';
  if (state === 'captured') return '待确认';
  if (state === 'planned') return '已计划';
  if (state === 'archived') return '已归档';
  return '待推进';
}

function collectRunCheckStats(params: {
  runs: RunRecord[];
  activeRunDetail: RunDetailRecord | null;
  runDetailsById: Record<string, RunDetailRecord | null>;
}): { runs: number; steps: number; pass: number; warn: number; fail: number; pending: number } {
  const stats = { runs: 0, steps: 0, pass: 0, warn: 0, fail: 0, pending: 0 };

  for (const run of params.runs) {
    const detail = run.status === 'running' || run.status === 'paused'
      ? params.activeRunDetail
      : params.runDetailsById[run.id] ?? null;
    const runCheck = getRunCheck(run, detail);
    stats.runs += 1;
    stats[runCheck.tone] += 1;

    for (const step of detail?.steps ?? []) {
      const stepCheck = getStepCheck(step, detail);
      stats.steps += 1;
      stats[stepCheck.tone] += 1;
    }
  }

  return stats;
}

function RunStep({ step, detail }: {
  step: RunStepRecord;
  detail?: RunDetailRecord | null;
}) {
  const done = step.status === 'completed';
  const active = step.status === 'running';
  const check = getStepCheck(step, detail);
  return (
    <div className={`run-step${active ? ' active' : done ? ' done' : ' pending'}`}>
      <span className="run-step-dot">
        {done ? '✓' : active ? '●' : '○'}
      </span>
      <span className="run-step-label">{step.title}</span>
      <span className={`run-check-pill ${check.tone}`} title={check.detail}>{check.label}</span>
      {active && <span className="dot running" style={{ marginLeft: 'auto' }} />}
    </div>
  );
}

function verificationToCheck(record: RunVerificationRecord): RunSelfCheckResult {
  return {
    tone: record.tone,
    label: record.label,
    detail: record.detail,
    source: 'lightweight_rule_engine',
  };
}

function getRunCheck(run: RunRecord, detail?: RunDetailRecord | null): RunSelfCheckResult {
  const persisted = detail?.verifications?.find((item) => (
    item.targetType === 'run' && item.targetId === run.id
  ));
  return persisted ? verificationToCheck(persisted) : evaluateRunSelfCheck(run, detail);
}

function getStepCheck(step: RunStepRecord, detail?: RunDetailRecord | null): RunSelfCheckResult {
  const persisted = detail?.verifications?.find((item) => (
    item.targetType === 'step' && item.targetId === step.id
  ));
  return persisted ? verificationToCheck(persisted) : evaluateRunStepSelfCheck(step);
}

function RunCheckSummary({ check }: {
  check: RunSelfCheckResult;
}) {
  return (
    <div className={`run-check-summary ${check.tone}`}>
      <strong>{check.label}</strong>
      <span>{check.detail}</span>
    </div>
  );
}

/* ─── Sources tab ─── */

function SourcesTab({
  taskId,
  sources,
  onAdded,
  onUpdated,
  onArchived,
}: {
  taskId: string;
  sources: SourceContextRecord[];
  onAdded: (sc: SourceContextRecord) => void;
  onUpdated: (sc: SourceContextRecord) => void;
  onArchived: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [uri, setUri] = useState('');
  const [kind, setKind] = useState<'link' | 'doc' | 'note'>('link');
  const [saving, setSaving] = useState(false);
  const [savingSourceId, setSavingSourceId] = useState<string | null>(null);

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

  async function toggleKeySource(source: SourceContextRecord) {
    if (!window.api || savingSourceId) return;
    setSavingSourceId(source.id);
    try {
      const updated = await window.api.updateSourceContext({ id: source.id, isKey: !source.isKey });
      onUpdated(updated);
    } finally {
      setSavingSourceId(null);
    }
  }

  async function archiveSource(source: SourceContextRecord) {
    if (!window.api || savingSourceId) return;
    setSavingSourceId(source.id);
    try {
      await window.api.archiveSourceContext(source.id);
      onArchived(source.id);
    } finally {
      setSavingSourceId(null);
    }
  }

  const keySourceCount = sources.filter((source) => source.isKey).length;
  const latestSource = sources[0] ?? null;

  return (
    <div className="tab-content">
      {sources.length > 0 && (
        <div className="source-summary">
          <div className="source-summary-item">
            <span className="source-summary-value">{sources.length}</span>
            <span>来源</span>
          </div>
          <div className="source-summary-item">
            <span className="source-summary-value">{keySourceCount}</span>
            <span>关键来源</span>
          </div>
          <div className="source-summary-note">
            最近更新：{latestSource ? formatDate(latestSource.updatedAt) : '暂无'}
          </div>
        </div>
      )}

      {sources.length === 0 && !showForm && (
        <div className="tab-empty">暂无来源文件。</div>
      )}
      {sources.map((s) => (
        <div key={s.id} className="source-item">
          <span className="tag captured">{s.kind.toUpperCase()}</span>
          {s.isKey && <span className="tag lane-escalate">关键</span>}
          <span className="source-label">{s.title}</span>
          {s.uri && <a className="source-uri muted" href={s.uri} target="_blank" rel="noreferrer">{s.uri.slice(0, 40)}…</a>}
          <span className="muted" style={{ marginLeft: 'auto', flexShrink: 0 }}>{formatDate(s.updatedAt)}</span>
          <button
            className="btn sm ghost"
            disabled={savingSourceId === s.id}
            onClick={() => void toggleKeySource(s)}
          >
            {s.isKey ? '取消关键' : '设为关键'}
          </button>
          <button
            className="btn sm ghost"
            disabled={savingSourceId === s.id}
            onClick={() => void archiveSource(s)}
          >
            归档
          </button>
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

function ArtifactsTab({ taskId, artifacts }: { taskId: string; artifacts: ArtifactRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, setLocalVersion] = useState(0);
  const [showNewNote, setShowNewNote] = useState(false);
  const [newTitle, setNewTitle] = useState('note.md');
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const visibleArtifacts = mergeTaskArtifacts(taskId, artifacts);
  const editableArtifactCount = visibleArtifacts.filter(isInlineEditableArtifact).length;
  const latestArtifact = visibleArtifacts[0] ?? null;

  function refreshLocal() {
    setLocalVersion((value) => value + 1);
  }

  function startEditing(artifact: ArtifactRecord) {
    setEditingId(artifact.id);
    setExpandedId(artifact.id);
    setTitleDraft(artifact.title);
    setContentDraft(artifact.content);
  }

  function saveEditing(artifact: ArtifactRecord) {
    updateArtifactWorkspace(artifact.id, {
      title: titleDraft.trim() || artifact.title,
      content: contentDraft,
    });
    setEditingId(null);
    refreshLocal();
  }

  function deleteArtifact(artifact: ArtifactRecord) {
    deleteArtifactWorkspace(artifact.id);
    setExpandedId((current) => current === artifact.id ? null : current);
    setEditingId((current) => current === artifact.id ? null : current);
    refreshLocal();
  }

  function createNote() {
    const title = newTitle.trim();
    if (!title) return;
    const created = createManualArtifact({
      taskId,
      title,
      content: newContent,
      kind: 'note',
    });
    setExpandedId(created.id);
    setShowNewNote(false);
    setNewTitle('note.md');
    setNewContent('');
    refreshLocal();
  }

  return (
    <div className="tab-content">
      {visibleArtifacts.length > 0 && (
        <div className="artifact-summary">
          <div className="artifact-summary-item">
            <span className="artifact-summary-value">{visibleArtifacts.length}</span>
            <span>工作文件夹产物</span>
          </div>
          <div className="artifact-summary-item">
            <span className="artifact-summary-value">{editableArtifactCount}</span>
            <span>可内联编辑</span>
          </div>
          <div className="artifact-summary-note">
            最近更新：{latestArtifact ? formatDate(latestArtifact.updatedAt) : '暂无'}
          </div>
        </div>
      )}

      <div className="artifact-toolbar">
        <button className="btn sm ghost" onClick={() => setShowNewNote((value) => !value)}>
          + 新建笔记
        </button>
      </div>
      {showNewNote && (
        <div className="artifact-editor new">
          <input
            className="settings-input"
            value={newTitle}
            placeholder="文件名，如 note.md"
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            className="artifact-edit-textarea"
            rows={8}
            value={newContent}
            placeholder="Markdown / 纯文本内容"
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className="artifact-edit-actions">
            <button className="btn sm primary" onClick={createNote} disabled={!newTitle.trim()}>保存笔记</button>
            <button className="btn sm ghost" onClick={() => setShowNewNote(false)}>取消</button>
          </div>
        </div>
      )}
      {visibleArtifacts.length === 0 && !showNewNote && (
        <div className="tab-empty">暂无产物文件。Run 完成后产出的内容会出现在这里。</div>
      )}
      {visibleArtifacts.map((a) => {
        const isExpanded = expandedId === a.id;
        const isEditing = editingId === a.id;
        const canEdit = isInlineEditableArtifact(a);
        return (
        <div key={a.id} className={`artifact-item${expandedId === a.id ? ' expanded' : ''}`}>
          <div className="artifact-header" onClick={() => setExpandedId((p) => p === a.id ? null : a.id)}>
            <span className="tag">{ARTIFACT_KIND_LABELS[a.kind as ArtifactKind] ?? a.kind}</span>
            <span className="artifact-title">{a.title}</span>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{formatDate(a.createdAt)}</span>
            <span className={`skill-expand-arrow${expandedId === a.id ? ' open' : ''}`}>›</span>
          </div>
          {isExpanded && (
            <div className="artifact-body">
              {isEditing ? (
                <div className="artifact-editor">
                  <input
                    className="settings-input"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                  />
                  <textarea
                    className="artifact-edit-textarea"
                    rows={10}
                    value={contentDraft}
                    onChange={(e) => setContentDraft(e.target.value)}
                  />
                  <div className="artifact-edit-actions">
                    <button className="btn sm primary" onClick={() => saveEditing(a)}>保存</button>
                    <button className="btn sm ghost" onClick={() => setEditingId(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <>
                  <pre className="artifact-content">{a.content || '空文件。'}</pre>
                  <div className="artifact-actions">
                    {canEdit && <button className="btn sm ghost" onClick={() => startEditing(a)}>编辑</button>}
                    <button className="btn sm ghost" onClick={() => startEditing(a)}>重命名</button>
                    <button className="btn sm ghost" onClick={() => deleteArtifact(a)} style={{ color: 'var(--accent)' }}>删除</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

/* ─── Activity tab ─── */

function parseTimelinePayload(payload: string | null): Record<string, unknown> | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function formatCompletionCheckEvent(payload: string | null): string {
  const parsed = parseTimelinePayload(payload);
  const action = parsed?.action;
  const total = typeof parsed?.criteriaTotal === 'number' ? parsed.criteriaTotal : null;
  const satisfied = typeof parsed?.criteriaSatisfied === 'number' ? parsed.criteriaSatisfied : null;
  const open = typeof parsed?.criteriaOpen === 'number' ? parsed.criteriaOpen : null;
  const progress = total === null || satisfied === null ? '' : `：${satisfied}/${total}`;
  const runVerificationLabel = typeof parsed?.runVerificationLabel === 'string'
    ? parsed.runVerificationLabel.trim()
    : '';
  const runVerificationSuffix = runVerificationLabel ? ` · ${runVerificationLabel}` : '';

  if (action === 'marked_waiting') {
    return `完成检查未通过，已转等待${open !== null ? `（未满足 ${open} 条）` : ''}${runVerificationSuffix}`;
  }
  if (action === 'override_completed') {
    return `完成检查被用户覆盖${progress}${runVerificationSuffix}`;
  }
  return `完成检查通过${progress}${runVerificationSuffix}`;
}

function formatCompletionCheckDetail(payload: string | null): string | null {
  const parsed = parseTimelinePayload(payload);
  const reason = typeof parsed?.reason === 'string' ? parsed.reason.trim() : '';
  const runVerificationDetail = typeof parsed?.runVerificationDetail === 'string'
    ? parsed.runVerificationDetail.trim()
    : '';
  return [reason, runVerificationDetail].filter(Boolean).join(' · ') || null;
}

const EVENT_LABELS: Record<string, (payload: string | null) => string> = {
  'task.created':              () => '任务已创建',
  'task.updated':              () => '任务信息已更新',
  'task.next_step_changed':    (p) => p ? `下一步：${p.slice(0, 40)}` : '下一步已更新',
  'task.waiting_changed':      (p) => p ? `等待：${p.slice(0, 40)}` : '等待状态已变更',
  'task.risk_changed':         (p) => p ? `风险等级：${p}` : '风险等级已变更',
  'task.transitioned':         (p) => p ? `状态变更 → ${p}` : '任务状态已变更',
  'task.completion_check':     formatCompletionCheckEvent,
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

function formatEventDetail(type: string, payload: string | null): string | null {
  if (type === 'task.completion_check') return formatCompletionCheckDetail(payload);
  return null;
}

function eventDotClass(type: string): string {
  if (type.startsWith('run.')) return 'running';
  if (type.includes('blocker') || type.includes('failed')) return 'risk';
  if (type.includes('waiting')) return 'waiting';
  if (type === 'task.completion_check') return 'completed';
  return '';
}

function isPriorityActivity(type: string): boolean {
  return type.includes('blocker')
    || type.includes('waiting')
    || type.includes('decision')
    || type.includes('failed')
    || type === 'task.completion_check';
}

function isCompletionOverrideActivity(event: { type: string; payload: string | null }): boolean {
  if (event.type !== 'task.completion_check') return false;
  return parseTimelinePayload(event.payload)?.action === 'override_completed';
}

function ActivityTab({ timeline }: { timeline: { id: string; type: string; payload: string | null; createdAt: string }[] }) {
  const priorityCount = timeline.filter((event) => isPriorityActivity(event.type)).length;
  const overrideCount = timeline.filter(isCompletionOverrideActivity).length;
  const latestEvent = timeline[timeline.length - 1] ?? null;

  return (
    <div className="tab-content">
      {timeline.length > 0 && (
        <div className="activity-summary">
          <div className="activity-summary-item">
            <span className="activity-summary-value">{timeline.length}</span>
            <span>活动记录</span>
          </div>
          <div className="activity-summary-item">
            <span className="activity-summary-value">{priorityCount}</span>
            <span>需关注</span>
          </div>
          <div className="activity-summary-note">
            最近更新：{latestEvent ? formatDate(latestEvent.createdAt) : '暂无'}
          </div>
          {overrideCount > 0 && (
            <div className="activity-learning-note">
              {overrideCount} 次完成检查覆盖已保留为自学习观察，不会自动改变后续流程。
            </div>
          )}
        </div>
      )}

      {timeline.length === 0 && (
        <div className="tab-empty">暂无活动记录。</div>
      )}
      <div className="activity-list">
        {timeline.slice().reverse().map((e) => (
          <ActivityItem key={e.id} event={e} />
        ))}
      </div>
    </div>
  );
}

function ActivityItem({ event }: { event: { id: string; type: string; payload: string | null; createdAt: string } }) {
  const detail = formatEventDetail(event.type, event.payload);
  return (
    <div className="activity-item">
      <div className="activity-dot-wrap">
        <span className={`dot ${eventDotClass(event.type)}`} style={{ width: 7, height: 7 }} />
        <div className="activity-line" />
      </div>
      <div className="activity-body">
        <span className="activity-text">{formatEventLabel(event.type, event.payload)}</span>
        {detail && <span className="activity-detail">{detail}</span>}
        <span className="activity-time muted">
          {new Date(event.createdAt).toLocaleString('zh', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
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

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 12,4" />
      <path d="M5 4V2.5h4V4" />
      <rect x="3" y="4" width="8" height="8" rx="1.5" />
    </svg>
  );
}

/* ─── SOP extraction ─── */

function buildSopSteps(detail: TaskDetail): string[] {
  const steps: string[] = [];

  if (detail.sourceContexts.length > 0) {
    steps.push(`收集并确认关键来源：${detail.sourceContexts.slice(0, 2).map((source) => source.title).join('、')}`);
  }

  if (detail.summary) {
    steps.push(`明确任务目标：${detail.summary}`);
  }

  for (const criteria of detail.completionCriteria.slice(0, 3)) {
    steps.push(`完成标准：${criteria.text}`);
  }

  if (detail.processTemplates.length > 0) {
    steps.push(`复用方法模板：${detail.processTemplates.slice(0, 2).map((template) => template.title).join('、')}`);
  }

  if (detail.nextStep) {
    steps.push(`推进下一步：${detail.nextStep}`);
  }

  if (steps.length === 0) {
    steps.push('补充目标背景', '确认完成标准', '启动执行并审查产物');
  }

  return steps;
}

function formatSopProcessTemplateContent(steps: string[]): string {
  return [
    '适用方式：作为同类任务执行前的默认流程参考。',
    '关键步骤：',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    '执行要求：保持步骤为大块任务，必要时先检查是否需要进一步拆解。',
  ].join('\n');
}

function SopExtractModal({
  detail,
  onCancel,
  onSave,
}: {
  detail: TaskDetail;
  onCancel: () => void;
  onSave: (steps: string[]) => void;
}) {
  const [steps, setSteps] = useState(buildSopSteps(detail));

  function updateStep(index: number, value: string) {
    setSteps((current) => current.map((step, i) => i === index ? value : step));
  }

  function addStep() {
    setSteps((current) => [...current, '']);
  }

  function removeStep(index: number) {
    setSteps((current) => current.filter((_, i) => i !== index));
  }

  const cleanSteps = steps.map((step) => step.trim()).filter(Boolean);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal sop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>提取流程模板</h3>
        </div>
        <div className="modal-body">
          <div className="sop-template-head">
            <span className="completion-check-label">任务类型</span>
            <strong>{detail.title}</strong>
            <p>保存后会写入 Context 的工作习惯记录，后续类似任务可作为默认流程参考。</p>
          </div>
          <div className="sop-step-list">
            {steps.map((step, index) => (
              <label key={index} className="sop-step-row">
                <span>{index + 1}</span>
                <input
                  className="settings-input"
                  value={step}
                  onChange={(e) => updateStep(index, e.target.value)}
                />
                <button
                  type="button"
                  className="icon-btn sop-step-remove"
                  onClick={() => removeStep(index)}
                  title="删除步骤"
                >
                  <IconTrash />
                </button>
              </label>
            ))}
          </div>
          <button className="btn sm ghost sop-step-add" onClick={addStep}>+ 新增步骤</button>
          <div className="sop-save-boundary">
            只有点击保存才会写入模板；不保存不会改变当前任务或后续默认流程。
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn sm ghost" onClick={onCancel}>不保存</button>
          <button className="btn sm primary" onClick={() => onSave(cleanSteps)} disabled={cleanSteps.length === 0}>
            保存为模板
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Task Edit Panel ─── */

function TaskEditPanel({
  detail,
  attrs,
  onSave,
  onSaveAttrs,
  onClose,
}: {
  detail: TaskDetail;
  attrs: TaskAttributeRecord | null;
  onSave: (patch: { summary?: string | null; nextStep?: string | null; riskLevel?: 'none' | 'low' | 'medium' | 'high' }) => void;
  onSaveAttrs: (patch: Partial<Omit<TaskAttributeRecord, 'taskId' | 'updatedAt'>>) => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState(detail.summary ?? '');
  const [nextStep, setNextStep] = useState(detail.nextStep ?? '');
  const [riskLevel, setRiskLevel] = useState(detail.riskLevel);
  const [type, setType] = useState<TaskExecutionType>(attrs?.type ?? 'simple');
  const [commitment, setCommitment] = useState(attrs?.commitment ?? '');
  const [schedule, setSchedule] = useState(attrs?.schedule ?? defaultScheduleForType(attrs?.type ?? 'simple') ?? '');
  const [trigger, setTrigger] = useState(attrs?.trigger ?? defaultTriggerForType(attrs?.type ?? 'simple') ?? '');

  function updateType(nextType: TaskExecutionType) {
    setType(nextType);
    setSchedule((current) => current || defaultScheduleForType(nextType) || '');
    setTrigger((current) => current || defaultTriggerForType(nextType) || '');
  }

  return (
    <div className="task-edit-panel">
      <div className="task-edit-row">
        <label className="task-edit-label">任务类型</label>
        <div className="task-edit-risk-row">
          {(['simple', 'project', 'scheduled', 'event'] as TaskExecutionType[]).map((item) => (
            <button
              key={item}
              className={`task-edit-risk-btn${type === item ? ' active' : ''}`}
              onClick={() => updateType(item)}
            >
              {TASK_TYPE_LABELS[item]}
            </button>
          ))}
        </div>
        <span className="task-edit-hint">
          任务类型、周期和触发条件属于任务属性；实际执行记录仍保留在执行 Tab。
        </span>
      </div>
      {type === 'scheduled' && (
        <div className="task-edit-row">
          <label className="task-edit-label">定时配置</label>
          <input
            className="settings-input"
            value={schedule}
            placeholder="例：每周一 09:00"
            onChange={(e) => setSchedule(e.target.value)}
          />
        </div>
      )}
      {type === 'event' && (
        <div className="task-edit-row">
          <label className="task-edit-label">触发条件</label>
          <input
            className="settings-input"
            value={trigger}
            placeholder="例：Gmail 发件人包含 @brand-partner.com"
            onChange={(e) => setTrigger(e.target.value)}
          />
        </div>
      )}
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
        <label className="task-edit-label">已承诺</label>
        <input
          className="settings-input"
          value={commitment}
          placeholder="例：向客户承诺 3/20 前交付初稿"
          onChange={(e) => setCommitment(e.target.value)}
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
          onClick={() => {
            onSaveAttrs({
              type,
              commitment,
              schedule: type === 'scheduled' ? schedule : null,
              trigger: type === 'event' ? trigger : null,
            });
            onSave({ summary: summary || null, nextStep: nextStep || null, riskLevel });
            onClose();
          }}
        >
          保存
        </button>
        <button className="btn sm ghost" onClick={onClose}>取消</button>
      </div>
    </div>
  );
}
