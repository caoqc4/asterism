import type { HomeBriefData } from '@shared/types/brief';
import type { AiConfigStatus } from '@shared/types/settings';
import type { PingResponse } from '@shared/types/ipc';

type HomePageProps = {
  ping: PingResponse | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  aiStatus: AiConfigStatus | null;
  briefData: HomeBriefData | null;
};

export function HomePage({ ping, status, aiStatus, briefData }: HomePageProps) {
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
    </section>
  );
}
