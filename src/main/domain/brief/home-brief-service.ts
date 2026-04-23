import { RunRepository } from '../../db/repositories/run-repository.js';
import { BriefSnapshotRepository } from '../../db/repositories/brief-snapshot-repository.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { SchedulerService } from '../../scheduler/scheduler-service.js';
import type {
  HomeActivityRecord,
  HomeBriefData,
  HomeSourceContextRecord,
  HomeTaskSliceRecord,
  HomeTaskResumePreviewRecord,
  RecommendedAction,
} from '../../../shared/types/brief.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import { BlockerRepository } from '../../db/repositories/blocker-repository.js';
import { TaskProcessBindingRepository } from '../../db/repositories/task-process-binding-repository.js';
import { SourceContextRepository } from '../../db/repositories/source-context-repository.js';
import type { TaskListItemRecord, TaskRecord } from '../../../shared/types/task.js';
import type { BriefProcessTemplateCandidate } from '../../../shared/types/brief.js';
import {
  buildHomeResumeLatestChange,
  deriveNextSuggestedMove,
  getCurrentBlockerPriorityReason,
  getCurrentMethodSelectionReason,
  getKeySourcePriorityReason,
  safeJsonParse,
} from '../working-context/assembler.js';

function buildRecommendedActions(params: {
  activeTasks: HomeBriefData['recentTasks'];
  highRiskTasks: HomeBriefData['highRiskTasks'];
  pendingDecisions: HomeBriefData['pendingDecisions'];
  waitingTasks: HomeBriefData['waitingTasks'];
  missingNextStepTasks: HomeBriefData['missingNextStepTasks'];
  recentSourceContexts: HomeBriefData['recentSourceContexts'];
  recentArtifacts: HomeBriefData['recentArtifacts'];
}): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  const taskById = new Map(params.activeTasks.map((task) => [task.id, task]));
  const blockedTaskIds = new Set<string>();
  const missingNextStepTaskIds = new Set(params.missingNextStepTasks.map((task) => task.id));

  for (const task of params.highRiskTasks) {
    blockedTaskIds.add(task.id);
    actions.push({
      id: `risk:${task.id}`,
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

  for (const decision of params.pendingDecisions) {
    blockedTaskIds.add(decision.taskId);
    actions.push({
      id: `decision:${decision.id}`,
      label: `尽快拍板：${decision.title}`,
      reason: '该决策仍处于 pending，可能阻塞相关任务推进。',
      taskId: decision.taskId,
      priority: 'high',
      intent: {
        type: 'open_task',
        focusArea: 'quick-actions',
      },
    });
  }

  for (const task of params.waitingTasks) {
    blockedTaskIds.add(task.id);
    actions.push({
      id: `waiting:${task.id}`,
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

  for (const task of params.activeTasks) {
    if (!task.activeBlocker || blockedTaskIds.has(task.id)) {
      continue;
    }

    actions.push({
      id: `blocker:${task.activeBlocker.id}`,
      label: `跟进当前阻塞项：${task.title}`,
      reason:
        task.activeBlocker.detail ??
        task.activeBlocker.owner ??
        `当前阻塞项：${task.activeBlocker.title}`,
      taskId: task.id,
      priority: 'medium',
      intent: task.activeBlocker.sourceContextId
        ? {
            type: 'focus_source_context',
            focusArea: 'detail',
            sourceContextId: task.activeBlocker.sourceContextId,
            prefillNextStep: `先解除阻塞项，再继续推进：${task.activeBlocker.title}`,
          }
        : {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: `先解除阻塞项，再继续推进：${task.activeBlocker.title}`,
          },
    });
  }

  for (const task of params.missingNextStepTasks) {
    actions.push({
      id: `next-step:${task.id}`,
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

  for (const sourceContext of params.recentSourceContexts) {
    const task = taskById.get(sourceContext.taskId);

    if (!task) {
      continue;
    }

    if (missingNextStepTaskIds.has(task.id)) {
      actions.push({
        id: `source-context:next-step:${sourceContext.id}`,
        label: `先查看关键来源，再补下一步：${task.title}`,
        reason: `该任务还缺少明确下一步，先参考来源材料“${sourceContext.title}”。`,
        taskId: task.id,
        priority: 'medium',
        intent: {
          type: 'focus_source_context',
          focusArea: 'detail',
          sourceContextId: sourceContext.id,
          prefillNextStep: `先吸收来源材料，再补下一步：${sourceContext.title}`,
        },
      });
      continue;
    }

    if (blockedTaskIds.has(task.id)) {
      continue;
    }

    actions.push({
      id: `source-context:${sourceContext.id}`,
      label: `基于最新来源继续推进：${task.title}`,
      reason: `来源材料“${sourceContext.title}”最近有更新，可据此继续推进。`,
      taskId: task.id,
      priority: 'low',
      intent: {
        type: 'focus_source_context',
        focusArea: 'detail',
        sourceContextId: sourceContext.id,
        prefillNextStep: `基于来源材料继续推进：${sourceContext.title}`,
      },
    });
  }

  for (const artifact of params.recentArtifacts) {
    const task = params.activeTasks.find((item) => item.id === artifact.taskId);

    if (!task) {
      continue;
    }

    actions.push({
      id: `artifact:${artifact.id}`,
      label: `基于最新产物继续推进：${task.title}`,
      reason: `${artifact.title} 已生成，可继续整理、扩展或发起下一轮执行。`,
      taskId: artifact.taskId,
      priority: 'low',
      intent: {
        type: 'continue_from_artifact',
        focusArea: 'detail',
        prefillNextStep: `基于产物继续推进：${artifact.title}`,
        prefillRunInstructions: artifact.content
          ? `请基于这份已有产物继续扩展、改写或整理：${artifact.content}`
          : `请基于已有产物继续推进：${artifact.title}`,
      },
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: 'steady-state',
      label: '当前无需额外干预',
      reason: '暂时没有高风险、等待阻塞或缺少下一步的活跃任务。',
      taskId: null,
      priority: 'low',
      intent: {
        type: 'open_task',
      },
    });
  }

  return actions.slice(0, 5);
}

export class HomeBriefService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly waitingItemRepository: WaitingItemRepository,
    private readonly blockerRepository: BlockerRepository | null,
    private readonly decisionRepository: DecisionRepository,
    private readonly runRepository: RunRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly sourceContextRepository: SourceContextRepository | null = null,
    private readonly briefSnapshotRepository: BriefSnapshotRepository,
    private readonly getSchedulerStatus: () => SchedulerService | null,
    private readonly taskProcessBindingRepository: TaskProcessBindingRepository | null = null,
  ) {}

  private async buildProcessTemplateCandidates(
    activeTasks: TaskListItemRecord[],
  ): Promise<BriefProcessTemplateCandidate[]> {
    if (!this.taskProcessBindingRepository || activeTasks.length === 0) {
      return [];
    }

    const appliedTemplates = await this.taskProcessBindingRepository.listActiveForTasks(
      activeTasks.map((task) => task.id),
    );

    const taskTitleById = new Map(activeTasks.map((task) => [task.id, task.title]));
    const aggregated = new Map<string, BriefProcessTemplateCandidate>();

    for (const item of appliedTemplates) {
      const current = aggregated.get(item.id);
      const taskTitle = taskTitleById.get(item.taskId) ?? item.taskId;
      const note = item.bindingNote?.trim();

      if (!current) {
        aggregated.set(item.id, {
          id: item.id,
          title: item.title,
          summary: item.summary,
          content: item.content,
          kind: item.kind,
          tags: item.tags,
          taskIds: [item.taskId],
          taskTitles: [taskTitle],
          notes: note ? [note] : [],
        });
        continue;
      }

      if (!current.taskIds.includes(item.taskId)) {
        current.taskIds.push(item.taskId);
      }
      if (!current.taskTitles.includes(taskTitle)) {
        current.taskTitles.push(taskTitle);
      }
      if (note && !current.notes.includes(note)) {
        current.notes.push(note);
      }
    }

    return [...aggregated.values()].slice(0, 8);
  }

  private async buildTaskResumePreviews(params: {
    recentTasks: HomeTaskSliceRecord[];
    recentActivity: HomeActivityRecord[];
    recentSourceContexts: HomeSourceContextRecord[];
    appliedTemplates: Awaited<ReturnType<TaskProcessBindingRepository['listActiveForTasks']>>;
  }): Promise<HomeTaskResumePreviewRecord[]> {
    const activityByTaskId = new Map<string, HomeActivityRecord>();

    for (const item of params.recentActivity) {
      if (!activityByTaskId.has(item.taskId)) {
        activityByTaskId.set(item.taskId, item);
      }
    }

    return Promise.all(params.recentTasks.map(async (task) => {
      const latestActivity = activityByTaskId.get(task.id);
      const keySource =
        params.recentSourceContexts.find((item) => item.taskId === task.id && item.isKey) ??
        params.recentSourceContexts.find((item) => item.taskId === task.id) ??
        null;
      const currentMethod =
        params.appliedTemplates.find((item) => item.taskId === task.id) ?? null;
      const detail = await this.taskRepository.getDetail(task.id);
      const timeline = detail?.timeline ?? [];

      const currentStateParts = [`状态：${task.state}`];
      const waitingReason = task.activeWaitingItem?.reason ?? task.waitingReason;

      if (waitingReason) {
        currentStateParts.push(`等待：${waitingReason}`);
      }

      if (task.activeBlocker?.title) {
        currentStateParts.push(`阻塞：${task.activeBlocker.title}`);
      }

      if (task.riskLevel !== 'none') {
        currentStateParts.push(
          `风险：${task.riskLevel}${task.riskNote ? ` · ${task.riskNote}` : ''}`,
        );
      }

      const latestChange = buildHomeResumeLatestChange({
        latestActivity,
        keySource,
        activeBlocker: task.activeBlocker
          ? {
              id: task.activeBlocker.id,
              title: task.activeBlocker.title,
              sourceContextId: task.activeBlocker.sourceContextId,
            }
          : null,
      });

      const nextSuggestedMove = deriveNextSuggestedMove({
        explicitNextStep: task.nextStep,
        taskTitle: task.title,
        waitingReason,
        riskLevel: task.riskLevel,
        riskNote: task.riskNote,
        blockerTitle: task.activeBlocker?.title ?? null,
        keySourceTitle: keySource?.title ?? null,
        recentChange: latestChange.recentChange,
      });

      let contextAction:
        | {
            label: string;
            intent: {
              type: 'focus_next_step' | 'focus_waiting_follow_up' | 'focus_risk_review' | 'focus_source_context';
              focusArea: 'detail';
              prefillNextStep: string;
              prefillRiskLevel?: 'high';
              prefillRiskNote?: string | null;
              sourceContextId?: string;
            };
          };

      if (latestActivity?.sourceType === 'decision' && latestActivity.status === 'approved') {
        contextAction = {
          label: '继续推进任务',
          intent: {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: `已获批准，继续推进：${latestActivity.title}`,
          },
        };
      } else if (latestActivity?.sourceType === 'decision' && latestActivity.status === 'deferred') {
        contextAction = {
          label: '跟进拍板进度',
          intent: {
            type: 'focus_waiting_follow_up',
            focusArea: 'detail',
            prefillNextStep: '跟进该决策是否可以恢复拍板，或准备替代推进路径。',
          },
        };
      } else if (latestActivity?.sourceType === 'decision' && latestActivity.status === 'cancelled') {
        contextAction = {
          label: '重新评估决策',
          intent: {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: `重新评估该决策并确定替代推进路径：${latestActivity.title}`,
          },
        };
      } else if (latestActivity?.sourceType === 'run' && latestActivity.status === 'failed') {
        contextAction = {
          label: '处理失败结果',
          intent: {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: `检查最近一次 ${latestActivity.title} run 的失败原因，并决定是否重试。`,
          },
        };
      } else if (latestActivity?.sourceType === 'run' && latestActivity.status === 'completed') {
        contextAction = {
          label: '基于结果继续推进',
          intent: {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: `审阅最近一次 ${latestActivity.title} run 的结果，并决定是否继续推进。`,
          },
        };
      } else if (waitingReason) {
        contextAction = {
          label: '跟进等待项',
          intent: {
            type: 'focus_waiting_follow_up',
            focusArea: 'detail',
            prefillNextStep: nextSuggestedMove,
          },
        };
      } else if (task.activeBlocker?.sourceContextId) {
        contextAction = {
          label: '查看阻塞来源',
          intent: {
            type: 'focus_source_context',
            focusArea: 'detail',
            sourceContextId: task.activeBlocker.sourceContextId,
            prefillNextStep: nextSuggestedMove,
          },
        };
      } else if (task.activeBlocker) {
        contextAction = {
          label: '跟进阻塞项',
          intent: {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: nextSuggestedMove,
          },
        };
      } else if (task.riskLevel === 'high') {
        contextAction = {
          label: '处理风险',
          intent: {
            type: 'focus_risk_review',
            focusArea: 'detail',
            prefillNextStep: nextSuggestedMove,
            prefillRiskLevel: 'high',
            prefillRiskNote: task.riskNote,
          },
        };
      } else if (keySource) {
        contextAction = {
          label: '查看关键来源',
          intent: {
            type: 'focus_source_context',
            focusArea: 'detail',
            sourceContextId: keySource.id,
            prefillNextStep: nextSuggestedMove,
          },
        };
      } else {
        contextAction = {
          label: '采用建议下一步',
          intent: {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: nextSuggestedMove,
          },
        };
      }

      return {
        taskId: task.id,
        taskTitle: task.title,
        currentState: currentStateParts.join(' · '),
        latestChange: {
          summary: latestChange.summary,
          action: latestChange.action,
        },
        currentBlocker: task.activeBlocker
          ? {
              title: task.activeBlocker.title,
              priorityReason: getCurrentBlockerPriorityReason({
                blocker: task.activeBlocker,
                audience: 'home',
              }),
            }
          : {
              title: null,
              priorityReason: null,
            },
        keySource: {
          sourceContextId: keySource?.id ?? null,
          title: keySource?.title ?? null,
          priorityReason: keySource
            ? getKeySourcePriorityReason({
                timeline,
                keySource,
                audience: 'home',
              })
            : null,
        },
        currentMethod: {
          title: currentMethod?.title ?? null,
          selectionReason: getCurrentMethodSelectionReason({
            timeline,
            currentMethod,
            audience: 'home',
          }),
        },
        nextSuggestedMove,
        contextActionLabel: contextAction.label,
        contextActionIntent: contextAction.intent,
      };
    }));
  }

  private async attachActiveWaitingItems(tasks: TaskRecord[]): Promise<TaskListItemRecord[]> {
    const activeBlockers = this.blockerRepository
      ? await this.blockerRepository.listActiveForTasks(tasks.map((task) => task.id))
      : [];
    const blockerByTaskId = new Map(activeBlockers.map((item) => [item.taskId, item]));

    return Promise.all(
      tasks.map(async (task) => ({
        ...task,
        activeWaitingItem: await this.waitingItemRepository.getActiveForTask(task.id),
        activeBlocker: blockerByTaskId.get(task.id) ?? null,
      })),
    );
  }

  private toHomeTaskSlice(task: TaskListItemRecord): HomeTaskSliceRecord {
    return {
      id: task.id,
      title: task.title,
      summary: task.summary,
      state: task.state,
      nextStep: task.nextStep,
      waitingReason: task.waitingReason,
      activeWaitingItem: task.activeWaitingItem,
      activeBlocker: task.activeBlocker,
      riskLevel: task.riskLevel,
      riskNote: task.riskNote,
    };
  }

  private buildRecentActivity(
    tasks: TaskListItemRecord[],
    decisions: Awaited<ReturnType<DecisionRepository['list']>>,
    runs: Awaited<ReturnType<RunRepository['list']>>,
  ): HomeActivityRecord[] {
    const taskTitleById = new Map(tasks.map((task) => [task.id, task.title]));

    const decisionEvents: HomeActivityRecord[] = decisions
      .filter((decision) => decision.status !== 'pending')
      .map((decision) => ({
        id: `decision:${decision.id}`,
        sourceType: 'decision',
        sourceId: decision.id,
        taskId: decision.taskId,
        taskTitle: taskTitleById.get(decision.taskId) ?? decision.taskId,
        title: decision.title,
        status: decision.status,
        updatedAt: decision.updatedAt,
      }));

    const runEvents: HomeActivityRecord[] = runs
      .filter((run) => run.status === 'completed' || run.status === 'failed')
      .map((run) => ({
        id: `run:${run.id}`,
        sourceType: 'run',
        sourceId: run.id,
        taskId: run.taskId,
        taskTitle: taskTitleById.get(run.taskId) ?? run.taskId,
        title: run.type,
        status: run.status,
        updatedAt: run.updatedAt,
      }));

    return [...decisionEvents, ...runEvents]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5);
  }

  private async buildRecentSourceContexts(
    activeTasks: TaskListItemRecord[],
  ): Promise<HomeSourceContextRecord[]> {
    if (!this.sourceContextRepository || activeTasks.length === 0) {
      return [];
    }

    const taskTitleById = new Map(activeTasks.map((task) => [task.id, task.title]));
    const items = await this.sourceContextRepository.listActiveForTasks(
      activeTasks.map((task) => task.id),
    );

    return [...items]
      .sort((left, right) => {
        if (left.isKey !== right.isKey) {
          return left.isKey ? -1 : 1;
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, 5)
      .map((item) => ({
      id: item.id,
      taskId: item.taskId,
      taskTitle: taskTitleById.get(item.taskId) ?? item.taskId,
      title: item.title,
      kind: item.kind,
      isKey: item.isKey,
      uri: item.uri,
      note: item.note,
      updatedAt: item.updatedAt,
      }));
  }

  async getHomeData(): Promise<HomeBriefData> {
    const [taskRows, decisions, runs, recentArtifacts, recentBriefSnapshots] = await Promise.all([
      this.taskRepository.list(),
      this.decisionRepository.list(),
      this.runRepository.list(),
      this.artifactRepository.listRecent(5),
      this.briefSnapshotRepository.listRecent(5),
    ]);
    const tasks = await this.attachActiveWaitingItems(taskRows);

    const activeTasks = tasks.filter((task) => !['completed', 'archived'].includes(task.state));
    const completedTasks = tasks.filter((task) => task.state === 'completed');
    const pendingDecisions = decisions.filter((decision) => decision.status === 'pending');
    const waitingTasks = tasks.filter(
      (task) =>
        task.state === 'waiting_external' ||
        Boolean(task.activeWaitingItem?.reason) ||
        Boolean(task.waitingReason),
    );
    const highRiskTasks = tasks.filter((task) => task.riskLevel === 'high');
    const missingNextStepTasks = activeTasks.filter((task) => !task.nextStep?.trim());
    const scheduler = this.getSchedulerStatus();
    const recentActivity = this.buildRecentActivity(tasks, decisions, runs);
    const recentSourceContexts = await this.buildRecentSourceContexts(activeTasks);
    const appliedTemplates = this.taskProcessBindingRepository
      ? await this.taskProcessBindingRepository.listActiveForTasks(activeTasks.map((task) => task.id))
      : [];
    const processTemplateCandidates = await this.buildProcessTemplateCandidates(activeTasks);
    const recentTaskResumes = await this.buildTaskResumePreviews({
      recentTasks: tasks.slice(0, 5).map((task) => this.toHomeTaskSlice(task)),
      recentActivity,
      recentSourceContexts,
      appliedTemplates,
    });
    const recommendedActions = buildRecommendedActions({
      activeTasks: activeTasks.slice(0, 10),
      highRiskTasks,
      pendingDecisions: pendingDecisions.slice(0, 5),
      waitingTasks,
      missingNextStepTasks,
      recentSourceContexts,
      recentArtifacts,
    });

    return {
      activeTaskCount: activeTasks.length,
      pendingDecisionCount: pendingDecisions.length,
      completedTaskCount: completedTasks.length,
      recentRunCount: runs.length,
      waitingTaskCount: waitingTasks.length,
      highRiskTaskCount: highRiskTasks.length,
      missingNextStepTaskCount: missingNextStepTasks.length,
      recentTasks: tasks.slice(0, 5).map((task) => this.toHomeTaskSlice(task)),
      waitingTasks: waitingTasks.slice(0, 5).map((task) => this.toHomeTaskSlice(task)),
      highRiskTasks: highRiskTasks.slice(0, 5).map((task) => this.toHomeTaskSlice(task)),
      missingNextStepTasks: missingNextStepTasks
        .slice(0, 5)
        .map((task) => this.toHomeTaskSlice(task)),
      pendingDecisions: pendingDecisions.slice(0, 5),
      recommendedActions,
      recentArtifacts,
      recentSourceContexts,
      recentTaskResumes,
      recentActivity,
      recentBriefSnapshots,
      processTemplateCandidates,
      schedulerStatus: scheduler?.getStatus() ?? {
        enabled: false,
        running: false,
        lastBriefAt: null,
        lastRunSweepAt: null,
      },
    };
  }
}
