import { useEffect, useMemo, useState } from 'react';

import type { ArtifactRecord } from '@shared/types/artifact';
import type {
  CreateBlockerInput,
  UpdateBlockerInput,
} from '@shared/types/blocker';
import type {
  CompletionCriteriaRecord,
  CreateCompletionCriteriaInput,
  UpdateCompletionCriteriaInput,
} from '@shared/types/completion-criteria';
import type {
  CreateTaskDependencyInput,
  UpdateTaskDependencyInput,
} from '@shared/types/task-dependency';
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
import type { CreateCodeAgentRunInput, CreateRunInput, RunRecord } from '@shared/types/run';
import type { AiConfigInput, AiConfigStatus } from '@shared/types/settings';
import type {
  CreateSourceContextInput,
  UpdateSourceContextInput,
} from '@shared/types/source-context';
import type { TaskListItemRecord, TaskState, UpdateTaskInput } from '@shared/types/task';
import {
  comparePriorityLaneContext,
  deriveTaskPriorityLaneMap,
} from '@shared/working-context/priority-lanes';

import { getRouteFromHash, setRoute, type AppRoute } from './lib/router';
import { DecisionsPage } from './pages/DecisionsPage';
import { HomePage } from './pages/HomePage';
import { RunsPage } from './pages/RunsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';

const BLOCKER_TOKEN_STOP_WORDS = new Set([
  'need',
  'needs',
  'with',
  'from',
  'before',
  'after',
  'task',
  'item',
  'owner',
  'team',
  'current',
  'waiting',
]);

function getMeaningfulBlockerTokens(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => {
    const hasCjk = /[\p{Script=Han}]/u.test(token);
    if (hasCjk) {
      return token.length >= 2;
    }

    return token.length >= 4 && !BLOCKER_TOKEN_STOP_WORDS.has(token);
  });
}

function waitingIsClearlyDrivenByBlocker(task: HomeBriefData['blockerTasks'][number]): boolean {
  if (task.state !== 'waiting_external' || !task.activeBlocker) {
    return false;
  }

  const waitingText = [task.activeWaitingItem?.reason, task.waitingReason].filter(Boolean).join(' ').trim();
  if (!waitingText) {
    return false;
  }

  const blockerTexts = [
    task.activeBlocker.title,
    task.activeBlocker.detail,
    task.activeBlocker.owner,
  ].filter(Boolean) as string[];

  const waitingLower = waitingText.toLowerCase();
  const blockerLower = blockerTexts.map((value) => value.toLowerCase());

  if (blockerLower.some((value) => waitingLower.includes(value) || value.includes(waitingLower))) {
    return true;
  }

  const waitingTokens = new Set(getMeaningfulBlockerTokens(waitingText));
  if (!waitingTokens.size) {
    return false;
  }

  return blockerTexts.some((value) =>
    getMeaningfulBlockerTokens(value).some((token) => waitingTokens.has(token)),
  );
}

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
  const [tasks, setTasks] = useState<TaskListItemRecord[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [briefData, setBriefData] = useState<HomeBriefData | null>(null);
  const [sandboxBackendProbePending, setSandboxBackendProbePending] = useState(false);
  const [configForm, setConfigForm] = useState<AiConfigInput>({
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    baseUrl: '',
    workspaceRoot: '',
    apiKey: '',
    featureFlags: {
      enableScheduler: false,
      enableSandboxPatchPromotionApply: false,
    },
  });
  const [lastEvent, setLastEvent] = useState<AppEvent | null>(null);

  const taskPriorityLanes = useMemo(
    () =>
      deriveTaskPriorityLaneMap({
        tasks,
        missingNextStepTasks: briefData?.missingNextStepTasks,
        waitingTasks: briefData?.waitingTasks,
        recentArtifacts: briefData?.recentArtifacts,
        recentSourceContexts: briefData?.recentSourceContexts,
        recentActivity: briefData?.recentActivity,
        blockerTasks: briefData?.blockerTasks,
        highRiskTasks: briefData?.highRiskTasks,
        escalationTasks: briefData?.escalationTasks,
        completionReadyTasks: briefData?.completionReadyTasks,
        nearCompletionTasks: briefData?.nearCompletionTasks,
        decisions,
      }),
    [briefData, decisions, tasks],
  );
  const closeoutCompletionProgressByTaskId = useMemo(() => {
    const progressByTaskId = new Map<string, { total: number; satisfied: number; open: number }>();

    for (const task of briefData?.completionReadyTasks ?? []) {
      if (task.completionProgress) {
        progressByTaskId.set(task.id, task.completionProgress);
      }
    }

    for (const task of briefData?.nearCompletionTasks ?? []) {
      if (task.completionProgress) {
        progressByTaskId.set(task.id, task.completionProgress);
      }
    }

    return progressByTaskId;
  }, [briefData?.completionReadyTasks, briefData?.nearCompletionTasks]);
  const orderedTasks = useMemo(
    () =>
      [...tasks].sort((left, right) => {
        const laneDiff = comparePriorityLaneContext(
          {
            lane: taskPriorityLanes.get(left.id),
            completionProgress: closeoutCompletionProgressByTaskId.get(left.id) ?? null,
          },
          {
            lane: taskPriorityLanes.get(right.id),
            completionProgress: closeoutCompletionProgressByTaskId.get(right.id) ?? null,
          },
        );

        if (laneDiff !== 0) {
          return laneDiff;
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      }),
    [closeoutCompletionProgressByTaskId, taskPriorityLanes, tasks],
  );

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
        baseUrl: configStatus.baseUrl ?? '',
        workspaceRoot: configStatus.workspaceRoot ?? '',
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
      baseUrl: nextStatus.baseUrl ?? '',
      workspaceRoot: nextStatus.workspaceRoot ?? '',
      featureFlags: nextStatus.featureFlags,
    }));
  }

  async function handleProbeSandboxBackend() {
    if (!window.api.probeSandboxBackend) {
      return;
    }

    setSandboxBackendProbePending(true);

    try {
      const sandboxBackendStatus = await window.api.probeSandboxBackend();
      setAiStatus((current) =>
        current ? { ...current, sandboxBackendStatus } : current,
      );
    } finally {
      setSandboxBackendProbePending(false);
    }
  }

  async function handleCreateTask(input: { title: string; summary?: string }) {
    const created = await window.api.createTask(input);
    setTasks((current) => [created, ...current]);
    setBriefData(await window.api.getHomeBrief());
    setFocusedTaskRequest({
      key: `created:${created.id}:${created.updatedAt}`,
      taskId: created.id,
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
      },
    });
    setCurrentRoute('tasks');
    return created;
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

  async function handleCreateBlocker(input: CreateBlockerInput) {
    const created = await window.api.createBlocker(input);
    setTasks((current) =>
      current.map((task) => (task.id === created.taskId ? { ...task, updatedAt: created.updatedAt } : task)),
    );
    setBriefData(await window.api.getHomeBrief());
    return created;
  }

  async function handleUpdateBlocker(input: UpdateBlockerInput) {
    const updated = await window.api.updateBlocker(input);
    setTasks((current) =>
      current.map((task) => (task.id === updated.taskId ? { ...task, updatedAt: updated.updatedAt } : task)),
    );
    setBriefData(await window.api.getHomeBrief());
    return updated;
  }

  async function handleResolveBlocker(id: string) {
    const resolved = await window.api.resolveBlocker(id);
    setTasks((current) =>
      current.map((task) => (task.id === resolved.taskId ? { ...task, updatedAt: resolved.updatedAt } : task)),
    );
    setBriefData(await window.api.getHomeBrief());
    return resolved;
  }

  async function handleCreateCompletionCriteria(input: CreateCompletionCriteriaInput) {
    const created = await window.api.createCompletionCriteria(input);
    setTasks((current) =>
      current.map((task) => (task.id === created.taskId ? { ...task, updatedAt: created.updatedAt } : task)),
    );
    return created;
  }

  async function handleUpdateCompletionCriteria(input: UpdateCompletionCriteriaInput) {
    const updated = await window.api.updateCompletionCriteria(input);
    setTasks((current) =>
      current.map((task) => (task.id === updated.taskId ? { ...task, updatedAt: updated.updatedAt } : task)),
    );
    return updated;
  }

  async function handleSatisfyCompletionCriteria(id: string): Promise<CompletionCriteriaRecord> {
    const satisfied = await window.api.satisfyCompletionCriteria(id);
    setTasks((current) =>
      current.map((task) => (task.id === satisfied.taskId ? { ...task, updatedAt: satisfied.updatedAt } : task)),
    );
    return satisfied;
  }

  async function handleReopenCompletionCriteria(id: string): Promise<CompletionCriteriaRecord> {
    const reopened = await window.api.reopenCompletionCriteria(id);
    setTasks((current) =>
      current.map((task) => (task.id === reopened.taskId ? { ...task, updatedAt: reopened.updatedAt } : task)),
    );
    return reopened;
  }

  async function handleCreateTaskDependency(input: CreateTaskDependencyInput) {
    const created = await window.api.createTaskDependency(input);
    setTasks((current) =>
      current.map((task) =>
        task.id === created.taskId || task.id === created.blockedByTaskId
          ? { ...task, updatedAt: created.updatedAt }
          : task,
      ),
    );
    setBriefData(await window.api.getHomeBrief());
    return created;
  }

  async function handleUpdateTaskDependency(input: UpdateTaskDependencyInput) {
    const updated = await window.api.updateTaskDependency(input);
    setTasks((current) =>
      current.map((task) =>
        task.id === updated.taskId || task.id === updated.blockedByTaskId
          ? { ...task, updatedAt: updated.updatedAt }
          : task,
      ),
    );
    setBriefData(await window.api.getHomeBrief());
    return updated;
  }

  async function handleResolveTaskDependency(id: string) {
    const resolved = await window.api.resolveTaskDependency(id);
    setTasks((current) =>
      current.map((task) =>
        task.id === resolved.taskId || task.id === resolved.blockedByTaskId
          ? { ...task, updatedAt: resolved.updatedAt }
          : task,
      ),
    );
    setBriefData(await window.api.getHomeBrief());
    return resolved;
  }

  async function handleResolveBlockerFromHome(task: HomeBriefData['blockerTasks'][number]) {
    if (!task.activeBlocker) {
      return;
    }

    await window.api.resolveBlocker(task.activeBlocker.id);

    if (waitingIsClearlyDrivenByBlocker(task)) {
      await window.api.transitionTask({
        id: task.id,
        nextState: 'planned',
      });
    }

    await loadShellData();
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
    return created;
  }

  async function handleTriggerCodeAgentRun(input: CreateCodeAgentRunInput) {
    if (!window.api.triggerCodeAgentRun) {
      throw new Error('Code Agent run IPC is not available.');
    }

    const created = await window.api.triggerCodeAgentRun(input);
    setRuns((current) => [created, ...current.filter((run) => run.id !== created.id)]);
    setBriefData(await window.api.getHomeBrief());
    return created;
  }

  async function handleContinuePausedRun(runId: string) {
    const updated = await window.api.continuePausedRun(runId);
    setRuns((current) => current.map((run) => (run.id === updated.id ? updated : run)));
    setBriefData(await window.api.getHomeBrief());
    return updated;
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
    if (activity.sourceType === 'task') {
      handleOpenTask(activity.taskId, {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep:
          activity.status === 'captured'
            ? '先补一句任务摘要，再明确下一步。'
            : '先补清下一步，并判断这条任务是否需要正式拍板或继续执行。',
      });
      return;
    }

    if (activity.sourceType === 'dependency') {
      handleOpenTask(activity.taskId, {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep:
          activity.status === 'created'
            ? `先推动上游任务，以解除当前依赖：${activity.title}`
            : activity.status === 'resolved'
            ? `依赖已解除，继续推进：${activity.title}`
            : activity.status === 'upstream_ready'
            ? `基于上游任务完成重新判断是否解除依赖：${activity.title}`
            : `基于上游任务进展重新判断是否解除依赖：${activity.title}`,
      });
      return;
    }

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

      if (activity.status === 'cancelled') {
        handleOpenTask(activity.taskId, {
          type: 'focus_next_step',
          focusArea: 'detail',
          prefillNextStep: `重新评估该决策并确定替代推进路径：${activity.title}`,
        });
        return;
      }

      handleOpenTask(activity.taskId, {
        type: 'open_task',
        focusArea: 'quick-actions',
      });
      return;
    }

    if (activity.sourceType === 'blocker') {
      if (activity.status === 'source_updated') {
        handleOpenTask(activity.taskId, {
          type: activity.relatedSourceContextId ? 'focus_source_context' : 'focus_next_step',
          focusArea: 'detail',
          sourceContextId: activity.relatedSourceContextId ?? undefined,
          prefillNextStep: `基于来源更新重新判断是否解除阻塞：${activity.title}`,
        });
        return;
      }

      if (activity.status === 'resolved') {
        handleOpenTask(activity.taskId, {
          type: 'focus_next_step',
          focusArea: 'detail',
          prefillNextStep: `阻塞项已解除，继续推进：${activity.title}`,
        });
        return;
      }

      handleOpenTask(activity.taskId, {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `先解除阻塞项：${activity.title}`,
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

    if (activity.status === 'paused') {
      handleOpenTask(activity.taskId, {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `复核最近一次 ${activity.title} run 的暂停原因，处理阻塞后再继续。`,
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

    if (activity.sourceType === 'dependency' && activity.relatedTaskId) {
      handleOpenTask(activity.relatedTaskId, {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `先完成这条上游任务，以解除对“${activity.taskTitle}”的依赖。`,
      });
      return;
    }

    if (activity.sourceType === 'blocker' && activity.relatedSourceContextId) {
      handleOpenTask(activity.taskId, {
        type: 'focus_source_context',
        focusArea: 'detail',
        sourceContextId: activity.relatedSourceContextId,
        prefillNextStep: `基于来源更新重新判断是否解除阻塞：${activity.title}`,
      });
      return;
    }

    handleOpenRun(activity.sourceId);
  }

  function handleOpenResumeLatestChange(preview: HomeBriefData['recentTaskResumes'][number]) {
    if (preview.latestChange.action.targetType === 'decision' && preview.latestChange.action.targetId) {
      handleOpenDecision(preview.latestChange.action.targetId);
      return;
    }

    if (preview.latestChange.action.targetType === 'run' && preview.latestChange.action.targetId) {
      handleOpenRun(preview.latestChange.action.targetId);
      return;
    }

    if (preview.latestChange.action.targetType === 'source_context' && preview.latestChange.action.targetId) {
      handleOpenTask(preview.taskId, {
        type: 'focus_source_context',
        focusArea: 'detail',
        sourceContextId: preview.latestChange.action.targetId,
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

  async function handleOpenRunForCheckpoint(checkpointId: string): Promise<boolean> {
    for (const run of runs) {
      const detail = await window.api.getRunDetail(run.id);
      const hasCheckpoint = detail?.checkpoints?.some((checkpoint) => checkpoint.id === checkpointId);

      if (hasCheckpoint) {
        handleOpenRun(run.id);
        return true;
      }
    }

    return false;
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
            onOpenDecision={handleOpenDecision}
            onOpenRun={handleOpenRun}
            onOpenResumeLatestChange={handleOpenResumeLatestChange}
            onResolveBlockedTask={handleResolveBlockerFromHome}
            onOpenSourceContext={handleOpenSourceContext}
            ping={ping}
            status={status}
          />
        ) : null}
        {route === 'tasks' ? (
          <TasksPage
            aiStatus={aiStatus}
            decisions={decisions}
            focusedTaskRequest={focusedTaskRequest}
            runs={runs}
            taskPriorityLanes={taskPriorityLanes}
            tasks={orderedTasks}
            onApplyProcessTemplate={handleApplyProcessTemplate}
            onArchiveProcessTemplate={handleArchiveProcessTemplate}
            onCreateBlocker={handleCreateBlocker}
            onCreateCompletionCriteria={handleCreateCompletionCriteria}
            onCreateDecision={handleCreateDecision}
            onCreateTaskDependency={handleCreateTaskDependency}
            onDraftDecision={handleDraftDecision}
            onCreateProcessTemplate={handleCreateProcessTemplate}
            onCreateTask={handleCreateTask}
            onCreateSourceContext={handleCreateSourceContext}
            onArchiveSourceContext={handleArchiveSourceContext}
            onContinuePausedRun={handleContinuePausedRun}
            onOpenDecision={handleOpenDecision}
            onOpenRun={handleOpenRun}
            onOpenRunForCheckpoint={handleOpenRunForCheckpoint}
            onRefresh={loadShellData}
            onReopenCompletionCriteria={handleReopenCompletionCriteria}
            onProbeSandboxBackend={handleProbeSandboxBackend}
            onRemoveProcessTemplate={handleRemoveProcessTemplate}
            onResolveBlocker={handleResolveBlocker}
            onResolveTaskDependency={handleResolveTaskDependency}
            onSatisfyCompletionCriteria={handleSatisfyCompletionCriteria}
            onTransitionTask={handleTransitionTask}
            onTriggerCodeAgentRun={handleTriggerCodeAgentRun}
            onTriggerRun={handleTriggerRun}
            onUpdateBlocker={handleUpdateBlocker}
            onUpdateCompletionCriteria={handleUpdateCompletionCriteria}
            onUpdateTaskDependency={handleUpdateTaskDependency}
            onUpdateProcessTemplate={handleUpdateProcessTemplate}
            onUpdateSourceContext={handleUpdateSourceContext}
            onUpdateTask={handleUpdateTask}
            onTaskFocusConsumed={() => setFocusedTaskRequest(null)}
            sandboxBackendProbePending={sandboxBackendProbePending}
          />
        ) : null}
        {route === 'decisions' ? (
          <DecisionsPage
            aiStatus={aiStatus}
            decisions={decisions}
            focusedDecisionId={focusedDecisionId}
            tasks={tasks}
            onOpenTask={handleOpenTask}
            onAct={handleDecisionAction}
            onCreateDecision={handleCreateDecision}
            onDraftDecision={handleDraftDecision}
            onDecisionFocusConsumed={() => setFocusedDecisionId(null)}
            onOpenRunForCheckpoint={handleOpenRunForCheckpoint}
          />
        ) : null}
        {route === 'runs' ? (
          <RunsPage
            aiStatus={aiStatus}
            focusedRunId={focusedRunId}
            runs={runs}
            tasks={tasks}
            onOpenDecision={handleOpenDecision}
            onOpenTask={handleOpenTask}
            onRefresh={loadShellData}
            onRunFocusConsumed={() => setFocusedRunId(null)}
            onContinuePausedRun={handleContinuePausedRun}
            onTriggerRun={handleTriggerRun}
          />
        ) : null}
        {route === 'settings' ? (
          <SettingsPage
            aiStatus={aiStatus}
            configForm={configForm}
            onChange={setConfigForm}
            onProbeSandboxBackend={handleProbeSandboxBackend}
            sandboxBackendProbePending={sandboxBackendProbePending}
            onSubmit={handleSaveConfig}
          />
        ) : null}
      </section>
    </main>
  );
}
