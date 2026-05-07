import { useState, useRef, useCallback, useEffect } from 'react';
import type { ProjectDecompositionResult } from '@shared/types/ipc';
import type { TaskListItemRecord, TaskRiskLevel, TaskState } from '@shared/types/task';
import type { SourceContextRecord } from '@shared/types/source-context';
import type { DecisionRecord } from '@shared/types/decision';
import { TaskCompletionCheckModal } from '../components/TaskCompletionCheckModal';
import {
  defaultScheduleForType,
  defaultTriggerForType,
  inferTaskExecutionType,
  loadTaskAttributes,
  moveTaskToProject,
  saveTaskAttributes,
  type TaskAttributeRecord,
  type TaskExecutionType,
} from '../lib/taskAttributes';
import { selectApplicableWorkHabits, type WorkHabitRecord } from '../lib/workHabits';

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
  | 'committed' | 'done'
  | `project:${string}`;

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

const RISK_OPTIONS: Array<{ label: string; value: TaskRiskLevel }> = [
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
  { label: '无', value: 'none' },
];

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

function isUnconfirmedPanelCapture(record: TaskListItemRecord): boolean {
  return record.state === 'captured' && (record.summary ?? '').startsWith('从右侧面板捕获：');
}

function confirmedTaskRecords(records: TaskListItemRecord[]): TaskListItemRecord[] {
  return records.filter((record) => !isUnconfirmedPanelCapture(record));
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
      setAllTasks(confirmedTaskRecords(records).map((record) => fromRecord(record, attrs[record.id])));
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
        setAllTasks(confirmedTaskRecords(records).map((record) => fromRecord(record, attrs[record.id])));
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

  const projectParents = allTasks.filter((task) => task.type === 'project' && !task.parentTaskId);
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
    if (lens.startsWith('project:')) {
      const projectId = lens.slice('project:'.length);
      return t.id === projectId || t.parentTaskId === projectId;
    }
    return true;
  });

  const selectedTask = filtered.find((t) => t.id === selectedId) ?? null;
  const selectedHasDecision = Boolean(selectedTask && pendingDecisions.some((decision) => decision.taskId === selectedTask.id));
  const captureSopSuggestions = captureTitle.trim()
    ? selectApplicableWorkHabits({
        taskTitle: captureTitle,
        taskTypeLabel: TASK_TYPE_LABELS[captureType],
        limit: 4,
      }).filter((habit): habit is WorkHabitRecord => habit.source === 'sop')
    : [];

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

  function updateTaskRisk(taskId: string, riskLevel: TaskRiskLevel) {
    const nextLane: Lane = riskLevel === 'high'
      ? 'escalate'
      : riskLevel === 'medium'
        ? 'unblock'
        : 'continue';
    setContextMenu(null);
    setSelectedId(taskId);
    setAllTasks((prev) => prev.map((task) => (
      task.id === taskId
        ? { ...task, lane: nextLane, status: riskLevel === 'high' ? 'blocked' : task.status }
        : task
    )));
    window.api?.updateTask({ id: taskId, riskLevel }).catch(() => reloadTasks());
  }

  function archiveTask(taskId: string) {
    const task = allTasks.find((item) => item.id === taskId);
    if (!task) return;
    setContextMenu(null);
    setSelectedId(null);
    setAllTasks((prev) => prev.filter((item) => item.id !== taskId));
    transitionWithPlanningHop(task, 'archived').catch(() => reloadTasks());
  }

  function copyTaskLink(taskId: string) {
    setContextMenu(null);
    const link = `taskplane://task/${taskId}`;
    void navigator.clipboard?.writeText(link).catch(() => {});
  }

  function moveIntoProject(taskId: string, projectId: string | null) {
    const result = moveTaskToProject(taskId, projectId);
    setContextMenu(null);
    setSelectedId(taskId);
    setAllTasks((prev) => prev.map((task) => {
      if (task.id === taskId) {
        return { ...task, parentTaskId: result.task.parentTaskId ?? undefined };
      }
      if (result.previousProject && task.id === result.previousProject.taskId) {
        return { ...task, childTaskIds: result.previousProject.childTaskIds };
      }
      if (result.nextProject && task.id === result.nextProject.taskId) {
        return { ...task, type: 'project', childTaskIds: result.nextProject.childTaskIds };
      }
      return task;
    }));
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

        {projectParents.length > 0 && (
          <>
            <div className="lens-group-label">归属</div>
            {projectParents.map((project) => (
              <LensItem
                key={project.id}
                label={project.title}
                active={lens === `project:${project.id}`}
                onClick={() => setLens(`project:${project.id}`)}
                icon="□"
                count={allTasks.filter((task) => task.parentTaskId === project.id).length}
              />
            ))}
          </>
        )}

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
            <div className="capture-type-suggestion">
              <span>AI 建议类型</span>
              <strong>{TASK_TYPE_LABELS[captureType]}</strong>
            </div>
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
            <div className="capture-type-note">
              类型由 AI 根据标题预判，你只需要确认或调整建议；点击创建即确认当前建议。定时/事件会先创建单条任务，周期和触发条件可在工作台 Header 调整；项目型先生成拆解草稿，确认后才创建真实子任务。
            </div>
            {captureSopSuggestions.length > 0 && (
              <div className="capture-sop-suggestions">
                <span>可参考流程模板</span>
                {captureSopSuggestions.slice(0, 2).map((habit) => (
                  <strong key={habit.id}>{habit.rule}</strong>
                ))}
                <small>创建后 AI 会在规划讨论中建议是否加载，不会自动套用。</small>
              </div>
            )}
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
          task={allTasks.find((task) => task.id === contextMenu.taskId) ?? null}
          projects={projectParents}
          onClose={closeContextMenu}
          onOpenWorkbench={() => { onOpenWorkbench(contextMenu.taskId); closeContextMenu(); }}
          onMoveToProject={(projectId) => moveIntoProject(contextMenu.taskId, projectId)}
          onUpdateRisk={(riskLevel) => updateTaskRisk(contextMenu.taskId, riskLevel)}
          onArchive={() => archiveTask(contextMenu.taskId)}
          onCopyLink={() => copyTaskLink(contextMenu.taskId)}
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
                <small>验收：{subtask.acceptanceCriteria}</small>
                {subtask.dependency && <small>依赖：{subtask.dependency}</small>}
                <small>独立性：{subtask.rationale}</small>
              </div>
            ))}
          </div>
          <div className="project-draft-review">
            <div className="project-draft-review-title">拆解自检</div>
            <div className="project-draft-checks">
              <span>大块任务</span>
              <span>边界独立</span>
              <span>依赖明确</span>
              <span>验收可见</span>
            </div>
            <p>{draft.review}</p>
            <small>{draft.nextStep}</small>
            <small>层级规则：最多保持项目 → 子任务两层；复杂子任务应升级为项目型重新拆解。</small>
          </div>
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
          <p className="preview-config-note">周期配置保存在任务属性中，每次触发会在执行记录里形成独立 Run。</p>
        </div>
      )}

      {task.trigger && (
        <div className="preview-section">
          <div className="preview-label">触发条件</div>
          <div className="preview-chip">
            <span>⚡</span>
            <span>{task.trigger}</span>
          </div>
          <p className="preview-config-note">事件触发任务是一条持续监听规则，触发结果会追加到任务产物和执行记录，不会自动新建散乱任务。</p>
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
  task: Task | null;
  projects: Task[];
  onClose: () => void;
  onOpenWorkbench: () => void;
  onMoveToProject: (projectId: string | null) => void;
  onUpdateRisk: (riskLevel: TaskRiskLevel) => void;
  onArchive: () => void;
  onCopyLink: () => void;
}

function ContextMenu({
  x,
  y,
  task,
  projects,
  onClose,
  onOpenWorkbench,
  onMoveToProject,
  onUpdateRisk,
  onArchive,
  onCopyLink,
}: ContextMenuProps) {
  const projectOptions = task
    ? projects.filter((project) => project.id !== task.id && project.id !== task.parentTaskId)
    : [];
  const items = [
    { label: '打开工作台', action: onOpenWorkbench },
    { label: '归档', action: onArchive },
    { label: '复制链接', action: onCopyLink },
  ];

  return (
    <div
      className="ctx-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="ctx-menu-item muted" onClick={onClose}>
        移至项目
      </button>
      {projectOptions.map((project) => (
        <button key={project.id} className="ctx-menu-item sub" onClick={() => onMoveToProject(project.id)}>
          {project.title}
        </button>
      ))}
      {task?.parentTaskId && (
        <button className="ctx-menu-item sub" onClick={() => onMoveToProject(null)}>
          移出项目
        </button>
      )}
      <button className="ctx-menu-item muted" onClick={onClose}>
        改优先级
      </button>
      {RISK_OPTIONS.map((option) => (
        <button key={option.value} className="ctx-menu-item sub" onClick={() => onUpdateRisk(option.value)}>
          {option.label}
        </button>
      ))}
      {items.map((item) => (
        <button key={item.label} className="ctx-menu-item" onClick={item.action}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
