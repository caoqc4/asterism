import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import { evaluatePausedRunResumeEligibility } from '../../../shared/run-resume-eligibility.js';
import { evaluateRuntimeAction } from '../../../shared/runtime-action-evaluator.js';
import {
  buildRuntimeCapabilitySnapshot,
  type RuntimeCapabilitySnapshot,
} from '../../../shared/runtime-capability-snapshot.js';
import {
  groupRuntimeEventsForReplay,
  projectRuntimeEvents,
} from '../../../shared/runtime-event-record.js';
import { buildRuntimeResumePlan, evaluateRuntimeHandoff } from '../../../shared/runtime-handoff.js';
import { evaluateRuntimeVerification } from '../../../shared/runtime-verification.js';
import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type {
  CreateRunInput,
  RunDetailRecord,
  RunRecord,
} from '../../../shared/types/run.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import {
  selectApplicableWorkHabits,
  summarizeWorkHabitsForPrompt,
} from '../../../shared/work-habit-rules.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { RunVerificationRepository } from '../../db/repositories/run-verification-repository.js';
import { TaskService } from '../task/task-service.js';
import { AgentSessionStore } from './agent-session-store.js';
import {
  updateCheckpointBackedAgentSessionStatus,
} from './agent-session-continuation.js';
import { AgentToolRegistry } from './agent-tool-registry.js';
import { ProcessTemplateSelector } from './process-template-selector.js';
import {
  persistLightweightRunVerifications,
  persistTerminalRunVerifications,
} from './run-verification-service.js';
import { RunOrchestrator, type RunOrchestrationResult } from './run-orchestrator.js';
import type { WorkHabitService } from '../context/work-habit-service.js';

type ApplicableWorkHabits = {
  ids: string[];
  summaries: string[];
};

export class RunService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly taskService: TaskService,
    private readonly artifactRepository: ArtifactRepository,
    private readonly aiConfigService: AiConfigService,
    private readonly textExecutor: TextExecutor,
    private readonly processTemplateSelector: ProcessTemplateSelector = new ProcessTemplateSelector(),
    private readonly runStepRepository: RunStepRepository = new RunStepRepository(),
    private readonly agentToolRegistry: AgentToolRegistry | null = null,
    private readonly runCheckpointRepository: RunCheckpointRepository = new RunCheckpointRepository(),
    private readonly agentSessionStore: AgentSessionStore = new AgentSessionStore(),
    private readonly runVerificationRepository: RunVerificationRepository | null = null,
    private readonly runOrchestrator: RunOrchestrator = new RunOrchestrator(
      aiConfigService,
      textExecutor,
      processTemplateSelector,
      runStepRepository,
      agentToolRegistry,
      undefined,
      agentSessionStore,
    ),
    private readonly workHabitService: WorkHabitService | null = null,
  ) {}

  list(): Promise<RunRecord[]> {
    return this.runRepository.list();
  }

  async getDetail(runId: string): Promise<RunDetailRecord | null> {
    const run = await this.runRepository.getDetail(runId);

    if (!run) {
      return null;
    }

    const steps = await this.runStepRepository.listForRun(runId);
    const detail = {
      ...run,
      artifacts: await this.artifactRepository.listForRun(runId),
      steps,
      checkpoints: await this.runCheckpointRepository.listForRun(runId),
      agentSessions: await this.agentSessionStore.listForRun(runId),
    };
    await persistLightweightRunVerifications(detail, this.runVerificationRepository, {
      includeRunLevel: await this.shouldPersistRunLevelSelfCheck(),
    });

    const runtimeEvents = projectRuntimeEvents({
      taskId: run.taskId,
      runs: [run],
      runStepsByRunId: {
        [run.id]: steps,
      },
    });

    return {
      ...detail,
      verifications: this.runVerificationRepository
        ? await this.runVerificationRepository.listForRun(runId)
        : [],
      runtimeEvents,
      runtimeReplayGroups: groupRuntimeEventsForReplay(runtimeEvents),
    };
  }

  async trigger(input: CreateRunInput): Promise<RunRecord> {
    const actionEvaluation = evaluateRuntimeAction({
      action: 'run_start',
      fromTaskId: input.taskId,
    });
    const capabilities = await this.readRuntimeCapabilitySnapshot();
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      capabilities,
      requiresModelExecution: true,
    });
    if (!preStepVerification.canProceed) {
      throw new Error(preStepVerification.detail);
    }

    const task = await this.taskService.getDetail(input.taskId);

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }
    const startVerification = evaluateRuntimeVerification({
      mode: 'subtask_start',
      targetTask: task,
      contextSignals: {
        activeTaskId: task.id,
        targetTaskId: task.id,
      },
      availableContext: {
        taskState: true,
        decisions: true,
      },
    });
    if (!startVerification.canProceed) {
      throw new Error(startVerification.detail);
    }

    let taskForExecution = task;

    if (task.state === 'planned') {
      const transitioned = await this.taskService.transitionIfAllowed(task.id, 'running');

      if (transitioned) {
        taskForExecution = {
          ...task,
          state: transitioned.state,
          updatedAt: transitioned.updatedAt,
        };
      }
    }

    const created = await this.runRepository.create(input);
    const applicableWorkHabits = await this.buildApplicableWorkHabits(taskForExecution);
    const result =
      input.type === 'agent'
        ? await this.runOrchestrator.executeAgentRun({
            run: created,
            task: taskForExecution,
            input,
            applicableWorkHabitSummaries: applicableWorkHabits.summaries,
          })
        : await this.runOrchestrator.executeTextRun({
            run: created,
            task: taskForExecution,
            input,
            applicableWorkHabitSummaries: applicableWorkHabits.summaries,
          });
    await this.recordAppliedWorkHabits(applicableWorkHabits.ids);

    await this.annotateProcessTemplateSelection(input.taskId, created.id, taskForExecution, result);

    if (result.status === 'completed') {
      const completed = await this.runRepository.updateResult(created.id, 'completed', result.output, 'ai');
      if (result.output?.trim()) {
        await this.artifactRepository.createFromRun({
          taskId: input.taskId,
          runId: completed.id,
          runType: input.type,
          content: result.output,
        });
      }
      await this.taskService.annotateRunCompleted(
        input.taskId,
        input.type,
        Boolean(result.output?.trim()),
        completed.id,
      );
      await this.persistTerminalRunVerifications(completed, applicableWorkHabits.summaries);
      return completed;
    }

    if (result.status === 'needs_confirmation') {
      return this.runRepository.updateResult(
        created.id,
        'needs_confirmation',
        result.message,
        'system',
      );
    }

    if (result.status === 'paused') {
      const paused = await this.runRepository.updateResult(
        created.id,
        'paused',
        result.message,
        'system',
        null,
      );
      await this.taskService.annotateRunPaused(input.taskId, result.message, paused.id);
      return paused;
    }

    const failed = await this.runRepository.updateResult(
      created.id,
      'failed',
      result.message,
      'system',
      result.message,
    );
    await this.taskService.annotateRunFailed(input.taskId, result.message, failed.id);
    await this.persistTerminalRunVerifications(failed, applicableWorkHabits.summaries);
    return failed;
  }

  private async readRuntimeCapabilitySnapshot(): Promise<RuntimeCapabilitySnapshot | null> {
    const getStatus = (this.aiConfigService as Partial<Pick<AiConfigService, 'getStatus'>>).getStatus;
    if (typeof getStatus !== 'function') return null;

    try {
      return buildRuntimeCapabilitySnapshot({
        aiStatus: await getStatus.call(this.aiConfigService),
      });
    } catch {
      return null;
    }
  }

  async continuePausedRun(runId: string): Promise<RunRecord> {
    const run = await this.getDetail(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (run.status !== 'paused') {
      throw new Error(`Run is not paused: ${runId}`);
    }

    const actionEvaluation = evaluateRuntimeAction({
      action: 'run_resume',
      fromTaskId: run.taskId,
    });
    if (!actionEvaluation.allowed) {
      throw new Error(actionEvaluation.reason);
    }
    const handoff = evaluateRuntimeHandoff({
      intent: 'resume_run',
      fromTaskId: run.taskId,
    });
    if (!handoff.canProceed) {
      throw new Error(handoff.reason);
    }
    const resumePlan = buildRuntimeResumePlan(handoff);
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      hasRequiredContext: resumePlan.contextMustBeReassembled,
      confirmationSatisfied: true,
    });
    if (!preStepVerification.canProceed) {
      throw new Error(preStepVerification.detail);
    }

    if (!this.agentToolRegistry) {
      throw new Error('Agent tool registry is required to continue paused runs.');
    }

    const eligibility = evaluatePausedRunResumeEligibility({
      agentSessions: run.agentSessions,
      checkpoints: run.checkpoints,
      runId,
      taskId: run.taskId,
    });

    if (eligibility.status === 'blocked') {
      throw new Error(eligibility.reason);
    }

    const { checkpoint, payload } = eligibility;
    const targetTask = await this.taskService.getDetail(run.taskId);
    if (!targetTask) {
      throw new Error(`Task not found: ${run.taskId}`);
    }
    const startVerification = evaluateRuntimeVerification({
      mode: 'subtask_start',
      targetTask,
      contextSignals: {
        activeTaskId: targetTask.id,
        targetTaskId: targetTask.id,
      },
      availableContext: {
        taskState: true,
        decisions: true,
      },
    });
    if (!startVerification.canProceed) {
      throw new Error(startVerification.detail);
    }

    const result = await this.agentToolRegistry.execute(
      payload.nextTool,
      payload.nextInput,
      {
        runId,
        taskId: run.taskId,
      },
      payload.policySnapshot,
    );

    if (!result.success) {
      await this.updateLatestCheckpointBackedAgentSession(run, 'failed', payload.agentSessionId);
      const failed = await this.runRepository.updateResult(
        runId,
        'failed',
        result.error ?? result.summary,
        'system',
        result.error ?? result.summary,
      );
      await this.taskService.annotateRunFailed(run.taskId, result.error ?? result.summary, runId);
      await this.persistTerminalRunVerifications(failed);
      return failed;
    }

    await this.runCheckpointRepository.updateStatus(checkpoint.id, 'resolved');
    await this.updateLatestCheckpointBackedAgentSession(run, 'completed', payload.agentSessionId);
    await this.runStepRepository.create({
      runId,
      kind: 'final',
      status: 'completed',
      title: '完成 paused run 续跑',
      output: `已从 resume checkpoint 继续执行并完成 Run。${resumePlan.nextAction}`,
    });

    const completed = await this.runRepository.updateResult(
      runId,
      'completed',
      result.output ?? result.summary,
      'system',
    );
    await this.taskService.annotateRunCompleted(
      run.taskId,
      run.type,
      Boolean((result.output ?? result.summary).trim()),
      runId,
    );
    await this.persistTerminalRunVerifications(completed);

    return completed;
  }

  private async persistTerminalRunVerifications(
    run: RunRecord,
    applicableWorkHabitSummaries: string[] = [],
  ): Promise<void> {
    await persistTerminalRunVerifications({
      run,
      runStepRepository: this.runStepRepository,
      runVerificationRepository: this.runVerificationRepository,
      applicableWorkHabitSummaries,
      includeRunLevel: await this.shouldPersistRunLevelSelfCheck(),
    });
  }

  private async shouldPersistRunLevelSelfCheck(): Promise<boolean> {
    try {
      const status = await this.aiConfigService.getStatus();
      return status.featureFlags.enableSelfCheck !== false;
    } catch {
      return true;
    }
  }

  private async buildApplicableWorkHabits(task: TaskDetail): Promise<ApplicableWorkHabits> {
    if (!this.workHabitService) {
      return { ids: [], summaries: [] };
    }

    try {
      const snapshot = await this.workHabitService.getSnapshot();
      const habits = selectApplicableWorkHabits(snapshot.habits, {
        taskTitle: task.title,
        limit: 5,
      });
      return {
        ids: habits.map((habit) => habit.id),
        summaries: summarizeWorkHabitsForPrompt(habits),
      };
    } catch {
      return { ids: [], summaries: [] };
    }
  }

  private async recordAppliedWorkHabits(habitIds: string[]): Promise<void> {
    if (!habitIds.length || !this.workHabitService) {
      return;
    }

    try {
      await this.workHabitService.recordApplications(habitIds);
    } catch {
      // Work habit telemetry should never block the run lifecycle.
    }
  }

  private async annotateProcessTemplateSelection(
    taskId: string,
    runId: string,
    taskForExecution: Awaited<ReturnType<TaskService['getDetail']>>,
    result: RunOrchestrationResult,
  ) {
    if (!taskForExecution || !result.selection) {
      return;
    }

    if (result.selection.shouldUse) {
      await this.taskService.annotateProcessTemplateSelected(
        taskId,
        'run',
        runId,
        result.selection.selectedTemplates.map((item) => item.id),
        result.selection.selectedTemplates.map((item) => item.title),
        result.selection.reason,
      );
      return;
    }

    await this.taskService.annotateProcessTemplateSkipped(
      taskId,
      'run',
      runId,
      result.selection.reason,
      taskForExecution.processTemplates.length,
    );
  }

  private async updateLatestCheckpointBackedAgentSession(
    run: RunDetailRecord,
    status: AgentSessionRecord['status'],
    agentSessionId?: string | null,
  ): Promise<void> {
    await updateCheckpointBackedAgentSessionStatus({
      agentSessionId,
      runId: run.id,
      status,
      store: {
        listForRun: async () => run.agentSessions ?? [],
        updateStatus: (id, nextStatus) => this.agentSessionStore.updateStatus(id, nextStatus),
      },
    });
  }
}
