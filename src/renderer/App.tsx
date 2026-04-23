import { useEffect, useState } from 'react';

import type { ArtifactRecord } from '@shared/types/artifact';
import type {
  HomeActivityRecord,
  HomeBriefData,
  HomeSourceContextRecord,
  RecommendedActionIntent,
  RecommendedAction,
} from '@shared/types/brief';
import type { CreateDecisionInput, DecisionDraftRecord, DecisionRecord } from '@shared/types/decision';
import type { AppEvent } from '@shared/types/events';
import type { PingResponse } from '@shared/types/ipc';
import type {
  ApplyProcessTemplateInput,
  CreateProcessTemplateInput,
  UpdateProcessTemplateInput,
} from '@shared/types/process-template';
import type { CreateRunInput, RunRecord } from '@shared/types/run';
import type { AiConfigInput, AiConfigStatus } from '@shared/types/settings';
import type {
  CreateSourceContextInput,
  UpdateSourceContextInput,
} from '@shared/types/source-context';
import type { TaskRecord, TaskState, UpdateTaskInput } from '@shared/types/task';

import { getRouteFromHash, setRoute, type AppRoute } from './lib/router';
import { DecisionsPage } from './pages/DecisionsPage';
import { HomePage } from './pages/HomePage';
import { RunsPage } from './pages/RunsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';

const navItems: Array<{ id: AppRoute; label: string; description: string }> = [
  { id: 'home', label: 'Home', description: '局势概览与系统状态' },
  { id: 'tasks', label: 'Tasks', description: '任务列表、详情与状态流转' },
  { id: 'decisions', label: 'Decisions', description: '待拍板事项与快速动作' },
  { id: 'runs', label: 'Runs', description: '执行记录与结果查看' },
  { id: 'settings', label: 'Settings', description: 'AI Provider 与本地配置' },
];

export function App() {
  const [route, setCurrentRoute] = useState<AppRoute>(() => getRouteFromHash(window.location.hash));
  const [focusedTaskRequest, setFocusedTaskRequest] = useState<{
    key: string;
    taskId: string;
    intent: RecommendedActionIntent | null;
  } | null>(null);
  const [focusedDecisionId, setFocusedDecisionId] = useState<string | null>(null);
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);
  const [ping, setPing] = useState<PingResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [aiStatus, setAiStatus] = useState<AiConfigStatus | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [briefData, setBriefData] = useState<HomeBriefData | null>(null);
  const [configForm, setConfigForm] = useState<AiConfigInput>({
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    apiKey: '',
    featureFlags: {
      enableScheduler: false,
    },
  });
  const [lastEvent, setLastEvent] = useState<AppEvent | null>(null);

  useEffect(() => {
    function handleHashChange() {
      setCurrentRoute(getRouteFromHash(window.location.hash));
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  async function loadShellData() {
    setStatus('loading');

    try {
      const [response, configStatus, taskRows, decisionRows, runRows, homeBrief] =
        await Promise.all([
        window.api.ping(),
        window.api.getAiConfigStatus(),
        window.api.listTasks(),
        window.api.listDecisions(),
        window.api.listRuns(),
        window.api.getHomeBrief(),
        ]);

      setPing(response);
      setAiStatus(configStatus);
      setTasks(taskRows);
      setDecisions(decisionRows);
      setRuns(runRows);
      setBriefData(homeBrief);
      setConfigForm((current) => ({
        ...current,
        provider: configStatus.provider ?? current.provider,
        model: configStatus.model ?? current.model,
        featureFlags: configStatus.featureFlags,
      }));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void loadShellData();
  }, []);

  useEffect(() => {
    let timeoutId: number | null = null;

    const unsubscribe = window.api.subscribeToEvents((event) => {
      setLastEvent(event);

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        void loadShellData();
      }, 120);
    });

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      unsubscribe();
    };
  }, []);

  async function handleSaveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextStatus = await window.api.setAiConfig(configForm);
    setAiStatus(nextStatus);
    setConfigForm((current) => ({
      ...current,
      apiKey: '',
      featureFlags: nextStatus.featureFlags,
    }));
  }

  async function handleCreateTask(input: { title: string; summary?: string }) {
    const created = await window.api.createTask(input);
    setTasks((current) => [created, ...current]);
    setBriefData(await window.api.getHomeBrief());
  }

  async function handleUpdateTask(input: UpdateTaskInput) {
    const updated = await window.api.updateTask(input);
    setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
    setBriefData(await window.api.getHomeBrief());
    return updated;
  }

  async function handleTransitionTask(
    taskId: string,
    nextState: TaskState,
    waitingReason?: string,
  ) {
    const updated = await window.api.transitionTask({ id: taskId, nextState, waitingReason });
    setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
    setBriefData(await window.api.getHomeBrief());
    return updated;
  }

  async function handleCreateSourceContext(input: CreateSourceContextInput) {
    const created = await window.api.createSourceContext(input);
    setTasks((current) =>
      current.map((task) => (task.id === created.taskId ? { ...task, updatedAt: created.updatedAt } : task)),
    );
    setBriefData(await window.api.getHomeBrief());
    return created;
  }

  async function handleUpdateSourceContext(input: UpdateSourceContextInput) {
    const updated = await window.api.updateSourceContext(input);
    setTasks((current) =>
      current.map((task) => (task.id === updated.taskId ? { ...task, updatedAt: updated.updatedAt } : task)),
    );
    setBriefData(await window.api.getHomeBrief());
    return updated;
  }

  async function handleArchiveSourceContext(id: string) {
    const archived = await window.api.archiveSourceContext(id);
    setTasks((current) =>
      current.map((task) => (task.id === archived.taskId ? { ...task, updatedAt: archived.updatedAt } : task)),
    );
    setBriefData(await window.api.getHomeBrief());
    return archived;
  }

  async function handleCreateProcessTemplate(input: CreateProcessTemplateInput) {
    return window.api.createProcessTemplate(input);
  }

  async function handleUpdateProcessTemplate(input: UpdateProcessTemplateInput) {
    return window.api.updateProcessTemplate(input);
  }

  async function handleArchiveProcessTemplate(id: string) {
    return window.api.archiveProcessTemplate(id);
  }

  async function handleApplyProcessTemplate(input: ApplyProcessTemplateInput) {
    const applied = await window.api.applyProcessTemplate(input);
    setBriefData(await window.api.getHomeBrief());
    return applied;
  }

  async function handleRemoveProcessTemplate(bindingId: string) {
    const removed = await window.api.removeProcessTemplate(bindingId);
    setBriefData(await window.api.getHomeBrief());
    return removed;
  }

  async function handleCreateDecision(input: CreateDecisionInput) {
    const created = await window.api.createDecision(input);
    setDecisions((current) => [created, ...current]);
    setBriefData(await window.api.getHomeBrief());
  }

  async function handleDraftDecision(taskId: string, note?: string | null): Promise<DecisionDraftRecord> {
    return window.api.draftDecision({
      taskId,
      note,
    });
  }

  async function handleDecisionAction(
    id: string,
    action: 'approve' | 'defer' | 'cancel',
  ) {
    const updated = await window.api.actOnDecision({ id, action });
    setDecisions((current) =>
      current.map((decision) => (decision.id === updated.id ? updated : decision)),
    );
    setBriefData(await window.api.getHomeBrief());
  }

  async function handleTriggerRun(input: CreateRunInput) {
    const created = await window.api.triggerRun(input);
    setRuns((current) => [created, ...current]);
    setBriefData(await window.api.getHomeBrief());
  }

  function handleOpenTask(taskId: string | null, intent: RecommendedActionIntent | null = null) {
    if (!taskId) {
      return;
    }

    setFocusedTaskRequest({
      key: `${taskId}:${intent?.type ?? 'open'}:${Date.now()}`,
      taskId,
      intent,
    });
    setRoute('tasks');
  }

  function handleOpenRecommendedAction(action: RecommendedAction) {
    handleOpenTask(action.taskId, action.intent ?? null);
  }

  function handleOpenArtifact(artifact: ArtifactRecord) {
    handleOpenTask(artifact.taskId, {
      type: 'continue_from_artifact',
      focusArea: 'detail',
      prefillNextStep: `基于产物继续推进：${artifact.title}`,
      prefillRunInstructions: artifact.content
        ? `请基于这份已有产物继续扩展、改写或整理：${artifact.content}`
        : `请基于已有产物继续推进：${artifact.title}`,
    });
  }

  function handleOpenSourceContext(sourceContext: HomeSourceContextRecord) {
    handleOpenTask(sourceContext.taskId, {
      type: 'focus_source_context',
      focusArea: 'detail',
      sourceContextId: sourceContext.id,
      prefillNextStep: `基于来源材料继续推进：${sourceContext.title}`,
    });
  }

  function handleOpenActivity(activity: HomeActivityRecord) {
    if (activity.sourceType === 'decision') {
      if (activity.status === 'approved') {
        handleOpenTask(activity.taskId, {
          type: 'focus_next_step',
          focusArea: 'detail',
          prefillNextStep: `已获批准，继续推进：${activity.title}`,
        });
        return;
      }

      if (activity.status === 'deferred') {
        handleOpenTask(activity.taskId, {
          type: 'focus_waiting_follow_up',
          focusArea: 'detail',
          prefillNextStep: '跟进该决策是否可以恢复拍板，或准备替代推进路径。',
        });
        return;
      }

      handleOpenTask(activity.taskId, {
        type: 'open_task',
        focusArea: 'quick-actions',
      });
      return;
    }

    if (activity.status === 'failed') {
      handleOpenTask(activity.taskId, {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `检查最近一次 ${activity.title} run 的失败原因，并决定是否重试。`,
      });
      return;
    }

    handleOpenTask(activity.taskId, {
      type: 'focus_next_step',
      focusArea: 'detail',
      prefillNextStep: `审阅最近一次 ${activity.title} run 的结果，并决定是否继续推进。`,
    });
  }

  function handleOpenActivityObject(activity: HomeActivityRecord) {
    if (activity.sourceType === 'decision') {
      handleOpenDecision(activity.sourceId);
      return;
    }

    handleOpenRun(activity.sourceId);
  }

  function handleOpenResumeLatestChange(preview: HomeBriefData['recentTaskResumes'][number]) {
    if (preview.latestChangeAction.targetType === 'decision' && preview.latestChangeAction.targetId) {
      handleOpenDecision(preview.latestChangeAction.targetId);
      return;
    }

    if (preview.latestChangeAction.targetType === 'run' && preview.latestChangeAction.targetId) {
      handleOpenRun(preview.latestChangeAction.targetId);
      return;
    }

    if (preview.latestChangeAction.targetType === 'source_context' && preview.latestChangeAction.targetId) {
      handleOpenTask(preview.taskId, {
        type: 'focus_source_context',
        focusArea: 'detail',
        sourceContextId: preview.latestChangeAction.targetId,
        prefillNextStep: preview.nextSuggestedMove,
      });
    }
  }

  function handleOpenDecision(decisionId: string) {
    setFocusedDecisionId(decisionId);
    setRoute('decisions');
  }

  function handleOpenRun(runId: string) {
    setFocusedRunId(runId);
    setRoute('runs');
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">Taskplane</p>
          <h2>Local-First Workbench</h2>
          <p className="meta">Main 进程持有 DB、LLM 与调度权限。</p>
          <p className="meta">
            最近事件：{lastEvent ? `${lastEvent.type} @ ${lastEvent.at}` : '尚未收到推送'}
          </p>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              className={`nav-button ${route === item.id ? 'nav-button-active' : ''}`}
              key={item.id}
              onClick={() => setRoute(item.id)}
              type="button"
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="content">
        {route === 'home' ? (
          <HomePage
            aiStatus={aiStatus}
            briefData={briefData}
            onOpenAction={handleOpenRecommendedAction}
            onOpenActivity={handleOpenActivity}
            onOpenActivityObject={handleOpenActivityObject}
            onOpenArtifact={handleOpenArtifact}
            onOpenResumeLatestChange={handleOpenResumeLatestChange}
            onOpenSourceContext={handleOpenSourceContext}
            ping={ping}
            status={status}
          />
        ) : null}
        {route === 'tasks' ? (
          <TasksPage
            decisions={decisions}
            focusedTaskRequest={focusedTaskRequest}
            runs={runs}
            tasks={tasks}
            onApplyProcessTemplate={handleApplyProcessTemplate}
            onArchiveProcessTemplate={handleArchiveProcessTemplate}
            onCreateDecision={handleCreateDecision}
            onDraftDecision={handleDraftDecision}
            onCreateProcessTemplate={handleCreateProcessTemplate}
            onCreateTask={handleCreateTask}
            onCreateSourceContext={handleCreateSourceContext}
            onArchiveSourceContext={handleArchiveSourceContext}
            onOpenDecision={handleOpenDecision}
            onOpenRun={handleOpenRun}
            onRefresh={loadShellData}
            onRemoveProcessTemplate={handleRemoveProcessTemplate}
            onTransitionTask={handleTransitionTask}
            onTriggerRun={handleTriggerRun}
            onUpdateProcessTemplate={handleUpdateProcessTemplate}
            onUpdateSourceContext={handleUpdateSourceContext}
            onUpdateTask={handleUpdateTask}
            onTaskFocusConsumed={() => setFocusedTaskRequest(null)}
          />
        ) : null}
        {route === 'decisions' ? (
          <DecisionsPage
            decisions={decisions}
            focusedDecisionId={focusedDecisionId}
            tasks={tasks}
            onOpenTask={handleOpenTask}
            onAct={handleDecisionAction}
            onCreateDecision={handleCreateDecision}
            onDraftDecision={handleDraftDecision}
            onDecisionFocusConsumed={() => setFocusedDecisionId(null)}
          />
        ) : null}
        {route === 'runs' ? (
          <RunsPage
            focusedRunId={focusedRunId}
            runs={runs}
            tasks={tasks}
            onOpenTask={handleOpenTask}
            onRefresh={loadShellData}
            onRunFocusConsumed={() => setFocusedRunId(null)}
            onTriggerRun={handleTriggerRun}
          />
        ) : null}
        {route === 'settings' ? (
          <SettingsPage
            aiStatus={aiStatus}
            configForm={configForm}
            onChange={setConfigForm}
            onSubmit={handleSaveConfig}
          />
        ) : null}
      </section>
    </main>
  );
}
