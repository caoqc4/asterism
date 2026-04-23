import type {
  HomeActivityRecord,
  HomeBriefData,
  HomeSourceContextRecord,
  PriorityLane,
  RecommendedAction,
} from '@shared/types/brief';
import type { ArtifactRecord } from '@shared/types/artifact';
import type { AiConfigStatus } from '@shared/types/settings';
import type { PingResponse } from '@shared/types/ipc';
import { formatBlockerAgeLabel } from '@shared/working-context/blocker';
import { formatDependencyAgeLabel, getDependencyAgeReason } from '@shared/working-context/dependency';
import { getPriorityLaneContextLabel, getPriorityLaneLabel } from '@shared/working-context/priority-lanes';

function getActivityActionLabel(activity: HomeActivityRecord): string | null {
  if (activity.sourceType === 'task') {
    return '补摘要与下一步';
  }

  if (activity.sourceType === 'dependency') {
    if (activity.status === 'created') {
      return '先推动上游任务';
    }

    if (activity.status === 'resolved') {
      return '恢复任务推进';
    }

    return '重新判断依赖';
  }

  if (activity.sourceType === 'decision' && activity.status === 'approved') {
    return '继续推进任务';
  }

  if (activity.sourceType === 'decision' && activity.status === 'deferred') {
    return '跟进拍板进度';
  }

  if (activity.sourceType === 'run' && activity.status === 'failed') {
    return '处理失败结果';
  }

  if (activity.sourceType === 'run' && activity.status === 'completed') {
    return '基于结果继续推进';
  }

  if (activity.sourceType === 'blocker' && activity.status === 'created') {
    return '跟进当前阻塞项';
  }

  if (activity.sourceType === 'blocker' && activity.status === 'resolved') {
    return '恢复任务推进';
  }

  if (activity.sourceType === 'blocker' && activity.status === 'source_updated') {
    return '重新判断阻塞';
  }

  return null;
}

function getActivityStatusLabel(activity: HomeActivityRecord): string {
  if (activity.sourceType === 'task') {
    return activity.status;
  }

  if (activity.sourceType === 'dependency') {
    if (activity.status === 'created') {
      return 'created';
    }

    if (activity.status === 'resolved') {
      return 'resolved';
    }

    return activity.status === 'upstream_ready' ? 'upstream ready' : 'upstream unblocked';
  }

  if (activity.sourceType === 'blocker' && activity.status === 'source_updated') {
    return 'source updated';
  }

  return activity.status;
}

function getActivityTitle(activity: HomeActivityRecord): string {
  if (activity.sourceType === 'task') {
    return activity.status === 'captured' ? '新任务进入整理流程' : '任务进入整理阶段';
  }

  if (activity.sourceType === 'blocker' && activity.status === 'source_updated') {
    return `${activity.title} blocker`;
  }

  if (activity.sourceType === 'dependency') {
    return activity.status === 'created' || activity.status === 'resolved'
      ? activity.title
      : `${activity.title} dependency`;
  }

  return activity.sourceType === 'decision'
    ? activity.title
    : activity.sourceType === 'run'
      ? `${activity.title} run`
      : `${activity.title} blocker`;
}

function renderLaneHeading(title: string, lane: PriorityLane) {
  const laneLabel = title === 'Closeout Tasks'
    ? getPriorityLaneContextLabel({
        lane,
        completionProgress: { total: 1, satisfied: 1, open: 0 },
      })
    : getPriorityLaneLabel(lane);

  return (
    <div className="task-row section-heading-row">
      <strong>{title}</strong>
      <span className={`status lane-status lane-status-${lane}`}>{laneLabel}</span>
    </div>
  );
}

function getCloseoutTaskStatusLabel(kind: 'ready' | 'near') {
  return kind === 'ready' ? '可收尾' : '待核对证据';
}

function getCloseoutTaskSummary(kind: 'ready' | 'near') {
  return kind === 'ready'
    ? '完成标准已全部满足，建议做最终收尾判断。'
    : '只差最后一条完成标准，先核对最后证据再决定是否收尾。';
}

type CloseoutTaskWithEvidence = {
  closeoutEvidence?: {
    sourceType: 'decision' | 'run';
    sourceId: string;
    title: string;
    status: 'approved' | 'completed';
  } | null;
};

type HomePageProps = {
  ping: PingResponse | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  aiStatus: AiConfigStatus | null;
  briefData: HomeBriefData | null;
  onOpenAction: (action: RecommendedAction) => void;
  onOpenActivity: (activity: HomeActivityRecord) => void;
  onOpenActivityObject: (activity: HomeActivityRecord) => void;
  onOpenArtifact: (artifact: ArtifactRecord) => void;
  onOpenDecision: (decisionId: string) => void;
  onOpenRun: (runId: string) => void;
  onResolveBlockedTask: (task: HomeBriefData['blockerTasks'][number]) => void;
  onOpenSourceContext: (sourceContext: HomeSourceContextRecord) => void;
  onOpenResumeLatestChange: (preview: HomeBriefData['recentTaskResumes'][number]) => void;
};

export function HomePage({
  ping,
  status,
  aiStatus,
  briefData,
  onOpenAction,
  onOpenActivity,
  onOpenActivityObject,
  onOpenArtifact,
  onOpenDecision,
  onOpenRun,
  onResolveBlockedTask,
  onOpenSourceContext,
  onOpenResumeLatestChange,
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

  function openBlockedTask(task: HomeBriefData['blockerTasks'][number]) {
    onOpenAction({
      id: `home-blocker:${task.id}`,
      label: `跟进当前阻塞项：${task.title}`,
      reason:
        task.activeBlocker?.detail ??
        task.activeBlocker?.owner ??
        task.activeBlocker?.title ??
        '该任务当前存在阻塞项。',
      taskId: task.id,
      priority: 'medium',
      intent: task.activeBlocker?.sourceContextId
        ? {
            type: 'focus_source_context',
            focusArea: 'detail',
            sourceContextId: task.activeBlocker.sourceContextId,
            prefillNextStep: `先解除阻塞项，再继续推进：${task.activeBlocker.title}`,
          }
        : {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: `先解除阻塞项，再继续推进：${task.activeBlocker?.title ?? task.title}`,
          },
    });
  }

  function openDependencyTask(task: NonNullable<HomeBriefData['dependencyTasks']>[number]) {
    onOpenAction({
      id: `home-dependency:${task.id}`,
      label: `推动上游任务依赖：${task.title}`,
      reason:
        task.activeDependency?.reason ??
        `当前依赖上游任务“${task.activeDependency?.blockedByTaskTitle ?? '未命名上游任务'}”。`,
      taskId: task.id,
      priority: 'medium',
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `先推动上游任务完成：${
          task.activeDependency?.blockedByTaskTitle ?? task.title
        }`,
      },
    });
  }

  function openUpstreamTask(task: NonNullable<HomeBriefData['dependencyTasks']>[number]) {
    if (!task.activeDependency?.blockedByTaskId) {
      return;
    }

    onOpenAction({
      id: `home-dependency-upstream:${task.id}`,
      label: `打开上游任务：${task.activeDependency.blockedByTaskTitle ?? '未命名上游任务'}`,
      reason:
        task.activeDependency.reason ??
        `完成上游任务后，任务“${task.title}”才能继续推进。`,
      taskId: task.activeDependency.blockedByTaskId,
      priority: 'medium',
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `先完成这条上游任务，以解除对“${task.title}”的依赖。`,
      },
    });
  }

  function openEscalationTask(task: HomeBriefData['escalationTasks'][number]) {
    if (task.activeDependency) {
      onOpenAction({
        id: `home-escalation-dependency:${task.id}`,
        label: `优先升级依赖链路：${task.title}`,
        reason:
          task.activeDependency.reason ??
          `任务已依赖上游任务“${task.activeDependency.blockedByTaskTitle ?? '未命名上游任务'}”过久。`,
        taskId: task.id,
        priority: 'high',
        intent: {
          type: 'focus_next_step',
          focusArea: 'detail',
          prefillNextStep: `优先推动上游任务“${
            task.activeDependency.blockedByTaskTitle ?? '未命名上游任务'
          }”，并重新判断是否解除对“${task.title}”的依赖。`,
        },
      });
      return;
    }

    onOpenAction({
      id: `home-escalation:${task.id}`,
      label: `优先升级阻塞项：${task.title}`,
      reason:
        task.activeBlocker?.detail ??
        task.activeBlocker?.owner ??
        task.activeBlocker?.title ??
        '该任务当前存在已卡住过久的阻塞项。',
      taskId: task.id,
      priority: 'high',
      intent: task.activeBlocker?.sourceContextId
        ? {
            type: 'focus_source_context',
            focusArea: 'detail',
            sourceContextId: task.activeBlocker.sourceContextId,
            prefillNextStep: `优先升级当前阻塞项：${task.activeBlocker.title}`,
          }
        : {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: `优先升级当前阻塞项：${task.activeBlocker?.title ?? task.title}`,
          },
    });
  }

  function escalateTaskDirectly(task: HomeBriefData['escalationTasks'][number]) {
    if (task.activeDependency) {
      onOpenAction({
        id: `home-escalation-direct-dependency:${task.id}`,
        label: `直接升级依赖链路：${task.title}`,
        reason:
          task.activeDependency.reason ??
          `任务已依赖上游任务“${task.activeDependency.blockedByTaskTitle ?? '未命名上游任务'}”过久。`,
        taskId: task.id,
        priority: 'high',
        intent: {
          type: 'focus_next_step',
          focusArea: 'detail',
          prefillNextStep: `优先推动上游任务“${
            task.activeDependency.blockedByTaskTitle ?? '未命名上游任务'
          }”，并重新判断是否解除对“${task.title}”的依赖。`,
        },
      });
      return;
    }

    onOpenAction({
      id: `home-escalation-direct:${task.id}`,
      label: `直接升级处理：${task.title}`,
      reason:
        task.activeBlocker?.detail ??
        task.activeBlocker?.owner ??
        task.activeBlocker?.title ??
        '该任务当前存在需要尽快升级处理的阻塞项。',
      taskId: task.id,
      priority: 'high',
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `优先升级当前阻塞项：${task.activeBlocker?.title ?? task.title}`,
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

  function openCompletionReadyTask(task: NonNullable<HomeBriefData['completionReadyTasks']>[number]) {
    onOpenAction({
      id: `home-completion-ready:${task.id}`,
      label: `收尾并完成任务：${task.title}`,
      reason: `这条任务的完成标准已全部满足，可在最终检查后转到 completed。`,
      taskId: task.id,
      priority: 'medium',
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `确认完成标准已满足，并判断是否将“${task.title}”转到 completed。`,
      },
    });
  }

  function openNearCompletionTask(task: NonNullable<HomeBriefData['nearCompletionTasks']>[number]) {
    onOpenAction({
      id: `home-near-completion:${task.id}`,
      label: `补最后一个完成标准：${task.title}`,
      reason: `这条任务只差最后 ${task.completionProgress?.open ?? 1} 条完成标准。`,
      taskId: task.id,
      priority: 'medium',
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `优先补齐最后一条完成标准，并判断“${task.title}”是否可以收尾。`,
      },
    });
  }

  function openCloseoutEvidence(task: CloseoutTaskWithEvidence) {
    if (!task.closeoutEvidence) {
      return;
    }

    if (task.closeoutEvidence.sourceType === 'decision') {
      onOpenDecision(task.closeoutEvidence.sourceId);
      return;
    }

    onOpenRun(task.closeoutEvidence.sourceId);
  }

  function openBlockedSource(task: HomeBriefData['blockerTasks'][number]) {
    if (!task.activeBlocker?.sourceContextId) {
      return;
    }

    onOpenAction({
      id: `home-blocker-source:${task.id}`,
      label: `查看阻塞来源：${task.title}`,
      reason:
        task.activeBlocker.detail ??
        task.activeBlocker.owner ??
        task.activeBlocker.title ??
        '该任务当前存在阻塞项。',
      taskId: task.id,
      priority: 'medium',
      intent: {
        type: 'focus_source_context',
        focusArea: 'detail',
        sourceContextId: task.activeBlocker.sourceContextId,
      },
    });
  }

  function openTaskResume(preview: HomeBriefData['recentTaskResumes'][number]) {
    onOpenAction({
      id: `resume:${preview.taskId}`,
      label: `恢复任务：${preview.taskTitle}`,
      reason: preview.latestChange.summary,
      taskId: preview.taskId,
      priority: 'medium',
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: preview.nextSuggestedMove,
      },
    });
  }

  function openTaskResumeContext(preview: HomeBriefData['recentTaskResumes'][number]) {
    onOpenAction({
      id: `resume-context:${preview.taskId}`,
      label: `${preview.contextActionLabel}：${preview.taskTitle}`,
      reason: preview.latestChange.summary,
      taskId: preview.taskId,
      priority: 'medium',
      intent: preview.contextActionIntent,
    });
  }

  function getHomeHeadline(data: HomeBriefData | null) {
    if (data?.priorityHeadline) {
      return data.priorityHeadline;
    }

    if (!data) {
      return '本地优先控制台骨架已进入任务闭环阶段';
    }

    if (data.escalationTaskCount > 0) {
      return `当前有 ${data.escalationTaskCount} 条任务需要升级处理`;
    }

    if (data.blockerTaskCount > 0) {
      return `当前有 ${data.blockerTaskCount} 个任务被阻塞`;
    }

    if (data.highRiskTaskCount > 0) {
      return `当前有 ${data.highRiskTaskCount} 个高风险任务需要优先处理`;
    }

    if (data.waitingTaskCount > 0) {
      return `当前有 ${data.waitingTaskCount} 个等待中任务需要恢复推进`;
    }

    if (data.missingNextStepTaskCount > 0) {
      return `当前有 ${data.missingNextStepTaskCount} 个任务缺少下一步`;
    }

    return '本地优先控制台骨架已进入任务闭环阶段';
  }

  function getHomeLede(data: HomeBriefData | null) {
    if (data?.priorityLede) {
      return data.priorityLede;
    }

    if (!data) {
      return '当前已经接通 Main 持有的 SQLite 与本地凭据存储。下一步可以继续把 Decisions、Runs 和 Brief 聚合查询接上。';
    }

    if (data.escalationTaskCount > 0) {
      return '首页会优先把需要升级处理的阻塞或依赖链路提成强信号，并把你直接带回相关任务继续推进。';
    }

    if (data.blockerTaskCount > 0) {
      return '当前优先清理阻塞项；首页会把你带回相关任务，并在有来源材料时直接聚焦阻塞来源。';
    }

    if (data.highRiskTaskCount > 0) {
      return '当前优先控制高风险任务；首页会直接把风险处理语义和下一步动作带回任务工作面。';
    }

    if (data.waitingTaskCount > 0) {
      return '当前优先恢复等待中的任务；首页会把等待原因和跟进动作一起带回任务工作面。';
    }

    if (data.missingNextStepTaskCount > 0) {
      return '当前优先补齐缺少下一步的任务，避免后续恢复和协作成本继续升高。';
    }

    return '当前已经接通 Main 持有的 SQLite 与本地凭据存储。下一步可以继续把 Decisions、Runs 和 Brief 聚合查询接上。';
  }

  return (
    <section className="page-grid">
      <article className="panel hero page-hero">
        <p className="eyebrow">Home / Brief</p>
        <h1>{getHomeHeadline(briefData)}</h1>
        <p className="lede">{getHomeLede(briefData)}</p>
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
          <div className="metric-card metric-card-warning">
            <span className="metric-label">Blocked</span>
            <strong>{briefData?.blockerTaskCount ?? 0}</strong>
          </div>
          <div className="metric-card metric-card-danger">
            <span className="metric-label">Needs Escalation</span>
            <strong>{briefData?.escalationTaskCount ?? 0}</strong>
          </div>
          <div className="metric-card metric-card-danger">
            <span className="metric-label">High Risk</span>
            <strong>{briefData?.highRiskTaskCount ?? 0}</strong>
          </div>
          <div className="metric-card metric-card-muted">
            <span className="metric-label">Missing Next Step</span>
            <strong>{briefData?.missingNextStepTaskCount ?? 0}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Closeout</span>
            <strong>{(briefData?.completionReadyTaskCount ?? 0) + (briefData?.nearCompletionTaskCount ?? 0)}</strong>
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
                  <div className="task-row task-row-compact">
                    {getPriorityLaneLabel(action.lane) ? (
                      <span className={`status lane-status lane-status-${action.lane}`}>
                        {(action.id.startsWith('completion-ready:') || action.id.startsWith('near-completion:'))
                          ? getPriorityLaneContextLabel({
                              lane: action.lane,
                              completionProgress: action.id.startsWith('completion-ready:')
                                ? { total: 1, satisfied: 1, open: 0 }
                                : { total: 2, satisfied: 1, open: 1 },
                            })
                          : getPriorityLaneLabel(action.lane)}
                      </span>
                    ) : null}
                    <span className="status">{action.priority}</span>
                  </div>
                </div>
                <p className="meta">{action.reason}</p>
                {action.responsibilitySummary ? (
                  <p className="meta">{action.responsibilitySummary}</p>
                ) : null}
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
        <h2>Key Source Materials</h2>
        <div className="task-list">
          {briefData?.recentSourceContexts.length ? (
            briefData.recentSourceContexts.map((sourceContext) => (
              <button
                className="task-card task-card-button task-card-muted"
                key={sourceContext.id}
                onClick={() => onOpenSourceContext(sourceContext)}
                type="button"
              >
                <div className="task-row">
                  <strong>{sourceContext.title}</strong>
                  <span className="status">
                    {sourceContext.kind}
                    {sourceContext.isKey ? ' · key' : ''}
                  </span>
                </div>
                <p className="meta">task: {sourceContext.taskTitle}</p>
                {sourceContext.note ? <p className="meta">{sourceContext.note}</p> : null}
                {sourceContext.uri ? <p className="meta brief-preview">{sourceContext.uri}</p> : null}
                <p className="meta">最近更新：{sourceContext.updatedAt}</p>
              </button>
            ))
          ) : (
            <p className="meta">当前还没有关键来源材料。</p>
          )}
        </div>
      </article>

      <article className="panel">
        <h2>Recent Activity</h2>
        <div className="task-list">
          {briefData?.recentActivity?.length ? (
            briefData.recentActivity.map((event) => (
              <div className="task-card" key={event.id}>
                <button
                  aria-label={`${event.title} ${event.status} task: ${event.taskTitle}`}
                  className="task-card-button task-card-button-shell"
                  onClick={() => onOpenActivity(event)}
                  type="button"
                >
                  <div className="task-row">
                    <strong>
                      {getActivityTitle(event)}
                    </strong>
                    <div className="task-row task-row-compact">
                      {getPriorityLaneLabel(event.lane) ? (
                        <span className={`status lane-status lane-status-${event.lane}`}>{getPriorityLaneLabel(event.lane)}</span>
                      ) : null}
                      <span className="status">{getActivityStatusLabel(event)}</span>
                    </div>
                  </div>
                  <p className="meta">task: {event.taskTitle}</p>
                  <p className="meta">{event.updatedAt}</p>
                </button>
                <div className="chip-row">
                  {getActivityActionLabel(event) ? (
                    <button
                      className="ghost-button"
                      onClick={() => onOpenActivity(event)}
                      type="button"
                    >
                      {getActivityActionLabel(event)}
                    </button>
                  ) : null}
                  {event.sourceType === 'decision' || event.sourceType === 'run' ? (
                    <button
                      className="ghost-button"
                      onClick={() => onOpenActivityObject(event)}
                      type="button"
                    >
                      {event.sourceType === 'decision' ? '查看 Decision' : '查看 Run'}
                    </button>
                  ) : event.sourceType === 'dependency' && event.relatedTaskId ? (
                    <button
                      className="ghost-button"
                      onClick={() => onOpenActivityObject(event)}
                      type="button"
                    >
                      打开上游任务
                    </button>
                  ) : event.sourceType === 'blocker' && event.relatedSourceContextId ? (
                    <button
                      className="ghost-button"
                      onClick={() => onOpenActivityObject(event)}
                      type="button"
                    >
                      查看来源
                    </button>
                  ) : null}
                </div>
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
            {renderLaneHeading('Waiting Tasks', 'clarify')}
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
            {renderLaneHeading('Blocked Tasks', 'unblock_or_decide')}
            {briefData?.blockerTasks.length ? (
              briefData.blockerTasks.map((task) => (
                <div className="task-card task-card-warning" key={task.id}>
                  <button
                    className="task-card-button task-card-button-shell"
                    onClick={() => openBlockedTask(task)}
                    type="button"
                  >
                    <div className="task-row">
                      <strong>{task.title}</strong>
                      <span className="status">{task.state}</span>
                    </div>
                    <p className="meta">
                      {task.activeBlocker?.detail || task.activeBlocker?.owner || task.activeBlocker?.title || '未填写阻塞说明'}
                    </p>
                    {task.activeBlocker ? (
                      <p className="meta">{formatBlockerAgeLabel(task.activeBlocker.createdAt)}</p>
                    ) : null}
                    {task.activeBlocker?.sourceContextId ? (
                      <p className="meta">linked blocker source</p>
                    ) : null}
                    {task.nextStep ? <p className="meta">解除后下一步：{task.nextStep}</p> : null}
                  </button>
                  {task.activeBlocker?.sourceContextId ? (
                    <div className="chip-row">
                      <button
                        className="ghost-button"
                        onClick={() => escalateTaskDirectly(task)}
                        type="button"
                      >
                        直接升级处理
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => openBlockedSource(task)}
                        type="button"
                      >
                        查看阻塞来源
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => onResolveBlockedTask(task)}
                        type="button"
                      >
                        标记已解除
                      </button>
                    </div>
                  ) : (
                    <div className="chip-row">
                      <button
                        className="ghost-button"
                        onClick={() => onResolveBlockedTask(task)}
                        type="button"
                      >
                        标记已解除
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="meta">当前没有阻塞中的任务。</p>
            )}
          </section>

          <section className="timeline-list">
            {renderLaneHeading('Blocked by Tasks', 'unblock_or_decide')}
            {briefData?.dependencyTasks?.length ? (
              briefData.dependencyTasks.map((task) => (
                <div className="task-card task-card-warning" key={task.id}>
                  <button
                    className="task-card-button task-card-button-shell"
                    onClick={() => openDependencyTask(task)}
                    type="button"
                  >
                    <div className="task-row">
                      <strong>{task.title}</strong>
                      <span className="status">{task.state}</span>
                    </div>
                    <p className="meta">
                      blocked by {task.activeDependency?.blockedByTaskTitle ?? '未命名上游任务'}
                    </p>
                    {task.activeDependency?.reason ? (
                      <p className="meta">{task.activeDependency.reason}</p>
                    ) : null}
                    {task.activeDependency?.createdAt ? (
                      <p className="meta">{formatDependencyAgeLabel(task.activeDependency.createdAt)}</p>
                    ) : null}
                    {task.activeDependency?.createdAt && getDependencyAgeReason(task.activeDependency.createdAt, 'home') ? (
                      <p className="meta">{getDependencyAgeReason(task.activeDependency.createdAt, 'home')}</p>
                    ) : null}
                    <p className="meta">
                      当前主要由上游任务“
                      {task.activeDependency?.blockedByTaskTitle ?? '未命名上游任务'}
                      ”推进
                    </p>
                    {task.nextStep ? <p className="meta">解除后下一步：{task.nextStep}</p> : null}
                  </button>
                  <div className="chip-row">
                    <button
                      className="ghost-button"
                      onClick={() => openUpstreamTask(task)}
                      type="button"
                    >
                      打开上游任务
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="meta">当前没有被其他任务阻塞的任务。</p>
            )}
          </section>

          <section className="timeline-list">
            {renderLaneHeading('Needs Escalation', 'escalate_now')}
            {briefData?.escalationTasks.length ? (
              briefData.escalationTasks.map((task) => (
                <div className="task-card task-card-danger" key={task.id}>
                  <button
                    className="task-card-button task-card-button-shell"
                    onClick={() => openEscalationTask(task)}
                    type="button"
                  >
                    <div className="task-row">
                      <strong>{task.title}</strong>
                      <span className="status">{task.state}</span>
                    </div>
                    <p className="meta">
                      {task.activeBlocker?.detail ||
                        task.activeBlocker?.owner ||
                        task.activeBlocker?.title ||
                        (task.activeDependency
                          ? `当前依赖上游任务：${task.activeDependency.blockedByTaskTitle ?? '未命名上游任务'}`
                          : '未填写升级说明')}
                    </p>
                    {task.activeBlocker ? (
                      <p className="meta">{formatBlockerAgeLabel(task.activeBlocker.createdAt)}</p>
                    ) : task.activeDependency?.createdAt ? (
                      <p className="meta">{formatDependencyAgeLabel(task.activeDependency.createdAt)}</p>
                    ) : null}
                    {task.activeDependency?.createdAt && getDependencyAgeReason(task.activeDependency.createdAt, 'home') ? (
                      <p className="meta">{getDependencyAgeReason(task.activeDependency.createdAt, 'home')}</p>
                    ) : null}
                    {task.nextStep ? (
                      <p className="meta">{task.activeDependency ? `重判后下一步：${task.nextStep}` : `升级后下一步：${task.nextStep}`}</p>
                    ) : null}
                  </button>
                  {task.activeBlocker?.sourceContextId ? (
                    <div className="chip-row">
                      <button
                        className="ghost-button"
                        onClick={() => escalateTaskDirectly(task)}
                        type="button"
                      >
                        直接升级处理
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => openBlockedSource(task)}
                        type="button"
                      >
                        查看阻塞来源
                      </button>
                    </div>
                  ) : task.activeDependency ? (
                    <div className="chip-row">
                      <button
                        className="ghost-button"
                        onClick={() => escalateTaskDirectly(task)}
                        type="button"
                      >
                        直接升级处理
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => openUpstreamTask(task)}
                        type="button"
                      >
                        打开上游任务
                      </button>
                    </div>
                  ) : (
                    <div className="chip-row">
                      <button
                        className="ghost-button"
                        onClick={() => escalateTaskDirectly(task)}
                        type="button"
                      >
                        直接升级处理
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="meta">当前没有需要升级处理的阻塞项。</p>
            )}
          </section>

          <section className="timeline-list">
            {renderLaneHeading('High Risk Tasks', 'escalate_now')}
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
            {renderLaneHeading('Needs Next Step', 'clarify')}
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

          <section className="timeline-list">
            {renderLaneHeading('Closeout Tasks', 'continue_or_review')}
            {briefData?.completionReadyTasks?.length || briefData?.nearCompletionTasks?.length ? (
              <>
                <p className="meta">
                  这里区分已经具备收尾条件的任务，和还需要先核对最后证据的接近完成任务。
                </p>
                {briefData?.completionReadyTasks?.map((task) => (
                  <div className="task-card" key={`completion-ready-${task.id}`}>
                    <button
                      className="task-card-button task-card-button-shell"
                      onClick={() => openCompletionReadyTask(task)}
                      type="button"
                    >
                      <div className="task-row">
                        <strong>{task.title}</strong>
                        <span className="status">{getCloseoutTaskStatusLabel('ready')}</span>
                      </div>
                      <p className="meta">{getCloseoutTaskSummary('ready')}</p>
                      <p className="meta">
                        completion: {task.completionProgress?.satisfied ?? 0}/{task.completionProgress?.total ?? 0}
                      </p>
                      {task.completionProgress?.satisfiedCriteriaHighlights?.length ? (
                        <p className="meta">
                          已满足：{task.completionProgress.satisfiedCriteriaHighlights.join('；')}
                        </p>
                      ) : null}
                      {task.completionProgress?.nextOpenCriterion ? (
                        <p className="meta">最后还差：{task.completionProgress.nextOpenCriterion}</p>
                      ) : null}
                      {task.completionProgress?.nextOpenResponsibilitySummary ? (
                        <p className="meta">
                          {task.completionProgress.nextOpenResponsibilitySummary}
                        </p>
                      ) : null}
                      {task.closeoutEvidence ? (
                        <p className="meta">
                          当前最终收尾依据：
                          {task.closeoutEvidence.sourceType === 'decision' ? '决策批准' : '执行完成'}
                          {' · '}
                          {task.closeoutEvidence.title}
                        </p>
                      ) : null}
                    </button>
                    {task.closeoutEvidence ? (
                      <div className="task-chip-row">
                        <button
                          className="chip-button"
                          onClick={() => openCloseoutEvidence(task)}
                          type="button"
                        >
                          查看最终收尾依据
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {briefData?.nearCompletionTasks?.map((task) => (
                  <div className="task-card task-card-muted" key={`near-completion-${task.id}`}>
                    <button
                      className="task-card-button task-card-button-shell"
                      onClick={() => openNearCompletionTask(task)}
                      type="button"
                    >
                      <div className="task-row">
                        <strong>{task.title}</strong>
                        <span className="status">{getCloseoutTaskStatusLabel('near')}</span>
                      </div>
                      <p className="meta">{getCloseoutTaskSummary('near')}</p>
                      <p className="meta">
                        completion: {task.completionProgress?.satisfied ?? 0}/{task.completionProgress?.total ?? 0}
                      </p>
                      {task.completionProgress?.satisfiedCriteriaHighlights?.length ? (
                        <p className="meta">
                          已满足：{task.completionProgress.satisfiedCriteriaHighlights.join('；')}
                        </p>
                      ) : null}
                      {task.completionProgress?.nextOpenCriterion ? (
                        <p className="meta">最后还差：{task.completionProgress.nextOpenCriterion}</p>
                      ) : null}
                      {task.completionProgress?.nextOpenResponsibilitySummary ? (
                        <p className="meta">
                          {task.completionProgress.nextOpenResponsibilitySummary}
                        </p>
                      ) : null}
                      {task.closeoutEvidence ? (
                        <p className="meta">
                          当前收尾证据：
                          {task.closeoutEvidence.sourceType === 'decision' ? '决策批准' : '执行完成'}
                          {' · '}
                          {task.closeoutEvidence.title}
                        </p>
                      ) : null}
                    </button>
                    {task.closeoutEvidence ? (
                      <div className="task-chip-row">
                        <button
                          className="chip-button"
                          onClick={() => openCloseoutEvidence(task)}
                          type="button"
                        >
                          查看收尾证据
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </>
            ) : (
              <p className="meta">当前没有接近完成或已满足完成标准的任务。</p>
            )}
          </section>
        </div>
      </article>

      <article className="panel">
        <h2>Resume Previews</h2>
        <div className="task-list">
          {briefData?.recentTaskResumes.length ? (
            briefData.recentTaskResumes.map((preview) => (
              <div className="task-card" key={preview.taskId}>
                <button
                  aria-label={`恢复任务 ${preview.taskTitle}`}
                  className="task-card-button task-card-button-shell"
                  onClick={() => openTaskResume(preview)}
                  type="button"
                >
                  <div className="task-row">
                    <strong>{preview.taskTitle}</strong>
                    <div className="inline-statuses">
                      {getPriorityLaneLabel(preview.lane) ? (
                        <span className={`status lane-status lane-status-${preview.lane}`}>
                          {getPriorityLaneContextLabel({
                            lane: preview.lane,
                            completionProgress: preview.completionStatus,
                          })}
                        </span>
                      ) : null}
                      <span className="status">{preview.currentState}</span>
                    </div>
                  </div>
                  <p className="meta">{preview.latestChange.summary}</p>
                  {preview.currentBlocker?.title ? (
                    <p className="meta">当前阻塞：{preview.currentBlocker.title}</p>
                  ) : null}
                  {preview.currentBlocker?.ageLabel ? (
                    <p className="meta">{preview.currentBlocker.ageLabel}</p>
                  ) : null}
                  {preview.currentBlocker?.priorityReason ? (
                    <p className="meta">{preview.currentBlocker.priorityReason}</p>
                  ) : null}
                  {preview.currentBlocker?.responsibilitySummary ? (
                    <p className="meta">{preview.currentBlocker.responsibilitySummary}</p>
                  ) : null}
                  {preview.currentDependency?.title ? (
                    <p className="meta">当前依赖：{preview.currentDependency.title}</p>
                  ) : null}
                  {preview.currentDependency?.ageLabel ? (
                    <p className="meta">{preview.currentDependency.ageLabel}</p>
                  ) : null}
                  {preview.currentDependency?.priorityReason ? (
                    <p className="meta">{preview.currentDependency.priorityReason}</p>
                  ) : null}
                  {preview.currentDependency?.responsibilitySummary ? (
                    <p className="meta">{preview.currentDependency.responsibilitySummary}</p>
                  ) : null}
                  {preview.keySource.title ? (
                    <p className="meta">关键来源：{preview.keySource.title}</p>
                  ) : null}
                  {preview.keySource.priorityReason ? (
                    <p className="meta">{preview.keySource.priorityReason}</p>
                  ) : null}
                  {preview.currentMethod.title ? (
                    <p className="meta">当前方法：{preview.currentMethod.title}</p>
                  ) : null}
                  {preview.currentMethod.selectionReason ? (
                    <p className="meta">{preview.currentMethod.selectionReason}</p>
                  ) : null}
                  <p className="meta">建议先做：{preview.nextSuggestedMove}</p>
                </button>
                <div className="chip-row">
                  {preview.latestChange.action.label ? (
                    <button
                      className="ghost-button"
                      onClick={() => onOpenResumeLatestChange(preview)}
                      type="button"
                    >
                      {preview.latestChange.action.label}
                    </button>
                  ) : null}
                  <button
                    className="ghost-button"
                    onClick={() => openTaskResume(preview)}
                    type="button"
                  >
                    恢复任务
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => openTaskResumeContext(preview)}
                    type="button"
                  >
                    {preview.contextActionLabel}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="meta">当前还没有可恢复的任务预览。</p>
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
