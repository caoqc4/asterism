import { useEffect, useState } from 'react';

import type { ArtifactRecord } from '@shared/types/artifact';
import type { HomeBriefData, RecommendedActionIntent, RecommendedAction } from '@shared/types/brief';
import type { CreateDecisionInput, DecisionRecord } from '@shared/types/decision';
import type { AppEvent } from '@shared/types/events';
import type { PingResponse } from '@shared/types/ipc';
import type { CreateRunInput, RunRecord } from '@shared/types/run';
import type { AiConfigInput, AiConfigStatus } from '@shared/types/settings';
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

  async function handleCreateDecision(input: CreateDecisionInput) {
    const created = await window.api.createDecision(input);
    setDecisions((current) => [created, ...current]);
    setBriefData(await window.api.getHomeBrief());
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
            onOpenArtifact={handleOpenArtifact}
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
            onCreateDecision={handleCreateDecision}
            onCreateTask={handleCreateTask}
            onRefresh={loadShellData}
            onTransitionTask={handleTransitionTask}
            onTriggerRun={handleTriggerRun}
            onUpdateTask={handleUpdateTask}
            onTaskFocusConsumed={() => setFocusedTaskRequest(null)}
          />
        ) : null}
        {route === 'decisions' ? (
          <DecisionsPage
            decisions={decisions}
            tasks={tasks}
            onAct={handleDecisionAction}
            onCreateDecision={handleCreateDecision}
          />
        ) : null}
        {route === 'runs' ? (
          <RunsPage runs={runs} tasks={tasks} onRefresh={loadShellData} onTriggerRun={handleTriggerRun} />
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
