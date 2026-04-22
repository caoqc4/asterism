import type { HomeBriefData, RecommendedAction } from '@shared/types/brief';
import type { ArtifactRecord } from '@shared/types/artifact';
import type { AiConfigStatus } from '@shared/types/settings';
import type { PingResponse } from '@shared/types/ipc';

function renderTaskSignal(task: HomeBriefData['recentTasks'][number]) {
  return [
    task.nextStep ? `下一步：${task.nextStep}` : null,
    task.activeWaitingItem?.reason ?? task.waitingReason
      ? `等待：${task.activeWaitingItem?.reason ?? task.waitingReason}`
      : null,
    task.riskLevel !== 'none'
      ? `风险：${task.riskLevel}${task.riskNote ? ` · ${task.riskNote}` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' | ');
}

type HomePageProps = {
  ping: PingResponse | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  aiStatus: AiConfigStatus | null;
  briefData: HomeBriefData | null;
  onOpenAction: (action: RecommendedAction) => void;
  onOpenArtifact: (artifact: ArtifactRecord) => void;
};

export function HomePage({
  ping,
  status,
  aiStatus,
  briefData,
  onOpenAction,
  onOpenArtifact,
}: HomePageProps) {
  function openWaitingTask(task: HomeBriefData['waitingTasks'][number]) {
    onOpenAction({
      id: `home-waiting:${task.id}`,
      label: `跟进等待中的任务：${task.title}`,
      reason: task.activeWaitingItem?.reason ?? task.waitingReason ?? '该任务处于等待状态，需要恢复推进。',
      taskId: task.id,
      priority: 'medium',
      intent: {
        type: 'focus_waiting_follow_up',
        focusArea: 'detail',
        prefillNextStep: `跟进并确认是否解除等待：${
          task.activeWaitingItem?.reason ?? task.waitingReason ?? task.title
        }`,
      },
    });
  }

  function openRiskTask(task: HomeBriefData['highRiskTasks'][number]) {
    onOpenAction({
      id: `home-risk:${task.id}`,
      label: `优先处理高风险任务：${task.title}`,
      reason: task.riskNote ?? '该任务当前处于高风险状态。',
      taskId: task.id,
      priority: 'high',
      intent: {
        type: 'focus_risk_review',
        focusArea: 'detail',
        prefillNextStep: `处理当前风险并确认是否需要降级：${task.riskNote ?? task.title}`,
        prefillRiskLevel: 'high',
        prefillRiskNote: task.riskNote,
      },
    });
  }

  function openNextStepTask(task: HomeBriefData['missingNextStepTasks'][number]) {
    onOpenAction({
      id: `home-next-step:${task.id}`,
      label: `补充下一步：${task.title}`,
      reason: '该任务仍缺少明确下一步，后续推进成本会升高。',
      taskId: task.id,
      priority: 'medium',
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
      },
    });
  }

  return (
    <section className="page-grid">
      <article className="panel hero page-hero">
        <p className="eyebrow">Home / Brief</p>
        <h1>本地优先控制台骨架已进入任务闭环阶段</h1>
        <p className="lede">
          当前已经接通 Main 持有的 SQLite 与本地凭据存储。下一步可以继续把 Decisions、Runs 和
          Brief 聚合查询接上。
        </p>
      </article>

      <article className="panel">
        <h2>系统健康</h2>
        <p className={`status status-${status}`}>IPC：{status}</p>
        <p>{ping ? ping.message : '等待 Main 进程响应...'}</p>
        <p className="meta">{ping ? ping.timestamp : '尚未返回时间戳'}</p>
      </article>

      <article className="panel">
        <h2>本地配置状态</h2>
        <p className="meta">
          {aiStatus?.configured
            ? `已配置 ${aiStatus.provider} / ${aiStatus.model}`
            : '尚未配置 AI Provider'}
        </p>
        <p className="meta">
          Scheduler：
          {briefData?.schedulerStatus.enabled
            ? briefData.schedulerStatus.running
              ? ' 已启用并运行中'
              : ' 已启用但未运行'
            : ' 未启用'}
        </p>
        <p className="meta">
          最近 brief：{briefData?.schedulerStatus.lastBriefAt ?? '暂无'}
        </p>
        <p className="meta">
          最近 run sweep：{briefData?.schedulerStatus.lastRunSweepAt ?? '暂无'}
        </p>
      </article>

      <article className="panel">
        <h2>今日概览</h2>
        <div className="metric-grid">
          <div className="metric-card">
            <span className="metric-label">Active Tasks</span>
            <strong>{briefData?.activeTaskCount ?? 0}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Needs Decision</span>
            <strong>{briefData?.pendingDecisionCount ?? 0}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Completed</span>
            <strong>{briefData?.completedTaskCount ?? 0}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Recent Runs</span>
            <strong>{briefData?.recentRunCount ?? 0}</strong>
          </div>
          <div className="metric-card metric-card-warning">
            <span className="metric-label">Waiting</span>
            <strong>{briefData?.waitingTaskCount ?? 0}</strong>
          </div>
          <div className="metric-card metric-card-danger">
            <span className="metric-label">High Risk</span>
            <strong>{briefData?.highRiskTaskCount ?? 0}</strong>
          </div>
          <div className="metric-card metric-card-muted">
            <span className="metric-label">Missing Next Step</span>
            <strong>{briefData?.missingNextStepTaskCount ?? 0}</strong>
          </div>
        </div>
      </article>

      <article className="panel page-hero">
        <h2>Recommended Actions</h2>
        <div className="task-list">
          {briefData?.recommendedActions.length ? (
            briefData.recommendedActions.map((action) => (
              <button
                className={`task-card ${
                  action.priority === 'high'
                    ? 'task-card-danger'
                    : action.priority === 'medium'
                      ? 'task-card-warning'
                      : 'task-card-muted'
                }`}
                key={action.id}
                onClick={() => onOpenAction(action)}
                type="button"
              >
                <div className="task-row">
                  <strong>{action.label}</strong>
                  <span className="status">{action.priority}</span>
                </div>
                <p className="meta">{action.reason}</p>
                {action.taskId ? <p className="meta">taskId: {action.taskId}</p> : null}
              </button>
            ))
          ) : (
            <p className="meta">当前没有推荐动作。</p>
          )}
        </div>
      </article>

      <article className="panel">
        <h2>Recent Artifacts</h2>
        <div className="task-list">
          {briefData?.recentArtifacts.length ? (
            briefData.recentArtifacts.map((artifact) => (
              <button
                className="task-card task-card-button task-card-muted"
                key={artifact.id}
                onClick={() => onOpenArtifact(artifact)}
                type="button"
              >
                <div className="task-row">
                  <strong>{artifact.title}</strong>
                  <span className="status">{artifact.kind}</span>
                </div>
                <p className="meta">
                  source: {artifact.sourceType} · {artifact.sourceId}
                </p>
                <p className="meta brief-preview">{artifact.content}</p>
              </button>
            ))
          ) : (
            <p className="meta">当前还没有最近产物。</p>
          )}
        </div>
      </article>

      <article className="panel">
        <h2>Recent Activity</h2>
        <div className="task-list">
          {briefData?.recentActivity?.length ? (
            briefData.recentActivity.map((event) => (
              <div className="task-card" key={event.id}>
                <div className="task-row">
                  <strong>{event.sourceType === 'decision' ? event.title : `${event.title} run`}</strong>
                  <span className="status">{event.status}</span>
                </div>
                <p className="meta">task: {event.taskTitle}</p>
                <p className="meta">{event.updatedAt}</p>
              </div>
            ))
          ) : (
            <p className="meta">最近没有关键决策或执行动态。</p>
          )}
        </div>
      </article>

      <article className="panel">
        <h2>Recent Brief Snapshots</h2>
        <div className="task-list">
          {briefData?.recentBriefSnapshots.length ? (
            briefData.recentBriefSnapshots.map((snapshot) => (
              <div className="task-card" key={snapshot.id}>
                <div className="task-row">
                  <strong>{snapshot.kind}</strong>
                  <span className="status">{snapshot.createdAt}</span>
                </div>
                <p className="meta">
                  来源：{snapshot.source}
                  {snapshot.fallbackReason ? ` | fallback 原因：${snapshot.fallbackReason}` : ''}
                </p>
                <p className="meta brief-preview">{snapshot.payload}</p>
              </div>
            ))
          ) : (
            <p className="meta">还没有生成过 brief snapshot。</p>
          )}
        </div>
      </article>

      <article className="panel">
        <h2>Key Signals</h2>
        <div className="home-signal-grid">
          <section className="timeline-list">
            <strong>Waiting Tasks</strong>
            {briefData?.waitingTasks.length ? (
              briefData.waitingTasks.map((task) => (
                <button
                  className="task-card task-card-warning task-card-button"
                  key={task.id}
                  onClick={() => openWaitingTask(task)}
                  type="button"
                >
                  <div className="task-row">
                    <strong>{task.title}</strong>
                    <span className="status">{task.state}</span>
                  </div>
                  <p className="meta">{task.activeWaitingItem?.reason || task.waitingReason || '未填写等待原因'}</p>
                  {task.activeWaitingItem ? (
                    <p className="meta">
                      active waiting item · since {task.activeWaitingItem.createdAt}
                    </p>
                  ) : null}
                  {task.nextStep ? <p className="meta">恢复后下一步：{task.nextStep}</p> : null}
                </button>
              ))
            ) : (
              <p className="meta">当前没有等待中任务。</p>
            )}
          </section>

          <section className="timeline-list">
            <strong>High Risk Tasks</strong>
            {briefData?.highRiskTasks.length ? (
              briefData.highRiskTasks.map((task) => (
                <button
                  className="task-card task-card-danger task-card-button"
                  key={task.id}
                  onClick={() => openRiskTask(task)}
                  type="button"
                >
                  <div className="task-row">
                    <strong>{task.title}</strong>
                    <span className="status">{task.riskLevel}</span>
                  </div>
                  <p className="meta">{task.riskNote || task.summary || task.id}</p>
                  {task.nextStep ? <p className="meta">下一步：{task.nextStep}</p> : null}
                </button>
              ))
            ) : (
              <p className="meta">当前没有高风险任务。</p>
            )}
          </section>

          <section className="timeline-list">
            <strong>Needs Next Step</strong>
            {briefData?.missingNextStepTasks.length ? (
              briefData.missingNextStepTasks.map((task) => (
                <button
                  className="task-card task-card-muted task-card-button"
                  key={task.id}
                  onClick={() => openNextStepTask(task)}
                  type="button"
                >
                  <div className="task-row">
                    <strong>{task.title}</strong>
                    <span className="status">{task.state}</span>
                  </div>
                  <p className="meta">{task.summary || '还没有补充摘要'}</p>
                </button>
              ))
            ) : (
              <p className="meta">当前所有活跃任务都已经有下一步。</p>
            )}
          </section>
        </div>
      </article>

      <article className="panel">
        <h2>Recent Tasks</h2>
        <div className="task-list">
          {briefData?.recentTasks.length ? (
            briefData.recentTasks.map((task) => (
              <div className="task-card" key={task.id}>
                <div className="task-row">
                  <strong>{task.title}</strong>
                  <span className="status">{task.state}</span>
                </div>
                <p className="meta">{task.summary || task.id}</p>
                {renderTaskSignal(task) ? <p className="meta">{renderTaskSignal(task)}</p> : null}
              </div>
            ))
          ) : (
            <p className="meta">还没有任务。</p>
          )}
        </div>
      </article>

      <article className="panel">
        <h2>Pending Decisions</h2>
        <div className="task-list">
          {briefData?.pendingDecisions.length ? (
            briefData.pendingDecisions.map((decision) => (
              <div className="task-card" key={decision.id}>
                <div className="task-row">
                  <strong>{decision.title}</strong>
                  <span className="status">{decision.status}</span>
                </div>
                <p className="meta">{decision.taskId}</p>
              </div>
            ))
          ) : (
            <p className="meta">当前没有待拍板事项。</p>
          )}
        </div>
      </article>
    </section>
  );
}
