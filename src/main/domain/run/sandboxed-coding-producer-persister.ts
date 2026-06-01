import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type { RunStepRecord, RunStepStatus } from '../../../shared/types/run.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { AgentSessionStore } from './agent-session-store.js';
import type {
  PreviewSandboxedCodingInjectedProducerRunResult,
  SandboxedCodingProducerRunStepDraft,
} from './sandboxed-coding-producer.js';

export type PersistSandboxedCodingProducerPreviewResult = {
  session: AgentSessionRecord;
  steps: RunStepRecord[];
};

export class SandboxedCodingProducerPreviewPersister {
  constructor(
    private readonly agentSessionStore: Pick<AgentSessionStore, 'create' | 'updateStatus'>,
    private readonly runStepRepository: Pick<RunStepRepository, 'create'>,
  ) {}

  async persist(params: {
    result: PreviewSandboxedCodingInjectedProducerRunResult;
    runId: string;
  }): Promise<PersistSandboxedCodingProducerPreviewResult> {
    const session = await this.agentSessionStore.create({
      runId: params.runId,
      mode: 'agent',
      capabilities: {
        fileContext: true,
        longRunningSessions: true,
        streaming: false,
        structuredToolCalls: false,
        taskMutationTools: false,
        textOnlyPlanning: false,
      },
      metadata: params.result.sessionMetadata ?? params.result.sessionSummary,
    });

    const steps: RunStepRecord[] = [];
    for (const step of params.result.steps) {
      steps.push(await this.persistStep(step));
    }

    const updatedSession = await this.agentSessionStore.updateStatus(
      session.id,
      mapProducerPreviewStatusToAgentSessionStatus(params.result.status),
    );

    return {
      session: updatedSession,
      steps,
    };
  }

  private async persistStep(step: SandboxedCodingProducerRunStepDraft): Promise<RunStepRecord> {
    return this.runStepRepository.create({
      error: step.error,
      input: step.input,
      kind: step.kind,
      output: step.output,
      runId: step.runId,
      status: step.status,
      title: step.title,
    });
  }
}

function mapProducerPreviewStatusToAgentSessionStatus(
  status: PreviewSandboxedCodingInjectedProducerRunResult['status'],
): AgentSessionRecord['status'] {
  switch (status) {
    case 'preview_ready':
      return 'completed';
    case 'paused':
      return 'paused';
    case 'blocked':
    case 'failed':
      return 'failed';
  }
}

export function summarizeSandboxedCodingProducerPreviewPersistence(params: {
  result: PreviewSandboxedCodingInjectedProducerRunResult;
  stepCount: number;
}): string {
  return [
    `producer=${params.result.status}`,
    `session=${mapProducerPreviewStatusToAgentSessionStatus(params.result.status)}`,
    `steps=${params.stepCount}`,
  ].join(' / ');
}
