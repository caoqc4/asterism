import { useState, useRef, useCallback, useEffect } from 'react';
import type { TaskListItemRecord, TaskState } from '@shared/types/task';
import { TaskCompletionCheckModal } from '../components/TaskCompletionCheckModal';

type Lane = 'escalate' | 'unblock' | 'continue' | 'clarify' | 'steady';
type TaskStatus = 'running' | 'waiting' | 'blocked' | 'idle' | 'done';
type TaskType = 'project' | 'scheduled' | 'event' | 'simple';
type ViewMode = 'lane' | 'list' | 'timeline';

interface Task {
  id: string;
  title: string;
  lane: Lane;
  status: TaskStatus;
  type: TaskType;
  whyNow?: string;
  nextStep?: string;
  waitingOn?: string;
  commitment?: string;
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
  if (r.activeBlocker) return 'blocked';
  if (r.state === 'completed' || r.state === 'archived') return 'done';
  return 'idle';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fromRecord(r: TaskListItemRecord): Task {
  return {
    id: r.id,
    title: r.title,
    lane: derivelane(r),
    status: deriveStatus(r),
    type: 'simple',
    whyNow: r.summary ?? undefined,
    nextStep: r.nextStep ?? undefined,
    waitingOn: r.waitingReason ? `等待：${r.waitingReason}` : undefined,
    updatedAt: formatDate(r.updatedAt),
    state: r.state,
  };
}

interface TasksPageProps {
  onOpenPanel: (taskId: string) => void;
  onOpenWorkbench: (taskId: string) => void;
}

export function TasksPage({ onOpenPanel, onOpenWorkbench }: TasksPageProps) {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [lens, setLens] = useState<Lens>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('lane');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deferOpenId, setDeferOpenId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [completionCheckTask, setCompletionCheckTask] = useState<Task | null>(null);

  const [showCapture, setShowCapture] = useState(false);
  const [captureTitle, setCaptureTitle] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [capturedId, setCapturedId] = useState<string | null>(null);

  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reloadTasks() {
    window.api?.listTasks().then((records) => {
      setAllTasks(records.map(fromRecord));
    }).catch(() => {});
  }

  // Load real tasks from backend when available
  useEffect(() => {
    if (!window.api) return;
    setLoading(true);
    window.api.listTasks()
      .then((records) => {
        setAllTasks(records.map(fromRecord));
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const unsub = window.api.subscribeToEvents((event) => {
      if (event.type === 'task.changed') reloadTasks();
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
      if (window.api) {
        const record = await window.api.createTask({ title });
        newId = record.id;
        setAllTasks((prev) => [fromRecord({ ...record, activeBlocker: null, activeWaitingItem: null }), ...prev]);
      } else {
        newId = `t-${Date.now()}`;
        const fake: Task = {
          id: newId, title, lane: 'clarify', status: 'idle',
          type: 'simple',
          updatedAt: new Date().toLocaleDateString('zh'),
          state: 'captured',
        };
        setAllTasks((prev) => [fake, ...prev]);
      }
      setCaptureTitle('');
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
          count={allTasks.filter(t => t.type === 'project').length} />
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
              onChange={(e) => setCaptureTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void captureTask(); }
                if (e.key === 'Escape') { setShowCapture(false); setCaptureTitle(''); }
              }}
            />
            <div className="capture-actions">
              <button className={`btn sm primary${capturing ? ' disabled' : ''}`} onClick={() => void captureTask()} disabled={!captureTitle.trim() || capturing}>
                {capturing ? '创建中…' : '创建'}
              </button>
              <button className="btn sm ghost" onClick={() => { setShowCapture(false); setCaptureTitle(''); }}>
                取消
              </button>
              <span className="capture-ai-hint muted">
                想让 AI 帮你拆解？创建后打开右上角对话
              </span>
            </div>
          </div>
        )}

        {/* Post-capture AI nudge */}
        {capturedId && (
          <div className="capture-nudge">
            <span>✓ 已创建</span>
            <button className="btn sm primary" onClick={() => { onOpenPanel(capturedId); setCapturedId(null); }}>
              让 AI 帮你拆解 →
            </button>
            <button className="icon-btn" style={{ marginLeft: 4 }} onClick={() => setCapturedId(null)} title="关闭">
              <span style={{ fontSize: 12, lineHeight: 1 }}>×</span>
            </button>
          </div>
        )}

        {/* Task rows */}
        <div className="task-list">
          {viewMode === 'lane' ? (
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
          <TaskPreview task={selectedTask} onOpenWorkbench={() => onOpenWorkbench(selectedTask.id)} />
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
}

function TaskRow({
  task, selected, deferOpen,
  onClick, onDoubleClick, onContextMenu,
  onDeferToggle, onDeferSelect, onComplete, onMore,
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
        </div>
      </div>

      {/* Right side: timestamp or action buttons */}
      {selected ? (
        <div className="task-row-actions" onClick={(e) => e.stopPropagation()}>
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
  onOpenWorkbench: () => void;
}

function TaskPreview({ task, onOpenWorkbench }: TaskPreviewProps) {
  return (
    <div className="task-preview-inner">
      <div className="task-preview-head">
        <span className={`tag lane-${task.lane}`}>{LANE_LABELS[task.lane]}</span>
        <h3 className="task-preview-title">{task.title}</h3>
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

      {task.commitment && (
        <div className="preview-section">
          <div className="preview-label">已承诺</div>
          <div className="preview-chip">
            <span>🤝</span>
            <span style={{ marginLeft: 4 }}>{task.commitment}</span>
          </div>
        </div>
      )}

      <div className="preview-actions">
        <button className="btn primary" onClick={onOpenWorkbench}>
          打开工作台 →
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
