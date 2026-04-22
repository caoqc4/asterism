import { RunRepository } from '../../db/repositories/run-repository.js';
import { BriefSnapshotRepository } from '../../db/repositories/brief-snapshot-repository.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { SchedulerService } from '../../scheduler/scheduler-service.js';
import type { HomeBriefData, RecommendedAction } from '../../../shared/types/brief.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import type { TaskRecord } from '../../../shared/types/task.js';

function buildRecommendedActions(params: {
  activeTasks: HomeBriefData['recentTasks'];
  highRiskTasks: HomeBriefData['highRiskTasks'];
  pendingDecisions: HomeBriefData['pendingDecisions'];
  waitingTasks: HomeBriefData['waitingTasks'];
  missingNextStepTasks: HomeBriefData['missingNextStepTasks'];
  recentArtifacts: HomeBriefData['recentArtifacts'];
}): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  for (const task of params.highRiskTasks) {
    actions.push({
      id: `risk:${task.id}`,
      label: `优先处理高风险任务：${task.title}`,
      reason: task.riskNote ?? '该任务当前处于高风险状态。',
      taskId: task.id,
      priority: 'high',
    });
  }

  for (const decision of params.pendingDecisions) {
    actions.push({
      id: `decision:${decision.id}`,
      label: `尽快拍板：${decision.title}`,
      reason: '该决策仍处于 pending，可能阻塞相关任务推进。',
      taskId: decision.taskId,
      priority: 'high',
    });
  }

  for (const task of params.waitingTasks) {
    actions.push({
      id: `waiting:${task.id}`,
      label: `跟进等待中的任务：${task.title}`,
      reason: task.activeWaitingItem?.reason ?? task.waitingReason ?? '该任务处于等待状态，需要恢复推进。',
      taskId: task.id,
      priority: 'medium',
    });
  }

  for (const task of params.missingNextStepTasks) {
    actions.push({
      id: `next-step:${task.id}`,
      label: `补充下一步：${task.title}`,
      reason: '该任务仍缺少明确下一步，后续推进成本会升高。',
      taskId: task.id,
      priority: 'medium',
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
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: 'steady-state',
      label: '当前无需额外干预',
      reason: '暂时没有高风险、等待阻塞或缺少下一步的活跃任务。',
      taskId: null,
      priority: 'low',
    });
  }

  return actions.slice(0, 5);
}

export class HomeBriefService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly waitingItemRepository: WaitingItemRepository,
    private readonly decisionRepository: DecisionRepository,
    private readonly runRepository: RunRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly briefSnapshotRepository: BriefSnapshotRepository,
    private readonly getSchedulerStatus: () => SchedulerService | null,
  ) {}

  private async attachActiveWaitingItems(tasks: TaskRecord[]): Promise<TaskRecord[]> {
    return Promise.all(
      tasks.map(async (task) => ({
        ...task,
        activeWaitingItem: await this.waitingItemRepository.getActiveForTask(task.id),
      })),
    );
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
    const recommendedActions = buildRecommendedActions({
      activeTasks: activeTasks.slice(0, 10),
      highRiskTasks,
      pendingDecisions: pendingDecisions.slice(0, 5),
      waitingTasks,
      missingNextStepTasks,
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
      recentTasks: tasks.slice(0, 5),
      waitingTasks: waitingTasks.slice(0, 5),
      highRiskTasks: highRiskTasks.slice(0, 5),
      missingNextStepTasks: missingNextStepTasks.slice(0, 5),
      pendingDecisions: pendingDecisions.slice(0, 5),
      recommendedActions,
      recentArtifacts,
      recentBriefSnapshots,
      schedulerStatus: scheduler?.getStatus() ?? {
        enabled: false,
        running: false,
        lastBriefAt: null,
        lastRunSweepAt: null,
      },
    };
  }
}
