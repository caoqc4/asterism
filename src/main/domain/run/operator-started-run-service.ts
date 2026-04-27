import type {
  OperatorStartedRunRequest,
} from '../../../shared/types/operator-started-run.js';
import { buildOperatorStartedOrchestrationRequest } from '../../../shared/agent-orchestration.js';
import { validateOperatorStartedRunRequest } from '../../../shared/types/operator-started-run.js';
import type {
  BrowserEvidenceRequest,
  BrowserEvidenceResult,
} from '../../../shared/types/browser-evidence.js';
import type {
  BrowserControlledInteractionRequest,
  BrowserControlledInteractionResult,
} from '../../../shared/types/browser-controlled-interaction.js';
import type {
  CreateRunInput,
  RunRecord,
} from '../../../shared/types/run.js';
import type { RunRepository } from '../../db/repositories/run-repository.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { TaskService } from '../task/task-service.js';
import type { BrowserEvidencePersister } from './browser-evidence-persister.js';
import { runBrowserControlledInteractionDryRun } from './browser-controlled-interaction-dry-runner.js';

export type OperatorStartedBrowserEvidenceSmokeExecution = {
  browserRequest: BrowserEvidenceRequest;
  result: BrowserEvidenceResult;
};

export type OperatorStartedBrowserEvidenceSmokeExecutor = (params: {
  request: OperatorStartedRunRequest;
  run: RunRecord;
}) => Promise<OperatorStartedBrowserEvidenceSmokeExecution>;

export type OperatorStartedBrowserControlledLocalQaExecution = {
  requests: BrowserControlledInteractionRequest[];
  result: BrowserControlledInteractionResult;
};

export type OperatorStartedBrowserControlledLocalQaExecutor = (params: {
  request: OperatorStartedRunRequest;
  run: RunRecord;
}) => Promise<OperatorStartedBrowserControlledLocalQaExecution>;

export class OperatorStartedRunService {
  constructor(
    private readonly runRepository: Pick<RunRepository, 'create' | 'updateResult'>,
    private readonly taskService: Pick<
      TaskService,
      'annotateRunCompleted' | 'annotateRunFailed' | 'getDetail'
    >,
    private readonly runStepRepository: Pick<RunStepRepository, 'create'>,
    private readonly browserEvidencePersister: Pick<BrowserEvidencePersister, 'persistCaptured'>,
    private readonly browserEvidenceSmokeExecutor: OperatorStartedBrowserEvidenceSmokeExecutor,
    private readonly browserControlledLocalQaExecutor: OperatorStartedBrowserControlledLocalQaExecutor,
  ) {}

  async trigger(input: unknown): Promise<RunRecord> {
    const validation = validateOperatorStartedRunRequest(input);
    if (!validation.valid) {
      throw new Error(validation.summary);
    }

    const request = validation.request;
    const orchestrationValidation = buildOperatorStartedOrchestrationRequest(request);
    if (!orchestrationValidation.valid) {
      throw new Error(orchestrationValidation.summary);
    }

    if (request.kind !== 'browser_evidence_smoke' && request.kind !== 'browser_controlled_local_qa') {
      throw new Error(`Operator-started run kind is not implemented: ${request.kind}.`);
    }

    const task = await this.taskService.getDetail(request.taskId);
    if (!task) {
      throw new Error(`Task not found: ${request.taskId}`);
    }

    const runInput: CreateRunInput = {
      taskId: request.taskId,
      type: 'agent',
      instructions: `Operator-started ${request.kind}: ${request.reason}`,
    };
    const run = await this.runRepository.create(runInput);

    await this.runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      status: 'completed',
      title: 'operator-started run accepted',
      input: validation.summary,
      output: `descriptor=${request.descriptorId} / ${orchestrationValidation.summary}`,
    });

    if (request.kind === 'browser_controlled_local_qa') {
      return this.runBrowserControlledLocalQa({
        request,
        run,
      });
    }

    const execution = await this.browserEvidenceSmokeExecutor({ request, run });

    if (execution.result.status === 'captured') {
      await this.browserEvidencePersister.persistCaptured({
        request: execution.browserRequest,
        result: execution.result,
        runId: run.id,
        taskId: request.taskId,
      });
      const completed = await this.runRepository.updateResult(
        run.id,
        'completed',
        execution.result.summary,
        'system',
      );
      await this.taskService.annotateRunCompleted(request.taskId, 'agent', true, completed.id);
      return completed;
    }

    const failureSummary = execution.result.status === 'blocked'
      ? execution.result.summary
      : `${execution.result.summary}: ${execution.result.failureReason}`;

    await this.runStepRepository.create({
      runId: run.id,
      kind: 'tool_result',
      status: 'failed',
      title: execution.result.status === 'blocked'
        ? 'browser evidence blocked'
        : 'browser evidence failed',
      input: execution.browserRequest.url,
      output: execution.result.summary,
      error: failureSummary,
    });
    const failed = await this.runRepository.updateResult(
      run.id,
      'failed',
      failureSummary,
      'system',
      failureSummary,
    );
    await this.taskService.annotateRunFailed(request.taskId, failureSummary, failed.id);
    return failed;
  }

  private async runBrowserControlledLocalQa(params: {
    request: OperatorStartedRunRequest;
    run: RunRecord;
  }): Promise<RunRecord> {
    const execution = await this.browserControlledLocalQaExecutor(params);
    await runBrowserControlledInteractionDryRun({
      requests: execution.requests,
      runId: params.run.id,
      runStepRepository: this.runStepRepository,
    });

    if (execution.result.status === 'completed') {
      const completed = await this.runRepository.updateResult(
        params.run.id,
        'completed',
        execution.result.summary,
        'system',
      );
      await this.taskService.annotateRunCompleted(params.request.taskId, 'agent', true, completed.id);
      return completed;
    }

    const failureSummary = execution.result.summary;

    await this.runStepRepository.create({
      runId: params.run.id,
      kind: 'tool_result',
      status: 'failed',
      title: 'browser controlled local QA blocked',
      input: execution.requests.map((request) => request.action.action).join(','),
      output: execution.result.summary,
      error: failureSummary,
    });
    const failed = await this.runRepository.updateResult(
      params.run.id,
      'failed',
      failureSummary,
      'system',
      failureSummary,
    );
    await this.taskService.annotateRunFailed(params.request.taskId, failureSummary, failed.id);
    return failed;
  }
}
