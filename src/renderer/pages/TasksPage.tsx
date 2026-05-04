import { useState, useRef, useCallback } from 'react';

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
  project?: string;
  whyNow?: string;
  nextStep?: string;
  waitingOn?: string;
  commitment?: string;
  sources?: string[];
  updatedAt: string;
}

const LANE_LABELS: Record<Lane, string> = {
  escalate: 'Escalate now',
  unblock:  'Unblock or decide',
  continue: 'Continue or review',
  clarify:  'Clarify',
  steady:   'Steady',
};

const LANE_ORDER: Lane[] = ['escalate', 'unblock', 'continue', 'clarify', 'steady'];

const MOCK_TASKS: Task[] = [
  {
    id: 't-001', title: '品牌合作来信回复', lane: 'escalate', status: 'idle',
    type: 'simple', project: '外部合作',
    whyNow: '对方已等待 48 小时，再不回复可能失去合作机会。',
    nextStep: '确认合作意向，起草初步回复邮件。',
    sources: ['邮件: Re: 合作意向确认', '日历: 对接会议 5/6'],
    updatedAt: '5/1',
  },
  {
    id: 't-002', title: 'Q2 财报分析报告', lane: 'unblock', status: 'waiting',
    type: 'simple', project: '财务',
    whyNow: '数据团队已送达原始数据，等你拍板核心指标口径后可以继续。',
    nextStep: '拍板核心指标口径，解锁后续分析。',
    waitingOn: '等待：用户确认指标口径',
    commitment: '本周五前完成初稿',
    sources: ['数据包 v2.xlsx', '上次例会纪要'],
    updatedAt: '4/29',
  },
  {
    id: 't-003', title: '周例会纪要整理', lane: 'continue', status: 'running',
    type: 'simple',
    whyNow: '上次 Run 完成 80%，剩余结论部分约 15 分钟可完成。',
    nextStep: '完成结论摘要，发送给与会人员。',
    updatedAt: '5/3',
  },
  {
    id: 't-004', title: '官网改版项目', lane: 'continue', status: 'idle',
    type: 'project', project: '产品',
    whyNow: '设计稿已确认，开发排期待确定。',
    nextStep: '与开发团队确认排期。',
    updatedAt: '4/28',
  },
  {
    id: 't-005', title: '竞品调研报告', lane: 'clarify', status: 'idle',
    type: 'simple', project: '产品',
    whyNow: '调研范围还未明确，需要先对齐再开始。',
    nextStep: '明确调研范围和输出格式。',
    updatedAt: '4/25',
  },
  {
    id: 't-006', title: '每日邮件监控', lane: 'steady', status: 'running',
    type: 'event',
    whyNow: '自动运行中，无需操作。',
    updatedAt: '5/4',
  },
  {
    id: 't-007', title: '月度数据报表', lane: 'steady', status: 'idle',
    type: 'scheduled',
    whyNow: '下次执行：5 月 31 日。',
    updatedAt: '4/30',
  },
];

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

interface TasksPageProps {
  onOpenPanel: (taskId: string) => void;
  onOpenWorkbench: (taskId: string) => void;
}

export function TasksPage({ onOpenPanel, onOpenWorkbench }: TasksPageProps) {
  const [lens, setLens] = useState<Lens>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('lane');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deferOpenId, setDeferOpenId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);

  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = MOCK_TASKS.filter((t) => {
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

  function groupByLane(tasks: Task[]): Record<Lane, Task[]> {
    const result = {} as Record<Lane, Task[]>;
    LANE_ORDER.forEach((lane) => { result[lane] = []; });
    tasks.forEach((t) => result[t.lane].push(t));
    return result;
  }

  return (
    <div className="tasks-page" onClick={closeContextMenu}>
      {/* Lenses Rail */}
      <aside className="lenses-rail">
        <LensItem label="全部" active={lens === 'all'} onClick={() => setLens('all')}
          count={MOCK_TASKS.length} />

        <div className="lens-group-label">执行状态</div>
        <LensItem label="Running" active={lens === 'running'} onClick={() => setLens('running')}
          dot="running" count={MOCK_TASKS.filter(t => t.status === 'running').length} />
        <LensItem label="等待中 7d+" active={lens === 'waiting'} onClick={() => setLens('waiting')}
          dot="waiting" count={MOCK_TASKS.filter(t => t.status === 'waiting').length} />
        <LensItem label="有风险" active={lens === 'blocked'} onClick={() => setLens('blocked')}
          dot="risk" count={MOCK_TASKS.filter(t => t.status === 'blocked').length} />

        <div className="lens-group-label">任务类型</div>
        <LensItem label="项目型" active={lens === 'project'} onClick={() => setLens('project')} icon="📁" />
        <LensItem label="定时任务" active={lens === 'scheduled'} onClick={() => setLens('scheduled')} icon="🔁" />
        <LensItem label="事件触发" active={lens === 'event'} onClick={() => setLens('event')} icon="⚡" />

        <div className="lens-group-label" style={{ marginTop: 'auto' }}>特殊视角</div>
        <LensItem label="已承诺" active={lens === 'committed'} onClick={() => setLens('committed')} icon="🤝" />
        <LensItem label="已完成 / 归档" active={lens === 'done'} onClick={() => setLens('done')} icon="🗄" />
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
          <button className="btn sm primary" style={{ marginLeft: 'auto' }}>
            + 新建任务
          </button>
        </div>

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
                      onDeferToggle={(e) => {
                        e.stopPropagation();
                        setDeferOpenId((prev) => (prev === task.id ? null : task.id));
                      }}
                      onComplete={(e) => {
                        e.stopPropagation();
                        setSelectedId(null);
                      }}
                      onMore={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, task.id);
                      }}
                    />
                  ))}
                </div>
              );
            })
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
                onComplete={(e) => {
                  e.stopPropagation();
                  setSelectedId(null);
                }}
                onMore={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, task.id);
                }}
              />
            ))
          )}
          {filtered.length === 0 && (
            <div className="tasks-empty">当前视角下没有任务</div>
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
  onComplete: (e: React.MouseEvent) => void;
  onMore: (e: React.MouseEvent) => void;
}

function TaskRow({
  task, selected, deferOpen,
  onClick, onDoubleClick, onContextMenu,
  onDeferToggle, onComplete, onMore,
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
          {task.project && <span className="tag">{task.project}</span>}
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
                    onClick={(e) => { e.stopPropagation(); }}>
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

      {(task.waitingOn || task.commitment) && (
        <div className="preview-section">
          {task.waitingOn && (
            <div className="preview-chip">
              <span className="dot waiting" />
              {task.waitingOn}
            </div>
          )}
          {task.commitment && (
            <div className="preview-chip">
              🤝 {task.commitment}
            </div>
          )}
        </div>
      )}

      {task.sources && task.sources.length > 0 && (
        <div className="preview-section">
          <div className="preview-label">关键来源</div>
          <div className="preview-sources">
            {task.sources.slice(0, 3).map((s) => (
              <div key={s} className="preview-source-item">{s}</div>
            ))}
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
