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
  PriorityLane,
  RecommendedAction,
} from '../../../shared/types/brief.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { RunRecord } from '../../../shared/types/run.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import { BlockerRepository } from '../../db/repositories/blocker-repository.js';
import { CompletionCriteriaRepository } from '../../db/repositories/completion-criteria-repository.js';
import { TaskDependencyRepository } from '../../db/repositories/task-dependency-repository.js';
import { TaskProcessBindingRepository } from '../../db/repositories/task-process-binding-repository.js';
import { SourceContextRepository } from '../../db/repositories/source-context-repository.js';
import type {
  TaskListItemRecord,
  TaskRecord,
  TimelineEventRecord,
} from '../../../shared/types/task.js';
import type { BriefProcessTemplateCandidate } from '../../../shared/types/brief.js';
import {
  buildHomeResumeLatestChange,
  deriveNextSuggestedMove,
  getCurrentBlockerAgeLabel,
  getCurrentBlockerPriorityReason,
  getCurrentDependencyAgeLabel,
  getCurrentDependencyPriorityReason,
  getCurrentMethodSelectionReason,
  getKeySourcePriorityReason,
} from '../working-context/assembler.js';
import { isStaleBlocker } from '../../../shared/working-context/blocker.js';
import { isStaleDependency } from '../../../shared/working-context/dependency.js';
import { comparePriorityLaneContext, comparePriorityLanes, deriveTaskPriorityLaneMap } from '../../../shared/working-context/priority-lanes.js';
import { getResponsibilitySummary } from '../../../shared/working-context/responsibility.js';
import { safeJsonParse } from '../../../shared/working-context/timeline.js';

type InternalRecommendedAction = RecommendedAction & {
  lane: PriorityLane;
  order: number;
};

type DependencyReevaluationRecord = {
  taskId: string;
  dependencyId: string;
  upstreamTaskId: string;
  upstreamTaskTitle: string;
  status: 'upstream_ready' | 'upstream_unblocked';
  updatedAt: string;
};

const LANE_ORDER: Record<PriorityLane, number> = {
  escalate_now: 0,
  unblock_or_decide: 1,
  continue_or_review: 2,
  clarify: 3,
  steady: 4,
};

function buildRecommendedActions(params: {
  activeTasks: HomeBriefData['recentTasks'];
  highRiskTasks: HomeBriefData['highRiskTasks'];
  pendingDecisions: HomeBriefData['pendingDecisions'];
  dependencyTasks: HomeTaskSliceRecord[];
  dependencyReevaluationByTaskId: Map<string, DependencyReevaluationRecord>;
  waitingTasks: HomeBriefData['waitingTasks'];
  missingNextStepTasks: HomeBriefData['missingNextStepTasks'];
  completionReadyTasks: HomeTaskSliceRecord[];
  nearCompletionTasks: HomeTaskSliceRecord[];
  recentSourceContexts: HomeBriefData['recentSourceContexts'];
  recentArtifacts: HomeBriefData['recentArtifacts'];
}): RecommendedAction[] {
  const actions: InternalRecommendedAction[] = [];
  const taskById = new Map(params.activeTasks.map((task) => [task.id, task]));
  const blockedTaskIds = new Set<string>();
  const missingNextStepTaskIds = new Set(params.missingNextStepTasks.map((task) => task.id));
  let order = 0;
  const compareBlockedTasks = (left: HomeTaskSliceRecord, right: HomeTaskSliceRecord) =>
    (left.activeBlocker?.createdAt ?? '').localeCompare(right.activeBlocker?.createdAt ?? '');

  for (const task of params.highRiskTasks) {
    blockedTaskIds.add(task.id);
    actions.push({
      id: `risk:${task.id}`,
      label: `优先处理高风险任务：${task.title}`,
      reason: task.riskNote ?? '该任务当前处于高风险状态。',
      responsibilitySummary: null,
      taskId: task.id,
      priority: 'high',
      lane: 'escalate_now',
      order: order++,
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
      responsibilitySummary: null,
      taskId: decision.taskId,
      priority: 'high',
      lane: 'unblock_or_decide',
      order: order++,
      intent: {
        type: 'open_task',
        focusArea: 'quick-actions',
      },
    });
  }

  for (const task of params.dependencyTasks) {
    if (!task.activeDependency || blockedTaskIds.has(task.id)) {
      continue;
    }

    blockedTaskIds.add(task.id);
    const dependencyReevaluation = params.dependencyReevaluationByTaskId.get(task.id);
    const staleDependency = isStaleDependency(task.activeDependency.createdAt);
    actions.push({
      id: `task-dependency:${task.activeDependency.id}`,
      label: staleDependency
        ? `优先升级依赖链路：${task.title}`
        : dependencyReevaluation
        ? `重新判断依赖：${task.title}`
        : `先推动上游任务：${task.activeDependency.blockedByTaskTitle ?? task.title}`,
      reason: staleDependency
        ? `任务“${task.title}”已依赖上游任务“${
            task.activeDependency.blockedByTaskTitle ?? '未命名上游任务'
          }”过久，建议优先推动上游任务并重新判断是否解除依赖。`
        : dependencyReevaluation
        ? dependencyReevaluation.status === 'upstream_ready'
          ? `上游任务“${dependencyReevaluation.upstreamTaskTitle}”已完成，可重新判断任务“${task.title}”是否解除依赖并继续推进。`
          : `上游任务“${dependencyReevaluation.upstreamTaskTitle}”刚解除关键阻塞，可重新判断任务“${task.title}”是否恢复推进。`
        : `任务“${task.title}”当前依赖上游任务“${
            task.activeDependency.blockedByTaskTitle ?? '未命名上游任务'
          }”先完成。`,
      responsibilitySummary: getResponsibilitySummary({
        kind: 'upstream_task',
        label: task.activeDependency.blockedByTaskTitle,
        audience: 'home',
        subject: 'dependency',
      }),
      taskId: staleDependency || dependencyReevaluation ? task.id : task.activeDependency.blockedByTaskId,
      priority: staleDependency ? 'high' : 'medium',
      lane: staleDependency ? 'escalate_now' : dependencyReevaluation ? 'continue_or_review' : 'unblock_or_decide',
      order: order++,
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: staleDependency
          ? `优先推动上游任务“${task.activeDependency.blockedByTaskTitle ?? '未命名上游任务'}”，并重新判断是否解除对“${task.title}”的依赖。`
          : dependencyReevaluation
          ? `基于上游任务进展重新判断是否解除依赖：${dependencyReevaluation.upstreamTaskTitle}`
          : `先完成这条上游任务，以解除对“${task.title}”的依赖。`,
      },
    });
  }

  for (const task of params.waitingTasks) {
    blockedTaskIds.add(task.id);
    actions.push({
      id: `waiting:${task.id}`,
      label: `跟进等待中的任务：${task.title}`,
      reason: task.activeWaitingItem?.reason ?? task.waitingReason ?? '该任务处于等待状态，需要恢复推进。',
      responsibilitySummary: null,
      taskId: task.id,
      priority: 'medium',
      lane: 'clarify',
      order: order++,
      intent: {
        type: 'focus_waiting_follow_up',
        focusArea: 'detail',
        prefillNextStep: `跟进并确认是否解除等待：${
          task.activeWaitingItem?.reason ?? task.waitingReason ?? task.title
        }`,
      },
    });
  }

  for (const task of [...params.activeTasks].sort(compareBlockedTasks)) {
    if (!task.activeBlocker || blockedTaskIds.has(task.id)) {
      continue;
    }

    actions.push({
      id: `blocker:${task.activeBlocker.id}`,
      label: `${isStaleBlocker(task.activeBlocker.createdAt) ? '优先升级阻塞项' : '跟进当前阻塞项'}：${task.title}`,
      reason: getCurrentBlockerPriorityReason({
        blocker: task.activeBlocker,
        audience: 'home',
      }),
      responsibilitySummary: getResponsibilitySummary({
        kind: task.activeBlocker.responsibility,
        label: task.activeBlocker.responsibilityLabel ?? task.activeBlocker.owner,
        audience: 'home',
        subject: 'blocker',
      }),
      taskId: task.id,
      priority: isStaleBlocker(task.activeBlocker.createdAt) ? 'high' : 'medium',
      lane: isStaleBlocker(task.activeBlocker.createdAt) ? 'escalate_now' : 'unblock_or_decide',
      order: order++,
      intent: task.activeBlocker.sourceContextId
        ? {
            type: 'focus_source_context',
            focusArea: 'detail',
            sourceContextId: task.activeBlocker.sourceContextId,
            prefillNextStep: isStaleBlocker(task.activeBlocker.createdAt)
              ? `优先升级当前阻塞项：${task.activeBlocker.title}`
              : `先解除阻塞项，再继续推进：${task.activeBlocker.title}`,
          }
        : {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: isStaleBlocker(task.activeBlocker.createdAt)
              ? `优先升级当前阻塞项：${task.activeBlocker.title}`
              : `先解除阻塞项，再继续推进：${task.activeBlocker.title}`,
          },
    });
  }

  for (const task of params.missingNextStepTasks) {
    actions.push({
      id: `next-step:${task.id}`,
      label: `补充下一步：${task.title}`,
      reason: '该任务仍缺少明确下一步，后续推进成本会升高。',
      responsibilitySummary: null,
      taskId: task.id,
      priority: 'medium',
      lane: 'clarify',
      order: order++,
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
      },
    });
  }

  for (const task of params.completionReadyTasks) {
    actions.push({
      id: `completion-ready:${task.id}`,
      label: `收尾并完成任务：${task.title}`,
      reason: `这条任务的完成标准已全部满足，可在最终检查后转到 completed。`,
      responsibilitySummary: null,
      taskId: task.id,
      priority: 'medium',
      lane: 'continue_or_review',
      order: order++,
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `确认完成标准已满足，并判断是否将“${task.title}”转到 completed。`,
      },
    });
  }

  for (const task of params.nearCompletionTasks) {
    actions.push({
      id: `near-completion:${task.id}`,
      label: `补最后一个完成标准：${task.title}`,
      reason: `这条任务只差最后 ${task.completionProgress?.open ?? 1} 条完成标准，可优先做收尾判断。`,
      responsibilitySummary: task.completionProgress?.nextOpenResponsibilitySummary ?? null,
      taskId: task.id,
      priority: 'medium',
      lane: 'continue_or_review',
      order: order++,
      intent: {
        type: 'focus_next_step',
        focusArea: 'detail',
        prefillNextStep: `优先补齐最后一条完成标准，并判断“${task.title}”是否可以收尾。`,
      },
    });
  }

  for (const sourceContext of params.recentSourceContexts) {
    const task = taskById.get(sourceContext.taskId);

    if (!task) {
      continue;
    }

    const activeBlocker = task.activeBlocker;
    const blockerSourceMatch = activeBlocker && activeBlocker.sourceContextId === sourceContext.id;

    if (blockerSourceMatch) {
      actions.push({
        id: `source-context:blocker:${sourceContext.id}`,
        label: `基于来源更新重新判断阻塞：${task.title}`,
        reason: `阻塞来源材料“${sourceContext.title}”最近有更新，可重新判断是否解除当前阻塞。`,
        responsibilitySummary: getResponsibilitySummary({
          kind: activeBlocker.responsibility,
          label: activeBlocker.responsibilityLabel ?? activeBlocker.owner,
          audience: 'home',
          subject: 'blocker',
        }),
        taskId: task.id,
        priority: isStaleBlocker(activeBlocker.createdAt) ? 'high' : 'medium',
        lane: 'unblock_or_decide',
        order: order++,
        intent: {
          type: 'focus_source_context',
          focusArea: 'detail',
          sourceContextId: sourceContext.id,
          prefillNextStep: `基于来源更新重新判断是否解除阻塞：${activeBlocker.title}`,
        },
      });
      continue;
    }

    if (missingNextStepTaskIds.has(task.id)) {
      actions.push({
        id: `source-context:next-step:${sourceContext.id}`,
        label: `先查看关键来源，再补下一步：${task.title}`,
        reason: `该任务还缺少明确下一步，先参考来源材料“${sourceContext.title}”。`,
        responsibilitySummary: null,
        taskId: task.id,
        priority: 'medium',
        lane: 'clarify',
        order: order++,
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
      responsibilitySummary: null,
      taskId: task.id,
      priority: 'low',
      lane: 'continue_or_review',
      order: order++,
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
      responsibilitySummary: null,
      taskId: artifact.taskId,
      priority: 'low',
      lane: 'continue_or_review',
      order: order++,
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
      responsibilitySummary: null,
      taskId: null,
      priority: 'low',
      lane: 'steady',
      order: order++,
      intent: {
        type: 'open_task',
      },
    });
  }

  return actions
    .sort((left, right) => {
      const laneDiff = LANE_ORDER[left.lane] - LANE_ORDER[right.lane];

      if (laneDiff !== 0) {
        return laneDiff;
      }

      const priorityDiff =
        (left.priority === 'high' ? 0 : left.priority === 'medium' ? 1 : 2) -
        (right.priority === 'high' ? 0 : right.priority === 'medium' ? 1 : 2);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return left.order - right.order;
    })
    .slice(0, 5)
    .map(({ order: _order, ...action }) => action);
}

function classifyPriorityLane(params: {
  escalationTaskCount: number;
  staleBlockerTaskCount: number;
  staleDependencyTaskCount: number;
  highRiskTaskCount: number;
  pendingDecisionCount: number;
  blockerTaskCount: number;
  dependencyTaskCount: number;
  blockerReevaluationCount: number;
  dependencyRecoveryCount: number;
  completionReadyTaskCount: number;
  nearCompletionTaskCount: number;
  continueOrReviewCount: number;
  waitingTaskCount: number;
  missingNextStepTaskCount: number;
}): {
  lane: PriorityLane;
  headline: string;
  lede: string;
} {
  if (params.staleDependencyTaskCount > 0 && params.staleBlockerTaskCount === 0) {
    return {
      lane: 'escalate_now',
      headline: `当前有 ${params.staleDependencyTaskCount} 条任务因依赖链路过久需要升级处理`,
      lede: '当前最值得先处理的是依赖过久的任务；首页会优先把老化依赖链提成升级信号，并引导你先推动上游任务或重新判断是否解除依赖。',
    };
  }

  if (params.escalationTaskCount > 0) {
    return {
      lane: 'escalate_now',
      headline: `当前有 ${params.escalationTaskCount} 条任务需要升级处理`,
      lede: '当前最值得先处理的是长期阻塞或依赖过久的任务；首页会优先把升级处理语义前置，再考虑普通阻塞、风险或等待恢复。',
    };
  }

  if (params.highRiskTaskCount > 0) {
    return {
      lane: 'escalate_now',
      headline: `当前有 ${params.highRiskTaskCount} 个高风险任务需要优先处理`,
      lede: '当前最值得先处理的是高风险任务；首页会先把风险控制语义前置，再考虑普通解阻塞或继续推进动作。',
    };
  }

  const unresolvedDependencyCount = Math.max(
    0,
    params.dependencyTaskCount - params.dependencyRecoveryCount,
  );
  const unblockOrDecideCount =
    params.pendingDecisionCount +
    params.blockerTaskCount +
    unresolvedDependencyCount +
    params.blockerReevaluationCount;

  if (unblockOrDecideCount > 0) {
    return {
      lane: 'unblock_or_decide',
      headline: `当前有 ${unblockOrDecideCount} 条任务需要先解阻塞或拍板`,
      lede: '当前最值得先处理的是解阻塞与拍板条件；首页会优先提示 pending decision、active blocker、上游任务依赖，以及 blocker 来源更新后的重新判断。',
    };
  }

  if (params.continueOrReviewCount > 0) {
    if (params.completionReadyTaskCount > 0) {
      return {
        lane: 'continue_or_review',
        headline: `当前有 ${params.completionReadyTaskCount} 条任务已满足完成标准，值得收尾`,
        lede: '当前最值得先处理的是已具备完成条件的任务；首页会优先提示收尾判断，再回到普通执行结果、产物和来源复核。',
      };
    }

    if (params.nearCompletionTaskCount > 0) {
      return {
        lane: 'continue_or_review',
        headline: `当前有 ${params.nearCompletionTaskCount} 条任务只差最后一条完成标准`,
        lede: '当前最值得先处理的是接近完成的任务；首页会优先提示补最后一个完成标准，再回到普通执行结果、产物和来源复核。',
      };
    }

    if (params.dependencyRecoveryCount > 0) {
      return {
        lane: 'continue_or_review',
        headline: `当前有 ${params.dependencyRecoveryCount} 条任务依赖已具备恢复推进条件`,
        lede: '当前最值得先处理的是依赖刚解除或上游任务刚就绪的任务；首页会优先提示重新判断是否解除依赖，再回到普通执行结果、产物和来源复核。',
      };
    }

    return {
      lane: 'continue_or_review',
      headline: `当前有 ${params.continueOrReviewCount} 条任务可继续推进或复核结果`,
      lede: '当前主要工作不是救火，而是基于最新执行结果、产物或来源材料继续推进并完成复核。',
    };
  }

  const clarifyCount = params.waitingTaskCount + params.missingNextStepTaskCount;

  if (clarifyCount > 0) {
    return {
      lane: 'clarify',
      headline: `当前有 ${clarifyCount} 条任务需要先补清晰度`,
      lede: '当前优先补齐等待原因、下一步或上下文清晰度，避免这些任务继续停留在可恢复但不易推进的状态。',
    };
  }

  return {
    lane: 'steady',
    headline: '本地优先控制台骨架已进入任务闭环阶段',
    lede: '当前没有更强的升级、解阻塞或复核信号，首页以稳态任务恢复和局势观察为主。',
  };
}

function getPriorityResponsibilityLede(
  recommendedActions: RecommendedAction[],
  lane: PriorityLane,
): string | null {
  const action = recommendedActions.find(
    (item) => item.lane === lane && item.responsibilitySummary?.trim(),
  );

  if (!action?.responsibilitySummary) {
    return null;
  }

  return `当前推进责任：${action.responsibilitySummary}`;
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
    private readonly taskDependencyRepository: TaskDependencyRepository | null = null,
    private readonly completionCriteriaRepository: CompletionCriteriaRepository | null = null,
  ) {}

  private async buildCompletionProgressMap(taskIds: string[]): Promise<
    Map<
      string,
      {
        total: number;
        satisfied: number;
        open: number;
        satisfiedCriteriaHighlights: string[];
        nextOpenCriterion: string | null;
        nextOpenResponsibilitySummary: string | null;
      }
    >
  > {
    type CompletionProgressSlice = {
      total: number;
      satisfied: number;
      open: number;
      satisfiedCriteriaHighlights: string[];
      nextOpenCriterion: string | null;
      nextOpenResponsibilitySummary: string | null;
    };
    const progressByTaskId = new Map<
      string,
      CompletionProgressSlice
    >();

    if (!this.completionCriteriaRepository || taskIds.length === 0) {
      return progressByTaskId;
    }

    const criteria = await this.completionCriteriaRepository.listForTasks(taskIds);

    for (const item of criteria) {
      const current: CompletionProgressSlice = progressByTaskId.get(item.taskId) ?? {
        total: 0,
        satisfied: 0,
        open: 0,
        satisfiedCriteriaHighlights: [],
        nextOpenCriterion: null,
        nextOpenResponsibilitySummary: null,
      };
      current.total += 1;
      if (item.status === 'satisfied') {
        current.satisfied += 1;
        if (current.satisfiedCriteriaHighlights.length < 2) {
          current.satisfiedCriteriaHighlights.push(item.text);
        }
      } else {
        current.open += 1;
        current.nextOpenCriterion ??= item.text;
        current.nextOpenResponsibilitySummary ??= getResponsibilitySummary({
          kind: item.verificationResponsibility,
          label: item.verificationResponsibilityLabel,
          audience: 'home',
          subject: 'completion',
        });
      }
      progressByTaskId.set(item.taskId, current);
    }

    return progressByTaskId;
  }

  private withCompletionProgress(
    task: TaskListItemRecord,
    completionProgressByTaskId: Map<
      string,
      {
        total: number;
        satisfied: number;
        open: number;
        satisfiedCriteriaHighlights: string[];
        nextOpenCriterion: string | null;
        nextOpenResponsibilitySummary: string | null;
      }
    >,
  ): HomeTaskSliceRecord {
    return {
      ...this.toHomeTaskSlice(task),
      completionProgress: completionProgressByTaskId.get(task.id) ?? {
        total: 0,
        satisfied: 0,
        open: 0,
        satisfiedCriteriaHighlights: [],
        nextOpenCriterion: null,
        nextOpenResponsibilitySummary: null,
      },
    };
  }

  private buildCloseoutEvidenceMap(params: {
    tasks: TaskListItemRecord[];
    decisions: DecisionRecord[];
    runs: RunRecord[];
  }): Map<string, NonNullable<HomeTaskSliceRecord['closeoutEvidence']>> {
    const evidenceByTaskId = new Map<string, NonNullable<HomeTaskSliceRecord['closeoutEvidence']>>();
    const activeTaskIds = new Set(params.tasks.map((task) => task.id));

    const approvedDecisions = [...params.decisions]
      .filter((decision) => decision.status === 'approved' && activeTaskIds.has(decision.taskId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    for (const decision of approvedDecisions) {
      if (!evidenceByTaskId.has(decision.taskId)) {
        evidenceByTaskId.set(decision.taskId, {
          sourceType: 'decision',
          sourceId: decision.id,
          title: decision.title,
          status: 'approved',
        });
      }
    }

    const completedRuns = [...params.runs]
      .filter((run) => run.status === 'completed' && activeTaskIds.has(run.taskId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    for (const run of completedRuns) {
      if (!evidenceByTaskId.has(run.taskId)) {
        evidenceByTaskId.set(run.taskId, {
          sourceType: 'run',
          sourceId: run.id,
          title: run.type,
          status: 'completed',
        });
      }
    }

    return evidenceByTaskId;
  }

  private withCloseoutEvidence(
    task: HomeTaskSliceRecord,
    closeoutEvidenceByTaskId: Map<string, NonNullable<HomeTaskSliceRecord['closeoutEvidence']>>,
  ): HomeTaskSliceRecord {
    return {
      ...task,
      closeoutEvidence: closeoutEvidenceByTaskId.get(task.id) ?? null,
    };
  }

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
    laneByTaskId: Map<string, PriorityLane>;
  }): Promise<HomeTaskResumePreviewRecord[]> {
    const activityByTaskId = new Map<string, HomeActivityRecord>();

    for (const item of params.recentActivity) {
      if (!activityByTaskId.has(item.taskId)) {
        activityByTaskId.set(item.taskId, item);
      }
    }

    const previews = await Promise.all(params.recentTasks.map(async (task) => {
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

      if (task.activeDependency?.blockedByTaskTitle) {
        currentStateParts.push(`依赖：${task.activeDependency.blockedByTaskTitle}`);
      }

      if (task.riskLevel !== 'none') {
        currentStateParts.push(
          `风险：${task.riskLevel}${task.riskNote ? ` · ${task.riskNote}` : ''}`,
        );
      }

      const latestChange = buildHomeResumeLatestChange({
        latestActivity,
        timeline,
        keySource,
        activeBlocker: task.activeBlocker
          ? {
              id: task.activeBlocker.id,
              title: task.activeBlocker.title,
              sourceContextId: task.activeBlocker.sourceContextId,
            }
          : null,
        activeDependency: task.activeDependency
          ? {
              blockedByTaskTitle: task.activeDependency.blockedByTaskTitle,
            }
          : null,
        taskState: task.state,
        completionStatus: task.completionProgress ?? null,
      });

      const nextSuggestedMove = deriveNextSuggestedMove({
        explicitNextStep: task.nextStep,
        taskTitle: task.title,
        taskState: task.state,
        taskSummary: task.summary,
        waitingReason,
        riskLevel: task.riskLevel,
        riskNote: task.riskNote,
        blockerTitle: task.activeBlocker?.title ?? null,
        blockerCreatedAt: task.activeBlocker?.createdAt ?? null,
        dependencyTitle: task.activeDependency?.blockedByTaskTitle ?? null,
        keySourceTitle: keySource?.title ?? null,
        completionStatus: task.completionProgress ?? null,
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
          label: isStaleBlocker(task.activeBlocker.createdAt) ? '升级处理阻塞项' : '查看阻塞来源',
          intent: {
            type: isStaleBlocker(task.activeBlocker.createdAt) ? 'focus_next_step' : 'focus_source_context',
            focusArea: 'detail',
            sourceContextId: isStaleBlocker(task.activeBlocker.createdAt)
              ? undefined
              : task.activeBlocker.sourceContextId,
            prefillNextStep: nextSuggestedMove,
          },
        };
      } else if (task.activeBlocker) {
        contextAction = {
          label: isStaleBlocker(task.activeBlocker.createdAt) ? '升级处理阻塞项' : '跟进阻塞项',
          intent: {
            type: 'focus_next_step',
            focusArea: 'detail',
            prefillNextStep: nextSuggestedMove,
          },
        };
      } else if (task.activeDependency?.blockedByTaskTitle) {
        contextAction = {
          label: '推动上游任务',
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
        lane: params.laneByTaskId.get(task.id) ?? 'steady',
        completionStatus: task.completionProgress ?? {
          total: 0,
          satisfied: 0,
          open: 0,
          nextOpenResponsibilitySummary: null,
        },
        currentState: currentStateParts.join(' · '),
        latestChange: {
          summary: latestChange.summary,
          action: latestChange.action,
        },
        currentBlocker: task.activeBlocker
          ? {
              title: task.activeBlocker.title,
              ageLabel: getCurrentBlockerAgeLabel(task.activeBlocker),
              priorityReason: getCurrentBlockerPriorityReason({
                blocker: task.activeBlocker,
                audience: 'home',
              }),
              responsibilitySummary: getResponsibilitySummary({
                kind: task.activeBlocker.responsibility,
                label: task.activeBlocker.responsibilityLabel ?? task.activeBlocker.owner,
                audience: 'home',
                subject: 'blocker',
              }),
            }
          : {
              title: null,
              priorityReason: null,
              responsibilitySummary: null,
            },
        currentDependency: task.activeDependency
          ? {
              title: task.activeDependency.blockedByTaskTitle ?? null,
              ageLabel: getCurrentDependencyAgeLabel(task.activeDependency),
              priorityReason: getCurrentDependencyPriorityReason(task.activeDependency, 'home'),
              responsibilitySummary: getResponsibilitySummary({
                kind: 'upstream_task',
                label: task.activeDependency.blockedByTaskTitle,
                audience: 'home',
                subject: 'dependency',
              }),
            }
          : {
              title: null,
              priorityReason: null,
              responsibilitySummary: null,
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

    return previews.sort((left, right) => {
      const laneDiff = comparePriorityLaneContext(
        {
          lane: left.lane,
          completionProgress: left.completionStatus
            ? {
                total: left.completionStatus.total,
                satisfied: left.completionStatus.satisfied,
                open: left.completionStatus.open,
              }
            : null,
        },
        {
          lane: right.lane,
          completionProgress: right.completionStatus
            ? {
                total: right.completionStatus.total,
                satisfied: right.completionStatus.satisfied,
                open: right.completionStatus.open,
              }
            : null,
        },
      );

      if (laneDiff !== 0) {
        return laneDiff;
      }

      return left.taskTitle.localeCompare(right.taskTitle, 'zh-Hans-CN');
    });
  }

  private async attachActiveWaitingItems(tasks: TaskRecord[]): Promise<TaskListItemRecord[]> {
    const activeBlockers = this.blockerRepository
      ? await this.blockerRepository.listActiveForTasks(tasks.map((task) => task.id))
      : [];
    const blockerByTaskId = new Map(activeBlockers.map((item) => [item.taskId, item]));
    const activeDependencies = this.taskDependencyRepository
      ? await this.taskDependencyRepository.listActiveForTasks(tasks.map((task) => task.id))
      : [];
    const dependencyByTaskId = new Map(activeDependencies.map((item) => [item.taskId, item]));

    return Promise.all(
      tasks.map(async (task) => ({
        ...task,
        activeWaitingItem: await this.waitingItemRepository.getActiveForTask(task.id),
        activeBlocker: blockerByTaskId.get(task.id) ?? null,
        activeDependency: dependencyByTaskId.get(task.id) ?? null,
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
      activeDependency: task.activeDependency,
      riskLevel: task.riskLevel,
      riskNote: task.riskNote,
    };
  }

  private buildDependencyReevaluations(params: {
    tasks: TaskListItemRecord[];
    taskTimelines: Array<{
      taskId: string;
      taskTitle: string;
      activeBlocker: TaskListItemRecord['activeBlocker'];
      timeline: TimelineEventRecord[];
    }>;
  }): DependencyReevaluationRecord[] {
    const taskById = new Map(params.tasks.map((task) => [task.id, task]));
    const timelineByTaskId = new Map(params.taskTimelines.map((item) => [item.taskId, item.timeline]));

    return params.tasks
      .flatMap((task) => {
        const dependency = task.activeDependency;

        if (!dependency?.blockedByTaskId) {
          return [];
        }

        const upstreamTask = taskById.get(dependency.blockedByTaskId);

        if (!upstreamTask) {
          return [];
        }

        const upstreamTimeline = timelineByTaskId.get(upstreamTask.id) ?? [];
        const latestResolvedBlocker = upstreamTimeline
          .filter((event) => event.type === 'blocker.resolved')
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

        const candidates: DependencyReevaluationRecord[] = [];

        if (upstreamTask.state === 'completed') {
          candidates.push({
            taskId: task.id,
            dependencyId: dependency.id,
            upstreamTaskId: upstreamTask.id,
            upstreamTaskTitle: upstreamTask.title,
            status: 'upstream_ready',
            updatedAt: upstreamTask.updatedAt,
          });
        }

        if (latestResolvedBlocker) {
          candidates.push({
            taskId: task.id,
            dependencyId: dependency.id,
            upstreamTaskId: upstreamTask.id,
            upstreamTaskTitle: upstreamTask.title,
            status: 'upstream_unblocked',
            updatedAt: latestResolvedBlocker.createdAt,
          });
        }

        return candidates
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 1);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private buildRecentActivity(
    tasks: TaskListItemRecord[],
    decisions: Awaited<ReturnType<DecisionRepository['list']>>,
    runs: Awaited<ReturnType<RunRepository['list']>>,
    taskTimelines: Array<{
      taskId: string;
      taskTitle: string;
      activeBlocker: TaskListItemRecord['activeBlocker'];
      timeline: TimelineEventRecord[];
    }>,
    dependencyReevaluations: DependencyReevaluationRecord[],
  ): HomeActivityRecord[] {
    const taskTitleById = new Map(tasks.map((task) => [task.id, task.title]));

    const getDecisionLane = (status: string): PriorityLane =>
      status === 'approved' ? 'continue_or_review' : 'unblock_or_decide';
    const getRunLane = (status: string): PriorityLane => 'continue_or_review';
    const getBlockerLane = (status: string): PriorityLane =>
      status === 'resolved' ? 'continue_or_review' : 'unblock_or_decide';
    const getDependencyLane = (status: string): PriorityLane => {
      if (status === 'resolved' || status === 'upstream_ready' || status === 'upstream_unblocked') {
        return 'continue_or_review';
      }

      return 'unblock_or_decide';
    };

    const decisionEvents: HomeActivityRecord[] = decisions
      .filter((decision) => decision.status !== 'pending')
      .map((decision) => ({
        id: `decision:${decision.id}`,
        sourceType: 'decision',
        sourceId: decision.id,
        lane: getDecisionLane(decision.status),
        responsibilitySummary: null,
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
        lane: getRunLane(run.status),
        responsibilitySummary: null,
        taskId: run.taskId,
        taskTitle: taskTitleById.get(run.taskId) ?? run.taskId,
        title: run.type,
        status: run.status,
        updatedAt: run.updatedAt,
      }));

    const blockerEvents: HomeActivityRecord[] = taskTimelines
      .flatMap((task) =>
        task.timeline
          .filter(
            (event: TimelineEventRecord) =>
              event.type === 'blocker.created' ||
              event.type === 'blocker.resolved' ||
              (event.type === 'source_context.updated' &&
                task.activeBlocker?.sourceContextId &&
                (() => {
                  const payload = event.payload
                    ? (safeJsonParse(event.payload) as Record<string, unknown> | null)
                    : null;
                  return payload?.sourceContextId === task.activeBlocker?.sourceContextId;
                })()),
          )
          .map((event: TimelineEventRecord) => {
            const payload = event.payload
              ? (safeJsonParse(event.payload) as Record<string, unknown> | null)
              : null;

            if (event.type === 'source_context.updated' && task.activeBlocker) {
              return {
                id: `${event.type}:${task.activeBlocker.id}:${String(payload?.sourceContextId ?? event.id)}`,
                sourceType: 'blocker' as const,
                sourceId: task.activeBlocker.id,
                lane: getBlockerLane('source_updated'),
                responsibilitySummary: getResponsibilitySummary({
                  kind: task.activeBlocker.responsibility,
                  label: task.activeBlocker.responsibilityLabel ?? task.activeBlocker.owner,
                  audience: 'home',
                  subject: 'blocker',
                }),
                relatedSourceContextId: String(payload?.sourceContextId ?? ''),
                taskId: task.taskId,
                taskTitle: task.taskTitle,
                title: task.activeBlocker.title,
                status: 'source_updated',
                updatedAt: event.createdAt,
              };
            }

            return {
              id: `${event.type}:${String(payload?.blockerId ?? event.id)}`,
              sourceType: 'blocker' as const,
              sourceId: String(payload?.blockerId ?? event.id),
              lane: getBlockerLane(event.type === 'blocker.created' ? 'created' : 'resolved'),
              responsibilitySummary: getResponsibilitySummary({
                kind: null,
                label: typeof payload?.owner === 'string' ? payload.owner : null,
                audience: 'home',
                subject: 'blocker',
              }),
              relatedSourceContextId:
                typeof payload?.sourceContextId === 'string' ? payload.sourceContextId : null,
              taskId: task.taskId,
              taskTitle: task.taskTitle,
              title: String(payload?.title ?? '阻塞项'),
              status: event.type === 'blocker.created' ? 'created' : 'resolved',
              updatedAt: event.createdAt,
            };
          }),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5);

    const dependencyEvents: HomeActivityRecord[] = dependencyReevaluations.map((item) => ({
      id: `dependency:${item.dependencyId}:${item.status}`,
      sourceType: 'dependency',
      sourceId: item.dependencyId,
      lane: getDependencyLane(item.status),
      responsibilitySummary: getResponsibilitySummary({
        kind: 'upstream_task',
        label: item.upstreamTaskTitle,
        audience: 'home',
        subject: 'dependency',
      }),
      relatedTaskId: item.upstreamTaskId,
      taskId: item.taskId,
      taskTitle: taskTitleById.get(item.taskId) ?? item.taskId,
      title: item.upstreamTaskTitle,
      status: item.status,
      updatedAt: item.updatedAt,
    }));

    const dependencyLifecycleEvents: HomeActivityRecord[] = taskTimelines
      .flatMap((task) =>
        task.timeline
          .filter(
            (event: TimelineEventRecord) =>
              event.type === 'task_dependency.created' || event.type === 'task_dependency.resolved',
          )
          .map((event: TimelineEventRecord) => {
            const payload = event.payload
              ? (safeJsonParse(event.payload) as Record<string, unknown> | null)
              : null;
            const status = event.type === 'task_dependency.created' ? 'created' : 'resolved';

            return {
              id: `${event.type}:${String(payload?.dependencyId ?? event.id)}`,
              sourceType: 'dependency' as const,
              sourceId: String(payload?.dependencyId ?? event.id),
              lane: getDependencyLane(status),
              responsibilitySummary: getResponsibilitySummary({
                kind: 'upstream_task',
                label:
                  typeof payload?.blockedByTaskTitle === 'string' ? payload.blockedByTaskTitle : null,
                audience: 'home',
                subject: 'dependency',
              }),
              relatedTaskId:
                typeof payload?.blockedByTaskId === 'string' ? payload.blockedByTaskId : null,
              taskId: task.taskId,
              taskTitle: task.taskTitle,
              title: String(payload?.blockedByTaskTitle ?? '上游任务'),
              status,
              updatedAt: event.createdAt,
            };
          }),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5);

    const taskEvents: HomeActivityRecord[] = tasks
      .filter((task) => task.state === 'captured' || task.state === 'triaged')
      .map((task) => ({
        id: `task:${task.id}:${task.updatedAt}`,
        sourceType: 'task' as const,
        sourceId: task.id,
        lane: 'clarify' as const,
        responsibilitySummary: null,
        taskId: task.id,
        taskTitle: task.title,
        title: task.title,
        status: task.state,
        updatedAt: task.updatedAt,
      }));

    return [
      ...decisionEvents,
      ...runEvents,
      ...blockerEvents,
      ...dependencyLifecycleEvents,
      ...dependencyEvents,
      ...taskEvents,
    ]
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
    const allBlockedTasks = tasks
      .filter((task) => Boolean(task.activeBlocker?.title))
      .sort((left, right) =>
        (left.activeBlocker?.createdAt ?? left.updatedAt).localeCompare(
          right.activeBlocker?.createdAt ?? right.updatedAt,
        ),
      );
    const escalationBlockerTasks = allBlockedTasks.filter((task) =>
      task.activeBlocker ? isStaleBlocker(task.activeBlocker.createdAt) : false,
    );
    const blockerTasks = allBlockedTasks.filter(
      (task) => !task.activeBlocker || !isStaleBlocker(task.activeBlocker.createdAt),
    );
    const allDependencyTasks = activeTasks
      .filter((task) => Boolean(task.activeDependency?.blockedByTaskId) && !task.activeBlocker)
      .sort((left, right) =>
        (left.activeDependency?.createdAt ?? left.updatedAt).localeCompare(
          right.activeDependency?.createdAt ?? right.updatedAt,
        ),
      );
    const escalationDependencyTasks = allDependencyTasks.filter((task) =>
      task.activeDependency ? isStaleDependency(task.activeDependency.createdAt) : false,
    );
    const dependencyTasks = allDependencyTasks.filter(
      (task) => !task.activeDependency || !isStaleDependency(task.activeDependency.createdAt),
    );
    const escalationTasks = [...escalationBlockerTasks, ...escalationDependencyTasks].sort((left, right) => {
      const leftCreatedAt = left.activeBlocker?.createdAt ?? left.activeDependency?.createdAt ?? left.updatedAt;
      const rightCreatedAt = right.activeBlocker?.createdAt ?? right.activeDependency?.createdAt ?? right.updatedAt;
      return leftCreatedAt.localeCompare(rightCreatedAt);
    });
    const highRiskTasks = tasks.filter((task) => task.riskLevel === 'high');
    const missingNextStepTasks = activeTasks.filter((task) => !task.nextStep?.trim());
    const scheduler = this.getSchedulerStatus();
    const taskTimelines = await Promise.all(
      tasks.map(async (task) => ({
        taskId: task.id,
        taskTitle: task.title,
        activeBlocker: task.activeBlocker,
        timeline: (await this.taskRepository.getDetail(task.id))?.timeline ?? [],
      })),
    );
    const dependencyReevaluations = this.buildDependencyReevaluations({
      tasks,
      taskTimelines,
    });
    const dependencyReevaluationByTaskId = new Map(
      dependencyReevaluations.map((item) => [item.taskId, item]),
    );
    const recentActivity = this.buildRecentActivity(
      tasks,
      decisions,
      runs,
      taskTimelines,
      dependencyReevaluations,
    );
    const recentSourceContexts = await this.buildRecentSourceContexts(activeTasks);
    const completionProgressByTaskId = await this.buildCompletionProgressMap(
      activeTasks.map((task) => task.id),
    );
    const closeoutEvidenceByTaskId = this.buildCloseoutEvidenceMap({
      tasks: activeTasks,
      decisions,
      runs,
    });
    const appliedTemplates = this.taskProcessBindingRepository
      ? await this.taskProcessBindingRepository.listActiveForTasks(activeTasks.map((task) => task.id))
      : [];
    const processTemplateCandidates = await this.buildProcessTemplateCandidates(activeTasks);
    const completionReadyTasks = activeTasks
      .filter((task) => {
        const progress = completionProgressByTaskId.get(task.id);
        return Boolean(progress && progress.total > 0 && progress.open === 0);
      })
      .map((task) =>
        this.withCloseoutEvidence(
          this.withCompletionProgress(task, completionProgressByTaskId),
          closeoutEvidenceByTaskId,
        ),
      );
    const nearCompletionTasks = activeTasks
      .filter((task) => {
        const progress = completionProgressByTaskId.get(task.id);
        return Boolean(progress && progress.total > 1 && progress.satisfied > 0 && progress.open === 1);
      })
      .map((task) =>
        this.withCloseoutEvidence(
          this.withCompletionProgress(task, completionProgressByTaskId),
          closeoutEvidenceByTaskId,
        ),
      );
    const laneByTaskId = deriveTaskPriorityLaneMap({
      tasks,
      missingNextStepTasks: missingNextStepTasks.map((task) => this.toHomeTaskSlice(task)),
      waitingTasks: waitingTasks.map((task) => this.toHomeTaskSlice(task)),
      recentArtifacts,
      recentSourceContexts,
      recentActivity,
      blockerTasks: blockerTasks.map((task) => this.toHomeTaskSlice(task)),
      highRiskTasks: highRiskTasks.map((task) => this.toHomeTaskSlice(task)),
      escalationTasks: escalationTasks.map((task) => this.toHomeTaskSlice(task)),
      completionReadyTasks,
      nearCompletionTasks,
      decisions,
    });
    const recentTaskResumes = await this.buildTaskResumePreviews({
      recentTasks: tasks.slice(0, 5).map((task) => this.withCompletionProgress(task, completionProgressByTaskId)),
      recentActivity,
      recentSourceContexts,
      appliedTemplates,
      laneByTaskId,
    });
    const recommendedActions = buildRecommendedActions({
      activeTasks: activeTasks.slice(0, 10),
      highRiskTasks,
      pendingDecisions: pendingDecisions.slice(0, 5),
      dependencyTasks,
      dependencyReevaluationByTaskId,
      waitingTasks,
      missingNextStepTasks,
      completionReadyTasks,
      nearCompletionTasks,
      recentSourceContexts,
      recentArtifacts,
    });

    const blockerReevaluationCount = recentSourceContexts.filter((sourceContext) =>
      activeTasks.some(
        (task) => task.id === sourceContext.taskId && task.activeBlocker?.sourceContextId === sourceContext.id,
      ),
    ).length;
    const continueOrReviewCount = [
      ...new Set([
        ...recentArtifacts.map((artifact) => artifact.taskId),
        ...recentSourceContexts.map((sourceContext) => sourceContext.taskId),
        ...dependencyReevaluations.map((item) => item.taskId),
        ...completionReadyTasks.map((task) => task.id),
        ...nearCompletionTasks.map((task) => task.id),
        ...recentActivity
          .filter(
            (activity) =>
              (activity.sourceType === 'run' &&
                (activity.status === 'failed' || activity.status === 'completed')) ||
              (activity.sourceType === 'decision' &&
                (activity.status === 'approved' || activity.status === 'cancelled' || activity.status === 'deferred')),
          )
          .map((activity) => activity.taskId),
      ]),
    ].length;
    const dependencyRecoveryCount = [...new Set(dependencyReevaluations.map((item) => item.taskId))].length;
    const prioritySummary = classifyPriorityLane({
      escalationTaskCount: escalationTasks.length,
      staleBlockerTaskCount: escalationBlockerTasks.length,
      staleDependencyTaskCount: escalationDependencyTasks.length,
      highRiskTaskCount: highRiskTasks.length,
      pendingDecisionCount: pendingDecisions.length,
      blockerTaskCount: blockerTasks.length,
      dependencyTaskCount: dependencyTasks.length,
      blockerReevaluationCount,
      dependencyRecoveryCount,
      completionReadyTaskCount: completionReadyTasks.length,
      nearCompletionTaskCount: nearCompletionTasks.length,
      continueOrReviewCount,
      waitingTaskCount: waitingTasks.length,
      missingNextStepTaskCount: missingNextStepTasks.length,
    });
    const priorityResponsibilityLede = getPriorityResponsibilityLede(
      recommendedActions,
      prioritySummary.lane,
    );

    return {
      activeTaskCount: activeTasks.length,
      pendingDecisionCount: pendingDecisions.length,
      completedTaskCount: completedTasks.length,
      recentRunCount: runs.length,
      waitingTaskCount: waitingTasks.length,
      blockerTaskCount: blockerTasks.length,
      dependencyTaskCount: dependencyTasks.length,
      escalationTaskCount: escalationTasks.length,
      highRiskTaskCount: highRiskTasks.length,
      missingNextStepTaskCount: missingNextStepTasks.length,
      completionReadyTaskCount: completionReadyTasks.length,
      nearCompletionTaskCount: nearCompletionTasks.length,
      recentTasks: tasks.slice(0, 5).map((task) => this.toHomeTaskSlice(task)),
      waitingTasks: waitingTasks.slice(0, 5).map((task) => this.toHomeTaskSlice(task)),
      blockerTasks: blockerTasks.slice(0, 5).map((task) => this.toHomeTaskSlice(task)),
      dependencyTasks: dependencyTasks.slice(0, 5).map((task) => this.toHomeTaskSlice(task)),
      escalationTasks: escalationTasks.slice(0, 5).map((task) => this.toHomeTaskSlice(task)),
      highRiskTasks: highRiskTasks.slice(0, 5).map((task) => this.toHomeTaskSlice(task)),
      missingNextStepTasks: missingNextStepTasks
        .slice(0, 5)
        .map((task) => this.toHomeTaskSlice(task)),
      completionReadyTasks: completionReadyTasks.slice(0, 5),
      nearCompletionTasks: nearCompletionTasks.slice(0, 5),
      pendingDecisions: pendingDecisions.slice(0, 5),
      recommendedActions,
      recentArtifacts,
      recentSourceContexts,
      recentTaskResumes,
      recentActivity,
      recentBriefSnapshots,
      processTemplateCandidates,
      priorityLane: prioritySummary.lane,
      priorityHeadline: prioritySummary.headline,
      priorityLede: priorityResponsibilityLede
        ? `${prioritySummary.lede} ${priorityResponsibilityLede}`
        : prioritySummary.lede,
      schedulerStatus: scheduler?.getStatus() ?? {
        enabled: false,
        running: false,
        lastBriefAt: null,
        lastRunSweepAt: null,
      },
    };
  }
}
