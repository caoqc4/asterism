import { useState } from 'react';

type WorkbenchTab = 'runs' | 'sources' | 'artifacts' | 'activity';

const TAB_LABELS: Record<WorkbenchTab, string> = {
  runs:      '执行',
  sources:   '来源',
  artifacts: '产物',
  activity:  '活动',
};

const MOCK_TASKS: Record<string, { title: string; lane: string; status: string; project?: string }> = {
  't-001': { title: '品牌合作来信回复', lane: 'escalate', status: 'idle', project: '外部合作' },
  't-002': { title: 'Q2 财报分析报告', lane: 'unblock', status: 'waiting', project: '财务' },
  't-003': { title: '周例会纪要整理', lane: 'continue', status: 'running' },
  't-004': { title: '官网改版项目', lane: 'continue', status: 'idle', project: '产品' },
  't-005': { title: '竞品调研报告', lane: 'clarify', status: 'idle', project: '产品' },
  't-006': { title: '每日邮件监控', lane: 'steady', status: 'running' },
  't-007': { title: '月度数据报表', lane: 'steady', status: 'idle' },
};

const LANE_LABELS: Record<string, string> = {
  escalate: 'Escalate now',
  unblock:  'Unblock or decide',
  continue: 'Continue or review',
  clarify:  'Clarify',
  steady:   'Steady',
};

interface WorkbenchPageProps {
  taskId: string;
  onBack: () => void;
  onOpenPanel: () => void;
}

export function WorkbenchPage({ taskId, onBack, onOpenPanel }: WorkbenchPageProps) {
  const [tab, setTab] = useState<WorkbenchTab>('runs');
  const task = MOCK_TASKS[taskId] ?? { title: taskId, lane: 'steady', status: 'idle' };

  return (
    <div className="workbench">
      {/* Header */}
      <div className="workbench-header">
        <div className="workbench-header-top">
          <div className="workbench-title-row">
            <h2 className="workbench-title">{task.title}</h2>
            <div className="workbench-header-tags">
              <span className={`tag lane-${task.lane}`}>{LANE_LABELS[task.lane]}</span>
              {task.project && <span className="tag">{task.project}</span>}
              <StatusBadge status={task.status} />
            </div>
          </div>
          <div className="workbench-header-actions">
            <button className="icon-btn" onClick={onOpenPanel} title="AI 面板">
              <IconChat />
            </button>
            <button className="icon-btn" title="更多操作">
              <IconMore />
            </button>
          </div>
        </div>
      </div>

      {/* Resume Card */}
      <div className="resume-card">
        <div className="resume-narrative">
          <p>
            {task.status === 'running'
              ? `当前有活跃 Run 正在执行中。上次检查点已完成 80%，预计 15 分钟内可完成剩余步骤。`
              : task.status === 'waiting'
              ? `任务等待用户决策中——核心指标口径需要你拍板，拍板后 AI 可立即继续后续分析。`
              : `任务当前处于待处理状态。根据优先级判断，现在是推进的好时机。`}
          </p>
          <p className="resume-context">
            {task.lane === 'escalate'
              ? '对方已等待 48 小时，建议今日内完成回复。'
              : task.lane === 'unblock'
              ? '等待你的输入是当前唯一阻塞点，其他准备工作已就绪。'
              : '可随时继续，无外部依赖。'}
          </p>
        </div>

        <div className="resume-card-footer">
          <div className="resume-actions">
            <button className="btn primary">
              {task.status === 'running'
                ? '查看进度 →'
                : task.lane === 'unblock'
                ? '去拍板 →'
                : '启动 Run →'}
            </button>
            {task.status !== 'running' && (
              <button className="btn ghost">规划讨论</button>
            )}
          </div>
          <button className="btn sm ghost resume-regen">
            <IconRefresh /> 重新生成
          </button>
        </div>

        {task.status === 'running' && (
          <div className="run-progress">
            <div className="run-progress-bar">
              <div className="run-progress-fill" style={{ width: '80%' }} />
            </div>
            <span className="run-progress-label">步骤 4 / 5 · 约 15 分钟</span>
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
        {tab === 'runs' && <RunsTab taskId={taskId} isRunning={task.status === 'running'} />}
        {tab === 'sources' && <SourcesTab />}
        {tab === 'artifacts' && <ArtifactsTab />}
        {tab === 'activity' && <ActivityTab />}
      </div>
    </div>
  );
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

function RunsTab({ taskId, isRunning }: { taskId: string; isRunning: boolean }) {
  return (
    <div className="tab-content">
      {isRunning && (
        <div className="run-item run-active">
          <div className="run-item-header">
            <span className="dot running" />
            <span className="run-item-name">Run #4 · 执行中</span>
            <span className="run-item-time muted">约 15 分钟前启动</span>
          </div>
          <div className="run-steps">
            <RunStep label="收集来源数据" done />
            <RunStep label="分析内容" done />
            <RunStep label="生成结构化摘要" done />
            <RunStep label="撰写结论" active />
            <RunStep label="自检查" pending />
          </div>
        </div>
      )}
      <div className="run-item">
        <div className="run-item-header">
          <span className="dot completed" />
          <span className="run-item-name">Run #3 · 已完成</span>
          <span className="run-item-time muted">4/29</span>
        </div>
      </div>
      <div className="run-item">
        <div className="run-item-header">
          <span className="dot" />
          <span className="run-item-name">Run #2 · 已完成</span>
          <span className="run-item-time muted">4/25</span>
        </div>
      </div>
      {!isRunning && (
        <button className="btn sm" style={{ marginTop: 12 }}>+ 新建 Run</button>
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

function SourcesTab() {
  const sources = [
    { type: 'EMAIL', label: 'Re: 合作意向确认', date: '5/1' },
    { type: 'FILE', label: '数据包 v2.xlsx', date: '4/29' },
    { type: 'NOTE', label: '上次例会纪要', date: '4/28' },
  ];
  return (
    <div className="tab-content">
      {sources.map((s) => (
        <div key={s.label} className="source-item">
          <span className="tag captured">{s.type}</span>
          <span className="source-label">{s.label}</span>
          <span className="muted" style={{ marginLeft: 'auto' }}>{s.date}</span>
        </div>
      ))}
      <button className="btn sm ghost" style={{ marginTop: 8 }}>+ 添加来源</button>
    </div>
  );
}

/* ─── Artifacts tab ─── */

function ArtifactsTab() {
  return (
    <div className="tab-content">
      <div className="tab-empty">暂无产物文件。Run 完成后产出的文件会出现在这里。</div>
    </div>
  );
}

/* ─── Activity tab ─── */

function ActivityTab() {
  const events = [
    { time: '5/3 14:22', text: 'Run #4 启动' },
    { time: '4/29 10:05', text: 'Run #3 完成，产出摘要草稿' },
    { time: '4/28 09:30', text: '任务创建' },
  ];
  return (
    <div className="tab-content">
      {events.map((e) => (
        <div key={e.time} className="activity-item">
          <span className="activity-time muted">{e.time}</span>
          <span className="activity-text">{e.text}</span>
        </div>
      ))}
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
