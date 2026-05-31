import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import {
  deriveAgentApiDurableWritebackBoundaryFromTaskEvidence,
  evaluateAgentApiExecutionPromotionReadinessFromEvidence,
} from '../../../shared/ai-runtime-invocation.js';
import { evaluatePausedRunResumeEligibility } from '../../../shared/run-resume-eligibility.js';
import { evaluateRuntimeAction, type RuntimeActionEvaluation } from '../../../shared/runtime-action-evaluator.js';
import {
  buildRuntimeCapabilitySnapshot,
  type RuntimeCapabilitySnapshot,
} from '../../../shared/runtime-capability-snapshot.js';
import { buildTaskplaneWritebackProposalsFromText } from '../../../shared/taskplane-writeback-proposal.js';
import { extractTaskplaneWriteIntentTypeNamesFromText } from '../../../shared/taskplane-write-intent.js';
import {
  evaluateRuntimeContextReadiness,
  formatRuntimeContextReadinessForStep,
} from '../../../shared/runtime-context-readiness.js';
import {
  classifyRunScope,
  runScopeRequiresBusinessLine,
} from '../../../shared/run-scope.js';
import {
  groupRuntimeEventsForReplay,
  projectRuntimeEvents,
} from '../../../shared/runtime-event-record.js';
import { buildRuntimeResumePlan, evaluateRuntimeHandoff } from '../../../shared/runtime-handoff.js';
import { evaluateRuntimeVerification } from '../../../shared/runtime-verification.js';
import {
  buildTaskMemoryCoverageInputForTask,
  evaluateTaskMemoryCoverage,
  type TaskMemoryCoverageEvaluation,
} from '../../../shared/task-memory-coverage.js';
import {
  buildTaskMemoryGuidanceStateForTaskFiles,
  type TaskMemoryGuidanceState,
} from '../../../shared/task-memory-guidance-state.js';
import {
  buildTaskMemoryWriteProposals,
  type TaskMemoryWriteProposal,
} from '../../../shared/task-memory-write-proposal.js';
import { appendBusinessLineContextPackToPrompt } from '../../../shared/business-line-context-pack.js';
import { buildBusinessLinePostRunReviewOptions } from '../../../shared/business-line-post-run-review.js';
import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type {
  BusinessLineOwnershipInput,
  BusinessLineOwnershipResolution,
  BusinessLineWorkspace,
} from '../../../shared/types/business-line.js';
import type {
  CreateRunInput,
  RunDetailRecord,
  RunRecord,
  RunScope,
} from '../../../shared/types/run.js';
import type { SandboxPatchPromotionRecord } from '../../../shared/types/sandbox-patch-promotion.js';
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

type BusinessLineContextProvider = {
  getWorkspace(businessLineId: string): Promise<BusinessLineWorkspace | null>;
  resolveOwnership?(input: BusinessLineOwnershipInput): Promise<BusinessLineOwnershipResolution>;
};

function formatAgentApiExecutionPromotionReadinessInput(params: {
  capabilitySummary?: string | null;
  pilotDecision?: CreateRunInput['pilotDecision'];
}): string | null {
  const parts = [
    params.capabilitySummary?.trim() || null,
    params.pilotDecision
      ? `pilotDecision=${JSON.stringify({
          backend: params.pilotDecision.backend,
          backendPlan: {
            fallback: params.pilotDecision.backendPlan.fallback,
            maxTurns: params.pilotDecision.backendPlan.maxTurns,
            status: params.pilotDecision.backendPlan.status,
            triggers: params.pilotDecision.backendPlan.triggers,
          },
          executor: params.pilotDecision.executor,
          messagePriority: params.pilotDecision.messagePriority,
          movement: params.pilotDecision.movement,
          operationMode: params.pilotDecision.operationMode,
          priorityLane: params.pilotDecision.priorityLane,
        })}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : null;
}

function summarizeTerminalRunEvidence(run: Pick<RunRecord, 'failureReason' | 'output' | 'status'>): string | null {
  const outputLength = run.output?.trim().length ?? 0;
  if (outputLength > 0) return `output_chars=${outputLength}`;
  const failureReasonLength = run.failureReason?.trim().length ?? 0;
  if (run.status === 'failed' && failureReasonLength > 0) return `failure_reason_chars=${failureReasonLength}`;
  return null;
}

function attachRunScope<T extends RunRecord>(run: T, scope: RunScope): T {
  return {
    ...run,
    businessLineId: scope.businessLineId ?? run.businessLineId ?? null,
    scope,
  };
}

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
    private readonly businessLineContextProvider: BusinessLineContextProvider | null = null,
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
    const detailOwnership = await this.resolveBusinessLineOwnershipForRunScope({
      explicitBusinessLineId: run.businessLineId ?? null,
      runId: run.id,
      taskId: run.taskId,
      allowOneOff: !run.businessLineId,
    });
    const detailScope = classifyRunScope({
      businessLineId: detailOwnership?.status === 'resolved'
        ? detailOwnership.businessLineId
        : run.businessLineId ?? null,
      ownership: detailOwnership,
      taskBusinessLineId: taskDetail?.businessLineId,
      taskFacets: taskDetail?.taskFacets,
      taskId: run.taskId,
      taskType: taskDetail?.taskType,
    });
    const scopedRun = attachRunScope(run, detailScope);
    const detail = {
      ...scopedRun,
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
      businessLinePostRunReview: buildBusinessLinePostRunReviewOptions({
        output: scopedRun.output,
        run: scopedRun,
        taskTitle: taskDetail?.title ?? null,
      }),
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
    const taskMemoryCoverage = evaluateTaskMemoryCoverage(buildTaskMemoryCoverageInputForTask('run_start', task, {
      hasNextStep: Boolean(task.nextStep?.trim() || task.resumeCard?.nextSuggestedMove?.trim() || input.instructions?.trim()),
    }));
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      capabilities,
      taskMemoryCoverage,
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

    const explicitBusinessLineId = input.businessLineId ?? null;
    let businessLineId = explicitBusinessLineId || task.businessLineId || null;
    let ownership: BusinessLineOwnershipResolution | null = null;
    if (this.businessLineContextProvider?.resolveOwnership) {
      ownership = await this.businessLineContextProvider.resolveOwnership({
        explicitBusinessLineId,
        taskId: task.id,
        allowOneOff: !explicitBusinessLineId,
      });
      if (ownership.status === 'mismatch') {
        throw new Error(
          `Business line target does not match task ownership: ${ownership.explicitBusinessLineId} vs ${ownership.resolvedBusinessLineId}`,
        );
      }
      if (ownership.status === 'missing' && explicitBusinessLineId) {
        throw new Error(`Business line not found: ${explicitBusinessLineId}`);
      }
      businessLineId = ownership.status === 'resolved' ? ownership.businessLineId : null;
    }
    const runScope = classifyRunScope({
      businessLineId,
      ownership,
      requestedScopeKind: input.scopeKind,
      requestSurface: input.requestSurface,
      taskBusinessLineId: task.businessLineId,
      taskFacets: task.taskFacets,
      taskId: task.id,
      taskType: task.taskType,
    });
    if (runScopeRequiresBusinessLine(runScope.kind) && !runScope.businessLineId) {
      throw new Error(`Business line scope requires an owner: ${runScope.kind}`);
    }
    const businessLineWorkspace = businessLineId && this.businessLineContextProvider
      ? await this.businessLineContextProvider.getWorkspace(businessLineId)
      : null;
    if (businessLineId && this.businessLineContextProvider && !businessLineWorkspace) {
      throw new Error(`Business line not found: ${businessLineId}`);
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

    const runInput: CreateRunInput = {
      ...input,
      ...(businessLineId ? { businessLineId } : {}),
    };
    const runInstructions = appendBusinessLineContextPackToPrompt(input.instructions, businessLineWorkspace);
    if (runInstructions !== undefined) {
      runInput.instructions = runInstructions;
    }
    const created = await this.runRepository.create(runInput);
    const createdWithScope = attachRunScope(created, runScope);
    const contextReadiness = evaluateRuntimeContextReadiness({
      prompt: runInput.instructions ?? '',
      runScope,
      task: taskForExecution,
    });
    await this.runStepRepository.create({
      runId: created.id,
      kind: 'plan',
      status: 'completed',
      title: 'Agent API 上下文就绪判断',
      input: runInput.instructions ?? null,
      output: formatRuntimeContextReadinessForStep(contextReadiness),
    });
    await this.recordAgentApiExecutionPromotionReadiness({
      capabilities,
      contextReadiness,
      input: runInput,
      runId: created.id,
      runtimeAction: actionEvaluation,
      task: taskForExecution,
      taskMemoryCoverage,
      taskMemoryGuidance,
    });
    const applicableWorkHabits = await this.buildApplicableWorkHabits(taskForExecution);
    const result =
      input.type === 'agent'
        ? await this.runOrchestrator.executeAgentRun({
            run: createdWithScope,
            task: taskForExecution,
            input: runInput,
            applicableWorkHabitSummaries: applicableWorkHabits.summaries,
          })
        : await this.runOrchestrator.executeTextRun({
            run: createdWithScope,
            task: taskForExecution,
            input: runInput,
            applicableWorkHabitSummaries: applicableWorkHabits.summaries,
          });
    await this.recordAppliedWorkHabits(applicableWorkHabits.ids);

    await this.annotateProcessTemplateSelection(input.taskId, created.id, taskForExecution, result);

    if (result.status === 'completed') {
      const completed = await this.runRepository.updateResult(created.id, 'completed', result.output, 'ai');
      const completedWithScope = attachRunScope(completed, runScope);
      if (result.output?.trim()) {
        this.assertRunOutputArtifactWriteAllowed(completedWithScope, result.output);
        const artifact = await this.artifactRepository.createFromRun({
          taskId: input.taskId,
          runId: completedWithScope.id,
          runType: input.type,
          content: result.output,
        });
        await persistRunArtifactMemoryGuidanceStep(this.runStepRepository, {
          artifactId: artifact.id,
          output: result.output,
          runId: completedWithScope.id,
          taskId: input.taskId,
        });
      }
      await this.taskService.annotateRunCompleted(
        input.taskId,
        input.type,
        Boolean(result.output?.trim()),
        completedWithScope.id,
      );
      await this.persistTerminalRunVerifications(completedWithScope, applicableWorkHabits.summaries);
      await this.recordAgentApiExecutionPromotionReadiness({
        capabilities,
        contextReadiness,
        input: runInput,
        phase: 'post_run',
        run: completedWithScope,
        runtimeAction: actionEvaluation,
        task: taskForExecution,
        taskMemoryCoverage,
        taskMemoryGuidance,
      });
      return completedWithScope;
    }

    if (result.status === 'needs_confirmation') {
      return attachRunScope(await this.runRepository.updateResult(
        created.id,
        'needs_confirmation',
        result.message,
        'system',
      ), runScope);
    }

    if (result.status === 'paused') {
      const paused = attachRunScope(await this.runRepository.updateResult(
        created.id,
        'paused',
        result.message,
        'system',
        null,
      ), runScope);
      await this.taskService.annotateRunPaused(input.taskId, result.message, paused.id);
      return paused;
    }

    const failed = attachRunScope(await this.runRepository.updateResult(
      created.id,
      'failed',
      result.message,
      'system',
      result.message,
    ), runScope);
    await this.taskService.annotateRunFailed(input.taskId, result.message, failed.id);
    await this.persistTerminalRunVerifications(failed, applicableWorkHabits.summaries);
    await this.recordAgentApiExecutionPromotionReadiness({
      capabilities,
      contextReadiness,
      input: runInput,
      phase: 'post_run',
      run: failed,
      runtimeAction: actionEvaluation,
      task: taskForExecution,
      taskMemoryCoverage,
      taskMemoryGuidance,
    });
    return failed;
  }

  private async resolveBusinessLineOwnershipForRunScope(
    input: BusinessLineOwnershipInput,
  ): Promise<BusinessLineOwnershipResolution | null> {
    if (!this.businessLineContextProvider?.resolveOwnership) return null;
    try {
      return await this.businessLineContextProvider.resolveOwnership(input);
    } catch {
      return null;
    }
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
    runtimeAction: RuntimeActionEvaluation;
    task: TaskDetail;
    taskMemoryCoverage: TaskMemoryCoverageEvaluation;
    taskMemoryGuidance: TaskMemoryGuidanceState;
  }): Promise<void> {
    const phase = params.phase ?? 'pre_execution';
    const runId = params.run?.id ?? params.runId;
    if (!runId) return;
    const writeIntentActionEvidence = deriveWriteIntentActionEvidence({
      output: params.run?.output ?? null,
      runId,
      task: params.task,
    });
    const supportedWriteActions = writeIntentActionEvidence.supportedActions;
    const declaredWriteActions = writeIntentActionEvidence.declaredActions;
    const reviewedPatchApplyBoundaryEvidence = await this.readReviewedPatchApplyBoundaryEvidence(
      phase === 'post_run' ? runId : null,
    );
    const terminalRunHasReviewableEvidence = Boolean(
      phase === 'post_run'
      && params.run
      && (params.run.output?.trim() || params.run.failureReason?.trim()),
    );
    const noStructuredWriteIntentRequired = Boolean(
      terminalRunHasReviewableEvidence
      && supportedWriteActions.length === 0
      && declaredWriteActions.length === 0
      && !reviewedPatchApplyBoundaryEvidence,
    );
    const onlySourceContextWriteIntentRequired = Boolean(
      terminalRunHasReviewableEvidence
      && supportedWriteActions.length === 1
      && supportedWriteActions[0] === 'source_context.create'
      && declaredWriteActions.length === 1
      && declaredWriteActions[0] === 'source_context.create'
      && !reviewedPatchApplyBoundaryEvidence,
    );
    const noWorkspaceWriteRequired = Boolean(
      noStructuredWriteIntentRequired || onlySourceContextWriteIntentRequired,
    );
    const refreshedTaskEvidence = phase === 'post_run'
      ? await this.readTaskDetailForPromotionEvidence(params.task.id)
      : null;
    const durableWritebackBoundary = onlySourceContextWriteIntentRequired
      ? deriveAgentApiDurableWritebackBoundaryFromTaskEvidence({
          action: 'source_context.create',
          runId,
          sourceContexts: refreshedTaskEvidence?.sourceContexts ?? params.task.sourceContexts,
          taskId: params.task.id,
          timeline: refreshedTaskEvidence?.timeline ?? params.task.timeline,
        })
      : null;
    const taskMemoryGuidanceReady = params.taskMemoryGuidance.outcome !== 'pending';
    const runGoalObjective = params.input.instructions ?? params.task.nextStep ?? params.task.summary;
    const runGoalCompletionConditionCount = params.task.completionCriteria.length > 0
      ? params.task.completionCriteria.length
      : runGoalObjective?.trim()
        ? 1
        : 0;
    const readiness = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      contextManifestSummary: params.capabilities?.summary ?? null,
      contextManifestTaskId: params.task.id,
      contextReadinessStep: {
        status: params.contextReadiness.decision === 'ready' ? 'ready' : 'blocked',
        stepId: 'context.readiness.evaluate',
        taskId: params.task.id,
      },
      gates: {
        simplicity_check: true,
        runtime_action: true,
        context_readiness: params.contextReadiness.decision === 'ready',
        post_step: phase === 'post_run',
        pre_step: true,
        runtime_context_assembly: Boolean(params.capabilities?.model.configured),
        subtask_start: true,
        task_memory_coverage: params.taskMemoryCoverage.canStartExecution,
        task_memory_guidance: taskMemoryGuidanceReady,
      },
      providerVisiblePreflight: params.capabilities?.model.configured
        ? {
            configuredProvider: params.capabilities.model.provider,
            providerConfigured: true,
            runId,
            startupProbe: 'not_called',
            status: 'ready',
            taskId: params.task.id,
          }
        : null,
      pilotDecision: params.input.pilotDecision
        ? {
            backend: params.input.pilotDecision.backend,
            backendPlan: params.input.pilotDecision.backendPlan,
            executor: params.input.pilotDecision.executor,
            messagePriority: params.input.pilotDecision.messagePriority,
            movement: params.input.pilotDecision.movement,
            operationMode: params.input.pilotDecision.operationMode,
            priorityLane: params.input.pilotDecision.priorityLane,
          }
        : null,
      reviewedPatchApplyBoundary: reviewedPatchApplyBoundaryEvidence
        ? {
            appliedPromotionStatus: reviewedPatchApplyBoundaryEvidence.status,
            explicitApplyOnly: true,
            promotionPreflightReady: reviewedPatchApplyBoundaryEvidence.status === 'applied',
            runId: reviewedPatchApplyBoundaryEvidence.runId,
            taskId: reviewedPatchApplyBoundaryEvidence.taskId,
          }
        : noWorkspaceWriteRequired
          ? {
              appliedPromotionStatus: 'not_required',
              explicitApplyOnly: true,
              noWorkspaceWriteRequired: true,
              promotionPreflightReady: false,
              runId,
              taskId: params.task.id,
            }
          : null,
      durableWritebackBoundary,
      postStepVerification: phase === 'post_run'
        ? {
            runId,
            status: 'ready',
            taskId: params.task.id,
            verifier: 'lightweight_rule_engine',
          }
        : null,
      runGoalContract: {
        completionConditionCount: runGoalCompletionConditionCount,
        objective: runGoalObjective,
        runId,
        taskId: params.task.id,
      },
      runEvidencePersistence: phase === 'post_run' && params.run
        ? {
            runId: params.run.id,
            taskId: params.run.taskId,
            terminalEvidenceSummary: summarizeTerminalRunEvidence(params.run),
            terminalEvidenceStatus: params.run.output?.trim() || params.run.failureReason?.trim() ? 'present' : 'missing',
            terminalRunStatus: params.run.status,
          }
        : null,
      selectedRuntimeContract: params.capabilities?.executionRuntime.kind === 'agent_api'
        ? {
            invocationLayer: 'api_runtime',
            phase: 'execution_run',
            provider: params.capabilities.model.provider,
            runId,
            runtimeMode: 'api',
            taskId: params.task.id,
          }
        : null,
      simplicityCheck: {
        smallestMovement: 'run_start',
        status: 'ready',
        taskId: params.task.id,
      },
      subtaskStart: {
        status: 'ready',
        taskId: params.task.id,
      },
      runtimeAction: {
        action: params.runtimeAction.action,
        allowed: params.runtimeAction.allowed,
        requestSurface: params.input.requestSurface ?? 'ipc_run_trigger',
        runId,
        status: params.runtimeAction.allowed ? 'ready' : 'blocked',
        surface: params.runtimeAction.surface,
        taskId: params.task.id,
      },
      taskMemoryCoverage: {
        status: params.taskMemoryCoverage.canStartExecution ? 'ready' : 'blocked',
        taskId: params.task.id,
      },
      targetTaskId: params.task.id,
      taskMemoryGuidance: {
        guidanceCount: params.taskMemoryGuidance.targets.length,
        status: taskMemoryGuidanceReady ? 'ready' : 'missing',
        taskId: params.task.id,
      },
      writeIntentExtraction: supportedWriteActions.length || declaredWriteActions.length
        ? {
            declaredActions: declaredWriteActions,
            runId,
            status: 'ready',
            supportedActions: supportedWriteActions,
            taskId: params.task.id,
          }
        : noStructuredWriteIntentRequired
          ? {
              declaredActions: declaredWriteActions,
              noWriteIntentRequired: true,
              runId,
              status: 'ready',
              supportedActions: [],
              taskId: params.task.id,
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
      input: formatAgentApiExecutionPromotionReadinessInput({
        capabilitySummary: params.capabilities?.summary ?? null,
        pilotDecision: params.input.pilotDecision ?? null,
      }),
      output: readiness.summary,
    });
  }

  private async readReviewedPatchApplyBoundaryEvidence(runId: string | null): Promise<SandboxPatchPromotionRecord | null> {
    if (!runId || !this.sandboxPatchPromotionRepository) return null;
    try {
      const promotions = await this.sandboxPatchPromotionRepository.listForRun(runId);
      return promotions.find((promotion) => promotion.status === 'applied')
        ?? promotions.find((promotion) => promotion.status === 'blocked')
        ?? promotions.find((promotion) => promotion.status === 'pending')
        ?? null;
    } catch {
      return null;
    }
  }

  private async readTaskDetailForPromotionEvidence(taskId: string): Promise<TaskDetail | null> {
    try {
      return await this.taskService.getDetail(taskId);
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

function deriveWriteIntentActionEvidence(params: {
  output: string | null;
  runId: string;
  task: TaskDetail;
}): { declaredActions: string[]; supportedActions: string[] } {
  if (!params.output?.trim()) return { declaredActions: [], supportedActions: [] };
  const declaredActions = extractTaskplaneWriteIntentTypeNamesFromText(params.output);
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
  return { declaredActions, supportedActions: actions };
}
