import { RunRepository } from '../../db/repositories/run-repository.js';
import { BriefSnapshotRepository } from '../../db/repositories/brief-snapshot-repository.js';
import { SchedulerService } from '../../scheduler/scheduler-service.js';
import type { HomeBriefData } from '../../../shared/types/brief.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';

export class HomeBriefService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly decisionRepository: DecisionRepository,
    private readonly runRepository: RunRepository,
    private readonly briefSnapshotRepository: BriefSnapshotRepository,
    private readonly getSchedulerStatus: () => SchedulerService | null,
  ) {}

  async getHomeData(): Promise<HomeBriefData> {
    const [tasks, decisions, runs, recentBriefSnapshots] = await Promise.all([
      this.taskRepository.list(),
      this.decisionRepository.list(),
      this.runRepository.list(),
      this.briefSnapshotRepository.listRecent(5),
    ]);

    const activeTasks = tasks.filter((task) => !['completed', 'archived'].includes(task.state));
    const completedTasks = tasks.filter((task) => task.state === 'completed');
    const pendingDecisions = decisions.filter((decision) => decision.status === 'pending');
    const waitingTasks = tasks.filter(
      (task) => task.state === 'waiting_external' || Boolean(task.waitingReason),
    );
    const highRiskTasks = tasks.filter((task) => task.riskLevel === 'high');
    const missingNextStepTasks = activeTasks.filter((task) => !task.nextStep?.trim());
    const scheduler = this.getSchedulerStatus();

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
