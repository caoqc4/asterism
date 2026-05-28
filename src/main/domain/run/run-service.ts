import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import { evaluateAgentApiExecutionPromotionReadinessFromEvidence } from '../../../shared/ai-runtime-invocation.js';
import { evaluatePausedRunResumeEligibility } from '../../../shared/run-resume-eligibility.js';
import { evaluateRuntimeAction } from '../../../shared/runtime-action-evaluator.js';
import {
  buildRuntimeCapabilitySnapshot,
  type RuntimeCapabilitySnapshot,
} from '../../../shared/runtime-capability-snapshot.js';
import { buildTaskplaneWritebackProposalsFromText } from '../../../shared/taskplane-writeback-proposal.js';
import {
  evaluateRuntimeContextReadiness,
  formatRuntimeContextReadinessForStep,
} from '../../../shared/runtime-context-readiness.js';
import {
  groupRuntimeEventsForReplay,
  projectRuntimeEvents,
} from '../../../shared/runtime-event-record.js';
import { buildRuntimeResumePlan, evaluateRuntimeHandoff } from '../../../shared/runtime-handoff.js';
import { evaluateRuntimeVerification } from '../../../shared/runtime-verification.js';
import { buildTaskMemoryCoverageInputForTask, evaluateTaskMemoryCoverage } from '../../../shared/task-memory-coverage.js';
import {
  buildTaskMemoryGuidanceStateForTaskFiles,
  type TaskMemoryGuidanceState,
} from '../../../shared/task-memory-guidance-state.js';
import {
  buildTaskMemoryWriteProposals,
  type TaskMemoryWriteProposal,
} from '../../../shared/task-memory-write-proposal.js';
import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type {
  CreateRunInput,
  RunDetailRecord,
  RunRecord,
} from '../../../shared/types/run.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import {
  projectWorkHabitLabel,
  selectApplicableWorkHabitMatches,
  summarizeWorkHabitMatchesForPrompt,
  taskTypeWorkHabitLabel,
} from '../../../shared/work-habit-rules.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { RunVerificationRepository } from '../../db/repositories/run-verification-repository.js';
import type { SandboxPatchPromotionRepository } from '../../db/repositories/sandbox-patch-promotion-repository.js';
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
import { assertRunArtifactWriteAllowed } from './run-artifact-write-guard.js';
import { persistRunArtifactMemoryGuidanceStep } from './run-memory-guidance-step.js';
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
    private readonly sandboxPatchPromotionRepository: Pick<SandboxPatchPromotionRepository, 'listForRun'> | null = null,
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
    const taskMemory = await this.buildTaskMemoryForRunDetail(run.taskId, steps);
    const taskMemoryGuidance = taskMemory.guidance;
    const taskDetail = taskMemory.taskDetail;
    const detail = {
      ...run,
      artifacts: await this.artifactRepository.listForRun(runId),
      steps,
      checkpoints: await this.runCheckpointRepository.listForRun(runId),
      sandboxPatchPromotions: this.sandboxPatchPromotionRepository
        ? await this.sandboxPatchPromotionRepository.listForRun(runId)
        : [],
      agentSessions: await this.agentSessionStore.listForRun(runId),
      taskMemoryGuidance,
      taskMemoryWriteProposals: taskMemory.writeProposals,
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
      taskFiles: taskDetail?.taskFiles,
      timeline: taskDetail?.timeline,
    });
    return {
      ...detail,
      verifications: this.runVerificationRepository
        ? await this.runVerificationRepository.listForRun(runId)
        : [],
      runtimeEvents,
      runtimeReplayGroups: groupRuntimeEventsForReplay(runtimeEvents),
      taskMemoryGuidance,
      taskMemoryWriteProposals: taskMemory.writeProposals,
    };
  }

  async trigger(input: CreateRunInput): Promise<RunRecord> {
    const task = await this.taskService.getDetail(input.taskId);

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }
    const actionEvaluation = evaluateRuntimeAction({
      action: 'run_start',
      fromTaskId: input.taskId,
    });
    const capabilities = await this.readRuntimeCapabilitySnapshot();
    const taskMemoryGuidance = await this.buildTaskMemoryGuidanceForTask(task);
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      capabilities,
      taskMemoryCoverage: evaluateTaskMemoryCoverage(buildTaskMemoryCoverageInputForTask('run_start', task, {
        hasNextStep: Boolean(task.nextStep?.trim() || task.resumeCard?.nextSuggestedMove?.trim() || input.instructions?.trim()),
      })),
      taskMemoryGuidance,
      requiresModelExecution: true,
    });
    if (!preStepVerification.canProceed) {
      throw new Error(preStepVerification.detail);
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
    const contextReadiness = evaluateRuntimeContextReadiness({
      prompt: input.instructions ?? '',
      task: taskForExecution,
    });
    await this.runStepRepository.create({
      runId: created.id,
      kind: 'plan',
      status: 'completed',
      title: 'Agent API 上下文就绪判断',
      input: input.instructions ?? null,
      output: formatRuntimeContextReadinessForStep(contextReadiness),
    });
    await this.recordAgentApiExecutionPromotionReadiness({
      capabilities,
      contextReadiness,
      input,
      runId: created.id,
      task: taskForExecution,
      taskMemoryGuidance,
    });
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
        this.assertRunOutputArtifactWriteAllowed(completed, result.output);
        const artifact = await this.artifactRepository.createFromRun({
          taskId: input.taskId,
          runId: completed.id,
          runType: input.type,
          content: result.output,
        });
        await persistRunArtifactMemoryGuidanceStep(this.runStepRepository, {
          artifactId: artifact.id,
          output: result.output,
          runId: completed.id,
          taskId: input.taskId,
        });
      }
      await this.taskService.annotateRunCompleted(
        input.taskId,
        input.type,
        Boolean(result.output?.trim()),
        completed.id,
      );
      await this.persistTerminalRunVerifications(completed, applicableWorkHabits.summaries);
      await this.recordAgentApiExecutionPromotionReadiness({
        capabilities,
        contextReadiness,
        input,
        phase: 'post_run',
        run: completed,
        task: taskForExecution,
        taskMemoryGuidance,
      });
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

  private async buildTaskMemoryGuidance(
    taskId: string,
    steps: Awaited<ReturnType<RunStepRepository['listForRun']>>,
  ): Promise<TaskMemoryGuidanceState> {
    return (await this.buildTaskMemoryForRunDetail(taskId, steps)).guidance;
  }

  private async buildTaskMemoryForRunDetail(
    taskId: string,
    steps: Awaited<ReturnType<RunStepRepository['listForRun']>>,
  ): Promise<{
    guidance: TaskMemoryGuidanceState;
    taskDetail: TaskDetail | null;
    writeProposals: TaskMemoryWriteProposal[];
  }> {
    const taskDetailReader = (this.taskService as Partial<Pick<TaskService, 'getDetail'>>).getDetail;
    const taskDetail = typeof taskDetailReader === 'function'
      ? await Promise.resolve(taskDetailReader.call(this.taskService, taskId)).catch(() => null)
      : null;
    const guidance = buildTaskMemoryGuidanceStateForTaskFiles({
      guidanceSignals: steps,
      taskFiles: taskDetail?.taskFiles,
    });
    return {
      guidance,
      taskDetail,
      writeProposals: buildTaskMemoryWriteProposals({
        guidance,
        taskFiles: taskDetail?.taskFiles,
        taskTitle: taskDetail?.title,
      }),
    };
  }

  private async buildTaskMemoryGuidanceForTask(task: TaskDetail): Promise<TaskMemoryGuidanceState> {
    const listForTask = (
      this.runStepRepository as Partial<Pick<RunStepRepository, 'listForTask'>>
    ).listForTask;
    const steps = typeof listForTask === 'function'
      ? await listForTask.call(this.runStepRepository, task.id)
      : [];

    return buildTaskMemoryGuidanceStateForTaskFiles({
      guidanceSignals: steps,
      taskFiles: task.taskFiles,
    });
  }

  private assertRunOutputArtifactWriteAllowed(run: RunRecord, output: string): void {
    assertRunArtifactWriteAllowed({
      runId: run.id,
      title: '保存 Run 输出产物',
      output,
    });
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

  private async recordAgentApiExecutionPromotionReadiness(params: {
    capabilities: RuntimeCapabilitySnapshot | null;
    contextReadiness: ReturnType<typeof evaluateRuntimeContextReadiness>;
    input: CreateRunInput;
    phase?: 'pre_execution' | 'post_run';
    run?: RunRecord;
    runId?: string;
    task: TaskDetail;
    taskMemoryGuidance: TaskMemoryGuidanceState;
  }): Promise<void> {
    const phase = params.phase ?? 'pre_execution';
    const runId = params.run?.id ?? params.runId;
    if (!runId) return;
    const supportedWriteActions = deriveWriteIntentSupportedActions({
      output: params.run?.output ?? null,
      runId,
      task: params.task,
    });
    const reviewedPatchApplyBoundaryReady = await this.hasReviewedPatchApplyBoundaryEvidence(
      phase === 'post_run' ? runId : null,
    );
    const readiness = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      contextManifestSummary: params.capabilities?.summary ?? null,
      contextReadinessStep: {
        status: params.contextReadiness.decision === 'ready' ? 'ready' : 'blocked',
        stepId: 'context.readiness.evaluate',
      },
      gates: {
        simplicity_check: true,
        runtime_action: true,
        context_readiness: params.contextReadiness.decision === 'ready',
        post_step: phase === 'post_run',
        pre_step: true,
        runtime_context_assembly: Boolean(params.capabilities?.model.configured),
        subtask_start: true,
        task_memory_coverage: params.taskMemoryGuidance.outcome === 'satisfied',
        task_memory_guidance: params.taskMemoryGuidance.outcome === 'satisfied',
      },
      providerVisiblePreflight: params.capabilities?.model.configured
        ? {
            providerConfigured: true,
            startupProbe: 'not_called',
            status: 'ready',
          }
        : null,
      reviewedPatchApplyBoundary: reviewedPatchApplyBoundaryReady
        ? {
            explicitApplyOnly: true,
            promotionPreflightReady: true,
          }
        : null,
      postStepVerification: phase === 'post_run'
        ? {
            status: 'ready',
            verifier: 'lightweight_rule_engine',
          }
        : null,
      runGoalContract: {
        completionConditionCount: params.task.completionCriteria.length,
        objective: params.input.instructions ?? params.task.nextStep ?? params.task.summary,
      },
      runEvidencePersistence: phase === 'post_run' && params.run
        ? {
            runId: params.run.id,
            terminalEvidenceStatus: params.run.output?.trim() ? 'present' : 'missing',
          }
        : null,
      selectedRuntimeContract: params.capabilities?.executionRuntime.kind === 'agent_api'
        ? {
            invocationLayer: 'api_runtime',
            phase: 'execution_run',
            runtimeMode: 'api',
          }
        : null,
      targetTaskId: params.task.id,
      taskMemoryGuidance: {
        guidanceCount: params.taskMemoryGuidance.targets.length,
        status: params.taskMemoryGuidance.outcome === 'satisfied' ? 'ready' : 'missing',
      },
      writeIntentExtraction: supportedWriteActions.length
        ? {
            status: 'ready',
            supportedActions: supportedWriteActions,
          }
        : null,
    });

    await this.runStepRepository.create({
      runId,
      kind: 'plan',
      status: 'completed',
      title: phase === 'post_run'
        ? 'Agent API execution post-run promotion readiness'
        : 'Agent API execution promotion readiness',
      input: params.capabilities?.summary ?? null,
      output: readiness.summary,
    });
  }

  private async hasReviewedPatchApplyBoundaryEvidence(runId: string | null): Promise<boolean> {
    if (!runId || !this.sandboxPatchPromotionRepository) return false;
    try {
      const promotions = await this.sandboxPatchPromotionRepository.listForRun(runId);
      return promotions.some((promotion) => promotion.status !== 'blocked');
    } catch {
      return false;
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
      taskMemoryGuidance: run.taskMemoryGuidance,
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
    const steps = await this.runStepRepository.listForRun(run.id);
    const [artifacts, checkpoints] = await Promise.all([
      this.artifactRepository.listForRun(run.id).catch(() => []),
      this.runCheckpointRepository.listForRun(run.id).catch(() => []),
    ]);
    const taskMemoryGuidance = await this.buildTaskMemoryGuidance(run.taskId, steps);
    await persistTerminalRunVerifications({
      artifacts,
      checkpoints,
      run,
      runStepRepository: this.runStepRepository,
      runVerificationRepository: this.runVerificationRepository,
      applicableWorkHabitSummaries,
      includeRunLevel: await this.shouldPersistRunLevelSelfCheck(),
      steps,
      taskMemoryGuidance,
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
      const matches = selectApplicableWorkHabitMatches(snapshot.habits, {
        taskTitle: task.title,
        taskTypeLabel: taskTypeWorkHabitLabel(task.taskType),
        projectLabel: projectWorkHabitLabel(task),
        limit: 5,
      });
      return {
        ids: matches.map((match) => match.habit.id),
        summaries: summarizeWorkHabitMatchesForPrompt(matches),
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

function deriveWriteIntentSupportedActions(params: {
  output: string | null;
  runId: string;
  task: TaskDetail;
}): string[] {
  if (!params.output?.trim()) return [];
  const proposals = buildTaskplaneWritebackProposalsFromText({
    output: params.output,
    runId: params.runId,
    taskId: params.task.id,
    taskTitle: params.task.title,
  });
  const actions = [];
  if (proposals.artifact) actions.push('artifact.propose');
  if (proposals.sourceContext) actions.push('source_context.create');
  if (proposals.structured) actions.push(proposals.structured.intent.type);
  if (proposals.taskFile) actions.push('task_file.propose');
  if (proposals.taskRecord) actions.push('task_record.create');
  return actions;
}
