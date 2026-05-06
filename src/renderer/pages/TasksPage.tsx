import { useState, useRef, useCallback, useEffect } from 'react';
import type { ProjectDecompositionResult } from '@shared/types/ipc';
import type { TaskListItemRecord, TaskState } from '@shared/types/task';
import type { SourceContextRecord } from '@shared/types/source-context';
import type { DecisionRecord } from '@shared/types/decision';
import { TaskCompletionCheckModal } from '../components/TaskCompletionCheckModal';
import {
  defaultScheduleForType,
  defaultTriggerForType,
  inferTaskExecutionType,
  loadTaskAttributes,
  saveTaskAttributes,
  type TaskAttributeRecord,
  type TaskExecutionType,
} from '../lib/taskAttributes';

type Lane = 'escalate' | 'unblock' | 'continue' | 'clarify' | 'steady';
type TaskStatus = 'running' | 'waiting' | 'blocked' | 'idle' | 'done';
type TaskType = TaskExecutionType;
type ViewMode = 'lane' | 'list' | 'timeline';

interface Task {
  id: string;
  title: string;
  lane: Lane;
  status: TaskStatus;
  type: TaskType;
  parentTaskId?: string;
  childTaskIds: string[];
  whyNow?: string;
  nextStep?: string;
  waitingOn?: string;
  commitment?: string;
  schedule?: string;
  trigger?: string;
  dependencyId?: string;
  dependencyReady?: boolean;
  updatedAt: string;
  state: TaskState;
}

const LANE_LABELS: Record<Lane, string> = {
  escalate: 'Escalate now',
  unblock:  'Unblock or decide',
  continue: 'Continue or review',
  clarify:  'Clarify',
  steady:   'Steady',
};

const LANE_ORDER: Lane[] = ['escalate', 'unblock', 'continue', 'clarify', 'steady'];

type Lens =
  | 'all'
  | 'running' | 'waiting' | 'blocked'
  | 'project' | 'scheduled' | 'event'
  | 'committed' | 'done';

const DEFER_OPTIONS = [
  { label: '明天', value: 'tomorrow' },
  { label: '本周末', value: 'weekend' },
  { label: '下周一', value: 'next-monday' },
  { label: '选日期…', value: 'custom' },
];

function deferLabel(value: string): string {
  return DEFER_OPTIONS.find((opt) => opt.value === value)?.label ?? value;
}

/* ─── Map real task record → UI task ─── */

function derivelane(r: TaskListItemRecord): Lane {
  if (r.riskLevel === 'high') return 'escalate';
  if (r.activeDependency) return 'unblock';
  if (r.activeBlocker || r.state === 'waiting_external') return 'unblock';
  if (r.state === 'running') return 'continue';
  if (r.state === 'captured') return 'clarify';
  if (r.riskLevel === 'medium') return 'unblock';
  if (r.state === 'completed' || r.state === 'archived') return 'steady';
  return 'continue';
}

function deriveStatus(r: TaskListItemRecord): TaskStatus {
  if (r.state === 'running') return 'running';
  if (r.state === 'waiting_external') return 'waiting';
  if (r.activeDependency) return 'blocked';
  if (r.activeBlocker) return 'blocked';
  if (r.state === 'completed' || r.state === 'archived') return 'done';
  return 'idle';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  simple:    '一次性',
  project:   '项目',
  scheduled: '定时',
  event:     '事件',
};

function fromRecord(r: TaskListItemRecord, attrs?: TaskAttributeRecord | null): Task {
  return {
    id: r.id,
    title: r.title,
    lane: derivelane(r),
    status: deriveStatus(r),
    type: attrs?.type ?? 'simple',
    parentTaskId: attrs?.parentTaskId ?? undefined,
    childTaskIds: attrs?.childTaskIds ?? [],
    whyNow: r.summary ?? undefined,
    nextStep: r.nextStep ?? undefined,
    waitingOn: r.activeDependency
      ? r.dependencyReevaluation
        ? `依赖可复核：${r.dependencyReevaluation.upstreamTaskTitle}`
        : `依赖：${r.activeDependency.blockedByTaskTitle ?? r.activeDependency.reason ?? '上游任务'}`
      : r.waitingReason ? `等待：${r.waitingReason}` : undefined,
    dependencyId: r.activeDependency?.id,
    dependencyReady: Boolean(r.dependencyReevaluation),
    commitment: attrs?.commitment ?? undefined,
    schedule: attrs?.schedule ?? undefined,
    trigger: attrs?.trigger ?? undefined,
    updatedAt: formatDate(r.updatedAt),
    state: r.state,
  };
}

interface TasksPageProps {
  onOpenPanel: (taskId: string) => void;
  onOpenWorkbench: (taskId: string) => void;
  onOpenDecision: () => void;
}

export function TasksPage({ onOpenPanel, onOpenWorkbench, onOpenDecision }: TasksPageProps) {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [lens, setLens] = useState<Lens>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('lane');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<SourceContextRecord[]>([]);
  const [pendingDecisions, setPendingDecisions] = useState<DecisionRecord[]>([]);
  const [deferOpenId, setDeferOpenId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [completionCheckTask, setCompletionCheckTask] = useState<Task | null>(null);
  const [projectDraft, setProjectDraft] = useState<{ projectId: string; result: ProjectDecompositionResult } | null>(null);
  const [projectDecomposingId, setProjectDecomposingId] = useState<string | null>(null);
  const [projectCreatingChildrenId, setProjectCreatingChildrenId] = useState<string | null>(null);
  const [projectDecompositionError, setProjectDecompositionError] = useState<string | null>(null);

  const [showCapture, setShowCapture] = useState(false);
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureType, setCaptureType] = useState<TaskType>('simple');
  const [captureCommitment, setCaptureCommitment] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [capturedId, setCapturedId] = useState<string | null>(null);

  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reloadTasks() {
    window.api?.listTasks().then((records) => {
      const attrs = loadTaskAttributes();
      setAllTasks(records.map((record) => fromRecord(record, attrs[record.id])));
    }).catch(() => {});
  }

  function reloadPendingDecisions() {
    window.api?.listDecisions?.()
      .then((decisions) => setPendingDecisions(decisions.filter((decision) => decision.status === 'pending')))
      .catch(() => {});
  }

  // Load real tasks from backend when available
  useEffect(() => {
    if (!window.api) return;
    setLoading(true);
    window.api.listTasks()
      .then((records) => {
        const attrs = loadTaskAttributes();
        setAllTasks(records.map((record) => fromRecord(record, attrs[record.id])));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    reloadPendingDecisions();

    const unsub = window.api.subscribeToEvents((event) => {
      if (event.type === 'task.changed') reloadTasks();
      if (event.type === 'decision.changed') reloadPendingDecisions();
    });
    return () => unsub?.();
  }, []);

  const filtered = allTasks.filter((t) => {
    if (lens === 'all') return true;
    if (lens === 'running') return t.status === 'running';
    if (lens === 'waiting') return t.status === 'waiting';
    if (lens === 'blocked') return t.status === 'blocked';
    if (lens === 'project') return t.type === 'project';
    if (lens === 'scheduled') return t.type === 'scheduled';
    if (lens === 'event') return t.type === 'event';
    if (lens === 'committed') return !!t.commitment;
    if (lens === 'done') return t.status === 'done';
    return true;
  });

  const selectedTask = filtered.find((t) => t.id === selectedId) ?? null;
  const selectedHasDecision = Boolean(selectedTask && pendingDecisions.some((decision) => decision.taskId === selectedTask.id));
  const projectParents = allTasks.filter((task) => task.type === 'project' && !task.parentTaskId);

  useEffect(() => {
    let cancelled = false;
    setSelectedSources([]);
    if (!selectedId || !window.api?.getTaskDetail) return;

    window.api.getTaskDetail(selectedId)
      .then((detail) => {
        if (cancelled) return;
        const keySources = (detail?.sourceContexts ?? [])
          .filter((source) => source.status === 'active' && source.isKey)
          .slice(0, 3);
        setSelectedSources(keySources);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [selectedId]);

  function handleRowClick(id: string) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      setSelectedId((prev) => (prev === id ? null : id));
      setDeferOpenId(null);
    }, 180);
  }

  function handleRowDoubleClick(id: string) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    onOpenWorkbench(id);
  }

  function handleContextMenu(e: React.MouseEvent, taskId: string) {
    e.preventDefault();
    setSelectedId(null);
    setContextMenu({ x: e.clientX, y: e.clientY, taskId });
  }

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  async function transitionWithPlanningHop(task: Task, nextState: TaskState, waitingReason?: string | null) {
    if (!window.api) return;
    if ((task.state === 'captured' || task.state === 'triaged') && nextState !== 'archived') {
      await window.api.transitionTask({ id: task.id, nextState: 'planned' });
    }
    await window.api.transitionTask({ id: task.id, nextState, waitingReason });
  }

  function completeTask(task: Task) {
    setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
    setSelectedId(null);
    transitionWithPlanningHop(task, 'completed').catch(() => reloadTasks());
  }

  function markWaitingAfterCompletionCheck(task: Task, reason: string) {
    setCompletionCheckTask(null);
    setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
    setSelectedId(null);
    transitionWithPlanningHop(task, 'waiting_external', reason).catch(() => reloadTasks());
  }

  function deferTask(task: Task, option: string) {
    setDeferOpenId(null);
    setSelectedId(null);
    setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
    transitionWithPlanningHop(task, 'waiting_external', `延后处理：${deferLabel(option)}`).catch(() => reloadTasks());
  }

  async function resolveReadyDependency(task: Task) {
    if (!window.api || !task.dependencyId) return;
    try {
      await window.api.resolveTaskDependency(task.dependencyId);
      setAllTasks((prev) => prev.map((item) => (
        item.id === task.id
          ? {
              ...item,
              dependencyId: undefined,
              dependencyReady: false,
              waitingOn: undefined,
              status: 'idle',
              lane: item.state === 'captured' ? 'clarify' : 'continue',
            }
          : item
      )));
    } catch {
      reloadTasks();
    }
  }

  async function generateProjectDecomposition(project: Task) {
    if (!window.api?.decomposeProject || projectDecomposingId) {
      setProjectDecompositionError('当前版本暂时无法调用 AI 拆解服务。');
      return;
    }
    setProjectDecomposingId(project.id);
    setProjectDecompositionError(null);
    try {
      const result = await window.api.decomposeProject({ taskId: project.id });
      setProjectDraft({ projectId: project.id, result });
    } catch (error) {
      setProjectDecompositionError(error instanceof Error ? error.message : 'AI 拆解失败，请稍后重试。');
    } finally {
      setProjectDecomposingId(null);
    }
  }

  async function createProjectChildren(project: Task) {
    if (!window.api || projectCreatingChildrenId) return;
    const draft = projectDraft?.projectId === project.id ? projectDraft.result : null;
    if (!draft) return;
    setProjectCreatingChildrenId(project.id);
    setProjectDecompositionError(null);
    try {
      const childRecords = await Promise.all(draft.subtasks.map((subtask) => window.api!.createTask({
        title: subtask.title,
        summary: subtask.summary,
      })));
      await Promise.all(childRecords.map((child, index) => window.api!.createCompletionCriteria({
        taskId: child.id,
        text: draft.subtasks[index]?.acceptanceCriteria ?? '完成后能明确验收。',
        verificationResponsibility: 'unknown',
      })));

      const childRecordByTitle = new Map(childRecords.map((child) => [child.title.trim(), child]));
      await Promise.all(draft.subtasks.map((subtask, index) => {
        const dependencyTitle = subtask.dependency?.trim();
        if (!dependencyTitle) return Promise.resolve(null);
        const dependency = childRecordByTitle.get(dependencyTitle)
          ?? childRecords.find((child) => dependencyTitle.includes(child.title) || child.title.includes(dependencyTitle));
        const child = childRecords[index];
        if (!child || !dependency || dependency.id === child.id) return Promise.resolve(null);
        return window.api!.createTaskDependency({
          taskId: child.id,
          blockedByTaskId: dependency.id,
          reason: subtask.dependency,
        });
      }));

      const childIds = [...project.childTaskIds, ...childRecords.map((child) => child.id)];
      const parentAttrs = saveTaskAttributes(project.id, { childTaskIds: childIds });
      const updatedParent = await window.api.updateTask({
        id: project.id,
        summary: draft.parentGoal,
        nextStep: draft.nextStep,
      });
      await window.api.createSourceContext({
        taskId: project.id,
        title: 'AI 项目拆解自检',
        kind: 'note',
        isKey: true,
        content: draft.review,
        note: `${draft.subtasks.length} 个子任务；用户确认后创建。`,
      });
      await window.api.createCompletionCriteria({
        taskId: project.id,
        text: `完成并验收 ${draft.subtasks.length} 个项目子任务。`,
        verificationResponsibility: 'unknown',
      });
      const childTasks = childRecords.map((child) => {
        const draftSubtask = draft.subtasks.find((subtask) => subtask.title === child.title);
        const childAttrs = saveTaskAttributes(child.id, {
          type: 'simple',
          parentTaskId: project.id,
        });
        const dependencyTitle = draftSubtask?.dependency?.trim() ?? '';
        const dependency = dependencyTitle
          ? childRecords.find((candidate) => dependencyTitle.includes(candidate.title) || candidate.title.includes(dependencyTitle))
          : null;
        const baseTask = fromRecord({ ...child, activeBlocker: null, activeWaitingItem: null }, childAttrs);
        return {
          ...baseTask,
          status: dependency ? 'blocked' as const : baseTask.status,
          lane: dependency ? 'unblock' as const : baseTask.lane,
          waitingOn: dependency ? `依赖：${dependency.title}` : baseTask.waitingOn,
        };
      });

      setAllTasks((prev) => {
        const nextParent = prev.map((task) => (
          task.id === project.id
            ? {
                ...fromRecord({
                  ...updatedParent,
                  activeBlocker: null,
                  activeWaitingItem: null,
                  activeDependency: null,
                  dependencyReevaluation: null,
                }, parentAttrs),
                childTaskIds: parentAttrs.childTaskIds,
              }
            : task
        ));
        return [...childTasks, ...nextParent];
      });
      setProjectDraft(null);
    } catch (error) {
      setProjectDecompositionError(error instanceof Error ? error.message : '创建子任务失败，请稍后重试。');
    } finally {
      setProjectCreatingChildrenId(null);
    }
  }

  function groupByLane(tasks: Task[]): Record<Lane, Task[]> {
    const result = {} as Record<Lane, Task[]>;
    LANE_ORDER.forEach((lane) => { result[lane] = []; });
    tasks.forEach((t) => result[t.lane].push(t));
    return result;
  }

  async function captureTask() {
    const title = captureTitle.trim();
    if (!title || capturing) return;
    setCapturing(true);
    try {
      let newId: string;
      const selectedType = captureType;
      if (window.api) {
        const record = await window.api.createTask({ title });
        newId = record.id;
        const attrs = saveTaskAttributes(newId, {
          type: selectedType,
          commitment: captureCommitment,
          schedule: defaultScheduleForType(selectedType),
          trigger: defaultTriggerForType(selectedType),
        });
        setAllTasks((prev) => [fromRecord({ ...record, activeBlocker: null, activeWaitingItem: null }, attrs), ...prev]);
      } else {
        newId = `t-${Date.now()}`;
        const attrs = saveTaskAttributes(newId, {
          type: selectedType,
          commitment: captureCommitment,
          schedule: defaultScheduleForType(selectedType),
          trigger: defaultTriggerForType(selectedType),
        });
        const fake: Task = {
          id: newId, title, lane: 'clarify', status: 'idle',
          type: attrs.type,
          childTaskIds: attrs.childTaskIds,
          commitment: attrs.commitment ?? undefined,
          schedule: attrs.schedule ?? undefined,
          trigger: attrs.trigger ?? undefined,
          updatedAt: new Date().toLocaleDateString('zh'),
          state: 'captured',
        };
        setAllTasks((prev) => [fake, ...prev]);
      }
      setCaptureTitle('');
      setCaptureType('simple');
      setCaptureCommitment('');
      setShowCapture(false);
      setCapturedId(newId);
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="tasks-page" onClick={closeContextMenu}>
      {/* Lenses Rail */}
      <aside className="lenses-rail">
        <LensItem label="全部" active={lens === 'all'} onClick={() => setLens('all')}
          count={allTasks.length} />

        <div className="lens-group-label">执行状态</div>
        <LensItem label="Running" active={lens === 'running'} onClick={() => setLens('running')}
          dot="running" count={allTasks.filter(t => t.status === 'running').length} />
        <LensItem label="等待中 7d+" active={lens === 'waiting'} onClick={() => setLens('waiting')}
          dot="waiting" count={allTasks.filter(t => t.status === 'waiting').length} />
        <LensItem label="有风险" active={lens === 'blocked'} onClick={() => setLens('blocked')}
          dot="risk" count={allTasks.filter(t => t.status === 'blocked').length} />

        <div className="lens-group-label">任务类型</div>
        <LensItem label="项目型" active={lens === 'project'} onClick={() => setLens('project')} icon="📁"
          count={projectParents.length} />
        <LensItem label="定时任务" active={lens === 'scheduled'} onClick={() => setLens('scheduled')} icon="🔁"
          count={allTasks.filter(t => t.type === 'scheduled').length} />
        <LensItem label="事件触发" active={lens === 'event'} onClick={() => setLens('event')} icon="⚡"
          count={allTasks.filter(t => t.type === 'event').length} />

        <div className="lens-group-label" style={{ marginTop: 'auto' }}>特殊视角</div>
        <LensItem label="已承诺" active={lens === 'committed'} onClick={() => setLens('committed')} icon="🤝"
          count={allTasks.filter(t => !!t.commitment).length} />
        <LensItem label="已完成 / 归档" active={lens === 'done'} onClick={() => setLens('done')} icon="🗄"
          count={allTasks.filter(t => t.status === 'done').length} />
      </aside>

      {/* Task list */}
      <div className="tasks-main">
        {/* View mode switcher */}
        <div className="tasks-toolbar">
          <div className="view-switcher">
            {(['lane', 'list', 'timeline'] as ViewMode[]).map((m) => (
              <button
                key={m}
                className={`view-btn${viewMode === m ? ' active' : ''}`}
                onClick={() => setViewMode(m)}
              >
                {m === 'lane' ? 'Priority Lane' : m === 'list' ? '列表' : '时间线'}
              </button>
            ))}
          </div>
          <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => setShowCapture((v) => !v)}>
            + 新建任务
          </button>
        </div>

        {/* Capture form */}
        {showCapture && (
          <div className="capture-form">
            <input
              className="capture-input"
              autoFocus
              placeholder="任务标题… (Enter 快速创建)"
              value={captureTitle}
              onChange={(e) => {
                const nextTitle = e.target.value;
                setCaptureTitle(nextTitle);
                setCaptureType((current) => current === 'simple' ? inferTaskExecutionType(nextTitle) : current);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void captureTask(); }
                if (e.key === 'Escape') { setShowCapture(false); setCaptureTitle(''); }
              }}
            />
            <div className="capture-type-row">
              {(['simple', 'project', 'scheduled', 'event'] as TaskType[]).map((type) => (
                <button
                  key={type}
                  className={`capture-type-btn${captureType === type ? ' active' : ''}`}
                  onClick={() => setCaptureType(type)}
                >
                  {TASK_TYPE_LABELS[type]}
                </button>
              ))}
              <input
                className="capture-commitment-input"
                placeholder="已承诺时间或对象（可选）"
                value={captureCommitment}
                onChange={(e) => setCaptureCommitment(e.target.value)}
              />
            </div>
            <div className="capture-actions">
              <button className={`btn sm primary${capturing ? ' disabled' : ''}`} onClick={() => void captureTask()} disabled={!captureTitle.trim() || capturing}>
                {capturing ? '创建中…' : '创建'}
              </button>
              <button className="btn sm ghost" onClick={() => { setShowCapture(false); setCaptureTitle(''); }}>
                取消
              </button>
              <span className="capture-ai-hint muted">
                项目型任务创建后可让 AI 拆解并自检
              </span>
            </div>
          </div>
        )}

        {/* Post-capture AI nudge */}
        {capturedId && (
          <div className="capture-nudge">
            <span>✓ 已创建</span>
            <button className="btn sm primary" onClick={() => { onOpenPanel(capturedId); setCapturedId(null); }}>
              让 AI 拆解并检查 →
            </button>
            <button className="icon-btn" style={{ marginLeft: 4 }} onClick={() => setCapturedId(null)} title="关闭">
              <span style={{ fontSize: 12, lineHeight: 1 }}>×</span>
            </button>
          </div>
        )}

        {/* Task rows */}
        <div className="task-list">
          {lens === 'project' ? (
            <ProjectTreeView
              projects={projectParents}
              tasks={allTasks}
              selectedId={selectedId}
              deferOpenId={deferOpenId}
              onRowClick={handleRowClick}
              onRowDoubleClick={handleRowDoubleClick}
              onContextMenu={handleContextMenu}
              onDeferToggle={(task) => setDeferOpenId((prev) => (prev === task.id ? null : task.id))}
              onDeferSelect={deferTask}
              onComplete={(task) => setCompletionCheckTask(task)}
              onMore={(event, task) => handleContextMenu(event, task.id)}
              onResolveDependency={resolveReadyDependency}
              projectDraft={projectDraft}
              decomposingId={projectDecomposingId}
              creatingChildrenId={projectCreatingChildrenId}
              decompositionError={projectDecompositionError}
              onGenerateDecomposition={generateProjectDecomposition}
              onCreateDraftChildren={createProjectChildren}
            />
          ) : viewMode === 'lane' ? (
            LANE_ORDER.map((lane) => {
              const group = groupByLane(filtered)[lane];
              if (group.length === 0) return null;
              return (
                <div key={lane} className="lane-group">
                  <div className="lane-group-header">
                    <span className={`tag lane-${lane}`}>{LANE_LABELS[lane]}</span>
                    <span className="lane-count">{group.length}</span>
                  </div>
                  {group.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selectedId === task.id}
                      deferOpen={deferOpenId === task.id}
                      onClick={() => handleRowClick(task.id)}
                      onDoubleClick={() => handleRowDoubleClick(task.id)}
                      onContextMenu={(e) => handleContextMenu(e, task.id)}
                      onDeferToggle={(e) => { e.stopPropagation(); setDeferOpenId((prev) => (prev === task.id ? null : task.id)); }}
                      onDeferSelect={(opt) => deferTask(task, opt)}
                      onComplete={(e) => { e.stopPropagation(); setCompletionCheckTask(task); }}
                      onMore={(e) => { e.stopPropagation(); handleContextMenu(e, task.id); }}
                      onResolveDependency={(item) => resolveReadyDependency(item)}
                    />
                  ))}
                </div>
              );
            })
          ) : viewMode === 'timeline' ? (
            <TimelineView tasks={filtered} onOpen={onOpenWorkbench} />
          ) : (
            filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={selectedId === task.id}
                deferOpen={deferOpenId === task.id}
                onClick={() => handleRowClick(task.id)}
                onDoubleClick={() => handleRowDoubleClick(task.id)}
                onContextMenu={(e) => handleContextMenu(e, task.id)}
                onDeferToggle={(e) => {
                  e.stopPropagation();
                  setDeferOpenId((prev) => (prev === task.id ? null : task.id));
                }}
                onDeferSelect={(opt) => deferTask(task, opt)}
                onComplete={(e) => {
                  e.stopPropagation();
                  setCompletionCheckTask(task);
                }}
                onMore={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, task.id);
                }}
                onResolveDependency={(item) => resolveReadyDependency(item)}
              />
            ))
          )}
          {filtered.length === 0 && !loading && (
            <div className="tasks-empty">
              {allTasks.length === 0
                ? <><p>还没有任何任务。</p><p className="muted" style={{ marginTop: 4, fontSize: 12 }}>点击「新建任务」开始捕获你的第一个任务。</p></>
                : <p>当前视角下没有任务。</p>
              }
            </div>
          )}
        </div>
      </div>

      {/* Right preview panel */}
      {selectedTask && (
        <div className="task-preview">
          <TaskPreview
            task={selectedTask}
            keySources={selectedSources}
            hasPendingDecision={selectedHasDecision}
            onOpenWorkbench={() => onOpenWorkbench(selectedTask.id)}
            onOpenDecision={onOpenDecision}
          />
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onOpenWorkbench={() => { onOpenWorkbench(contextMenu.taskId); closeContextMenu(); }}
        />
      )}

      {completionCheckTask && (
        <TaskCompletionCheckModal
          taskId={completionCheckTask.id}
          taskTitle={completionCheckTask.title}
          onCancel={() => setCompletionCheckTask(null)}
          onCompleteAnyway={() => {
            const task = completionCheckTask;
            if (!task) return;
            setCompletionCheckTask(null);
            completeTask(task);
          }}
          onMarkWaiting={(reason) => {
            const task = completionCheckTask;
            if (!task) return;
            markWaitingAfterCompletionCheck(task, reason);
          }}
        />
      )}
    </div>
  );
}

/* ─── Timeline view ─── */

function TimelineView({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const grouped = new Map<string, Task[]>();
  for (const t of [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const key = t.updatedAt;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  if (tasks.length === 0) return null;

  return (
    <div className="timeline-view">
      {[...grouped.entries()].map(([date, group]) => (
        <div key={date} className="timeline-group">
          <div className="timeline-date">{date}</div>
          <div className="timeline-items">
            {group.map((task) => (
              <div key={task.id} className="timeline-item" onClick={() => onOpen(task.id)}>
                <div className={`timeline-dot ${task.status}`} />
                <div className="timeline-content">
                  <span className="timeline-title">{task.title}</span>
                  <span className={`tag lane-${task.lane}`} style={{ fontSize: 10, marginLeft: 8 }}>
                    {LANE_LABELS[task.lane]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Lens item ─── */

interface LensItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  dot?: string;
  icon?: string;
}

function LensItem({ label, active, onClick, count, dot, icon }: LensItemProps) {
  return (
    <button className={`lens-item${active ? ' active' : ''}`} onClick={onClick}>
      {dot && <span className={`dot ${dot}`} />}
      {icon && <span className="lens-icon">{icon}</span>}
      <span className="lens-label">{label}</span>
      {count != null && count > 0 && (
        <span className="lens-count">{count}</span>
      )}
    </button>
  );
}

function ProjectTreeView({
  projects,
  tasks,
  selectedId,
  deferOpenId,
  onRowClick,
  onRowDoubleClick,
  onContextMenu,
  onDeferToggle,
  onDeferSelect,
  onComplete,
  onMore,
  onResolveDependency,
  projectDraft,
  decomposingId,
  creatingChildrenId,
  decompositionError,
  onGenerateDecomposition,
  onCreateDraftChildren,
}: {
  projects: Task[];
  tasks: Task[];
  selectedId: string | null;
  deferOpenId: string | null;
  onRowClick: (id: string) => void;
  onRowDoubleClick: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
  onDeferToggle: (task: Task) => void;
  onDeferSelect: (task: Task, option: string) => void;
  onComplete: (task: Task) => void;
  onMore: (event: React.MouseEvent, task: Task) => void;
  onResolveDependency: (task: Task) => void;
  projectDraft: { projectId: string; result: ProjectDecompositionResult } | null;
  decomposingId: string | null;
  creatingChildrenId: string | null;
  decompositionError: string | null;
  onGenerateDecomposition: (project: Task) => void;
  onCreateDraftChildren: (project: Task) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <div className="project-tree">
      {projects.map((project) => {
        const children = project.childTaskIds
          .map((id) => tasks.find((task) => task.id === id))
          .filter((task): task is Task => Boolean(task));
        const done = children.filter((task) => task.status === 'done').length;
        return (
          <div key={project.id} className="project-group">
            <div className="project-group-head">
              <span className="project-disclosure">▾</span>
              <span className="project-group-title">{project.title}</span>
              <span className="project-progress">{done}/{children.length} 子任务完成</span>
            </div>
            <TaskRow
              task={project}
              selected={selectedId === project.id}
              deferOpen={deferOpenId === project.id}
              onClick={() => onRowClick(project.id)}
              onDoubleClick={() => onRowDoubleClick(project.id)}
              onContextMenu={(event) => onContextMenu(event, project.id)}
              onDeferToggle={(event) => { event.stopPropagation(); onDeferToggle(project); }}
              onDeferSelect={(option) => onDeferSelect(project, option)}
              onComplete={(event) => { event.stopPropagation(); onComplete(project); }}
              onMore={(event) => { event.stopPropagation(); onMore(event, project); }}
              onResolveDependency={onResolveDependency}
            />
            {children.map((child) => (
              <div key={child.id} className="project-child-row">
                <TaskRow
                  task={child}
                  selected={selectedId === child.id}
                  deferOpen={deferOpenId === child.id}
                  onClick={() => onRowClick(child.id)}
                  onDoubleClick={() => onRowDoubleClick(child.id)}
                  onContextMenu={(event) => onContextMenu(event, child.id)}
                  onDeferToggle={(event) => { event.stopPropagation(); onDeferToggle(child); }}
                  onDeferSelect={(option) => onDeferSelect(child, option)}
                  onComplete={(event) => { event.stopPropagation(); onComplete(child); }}
                  onMore={(event) => { event.stopPropagation(); onMore(event, child); }}
                  onResolveDependency={onResolveDependency}
                />
              </div>
            ))}
            {children.length === 0 && (
              <ProjectDecompositionPanel
                project={project}
                draft={projectDraft?.projectId === project.id ? projectDraft.result : null}
                busy={decomposingId === project.id}
                creating={creatingChildrenId === project.id}
                error={decompositionError}
                onGenerate={() => onGenerateDecomposition(project)}
                onCreate={() => onCreateDraftChildren(project)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProjectDecompositionPanel({
  project,
  draft,
  busy,
  creating,
  error,
  onGenerate,
  onCreate,
}: {
  project: Task;
  draft: ProjectDecompositionResult | null;
  busy: boolean;
  creating: boolean;
  error: string | null;
  onGenerate: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="project-child-empty">
      {!draft ? (
        <>
          <div className="project-empty-title">等待 AI 根据项目目标拆解子任务</div>
          <div className="project-empty-copy">拆解前不会自动生成模板任务；先生成草稿，确认后再创建真实子任务。</div>
          <button className={`btn sm primary${busy ? ' disabled' : ''}`} onClick={onGenerate} disabled={busy}>
            {busy ? '生成中…' : '生成拆解草稿'}
          </button>
        </>
      ) : (
        <>
          <div className="project-draft-head">
            <div>
              <div className="project-empty-title">AI 拆解草稿</div>
              <div className="project-empty-copy">{draft.parentGoal}</div>
            </div>
            <button className={`btn sm primary${creating ? ' disabled' : ''}`} onClick={onCreate} disabled={creating}>
              {creating ? '创建中…' : '创建这些子任务'}
            </button>
          </div>
          <div className="project-draft-list">
            {draft.subtasks.map((subtask) => (
              <div key={`${project.id}-${subtask.title}`} className="project-draft-item">
                <strong>{subtask.title}</strong>
                <span>{subtask.summary}</span>
                <small>{subtask.acceptanceCriteria}</small>
              </div>
            ))}
          </div>
          <div className="project-draft-review">{draft.review}</div>
        </>
      )}
      {error && <div className="project-draft-error">{error}</div>}
    </div>
  );
}

/* ─── Task row ─── */

interface TaskRowProps {
  task: Task;
  selected: boolean;
  deferOpen: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDeferToggle: (e: React.MouseEvent) => void;
  onDeferSelect: (opt: string) => void;
  onComplete: (e: React.MouseEvent) => void;
  onMore: (e: React.MouseEvent) => void;
  onResolveDependency: (task: Task) => void;
}

function TaskRow({
  task, selected, deferOpen,
  onClick, onDoubleClick, onContextMenu,
  onDeferToggle, onDeferSelect, onComplete, onMore, onResolveDependency,
}: TaskRowProps) {
  return (
    <div
      className={`task-row${selected ? ' selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Status dot */}
      <span className={`dot ${statusDot(task.status)}`} style={{ flexShrink: 0 }} />

      {/* Title + metadata */}
      <div className="task-row-body">
        <span className="task-row-title">{task.title}</span>
        <div className="task-row-meta">
          {task.type !== 'simple' && (
            <span className="tag">
              {task.type === 'project' ? '项目' : task.type === 'scheduled' ? '定时' : '事件'}
            </span>
          )}
          {task.whyNow && !selected && (
            <span className="task-row-why">{task.whyNow}</span>
          )}
          {task.waitingOn && (
            <span className={`task-row-waiting${task.dependencyReady ? ' ready' : ''}`}>{task.waitingOn}</span>
          )}
        </div>
      </div>

      {/* Right side: timestamp or action buttons */}
      {selected ? (
        <div className="task-row-actions" onClick={(e) => e.stopPropagation()}>
          {task.dependencyReady && task.dependencyId && (
            <button className="btn sm" onClick={() => onResolveDependency(task)}>解除依赖</button>
          )}
          <div style={{ position: 'relative' }}>
            <button className="btn sm ghost" onClick={onDeferToggle}>延后 ▾</button>
            {deferOpen && (
              <div className="defer-menu">
                {DEFER_OPTIONS.map((opt) => (
                  <button key={opt.value} className="defer-option"
                    onClick={(e) => { e.stopPropagation(); onDeferSelect(opt.value); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn sm" onClick={onComplete}>完成</button>
          <button className="btn sm ghost" onClick={onMore} style={{ padding: '3px 6px' }}>⋯</button>
        </div>
      ) : (
        <span className="task-row-date">{task.updatedAt}</span>
      )}
    </div>
  );
}

function statusDot(status: TaskStatus): string {
  if (status === 'running') return 'running';
  if (status === 'waiting') return 'waiting';
  if (status === 'blocked') return 'risk';
  if (status === 'done') return 'completed';
  return '';
}

/* ─── Task preview ─── */

interface TaskPreviewProps {
  task: Task;
  keySources: SourceContextRecord[];
  hasPendingDecision: boolean;
  onOpenWorkbench: () => void;
  onOpenDecision: () => void;
}

function TaskPreview({ task, keySources, hasPendingDecision, onOpenWorkbench, onOpenDecision }: TaskPreviewProps) {
  return (
    <div className="task-preview-inner">
      <div className="task-preview-head">
        <span className={`tag lane-${task.lane}`}>{LANE_LABELS[task.lane]}</span>
        <h3 className="task-preview-title">{task.title}</h3>
        <div className="task-preview-type-row">
          <span className="tag">{TASK_TYPE_LABELS[task.type]}</span>
          {task.type === 'project' && <span className="preview-type-hint">可在项目型 Lens 查看</span>}
          {task.type === 'scheduled' && <span className="preview-type-hint">周期触发</span>}
          {task.type === 'event' && <span className="preview-type-hint">监听外部条件</span>}
        </div>
      </div>

      {task.whyNow && (
        <div className="preview-section">
          <div className="preview-label">为什么现在</div>
          <div className={`why-now${task.lane === 'escalate' ? ' risk' : task.lane === 'unblock' ? ' waiting' : ''}`}>
            {task.whyNow}
          </div>
        </div>
      )}

      {task.nextStep && (
        <div className="preview-section">
          <div className="preview-label">下一步</div>
          <p className="preview-text">{task.nextStep}</p>
        </div>
      )}

      {task.waitingOn && (
        <div className="preview-section">
          <div className="preview-chip">
            <span className="dot waiting" />
            {task.waitingOn}
          </div>
        </div>
      )}

      {task.schedule && (
        <div className="preview-section">
          <div className="preview-label">定时配置</div>
          <div className="preview-chip">
            <span>🔁</span>
            <span>{task.schedule}</span>
          </div>
        </div>
      )}

      {task.trigger && (
        <div className="preview-section">
          <div className="preview-label">触发条件</div>
          <div className="preview-chip">
            <span>⚡</span>
            <span>{task.trigger}</span>
          </div>
        </div>
      )}

      {task.commitment && (
        <div className="preview-section">
          <div className="preview-label">已承诺</div>
          <div className="preview-chip">
            <span>🤝</span>
            <span style={{ marginLeft: 4 }}>{task.commitment}</span>
          </div>
        </div>
      )}

      {keySources.length > 0 && (
        <div className="preview-section">
          <div className="preview-label">关键来源</div>
          <div className="preview-sources">
            {keySources.map((source) => (
              <div key={source.id} className="preview-source-item">
                {source.title}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="preview-actions">
        <button className="btn primary" onClick={hasPendingDecision ? onOpenDecision : onOpenWorkbench}>
          {hasPendingDecision ? '去拍板 →' : '打开工作台 →'}
        </button>
      </div>
    </div>
  );
}

/* ─── Context menu ─── */

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onOpenWorkbench: () => void;
}

function ContextMenu({ x, y, onClose, onOpenWorkbench }: ContextMenuProps) {
  const items = [
    { label: '打开工作台', action: onOpenWorkbench },
    { label: '移至项目', action: onClose },
    { label: '改优先级', action: onClose },
    { label: '归档', action: onClose },
    { label: '复制链接', action: onClose },
  ];

  return (
    <div
      className="ctx-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button key={item.label} className="ctx-menu-item" onClick={item.action}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
